import { hasAnnotationLead, isLeadAnnotationObject } from "./annotations"
import { leadAnnotationBounds } from "./lead-annotation-geometry"
import { getSymbolWorldBounds } from "./symbol-geometry"
import type { SchematicObject, Vec2 } from "./types"

export type SelectionRect = { x: number; y: number; width: number; height: number }

export function rectFromPoints(a: Vec2, b: Vec2): SelectionRect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}

export function objectsMatchingSelectionRect(
  objects: SchematicObject[],
  rect: SelectionRect,
): string[] {
  return rect.width === 0 && rect.height === 0
    ? []
    : objects
        .filter((object) => objectMatchesSelectionRect(object, rect))
        .map((object) => object.id)
}

export function objectMatchesSelectionRect(
  object: SchematicObject,
  rect: SelectionRect,
): boolean {
  const bounds = objectBounds(object)
  if (!bounds) {
    return false
  }
  if (object.kind === "box") {
    return rectContainsRect(rect, bounds)
  }
  return rectIntersectsRect(bounds, rect)
}

export function mergedObjectBounds(objects: SchematicObject[]): SelectionRect | null {
  const bounds = objects
    .map((object) => objectBounds(object))
    .filter((bound): bound is SelectionRect => Boolean(bound))
  if (bounds.length === 0) {
    return null
  }
  const minX = Math.min(...bounds.map((bound) => bound.x))
  const minY = Math.min(...bounds.map((bound) => bound.y))
  const maxX = Math.max(...bounds.map((bound) => bound.x + bound.width))
  const maxY = Math.max(...bounds.map((bound) => bound.y + bound.height))
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

export function objectBounds(object: SchematicObject): SelectionRect | null {
  if (object.kind === "symbol") {
    return getSymbolWorldBounds(object)
  }
  if (object.kind === "wire") {
    const xs = object.points.map((point) => point.x)
    const ys = object.points.map((point) => point.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    return {
      x: minX - 8,
      y: minY - 8,
      width: Math.max(...xs) - minX + 16,
      height: Math.max(...ys) - minY + 16,
    }
  }
  if (object.kind === "line") {
    const minX = Math.min(object.start.x, object.end.x)
    const minY = Math.min(object.start.y, object.end.y)
    return {
      x: minX - 8,
      y: minY - 8,
      width: Math.abs(object.end.x - object.start.x) + 16,
      height: Math.abs(object.end.y - object.start.y) + 16,
    }
  }
  if (object.kind === "box") {
    const minX = Math.min(object.start.x, object.end.x)
    const minY = Math.min(object.start.y, object.end.y)
    return {
      x: minX - 8,
      y: minY - 8,
      width: Math.abs(object.end.x - object.start.x) + 16,
      height: Math.abs(object.end.y - object.start.y) + 16,
    }
  }
  if (isLeadAnnotationObject(object) && hasAnnotationLead(object)) {
    return leadAnnotationBounds(object, 18)
  }
  if ("position" in object) {
    return {
      x: object.position.x - 18,
      y: object.position.y - 18,
      width: 36,
      height: 36,
    }
  }
  return null
}

function rectContainsRect(container: SelectionRect, target: SelectionRect): boolean {
  return (
    target.x >= container.x &&
    target.x + target.width <= container.x + container.width &&
    target.y >= container.y &&
    target.y + target.height <= container.y + container.height
  )
}

function rectIntersectsRect(a: SelectionRect, b: SelectionRect): boolean {
  return !(
    a.x > b.x + b.width ||
    a.x + a.width < b.x ||
    a.y > b.y + b.height ||
    a.y + a.height < b.y
  )
}
