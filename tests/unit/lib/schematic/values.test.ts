import { newId } from "@circuit-sim/core/ids"
import { getMouseWheelValueEdit, parseSiValue } from "@/browser/editor/values"
import { getComponent, type ComponentType } from "@circuit-sim/core/circuit/components"
import { makeComponent, type Component } from "@circuit-sim/core/circuit/project"

function component(type: ComponentType, props: unknown): Component {
  const spec = getComponent(type)
  return makeComponent({
    kind: "component",
    id: newId(),
    type,
    refdes: "X1",
    position: { x: 0, y: 0 },
    rotation: 0,
    flipped: false,
    props,
  })
}

describe("schematic values", () => {
  it("parses SI values with units", () => {
    expect(parseSiValue("1k")).toBe(1000)
    expect(parseSiValue("4.7uF")).toBeCloseTo(0.0000047)
    expect(parseSiValue("10mH")).toBeCloseTo(0.01)
    expect(parseSiValue("120Vrms")).toBe(120)
    expect(parseSiValue("1.0E-5")).toBeCloseTo(0.00001)
  })

  it("steps schematic-style resistor values on the E12 series", () => {
    const resistor = component("resistor", { resistanceOhms: 1_000 })

    expect(getMouseWheelValueEdit(resistor, -100)?.value).toBe("1.2k")
    expect(getMouseWheelValueEdit(resistor, 100)?.value).toBe("820")
  })

  it("steps canonical capacitor and inductor values", () => {
    expect(
      getMouseWheelValueEdit(
        component("capacitor", { capacitanceFarads: 1e-6 }),
        -100,
      )?.value,
    ).toBe("1.2u")
    expect(
      getMouseWheelValueEdit(
        component("inductor", { inductanceHenries: 0.01 }),
        -100,
      )?.value,
    ).toBe("12m")
  })

  it("uses the adjacent E12 value when the current value is off-series", () => {
    const resistor = component("resistor", { resistanceOhms: 1_100 })

    expect(getMouseWheelValueEdit(resistor, -100)?.value).toBe("1.2k")
    expect(getMouseWheelValueEdit(resistor, 100)?.value).toBe("1k")
  })

  it("ignores components that do not use the schematic scroll value popup", () => {
    expect(
      getMouseWheelValueEdit(
        component("dc-voltage-source", { voltageVolts: 5 }),
        -100,
      ),
    ).toBeNull()
  })
})
