import { describe, expect, it } from "vitest"
import { getSymbolPinLeadSegments } from "./symbol-leads"
import type { SymbolObject } from "./types"

describe("symbol lead geometry", () => {
  it("connects capacitor leads directly to the plates", () => {
    expect(leadEnds(symbol("capacitor"))).toEqual([
      { x: -10, y: 0 },
      { x: 10, y: 0 },
    ])
  })

  it("connects diode leads directly to the anode body and cathode bar", () => {
    expect(leadEnds(symbol("diode"))).toEqual([
      { x: -18, y: 0 },
      { x: 16, y: 0 },
    ])
  })

  it("connects transistor leads to their drawn body terminals", () => {
    expect(leadEnds(symbol("npn-transistor"))).toEqual([
      { x: -18, y: 0 },
      { x: 18, y: -32 },
      { x: 18, y: 32 },
    ])
  })

  it("extends only the transistor base lead when the post span changes", () => {
    expect(leadSegments(symbol("npn-transistor", { pinSpacing: 112 }))).toEqual([
      { start: { x: -80, y: 0 }, end: { x: -18, y: 0 } },
      { start: { x: 32, y: -32 }, end: { x: 18, y: -32 } },
      { start: { x: 32, y: 32 }, end: { x: 18, y: 32 } },
    ])
  })

  it("extends only the mosfet gate lead when the post span changes", () => {
    expect(leadSegments(symbol("n-mosfet", { pinSpacing: 112 }))).toEqual([
      { start: { x: -80, y: 0 }, end: { x: -18, y: 0 } },
      { start: { x: 32, y: -32 }, end: { x: 22, y: -32 } },
      { start: { x: 32, y: 32 }, end: { x: 22, y: 32 } },
    ])
  })
})

function leadEnds(symbolObject: SymbolObject) {
  return getSymbolPinLeadSegments(symbolObject).map((lead) => lead.end)
}

function leadSegments(symbolObject: SymbolObject) {
  return getSymbolPinLeadSegments(symbolObject).map((lead) => ({
    start: lead.start,
    end: lead.end,
  }))
}

function symbol(
  symbolDefinitionId: string,
  overrides: Partial<SymbolObject> = {},
): SymbolObject {
  return {
    kind: "symbol",
    id: "sym_1",
    componentDefinitionId: symbolDefinitionId,
    symbolDefinitionId,
    refdes: "U1",
    position: { x: 0, y: 0 },
    rotation: 0,
    props: {},
    ...overrides,
  }
}
