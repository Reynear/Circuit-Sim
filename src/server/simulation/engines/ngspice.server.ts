import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import {
  generateSpiceNetlist,
  type SpiceElementBinding,
} from "@circuit-sim/core/simulation/spice-netlist"
import {
  parseNgspiceAsciiRawOutput,
  parseNgspicePrintOutput,
} from "./ngspice-output"
import type { SpiceRuntimeLimits } from "../runtime-limits"
import type { SimulationOutput } from "@circuit-sim/core/simulation/result"
import {
  buildTranSignals,
  InvalidSignalSeries,
  type SignalElement,
  type Signals,
} from "@circuit-sim/core/simulation/signals"
import type { ParsedSignalSeries } from "./ngspice-output"

const execFileAsync = promisify(execFile)

export async function runNgspiceSimulation({
  build,
  circuitHash,
  warnings,
  estimatedPoints,
  limits,
}: {
  build: ReturnType<typeof generateSpiceNetlist>
  circuitHash: string
  warnings: string[]
  estimatedPoints: number
  limits: SpiceRuntimeLimits
}): Promise<SimulationOutput> {
  const ngspicePath = await findNgspiceBinary()
  if (!ngspicePath) {
    return unavailableNgspiceResult(build, circuitHash, warnings)
  }

  return runNgspiceCli(ngspicePath, {
    build,
    circuitHash,
    warnings,
    estimatedPoints,
    limits,
  })
}

function unavailableNgspiceResult(
  build: ReturnType<typeof generateSpiceNetlist>,
  circuitHash: string,
  warnings: string[],
): SimulationOutput {
  return {
    engine: "ngspice",
    circuitHash,
    netlist: build.netlist,
    signals: [],
    notes: [
      "ngspice was explicitly requested, but no executable was found on the server.",
      ...build.notes,
    ],
    diagnostics: {
      warnings: [...warnings, ...build.diagnostics.warnings],
      errors: [
        "ngspice executable unavailable; the requested engine was not substituted.",
        ...build.diagnostics.errors,
      ],
      suggestions: [
        "Install ngspice or select the spicey engine explicitly.",
        ...build.diagnostics.suggestions,
      ],
      unsupportedComponents: build.diagnostics.unsupportedComponents,
      floatingPins: build.diagnostics.floatingPins,
    },
  }
}

