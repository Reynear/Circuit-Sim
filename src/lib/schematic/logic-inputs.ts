import { distance, rotatePoint } from "./geometry"
import {
  getSymbolLocalBounds,
  getSymbolLocalPins,
} from "./symbol-geometry"
import type { SymbolObject, Vec2 } from "./types"

export function nextLogicInputPosition(
  symbol: SymbolObject,
): string | null {
  if (symbol.componentDefinitionId !== "logic-input") {
    return null
  }
  const current = Number.parseInt(String(symbol.props.position ?? "0"), 10)
  const position = Number.isFinite(current) ? current : 0
  const count = symbol.props.ternary === "true" ? 3 : 2
  return String((position + 1) % count)
}

export function isLogicInputMomentary(symbol: SymbolObject): boolean {
  return symbol.componentDefinitionId === "logic-input" && symbol.props.momentary === "true"
}

export function isLogicInputTogglePoint(
  symbol: SymbolObject,
  worldPoint: Vec2,
  postTolerance: number,
): boolean {
  if (symbol.componentDefinitionId !== "logic-input") {
    return false
  }
  const localPoint = symbolWorldToLocal(symbol, worldPoint)
  const bounds = getSymbolLocalBounds(symbol)
  const inBody =
    localPoint.x >= -12 &&
    localPoint.x <= bounds.width / 2 &&
    localPoint.y >= -bounds.height / 2 &&
    localPoint.y <= bounds.height / 2

  if (!inBody) {
    return false
  }

  return !getSymbolLocalPins(symbol).some(
    (pin) => distance(localPoint, pin.position) <= postTolerance,
  )
}

function symbolWorldToLocal(symbol: SymbolObject, point: Vec2): Vec2 {
  const relative = {
    x: point.x - symbol.position.x,
    y: point.y - symbol.position.y,
  }
  const unrotated = rotatePoint(relative, inverseRotation(symbol.rotation))
  return symbol.mirrored ? { x: -unrotated.x, y: unrotated.y } : unrotated
}

function inverseRotation(rotation: SymbolObject["rotation"]): SymbolObject["rotation"] {
  return -rotation
}
