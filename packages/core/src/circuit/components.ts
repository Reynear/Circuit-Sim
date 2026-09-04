import { Option, Schema } from "effect"
export type ComponentPropertyValue = string | number | boolean
export type ElectricalType =
  | "passive"
  | "input"
  | "output"
  | "power"
  | "reference"

export type ComponentTerminal = {
  readonly key: string
  readonly label: string
  readonly electrical: ElectricalType
  readonly position: readonly [number, number]
}
type ComponentPropertyInput = "si" | "number" | "text" | "enum" | "boolean"
type PropertySchema<Value extends ComponentPropertyValue = ComponentPropertyValue> =
  Schema.Codec<Value, Value, never, never>

type AnyComponentPropertyDefinition = {
  readonly schema: PropertySchema
  readonly default: ComponentPropertyValue
  readonly label: string
  readonly input: ComponentPropertyInput
  readonly unit?: string
  readonly options?: ReadonlyArray<{
    readonly label: string
    readonly value: ComponentPropertyValue
  }>
}
export type ComponentPropertyDefinitions = Readonly<
  Record<string, AnyComponentPropertyDefinition>
>

type SchemaFields<Definitions extends ComponentPropertyDefinitions> = {
  readonly [Key in keyof Definitions]: Definitions[Key]["schema"]
}
type ComponentProps<Definitions extends ComponentPropertyDefinitions> =
  Schema.Struct.Type<SchemaFields<Definitions>>

export type ComponentProperty<
  Type extends string = string,
  Key extends string = string,
  Value extends ComponentPropertyValue = ComponentPropertyValue,
> = {
  readonly componentType: Type
  readonly key: Key
  readonly schema: PropertySchema<Value>
  readonly default: Value
  readonly label: string
  readonly input: ComponentPropertyInput
  readonly unit?: string
  readonly options?: ReadonlyArray<{ readonly label: string; readonly value: Value }>
}
export type AnyComponentProperty = ComponentProperty

type ComponentProperties<
  Type extends string,
  Definitions extends ComponentPropertyDefinitions,
> = {
  readonly [Key in keyof Definitions]: ComponentProperty<
    Type,
    Extract<Key, string>,
    Definitions[Key]["schema"]["Type"]
  >
}

export type ComponentPropertyEdit = {
  readonly componentType: ComponentType
  readonly key: string
  readonly value: ComponentPropertyValue
}

export function decodeComponentPropertyEdit(
  property: AnyComponentProperty,
  input: unknown,
): Option.Option<ComponentPropertyEdit> {
  return Option.map(Schema.decodeUnknownOption(property.schema)(input), (value) => ({
    componentType: property.componentType as ComponentType,
    key: property.key,
    value,
  }))
}

export function readComponentProperty(
  property: AnyComponentProperty,
  props: object,
): ComponentPropertyValue {
  return Schema.decodeUnknownSync(property.schema)(Reflect.get(props, property.key))
}

