import { Option, Schema } from "effect"
import { newId } from "@circuit-sim/core/ids"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"
import {
  CircuitProjectSchema,
  ComponentSchema,
  makeComponent,
} from "@circuit-sim/core/circuit/project"

describe("component schema", () => {
  it("accepts fixed placement and quarter-turn rotation", () => {
    const component = makeComponent({
      kind: "component",
      id: newId(),
      type: "resistor",
      refdes: "R1",
      position: { x: 20, y: 40 },
      rotation: 90,
      flipped: false,
      props: { resistanceOhms: 1_000 },
    })

    expect(component.position).toEqual({ x: 20, y: 40 })
    expect(component.rotation).toBe(90)
  })

  it("accepts only the unversioned canonical project", () => {
    const project = newCircuitProject("Canonical")
    const encoded = Schema.encodeSync(CircuitProjectSchema)(project)

    expect(encoded).not.toHaveProperty("version")
    expect(encoded).toHaveProperty("objects")
    expect(encoded).not.toHaveProperty("sheet")
    expect(encoded).toHaveProperty("analysis")
    expect(
      Option.isNone(
        Schema.decodeUnknownOption(CircuitProjectSchema, {
          onExcessProperty: "error",
        })({
          ...encoded,
          version: 3,
        }),
      ),
    ).toBe(true)
  })

  it("rejects the superseded stretch-handle model and incomplete placement", () => {
    const base = {
      kind: "component",
      id: newId(),
      type: "resistor",
      refdes: "R1",
      props: { resistanceOhms: 1_000 },
    }

    expect(
      Option.isNone(
        Schema.decodeUnknownOption(ComponentSchema)({
          ...base,
          start: { x: 0, y: 0 },
          end: { x: 80, y: 0 },
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        Schema.decodeUnknownOption(ComponentSchema)({
          ...base,
          position: { x: 0, y: 0 },
          rotation: 45,
          flipped: false,
        }),
      ),
    ).toBe(true)
  })
})
