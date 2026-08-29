import { createRcLowPassExample } from "@/examples/circuit-projects"
import { generateSpiceNetlist } from "@circuit-sim/core/simulation/spice-netlist"
import { buildElectricalCircuit } from "@circuit-sim/core/circuit/electrical-circuit"
import type { CircuitProject } from "@circuit-sim/core/circuit/project"
import { validateSpiceRuntimeLimits } from "@/server/simulation/runtime-limits"

describe("SPICE runtime limits", () => {
  it("allows the demo RC project under default limits", () => {
    const project = createRcLowPassExample()
    const report = validateSpiceRuntimeLimits({
      project,
      build: netlistFor(project),
    })

    expect(report.ok).toBe(true)
    expect(report.errors).toEqual([])
  })

  it("blocks overly dense transient runs before ngspice execution", () => {
    const baseProject = createRcLowPassExample()
    const project = {
      ...baseProject,
      analysis: {
        ...baseProject.analysis,
        durationMs: 1000,
        timeStepMs: 0.001,
      },
    }
    const report = validateSpiceRuntimeLimits({
      project,
      build: netlistFor(project),
      limits: {
        maxObjects: 300,
        maxNets: 250,
        maxDurationMs: 60_000,
        minTimeStepMs: 0.001,
        maxEstimatedPoints: 10_000,
        maxNetlistBytes: 250_000,
        timeoutMs: 15_000,
        maxOutputBytes: 4 * 1024 * 1024,
      },
    })

    expect(report.ok).toBe(false)
    expect(report.errors.join("\n")).toContain("transient points")
  })
})

function netlistFor(project: CircuitProject) {
  return generateSpiceNetlist({
    circuit: buildElectricalCircuit(project),
    analysis: project.analysis,
    title: project.name,
  })
}
