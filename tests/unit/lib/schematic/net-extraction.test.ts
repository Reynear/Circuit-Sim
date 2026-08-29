import { describe, expect, it } from "vitest"
import { newId } from "@circuit-sim/core/ids"
import { getComponent, type ComponentType } from "@circuit-sim/core/circuit/components"
import {
  createRcLowPassExample,
  createSourceToGroundExample,
  createVoltageDividerExample,
} from "@/examples/circuit-projects"
import { extractNetlist, pinConnectionKey } from "@circuit-sim/core/circuit/net-extraction"
import { makeComponent, newCircuitProject, type CircuitProject, type Component, type Point, type SchematicObject } from "@circuit-sim/core/circuit/project"

describe("exact-coordinate connectivity", () => {
  it("extracts the named nets from demo projects", () => {
    expect(extractNetlist(createRcLowPassExample()).nets.map((net) => net.name)).toEqual(
      expect.arrayContaining(["GND", "VIN", "VOUT"]),
    )
    expect(extractNetlist(createVoltageDividerExample()).nets.map((net) => net.name)).toContain("VOUT")
    expect(extractNetlist(createSourceToGroundExample()).nets.map((net) => net.name)).toEqual(
      expect.arrayContaining(["GND", "VIN"]),
    )
  })

  it("connects only exact committed coordinates", () => {
    const resistor = makeTestComponent("resistor", "R1", { x: 0, y: 0 })
    const exact = projectWithObjects([
      resistor,
      { kind: "wire", id: "wire_exact", points: [{ x: -40, y: 0 }, { x: -80, y: 0 }] },
    ])
    const near = projectWithObjects([
      resistor,
      { kind: "wire", id: "wire_near", points: [{ x: -39, y: 0 }, { x: -80, y: 0 }] },
    ])

    expect(extractNetlist(exact).pinToNetId.get(pinConnectionKey(resistor.id, "a"))).toBeDefined()
    expect(extractNetlist(near).pinToNetId.get(pinConnectionKey(resistor.id, "a"))).toBeUndefined()
  })

  it("connects a T-junction through an explicit shared wire vertex", () => {
    const project = projectWithObjects([
      { kind: "wire", id: "wire_main", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 80, y: 0 }] },
      { kind: "wire", id: "wire_branch", points: [{ x: 40, y: 0 }, { x: 40, y: 40 }] },
      { kind: "net-label", id: "label", text: "SIGNAL", position: { x: 40, y: 40 } },
    ])
    const netlist = extractNetlist(project)
    expect(netlist.objectToNetId.get("wire_main")).toBe(netlist.objectToNetId.get("wire_branch"))
    expect(netlist.nets.find((net) => net.name === "SIGNAL")).toBeDefined()
  })

  it("does not connect crossing wire interiors", () => {
    const project = projectWithObjects([
      { kind: "wire", id: "horizontal", points: [{ x: 0, y: 20 }, { x: 80, y: 20 }] },
      { kind: "wire", id: "vertical", points: [{ x: 40, y: 0 }, { x: 40, y: 40 }] },
    ])
    const netlist = extractNetlist(project)
    expect(netlist.objectToNetId.get("horizontal")).not.toBe(netlist.objectToNetId.get("vertical"))
  })

  it("uses switch state as internal connectivity", () => {
    const open = makeTestComponent("switch", "S1", { x: 0, y: 0 }, { state: "open" })
    const closed = makeTestComponent("switch", "S1", { x: 0, y: 0 }, { state: "closed" })
    expect(extractNetlist(projectWithObjects([open])).nets).toEqual([])
    const closedNetlist = extractNetlist(projectWithObjects([closed]))
    expect(closedNetlist.pinToNetId.get(pinConnectionKey(closed.id, "a"))).toBe(
      closedNetlist.pinToNetId.get(pinConnectionKey(closed.id, "b")),
    )
  })

  it("keeps the output of a ground-referenced voltage source", () => {
    const source = makeTestComponent("dc-voltage-source", "V1", { x: 0, y: 0 })
    const netlist = extractNetlist(projectWithObjects([
      source,
      { kind: "ground", id: "ground", position: { x: 40, y: 0 }, netName: "GND" },
    ]))

    expect(netlist.pinToNetId.get(pinConnectionKey(source.id, "positive"))).toBeDefined()
    expect(netlist.pinToNetId.get(pinConnectionKey(source.id, "negative"))).toBe("net_GND")
  })
})

function projectWithObjects(objects: SchematicObject[]): CircuitProject {
  return { ...newCircuitProject(), objects }
}

function makeTestComponent(
  type: ComponentType,
  refdes: string,
  position: Point,
  props?: unknown,
): Component {
  const spec = getComponent(type)
  return makeComponent({
    kind: "component",
    id: newId(),
    type,
    refdes,
    position,
    rotation: 0,
    flipped: false,
    props: props ?? spec.defaults,
  })
}
