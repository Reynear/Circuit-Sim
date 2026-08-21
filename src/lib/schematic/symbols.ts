import type { Vec2 } from "./types"

export type SymbolDefinition = {
  id: string
  displayName: string
  width: number
  height: number
  pins: Array<{
    id: string
    componentPinId: string
    position: Vec2
    orientation: "left" | "right" | "up" | "down"
  }>
  renderKind:
    | "resistor"
    | "capacitor"
    | "inductor"
    | "switch"
    | "potentiometer"
    | "dc-source"
    | "sine-source"
    | "current-source"
    | "diode"
    | "led"
    | "npn-transistor"
    | "pnp-transistor"
    | "n-mosfet"
    | "p-mosfet"
    | "ideal-op-amp-minus-top"
    | "logic-input"
    | "logic-output"
    | "and-gate"
    | "or-gate"
    | "inverter"
}

type SymbolPin = SymbolDefinition["pins"][number]

function pin(
  id: string,
  componentPinId: string,
  position: Vec2,
  orientation: SymbolPin["orientation"],
): SymbolPin {
  return { id, componentPinId, position, orientation }
}

const horizontalTwoPin = [
  pin("left", "pin1", { x: -40, y: 0 }, "left"),
  pin("right", "pin2", { x: 40, y: 0 }, "right"),
]

const sourcePins = [
  pin("positive", "pin1", { x: -40, y: 0 }, "left"),
  pin("negative", "pin2", { x: 40, y: 0 }, "right"),
]

const potentiometerPins = [
  pin("left", "pin1", { x: -40, y: 0 }, "left"),
  pin("wiper", "pin2", { x: 0, y: -44 }, "up"),
  pin("right", "pin3", { x: 40, y: 0 }, "right"),
]

const transistorPins = [
  pin("base", "pin1", { x: -40, y: 0 }, "left"),
  pin("collector", "pin2", { x: 32, y: -32 }, "right"),
  pin("emitter", "pin3", { x: 32, y: 32 }, "right"),
]

const fetPins = [
  pin("gate", "pin1", { x: -40, y: 0 }, "left"),
  pin("drain", "pin2", { x: 32, y: -32 }, "right"),
  pin("source", "pin3", { x: 32, y: 32 }, "right"),
]

const opAmpPins = [
  pin("minus", "pin1", { x: -48, y: -18 }, "left"),
  pin("plus", "pin2", { x: -48, y: 18 }, "left"),
  pin("output", "pin3", { x: 56, y: 0 }, "right"),
  pin("vplus", "pin4", { x: 0, y: -40 }, "up"),
  pin("vminus", "pin5", { x: 0, y: 40 }, "down"),
]

const logicInputPins = [pin("out", "pin1", { x: 36, y: 0 }, "right")]
const logicOutputPins = [pin("in", "pin1", { x: -36, y: 0 }, "left")]

const gatePins = [
  pin("a", "pin1", { x: -44, y: -16 }, "left"),
  pin("b", "pin2", { x: -44, y: 16 }, "left"),
  pin("y", "pin3", { x: 44, y: 0 }, "right"),
]

export const symbolDefinitions: SymbolDefinition[] = [
  {
    id: "resistor",
    displayName: "Resistor",
    width: 80,
    height: 36,
    pins: horizontalTwoPin,
    renderKind: "resistor",
  },
  {
    id: "capacitor",
    displayName: "Capacitor",
    width: 80,
    height: 40,
    pins: horizontalTwoPin,
    renderKind: "capacitor",
  },
  {
    id: "inductor",
    displayName: "Inductor",
    width: 80,
    height: 36,
    pins: horizontalTwoPin,
    renderKind: "inductor",
  },
  {
    id: "switch",
    displayName: "Switch",
    width: 80,
    height: 42,
    pins: horizontalTwoPin,
    renderKind: "switch",
  },
  {
    id: "potentiometer",
    displayName: "Potentiometer",
    width: 80,
    height: 88,
    pins: potentiometerPins,
    renderKind: "potentiometer",
  },
  {
    id: "dc-source",
    displayName: "DC Voltage Source",
    width: 80,
    height: 72,
    pins: sourcePins,
    renderKind: "dc-source",
  },
  {
    id: "sine-source",
    displayName: "Sine Voltage Source",
    width: 80,
    height: 72,
    pins: sourcePins,
    renderKind: "sine-source",
  },
  {
    id: "current-source",
    displayName: "DC Current Source",
    width: 80,
    height: 72,
    pins: sourcePins,
    renderKind: "current-source",
  },
  {
    id: "diode",
    displayName: "Diode",
    width: 80,
    height: 42,
    pins: horizontalTwoPin,
    renderKind: "diode",
  },
  {
    id: "led",
    displayName: "LED",
    width: 80,
    height: 54,
    pins: horizontalTwoPin,
    renderKind: "led",
  },
  {
    id: "npn-transistor",
    displayName: "Transistor (bipolar, NPN)",
    width: 96,
    height: 72,
    pins: transistorPins,
    renderKind: "npn-transistor",
  },
  {
    id: "pnp-transistor",
    displayName: "Transistor (bipolar, PNP)",
    width: 96,
    height: 72,
    pins: transistorPins,
    renderKind: "pnp-transistor",
  },
  {
    id: "n-mosfet",
    displayName: "MOSFET (N-Channel)",
    width: 96,
    height: 72,
    pins: fetPins,
    renderKind: "n-mosfet",
  },
  {
    id: "p-mosfet",
    displayName: "MOSFET (P-Channel)",
    width: 96,
    height: 72,
    pins: fetPins,
    renderKind: "p-mosfet",
  },
  {
    id: "ideal-op-amp-minus-top",
    displayName: "Op Amp (ideal, - on top)",
    width: 112,
    height: 88,
    pins: opAmpPins,
    renderKind: "ideal-op-amp-minus-top",
  },
  {
    id: "logic-input",
    displayName: "Logic Input",
    width: 72,
    height: 40,
    pins: logicInputPins,
    renderKind: "logic-input",
  },
  {
    id: "logic-output",
    displayName: "Logic Output",
    width: 72,
    height: 40,
    pins: logicOutputPins,
    renderKind: "logic-output",
  },
  {
    id: "and-gate",
    displayName: "AND Gate",
    width: 88,
    height: 64,
    pins: gatePins,
    renderKind: "and-gate",
  },
  {
    id: "or-gate",
    displayName: "OR Gate",
    width: 88,
    height: 64,
    pins: gatePins,
    renderKind: "or-gate",
  },
  {
    id: "inverter",
    displayName: "Inverter",
    width: 80,
    height: 48,
    pins: horizontalTwoPin,
    renderKind: "inverter",
  },
]

export function getSymbolDefinition(id: string): SymbolDefinition | undefined {
  return symbolDefinitions.find((definition) => definition.id === id)
}

export function getRequiredSymbolDefinition(id: string): SymbolDefinition {
  const definition = getSymbolDefinition(id)
  if (!definition) {
    throw new Error(`Unknown symbol definition: ${id}`)
  }
  return definition
}