export type ElectricalSpec =
  | {
      readonly kind: "resistor"
      readonly ohms: number
    }
  | {
      readonly kind: "capacitor"
      readonly farads: number
    }
  | {
      readonly kind: "inductor"
      readonly henries: number
    }
  | {
      readonly kind: "diode"
      readonly defaultModel: "DDEFAULT" | "DLED" | "DLED_GREEN" | "DLED_BLUE"
      readonly model?: string
      readonly saturationCurrentAmps: number
      readonly emissionCoefficient: number
      readonly seriesResistanceOhms: number
    }
  | {
      readonly kind: "zener-diode"
      readonly breakdownVolts: number
      readonly breakdownCurrentAmps: number
      readonly saturationCurrentAmps: number
      readonly emissionCoefficient: number
      readonly dynamicResistanceOhms: number
    }
  | {
      readonly kind: "bipolar-transistor"
      readonly polarity: "npn" | "pnp"
      readonly beta: number
      readonly earlyVoltageVolts: number
      readonly saturationCurrentAmps: number
      readonly forwardEmissionCoefficient: number
    }
  | {
      readonly kind: "mosfet"
      readonly polarity: "n" | "p"
      readonly thresholdVolts: number
      readonly transconductanceAmpsPerVoltSquared: number
      readonly channelLengthModulationPerVolt: number
    }
  | {
      readonly kind: "ideal-op-amp"
      readonly gain: number
      readonly minOutputVolts: number
      readonly maxOutputVolts: number
    }
  | {
      readonly kind: "logic-input"
      readonly position: 0 | 1 | 2
      readonly highVolts: number
      readonly lowVolts: number
    }
  | {
      readonly kind: "logic-output"
      readonly thresholdVolts: number
      readonly requiredAmps: number
    }
  | {
      readonly kind: "logic-gate"
      readonly operation: "and" | "or"
      readonly inputCount: 2
      readonly highVolts: number
    }
  | {
      readonly kind: "inverter"
      readonly highVolts: number
    }
  | {
      readonly kind: "voltage-source"
      readonly wave: "dc"
      readonly volts: number
    }
  | {
      /** A one-terminal DC rail whose other terminal is canonical GND. */
      readonly kind: "dc-power-rail"
      readonly volts: number
      readonly referenceNet: "GND"
    }
  | {
      readonly kind: "voltage-source"
      readonly wave: "sine"
      readonly amplitude: number
      readonly hertz: number
    }
  | {
      readonly kind: "voltage-source"
      readonly wave: "pulse"
      readonly initialVolts: number
      readonly pulsedVolts: number
      readonly hertz: number
      readonly dutyCyclePercent: number
      readonly delaySeconds: number
      readonly riseTimeSeconds: number
      readonly fallTimeSeconds: number
    }
  | {
      readonly kind: "current-source"
      readonly amps: number
    }
  | {
      /** Connectivity-only: nets own the open/closed behavior. */
      readonly kind: "switch"
      readonly state: "open" | "closed"
    }

export type ComponentGroup =
  | "passive"
  | "source"
  | "semiconductor"
  | "active-block"
  | "logic"

export type ComponentShortcut =
  | "R"
  | "C"
  | "Shift+L"
  | "D"
  | "L"
  | "V"
  | "Shift+V"
  | "Shift+I"

type ComponentDeclaration<
  Type extends string,
  Definitions extends ComponentPropertyDefinitions,
> = {
  readonly type: Type
  readonly name: string
  readonly group: ComponentGroup
  readonly prefix: string
  readonly shortcut?: ComponentShortcut
  readonly properties: Definitions
  readonly electrical: (props: ComponentProps<Definitions>) => ElectricalSpec
  readonly terminals: ReadonlyArray<ComponentTerminal>
}

export type ComponentSpec<
  Type extends string = string,
  Definitions extends ComponentPropertyDefinitions = ComponentPropertyDefinitions,
> = {
  readonly type: Type
  readonly name: string
  readonly group: ComponentGroup
  readonly prefix: string
  readonly shortcut?: ComponentShortcut
  readonly properties: ComponentProperties<Type, Definitions>
  readonly propertyList: ReadonlyArray<
    ComponentProperties<Type, Definitions>[keyof Definitions]
  >
  readonly props: Schema.Struct<SchemaFields<Definitions>>
  readonly defaults: ComponentProps<Definitions>
  readonly electrical: (props: object) => ElectricalSpec
  readonly terminals: ReadonlyArray<ComponentTerminal>
}

function defineComponent<
  const Type extends string,
  const Definitions extends ComponentPropertyDefinitions,
>(
  declaration: ComponentDeclaration<Type, Definitions>,
): ComponentSpec<Type, Definitions> {
  const entries = Object.entries(declaration.properties)
  const fields = Object.fromEntries(
    entries.map(([key, definition]) => [key, definition.schema]),
  ) as SchemaFields<Definitions>
  const props = Schema.Struct(fields)
  const defaults = Schema.decodeUnknownSync(props)(
    Object.fromEntries(entries.map(([key, definition]) => [key, definition.default])),
  )
  const properties = Object.fromEntries(
    entries.map(([key, definition]) => [
      key,
      { componentType: declaration.type, key, ...definition },
    ]),
  ) as ComponentProperties<Type, Definitions>
  const propertyList = Object.values(properties)

  validateTerminals(declaration.type, declaration.terminals)

  return {
    type: declaration.type,
    name: declaration.name,
    group: declaration.group,
    prefix: declaration.prefix,
    ...(declaration.shortcut === undefined
      ? {}
      : { shortcut: declaration.shortcut }),
    properties,
    propertyList,
    props,
    defaults,
    electrical: (input) => declaration.electrical(Schema.decodeUnknownSync(props)(input)),
    terminals: declaration.terminals,
  }
}

