import { distance, pointOnSegment, snapToGrid } from "@circuit-sim/core/circuit/geometry"
import {
  getLocalPins,
  getPinPosts,
} from "@circuit-sim/core/circuit/component-geometry"
import type { LogicInputPosition } from "@circuit-sim/core/circuit/components"
import { getLocalBounds, worldToLocal } from "./component-geometry"
import type { Component, SchematicObject, Point, WireObject } from "@circuit-sim/core/circuit/project"

export const GRID_SIZE = 20
export const SELECT_DRAG_DELAY_MS = 150

export function nextLogicInputPosition(
  component: Extract<Component, { readonly type: "logic-input" }>,
): LogicInputPosition {
  if (!component.props.ternary) return component.props.position === 0 ? 1 : 0
  switch (component.props.position) {
    case 0:
      return 1
    case 1:
      return 2
    case 2:
      return 0
  }
}

export function isLogicInputTogglePoint(
  component: Component,
  worldPoint: Point,
  postTolerance: number,
): boolean {
  if (component.type !== "logic-input") return false
  const local = worldToLocal(component, worldPoint)
  const bounds = getLocalBounds(component)
  return local.x >= -12 &&
    local.x <= bounds.width / 2 &&
    local.y >= -bounds.height / 2 &&
    local.y <= bounds.height / 2 &&
    !getLocalPins(component).some((pin) => distance(local, pin.post) <= postTolerance)
}

export function isSwitchTogglePoint(
  component: Component,
  worldPoint: Point,
  postTolerance: number,
): boolean {
  if (component.type !== "switch") return false
  const local = worldToLocal(component, worldPoint)
  const bounds = getLocalBounds(component)
  const halfWidth = Math.min(28, bounds.width / 2)
  const padding = Math.max(2, Math.min(8, postTolerance / 2))
  return local.x >= -halfWidth - padding &&
    local.x <= halfWidth + padding &&
    local.y >= -30 - padding &&
    local.y <= 14 + padding &&
    !getLocalPins(component).some((pin) => distance(local, pin.post) <= postTolerance)
}

export function hasSelectDragDelayElapsed(
  pointerDownTime: number,
  currentTime: number,
): boolean {
  return currentTime - pointerDownTime >= SELECT_DRAG_DELAY_MS
}

export function nearestConnectionSnapPoint(
  raw: Point,
  objects: ReadonlyArray<SchematicObject>,
  tolerance: number,
): Point | null {
  const explicitSnap = nearestPoint(
    raw,
    explicitConnectionSnapTargets(objects),
    tolerance,
  )
  const wireSnap = nearestWireSegmentSnapPoint(raw, objects, tolerance)

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

function explicitConnectionSnapTargets(objects: ReadonlyArray<SchematicObject>): Point[] {
  return objects.flatMap((object) => {
    if (object.kind === "component") {
      return getPinPosts(object).map((pin) => pin.position)
    }
    if (
      object.kind === "ground" ||
      object.kind === "net-label" ||
      object.kind === "probe"
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
  raw: Point,
  targets: Point[],
  tolerance: number,
): Point | null {
  let best: { point: Point; distance: number } | null = null
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
  raw: Point,
  objects: ReadonlyArray<SchematicObject>,
  tolerance: number,
): Point | null {
  let best: { point: Point; distance: number } | null = null
  for (const wire of objects.filter(
    (object): object is WireObject => object.kind === "wire",
  )) {
    for (let index = 0; index < wire.points.length - 1; index += 1) {
      const start = wire.points[index]
      const end = wire.points[index + 1]
      if (!start || !end) {
        continue
      }
      const candidate = snappedPointOnSegment(raw, start, end)
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
  raw: Point,
  start: Point,
  end: Point,
): Point | null {
  if (start.x === end.x) {
    return {
      x: start.x,
      y: clamp(
        snapCoordinate(raw.y),
        Math.min(start.y, end.y),
        Math.max(start.y, end.y),
      ),
    }
  }
  if (start.y === end.y) {
    return {
      x: clamp(
        snapCoordinate(raw.x),
        Math.min(start.x, end.x),
        Math.max(start.x, end.x),
      ),
      y: start.y,
    }
  }

  const gridPoint = snapToGrid(raw, GRID_SIZE)
  return pointOnSegment(gridPoint, start, end, GRID_SIZE / 4)
    ? gridPoint
    : null
}

function snapCoordinate(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