async function runNgspiceCli(
  ngspicePath: string,
  preflight: {
    build: ReturnType<typeof generateSpiceNetlist>
    circuitHash: string
    warnings: string[]
    estimatedPoints: number
    limits: SpiceRuntimeLimits
  },
): Promise<SimulationOutput> {
  const { build, circuitHash, estimatedPoints, limits, warnings: limitWarnings } = preflight
  const dir = await mkdtemp(join(tmpdir(), "circuit-sim-ngspice-"))
  const netlistPath = join(dir, "circuit.cir")
  const rawPath = join(dir, "result.raw")
  const logPath = join(dir, "ngspice.log")
  try {
    await writeFile(netlistPath, build.netlist, "utf8")
    const { stdout, stderr } = await execFileAsync(ngspicePath, [
      "-b",
      "-r",
      rawPath,
      "-o",
      logPath,
      netlistPath,
    ], {
      timeout: limits.timeoutMs,
      maxBuffer: limits.maxOutputBytes,
    })
    const rawFileOutput = await readOptionalFile(rawPath, limits.maxOutputBytes)
    const logOutput = await readOptionalFile(logPath, limits.maxOutputBytes)
    const combinedOutput = [stdout, stderr, logOutput, rawFileOutput]
      .filter((part) => part.trim().length > 0)
      .join("\n")
      .trim()
    const parsedRaw =
      rawFileOutput.trim().length > 0
        ? parseNgspiceAsciiRawOutput(rawFileOutput)
        : { series: [], warnings: [], errors: [] }
    const parsed =
      parsedRaw.series.length > 0
        ? parsedRaw
        : parseNgspicePrintOutput(combinedOutput)
    const classified = classifyNgspiceDiagnostics(combinedOutput)
    const errors = [
      ...build.diagnostics.errors,
      ...parsed.errors,
      ...classified.errors,
      ...(parsed.series.length === 0
        ? ["ngspice produced no parsed transient signals."]
        : []),
    ]
    const warnings = [
      ...limitWarnings,
      ...build.diagnostics.warnings,
      ...parsed.warnings,
      ...classified.warnings,
    ]
    const signals = buildNgspiceSignals(parsed.series, build)
    return {
      engine: "ngspice",
      circuitHash,
      netlist: build.netlist,
      signals,
      notes: [
        "Ran transient SPICE through the server ngspice CLI.",
        `Runtime limits: ${limits.timeoutMs}ms timeout, ${limits.maxOutputBytes} byte output cap, estimated ${estimatedPoints} points.`,
        ...build.notes,
        ...(signals.length === 0
          ? ["ngspice produced no parsed transient signals."]
          : []),
      ],
      diagnostics: {
        warnings,
        errors,
        suggestions: classified.suggestions,
        unsupportedComponents: build.diagnostics.unsupportedComponents,
        floatingPins: build.diagnostics.floatingPins,
        rawOutput: combinedOutput,
      },
    }
  } catch (error) {
    const message = simulationErrorMessage(error)
    const output = errorOutput(error)
    const classified = classifyNgspiceDiagnostics(`${message}\n${output}`)
    return {
      engine: "ngspice",
      circuitHash,
      netlist: build.netlist,
      signals: [],
      notes: [
        `ngspice simulation failed: ${message}`,
        "Install ngspice on the server or select the spicey engine.",
        ...build.notes,
      ],
      diagnostics: {
        ...build.diagnostics,
        warnings: [...build.diagnostics.warnings, ...classified.warnings],
        errors: [
          `ngspice simulation failed: ${message}`,
          ...classified.errors,
          ...build.diagnostics.errors,
        ],
        suggestions: classified.suggestions,
        ...(output ? { rawOutput: output } : {}),
      },
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function simulationErrorMessage(error: unknown): string {
  if (error instanceof InvalidSignalSeries) {
    return `${error.series} ${error.reason}`
  }
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

async function findNgspiceBinary(): Promise<string | null> {
  const candidates = [
    process.env.NGSPICE_BIN,
    "/opt/homebrew/bin/ngspice",
    "/usr/local/bin/ngspice",
    "/usr/bin/ngspice",
  ].filter((candidate): candidate is string => Boolean(candidate))
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch (error) {
      if (isMissingFileError(error)) {
        continue
      }
      throw error
    }
  }
  return null
}

async function readOptionalFile(path: string, maxBytes: number): Promise<string> {
  try {
    const file = await stat(path)
    if (file.size > maxBytes) {
      throw new Error(`Simulator output exceeded the ${maxBytes} byte limit.`)
    }
    return await readFile(path, "utf8")
  } catch (error) {
    if (isMissingFileError(error)) {
      return ""
    }
    throw error
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  )
}

function errorOutput(error: unknown): string {
  if (!error || typeof error !== "object") {
    return ""
  }
  const stdout = "stdout" in error ? error.stdout : undefined
  const stderr = "stderr" in error ? error.stderr : undefined
  return [stdout, stderr]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
}

function classifyNgspiceDiagnostics(output: string): {
  warnings: string[]
  errors: string[]
  suggestions: string[]
} {
  const warnings: string[] = []
  const errors: string[] = []
  const suggestions: string[] = []
  if (/singular matrix/i.test(output)) {
    errors.push("ngspice reported a singular matrix.")
    suggestions.push("Check for floating nodes, missing ground, or ideal source loops.")
  }
  if (/timestep too small/i.test(output)) {
    errors.push("ngspice could not find a stable transient time step.")
    suggestions.push("Increase time step, shorten ideal discontinuities, or add series resistance.")
  }
  if (/convergence/i.test(output)) {
    warnings.push("ngspice reported convergence trouble.")
    suggestions.push("Add realistic source resistance or initial conditions for difficult transient circuits.")
  }
  if (/no such vector|not available/i.test(output)) {
    warnings.push("One or more requested probe vectors were not available in ngspice output.")
    suggestions.push("Use voltage probes on nets and current probes on supported two-terminal components.")
  }
  return {
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
    suggestions: [...new Set(suggestions)],
  }
}

/**
 * Maps parsed ngspice series (keyed by normalized expression) into canonical
 * signals through the shared builder, so both engines produce identical
 * conventions.
 */
export function buildNgspiceSignals(
  series: ReadonlyArray<ParsedSignalSeries>,
  build: ReturnType<typeof generateSpiceNetlist>,
): Signals {
  const canonicalNodeName = new Map(
    [...build.nodeNameByNetName.values()].map((name) => [
      name.toLowerCase(),
      name,
    ]),
  )
  const nodeVoltages: Array<{
    nodeName: string
    values: ReadonlyArray<number>
  }> = []
  const times: Array<number> = []
  for (const entry of series) {
    const voltageMatch = /^v\(([^)]+)\)$/.exec(entry.expression)
    if (voltageMatch) {
      nodeVoltages.push({
        nodeName:
          canonicalNodeName.get(voltageMatch[1]!.toLowerCase()) ??
          voltageMatch[1]!,
        values: entry.points.map((point) => point.v),
      })
      if (times.length === 0) {
        times.push(...entry.points.map((point) => point.t))
      }
    }
  }

  if (times.length === 0) {
    return []
  }

  const elementCurrents = build.elements.flatMap((element) => {
    const elementCurrentExpressions = new Set(
      element.terminals.flatMap((terminal) =>
        terminal.currentExpression
          ? [normalizeExpression(terminal.currentExpression)]
          : [],
      ),
    )
    const terminalCurrents = element.terminals.flatMap((terminal) => {
      if (terminal.constantCurrent !== undefined) {
        const value = terminal.negate
          ? -terminal.constantCurrent
          : terminal.constantCurrent
        return [{ label: terminal.label, current: times.map(() => value) }]
      }
      if (!terminal.currentExpression) return []
      const expression = normalizeExpression(terminal.currentExpression)
      const alias = normalizeExpression(`I(${element.spiceName})`)
      const entry = series.find(
        (candidate) =>
          candidate.expression === expression ||
          candidate.expression === `i(${expression})` ||
          (elementCurrentExpressions.size === 1 && candidate.expression === alias),
      )
      return entry
        ? [{
            label: terminal.label,
            current: entry.points.map((point) =>
              terminal.negate ? -point.v : point.v,
            ),
          }]
        : []
    })
    const signalElement: SignalElement = {
      refdes: element.refdes,
      terminals: element.terminals.map((terminal) => ({
        label: terminal.label,
        node: terminal.node,
      })),
    }
    return terminalCurrents.length > 0
      ? [{ element: signalElement, terminalCurrents }]
      : []
  })

  return buildTranSignals({
    times,
    nodeVoltages,
    nodeNetNames: build.netNameByNodeName,
    elementCurrents,
  })
}

function normalizeExpression(expression: string): string {
  return expression.replace(/\s+/g, "").toLowerCase()
}
