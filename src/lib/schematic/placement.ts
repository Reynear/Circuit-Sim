import { getRequiredComponentDefinition } from "./component-definitions"
import { rotatePoint } from "./geometry"
import { getDefinitionLocalHandlePositions } from "./symbol-geometry"
import { getRequiredSymbolDefinition, type SymbolDefinition } from "./symbols"
import type { Vec2 } from "./types"

export type SymbolPlacement = {
  position: Vec2
  rotation: number
  pinSpacing?: number
  pinSpread?: number
}

export const MIN_GRAPHIC_LINE_LENGTH = 16
export const MIN_GRAPHIC_BOX_SPAN = 32

export function canDragCreateSymbol(componentDefinitionId: string): boolean {
  getRequiredComponentDefinition(componentDefinitionId)
  return true
}

export function getSymbolPlacement(
  componentDefinitionId: string,
  start: Vec2,
  end: Vec2,
  gridSize: number,
): SymbolPlacement | null {
  const component = getRequiredComponentDefinition(componentDefinitionId)
  const symbol = getRequiredSymbolDefinition(component.defaultSymbolId)
  if (pointsEqual(start, end)) {
    return null
  }

  const rotation = normalizeDegrees(
    Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI),
  )
  const pinSpacing = Math.max(
    gridSize,
    Math.hypot(end.x - start.x, end.y - start.y),
  )

  if (symbol.pins.length >= 2) {
    return placementForPrimaryHandles(symbol, start, end, pinSpacing)
  }

  return {
    position: midpoint(start, end),
    rotation,
    pinSpacing,
  }
}

function placementForPrimaryHandles(
  symbol: SymbolDefinition,
  start: Vec2,
  end: Vec2,
  pinSpacing: number,
): SymbolPlacement {
  const [first, second] = getDefinitionLocalHandlePositions(symbol, {
    pinSpacing,
  })
  if (!first || !second) {
    return {
      position: midpoint(start, end),
      rotation: 0,
      pinSpacing,
    }
  }

  const baseDx = second.x - first.x
  const baseDy = second.y - first.y
  const baseLength = Math.hypot(baseDx, baseDy)
  if (baseLength === 0) {
    return {
      position: midpoint(start, end),
      rotation: 0,
      pinSpacing,
    }
  }

  const dragRotation =
    Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI)
  const baseRotation = Math.atan2(baseDy, baseDx) * (180 / Math.PI)
  const rotation = normalizeDegrees(dragRotation - baseRotation)
  const primaryLocalMidpoint = midpoint(first, second)
  const rotatedPrimaryMidpoint = rotatePoint(primaryLocalMidpoint, rotation)
  const primaryWorldMidpoint = midpoint(start, end)

  return {
    position: {
      x: primaryWorldMidpoint.x - rotatedPrimaryMidpoint.x,
      y: primaryWorldMidpoint.y - rotatedPrimaryMidpoint.y,
    },
    rotation,
    pinSpacing,
  }
}

export function canCreateVisualLine(start: Vec2, end: Vec2): boolean {
  return distance(start, end) >= MIN_GRAPHIC_LINE_LENGTH
}

export function canCreateVisualBox(start: Vec2, end: Vec2): boolean {
  return (
    Math.abs(end.x - start.x) >= MIN_GRAPHIC_BOX_SPAN &&
    Math.abs(end.y - start.y) >= MIN_GRAPHIC_BOX_SPAN
  )
}

function midpoint(start: Vec2, end: Vec2): Vec2 {
  return {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  }
}

function distance(start: Vec2, end: Vec2): number {
  return Math.hypot(end.x - start.x, end.y - start.y)
}

function pointsEqual(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360
}
