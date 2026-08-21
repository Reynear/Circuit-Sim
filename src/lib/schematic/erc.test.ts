import { createId } from "../ids"
import {
  createDemoRcLowPassProject,
  createEmptyProject,
} from "./create-default-project"
import { runErc } from "./erc"

describe("ERC", () => {
  it("warns when a project has no ground", () => {
    const issues = runErc(createEmptyProject())
    expect(issues.some((issue) => issue.message.includes("no GND"))).toBe(true)
  })

  it("warns for unconnected resistor pins", () => {
    const project = createEmptyProject()
    project.sheets[0]!.objects.push({
      kind: "symbol",
      id: createId("sym"),
      componentDefinitionId: "resistor",
      symbolDefinitionId: "resistor",
      refdes: "R1",
      position: { x: 0, y: 0 },
      rotation: 0,
      props: { value: "1k" },
    })
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
    const issues = runErc(createDemoRcLowPassProject())
    expect(issues.filter((issue) => issue.severity === "error")).toHaveLength(0)
  })
})
