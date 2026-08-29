import { Schema } from "effect"
import { ComponentTypeSchema, getComponent } from "./components"
import { getLocalPins } from "./component-geometry"
import { extractNetlist, getComponents, pinConnectionKey } from "./net-extraction"
import type { CircuitProject, Component } from "./project"
import { formatSiValue } from "./values"

const FiniteNumberSchema = Schema.Number.check(Schema.isFinite())

export const ElectricalBehaviorSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("resistor"), ohms: FiniteNumberSchema }),
  Schema.Struct({ kind: Schema.Literal("capacitor"), farads: FiniteNumberSchema }),
  Schema.Struct({ kind: Schema.Literal("inductor"), henries: FiniteNumberSchema }),
  Schema.Struct({ kind: Schema.Literal("diode"), model: Schema.NonEmptyString }),
  Schema.Struct({
    kind: Schema.Literal("dc-voltage-source"),
    volts: FiniteNumberSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("sine-voltage-source"),
    amplitudeVolts: FiniteNumberSchema,
    frequencyHertz: FiniteNumberSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("dc-current-source"),
    amps: FiniteNumberSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("switch"),
    state: Schema.Literals(["open", "closed"]),
  }),
  Schema.Struct({
    kind: Schema.Literal("bipolar-transistor"),
    polarity: Schema.Literals(["npn", "pnp"]),
    beta: FiniteNumberSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("mosfet"),
    polarity: Schema.Literals(["n", "p"]),
    thresholdVolts: FiniteNumberSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("ideal-op-amp"),
    gain: FiniteNumberSchema,
    minOutputVolts: FiniteNumberSchema,
    maxOutputVolts: FiniteNumberSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("logic-input"),
    position: Schema.Literals([0, 1, 2]),
    highVolts: FiniteNumberSchema,
    lowVolts: FiniteNumberSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("logic-output"),
    thresholdVolts: FiniteNumberSchema,
    requiredAmps: FiniteNumberSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("logic-gate"),
    operation: Schema.Literals(["and", "or"]),
    inputCount: FiniteNumberSchema,
    highVolts: FiniteNumberSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("inverter"),
    highVolts: FiniteNumberSchema,
  }),
])
export type ElectricalBehavior = typeof ElectricalBehaviorSchema.Type

export const ElectricalTerminalSchema = Schema.Struct({
  key: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
  net: Schema.NullOr(Schema.NonEmptyString),
})
export type ElectricalTerminal = typeof ElectricalTerminalSchema.Type

export const ElectricalComponentSchema = Schema.Struct({
  refdes: Schema.NonEmptyString,
  type: ComponentTypeSchema,
  behavior: ElectricalBehaviorSchema,
  terminals: Schema.Array(ElectricalTerminalSchema),
})
export type ElectricalComponent = typeof ElectricalComponentSchema.Type

export const ElectricalTerminalRefSchema = Schema.Struct({
  refdes: Schema.NonEmptyString,
  pin: Schema.NonEmptyString,
})
export type ElectricalTerminalRef = typeof ElectricalTerminalRefSchema.Type

export const ElectricalNetSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  terminals: Schema.Array(ElectricalTerminalRefSchema),
})
export type ElectricalNet = typeof ElectricalNetSchema.Type

export const ElectricalCircuitSchema = Schema.Struct({
  components: Schema.Array(ElectricalComponentSchema),
  nets: Schema.Array(ElectricalNetSchema),
}).check(
  Schema.makeFilter((circuit) => {
    const refdes = circuit.components.map((component) => component.refdes)
    if (new Set(refdes).size !== refdes.length) {
      return "Electrical component reference designators must be unique"
    }
    const netNames = circuit.nets.map((net) => net.name)
    return new Set(netNames).size === netNames.length
      ? undefined
      : "Electrical net names must be unique"
  }),
)
export type ElectricalCircuit = typeof ElectricalCircuitSchema.Type

/**
 * Generates the geometry-free electrical circuit in deterministic order.
 * CircuitProject remains the editable source; this value is always rebuilt.
 */
