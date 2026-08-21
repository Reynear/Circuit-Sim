export type ElectricalType =
  | "passive"
  | "input"
  | "output"
  | "power"
  | "reference"

export type ComponentDefinition = {
  id: string
  displayName: string
  category:
    | "passive"
    | "source"
    | "semiconductor"
    | "reference"
    | "probe"
    | "active-block"
    | "logic"
  defaultSymbolId: string
  defaultProps: Record<string, unknown>
  pins: Array<{
    id: string
    name: string
    electricalType: ElectricalType
  }>
}

function makePins(
  pins: Array<[name: string, electricalType: ElectricalType]>,
): ComponentDefinition["pins"] {
  return pins.map(([name, electricalType], index) => ({
    id: `pin${index + 1}`,
    name,
    electricalType,
  }))
}

const twoTerminal = makePins([
  ["1", "passive"],
  ["2", "passive"],
])

export const componentDefinitions: ComponentDefinition[] = [
  {
    id: "resistor",
    displayName: "Resistor",
    category: "passive",
    defaultSymbolId: "resistor",
    defaultProps: { value: "1k" },
    pins: twoTerminal,
  },
  {
    id: "capacitor",
    displayName: "Capacitor",
    category: "passive",
    defaultSymbolId: "capacitor",
    defaultProps: { value: "1uF" },
    pins: twoTerminal,
  },
  {
    id: "inductor",
    displayName: "Inductor",
    category: "passive",
    defaultSymbolId: "inductor",
    defaultProps: { value: "10mH" },
    pins: twoTerminal,
  },
  {
    id: "switch",
    displayName: "Switch",
    category: "passive",
    defaultSymbolId: "switch",
    defaultProps: { state: "open" },
    pins: twoTerminal,
  },
  {
    id: "potentiometer",
    displayName: "Potentiometer",
    category: "passive",
    defaultSymbolId: "potentiometer",
    defaultProps: { value: "10k", wiper: "0.5" },
    pins: makePins([
      ["A", "passive"],
      ["W", "passive"],
      ["B", "passive"],
    ]),
  },
  {
    id: "dc-voltage-source",
    displayName: "DC Voltage Source",
    category: "source",
    defaultSymbolId: "dc-source",
    defaultProps: { voltage: "5V" },
    pins: makePins([
      ["+", "power"],
      ["-", "reference"],
    ]),
  },
  {
    id: "sine-voltage-source",
    displayName: "Sine Voltage Source",
    category: "source",
    defaultSymbolId: "sine-source",
    defaultProps: { amplitude: "5V", frequency: "1k" },
    pins: makePins([
      ["+", "power"],
      ["-", "reference"],
    ]),
  },
  {
    id: "dc-current-source",
    displayName: "DC Current Source",
    category: "source",
    defaultSymbolId: "current-source",
    defaultProps: { current: "1mA" },
    pins: makePins([
      ["+", "power"],
      ["-", "reference"],
    ]),
  },
  {
    id: "diode",
    displayName: "Diode",
    category: "semiconductor",
    defaultSymbolId: "diode",
    defaultProps: { model: "D" },
    pins: makePins([
      ["A", "passive"],
      ["K", "passive"],
    ]),
  },
  {
    id: "led",
    displayName: "LED",
    category: "semiconductor",
    defaultSymbolId: "led",
    defaultProps: { color: "red" },
    pins: makePins([
      ["A", "passive"],
      ["K", "passive"],
    ]),
  },
  {
    id: "npn-transistor",
    displayName: "Transistor (bipolar, NPN)",
    category: "semiconductor",
    defaultSymbolId: "npn-transistor",
    defaultProps: { beta: "100" },
    pins: makePins([
      ["B", "input"],
      ["C", "passive"],
      ["E", "passive"],
    ]),
  },
  {
    id: "pnp-transistor",
    displayName: "Transistor (bipolar, PNP)",
    category: "semiconductor",
    defaultSymbolId: "pnp-transistor",
    defaultProps: { beta: "100" },
    pins: makePins([
      ["B", "input"],
      ["C", "passive"],
      ["E", "passive"],
    ]),
  },
  {
    id: "n-mosfet",
    displayName: "MOSFET (N-Channel)",
    category: "semiconductor",
    defaultSymbolId: "n-mosfet",
    defaultProps: { thresholdVoltage: "2V" },
    pins: makePins([
      ["G", "input"],
      ["D", "passive"],
      ["S", "passive"],
    ]),
  },
  {
    id: "p-mosfet",
    displayName: "MOSFET (P-Channel)",
    category: "semiconductor",
    defaultSymbolId: "p-mosfet",
    defaultProps: { thresholdVoltage: "-2V" },
    pins: makePins([
      ["G", "input"],
      ["D", "passive"],
      ["S", "passive"],
    ]),
  },
  {
    id: "ideal-op-amp-minus-top",
    displayName: "Op Amp (ideal, - on top)",
    category: "active-block",
    defaultSymbolId: "ideal-op-amp-minus-top",
    defaultProps: { maxOutput: "15V", minOutput: "-15V", gain: "100000" },
    pins: makePins([
      ["-", "input"],
      ["+", "input"],
      ["OUT", "output"],
      ["V+", "power"],
      ["V-", "power"],
    ]),
  },
  {
    id: "logic-input",
    displayName: "Logic Input",
    category: "logic",
    defaultSymbolId: "logic-input",
    defaultProps: { position: "0", highLogicVoltage: "5V", lowVoltage: "0V" },
    pins: makePins([["OUT", "output"]]),
  },
  {
    id: "logic-output",
    displayName: "Logic Output",
    category: "logic",
    defaultSymbolId: "logic-output",
    defaultProps: { threshold: "2.5V" },
    pins: makePins([["IN", "input"]]),
  },
  {
    id: "and-gate",
    displayName: "AND Gate",
    category: "logic",
    defaultSymbolId: "and-gate",
    defaultProps: { inputCount: "2", highLogicVoltage: "5V" },
    pins: makePins([
      ["A", "input"],
      ["B", "input"],
      ["Y", "output"],
    ]),
  },
  {
    id: "or-gate",
    displayName: "OR Gate",
    category: "logic",
    defaultSymbolId: "or-gate",
    defaultProps: { inputCount: "2", highLogicVoltage: "5V" },
    pins: makePins([
      ["A", "input"],
      ["B", "input"],
      ["Y", "output"],
    ]),
  },
  {
    id: "inverter",
    displayName: "Inverter",
    category: "logic",
    defaultSymbolId: "inverter",
    defaultProps: { highLogicVoltage: "5V" },
    pins: makePins([
      ["A", "input"],
      ["Y", "output"],
    ]),
  },
]

