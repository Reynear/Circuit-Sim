import { pointOnSegment, pointsEqual, snapToGrid } from "@circuit-sim/core/circuit/geometry"
import type { Point, SchematicObject, WireObject } from "@circuit-sim/core/circuit/project"
import { GRID_SIZE } from "./interaction"

export type WireRouteStyle = "horizontal-first" | "vertical-first" | "straight"
type OrthogonalRouteStyle = Exclude<WireRouteStyle, "straight">

export function splitWireAtPoint(
  wire: WireObject,
  point: Point,
): { afterPointIndex: number; position: Point } | null {
  for (let index = 0; index < wire.points.length - 1; index += 1) {
    const start = wire.points[index]!
    const end = wire.points[index + 1]!
    if (
      !pointsEqual(point, start) &&
      !pointsEqual(point, end) &&
      pointOnSegment(point, start, end)
    ) {
      return { afterPointIndex: index, position: point }
    }
  }
  return null
}

export function routedWirePoints(
  start: Point,
  end: Point,
  style: WireRouteStyle,
): Point[] {
  if (style === "straight" || start.x === end.x || start.y === end.y) {
    return [start, end]
  }
  return style === "vertical-first"
    ? [start, { x: start.x, y: end.y }, end]
    : [start, { x: end.x, y: start.y }, end]
}

export function isRoutedWire(wire: WireObject): boolean {
  return wire.points.every((point, index) => {
    const next = wire.points[index + 1]
    return !next || point.x === next.x || point.y === next.y
  })
}

export function hasConvertibleWires(objects: ReadonlyArray<SchematicObject>): boolean {
  return objects.some((object) => object.kind === "wire" && !isRoutedWire(object))
}

export function convertWireToRoutedWire(
  wire: WireObject,
  style: OrthogonalRouteStyle = "horizontal-first",
): WireObject {
  if (isRoutedWire(wire)) return wire
  const points: Point[] = []
  for (let index = 0; index < wire.points.length - 1; index += 1) {
    append(points, routedWirePoints(wire.points[index]!, wire.points[index + 1]!, style))
  }
  return { ...wire, points }
}

export function rerouteWireVia(
  wire: WireObject,
  via: Point,
  style: OrthogonalRouteStyle = "horizontal-first",
): WireObject {
  const start = wire.points[0]
  const end = wire.points.at(-1)
  if (!start || !end) return wire
  const points: Point[] = []
  append(points, routedWirePoints(start, via, style))
  append(points, routedWirePoints(via, end, style))
  return { ...wire, points }
}

export function getRoutedWireSnapPoint(
  wire: WireObject,
  raw: Point,
): Point | null {
  let best: { point: Point; distance: number } | null = null
  for (let index = 0; index < wire.points.length - 1; index += 1) {
    const start = wire.points[index]!
    const end = wire.points[index + 1]!
    const point = projectToSegment(snapToGrid(raw, GRID_SIZE), start, end)
    const distance = Math.hypot(raw.x - point.x, raw.y - point.y)
    if (!best || distance < best.distance) best = { point, distance }
  }
  return best?.point ?? null
}

function projectToSegment(point: Point, start: Point, end: Point): Point {
  if (start.x === end.x) {
    return { x: start.x, y: clamp(point.y, start.y, end.y) }
  }
  if (start.y === end.y) {
    return { x: clamp(point.x, start.x, end.x), y: start.y }
  }
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return { x: Math.round(start.x + dx * t), y: Math.round(start.y + dy * t) }
}

function clamp(value: number, a: number, b: number): number {
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), value))
}

function append(target: Point[], points: Point[]): void {
  for (const point of points) {
    if (!target.at(-1) || !pointsEqual(target.at(-1)!, point)) target.push(point)
  }
}
