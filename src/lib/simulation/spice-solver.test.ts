import { createId } from "../ids"
import {
  createDemoRcLowPassProject,
  createDemoSourceToGroundProject,
  createDemoVoltageDividerProject,
  createEmptyProject,
} from "../schematic/create-default-project"
import { generateSpiceNetlist } from "./spice-netlist"
import { runSpiceSimulation } from "./spice-solver"
import type { CircuitProject } from "../schematic/types"

describe("SPICE simulation", () => {
  it("exports the RC demo as a transient SPICE netlist", () => {
    const output = generateSpiceNetlist(createDemoRcLowPassProject())

    expect(output.netlist).toContain("R1")
    expect(output.netlist).toContain("C1")
    expect(output.netlist).toContain("V1")
    expect(output.netlist).toContain(".tran")
    expect(output.netlist).toContain(".print tran")
    expect(output.diagnostics.errors).toHaveLength(0)
  })

  it("exports a direct source-to-ground circuit without floating source pins", () => {
    const output = generateSpiceNetlist(createDemoSourceToGroundProject())

    expect(output.netlist).toContain("V1 VIN 0 DC 5V")
    expect(output.netlist).toContain(".print tran V(VIN)")
    expect(output.diagnostics.floatingPins).toEqual([])
  })

  it("runs SPICE and returns voltage, current, and power traces", () => {
    const result = runSpiceSimulation(createDemoVoltageDividerProject())
    const metrics = new Set(result.traces.map((trace) => trace.metric))

    expect(result.kind).toBe("spice")
    expect(result.engine).toBe("spicey")
    expect(result.status).toBe("success")
    expect(metrics.has("voltage")).toBe(true)
    expect(metrics.has("current")).toBe(true)
    expect(metrics.has("power")).toBe(true)
  })

  it("exports current sources and custom diode model metadata", () => {
    const output = generateSpiceNetlist(createCurrentSourceAndDiodeProject())

    expect(output.netlist).toContain("I1")
    expect(output.netlist).toContain(" DC 1mA")
    expect(output.netlist).toContain("D1")
    expect(output.netlist).toContain(".model FAST_DIODE")
    expect(output.diagnostics.unsupportedComponents).toEqual([])
  })

  it("uses switch state as topology and does not export switches as unsupported SPICE parts", () => {
    const openOutput = generateSpiceNetlist(createSwitchOnlyProject("open"))
    const closedOutput = generateSpiceNetlist(createSwitchOnlyProject("closed"))

    expect(openOutput.diagnostics.unsupportedComponents).toEqual([])
    expect(openOutput.diagnostics.floatingPins).toEqual([])
    expect(closedOutput.diagnostics.unsupportedComponents).toEqual([])
    expect(closedOutput.diagnostics.floatingPins).toEqual([])
    expect(closedOutput.nodeNameByNetId).toEqual({ net_N001: "N001" })
  })
})

function createCurrentSourceAndDiodeProject(): CircuitProject {
  const project = createEmptyProject("Current source and diode")
  const sheet = project.sheets[0]
  if (!sheet) {
    throw new Error("Missing default sheet")
  }

  project.sheets[0] = {
    ...sheet,
    objects: [
      {
        kind: "symbol",
        id: createId("sym"),
        componentDefinitionId: "dc-current-source",
        symbolDefinitionId: "current-source",
        refdes: "I1",
        position: { x: 0, y: 0 },
        rotation: 0,
        props: { current: "1mA" },
      },
      {
        kind: "symbol",
        id: createId("sym"),
        componentDefinitionId: "diode",
        symbolDefinitionId: "diode",
        refdes: "D1",
        position: { x: 120, y: 0 },
        rotation: 0,
        props: { model: "fast-diode", spiceModel: "fast-diode" },
      },
      {
        kind: "wire",
        id: createId("wire"),
        points: [
          { x: 40, y: 0 },
          { x: 80, y: 0 },
        ],
      },
      {
        kind: "wire",
        id: createId("wire"),
        points: [
          { x: 160, y: 0 },
          { x: 160, y: 80 },
          { x: -40, y: 80 },
          { x: -40, y: 0 },
        ],
      },
      {
        kind: "ground",
        id: createId("junc"),
        position: { x: -40, y: 80 },
        netName: "GND",
      },
    ],
  }

  return project
}

function createSwitchOnlyProject(state: "open" | "closed"): CircuitProject {
  const project = createEmptyProject("Switch topology")
  const sheet = project.sheets[0]
  if (!sheet) {
    throw new Error("Missing default sheet")
  }

  project.sheets[0] = {
    ...sheet,
    objects: [
      {
        kind: "symbol",
        id: createId("sym"),
        componentDefinitionId: "switch",
        symbolDefinitionId: "switch",
        refdes: "S1",
        position: { x: 0, y: 0 },
        rotation: 0,
        props: { state },
      },
    ],
  }

  return project
}
