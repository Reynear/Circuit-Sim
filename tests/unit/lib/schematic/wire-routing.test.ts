import { describe, expect, it } from "vitest"
import {
  convertWireToRoutedWire,
  getRoutedWireSnapPoint,
  rerouteWireVia,
  routedWirePoints,
  splitWireAtPoint,
} from "@/browser/editor/wire-routing"
import type { WireObject } from "@circuit-sim/core/circuit/project"

describe("wire gestures", () => {
  it("creates predictable straight and Manhattan polylines", () => {
    expect(routedWirePoints({ x: 0, y: 0 }, { x: 40, y: 20 }, "straight")).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 20 },
    ])
    expect(routedWirePoints({ x: 0, y: 0 }, { x: 40, y: 20 }, "horizontal-first")).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
    ])
  })

  it("inserts an exact committed vertex into a snapped segment", () => {
    expect(splitWireAtPoint(wire([{ x: 0, y: 0 }, { x: 80, y: 0 }]), { x: 40, y: 0 })).toEqual({
      afterPointIndex: 0,
      position: { x: 40, y: 0 },
    })
    expect(splitWireAtPoint(wire([{ x: 0, y: 0 }, { x: 80, y: 0 }]), { x: 40, y: 1 })).toBeNull()
  })

  it("converts diagonal segments and reroutes through a visible via", () => {
    expect(convertWireToRoutedWire(wire([{ x: 0, y: 0 }, { x: 40, y: 20 }])).points).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
    ])
    expect(rerouteWireVia(wire([{ x: 0, y: 0 }, { x: 80, y: 0 }]), { x: 40, y: 40 }).points).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 80, y: 40 },
      { x: 80, y: 0 },
    ])
  })

  it("finds a grid-aligned preview point on the nearest segment", () => {
    expect(getRoutedWireSnapPoint(
      wire([{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 80 }]),
      { x: 75, y: 43 },
    )).toEqual({ x: 80, y: 40 })
  })
})

function wire(points: WireObject["points"]): WireObject {
  return { kind: "wire", id: "wire", points }
}
