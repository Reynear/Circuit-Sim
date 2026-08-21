import {
  getSymbolHandleWorldPositions,
  getSymbolPinWorldPositions,
  type SymbolPinWorldPosition,
} from "./transforms"
import { isOneTerminalSymbol } from "./symbol-geometry"
import { getRequiredSymbolDefinition } from "./symbols"
import type { SchematicObject, SymbolObject, Vec2, WireObject } from "./types"

export type VisiblePost = {
  key: string
  kind: "annotation" | "post"
  position: Vec2
}

type CountedPost = {
  count: number
  hasAnnotation: boolean
  order: number
  position: Vec2
}

export function getVisiblePosts(
  objects: SchematicObject[],
): VisiblePost[] {
  const countedPosts = new Map<string, CountedPost>()

  objects.forEach((object, objectIndex) => {
    for (const post of postPositionsForObject(object)) {
      const key = postKey(post.position)
      const current = countedPosts.get(key)
      countedPosts.set(key, {
        count: (current?.count ?? 0) + 1,
        hasAnnotation: Boolean(current?.hasAnnotation || post.kind === "annotation"),
        order: current?.order ?? objectIndex,
        position: current?.position ?? post.position,
      })
    }
  })

  return [...countedPosts.entries()]
    .filter(([, post]) => post.count !== 2)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([key, post]) => ({
      key,
      kind: post.hasAnnotation ? "annotation" : "post",
      position: post.position,
    }))
}

export function getWirePostIndexes(wire: WireObject): number[] {
  if (wire.points.length === 0) {
    return []
  }
  if (wire.points.length === 1) {
    return [0]
  }
  return [0, wire.points.length - 1]
}

export function getPrimarySymbolPosts(
  symbol: SymbolObject,
): SymbolPinWorldPosition[] {
  return getSymbolHandleWorldPositions(symbol).slice(0, 2)
}

export function getTemporarySymbolHandlePositions(
  symbol: SymbolObject,
): Vec2[] {
  const primaryPositions = getPrimarySymbolPosts(symbol).map(
    (post) => post.position,
  )
  if (!isOneTerminalSymbol(getRequiredSymbolDefinition(symbol.symbolDefinitionId))) {
    return primaryPositions
  }
  if (primaryPositions.some((position) => pointsEqual(position, symbol.position))) {
    return primaryPositions
  }
  return [...primaryPositions, symbol.position]
}

export function getNormalSymbolHandlePosts(
  symbol: SymbolObject,
): SymbolPinWorldPosition[] {
  return getPrimarySymbolPosts(symbol).slice(
    0,
    getNormalSymbolHandleCount(symbol),
  )
}

function postPositionsForObject(
  object: SchematicObject,
): Array<{ kind: "annotation" | "post"; position: Vec2 }> {
  if (object.kind === "symbol") {
    return getSymbolPinWorldPositions(object).map((pin) => ({
      kind: "post",
      position: pin.position,
    }))
  }
  if (object.kind === "wire") {
    return getWirePostIndexes(object).flatMap((index) => {
      const position = object.points[index]
      return position ? [{ kind: "post", position }] : []
    })
  }
  if (
    object.kind === "junction" ||
    object.kind === "ground" ||
    object.kind === "net-label" ||
    object.kind === "probe"
  ) {
    return [{ kind: "annotation", position: object.position }]
  }
  return []
}

function postKey(position: Vec2): string {
  return `${position.x}:${position.y}`
}

function pointsEqual(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y
}

function getNormalSymbolHandleCount(symbol: SymbolObject): 0 | 1 | 2 {
  return getSymbolPinWorldPositions(symbol).length > 1 ? 2 : 1
}
