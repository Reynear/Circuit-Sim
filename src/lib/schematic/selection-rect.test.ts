import { describe, expect, it } from "vitest"
import {
  objectsMatchingSelectionRect,
  rectFromPoints,
} from "./selection-rect"
import type { BoxObject, LineObject } from "./types"

describe("selection rectangle matching", () => {
  const line: LineObject = {
    kind: "line",
    id: "line_tiny_select",
    start: { x: 40, y: 100 },
    end: { x: 200, y: 100 },
  }

  const box: BoxObject = {
    kind: "box",
    id: "box_full_containment",
    start: { x: 100, y: 100 },
    end: { x: 160, y: 140 },
  }

  it("treats a zero-size rectangle as a click clear", () => {
    expect(
      objectsMatchingSelectionRect([line], rectFromPoints({ x: 100, y: 100 }, { x: 100, y: 100 })),
    ).toEqual([])
  })

  it("selects non-box objects with sub-grid marquee intersections", () => {
    expect(
      objectsMatchingSelectionRect([line], {
        x: 60,
        y: 92,
        width: 6,
        height: 6,
      }),
    ).toEqual(["line_tiny_select"])
  })

  it("requires visual boxes to be fully contained", () => {
    expect(
      objectsMatchingSelectionRect([box], {
        x: 120,
        y: 100,
        width: 48,
        height: 48,
      }),
    ).toEqual([])
    expect(
      objectsMatchingSelectionRect([box], {
        x: 90,
        y: 90,
        width: 88,
        height: 68,
      }),
    ).toEqual(["box_full_containment"])
  })
})
