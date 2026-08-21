import { rotatePoint } from "./geometry"
import { getRequiredSymbolDefinition, type SymbolDefinition } from "./symbols"
import type { SymbolObject, Vec2 } from "./types"

export type SymbolPinGeometry = SymbolDefinition["pins"][number]
export type SymbolHandleGeometry = {
  id: string
  componentPinId: string
  position: Vec2
}

export const SYMBOL_HANDLE_START_COMPONENT_PIN_ID = "__handle1"
export const SYMBOL_HANDLE_END_COMPONENT_PIN_ID = "__handle2"

export function getSymbolLocalPins(symbol: SymbolObject): SymbolPinGeometry[] {
  const definition = getRequiredSymbolDefinition(symbol.symbolDefinitionId)
  if (!symbol.pinSpacing && !symbol.pinSpread) {
    return definition.pins
  }
  if (isOneTerminalSymbol(definition)) {
    const [pin] = definition.pins
    if (!pin) {
      return definition.pins
    }
    const pinSpacing = symbol.pinSpacing ?? getDefaultPinSpacing(definition)
    return [{ ...pin, position: scaleOneTerminalPin(pin.position, pinSpacing) }]
  }
  if (!isHorizontalTwoPostSymbol(definition)) {
    return transformPinsForCustomSpacing(
      definition,
      definition.pins,
      getDefinitionLocalHandlePositions(definition),
      symbol.pinSpacing,
      symbol.pinSpread,
    )
  }

  const halfSpacing = (symbol.pinSpacing ?? getDefaultPinSpacing(definition)) / 2
  return definition.pins.map((pin) => ({
    ...pin,
    position: {
      x: pin.position.x < 0 ? -halfSpacing : halfSpacing,
      y: pin.position.y,
    },
  }))
}

export function getDefinitionLocalHandlePositions(
  definition: SymbolDefinition,
  options: { pinSpacing?: number; pinSpread?: number } = {},
): Vec2[] {
  const defaultHandlePositions = handlePostsForPins(definition.pins).map(
    (handle) => handle.position,
  )
  if (options.pinSpacing === undefined && options.pinSpread === undefined) {
    return defaultHandlePositions
  }
  if (isOneTerminalSymbol(definition)) {
    const [pin] = definition.pins
    return pin
      ? [
          scaleOneTerminalPin(
            pin.position,
            options.pinSpacing ?? getDefaultPinSpacing(definition),
          ),
        ]
      : defaultHandlePositions
  }
  if (isHorizontalTwoPostSymbol(definition)) {
    const halfSpacing = (options.pinSpacing ?? getDefaultPinSpacing(definition)) / 2
    return definition.pins.map((pin) => ({
      x: pin.position.x < 0 ? -halfSpacing : halfSpacing,
      y: pin.position.y,
    }))
  }
  return handlePostsForPins(
    transformPinsForCustomSpacing(
      definition,
      definition.pins,
      defaultHandlePositions,
      options.pinSpacing,
      options.pinSpread,
    ),
  ).map((handle) => handle.position)
}

export function getSymbolLocalHandlePosts(
  symbol: SymbolObject,
): SymbolHandleGeometry[] {
  return handlePostsForPins(getSymbolLocalPins(symbol))
}

export function isSyntheticSymbolHandle(componentPinId: string): boolean {
  return (
    componentPinId === SYMBOL_HANDLE_START_COMPONENT_PIN_ID ||
    componentPinId === SYMBOL_HANDLE_END_COMPONENT_PIN_ID
  )
}

