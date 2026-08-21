import { getMouseWheelValueEdit, parseSiValue } from "./values"
import type { SymbolObject } from "./types"

function symbol(
  componentDefinitionId: string,
  props: Record<string, unknown>,
): SymbolObject {
  return {
    kind: "symbol",
    id: "sym_test",
    componentDefinitionId,
    symbolDefinitionId: componentDefinitionId,
    refdes: "X1",
    position: { x: 0, y: 0 },
    rotation: 0,
    props,
  }
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
    const resistor = symbol("resistor", { value: "1k" })

    expect(getMouseWheelValueEdit(resistor, -100)?.value).toBe("1.2k")
    expect(getMouseWheelValueEdit(resistor, 100)?.value).toBe("820")
  })

  it("preserves capacitor and inductor units while stepping values", () => {
    expect(
      getMouseWheelValueEdit(symbol("capacitor", { value: "1uF" }), -100)
        ?.value,
    ).toBe("1.2uF")
    expect(
      getMouseWheelValueEdit(symbol("inductor", { value: "10mH" }), -100)
        ?.value,
    ).toBe("12mH")
  })

  it("uses the adjacent E12 value when the current value is off-series", () => {
    const resistor = symbol("resistor", { value: "1.1k" })

    expect(getMouseWheelValueEdit(resistor, -100)?.value).toBe("1.2k")
    expect(getMouseWheelValueEdit(resistor, 100)?.value).toBe("1k")
  })

  it("ignores components that do not use the schematic scroll value popup", () => {
    expect(
      getMouseWheelValueEdit(symbol("dc-voltage-source", { voltage: "5V" }), -100),
    ).toBeNull()
  })
})
