import { distance, rotatePoint } from "./geometry"
import { getSymbolLocalBounds, getSymbolLocalPins } from "./symbol-geometry"
import type { SymbolObject, Vec2 } from "./types"

type ToggleRect = {
  x: number
  y: number
  width: number
  height: number
}

export function nextSwitchState(symbol: SymbolObject): string | null {
  if (symbol.componentDefinitionId !== "switch") {
    return null
  }
  return symbol.props.state === "closed" ? "open" : "closed"
}

export function isSwitchSymbol(symbol: SymbolObject): boolean {
  return nextSwitchState(symbol) !== null
}

export function getSwitchClosedPinPairs(
  symbol: SymbolObject,
): Array<[string, string]> {
  return symbol.componentDefinitionId === "switch" &&
    symbol.props.state === "closed"
    ? [["pin1", "pin2"]]
    : []
}

export function isSwitchTogglePoint(
  symbol: SymbolObject,
  worldPoint: Vec2,
  postTolerance: number,
): boolean {
  const rect = switchToggleLocalRect(symbol)
  if (!rect) {
    return false
  }

  const localPoint = symbolWorldToLocal(symbol, worldPoint)
  if (
    !pointInRect(localPoint, rect, Math.max(2, Math.min(8, postTolerance / 2)))
  ) {
    return false
  }

  return !getSymbolLocalPins(symbol).some(
    (pin) => distance(localPoint, pin.position) <= postTolerance,
  )
}

function switchToggleLocalRect(symbol: SymbolObject): ToggleRect | null {
  if (symbol.componentDefinitionId !== "switch") {
    return null
  }
  const bounds = getSymbolLocalBounds(symbol)
  const halfBodyWidth = Math.min(28, bounds.width / 2)
  return { x: -halfBodyWidth, y: -30, width: halfBodyWidth * 2, height: 44 }
}

function symbolWorldToLocal(symbol: SymbolObject, point: Vec2): Vec2 {
  const relative = {
    x: point.x - symbol.position.x,
    y: point.y - symbol.position.y,
  }
  const unrotated = rotatePoint(relative, -symbol.rotation)
  return symbol.mirrored ? { x: -unrotated.x, y: unrotated.y } : unrotated
}

function pointInRect(point: Vec2, rect: ToggleRect, padding: number): boolean {
  return (
    point.x >= rect.x - padding &&
    point.x <= rect.x + rect.width + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.height + padding
  )
}
