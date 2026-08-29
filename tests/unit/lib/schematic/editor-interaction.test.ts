import { describe, expect, it } from "vitest"
import {
  SELECT_DRAG_DELAY_MS,
  hasSelectDragDelayElapsed,
  nearestConnectionSnapPoint,
} from "@/browser/editor/interaction"
import type { SchematicObject } from "@circuit-sim/core/circuit/project"

describe("schematic interaction timing", () => {
  it("waits 150ms before select-mode object drags become drag-selected", () => {
    expect(hasSelectDragDelayElapsed(1000, 1149)).toBe(false)
    expect(
      hasSelectDragDelayElapsed(
        1000,
        1000 + SELECT_DRAG_DELAY_MS,
      ),
    ).toBe(true)
  })
})

describe("schematic connection snapping", () => {
  it("snaps near wire segments at grid intersections", () => {
    const wire: SchematicObject = {
      kind: "wire",
      id: "wire_1",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    }

    expect(
      nearestConnectionSnapPoint(
        { x: 44, y: 7 },
        [wire],
        13,
      ),
    ).toEqual({ x: 40, y: 0 })
  })

  it("prefers a closer explicit post over a wire segment snap", () => {
    const objects: SchematicObject[] = [
      {
        kind: "wire",
        id: "wire_1",
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      },
      {
        kind: "ground",
        id: "junc_1",
        position: { x: 40, y: 8 },
        netName: "GND",
      },
    ]

    expect(
      nearestConnectionSnapPoint(
        { x: 41, y: 7 },
        objects,
        13,
      ),
    ).toEqual({ x: 40, y: 8 })
  })
})
