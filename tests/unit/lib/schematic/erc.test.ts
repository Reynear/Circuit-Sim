import { newId } from "@circuit-sim/core/ids"
import { createRcLowPassExample } from "@/examples/circuit-projects"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"
import { runErc } from "@circuit-sim/core/circuit/erc"

describe("ERC", () => {
  it("warns when a project has no ground", () => {
    const issues = runErc(newCircuitProject())
    expect(issues.some((issue) => issue.message.includes("no GND"))).toBe(true)
  })

  it("warns for unconnected resistor pins", () => {
    const emptyProject = newCircuitProject()
    const project = {
      ...emptyProject,
      objects: [{
          kind: "component" as const,
          id: newId(),
          type: "resistor" as const,
          refdes: "R1",
          position: { x: 0, y: 0 },
          rotation: 0 as const,
          flipped: false,
          props: { resistanceOhms: 1_000 },
        }],
    }
    const issues = runErc(project)
    expect(issues.some((issue) => issue.message.includes("R1.1"))).toBe(true)
    expect(issues.some((issue) => issue.message.includes("R1.2"))).toBe(true)
    expect(
      issues
        .filter((issue) => issue.message.includes("is unconnected"))
        .flatMap((issue) => issue.positions ?? []),
    ).toEqual([
      { x: -40, y: 0 },
      { x: 40, y: 0 },
    ])
  })

  it("does not produce critical errors for the valid RC demo", () => {
    const issues = runErc(createRcLowPassExample())
    expect(issues.filter((issue) => issue.severity === "error")).toHaveLength(0)
  })
})
