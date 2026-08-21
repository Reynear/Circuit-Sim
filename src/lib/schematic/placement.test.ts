import {
  canCreateVisualBox,
  canCreateVisualLine,
  getSymbolPlacement,
} from "./placement"
import {
  getSymbolHandleWorldPositions,
  getSymbolPinWorldPosition,
} from "./transforms"
import type { SymbolObject, Vec2 } from "./types"

describe("schematic creation geometry", () => {
  it("places two-pin symbols between dragged posts", () => {
    expect(
      getSymbolPlacement(
        "resistor",
        { x: 40, y: 80 },
        { x: 120, y: 80 },
        20,
      ),
    ).toEqual({
      position: { x: 80, y: 80 },
      rotation: 0,
      pinSpacing: 80,
    })
  })

  it("keeps the first dragged source post mapped to pin1", () => {
    expectPlacedPins(
      "dc-voltage-source",
      "dc-source",
      { x: 40, y: 80 },
      { x: 120, y: 80 },
    )
    expectPlacedPins(
      "dc-voltage-source",
      "dc-source",
      { x: 120, y: 40 },
      { x: 120, y: 120 },
    )
  })

  it("places multi-pin symbols from their Falstad-style endpoint handles", () => {
    const start = { x: 0, y: 0 }
    const end = { x: 104, y: 0 }
    const placement = getSymbolPlacement(
      "ideal-op-amp-minus-top",
      start,
      end,
      20,
    )
    expect(placement).toEqual({
      position: { x: 48, y: 0 },
      rotation: 0,
      pinSpacing: 104,
    })
    if (!placement) {
      return
    }
    expectPlacedHandles(
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
      start,
      end,
    )
    const symbol = symbolFromPlacement(
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
      placement,
    )
    expect(getSymbolPinWorldPosition(symbol, "pin1")).toEqual({ x: 0, y: -18 })
    expect(getSymbolPinWorldPosition(symbol, "pin2")).toEqual({ x: 0, y: 18 })
    expect(getSymbolPinWorldPosition(symbol, "pin3")).toEqual(end)
  })

  it("keeps tiny line and box annotations out of the project", () => {
    expect(canCreateVisualLine({ x: 0, y: 0 }, { x: 15, y: 0 })).toBe(
      false,
    )
    expect(canCreateVisualLine({ x: 0, y: 0 }, { x: 16, y: 0 })).toBe(
      true,
    )
    expect(canCreateVisualBox({ x: 0, y: 0 }, { x: 31, y: 40 })).toBe(
      false,
    )
    expect(canCreateVisualBox({ x: 0, y: 0 }, { x: 32, y: 32 })).toBe(
      true,
    )
  })
})

function expectPlacedHandles(
  componentDefinitionId: string,
  symbolDefinitionId: string,
  start: Vec2,
  end: Vec2,
) {
  const placement = getSymbolPlacement(componentDefinitionId, start, end, 20)
  expect(placement).toBeTruthy()
  if (!placement) {
    return
  }
  const symbol = symbolFromPlacement(
    componentDefinitionId,
    symbolDefinitionId,
    placement,
  )

  expect(getSymbolHandleWorldPositions(symbol).map((handle) => handle.position)).toEqual([
    start,
    end,
  ])
}

function expectPlacedPins(
  componentDefinitionId: string,
  symbolDefinitionId: string,
  start: Vec2,
  end: Vec2,
) {
  const placement = getSymbolPlacement(componentDefinitionId, start, end, 20)
  expect(placement).toBeTruthy()
  if (!placement) {
    return
  }
  const symbol = symbolFromPlacement(
    componentDefinitionId,
    symbolDefinitionId,
    placement,
  )

  expect(getSymbolPinWorldPosition(symbol, "pin1")).toEqual(start)
  expect(getSymbolPinWorldPosition(symbol, "pin2")).toEqual(end)
}

function symbolFromPlacement(
  componentDefinitionId: string,
  symbolDefinitionId: string,
  placement: NonNullable<ReturnType<typeof getSymbolPlacement>>,
): SymbolObject {
  return {
    kind: "symbol",
    id: "sym_1",
    componentDefinitionId,
    symbolDefinitionId,
    refdes: "V1",
    position: placement.position,
    rotation: placement.rotation,
    props: {},
    ...(placement.pinSpacing ? { pinSpacing: placement.pinSpacing } : {}),
    ...(placement.pinSpread ? { pinSpread: placement.pinSpread } : {}),
  }
}