function validateTerminals(
  componentType: string,
  terminals: ReadonlyArray<ComponentTerminal>,
) {
  if (terminals.length === 0) {
    throw new Error(`${componentType} must define at least one pin`)
  }
  const pinKeys = terminals.map((pin) => pin.key)
  if (new Set(pinKeys).size !== pinKeys.length) {
    throw new Error(`${componentType} cannot define duplicate pin keys`)
  }
}

function terminal(
  key: string,
  label: string,
  electrical: ElectricalType,
  x: number,
  y: number,
): ComponentTerminal {
  return { key, label, electrical, position: [x, y] }
}

const Finite = Schema.Number.check(Schema.isFinite())
const Positive = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0))
const Negative = Schema.Number.check(Schema.isFinite(), Schema.isLessThan(0))
const NonNegative = Schema.Number.check(
  Schema.isFinite(),
  Schema.isGreaterThanOrEqualTo(0),
)
const DutyCyclePercent = Schema.Number.check(
  Schema.isFinite(),
  Schema.isGreaterThan(0),
  Schema.isLessThan(100),
)
const LogicPosition = Schema.Literals([0, 1, 2])

export const resistor = defineComponent({
  type: "resistor",
  name: "Resistor",
  group: "passive",
  prefix: "R",
  shortcut: "R",
  properties: {
    resistanceOhms: {
      schema: Positive,
      default: 1_000,
      label: "Resistance",
      input: "si",
      unit: "Ohm",
    },
  },
  electrical: ({ resistanceOhms }) => ({
    kind: "resistor",
    ohms: resistanceOhms,
  }),
  terminals: [
    terminal("a", "1", "passive", -40, 0),
    terminal("b", "2", "passive", 40, 0),
  ],
})

export const capacitor = defineComponent({
  type: "capacitor",
  name: "Capacitor",
  group: "passive",
  prefix: "C",
  shortcut: "C",
  properties: {
    capacitanceFarads: {
      schema: Positive,
      default: 1e-6,
      label: "Capacitance",
      input: "si",
      unit: "F",
    },
  },
  electrical: ({ capacitanceFarads }) => ({
    kind: "capacitor",
    farads: capacitanceFarads,
  }),
  terminals: [
    terminal("a", "1", "passive", -40, 0),
    terminal("b", "2", "passive", 40, 0),
  ],
})

export const inductor = defineComponent({
  type: "inductor",
  name: "Inductor",
  group: "passive",
  prefix: "L",
  shortcut: "Shift+L",
  properties: {
    inductanceHenries: {
      schema: Positive,
      default: 0.01,
      label: "Inductance",
      input: "si",
      unit: "H",
    },
  },
  electrical: ({ inductanceHenries }) => ({
    kind: "inductor",
    henries: inductanceHenries,
  }),
  terminals: [
    terminal("a", "1", "passive", -40, 0),
    terminal("b", "2", "passive", 40, 0),
  ],
})

export const switchComponent = defineComponent({
  type: "switch",
  name: "Switch",
  group: "passive",
  prefix: "S",
  properties: {
    state: {
      schema: Schema.Literals(["open", "closed"]),
      default: "open",
      label: "State",
      input: "enum",
      options: [
        { label: "Open", value: "open" },
        { label: "Closed", value: "closed" },
      ],
    },
  },
  electrical: ({ state }) => ({ kind: "switch", state }),
  terminals: [
    terminal("a", "1", "passive", -40, 0),
    terminal("b", "2", "passive", 40, 0),
  ],
})

export const dcVoltageSource = defineComponent({
  type: "dc-voltage-source",
  name: "DC Voltage Source",
  group: "source",
  prefix: "V",
  shortcut: "V",
  properties: {
    voltageVolts: {
      schema: Finite,
      default: 5,
      label: "Voltage",
      input: "si",
      unit: "V",
    },
  },
  electrical: ({ voltageVolts }) => ({
    kind: "voltage-source",
    wave: "dc",
    volts: voltageVolts,
  }),
  terminals: sourceTerminals(),
})

