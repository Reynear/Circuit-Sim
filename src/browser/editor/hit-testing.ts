import { distance } from "@circuit-sim/core/circuit/geometry"
import { getPinPosts } from "@circuit-sim/core/circuit/component-geometry"
import { getWorldBounds } from "./component-geometry"
import type {
  BoxObject,
  LineObject,
  SchematicObject,
  Component,
  Point,
  WireObject,
} from "@circuit-sim/core/circuit/project"

export type HitTarget =
  | { type: "object"; objectId: string }
  | { type: "pin"; objectId: string; pin: string }
  | { type: "wire"; objectId: string }

export const MOUSE_HIT_TOLERANCE = 10

function hitTestComponent(
  point: Point,
  component: Component,
  tolerance = 6,
): boolean {
  const bounds = getWorldBounds(component)
  return (
    point.x >= bounds.x - tolerance &&
    point.x <= bounds.x + bounds.width + tolerance &&
    point.y >= bounds.y - tolerance &&
    point.y <= bounds.y + bounds.height + tolerance
  )
}

export function hitTestObjects(
  point: Point,
  objects: ReadonlyArray<SchematicObject>,
  tolerance = 6,
): HitTarget | null {
  const topmostObjects = [...objects].reverse()
  for (const object of topmostObjects) {
    if (object.kind === "component") {
      const pin = getPinPosts(object).find(
        (candidate) => distance(candidate.position, point) <= tolerance,
      )
      if (pin) {
        return {
          type: "pin",
          objectId: object.id,
          pin: pin.pin,
        }
      }
    }
  }

  let bestHit: { distance: number; target: HitTarget } | null = null
  for (const object of objects) {
    const hitDistance = hitDistanceForObject(point, object, tolerance)
    if (hitDistance === null) {
      continue
    }
    if (!bestHit || hitDistance < bestHit.distance) {
      bestHit = {
        distance: hitDistance,
        target: {
          type: object.kind === "wire" ? "wire" : "object",
          objectId: object.id,
        },
      }
    }
  }

  return bestHit?.target ?? null
}

function hitDistanceForObject(
  point: Point,
  object: SchematicObject,
  tolerance: number,
): number | null {
  if (object.kind === "component") {
    if (!hitTestComponent(point, object, tolerance)) {
      return null
    }
    return distanceToRect(point, getWorldBounds(object))
  }
  if (object.kind === "wire") {
    return hitDistanceForWire(point, object, tolerance)
  }
  if (object.kind === "line") {
    return hitDistanceForLine(point, object, tolerance)
  }
  if (object.kind === "box") {
    return hitDistanceForBox(point, object, tolerance)
  }
  if (
    object.kind === "ground" ||
    object.kind === "probe" ||
    object.kind === "net-label" ||
    object.kind === "text"
  ) {
    const hitDistance = distance(point, object.position)
    return hitDistance <= tolerance ? hitDistance : null
  }
  return null
}

function hitDistanceForWire(
  point: Point,
  wire: WireObject,
  tolerance: number,
): number | null {
  const hitDistance = wire.points.reduce<number | null>((best, segmentStart, index) => {
    const segmentEnd = wire.points[index + 1]
    if (!segmentEnd) {
      return best
    }
    const segmentDistance = distanceToSegment(point, segmentStart, segmentEnd)
    return best === null ? segmentDistance : Math.min(best, segmentDistance)
  }, null)
  return hitDistance !== null && hitDistance <= tolerance ? hitDistance : null
}

function hitDistanceForLine(
  point: Point,
  line: LineObject,
  tolerance: number,
): number | null {
  const hitDistance = distanceToSegment(point, line.start, line.end)
  return hitDistance <= tolerance ? hitDistance : null
}

function hitDistanceForBox(
  point: Point,
  box: BoxObject,
  tolerance: number,
): number | null {
  const left = Math.min(box.start.x, box.end.x)
  const right = Math.max(box.start.x, box.end.x)
  const top = Math.min(box.start.y, box.end.y)
  const bottom = Math.max(box.start.y, box.end.y)
  const corners = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ]
  const hitDistance = corners.reduce<number>((best, corner, index) => {
    const next = corners[(index + 1) % corners.length]
    return next
      ? Math.min(best, distanceToSegment(point, corner, next))
      : best
  }, Number.POSITIVE_INFINITY)
  return hitDistance <= tolerance ? hitDistance : null
}

function distanceToRect(
  point: Point,
  rect: { x: number; y: number; width: number; height: number },
): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width))
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height))
  return Math.hypot(dx, dy)
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    return distance(point, start)
  }
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  )
  return distance(point, {
    x: start.x + t * dx,
    y: start.y + t * dy,
  })
}
