import type { Vec2 } from "./types"

export function snapToGrid(point: Vec2, gridSize: number): Vec2 {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  }
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function normalizeDegrees(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360
  return cleanNumber(normalized)
}

export function rotatePoint(point: Vec2, degrees: number): Vec2 {
  const normalized = normalizeDegrees(degrees)
  if (normalized === 0) {
    return { ...point }
  }
  if (normalized === 90) {
    return { x: -point.y, y: point.x }
  }
  if (normalized === 180) {
    return { x: -point.x, y: -point.y }
  }
  if (normalized === 270) {
    return { x: point.y, y: -point.x }
  }

  const radians = (normalized * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    x: cleanNumber(point.x * cos - point.y * sin),
    y: cleanNumber(point.x * sin + point.y * cos),
  }
}

export function pointsEqual(a: Vec2, b: Vec2, tolerance = 0.001): boolean {
  return distance(a, b) <= tolerance
}

export function pointOnSegment(
  point: Vec2,
  a: Vec2,
  b: Vec2,
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

function cleanNumber(value: number): number {
  const rounded = Number(value.toFixed(9))
  return Object.is(rounded, -0) ? 0 : rounded
}