export const dcPowerRail = defineComponent({
  type: "dc-power-rail",
  name: "DC Power Rail",
  group: "source",
  prefix: "V",
  properties: {
    voltageVolts: {
      schema: Finite,
      default: 5,
      label: "Voltage to GND",
      input: "si",
      unit: "V",
    },
  },
  electrical: ({ voltageVolts }) => ({
    kind: "dc-power-rail",
    volts: voltageVolts,
    referenceNet: "GND",
  }),
  terminals: [terminal("rail", "RAIL", "power", 0, 40)],
})

export const sineVoltageSource = defineComponent({
  type: "sine-voltage-source",
  name: "Sine Voltage Source",
  group: "source",
  prefix: "V",
  shortcut: "Shift+V",
  properties: {
    amplitudeVolts: {
      schema: Finite,
      default: 5,
      label: "Amplitude",
      input: "si",
      unit: "V",
    },
    frequencyHertz: {
      schema: Positive,
      default: 1_000,
      label: "Frequency",
      input: "si",
      unit: "Hz",
    },
  },
  electrical: ({ amplitudeVolts, frequencyHertz }) => ({
    kind: "voltage-source",
    wave: "sine",
    amplitude: amplitudeVolts,
    hertz: frequencyHertz,
  }),
  terminals: sourceTerminals(),
})

export const pulseVoltageSource = defineComponent({
  type: "pulse-voltage-source",
  name: "Pulse / PWM Voltage Source",
  group: "source",
  prefix: "V",
  properties: {
    initialVoltageVolts: {
      schema: Finite,
      default: 0,
      label: "Initial voltage",
      input: "si",
      unit: "V",
    },
    pulsedVoltageVolts: {
      schema: Finite,
      default: 5,
      label: "Pulsed voltage",
      input: "si",
      unit: "V",
    },
    frequencyHertz: {
      schema: Positive,
      default: 20_000,
      label: "Frequency",
      input: "si",
      unit: "Hz",
    },
    dutyCyclePercent: {
      schema: DutyCyclePercent,
      default: 50,
      label: "Duty cycle",
      input: "number",
      unit: "%",
    },
    delaySeconds: {
      schema: NonNegative,
      default: 0,
      label: "Delay",
      input: "si",
      unit: "s",
    },
    riseTimeSeconds: {
      schema: NonNegative,
      default: 1e-9,
      label: "Rise time",
      input: "si",
      unit: "s",
    },
    fallTimeSeconds: {
      schema: NonNegative,
      default: 1e-9,
      label: "Fall time",
      input: "si",
      unit: "s",
    },
  },
  electrical: ({
    initialVoltageVolts,
    pulsedVoltageVolts,
    frequencyHertz,
    dutyCyclePercent,
    delaySeconds,
    riseTimeSeconds,
    fallTimeSeconds,
  }) => ({
    kind: "voltage-source",
    wave: "pulse",
    initialVolts: initialVoltageVolts,
    pulsedVolts: pulsedVoltageVolts,
    hertz: frequencyHertz,
    dutyCyclePercent,
    delaySeconds,
    riseTimeSeconds,
    fallTimeSeconds,
  }),
  terminals: sourceTerminals(),
})

export const dcCurrentSource = defineComponent({
  type: "dc-current-source",
  name: "DC Current Source",
  group: "source",
  prefix: "I",
  shortcut: "Shift+I",
  properties: {
    currentAmps: {
      schema: Finite,
      default: 0.001,
      label: "Current",
      input: "si",
      unit: "A",
    },
  },
  electrical: ({ currentAmps }) => ({
    kind: "current-source",
    amps: currentAmps,
  }),
  terminals: sourceTerminals(),
})

function sourceTerminals() {
  return [
    terminal("positive", "+", "power", -40, 0),
    terminal("negative", "-", "reference", 40, 0),
  ]
}

