import { describe, expect, it } from "vitest"
import {
  GRABBED_HANDLE_SIZE,
  ovalMarker,
  squareMarker,
} from "@/browser/editor/post-markers"

describe("squareMarker", () => {
  it("matches CircuitJS fillRect geometry for normal and grabbed handles", () => {
    expect(squareMarker({ x: 120, y: 80 })).toEqual({
      x: 117,
      y: 77,
      width: 7,
      height: 7,
    })
    expect(
      squareMarker({ x: 120, y: 80 }, GRABBED_HANDLE_SIZE),
    ).toEqual({
      x: 116,
      y: 76,
      width: 9,
      height: 9,
    })
  })

  it("matches CircuitJS fillOval geometry for post dots", () => {
    expect(ovalMarker({ x: 120, y: 80 })).toEqual({
      cx: 120.5,
      cy: 80.5,
      rx: 3.5,
      ry: 3.5,
    })
    expect(ovalMarker({ x: 120, y: 80 }, 9)).toEqual({
      cx: 120.5,
      cy: 80.5,
      rx: 4.5,
      ry: 4.5,
    })
  })
})
