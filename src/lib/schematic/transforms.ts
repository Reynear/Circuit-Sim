import { rotatePoint } from "./geometry"
import {
  getSymbolLocalHandlePosts,
  getSymbolLocalPins,
} from "./symbol-geometry"
import type { SymbolObject, Vec2 } from "./types"

export type SymbolPinWorldPosition = {
  symbolObjectId: string
  componentDefinitionId: string
  refdes: string
  symbolPinId: string
  componentPinId: string
  position: Vec2
}

export function transformSymbolPoint(symbol: SymbolObject, point: Vec2): Vec2 {
  const mirroredPoint = symbol.mirrored ? { x: -point.x, y: point.y } : point
  const rotated = rotatePoint(mirroredPoint, symbol.rotation)
  return {
    x: symbol.position.x + rotated.x,
    y: symbol.position.y + rotated.y,
  }
}

export function getSymbolPinWorldPositions(
  symbol: SymbolObject,
): SymbolPinWorldPosition[] {
  return getSymbolLocalPins(symbol).map((pin) => ({
    symbolObjectId: symbol.id,
    componentDefinitionId: symbol.componentDefinitionId,
    refdes: symbol.refdes,
    symbolPinId: pin.id,
    componentPinId: pin.componentPinId,
    position: transformSymbolPoint(symbol, pin.position),
  }))
}

export function getSymbolHandleWorldPositions(
  symbol: SymbolObject,
): SymbolPinWorldPosition[] {
  return getSymbolLocalHandlePosts(symbol).map((handle) => ({
    symbolObjectId: symbol.id,
    componentDefinitionId: symbol.componentDefinitionId,
    refdes: symbol.refdes,
    symbolPinId: handle.id,
    componentPinId: handle.componentPinId,
    position: transformSymbolPoint(symbol, handle.position),
  }))
}

export function getSymbolPinWorldPosition(
  symbol: SymbolObject,
  componentPinId: string,
): Vec2 | null {
  return (
    getSymbolPinWorldPositions(symbol).find(
      (pin) => pin.componentPinId === componentPinId,
    )?.position ?? null
  )
}