export const diode = defineComponent({
  type: "diode",
  name: "Diode",
  group: "semiconductor",
  prefix: "D",
  shortcut: "D",
  properties: {
    model: {
      schema: Schema.NonEmptyString,
      default: "D",
      label: "Model",
      input: "text",
    },
    saturationCurrentAmps: {
      schema: Positive,
      default: 1e-14,
      label: "Saturation current",
      input: "si",
      unit: "A",
    },
    emissionCoefficient: {
      schema: Positive,
      default: 1,
      label: "Emission coefficient",
      input: "number",
    },
    seriesResistanceOhms: {
      schema: NonNegative,
      default: 0,
      label: "Series resistance",
      input: "si",
      unit: "Ohm",
    },
  },
  electrical: ({
    model,
    saturationCurrentAmps,
    emissionCoefficient,
    seriesResistanceOhms,
  }) => ({
    kind: "diode",
    defaultModel: "DDEFAULT",
    model,
    saturationCurrentAmps,
    emissionCoefficient,
    seriesResistanceOhms,
  }),
  terminals: diodeTerminals(),
})

export const zenerDiode = defineComponent({
  type: "zener-diode",
  name: "Zener Diode",
  group: "semiconductor",
  prefix: "DZ",
  properties: {
    breakdownVolts: {
      schema: Positive,
      default: 5.1,
      label: "Breakdown voltage",
      input: "si",
      unit: "V",
    },
    breakdownCurrentAmps: {
      schema: Positive,
      default: 0.001,
      label: "Breakdown current",
      input: "si",
      unit: "A",
    },
    saturationCurrentAmps: {
      schema: Positive,
      default: 1e-14,
      label: "Saturation current",
      input: "si",
      unit: "A",
    },
    emissionCoefficient: {
      schema: Positive,
      default: 1,
      label: "Emission coefficient",
      input: "number",
    },
    dynamicResistanceOhms: {
      schema: Positive,
      default: 10,
      label: "Dynamic resistance",
      input: "si",
      unit: "Ohm",
    },
  },
  electrical: ({
    breakdownVolts,
    breakdownCurrentAmps,
    saturationCurrentAmps,
    emissionCoefficient,
    dynamicResistanceOhms,
  }) => ({
    kind: "zener-diode",
    breakdownVolts,
    breakdownCurrentAmps,
    saturationCurrentAmps,
    emissionCoefficient,
    dynamicResistanceOhms,
  }),
  terminals: diodeTerminals(),
})

export function ledModelForColor(
  color: string,
): "DLED" | "DLED_GREEN" | "DLED_BLUE" {
  switch (color.trim().toLowerCase()) {
    case "blue":
    case "cyan":
    case "white":
      return "DLED_BLUE"
    case "green":
      return "DLED_GREEN"
    default:
      return "DLED"
  }
}

export function diodeModelParameters(model: string): {
  readonly saturationCurrentAmps: number
  readonly emissionCoefficient: number
  readonly seriesResistanceOhms: number
} {
  switch (model.trim().toUpperCase()) {
    case "DLED_BLUE":
      return {
        saturationCurrentAmps: 1e-30,
        emissionCoefficient: 2,
        seriesResistanceOhms: 0,
      }
    case "DLED_GREEN":
      return {
        saturationCurrentAmps: 1e-24,
        emissionCoefficient: 2,
        seriesResistanceOhms: 0,
      }
    case "DLED":
      return {
        saturationCurrentAmps: 1e-18,
        emissionCoefficient: 2,
        seriesResistanceOhms: 0,
      }
    default:
      return {
        saturationCurrentAmps: 1e-14,
        emissionCoefficient: 1,
        seriesResistanceOhms: 0,
      }
  }
}

export const led = defineComponent({
  type: "led",
  name: "LED",
  group: "semiconductor",
  prefix: "LED",
  shortcut: "L",
  properties: {
    color: {
      schema: Schema.NonEmptyString,
      default: "red",
      label: "Color",
      input: "text",
    },
  },
  electrical: ({ color }) => {
    const defaultModel = ledModelForColor(color)
    return {
      kind: "diode",
      defaultModel,
      ...diodeModelParameters(defaultModel),
    }
  },
  terminals: diodeTerminals(),
})

