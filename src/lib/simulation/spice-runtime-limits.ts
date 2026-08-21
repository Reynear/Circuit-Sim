import type { CircuitProject } from "../schematic/types"
import type { SpiceNetlistBuild } from "./spice-netlist"

export type SpiceRuntimeLimits = {
  maxObjects: number
  maxNets: number
  maxDurationMs: number
  minTimeStepMs: number
  maxEstimatedPoints: number
  maxNetlistBytes: number
  timeoutMs: number
  maxOutputBytes: number
}

export const defaultSpiceRuntimeLimits: SpiceRuntimeLimits = {
  maxObjects: 300,
  maxNets: 250,
  maxDurationMs: 60_000,
  minTimeStepMs: 0.001,
  maxEstimatedPoints: 50_000,
  maxNetlistBytes: 250_000,
  timeoutMs: 15_000,
  maxOutputBytes: 4 * 1024 * 1024,
}

export type SpiceRuntimeLimitReport = {
  ok: boolean
  errors: string[]
  warnings: string[]
  estimatedPoints: number
}

export function runtimeLimitsFromEnv(
  env: Record<string, string | undefined>,
): SpiceRuntimeLimits {
  return {
    maxObjects: numberFromEnv(env.SPICE_MAX_OBJECTS, defaultSpiceRuntimeLimits.maxObjects),
    maxNets: numberFromEnv(env.SPICE_MAX_NETS, defaultSpiceRuntimeLimits.maxNets),
    maxDurationMs: numberFromEnv(
      env.SPICE_MAX_DURATION_MS,
      defaultSpiceRuntimeLimits.maxDurationMs,
    ),
    minTimeStepMs: numberFromEnv(
      env.SPICE_MIN_TIME_STEP_MS,
      defaultSpiceRuntimeLimits.minTimeStepMs,
    ),
    maxEstimatedPoints: numberFromEnv(
      env.SPICE_MAX_ESTIMATED_POINTS,
      defaultSpiceRuntimeLimits.maxEstimatedPoints,
    ),
    maxNetlistBytes: numberFromEnv(
      env.SPICE_MAX_NETLIST_BYTES,
      defaultSpiceRuntimeLimits.maxNetlistBytes,
    ),
    timeoutMs: numberFromEnv(env.NGSPICE_TIMEOUT_MS, defaultSpiceRuntimeLimits.timeoutMs),
    maxOutputBytes: numberFromEnv(
      env.NGSPICE_MAX_OUTPUT_BYTES,
      defaultSpiceRuntimeLimits.maxOutputBytes,
    ),
  }
}

export function validateSpiceRuntimeLimits({
  project,
  build,
  limits = defaultSpiceRuntimeLimits,
}: {
  project: CircuitProject
  build: SpiceNetlistBuild
  limits?: SpiceRuntimeLimits
}): SpiceRuntimeLimitReport {
  const errors: string[] = []
  const warnings: string[] = []
  const objectCount = project.sheets.reduce(
    (sum, sheet) => sum + sheet.objects.length,
    0,
  )
  const simulation = project.simulations[0]
  const durationMs = simulation?.durationMs ?? 10
  const timeStepMs = simulation?.timeStepMs ?? 0.1
  const estimatedPoints =
    timeStepMs > 0 ? Math.ceil(durationMs / timeStepMs) + 1 : Number.POSITIVE_INFINITY
  const netlistBytes = new TextEncoder().encode(build.netlist).length

  if (objectCount > limits.maxObjects) {
    errors.push(
      `Circuit has ${objectCount} objects; server SPICE limit is ${limits.maxObjects}.`,
    )
  }
  if (Object.keys(build.nodeNameByNetId).length > limits.maxNets) {
    errors.push(
      `Circuit has ${Object.keys(build.nodeNameByNetId).length} nets; server SPICE limit is ${limits.maxNets}.`,
    )
  }
  if (durationMs > limits.maxDurationMs) {
    errors.push(
      `Transient duration ${durationMs}ms exceeds server SPICE limit ${limits.maxDurationMs}ms.`,
    )
  }
  if (timeStepMs < limits.minTimeStepMs) {
    errors.push(
      `Transient time step ${timeStepMs}ms is below server SPICE minimum ${limits.minTimeStepMs}ms.`,
    )
  }
  if (estimatedPoints > limits.maxEstimatedPoints) {
    errors.push(
      `Estimated ${estimatedPoints} transient points exceeds server SPICE limit ${limits.maxEstimatedPoints}.`,
    )
  }
  if (netlistBytes > limits.maxNetlistBytes) {
    errors.push(
      `SPICE netlist is ${netlistBytes} bytes; server limit is ${limits.maxNetlistBytes} bytes.`,
    )
  }
  if (estimatedPoints > limits.maxEstimatedPoints * 0.5) {
    warnings.push(
      `This run may be slow: estimated ${estimatedPoints} transient points.`,
    )
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    estimatedPoints,
  }
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
