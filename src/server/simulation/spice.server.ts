import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { createId } from "../../lib/ids"
import {
  generateSpiceNetlist,
  type SpiceElementBinding,
} from "../../lib/simulation/spice-netlist"
import {
  parseNgspiceAsciiRawOutput,
  parseNgspicePrintOutput,
} from "../../lib/simulation/ngspice-output"
import {
  runtimeLimitsFromEnv,
  validateSpiceRuntimeLimits,
} from "../../lib/simulation/spice-runtime-limits"
import { runSpiceSimulation } from "../../lib/simulation/spice-solver"
import type { CircuitProject } from "../../lib/schematic/types"
import type { SimulationResult, WaveformTrace } from "../../lib/simulation/types"

const execFileAsync = promisify(execFile)

export type SpiceEnginePreference = "auto" | "ngspice" | "spicey"

export async function runServerSpiceSimulation({
  project,
  engine,
}: {
  project: CircuitProject
  engine: SpiceEnginePreference
}): Promise<SimulationResult> {
  if (engine === "spicey") {
    return runSpiceSimulation(project)
  }

  const preflightBuild = generateSpiceNetlist(project)
  const preflightLimits = runtimeLimitsFromEnv(process.env)
  const preflightReport = validateSpiceRuntimeLimits({
    project,
    build: preflightBuild,
    limits: preflightLimits,
  })
  if (!preflightReport.ok) {
    return runtimeLimitFailureResult({
      build: preflightBuild,
      warnings: preflightReport.warnings,
      errors: preflightReport.errors,
      estimatedPoints: preflightReport.estimatedPoints,
    })
  }

  const ngspicePath = await findNgspiceBinary()
  if (ngspicePath) {
    return runNgspiceCli(project, ngspicePath, {
      build: preflightBuild,
      limitReport: preflightReport,
      limits: preflightLimits,
    })
  }

  const fallback = runSpiceSimulation(project)
  return {
    ...fallback,
    status: fallback.status === "failed" ? "failed" : "partial",
    notes: [
      engine === "ngspice"
        ? "ngspice was requested, but no ngspice executable was found on the server. Falling back to spicey."
        : "No ngspice executable was found on the server. Falling back to spicey.",
      ...fallback.notes,
    ],
    diagnostics: {
      warnings: [
        engine === "ngspice"
          ? "ngspice executable unavailable; used spicey fallback."
          : "ngspice executable unavailable; used spicey fallback.",
        ...(fallback.diagnostics?.warnings ?? []),
      ],
      errors: fallback.diagnostics?.errors ?? [],
      suggestions: fallback.diagnostics?.suggestions ?? [],
      unsupportedComponents: fallback.diagnostics?.unsupportedComponents ?? [],
      floatingPins: fallback.diagnostics?.floatingPins ?? [],
      ...(fallback.diagnostics?.rawOutput
        ? { rawOutput: fallback.diagnostics.rawOutput }
        : {}),
    },
  }
}