function diodeTerminals() {
  return [
    terminal("anode", "A", "passive", -40, 0),
    terminal("cathode", "K", "passive", 40, 0),
  ]
}

export const npnTransistor = defineComponent({
  type: "npn-transistor",
  name: "Transistor (bipolar, NPN)",
  group: "semiconductor",
  prefix: "Q",
  properties: {
    beta: {
      schema: Positive,
      default: 100,
      label: "Beta",
      input: "number",
    },
    earlyVoltageVolts: {
      schema: Positive,
      default: 100,
      label: "Early voltage",
      input: "si",
      unit: "V",
    },
    saturationCurrentAmps: {
      schema: Positive,
      default: 1e-15,
      label: "Saturation current",
      input: "si",
      unit: "A",
    },
    forwardEmissionCoefficient: {
      schema: Positive,
      default: 1,
      label: "Forward emission coefficient",
      input: "number",
    },
  },
  electrical: ({
    beta,
    earlyVoltageVolts,
    saturationCurrentAmps,
    forwardEmissionCoefficient,
  }) => ({
    kind: "bipolar-transistor",
    polarity: "npn",
    beta,
    earlyVoltageVolts,
    saturationCurrentAmps,
    forwardEmissionCoefficient,
  }),
  terminals: transistorTerminals(),
})

export const pnpTransistor = defineComponent({
  type: "pnp-transistor",
  name: "Transistor (bipolar, PNP)",
  group: "semiconductor",
  prefix: "Q",
  properties: {
    beta: {
      schema: Positive,
      default: 100,
      label: "Beta",
      input: "number",
    },
    earlyVoltageVolts: {
      schema: Positive,
      default: 100,
      label: "Early voltage",
      input: "si",
      unit: "V",
    },
    saturationCurrentAmps: {
      schema: Positive,
      default: 1e-15,
      label: "Saturation current",
      input: "si",
      unit: "A",
    },
    forwardEmissionCoefficient: {
      schema: Positive,
      default: 1,
      label: "Forward emission coefficient",
      input: "number",
    },
  },
  electrical: ({
    beta,
    earlyVoltageVolts,
    saturationCurrentAmps,
    forwardEmissionCoefficient,
  }) => ({
    kind: "bipolar-transistor",
    polarity: "pnp",
    beta,
    earlyVoltageVolts,
    saturationCurrentAmps,
    forwardEmissionCoefficient,
  }),
  terminals: transistorTerminals(),
})

function transistorTerminals() {
  return [
    terminal("base", "B", "input", -40, 0),
    terminal("collector", "C", "passive", 32, -32),
    terminal("emitter", "E", "passive", 32, 32),
  ]
}

export const nMosfet = defineComponent({
  type: "n-mosfet",
  name: "MOSFET (N-Channel)",
  group: "semiconductor",
  prefix: "M",
  properties: {
    thresholdVolts: {
      schema: Positive,
      default: 2,
      label: "Threshold voltage",
      input: "si",
      unit: "V",
    },
    transconductanceAmpsPerVoltSquared: {
      schema: Positive,
      default: 0.05,
      label: "Transconductance parameter",
      input: "si",
      unit: "A/V^2",
    },
    channelLengthModulationPerVolt: {
      schema: NonNegative,
      default: 0.02,
      label: "Channel-length modulation",
      input: "si",
      unit: "1/V",
    },
  },
  electrical: ({
    thresholdVolts,
    transconductanceAmpsPerVoltSquared,
    channelLengthModulationPerVolt,
  }) => ({
    kind: "mosfet",
    polarity: "n",
    thresholdVolts,
    transconductanceAmpsPerVoltSquared,
    channelLengthModulationPerVolt,
  }),
  terminals: mosfetTerminals(),
})