export function buildElectricalCircuit(project: CircuitProject): ElectricalCircuit {
  const netlist = extractNetlist(project)
  const netNameById = new Map(netlist.nets.map((net) => [net.id, net.name]))
  const pinLabelByComponentId = new Map(
    getComponents(project).map((component) => [
      component.id,
      new Map(getLocalPins(component).map((pin) => [pin.key, pin.label])),
    ]),
  )

  const components = getComponents(project)
    .map(
      (component): ElectricalComponent => ({
        refdes: component.refdes,
        type: component.type,
        behavior: behaviorOf(component),
        terminals: getLocalPins(component).map((pin) => {
          const netId = netlist.pinToNetId.get(
            pinConnectionKey(component.id, pin.key),
          )
          return {
            key: pin.key,
            label: pin.label,
            net: netId ? (netNameById.get(netId) ?? null) : null,
          }
        }),
      }),
    )
    .sort((a, b) => a.refdes.localeCompare(b.refdes) || a.type.localeCompare(b.type))

  const nets = netlist.nets
    .map(
      (net): ElectricalNet => ({
        name: net.name,
        terminals: net.pins
          .map((pin) => ({
            refdes: pin.refdes,
            pin:
              pinLabelByComponentId.get(pin.componentId)?.get(pin.pin) ?? pin.pin,
          }))
          .sort(compareTerminalRefs),
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  return { components, nets }
}

export function circuitHashOf(circuit: ElectricalCircuit): string {
  return fnv1a64Hex(JSON.stringify(circuit))
}

export function renderCircuitTxt(
  project: CircuitProject,
  circuit: ElectricalCircuit,
  circuitHash: string,
): string {
  const header = [
    `CIRCUIT "${project.name}"`,
    `HASH ${circuitHash}`,
    "",
    `ANALYSIS tran duration=${formatSiValue(project.analysis.durationMs / 1000, "s")} step=${formatSiValue(project.analysis.timeStepMs / 1000, "s")}`,
  ]
  const lines = circuit.components.map((component) => {
    const terminals = component.terminals
      .map((terminal) => `${terminal.label}=${terminal.net ?? "NC"}`)
      .join(" ")
    return `${componentDefinitionLine(component)} | ${terminals}`
  })
  return `${[...header, "", ...lines].join("\n")}\n`
}

export function componentDefinitionLine(component: ElectricalComponent): string {
  const parameters = electricalParameters(component.behavior).join(" ")
  return `${component.refdes} ${component.type}${parameters ? ` ${parameters}` : ""} [model=${modelFidelity(component.behavior)}]`
}

function behaviorOf(component: Component): ElectricalBehavior {
  const electrical = getComponent(component.type).electrical(component.props)
  switch (electrical.kind) {
    case "resistor":
      return { kind: "resistor", ohms: electrical.ohms }
    case "capacitor":
      return { kind: "capacitor", farads: electrical.farads }
    case "inductor":
      return { kind: "inductor", henries: electrical.henries }
    case "diode":
      return {
        kind: "diode",
        model: electrical.model ?? electrical.defaultModel,
      }
    case "voltage-source":
      return electrical.wave === "dc"
        ? { kind: "dc-voltage-source", volts: electrical.volts }
        : {
            kind: "sine-voltage-source",
            amplitudeVolts: electrical.amplitude,
            frequencyHertz: electrical.hertz,
          }
    case "current-source":
      return { kind: "dc-current-source", amps: electrical.amps }
    case "switch":
      return { kind: "switch", state: electrical.state }
    case "unmodeled":
      return unmodeledBehaviorOf(component)
  }
}

function unmodeledBehaviorOf(component: Component): ElectricalBehavior {
  switch (component.type) {
    case "npn-transistor":
    case "pnp-transistor":
      return {
        kind: "bipolar-transistor",
        polarity: component.type === "npn-transistor" ? "npn" : "pnp",
        beta: component.props.beta,
      }
    case "n-mosfet":
    case "p-mosfet":
      return {
        kind: "mosfet",
        polarity: component.type === "n-mosfet" ? "n" : "p",
        thresholdVolts: component.props.thresholdVolts,
      }
    case "ideal-op-amp-minus-top":
      return {
        kind: "ideal-op-amp",
        gain: component.props.gain,
        minOutputVolts: component.props.minOutputVolts,
        maxOutputVolts: component.props.maxOutputVolts,
      }
    case "logic-input":
      return {
        kind: "logic-input",
        position: component.props.position,
        highVolts: component.props.highLogicVoltageVolts,
        lowVolts: component.props.lowLogicVoltageVolts,
      }
    case "logic-output":
      return {
        kind: "logic-output",
        thresholdVolts: component.props.thresholdVolts,
        requiredAmps: component.props.currentRequiredAmps,
      }
    case "and-gate":
    case "or-gate":
      return {
        kind: "logic-gate",
        operation: component.type === "and-gate" ? "and" : "or",
        inputCount: component.props.inputCount,
        highVolts: component.props.highLogicVoltageVolts,
      }
    case "inverter":
      return {
        kind: "inverter",
        highVolts: component.props.highLogicVoltageVolts,
      }
    case "resistor":
    case "capacitor":
    case "inductor":
    case "switch":
    case "dc-voltage-source":
    case "sine-voltage-source":
    case "dc-current-source":
    case "diode":
    case "led":
      throw new Error(`Modeled component ${component.type} cannot be unmodeled`)
  }
}

function modelFidelity(
  behavior: ElectricalBehavior,
): "ideal" | "simplified" | "unsupported" {
  if (behavior.kind === "diode") return "simplified"
  return isSpiceUnsupported(behavior) ? "unsupported" : "ideal"
}

export function isSpiceUnsupported(behavior: ElectricalBehavior): boolean {
  switch (behavior.kind) {
    case "bipolar-transistor":
    case "mosfet":
    case "ideal-op-amp":
    case "logic-input":
    case "logic-output":
    case "logic-gate":
    case "inverter":
      return true
    case "resistor":
    case "capacitor":
    case "inductor":
    case "diode":
    case "dc-voltage-source":
    case "sine-voltage-source":
    case "dc-current-source":
    case "switch":
      return false
  }
}

function electricalParameters(behavior: ElectricalBehavior): string[] {
  switch (behavior.kind) {
    case "resistor":
      return [`R=${formatSiValue(behavior.ohms, "Ohm")}`]
    case "capacitor":
      return [`C=${formatSiValue(behavior.farads, "F")}`]
    case "inductor":
      return [`L=${formatSiValue(behavior.henries, "H")}`]
    case "diode":
      return [`model=${behavior.model}`]
    case "dc-voltage-source":
      return [`V=${formatSiValue(behavior.volts, "V")}`]
    case "sine-voltage-source":
      return [
        `peak=${formatSiValue(behavior.amplitudeVolts, "V")}`,
        `frequency=${formatSiValue(behavior.frequencyHertz, "Hz")}`,
      ]
    case "dc-current-source":
      return [`I=${formatSiValue(behavior.amps, "A")}`]
    case "switch":
      return [`state=${behavior.state}`]
    case "bipolar-transistor":
      return [`beta=${behavior.beta}`]
    case "mosfet":
      return [`threshold=${formatSiValue(behavior.thresholdVolts, "V")}`]
    case "ideal-op-amp":
      return [
        `gain=${formatSiValue(behavior.gain)}`,
        `rails=${formatSiValue(behavior.minOutputVolts, "V")}..${formatSiValue(behavior.maxOutputVolts, "V")}`,
      ]
    case "logic-input": {
      const state = ["low", "high", "mid"][behavior.position]
      return [
        `state=${state}`,
        `high=${formatSiValue(behavior.highVolts, "V")}`,
        `low=${formatSiValue(behavior.lowVolts, "V")}`,
      ]
    }
    case "logic-output":
      return [
        `threshold=${formatSiValue(behavior.thresholdVolts, "V")}`,
        `required-current=${formatSiValue(behavior.requiredAmps, "A")}`,
      ]
    case "logic-gate":
      return [
        `inputs=${behavior.inputCount}`,
        `high=${formatSiValue(behavior.highVolts, "V")}`,
      ]
    case "inverter":
      return [`high=${formatSiValue(behavior.highVolts, "V")}`]
  }
}

function compareTerminalRefs(a: ElectricalTerminalRef, b: ElectricalTerminalRef): number {
  return `${a.refdes}.${a.pin}`.localeCompare(`${b.refdes}.${b.pin}`, undefined, {
    numeric: true,
  })
}

function fnv1a64Hex(input: string): string {
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= BigInt(byte)
    hash = (hash * prime) & mask
  }
  return hash.toString(16).padStart(16, "0")
}
