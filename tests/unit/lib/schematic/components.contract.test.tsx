import { render } from "@testing-library/react"
import { Option, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { newId } from "@circuit-sim/core/ids"
import { ComponentLayer } from "@/features/editor/layers/ComponentLayer"
import {
  components,
  decodeComponentPropertyEdit,
  diode,
  nMosfet,
  npnTransistor,
  pMosfet,
  pnpTransistor,
  resistor,
  zenerDiode,
  type AnyComponentSpec,
} from "@circuit-sim/core/circuit/components"
import { ComponentSchema, makeComponent, type Component } from "@circuit-sim/core/circuit/project"

describe("component catalog contract", () => {
  it("defines unique types, shortcuts, terminals, and valid defaults", () => {
    expect(new Set(components.map((spec) => spec.type)).size).toBe(components.length)
    const shortcuts = components.flatMap((spec) => spec.shortcut ? [spec.shortcut] : [])
    expect(new Set(shortcuts).size).toBe(shortcuts.length)

    for (const spec of components) {
      const keys = spec.terminals.map((terminal) => terminal.key)
      expect(keys.length, spec.type).toBeGreaterThan(0)
      expect(new Set(keys).size, spec.type).toBe(keys.length)
      expect(Schema.decodeUnknownSync(spec.props)(spec.defaults)).toEqual(spec.defaults)
      expect(() => makeSpecComponent(spec)).not.toThrow()
    }
  })

  it("validates component property edits at the catalog boundary", () => {
    const resistance = resistor.properties.resistanceOhms
    expect(Option.isNone(decodeComponentPropertyEdit(resistance, 0))).toBe(true)
    expect(decodeComponentPropertyEdit(resistance, 2_200)).toEqual(
      Option.some({ componentType: "resistor", key: "resistanceOhms", value: 2_200 }),
    )
    expect(Option.isNone(
      decodeComponentPropertyEdit(nMosfet.properties.thresholdVolts, -2),
    )).toBe(true)
    expect(Option.isNone(
      decodeComponentPropertyEdit(pMosfet.properties.thresholdVolts, 2),
    )).toBe(true)
    expect(Option.isNone(
      decodeComponentPropertyEdit(
        nMosfet.properties.transconductanceAmpsPerVoltSquared,
        0,
      ),
    )).toBe(true)
    expect(
      decodeComponentPropertyEdit(
        nMosfet.properties.channelLengthModulationPerVolt,
        0,
      ),
    ).toEqual(
      Option.some({
        componentType: "n-mosfet",
        key: "channelLengthModulationPerVolt",
        value: 0,
      }),
    )
    expect(Option.isNone(
      decodeComponentPropertyEdit(
        pMosfet.properties.channelLengthModulationPerVolt,
        -0.01,
      ),
    )).toBe(true)
    expect(Option.isNone(
      decodeComponentPropertyEdit(diode.properties.saturationCurrentAmps, 0),
    )).toBe(true)
    expect(Option.isNone(
      decodeComponentPropertyEdit(diode.properties.emissionCoefficient, 0),
    )).toBe(true)
    expect(
      decodeComponentPropertyEdit(diode.properties.seriesResistanceOhms, 0),
    ).toEqual(
      Option.some({
        componentType: "diode",
        key: "seriesResistanceOhms",
        value: 0,
      }),
    )
    expect(Option.isNone(
      decodeComponentPropertyEdit(
        zenerDiode.properties.breakdownCurrentAmps,
        0,
      ),
    )).toBe(true)
    expect(Option.isNone(
      decodeComponentPropertyEdit(
        zenerDiode.properties.saturationCurrentAmps,
        0,
      ),
    )).toBe(true)
    expect(Option.isNone(
      decodeComponentPropertyEdit(
        zenerDiode.properties.emissionCoefficient,
        0,
      ),
    )).toBe(true)
    expect(
      decodeComponentPropertyEdit(
        zenerDiode.properties.breakdownCurrentAmps,
        0.005,
      ),
    ).toEqual(
      Option.some({
        componentType: "zener-diode",
        key: "breakdownCurrentAmps",
        value: 0.005,
      }),
    )
    expect(Option.isNone(
      decodeComponentPropertyEdit(
        npnTransistor.properties.saturationCurrentAmps,
        0,
      ),
    )).toBe(true)
    expect(Option.isNone(
      decodeComponentPropertyEdit(
        npnTransistor.properties.forwardEmissionCoefficient,
        0,
      ),
    )).toBe(true)
    expect(Option.isNone(
      decodeComponentPropertyEdit(
        pnpTransistor.properties.saturationCurrentAmps,
        -1e-15,
      ),
    )).toBe(true)
    expect(
      decodeComponentPropertyEdit(
        pnpTransistor.properties.forwardEmissionCoefficient,
        1.2,
      ),
    ).toEqual(
      Option.some({
        componentType: "pnp-transistor",
        key: "forwardEmissionCoefficient",
        value: 1.2,
      }),
    )
  })

  it("round-trips and renders every component type", () => {
    for (const spec of components) {
      const value = makeSpecComponent(spec)
      expect(Schema.decodeSync(ComponentSchema)(Schema.encodeSync(ComponentSchema)(value))).toEqual(value)
      const { container, unmount } = render(
        <svg><ComponentLayer components={[value]} selectedIds={[]} onComponentPointerDown={() => {}} /></svg>,
      )
      expect(container.querySelector(".component"), spec.type).not.toBeNull()
      unmount()
    }
  })
})

function makeSpecComponent(spec: AnyComponentSpec): Component {
  return makeComponent({
    kind: "component",
    id: newId(),
    type: spec.type,
    refdes: `${spec.prefix}1`,
    position: { x: 200, y: 200 },
    rotation: 0,
    flipped: false,
    props: spec.defaults,
  })
}
