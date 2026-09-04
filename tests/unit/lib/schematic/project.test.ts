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

  it("rejects reversed or equal ideal op amp output limits", () => {
    const base = {
      kind: "component",
      id: newId(),
      type: "ideal-op-amp-minus-top",
      refdes: "U1",
      position: { x: 0, y: 0 },
      rotation: 0,
      flipped: false,
    }

    expect(
      Option.isNone(
        Schema.decodeUnknownOption(ComponentSchema)({
          ...base,
          props: { gain: 100_000, minOutputVolts: 10, maxOutputVolts: -10 },
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        Schema.decodeUnknownOption(ComponentSchema)({
          ...base,
          props: { gain: 100_000, minOutputVolts: 5, maxOutputVolts: 5 },
        }),
      ),
    ).toBe(true)
  })

  it("rejects invalid logic voltage ordering and unsupported input counts", () => {
    const base = {
      kind: "component",
      id: newId(),
      position: { x: 0, y: 0 },
      rotation: 0,
      flipped: false,
    }

    expect(
      Option.isNone(
        Schema.decodeUnknownOption(ComponentSchema)({
          ...base,
          type: "logic-input",
          refdes: "IN1",
          props: {
            position: 0,
            highLogicVoltageVolts: 0,
            lowLogicVoltageVolts: 0,
            ternary: false,
            momentary: false,
          },
        }),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        Schema.decodeUnknownOption(ComponentSchema)({
          ...base,
          type: "and-gate",
          refdes: "U1",
          props: { inputCount: 3, highLogicVoltageVolts: 5 },
        }),
      ),
    ).toBe(true)
  })
})
