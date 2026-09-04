import { Schema } from "effect"
import { ComponentTypeSchema, getComponent } from "./components"
import { getLocalPins } from "./component-geometry"
import { extractNetlist, getComponents, pinConnectionKey } from "./net-extraction"
import type { CircuitProject, Component } from "./project"
import { formatSiValue } from "./values"

const FiniteNumberSchema = Schema.Number.check(Schema.isFinite())
const PositiveFiniteNumberSchema = FiniteNumberSchema.check(
  Schema.isGreaterThan(0),
)
const NonNegativeFiniteNumberSchema = FiniteNumberSchema.check(
  Schema.isGreaterThanOrEqualTo(0),
)

export const ElectricalBehaviorSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("resistor"), ohms: FiniteNumberSchema }),
  Schema.Struct({ kind: Schema.Literal("capacitor"), farads: FiniteNumberSchema }),
  Schema.Struct({ kind: Schema.Literal("inductor"), henries: FiniteNumberSchema }),
  Schema.Struct({
    kind: Schema.Literal("diode"),
    model: Schema.NonEmptyString,
    saturationCurrentAmps: PositiveFiniteNumberSchema,
    emissionCoefficient: PositiveFiniteNumberSchema,
    seriesResistanceOhms: NonNegativeFiniteNumberSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("zener-diode"),
    breakdownVolts: PositiveFiniteNumberSchema,
    breakdownCurrentAmps: PositiveFiniteNumberSchema,
    saturationCurrentAmps: PositiveFiniteNumberSchema,
    emissionCoefficient: PositiveFiniteNumberSchema,
    dynamicResistanceOhms: PositiveFiniteNumberSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("dc-voltage-source"),
    volts: FiniteNumberSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("dc-power-rail"),
    volts: FiniteNumberSchema,
    referenceNet: Schema.Literal("GND"),
  }),
  Schema.Struct({
    kind: Schema.Literal("sine-voltage-source"),
    amplitudeVolts: FiniteNumberSchema,
    frequencyHertz: FiniteNumberSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("pulse-voltage-source"),
    initialVolts: FiniteNumberSchema,
    pulsedVolts: FiniteNumberSchema,
    frequencyHertz: PositiveFiniteNumberSchema,
    dutyCyclePercent: PositiveFiniteNumberSchema.check(Schema.isLessThan(100)),
    delaySeconds: NonNegativeFiniteNumberSchema,
    riseTimeSeconds: NonNegativeFiniteNumberSchema,
    fallTimeSeconds: NonNegativeFiniteNumberSchema,
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
    beta: PositiveFiniteNumberSchema,
    earlyVoltageVolts: PositiveFiniteNumberSchema,
    saturationCurrentAmps: PositiveFiniteNumberSchema,
    forwardEmissionCoefficient: PositiveFiniteNumberSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("mosfet"),
    polarity: Schema.Literals(["n", "p"]),
    thresholdVolts: FiniteNumberSchema,
    transconductanceAmpsPerVoltSquared: PositiveFiniteNumberSchema,
    channelLengthModulationPerVolt: NonNegativeFiniteNumberSchema,
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
    requiredAmps: NonNegativeFiniteNumberSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("logic-gate"),
    operation: Schema.Literals(["and", "or"]),
    inputCount: Schema.Literal(2),
    highVolts: PositiveFiniteNumberSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal("inverter"),
    highVolts: PositiveFiniteNumberSchema,
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
        saturationCurrentAmps: electrical.saturationCurrentAmps,
        emissionCoefficient: electrical.emissionCoefficient,
        seriesResistanceOhms: electrical.seriesResistanceOhms,
      }
    case "zener-diode":
      return {
        kind: "zener-diode",
        breakdownVolts: electrical.breakdownVolts,
        breakdownCurrentAmps: electrical.breakdownCurrentAmps,
        saturationCurrentAmps: electrical.saturationCurrentAmps,
        emissionCoefficient: electrical.emissionCoefficient,
        dynamicResistanceOhms: electrical.dynamicResistanceOhms,
      }
    case "bipolar-transistor":
      return {
        kind: "bipolar-transistor",
        polarity: electrical.polarity,
        beta: electrical.beta,
        earlyVoltageVolts: electrical.earlyVoltageVolts,
        saturationCurrentAmps: electrical.saturationCurrentAmps,
        forwardEmissionCoefficient: electrical.forwardEmissionCoefficient,
      }
    case "mosfet":
      return {
        kind: "mosfet",
        polarity: electrical.polarity,
        thresholdVolts: electrical.thresholdVolts,
        transconductanceAmpsPerVoltSquared:
          electrical.transconductanceAmpsPerVoltSquared,
        channelLengthModulationPerVolt:
          electrical.channelLengthModulationPerVolt,
      }
    case "ideal-op-amp":
      return {
        kind: "ideal-op-amp",
        gain: electrical.gain,
        minOutputVolts: electrical.minOutputVolts,
        maxOutputVolts: electrical.maxOutputVolts,
      }
    case "logic-input":
      return {
        kind: "logic-input",
        position: electrical.position,
        highVolts: electrical.highVolts,
        lowVolts: electrical.lowVolts,
      }
    case "logic-output":
      return {
        kind: "logic-output",
        thresholdVolts: electrical.thresholdVolts,
        requiredAmps: electrical.requiredAmps,
      }
    case "logic-gate":
      return {
        kind: "logic-gate",
        operation: electrical.operation,
        inputCount: electrical.inputCount,
        highVolts: electrical.highVolts,
      }
    case "inverter":
      return { kind: "inverter", highVolts: electrical.highVolts }
    case "voltage-source":
      switch (electrical.wave) {
        case "dc":
          return { kind: "dc-voltage-source", volts: electrical.volts }
        case "sine":
          return {
            kind: "sine-voltage-source",
            amplitudeVolts: electrical.amplitude,
            frequencyHertz: electrical.hertz,
          }
        case "pulse":
          return {
            kind: "pulse-voltage-source",
            initialVolts: electrical.initialVolts,
            pulsedVolts: electrical.pulsedVolts,
            frequencyHertz: electrical.hertz,
            dutyCyclePercent: electrical.dutyCyclePercent,
            delaySeconds: electrical.delaySeconds,
            riseTimeSeconds: electrical.riseTimeSeconds,
            fallTimeSeconds: electrical.fallTimeSeconds,
          }
      }
    case "dc-power-rail":
      return {
        kind: "dc-power-rail",
        volts: electrical.volts,
        referenceNet: electrical.referenceNet,
      }
    case "current-source":
      return { kind: "dc-current-source", amps: electrical.amps }
    case "switch":
      return { kind: "switch", state: electrical.state }
  }
}

