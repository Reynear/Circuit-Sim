import { describe, expect, it } from "vitest"
import {
  beginMarquee,
  beginShapeCreation,
  canCreateVisualBox,
  canCreateVisualLine,
  isAnnotationPlacementToolType,
  marqueeRect,
  marqueeSelectionIds,
  modifierAdditive,
  shapeCreationHasSize,
  updateMarquee,
  updateShapeCreation,
} from "@/browser/editor/canvas-gestures"
import type { SchematicObject } from "@circuit-sim/core/circuit/project"

const objects: ReadonlyArray<SchematicObject> = [
  {
    kind: "box",
    id: "box_1",
    start: { x: 0, y: 0 },
    end: { x: 40, y: -40 },
  },
]

describe("marquee selection gesture", () => {
  it("begins with zero area at the press point", () => {
    const drag = beginMarquee({ x: 10, y: 20 }, false)
    expect(drag).toEqual({
      type: "marquee",
      start: { x: 10, y: 20 },
      current: { x: 10, y: 20 },
      additive: false,
    })
    expect(marqueeSelectionIds(drag, objects)).toEqual([])
  })

  it("normalizes the rect regardless of drag direction", () => {
    const forward = updateMarquee(beginMarquee({ x: 0, y: 0 }, false), {
      x: 100,
      y: 80,
    })
    const backward = updateMarquee(beginMarquee({ x: 100, y: 80 }, false), {
      x: 0,
      y: 0,
    })

    expect(marqueeRect(forward)).toEqual(marqueeRect(backward))
    expect(marqueeRect(forward)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    })
  })

  it("selects enclosed objects and preserves additive mode", () => {
    const drag = updateMarquee(beginMarquee({ x: -10, y: 10 }, true), {
      x: 60,
      y: -60,
    })
    expect(drag.additive).toBe(true)
    expect(marqueeSelectionIds(drag, objects)).toEqual(["box_1"])
  })
})

describe("shape creation gesture", () => {
  it("tracks the drag corner", () => {
    const drag = updateShapeCreation(
      beginShapeCreation("create-box", { x: 1, y: 2 }),
      { x: 3, y: 4 },
    )
    expect(drag).toEqual({ type: "create-box", start: { x: 1, y: 2 }, current: { x: 3, y: 4 } })
  })

  it("commits only when the drag has size", () => {
    const zero = beginShapeCreation("create-line", { x: 5, y: 5 })
    expect(shapeCreationHasSize(zero)).toBe(false)
    expect(
      shapeCreationHasSize(updateShapeCreation(zero, { x: 25, y: 5 })),
    ).toBe(true)
  })

  it("rejects lines and boxes below their visible minimum size", () => {
    expect(canCreateVisualLine({ x: 0, y: 0 }, { x: 16, y: 0 })).toBe(true)
    expect(canCreateVisualLine({ x: 0, y: 0 }, { x: 15, y: 0 })).toBe(false)
    expect(canCreateVisualBox({ x: 0, y: 0 }, { x: 32, y: 32 })).toBe(true)
    expect(canCreateVisualBox({ x: 0, y: 0 }, { x: 31, y: 32 })).toBe(false)
  })
})

describe("gesture helpers", () => {
  it("treats shift, meta and ctrl as additive modifiers", () => {
    expect(modifierAdditive({ shiftKey: true, metaKey: false, ctrlKey: false })).toBe(true)
    expect(modifierAdditive({ shiftKey: false, metaKey: true, ctrlKey: false })).toBe(true)
    expect(modifierAdditive({ shiftKey: false, metaKey: false, ctrlKey: true })).toBe(true)
    expect(modifierAdditive({ shiftKey: false, metaKey: false, ctrlKey: false })).toBe(false)
  })

  it("recognizes annotation placement tools", () => {
    for (const tool of [
      "place-ground",
      "place-voltage-probe",
      "place-current-probe",
      "place-net-label",
      "place-text",
    ]) {
      expect(isAnnotationPlacementToolType(tool)).toBe(true)
    }
    expect(isAnnotationPlacementToolType("place-box")).toBe(false)
    expect(isAnnotationPlacementToolType("select")).toBe(false)
  })
})