export function getSymbolLocalBounds(symbol: SymbolObject): {
  x: number
  y: number
  width: number
  height: number
} {
  const definition = getRequiredSymbolDefinition(symbol.symbolDefinitionId)
  const localPins = getSymbolLocalPins(symbol)
  const bodyWidth = Math.max(definition.width, symbol.pinSpacing ?? definition.width)
  const xs = [
    bodyWidth / -2,
    bodyWidth / 2,
    ...localPins.map((pin) => pin.position.x),
  ]
  const ys = [
    definition.height / -2,
    definition.height / 2,
    ...localPins.map((pin) => pin.position.y),
  ]
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

export function getSymbolWorldBounds(symbol: SymbolObject): {
  x: number
  y: number
  width: number
  height: number
} {
  const localBounds = getSymbolLocalBounds(symbol)
  const corners = [
    { x: localBounds.x, y: localBounds.y },
    { x: localBounds.x + localBounds.width, y: localBounds.y },
    {
      x: localBounds.x + localBounds.width,
      y: localBounds.y + localBounds.height,
    },
    { x: localBounds.x, y: localBounds.y + localBounds.height },
  ].map((point) => {
    const mirroredPoint = symbol.mirrored ? { x: -point.x, y: point.y } : point
    const rotated = rotatePoint(mirroredPoint, symbol.rotation)
    return {
      x: symbol.position.x + rotated.x,
      y: symbol.position.y + rotated.y,
    }
  })
  const xs = corners.map((corner) => corner.x)
  const ys = corners.map((corner) => corner.y)
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

export function isHorizontalTwoPostSymbol(
  definition: SymbolDefinition,
): boolean {
  if (definition.pins.length !== 2) {
    return false
  }
  const [first, second] = definition.pins
  return Boolean(
    first &&
      second &&
      first.position.y === second.position.y &&
      isHorizontalOrientation(first.orientation) &&
      isHorizontalOrientation(second.orientation) &&
      first.orientation !== second.orientation,
  )
}

export function isOneTerminalSymbol(definition: SymbolDefinition): boolean {
  const [pin] = definition.pins
  return Boolean(
    definition.pins.length === 1 &&
      pin &&
      (pin.position.x !== 0 || pin.position.y !== 0),
  )
}

export function getDefaultPinSpacing(definition: SymbolDefinition): number {
  if (!isHorizontalTwoPostSymbol(definition)) {
    if (isOneTerminalSymbol(definition)) {
      const [pin] = definition.pins
      return pin ? Math.hypot(pin.position.x, pin.position.y) : definition.width
    }
    const [first, second] = getDefinitionLocalHandlePositions(definition)
    return first && second
      ? Math.hypot(
          second.x - first.x,
          second.y - first.y,
        )
      : definition.width
  }
  const [first, second] = definition.pins
  if (!first || !second) {
    return definition.width
  }
  return Math.abs(second.position.x - first.position.x)
}

export function pointsForLocalPins(symbol: SymbolObject): Vec2[] {
  return getSymbolLocalPins(symbol).map((pin) => pin.position)
}

function isHorizontalOrientation(
  orientation: SymbolPinGeometry["orientation"],
): boolean {
  return orientation === "left" || orientation === "right"
}

function scaleOneTerminalPin(pinPosition: Vec2, pinSpacing: number): Vec2 {
  const length = Math.hypot(pinPosition.x, pinPosition.y)
  if (length === 0) {
    return pinPosition
  }
  return {
    x: (pinPosition.x / length) * pinSpacing,
    y: (pinPosition.y / length) * pinSpacing,
  }
}

function transformPinsForCustomSpacing(
  definition: SymbolDefinition,
  pins: SymbolPinGeometry[],
  handlePositions: Vec2[],
  pinSpacing: number | undefined,
  pinSpread: number | undefined,
): SymbolPinGeometry[] {
  const [first, second] = handlePositions
  if (!first || !second) {
    return pins
  }
  const dx = second.x - first.x
  const dy = second.y - first.y
  const baseLength = Math.hypot(dx, dy)
  if (baseLength === 0) {
    return pins
  }

  if (hasFixedBodyControlLead(definition.renderKind)) {
    return transformFixedBodyControlLeadPins(
      pins,
      first,
      second,
      pinSpacing ?? baseLength,
    )
  }

  const axis = {
    x: dx / baseLength,
    y: dy / baseLength,
  }
  const midpoint = {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  }
  const alongScale = pinSpacing === undefined ? 1 : pinSpacing / baseLength
  const baseSpread = Math.max(
    ...pins.map((pin) => {
      const relative = {
        x: pin.position.x - first.x,
        y: pin.position.y - first.y,
      }
      return Math.abs(relative.x * -axis.y + relative.y * axis.x)
    }),
  )
  const spreadScale =
    pinSpread === undefined || baseSpread === 0 ? 1 : pinSpread / baseSpread

  return pins.map((pin) => {
    const relative = {
      x: pin.position.x - midpoint.x,
      y: pin.position.y - midpoint.y,
    }
    const along = relative.x * axis.x + relative.y * axis.y
    const perpendicular = {
      x: (relative.x - along * axis.x) * spreadScale,
      y: (relative.y - along * axis.y) * spreadScale,
    }
    return {
      ...pin,
      position: {
        x: midpoint.x + perpendicular.x + along * alongScale * axis.x,
        y: midpoint.y + perpendicular.y + along * alongScale * axis.y,
      },
    }
  })
}

function transformFixedBodyControlLeadPins(
  pins: SymbolPinGeometry[],
  startHandle: Vec2,
  endHandle: Vec2,
  pinSpacing: number,
): SymbolPinGeometry[] {
  const dx = endHandle.x - startHandle.x
  const dy = endHandle.y - startHandle.y
  const baseLength = Math.hypot(dx, dy)
  if (baseLength === 0) {
    return pins
  }

  const axis = {
    x: dx / baseLength,
    y: dy / baseLength,
  }
  const nextStart = {
    x: endHandle.x - axis.x * pinSpacing,
    y: endHandle.y - axis.y * pinSpacing,
  }
  const delta = {
    x: nextStart.x - startHandle.x,
    y: nextStart.y - startHandle.y,
  }
  const startProjection = projectOntoAxis(startHandle, axis)
  return pins.map((pin) =>
    nearlyEqual(projectOntoAxis(pin.position, axis), startProjection)
      ? {
          ...pin,
          position: {
            x: pin.position.x + delta.x,
            y: pin.position.y + delta.y,
          },
        }
      : pin,
  )
}

function handlePostsForPins(
  pins: SymbolPinGeometry[],
): SymbolHandleGeometry[] {
  if (pins.length <= 2) {
    return pins.map((pin) => ({
      id: pin.id,
      componentPinId: pin.componentPinId,
      position: pin.position,
    }))
  }

  const axis = primaryHandleAxis(pins.map((pin) => pin.position))
  const coordinates = pins.map((pin) => pin.position[axis])
  const startCoordinate = Math.min(...coordinates)
  const endCoordinate = Math.max(...coordinates)
  if (startCoordinate === endCoordinate) {
    return pins.slice(0, 2).map((pin) => ({
      id: pin.id,
      componentPinId: pin.componentPinId,
      position: pin.position,
    }))
  }

  // Falstad edits multi-terminal parts through two virtual endpoints.
  const startPins = pins.filter((pin) => pin.position[axis] === startCoordinate)
  const endPins = pins.filter((pin) => pin.position[axis] === endCoordinate)
  return [
    {
      id: "handle1",
      componentPinId: SYMBOL_HANDLE_START_COMPONENT_PIN_ID,
      position: averagePosition(startPins),
    },
    {
      id: "handle2",
      componentPinId: SYMBOL_HANDLE_END_COMPONENT_PIN_ID,
      position: averagePosition(endPins),
    },
  ]
}

function hasFixedBodyControlLead(kind: SymbolDefinition["renderKind"]): boolean {
  return (
    kind === "npn-transistor" ||
    kind === "pnp-transistor" ||
    kind === "n-mosfet" ||
    kind === "p-mosfet"
  )
}

function primaryHandleAxis(points: Vec2[]): "x" | "y" {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys)
    ? "x"
    : "y"
}

function projectOntoAxis(point: Vec2, axis: Vec2): number {
  return point.x * axis.x + point.y * axis.y
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001
}

function averagePosition(pins: SymbolPinGeometry[]): Vec2 {
  return {
    x: pins.reduce((sum, pin) => sum + pin.position.x, 0) / pins.length,
    y: pins.reduce((sum, pin) => sum + pin.position.y, 0) / pins.length,
  }
}
