import {
  createDemoRcLowPassProject,
  createDemoSourceToGroundProject,
  createDemoVoltageDividerProject,
  createEmptyProject,
} from "./create-default-project"
import { extractNetlist, pinConnectionKey } from "./net-extraction"
import { getSymbolPinWorldPosition } from "./transforms"
import type { CircuitProject, SchematicObject, SymbolObject } from "./types"

describe("net extraction", () => {
  it("extracts ground and labeled signal nets from the demo projects", () => {
    const rcNetlist = extractNetlist(createDemoRcLowPassProject())
    const dividerNetlist = extractNetlist(createDemoVoltageDividerProject())

    expect(rcNetlist.nets.map((net) => net.name)).toEqual(
      expect.arrayContaining(["GND", "VIN", "VOUT"]),
    )
    expect(dividerNetlist.nets.map((net) => net.name)).toContain("VOUT")

    const sourceToGroundNetlist = extractNetlist(createDemoSourceToGroundProject())
    expect(sourceToGroundNetlist.nets.map((net) => net.name)).toEqual(
      expect.arrayContaining(["GND", "VIN"]),
    )
  })

  it("creates an output net for a voltage source tied directly to ground", () => {
    const source = symbol("sym_v1", "dc-voltage-source", "V1", { x: 0, y: 0 }, {
      voltage: "5V",
    })
    source.rotation = 90
    const sourceNegative = getSymbolPinWorldPosition(source, "pin2")
    if (!sourceNegative) {
      throw new Error("Expected source negative pin")
    }
    const project = projectWithObjects([
      source,
      {
        kind: "ground",
        id: "gnd",
        netName: "GND",
        position: sourceNegative,
      },
    ])

    const netlist = extractNetlist(project)
    const sourcePositiveNetId = netlist.pinToNetId[pinConnectionKey(source.id, "pin1")]
    const sourceNegativeNetId = netlist.pinToNetId[pinConnectionKey(source.id, "pin2")]

    expect(sourcePositiveNetId).toBeDefined()
    expect(
      netlist.nets.find((net) => net.id === sourceNegativeNetId)?.name,
    ).toBe("GND")
  })

  it("connects pins, wires, labels, probes, and ground by position", () => {
    const resistor = symbol("sym_r1", "resistor", "R1", { x: 0, y: 0 })
    const project = projectWithObjects([
      resistor,
      {
        kind: "wire",
        id: "wire_left",
        points: [
          { x: -40, y: 0 },
          { x: -80, y: 0 },
        ],
      },
      {
        kind: "net-label",
        id: "label_in",
        text: "IN",
        position: { x: -80, y: 0 },
      },
      {
        kind: "probe",
        id: "probe_in",
        probeType: "voltage",
        name: "VP_IN",
        position: { x: -80, y: 0 },
      },
      {
        kind: "ground",
        id: "gnd",
        netName: "GND",
        position: { x: 40, y: 0 },
      },
    ])

    const netlist = extractNetlist(project)
    expect(netlist.pinToNetId[pinConnectionKey("sym_r1", "pin1")]).toBe(
      netlist.objectToNetId.probe_in,
    )
    expect(
      netlist.nets.find((net) => net.id === netlist.objectToNetId.probe_in)?.name,
    ).toBe("IN")
    expect(
      netlist.nets.find(
        (net) => net.id === netlist.pinToNetId[pinConnectionKey("sym_r1", "pin2")],
      )?.name,
    ).toBe("GND")
  })

  it("uses the MVP switch state as internal connectivity", () => {
    const openNetlist = extractNetlist(projectWithObjects([
      symbol("sym_open_switch", "switch", "S1", { x: 0, y: 0 }, { state: "open" }),
    ]))
    expect(openNetlist.pinToNetId[pinConnectionKey("sym_open_switch", "pin1")])
      .toBeUndefined()
    expect(openNetlist.pinToNetId[pinConnectionKey("sym_open_switch", "pin2")])
      .toBeUndefined()

    const closedNetlist = extractNetlist(projectWithObjects([
      symbol("sym_closed_switch", "switch", "S1", { x: 0, y: 0 }, { state: "closed" }),
    ]))
    expect(
      closedNetlist.pinToNetId[pinConnectionKey("sym_closed_switch", "pin1")],
    ).toBe(
      closedNetlist.pinToNetId[pinConnectionKey("sym_closed_switch", "pin2")],
    )
  })
})

function projectWithObjects(objects: SchematicObject[]): CircuitProject {
  const project = createEmptyProject()
  const sheet = project.sheets[0]
  if (!sheet) {
    throw new Error("Missing default sheet")
  }
  project.sheets[0] = { ...sheet, objects }
  return project
}

function symbol(
  id: string,
  componentDefinitionId: string,
  refdes: string,
  position: { x: number; y: number },
  props: Record<string, unknown> = {},
): SymbolObject {
  return {
    kind: "symbol",
    id,
    componentDefinitionId,
    symbolDefinitionId:
      componentDefinitionId === "dc-voltage-source" ? "dc-source" : componentDefinitionId,
    refdes,
    position,
    rotation: 0,
    props,
  }
}
