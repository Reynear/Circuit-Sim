import { getSymbolLocalPins } from "./symbol-geometry"
import {
  getRequiredSymbolDefinition,
  type SymbolDefinition,
} from "./symbols"
import type { SymbolObject, Vec2 } from "./types"

type SymbolPin = SymbolDefinition["pins"][number]

export type SymbolPinLeadSegment = {
  symbolPinId: string
  componentPinId: string
  start: Vec2
  end: Vec2
}

export function getSymbolPinLeadSegments(
  symbol: SymbolObject,
): SymbolPinLeadSegment[] {
  const definition = getRequiredSymbolDefinition(symbol.symbolDefinitionId)
  return getSymbolLocalPins(symbol).map((pin) => ({
    symbolPinId: pin.id,
    componentPinId: pin.componentPinId,
    start: pin.position,
    end: leadBodyContact(definition.renderKind, pin),
  }))
}

function leadBodyContact(
  kind: SymbolDefinition["renderKind"],
  pin: SymbolPin,
): Vec2 {
  switch (kind) {
    case "capacitor":
      return horizontalContact(pin, -10, 10)
    case "inductor":
      return horizontalContact(pin, -24, 24)
    case "switch":
      return horizontalContact(pin, -22, 22)
    case "dc-source":
    case "sine-source":
    case "current-source":
      return horizontalContact(pin, -24, 24)
    case "diode":
    case "led":
      return horizontalContact(pin, -18, 16)
    case "potentiometer":
      return potentiometerContact(pin)
    case "npn-transistor":
    case "pnp-transistor":
      return transistorContact(pin)
    case "n-mosfet":
      return mosfetContact(pin, false)
    case "p-mosfet":
      return mosfetContact(pin, true)
    case "ideal-op-amp-minus-top":
      return opAmpContact(pin)
    case "logic-input":
    case "logic-output":
    case "and-gate":
    case "or-gate":
      return rectContact(pin, -24, 24, -26, 26)
    case "inverter":
      return horizontalContact(pin, -24, 19)
    case "resistor":
      return horizontalContact(pin, -22, 22)
  }
}

function horizontalContact(pin: SymbolPin, leftX: number, rightX: number): Vec2 {
  return {
    x: pin.orientation === "right" ? rightX : leftX,
    y: pin.position.y,
  }
}

function potentiometerContact(pin: SymbolPin): Vec2 {
  if (pin.orientation === "up") {
    return { x: 0, y: -26 }
  }
  return horizontalContact(pin, -22, 22)
}

function transistorContact(pin: SymbolPin): Vec2 {
  if (pin.id === "collector") {
    return { x: 18, y: -32 }
  }
  if (pin.id === "emitter") {
    return { x: 18, y: 32 }
  }
  return { x: -18, y: 0 }
}

function mosfetContact(pin: SymbolPin, pChannel: boolean): Vec2 {
  if (pin.id === "drain") {
    return { x: 22, y: -32 }
  }
  if (pin.id === "source") {
    return { x: 22, y: 32 }
  }
  return { x: pChannel ? -33 : -18, y: 0 }
}

function opAmpContact(pin: SymbolPin): Vec2 {
  switch (pin.id) {
    case "minus":
      return { x: -28, y: -18 }
    case "plus":
      return { x: -28, y: 18 }
    case "output":
      return { x: 42, y: 0 }
    case "vplus":
      return { x: 0, y: -19.2 }
    case "vminus":
      return { x: 0, y: 19.2 }
    default:
      return pin.position
  }
}

function rectContact(
  pin: SymbolPin,
  leftX: number,
  rightX: number,
  topY: number,
  bottomY: number,
): Vec2 {
  switch (pin.orientation) {
    case "left":
      return { x: leftX, y: pin.position.y }
    case "right":
      return { x: rightX, y: pin.position.y }
    case "up":
      return { x: pin.position.x, y: topY }
    case "down":
      return { x: pin.position.x, y: bottomY }
  }
}