function modelFidelity(
  behavior: ElectricalBehavior,
): "ideal" | "simplified" | "unsupported" {
  if (
    behavior.kind === "diode" ||
    behavior.kind === "zener-diode" ||
    behavior.kind === "bipolar-transistor" ||
    behavior.kind === "mosfet" ||
    behavior.kind === "ideal-op-amp" ||
    behavior.kind === "logic-gate" ||
    behavior.kind === "inverter"
  ) {
    return "simplified"
  }
  return isSpiceUnsupported(behavior) ? "unsupported" : "ideal"
}

export function isSpiceUnsupported(behavior: ElectricalBehavior): boolean {
  switch (behavior.kind) {
    case "resistor":
    case "capacitor":
    case "inductor":
    case "diode":
    case "zener-diode":
    case "bipolar-transistor":
    case "mosfet":
    case "ideal-op-amp":
    case "logic-input":
    case "logic-output":
    case "logic-gate":
    case "inverter":
    case "dc-voltage-source":
    case "dc-power-rail":
    case "sine-voltage-source":
    case "pulse-voltage-source":
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
      return [
        `model=${behavior.model}`,
        `saturation-current=${formatSiValue(behavior.saturationCurrentAmps, "A")}`,
        `emission-coefficient=${behavior.emissionCoefficient}`,
        `series-resistance=${formatSiValue(behavior.seriesResistanceOhms, "Ohm")}`,
      ]
    case "zener-diode":
      return [
        `breakdown=${formatSiValue(behavior.breakdownVolts, "V")}`,
        `breakdown-current=${formatSiValue(behavior.breakdownCurrentAmps, "A")}`,
        `saturation-current=${formatSiValue(behavior.saturationCurrentAmps, "A")}`,
        `emission-coefficient=${behavior.emissionCoefficient}`,
        `dynamic-resistance=${formatSiValue(behavior.dynamicResistanceOhms, "Ohm")}`,
      ]
    case "dc-voltage-source":
      return [`V=${formatSiValue(behavior.volts, "V")}`]
    case "dc-power-rail":
      return [
        `V=${formatSiValue(behavior.volts, "V")}`,
        `reference=${behavior.referenceNet}`,
      ]
    case "sine-voltage-source":
      return [
        `peak=${formatSiValue(behavior.amplitudeVolts, "V")}`,
        `frequency=${formatSiValue(behavior.frequencyHertz, "Hz")}`,
      ]
    case "pulse-voltage-source":
      return [
        `initial=${formatSiValue(behavior.initialVolts, "V")}`,
        `pulsed=${formatSiValue(behavior.pulsedVolts, "V")}`,
        `frequency=${formatSiValue(behavior.frequencyHertz, "Hz")}`,
        `duty=${behavior.dutyCyclePercent}%`,
        `delay=${formatSiValue(behavior.delaySeconds, "s")}`,
        `rise=${formatSiValue(behavior.riseTimeSeconds, "s")}`,
        `fall=${formatSiValue(behavior.fallTimeSeconds, "s")}`,
      ]
    case "dc-current-source":
      return [`I=${formatSiValue(behavior.amps, "A")}`]
    case "switch":
      return [`state=${behavior.state}`]
    case "bipolar-transistor":
      return [
        `polarity=${behavior.polarity}`,
        `beta=${behavior.beta}`,
        `early-voltage=${formatSiValue(behavior.earlyVoltageVolts, "V")}`,
        `saturation-current=${formatSiValue(behavior.saturationCurrentAmps, "A")}`,
        `forward-emission-coefficient=${behavior.forwardEmissionCoefficient}`,
      ]
    case "mosfet":
      return [
        `threshold=${formatSiValue(behavior.thresholdVolts, "V")}`,
        `transconductance=${formatSiValue(behavior.transconductanceAmpsPerVoltSquared, "A/V^2")}`,
        `channel-length-modulation=${formatSiValue(behavior.channelLengthModulationPerVolt, "1/V")}`,
      ]
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
