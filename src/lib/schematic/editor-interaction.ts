import { distance, pointOnSegment, snapToGrid } from "./geometry"
import { getSymbolPinWorldPositions } from "./transforms"
import type { SchematicObject, Vec2, WireObject } from "./types"

export const SELECT_DRAG_DELAY_MS = 150

export function hasSelectDragDelayElapsed(
  pointerDownTime: number,
  currentTime: number,
): boolean {
  return currentTime - pointerDownTime >= SELECT_DRAG_DELAY_MS
}

export function nearestConnectionSnapPoint(
  raw: Vec2,
  objects: SchematicObject[],
  {
    gridSize,
    tolerance,
  }: {
    gridSize: number
    tolerance: number
  },
): Vec2 | null {
  const explicitSnap = nearestPoint(
    raw,
    explicitConnectionSnapTargets(objects),
    tolerance,
  )
  const wireSnap = nearestWireSegmentSnapPoint(raw, objects, gridSize, tolerance)

  if (!explicitSnap) {
    return wireSnap
  }
  if (!wireSnap) {
    return explicitSnap
  }
  return distance(raw, explicitSnap) <= distance(raw, wireSnap)
    ? explicitSnap
    : wireSnap
}

function explicitConnectionSnapTargets(objects: SchematicObject[]): Vec2[] {
  return objects.flatMap((object) => {
    if (object.kind === "symbol") {
      return getSymbolPinWorldPositions(object).map((pin) => pin.position)
    }
    if (
      object.kind === "ground" ||
      object.kind === "net-label" ||
      object.kind === "probe" ||
      object.kind === "junction"
    ) {
      return [object.position]
    }
    if (object.kind === "wire") {
      return object.points
    }
    return []
  })
}

function nearestPoint(
  raw: Vec2,
  targets: Vec2[],
  tolerance: number,
): Vec2 | null {
  let best: { point: Vec2; distance: number } | null = null
  for (const target of targets) {
    const candidateDistance = distance(raw, target)
    if (candidateDistance > tolerance) {
      continue
    }
    if (!best || candidateDistance < best.distance) {
      best = { point: target, distance: candidateDistance }
    }
  }
  return best?.point ?? null
}

function nearestWireSegmentSnapPoint(
  raw: Vec2,
  objects: SchematicObject[],
  gridSize: number,
  tolerance: number,
): Vec2 | null {
  let best: { point: Vec2; distance: number } | null = null
  for (const wire of objects.filter(
    (object): object is WireObject => object.kind === "wire",
  )) {
    for (let index = 0; index < wire.points.length - 1; index += 1) {
      const start = wire.points[index]
      const end = wire.points[index + 1]
      if (!start || !end) {
        continue
      }
      const candidate = snappedPointOnSegment(raw, start, end, gridSize)
      if (!candidate) {
        continue
      }
      const candidateDistance = distance(raw, candidate)
      if (candidateDistance > tolerance) {
        continue
      }
      if (!best || candidateDistance < best.distance) {
        best = { point: candidate, distance: candidateDistance }
      }
    }
  }
  return best?.point ?? null
}

function snappedPointOnSegment(
  raw: Vec2,
  start: Vec2,
  end: Vec2,
  gridSize: number,
): Vec2 | null {
  if (start.x === end.x) {
    return {
      x: start.x,
      y: clamp(
        snapCoordinate(raw.y, gridSize),
        Math.min(start.y, end.y),
        Math.max(start.y, end.y),
      ),
    }
  }
  if (start.y === end.y) {
    return {
      x: clamp(
        snapCoordinate(raw.x, gridSize),
        Math.min(start.x, end.x),
        Math.max(start.x, end.x),
      ),
      y: start.y,
    }
  }

  const gridPoint = snapToGrid(raw, gridSize)
  return pointOnSegment(gridPoint, start, end, gridSize / 4)
    ? gridPoint
    : null
}

function snapCoordinate(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