export const pMosfet = defineComponent({
  type: "p-mosfet",
  name: "MOSFET (P-Channel)",
  group: "semiconductor",
  prefix: "M",
  properties: {
    thresholdVolts: {
      schema: Negative,
      default: -2,
      label: "Threshold voltage",
      input: "si",
      unit: "V",
    },
    transconductanceAmpsPerVoltSquared: {
      schema: Positive,
      default: 0.05,
      label: "Transconductance parameter",
      input: "si",
      unit: "A/V^2",
    },
    channelLengthModulationPerVolt: {
      schema: NonNegative,
      default: 0.02,
      label: "Channel-length modulation",
      input: "si",
      unit: "1/V",
    },
  },
  electrical: ({
    thresholdVolts,
    transconductanceAmpsPerVoltSquared,
    channelLengthModulationPerVolt,
  }) => ({
    kind: "mosfet",
    polarity: "p",
    thresholdVolts,
    transconductanceAmpsPerVoltSquared,
    channelLengthModulationPerVolt,
  }),
  terminals: mosfetTerminals(),
})

function mosfetTerminals() {
  return [
    terminal("gate", "G", "input", -40, 0),
    terminal("drain", "D", "passive", 32, -32),
    terminal("source", "S", "passive", 32, 32),
  ]
}

export const idealOpAmp = defineComponent({
  type: "ideal-op-amp-minus-top",
  name: "Op Amp (ideal, - on top)",
  group: "active-block",
  prefix: "U",
  properties: {
    maxOutputVolts: {
      schema: Finite,
      default: 15,
      label: "Maximum output",
      input: "si",
      unit: "V",
    },
    minOutputVolts: {
      schema: Finite,
      default: -15,
      label: "Minimum output",
      input: "si",
      unit: "V",
    },
    gain: {
      schema: Positive,
      default: 100_000,
      label: "Gain",
      input: "number",
    },
  },
  electrical: ({ gain, minOutputVolts, maxOutputVolts }) => ({
    kind: "ideal-op-amp",
    gain,
    minOutputVolts,
    maxOutputVolts,
  }),
  terminals: [
    terminal("inverting", "-", "input", -48, -18),
    terminal("nonInverting", "+", "input", -48, 18),
    terminal("output", "OUT", "output", 56, 0),
    terminal("vPlus", "V+", "power", 0, -40),
    terminal("vMinus", "V-", "power", 0, 40),
  ],
})

export const logicInput = defineComponent({
  type: "logic-input",
  name: "Logic Input",
  group: "logic",
  prefix: "IN",
  properties: {
    position: {
      schema: LogicPosition,
      default: 0,
      label: "Position",
      input: "number",
    },
    highLogicVoltageVolts: {
      schema: Finite,
      default: 5,
      label: "High voltage",
      input: "si",
      unit: "V",
    },
    lowLogicVoltageVolts: {
      schema: Finite,
      default: 0,
      label: "Low voltage",
      input: "si",
      unit: "V",
    },
    ternary: {
      schema: Schema.Boolean,
      default: false,
      label: "Ternary",
      input: "boolean",
    },
    momentary: {
      schema: Schema.Boolean,
      default: false,
      label: "Momentary",
      input: "boolean",
    },
  },
  electrical: ({ position, highLogicVoltageVolts, lowLogicVoltageVolts }) => ({
    kind: "logic-input",
    position,
    highVolts: highLogicVoltageVolts,
    lowVolts: lowLogicVoltageVolts,
  }),
  terminals: [
    terminal("output", "OUT", "output", 36, 0),
    terminal("reference", "REF", "reference", 0, 36),
  ],
})

export type LogicInputPosition = typeof logicInput.defaults.position

export const logicOutput = defineComponent({
  type: "logic-output",
  name: "Logic Output",
  group: "logic",
  prefix: "OUT",
  properties: {
    thresholdVolts: {
      schema: Finite,
      default: 2.5,
      label: "Threshold",
      input: "si",
      unit: "V",
    },
    currentRequiredAmps: {
      schema: NonNegative,
      default: 0,
      label: "Current required",
      input: "si",
      unit: "A",
    },
  },
  electrical: ({ thresholdVolts, currentRequiredAmps }) => ({
    kind: "logic-output",
    thresholdVolts,
    requiredAmps: currentRequiredAmps,
  }),
  terminals: [
    terminal("input", "IN", "input", -36, 0),
    terminal("reference", "REF", "reference", 0, 36),
  ],
})

