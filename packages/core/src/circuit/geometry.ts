import type { Point } from "./project"

export function snapToGrid(point: Point, gridSize: number): Point {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  }
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function rotatePoint(point: Point, degrees: number): Point {
  switch (((degrees % 360) + 360) % 360) {
    case 0:
      return { ...point }
    case 90:
      return { x: -point.y, y: point.x }
    case 180:
      return { x: -point.x, y: -point.y }
    case 270:
      return { x: point.y, y: -point.x }
    default:
      throw new Error("Schematic rotations must be quarter turns")
  }
}

export function pointsEqual(a: Point, b: Point, tolerance = 0.001): boolean {
  return distance(a, b) <= tolerance
}

export function pointOnSegment(
  point: Point,
  a: Point,
  b: Point,
  tolerance = 0.001,
): boolean {
  const segmentLength = distance(a, b)
  if (segmentLength <= tolerance) {
    return pointsEqual(point, a, tolerance)
  }

  const cross =
    (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y)
  if (Math.abs(cross) / segmentLength > tolerance) {
    return false
  }

  const dot =
    (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)
  if (dot < -tolerance) {
    return false
  }

  return dot <= segmentLength * segmentLength + tolerance
}
