import { pointOnSegment, rotatePoint, snapToGrid } from "@circuit-sim/core/circuit/geometry"

describe("geometry", () => {
  it("snaps points to the grid", () => {
    expect(snapToGrid({ x: 23, y: 36 }, 20)).toEqual({ x: 20, y: 40 })
  })

  it("detects points on a segment", () => {
    expect(pointOnSegment({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 20, y: 0 })).toBe(
      true,
    )
    expect(pointOnSegment({ x: 10, y: 5 }, { x: 0, y: 0 }, { x: 20, y: 0 }, 1)).toBe(
      false,
    )
  })

  it("rotates points in 90 degree increments", () => {
    expect(rotatePoint({ x: 10, y: 5 }, 90)).toEqual({ x: -5, y: 10 })
    expect(rotatePoint({ x: 10, y: 5 }, 180)).toEqual({ x: -10, y: -5 })
  })
})