async function runNgspiceCli(
  project: CircuitProject,
  ngspicePath: string,
  preflight?: {
    build: ReturnType<typeof generateSpiceNetlist>
    limitReport: ReturnType<typeof validateSpiceRuntimeLimits>
    limits: ReturnType<typeof runtimeLimitsFromEnv>
  },
): Promise<SimulationResult> {
  const build = preflight?.build ?? generateSpiceNetlist(project)
  const limits = preflight?.limits ?? runtimeLimitsFromEnv(process.env)
  const limitReport =
    preflight?.limitReport ?? validateSpiceRuntimeLimits({ project, build, limits })
  if (!limitReport.ok) {
    return runtimeLimitFailureResult({
      build,
      warnings: limitReport.warnings,
      errors: limitReport.errors,
      estimatedPoints: limitReport.estimatedPoints,
    })
  }
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
    const rawFileOutput = await readOptionalFile(rawPath)
    const logOutput = await readOptionalFile(logPath)
    const combinedOutput = [stdout, stderr, logOutput, rawFileOutput]
      .filter((part) => part.trim().length > 0)
      .join("\n")
      .trim()
    const parsedRaw =
      rawFileOutput.trim().length > 0
        ? parseNgspiceAsciiRawOutput(rawFileOutput, build.traceBindings)
        : { traces: [], warnings: [], errors: [] }
    const parsed =
      parsedRaw.traces.length > 0
        ? parsedRaw
        : parseNgspicePrintOutput(combinedOutput)
    const classified = classifyNgspiceDiagnostics(combinedOutput)
    const errors = [...build.diagnostics.errors, ...parsed.errors, ...classified.errors]
    const warnings = [
      ...limitReport.warnings,
      ...build.diagnostics.warnings,
      ...parsed.warnings,
      ...classified.warnings,
    ]
    const traces = derivePowerTraces(parsed.traces, build.elements)
    return {
      id: createId("sim"),
      createdAt: new Date().toISOString(),
      kind: "spice",
      engine: "ngspice",
      status: errors.length > 0 ? "failed" : warnings.length > 0 ? "partial" : "success",
      netlist: build.netlist,
      traces,
      notes: [
        "Ran transient SPICE through the server ngspice CLI.",
        `Runtime limits: ${limits.timeoutMs}ms timeout, ${limits.maxOutputBytes} byte output cap, estimated ${limitReport.estimatedPoints} points.`,
        ...build.notes,
        ...(traces.length === 0 ? ["ngspice produced no parsed transient traces."] : []),
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
    const message = error instanceof Error ? error.message : String(error)
    const output = errorOutput(error)
    const classified = classifyNgspiceDiagnostics(`${message}\n${output}`)
    return {
      id: createId("sim"),
      createdAt: new Date().toISOString(),
      kind: "spice",
      engine: "ngspice",
      status: "failed",
      netlist: build.netlist,
      traces: [],
      notes: [
        `ngspice simulation failed: ${message}`,
        "Install ngspice on the server or select the spicey fallback engine.",
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

function runtimeLimitFailureResult({
  build,
  warnings,
  errors,
  estimatedPoints,
}: {
  build: ReturnType<typeof generateSpiceNetlist>
  warnings: string[]
  errors: string[]
  estimatedPoints: number
}): SimulationResult {
  return {
    id: createId("sim"),
    createdAt: new Date().toISOString(),
    kind: "spice",
    engine: "ngspice",
    status: "failed",
    netlist: build.netlist,
    traces: [],
    notes: [
      "Simulation was blocked by server runtime limits before invoking ngspice.",
      `Estimated transient points: ${estimatedPoints}.`,
      ...build.notes,
    ],
    diagnostics: {
      warnings: [...warnings, ...build.diagnostics.warnings],
      errors: [...errors, ...build.diagnostics.errors],
      suggestions: [
        "Reduce transient duration, increase time step, or simplify the schematic before running full SPICE.",
      ],
      unsupportedComponents: build.diagnostics.unsupportedComponents,
      floatingPins: build.diagnostics.floatingPins,
    },
  }
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
    } catch {
      // Continue searching.
    }
  }
  return null
}

async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch {
    return ""
  }
}

function errorOutput(error: unknown): string {
  if (!error || typeof error !== "object") {
    return ""
  }
  const candidate = error as { stdout?: unknown; stderr?: unknown }
  return [candidate.stdout, candidate.stderr]
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

function derivePowerTraces(
  traces: WaveformTrace[],
  elements: SpiceElementBinding[],
): WaveformTrace[] {
  const voltageByTarget = new Map(
    traces
      .filter((trace) => trace.metric === "voltage")
      .map((trace) => [trace.targetId ?? trace.name, trace]),
  )
  const currentByTarget = new Map(
    traces
      .filter((trace) => trace.metric === "current")
      .map((trace) => [trace.targetId ?? trace.name, trace]),
  )
  const powerTraces = elements.flatMap((element) => {
    const current = currentByTarget.get(element.objectId)
    if (!current) {
      return []
    }
    const v1 = nodeVoltageTrace(element.n1, voltageByTarget)
    const v2 = nodeVoltageTrace(element.n2, voltageByTarget)
    if (!v1 || !v2) {
      return []
    }
    const pointCount = Math.min(current.points.length, v1.points.length, v2.points.length)
    const points = Array.from({ length: pointCount }, (_, index) => ({
      t: current.points[index]?.t ?? 0,
      v:
        ((v1.points[index]?.v ?? 0) - (v2.points[index]?.v ?? 0)) *
        (current.points[index]?.v ?? 0),
    }))
    return [
      {
        id: `ngspice_power_${element.objectId}`,
        name: `${element.refdes} power`,
        metric: "power" as const,
        unit: "W",
        targetId: element.objectId,
        targetName: element.refdes,
        points,
      },
    ]
  })
  return [...traces, ...powerTraces]
}

function nodeVoltageTrace(
  nodeName: string,
  voltageByTarget: Map<string, WaveformTrace>,
): WaveformTrace | null {
  return nodeName === "0"
    ? groundTrace(voltageByTarget)
    : voltageByTarget.get(nodeName) ?? null
}

function groundTrace(voltageByTarget: Map<string, WaveformTrace>): WaveformTrace | null {
  const reference = voltageByTarget.values().next().value
  if (!reference) {
    return null
  }
  return {
    id: "ngspice_ground",
    name: "V(0)",
    metric: "voltage",
    unit: "V",
    targetId: "0",
    targetName: "V(0)",
    points: reference.points.map((point) => ({ t: point.t, v: 0 })),
  }
}