export const andGate = defineComponent({
  type: "and-gate",
  name: "AND Gate",
  group: "logic",
  prefix: "U",
  properties: {
    inputCount: {
      schema: Schema.Literal(2),
      default: 2,
      label: "Inputs",
      input: "enum",
      options: [
        { label: "2", value: 2 },
      ],
    },
    highLogicVoltageVolts: {
      schema: Positive,
      default: 5,
      label: "High voltage",
      input: "si",
      unit: "V",
    },
  },
  electrical: ({ inputCount, highLogicVoltageVolts }) => ({
    kind: "logic-gate",
    operation: "and",
    inputCount,
    highVolts: highLogicVoltageVolts,
  }),
  terminals: gateTerminals(),
})

export const orGate = defineComponent({
  type: "or-gate",
  name: "OR Gate",
  group: "logic",
  prefix: "U",
  properties: {
    inputCount: {
      schema: Schema.Literal(2),
      default: 2,
      label: "Inputs",
      input: "enum",
      options: [
        { label: "2", value: 2 },
      ],
    },
    highLogicVoltageVolts: {
      schema: Positive,
      default: 5,
      label: "High voltage",
      input: "si",
      unit: "V",
    },
  },
  electrical: ({ inputCount, highLogicVoltageVolts }) => ({
    kind: "logic-gate",
    operation: "or",
    inputCount,
    highVolts: highLogicVoltageVolts,
  }),
  terminals: gateTerminals(),
})

function gateTerminals() {
  return [
    terminal("a", "A", "input", -44, -16),
    terminal("b", "B", "input", -44, 16),
    terminal("output", "Y", "output", 44, 0),
    terminal("reference", "REF", "reference", 0, 36),
  ]
}

export const inverter = defineComponent({
  type: "inverter",
  name: "Inverter",
  group: "logic",
  prefix: "U",
  properties: {
    highLogicVoltageVolts: {
      schema: Positive,
      default: 5,
      label: "High voltage",
      input: "si",
      unit: "V",
    },
  },
  electrical: ({ highLogicVoltageVolts }) => ({
    kind: "inverter",
    highVolts: highLogicVoltageVolts,
  }),
  terminals: [
    terminal("input", "A", "input", -40, 0),
    terminal("output", "Y", "output", 40, 0),
    terminal("reference", "REF", "reference", 0, 36),
  ],
})

const componentByType = {
  resistor,
  capacitor,
  inductor,
  switch: switchComponent,
  "dc-voltage-source": dcVoltageSource,
  "dc-power-rail": dcPowerRail,
  "sine-voltage-source": sineVoltageSource,
  "pulse-voltage-source": pulseVoltageSource,
  "dc-current-source": dcCurrentSource,
  diode,
  "zener-diode": zenerDiode,
  led,
  "npn-transistor": npnTransistor,
  "pnp-transistor": pnpTransistor,
  "n-mosfet": nMosfet,
  "p-mosfet": pMosfet,
  "ideal-op-amp-minus-top": idealOpAmp,
  "logic-input": logicInput,
  "logic-output": logicOutput,
  "and-gate": andGate,
  "or-gate": orGate,
  inverter,
} as const

export type ComponentType = keyof typeof componentByType
export type AnyComponentSpec = (typeof componentByType)[ComponentType]

export const components: ReadonlyArray<AnyComponentSpec> =
  Object.values(componentByType)

export const ComponentTypeSchema: Schema.Schema<ComponentType> = Schema.Literals(
  components.map((spec) => spec.type),
)

const shortcuts = components.flatMap((spec) =>
  spec.shortcut ? [spec.shortcut] : [],
)
if (new Set(shortcuts).size !== shortcuts.length) {
  throw new Error("Component shortcuts must be unique")
}

export function getComponent<Type extends ComponentType>(
  type: Type,
): (typeof componentByType)[Type] {
  return componentByType[type]
}

export function getNextRefdes(
  objects: ReadonlyArray<{
    readonly kind: string
    readonly type?: string
    readonly refdes?: string
  }>,
  type: ComponentType,
): string {
  const prefix = getComponent(type).prefix
  const used = new Set(
    objects
      .filter((object) => object.kind === "component")
      .map((object) => object.refdes)
      .filter((refdes): refdes is string => Boolean(refdes)),
  )
  let index = 1
  while (used.has(`${prefix}${index}`)) index += 1
  return `${prefix}${index}`
}