export function getComponentDefinition(
  id: string,
): ComponentDefinition | undefined {
  return componentDefinitions.find((definition) => definition.id === id)
}

export function getRequiredComponentDefinition(
  id: string,
): ComponentDefinition {
  const definition = getComponentDefinition(id)
  if (!definition) {
    throw new Error(`Unknown component definition: ${id}`)
  }
  return definition
}

export function getRefdesPrefix(componentDefinitionId: string): string {
  switch (componentDefinitionId) {
    case "resistor":
      return "R"
    case "capacitor":
      return "C"
    case "inductor":
      return "L"
    case "switch":
      return "S"
    case "potentiometer":
      return "RV"
    case "dc-voltage-source":
    case "sine-voltage-source":
      return "V"
    case "dc-current-source":
      return "I"
    case "diode":
      return "D"
    case "led":
      return "LED"
    case "npn-transistor":
    case "pnp-transistor":
      return "Q"
    case "n-mosfet":
    case "p-mosfet":
      return "M"
    case "logic-input":
      return "IN"
    case "logic-output":
      return "OUT"
    default:
      return "U"
  }
}

export function getNextRefdes(
  objects: Array<{ kind: string; componentDefinitionId?: string; refdes?: string }>,
  componentDefinitionId: string,
): string {
  const prefix = getRefdesPrefix(componentDefinitionId)
  const used = new Set(
    objects
      .filter((object) => object.kind === "symbol")
      .map((object) => object.refdes)
      .filter((refdes): refdes is string => Boolean(refdes)),
  )
  let index = 1
  while (used.has(`${prefix}${index}`)) {
    index += 1
  }
  return `${prefix}${index}`
}
