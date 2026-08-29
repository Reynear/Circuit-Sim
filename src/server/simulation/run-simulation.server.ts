import {
  buildElectricalCircuit,
  circuitHashOf,
} from "@circuit-sim/core/circuit/electrical-circuit"
import type { CircuitProject } from "@circuit-sim/core/circuit/project"
import type {
  SimulationOutput,
  SpiceEnginePreference,
} from "@circuit-sim/core/simulation/result"
import {
  generateSpiceNetlist,
  type SpiceNetlistBuild,
} from "@circuit-sim/core/simulation/spice-netlist"
import { runNgspiceSimulation } from "./engines/ngspice.server"
import { runSpiceSimulation } from "./engines/spicey"
import {
  runtimeLimitsFromEnv,
  validateSpiceRuntimeLimits,
} from "./runtime-limits"

export async function runServerSpiceSimulation({
  project,
  engine,
}: {
  project: CircuitProject
  engine: SpiceEnginePreference
}): Promise<SimulationOutput> {
  const circuit = buildElectricalCircuit(project)
  const circuitHash = circuitHashOf(circuit)
  const build = generateSpiceNetlist({
    circuit,
    analysis: project.analysis,
    title: project.name,
  })
  const limits = runtimeLimitsFromEnv(process.env)
  const report = validateSpiceRuntimeLimits({ project, build, limits })

  if (!report.ok) {
    return runtimeLimitFailureResult({
      build,
      circuitHash,
      engine,
      warnings: report.warnings,
      errors: report.errors,
      estimatedPoints: report.estimatedPoints,
    })
  }

  if (engine === "spicey") {
    return runSpiceSimulation(project)
  }

  return runNgspiceSimulation({
    build,
    circuitHash,
    warnings: report.warnings,
    estimatedPoints: report.estimatedPoints,
    limits,
  })
}

function runtimeLimitFailureResult({
  build,
  circuitHash,
  engine,
  warnings,
  errors,
  estimatedPoints,
}: {
  build: SpiceNetlistBuild
  circuitHash: string
  engine: SpiceEnginePreference
  warnings: string[]
  errors: string[]
  estimatedPoints: number
}): SimulationOutput {
  return {
    engine,
    circuitHash,
    netlist: build.netlist,
    signals: [],
    notes: [
      "Simulation was blocked by server runtime limits before invoking the engine.",
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
