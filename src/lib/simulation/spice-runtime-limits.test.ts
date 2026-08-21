import { createDemoRcLowPassProject } from "../schematic/create-default-project"
import { generateSpiceNetlist } from "./spice-netlist"
import { validateSpiceRuntimeLimits } from "./spice-runtime-limits"

describe("SPICE runtime limits", () => {
  it("allows the demo RC project under default limits", () => {
    const project = createDemoRcLowPassProject()
    const report = validateSpiceRuntimeLimits({
      project,
      build: generateSpiceNetlist(project),
    })

    expect(report.ok).toBe(true)
    expect(report.errors).toEqual([])
  })

  it("blocks overly dense transient runs before ngspice execution", () => {
    const project = createDemoRcLowPassProject()
    project.simulations[0] = {
      ...project.simulations[0]!,
      durationMs: 1000,
      timeStepMs: 0.001,
    }
    const report = validateSpiceRuntimeLimits({
      project,
      build: generateSpiceNetlist(project),
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
