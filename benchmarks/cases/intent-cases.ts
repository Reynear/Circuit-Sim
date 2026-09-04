import { Schema } from "effect"
import { IntentCaseSchema } from "../intent-schema"
import { circuitBenchmarkCases } from "./circuit-cases"
import { frontierBenchmarkCases } from "./frontier-cases"
import { amplifierAssignmentIntentCases } from "./amplifier-assignment-cases"

const analysis = (durationMs: number, timeStepMs: number) => ({
  durationMs,
  timeStepMs,
})

const approximate = (value: number, absoluteTolerance: number) => ({
  value,
  absoluteTolerance,
})

const netVoltage = (netName: string) => ({ _tag: "NetVoltage", netName })
const branchCurrent = (
  fromNet: string,
  toNet: string,
  componentType: string,
) => ({ _tag: "NetBranchCurrent", fromNet, toNet, componentType })
const componentCurrent = (refdes: string, terminal: string) => ({
  _tag: "ComponentCurrent",
  refdes,
  terminal,
})
const componentPower = (refdes: string) => ({
  _tag: "ComponentPower",
  refdes,
})

const expected = ({
  requiredNetNames,
  statuses = ["success"],
  netVoltages = [],
  componentMeasurements = [],
  traces = [],
  traceRanges = [],
  diagnosticIncludes = [],
}: {
  readonly requiredNetNames: ReadonlyArray<string>
  readonly statuses?: ReadonlyArray<"success" | "partial">
  readonly netVoltages?: ReadonlyArray<unknown>
  readonly componentMeasurements?: ReadonlyArray<unknown>
  readonly traces?: ReadonlyArray<unknown>
  readonly traceRanges?: ReadonlyArray<unknown>
  readonly diagnosticIncludes?: ReadonlyArray<string>
}) => ({
  requiredNetNames,
  statuses,
  netVoltages,
  componentMeasurements,
  traces,
  traceRanges,
  diagnosticIncludes,
})

/**
 * Source records are frozen metadata for authoring the oracle, not instructions
 * included in the agent prompts. Hashes cover the exact claim text used when
 * the fixture was authored.
 */
const source = (
  id: string,
  title: string,
  url: string,
  claims: string,
  claimsSha256: string,
) => ({
  id,
  title,
  url,
  retrievedAt: "2026-08-30",
  claimsSha256,
  claims: [claims],
})

const centerTappedGraph = {
  groundNet: "REF",
  components: [
    {
      type: "sine-voltage-source",
      refdes: "VP",
      props: { amplitudeVolts: 8, frequencyHertz: 50 },
    },
    {
      type: "sine-voltage-source",
      refdes: "VN",
      props: { amplitudeVolts: 8, frequencyHertz: 50 },
    },
    { type: "diode", refdes: "DP", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "diode", refdes: "DN", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 2_000 } },
  ],
  nets: [
    {
      name: "AC_P",
      terminals: [
        { refdes: "VP", pin: "positive" },
        { refdes: "DP", pin: "anode" },
      ],
    },
    {
      name: "AC_N",
      terminals: [
        { refdes: "VN", pin: "negative" },
        { refdes: "DN", pin: "anode" },
      ],
    },
    {
      name: "VOUT",
      terminals: [
        { refdes: "DP", pin: "cathode" },
        { refdes: "DN", pin: "cathode" },
        { refdes: "RLOAD", pin: "a" },
      ],
    },
    {
      name: "REF",
      terminals: [
        { refdes: "VP", pin: "negative" },
        { refdes: "VN", pin: "positive" },
        { refdes: "RLOAD", pin: "b" },
      ],
    },
  ],
  analysis: analysis(40, 0.02),
}

const rcLowPassGraph = {
  groundNet: "GND",
  components: [
    {
      type: "sine-voltage-source",
      refdes: "V1",
      props: { amplitudeVolts: 1, frequencyHertz: 159.154943 },
    },
    { type: "resistor", refdes: "R1", props: { resistanceOhms: 1_000 } },
    {
      type: "capacitor",
      refdes: "C1",
      props: { capacitanceFarads: 1e-6 },
    },
  ],
  nets: [
    {
      name: "VIN",
      terminals: [
        { refdes: "V1", pin: "positive" },
        { refdes: "R1", pin: "a" },
      ],
    },
    {
      name: "VOUT",
      terminals: [
        { refdes: "R1", pin: "b" },
        { refdes: "C1", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "V1", pin: "negative" },
        { refdes: "C1", pin: "b" },
      ],
    },
  ],
  analysis: analysis(100, 0.02),
}

const seriesRlcGraph = {
  groundNet: "GND",
  components: [
    {
      type: "sine-voltage-source",
      refdes: "V1",
      props: { amplitudeVolts: 1, frequencyHertz: 159.154943 },
    },
    { type: "resistor", refdes: "R1", props: { resistanceOhms: 100 } },
    {
      type: "inductor",
      refdes: "L1",
      props: { inductanceHenries: 0.01 },
    },
    {
      type: "capacitor",
      refdes: "C1",
      props: { capacitanceFarads: 0.0001 },
    },
  ],
  nets: [
    {
      name: "VIN",
      terminals: [
        { refdes: "V1", pin: "positive" },
        { refdes: "R1", pin: "a" },
      ],
    },
    {
      name: "R_NODE",
      terminals: [
        { refdes: "R1", pin: "b" },
        { refdes: "L1", pin: "a" },
      ],
    },
    {
      name: "VOUT",
      terminals: [
        { refdes: "L1", pin: "b" },
        { refdes: "C1", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "V1", pin: "negative" },
        { refdes: "C1", pin: "b" },
      ],
    },
  ],
  analysis: analysis(100, 0.02),
}

const zenerRippleRegulatorGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "VDC", props: { voltageVolts: 12 } },
    {
      type: "sine-voltage-source",
      refdes: "VRIPPLE",
      props: { amplitudeVolts: 1, frequencyHertz: 50 },
    },
    { type: "resistor", refdes: "RS", props: { resistanceOhms: 680 } },
    {
      type: "zener-diode",
      refdes: "DZ1",
      props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 },
    },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 2_200 } },
  ],
  nets: [
    {
      name: "DC_BIAS",
      terminals: [
        { refdes: "VDC", pin: "positive" },
        { refdes: "VRIPPLE", pin: "negative" },
      ],
    },
    {
      name: "RAW",
      terminals: [
        { refdes: "VRIPPLE", pin: "positive" },
        { refdes: "RS", pin: "a" },
      ],
    },
    {
      name: "VREG",
      terminals: [
        { refdes: "RS", pin: "b" },
        { refdes: "DZ1", pin: "cathode" },
        { refdes: "RLOAD", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VDC", pin: "negative" },
        { refdes: "DZ1", pin: "anode" },
        { refdes: "RLOAD", pin: "b" },
      ],
    },
  ],
  analysis: analysis(80, 0.05),
}

const emitterFollowerGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 9 } },
    { type: "resistor", refdes: "RUP", props: { resistanceOhms: 47_000 } },
    { type: "resistor", refdes: "RDOWN", props: { resistanceOhms: 15_000 } },
    { type: "resistor", refdes: "RE", props: { resistanceOhms: 1_000 } },
    { type: "npn-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
  ],
  nets: [
    {
      name: "VCC",
      terminals: [
        { refdes: "V1", pin: "positive" },
        { refdes: "RUP", pin: "a" },
        { refdes: "Q1", pin: "collector" },
      ],
    },
    {
      name: "BASE",
      terminals: [
        { refdes: "RUP", pin: "b" },
        { refdes: "RDOWN", pin: "a" },
        { refdes: "Q1", pin: "base" },
      ],
    },
    {
      name: "EMITTER",
      terminals: [
        { refdes: "Q1", pin: "emitter" },
        { refdes: "RE", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "V1", pin: "negative" },
        { refdes: "RDOWN", pin: "b" },
        { refdes: "RE", pin: "b" },
      ],
    },
  ],
  analysis: analysis(20, 0.1),
}

const invertingOpAmpGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
    { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
    {
      type: "sine-voltage-source",
      refdes: "VIN_SOURCE",
      props: { amplitudeVolts: 1, frequencyHertz: 100 },
    },
    { type: "resistor", refdes: "RIN", props: { resistanceOhms: 10_000 } },
    { type: "resistor", refdes: "RF", props: { resistanceOhms: 40_000 } },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 10_000 } },
    {
      type: "ideal-op-amp-minus-top",
      refdes: "U1",
      props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 },
    },
  ],
  nets: [
    {
      name: "VPLUS",
      terminals: [
        { refdes: "VPOS", pin: "positive" },
        { refdes: "U1", pin: "vPlus" },
      ],
    },
    {
      name: "VMINUS",
      terminals: [
        { refdes: "VNEG", pin: "positive" },
        { refdes: "U1", pin: "vMinus" },
      ],
    },
    {
      name: "VIN",
      terminals: [
        { refdes: "VIN_SOURCE", pin: "positive" },
        { refdes: "RIN", pin: "a" },
      ],
    },
    {
      name: "SUM",
      terminals: [
        { refdes: "RIN", pin: "b" },
        { refdes: "RF", pin: "a" },
        { refdes: "U1", pin: "inverting" },
      ],
    },
    {
      name: "VOUT",
      terminals: [
        { refdes: "RF", pin: "b" },
        { refdes: "RLOAD", pin: "a" },
        { refdes: "U1", pin: "output" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VPOS", pin: "negative" },
        { refdes: "VNEG", pin: "negative" },
        { refdes: "VIN_SOURCE", pin: "negative" },
        { refdes: "RLOAD", pin: "b" },
        { refdes: "U1", pin: "nonInverting" },
      ],
    },
  ],
  analysis: analysis(40, 0.05),
}

const nmosLowSideSwitchGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "VDD", props: { voltageVolts: 5 } },
    {
      type: "sine-voltage-source",
      refdes: "VGATE",
      props: { amplitudeVolts: 5, frequencyHertz: 50 },
    },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 330 } },
    { type: "n-mosfet", refdes: "M1", props: { thresholdVolts: 2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
  ],
  nets: [
    {
      name: "VDD",
      terminals: [
        { refdes: "VDD", pin: "positive" },
        { refdes: "RLOAD", pin: "a" },
      ],
    },
    {
      name: "GATE",
      terminals: [
        { refdes: "VGATE", pin: "positive" },
        { refdes: "M1", pin: "gate" },
      ],
    },
    {
      name: "DRAIN",
      terminals: [
        { refdes: "RLOAD", pin: "b" },
        { refdes: "M1", pin: "drain" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VDD", pin: "negative" },
        { refdes: "VGATE", pin: "negative" },
        { refdes: "M1", pin: "source" },
      ],
    },
  ],
  analysis: analysis(80, 0.05),
}

const commonEmitterAmplifierGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 9 } },
    {
      type: "dc-voltage-source",
      refdes: "VBIAS",
      props: { voltageVolts: 1.5 },
    },
    {
      type: "sine-voltage-source",
      refdes: "VSIGNAL",
      props: { amplitudeVolts: 0.02, frequencyHertz: 100 },
    },
    { type: "resistor", refdes: "RB", props: { resistanceOhms: 10_000 } },
    { type: "resistor", refdes: "RC", props: { resistanceOhms: 3_300 } },
    { type: "resistor", refdes: "RE", props: { resistanceOhms: 1_000 } },
    { type: "npn-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
  ],
  nets: [
    {
      name: "VCC",
      terminals: [
        { refdes: "VCC", pin: "positive" },
        { refdes: "RC", pin: "a" },
      ],
    },
    {
      name: "BIAS",
      terminals: [
        { refdes: "VBIAS", pin: "positive" },
        { refdes: "VSIGNAL", pin: "negative" },
      ],
    },
    {
      name: "INPUT",
      terminals: [
        { refdes: "VSIGNAL", pin: "positive" },
        { refdes: "RB", pin: "a" },
      ],
    },
    {
      name: "BASE",
      terminals: [
        { refdes: "RB", pin: "b" },
        { refdes: "Q1", pin: "base" },
      ],
    },
    {
      name: "COLLECTOR",
      terminals: [
        { refdes: "RC", pin: "b" },
        { refdes: "Q1", pin: "collector" },
      ],
    },
    {
      name: "EMITTER",
      terminals: [
        { refdes: "Q1", pin: "emitter" },
        { refdes: "RE", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VCC", pin: "negative" },
        { refdes: "VBIAS", pin: "negative" },
        { refdes: "RE", pin: "b" },
      ],
    },
  ],
  analysis: analysis(60, 0.1),
}

const zenerBjtSeriesRegulatorGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 12 } },
    { type: "resistor", refdes: "RZ", props: { resistanceOhms: 680 } },
    {
      type: "zener-diode",
      refdes: "DZ1",
      props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 },
    },
    { type: "npn-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 330 } },
  ],
  nets: [
    {
      name: "VCC",
      terminals: [
        { refdes: "V1", pin: "positive" },
        { refdes: "RZ", pin: "a" },
        { refdes: "Q1", pin: "collector" },
      ],
    },
    {
      name: "ZREF",
      terminals: [
        { refdes: "RZ", pin: "b" },
        { refdes: "DZ1", pin: "cathode" },
        { refdes: "Q1", pin: "base" },
      ],
    },
    {
      name: "VOUT",
      terminals: [
        { refdes: "Q1", pin: "emitter" },
        { refdes: "RLOAD", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "V1", pin: "negative" },
        { refdes: "DZ1", pin: "anode" },
        { refdes: "RLOAD", pin: "b" },
      ],
    },
  ],
  analysis: analysis(20, 0.1),
}

const pmosHighSideSwitchGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "VDD", props: { voltageVolts: 5 } },
    {
      type: "sine-voltage-source",
      refdes: "VGATE",
      props: { amplitudeVolts: 5, frequencyHertz: 50 },
    },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 330 } },
    { type: "p-mosfet", refdes: "M1", props: { thresholdVolts: -2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
  ],
  nets: [
    {
      name: "VDD",
      terminals: [
        { refdes: "VDD", pin: "positive" },
        { refdes: "M1", pin: "source" },
      ],
    },
    {
      name: "GATE",
      terminals: [
        { refdes: "VGATE", pin: "positive" },
        { refdes: "M1", pin: "gate" },
      ],
    },
    {
      name: "OUTPUT",
      terminals: [
        { refdes: "M1", pin: "drain" },
        { refdes: "RLOAD", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VDD", pin: "negative" },
        { refdes: "VGATE", pin: "negative" },
        { refdes: "RLOAD", pin: "b" },
      ],
    },
  ],
  analysis: analysis(80, 0.05),
}

const bufferedZenerReferenceGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 12 } },
    { type: "resistor", refdes: "RZ", props: { resistanceOhms: 680 } },
    {
      type: "zener-diode",
      refdes: "DZ1",
      props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 },
    },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 330 } },
    {
      type: "ideal-op-amp-minus-top",
      refdes: "U1",
      props: { gain: 100_000, minOutputVolts: 0, maxOutputVolts: 10 },
    },
  ],
  nets: [
    {
      name: "VCC",
      terminals: [
        { refdes: "VCC", pin: "positive" },
        { refdes: "RZ", pin: "a" },
        { refdes: "U1", pin: "vPlus" },
      ],
    },
    {
      name: "ZREF",
      terminals: [
        { refdes: "RZ", pin: "b" },
        { refdes: "DZ1", pin: "cathode" },
        { refdes: "U1", pin: "nonInverting" },
      ],
    },
    {
      name: "VOUT",
      terminals: [
        { refdes: "U1", pin: "inverting" },
        { refdes: "U1", pin: "output" },
        { refdes: "RLOAD", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VCC", pin: "negative" },
        { refdes: "DZ1", pin: "anode" },
        { refdes: "U1", pin: "vMinus" },
        { refdes: "RLOAD", pin: "b" },
      ],
    },
  ],
  analysis: analysis(20, 0.1),
}

const smoothedBridgeSupplyGraph = {
  groundNet: "GND",
  components: [
    {
      type: "sine-voltage-source",
      refdes: "VAC",
      props: { amplitudeVolts: 10, frequencyHertz: 50 },
    },
    { type: "diode", refdes: "D1", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "diode", refdes: "D2", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "diode", refdes: "D3", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "diode", refdes: "D4", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    {
      type: "capacitor",
      refdes: "C1",
      props: { capacitanceFarads: 0.00047 },
    },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
  ],
  nets: [
    {
      name: "AC_P",
      terminals: [
        { refdes: "VAC", pin: "positive" },
        { refdes: "D1", pin: "anode" },
        { refdes: "D3", pin: "cathode" },
      ],
    },
    {
      name: "AC_N",
      terminals: [
        { refdes: "VAC", pin: "negative" },
        { refdes: "D2", pin: "anode" },
        { refdes: "D4", pin: "cathode" },
      ],
    },
    {
      name: "VOUT",
      terminals: [
        { refdes: "D1", pin: "cathode" },
        { refdes: "D2", pin: "cathode" },
        { refdes: "C1", pin: "a" },
        { refdes: "RLOAD", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "D3", pin: "anode" },
        { refdes: "D4", pin: "anode" },
        { refdes: "C1", pin: "b" },
        { refdes: "RLOAD", pin: "b" },
      ],
    },
  ],
  analysis: analysis(120, 0.1),
}

const nonInvertingTransientGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
    { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
    {
      type: "sine-voltage-source",
      refdes: "VIN_SOURCE",
      props: { amplitudeVolts: 0.5, frequencyHertz: 200 },
    },
    { type: "resistor", refdes: "RG", props: { resistanceOhms: 10_000 } },
    { type: "resistor", refdes: "RF", props: { resistanceOhms: 50_000 } },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 20_000 } },
    {
      type: "ideal-op-amp-minus-top",
      refdes: "U1",
      props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 },
    },
  ],
  nets: [
    {
      name: "VPLUS",
      terminals: [
        { refdes: "VPOS", pin: "positive" },
        { refdes: "U1", pin: "vPlus" },
      ],
    },
    {
      name: "VMINUS",
      terminals: [
        { refdes: "VNEG", pin: "positive" },
        { refdes: "U1", pin: "vMinus" },
      ],
    },
    {
      name: "INPUT",
      terminals: [
        { refdes: "VIN_SOURCE", pin: "positive" },
        { refdes: "U1", pin: "nonInverting" },
      ],
    },
    {
      name: "FEEDBACK",
      terminals: [
        { refdes: "RG", pin: "a" },
        { refdes: "RF", pin: "a" },
        { refdes: "U1", pin: "inverting" },
      ],
    },
    {
      name: "VOUT",
      terminals: [
        { refdes: "RF", pin: "b" },
        { refdes: "RLOAD", pin: "a" },
        { refdes: "U1", pin: "output" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VPOS", pin: "negative" },
        { refdes: "VNEG", pin: "negative" },
        { refdes: "VIN_SOURCE", pin: "negative" },
        { refdes: "RG", pin: "b" },
        { refdes: "RLOAD", pin: "b" },
      ],
    },
  ],
  analysis: analysis(30, 0.05),
}

const nmosSourceFollowerGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "VDD", props: { voltageVolts: 9 } },
    { type: "dc-voltage-source", refdes: "VG", props: { voltageVolts: 5 } },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
    { type: "n-mosfet", refdes: "M1", props: { thresholdVolts: 2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
  ],
  nets: [
    {
      name: "VDD",
      terminals: [
        { refdes: "VDD", pin: "positive" },
        { refdes: "M1", pin: "drain" },
      ],
    },
    {
      name: "GATE",
      terminals: [
        { refdes: "VG", pin: "positive" },
        { refdes: "M1", pin: "gate" },
      ],
    },
    {
      name: "SOURCE",
      terminals: [
        { refdes: "M1", pin: "source" },
        { refdes: "RLOAD", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VDD", pin: "negative" },
        { refdes: "VG", pin: "negative" },
        { refdes: "RLOAD", pin: "b" },
      ],
    },
  ],
  analysis: analysis(20, 0.1),
}

const bjtBehavioralFollowerGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 9 } },
    { type: "dc-voltage-source", refdes: "VB", props: { voltageVolts: 3 } },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
    { type: "npn-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
  ],
  nets: [
    {
      name: "VCC",
      terminals: [
        { refdes: "VCC", pin: "positive" },
        { refdes: "Q1", pin: "collector" },
      ],
    },
    {
      name: "BASE",
      terminals: [
        { refdes: "VB", pin: "positive" },
        { refdes: "Q1", pin: "base" },
      ],
    },
    {
      name: "VOUT",
      terminals: [
        { refdes: "Q1", pin: "emitter" },
        { refdes: "RLOAD", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VCC", pin: "negative" },
        { refdes: "VB", pin: "negative" },
        { refdes: "RLOAD", pin: "b" },
      ],
    },
  ],
  analysis: analysis(20, 0.1),
}

const asymmetricZenerClipperGraph = {
  groundNet: "GND",
  components: [
    {
      type: "sine-voltage-source",
      refdes: "VIN_SOURCE",
      props: { amplitudeVolts: 8, frequencyHertz: 100 },
    },
    { type: "resistor", refdes: "RS", props: { resistanceOhms: 1_000 } },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 10_000 } },
    {
      type: "zener-diode",
      refdes: "DZ1",
      props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 },
    },
  ],
  nets: [
    {
      name: "INPUT",
      terminals: [
        { refdes: "VIN_SOURCE", pin: "positive" },
        { refdes: "RS", pin: "a" },
      ],
    },
    {
      name: "OUTPUT",
      terminals: [
        { refdes: "RS", pin: "b" },
        { refdes: "RLOAD", pin: "a" },
        { refdes: "DZ1", pin: "cathode" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VIN_SOURCE", pin: "negative" },
        { refdes: "RLOAD", pin: "b" },
        { refdes: "DZ1", pin: "anode" },
      ],
    },
  ],
  analysis: analysis(40, 0.02),
}

const rcHighPassGraph = {
  groundNet: "GND",
  components: [
    {
      type: "sine-voltage-source",
      refdes: "V1",
      props: { amplitudeVolts: 1, frequencyHertz: 159.154943 },
    },
    { type: "capacitor", refdes: "C1", props: { capacitanceFarads: 1e-6 } },
    { type: "resistor", refdes: "R1", props: { resistanceOhms: 1_000 } },
  ],
  nets: [
    {
      name: "INPUT",
      terminals: [
        { refdes: "V1", pin: "positive" },
        { refdes: "C1", pin: "a" },
      ],
    },
    {
      name: "OUTPUT",
      terminals: [
        { refdes: "C1", pin: "b" },
        { refdes: "R1", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "V1", pin: "negative" },
        { refdes: "R1", pin: "b" },
      ],
    },
  ],
  analysis: analysis(100, 0.02),
}

const bjtDividerBiasGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 12 } },
    { type: "resistor", refdes: "RUP", props: { resistanceOhms: 56_000 } },
    { type: "resistor", refdes: "RDOWN", props: { resistanceOhms: 10_000 } },
    { type: "resistor", refdes: "RC", props: { resistanceOhms: 2_000 } },
    { type: "resistor", refdes: "RE", props: { resistanceOhms: 1_000 } },
    { type: "npn-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
  ],
  nets: [
    {
      name: "VCC",
      terminals: [
        { refdes: "VCC", pin: "positive" },
        { refdes: "RUP", pin: "a" },
        { refdes: "RC", pin: "a" },
      ],
    },
    {
      name: "BASE",
      terminals: [
        { refdes: "RUP", pin: "b" },
        { refdes: "RDOWN", pin: "a" },
        { refdes: "Q1", pin: "base" },
      ],
    },
    {
      name: "COLLECTOR",
      terminals: [
        { refdes: "RC", pin: "b" },
        { refdes: "Q1", pin: "collector" },
      ],
    },
    {
      name: "EMITTER",
      terminals: [
        { refdes: "Q1", pin: "emitter" },
        { refdes: "RE", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VCC", pin: "negative" },
        { refdes: "RDOWN", pin: "b" },
        { refdes: "RE", pin: "b" },
      ],
    },
  ],
  analysis: analysis(20, 0.1),
}

const zenerNmosRegulatorGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 12 } },
    { type: "resistor", refdes: "RZ", props: { resistanceOhms: 680 } },
    { type: "zener-diode", refdes: "DZ1", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
    { type: "n-mosfet", refdes: "M1", props: { thresholdVolts: 2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
  ],
  nets: [
    {
      name: "VCC",
      terminals: [
        { refdes: "VCC", pin: "positive" },
        { refdes: "RZ", pin: "a" },
        { refdes: "M1", pin: "drain" },
      ],
    },
    {
      name: "ZREF",
      terminals: [
        { refdes: "RZ", pin: "b" },
        { refdes: "DZ1", pin: "cathode" },
        { refdes: "M1", pin: "gate" },
      ],
    },
    {
      name: "VOUT",
      terminals: [
        { refdes: "M1", pin: "source" },
        { refdes: "RLOAD", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VCC", pin: "negative" },
        { refdes: "DZ1", pin: "anode" },
        { refdes: "RLOAD", pin: "b" },
      ],
    },
  ],
  analysis: analysis(20, 0.1),
}

const halfWaveRectifierGraph = {
  groundNet: "GND",
  components: [
    {
      type: "sine-voltage-source",
      refdes: "V1",
      props: { amplitudeVolts: 8, frequencyHertz: 50 },
    },
    { type: "diode", refdes: "D1", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
  ],
  nets: [
    {
      name: "INPUT",
      terminals: [
        { refdes: "V1", pin: "positive" },
        { refdes: "D1", pin: "anode" },
      ],
    },
    {
      name: "OUTPUT",
      terminals: [
        { refdes: "D1", pin: "cathode" },
        { refdes: "RLOAD", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "V1", pin: "negative" },
        { refdes: "RLOAD", pin: "b" },
      ],
    },
  ],
  analysis: analysis(60, 0.05),
}

const insideWindowComparatorGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 5 } },
    { type: "dc-voltage-source", refdes: "VLOWER", props: { voltageVolts: 2 } },
    { type: "dc-voltage-source", refdes: "VUPPER", props: { voltageVolts: 3 } },
    { type: "dc-voltage-source", refdes: "VIN", props: { voltageVolts: 2.5 } },
    {
      type: "ideal-op-amp-minus-top",
      refdes: "ULOW",
      props: { gain: 100_000, minOutputVolts: 0, maxOutputVolts: 5 },
    },
    {
      type: "ideal-op-amp-minus-top",
      refdes: "UHIGH",
      props: { gain: 100_000, minOutputVolts: 0, maxOutputVolts: 5 },
    },
  ],
  nets: [
    {
      name: "VCC",
      terminals: [
        { refdes: "VCC", pin: "positive" },
        { refdes: "ULOW", pin: "vPlus" },
        { refdes: "UHIGH", pin: "vPlus" },
      ],
    },
    {
      name: "LOWER",
      terminals: [
        { refdes: "VLOWER", pin: "positive" },
        { refdes: "ULOW", pin: "inverting" },
      ],
    },
    {
      name: "UPPER",
      terminals: [
        { refdes: "VUPPER", pin: "positive" },
        { refdes: "UHIGH", pin: "nonInverting" },
      ],
    },
    {
      name: "INPUT",
      terminals: [
        { refdes: "VIN", pin: "positive" },
        { refdes: "ULOW", pin: "nonInverting" },
        { refdes: "UHIGH", pin: "inverting" },
      ],
    },
    { name: "LOW_OK", terminals: [{ refdes: "ULOW", pin: "output" }] },
    { name: "HIGH_OK", terminals: [{ refdes: "UHIGH", pin: "output" }] },
    {
      name: "GND",
      terminals: [
        { refdes: "VCC", pin: "negative" },
        { refdes: "VLOWER", pin: "negative" },
        { refdes: "VUPPER", pin: "negative" },
        { refdes: "VIN", pin: "negative" },
        { refdes: "ULOW", pin: "vMinus" },
        { refdes: "UHIGH", pin: "vMinus" },
      ],
    },
  ],
  analysis: analysis(20, 0.1),
}

const clippedCommonEmitterGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 12 } },
    { type: "dc-voltage-source", refdes: "VBIAS", props: { voltageVolts: 2 } },
    {
      type: "sine-voltage-source",
      refdes: "VIN",
      props: { amplitudeVolts: 4, frequencyHertz: 100 },
    },
    { type: "resistor", refdes: "RC", props: { resistanceOhms: 2_000 } },
    { type: "resistor", refdes: "RE", props: { resistanceOhms: 1_000 } },
    { type: "npn-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
  ],
  nets: [
    {
      name: "VCC",
      terminals: [
        { refdes: "VCC", pin: "positive" },
        { refdes: "RC", pin: "a" },
      ],
    },
    {
      name: "BIAS",
      terminals: [
        { refdes: "VBIAS", pin: "positive" },
        { refdes: "VIN", pin: "negative" },
      ],
    },
    {
      name: "INPUT",
      terminals: [
        { refdes: "VIN", pin: "positive" },
        { refdes: "Q1", pin: "base" },
      ],
    },
    {
      name: "COLLECTOR",
      terminals: [
        { refdes: "RC", pin: "b" },
        { refdes: "Q1", pin: "collector" },
      ],
    },
    {
      name: "EMITTER",
      terminals: [
        { refdes: "Q1", pin: "emitter" },
        { refdes: "RE", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VCC", pin: "negative" },
        { refdes: "VBIAS", pin: "negative" },
        { refdes: "RE", pin: "b" },
      ],
    },
  ],
  analysis: analysis(40, 0.02),
}

const bridgeLoadComparisonGraph = {
  groundNet: "GND",
  components: [
    {
      type: "sine-voltage-source",
      refdes: "VAC",
      props: { amplitudeVolts: 10, frequencyHertz: 50 },
    },
    { type: "diode", refdes: "DL1", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "diode", refdes: "DL2", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "diode", refdes: "DL3", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "diode", refdes: "DL4", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "diode", refdes: "DH1", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "diode", refdes: "DH2", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "diode", refdes: "DH3", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "diode", refdes: "DH4", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    {
      type: "capacitor",
      refdes: "CL",
      props: { capacitanceFarads: 0.00047 },
    },
    {
      type: "capacitor",
      refdes: "CH",
      props: { capacitanceFarads: 0.00047 },
    },
    { type: "resistor", refdes: "RLIGHT", props: { resistanceOhms: 2_000 } },
    { type: "resistor", refdes: "RHEAVY", props: { resistanceOhms: 330 } },
  ],
  nets: [
    {
      name: "AC_P",
      terminals: [
        { refdes: "VAC", pin: "positive" },
        { refdes: "DL1", pin: "anode" },
        { refdes: "DL3", pin: "cathode" },
        { refdes: "DH1", pin: "anode" },
        { refdes: "DH3", pin: "cathode" },
      ],
    },
    {
      name: "AC_N",
      terminals: [
        { refdes: "VAC", pin: "negative" },
        { refdes: "DL2", pin: "anode" },
        { refdes: "DL4", pin: "cathode" },
        { refdes: "DH2", pin: "anode" },
        { refdes: "DH4", pin: "cathode" },
      ],
    },
    {
      name: "LIGHT_OUT",
      terminals: [
        { refdes: "DL1", pin: "cathode" },
        { refdes: "DL2", pin: "cathode" },
        { refdes: "CL", pin: "a" },
        { refdes: "RLIGHT", pin: "a" },
      ],
    },
    {
      name: "HEAVY_OUT",
      terminals: [
        { refdes: "DH1", pin: "cathode" },
        { refdes: "DH2", pin: "cathode" },
        { refdes: "CH", pin: "a" },
        { refdes: "RHEAVY", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "DL3", pin: "anode" },
        { refdes: "DL4", pin: "anode" },
        { refdes: "DH3", pin: "anode" },
        { refdes: "DH4", pin: "anode" },
        { refdes: "CL", pin: "b" },
        { refdes: "CH", pin: "b" },
        { refdes: "RLIGHT", pin: "b" },
        { refdes: "RHEAVY", pin: "b" },
      ],
    },
  ],
  analysis: analysis(120, 0.1),
}

const followerComparisonGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 9 } },
    { type: "dc-voltage-source", refdes: "VIN", props: { voltageVolts: 4 } },
    { type: "resistor", refdes: "RBS", props: { resistanceOhms: 10_000 } },
    { type: "resistor", refdes: "RBD", props: { resistanceOhms: 10_000 } },
    { type: "resistor", refdes: "RLS", props: { resistanceOhms: 1_000 } },
    { type: "resistor", refdes: "RLD", props: { resistanceOhms: 1_000 } },
    { type: "npn-transistor", refdes: "QS", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
    { type: "npn-transistor", refdes: "QD1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
    { type: "npn-transistor", refdes: "QD2", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
  ],
  nets: [
    {
      name: "VCC",
      terminals: [
        { refdes: "VCC", pin: "positive" },
        { refdes: "QS", pin: "collector" },
        { refdes: "QD1", pin: "collector" },
        { refdes: "QD2", pin: "collector" },
      ],
    },
    {
      name: "INPUT",
      terminals: [
        { refdes: "VIN", pin: "positive" },
        { refdes: "RBS", pin: "a" },
        { refdes: "RBD", pin: "a" },
      ],
    },
    {
      name: "SINGLE_BASE",
      terminals: [
        { refdes: "RBS", pin: "b" },
        { refdes: "QS", pin: "base" },
      ],
    },
    {
      name: "SINGLE_OUT",
      terminals: [
        { refdes: "QS", pin: "emitter" },
        { refdes: "RLS", pin: "a" },
      ],
    },
    {
      name: "DARLINGTON_BASE",
      terminals: [
        { refdes: "RBD", pin: "b" },
        { refdes: "QD1", pin: "base" },
      ],
    },
    {
      name: "DARLINGTON_MID",
      terminals: [
        { refdes: "QD1", pin: "emitter" },
        { refdes: "QD2", pin: "base" },
      ],
    },
    {
      name: "DARLINGTON_OUT",
      terminals: [
        { refdes: "QD2", pin: "emitter" },
        { refdes: "RLD", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VCC", pin: "negative" },
        { refdes: "VIN", pin: "negative" },
        { refdes: "RLS", pin: "b" },
        { refdes: "RLD", pin: "b" },
      ],
    },
  ],
  analysis: analysis(20, 0.1),
}

const bridgeZenerRegulatorGraph = {
  groundNet: "GND",
  components: [
    {
      type: "sine-voltage-source",
      refdes: "VAC",
      props: { amplitudeVolts: 10, frequencyHertz: 50 },
    },
    { type: "diode", refdes: "D1", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "diode", refdes: "D2", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "diode", refdes: "D3", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "diode", refdes: "D4", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    {
      type: "capacitor",
      refdes: "C1",
      props: { capacitanceFarads: 0.00047 },
    },
    { type: "resistor", refdes: "RZ", props: { resistanceOhms: 220 } },
    { type: "zener-diode", refdes: "DZ", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
  ],
  nets: [
    {
      name: "AC_P",
      terminals: [
        { refdes: "VAC", pin: "positive" },
        { refdes: "D1", pin: "anode" },
        { refdes: "D3", pin: "cathode" },
      ],
    },
    {
      name: "AC_N",
      terminals: [
        { refdes: "VAC", pin: "negative" },
        { refdes: "D2", pin: "anode" },
        { refdes: "D4", pin: "cathode" },
      ],
    },
    {
      name: "RAW_DC",
      terminals: [
        { refdes: "D1", pin: "cathode" },
        { refdes: "D2", pin: "cathode" },
        { refdes: "C1", pin: "a" },
        { refdes: "RZ", pin: "a" },
      ],
    },
    {
      name: "REGULATED",
      terminals: [
        { refdes: "RZ", pin: "b" },
        { refdes: "DZ", pin: "cathode" },
        { refdes: "RLOAD", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "D3", pin: "anode" },
        { refdes: "D4", pin: "anode" },
        { refdes: "C1", pin: "b" },
        { refdes: "DZ", pin: "anode" },
        { refdes: "RLOAD", pin: "b" },
      ],
    },
  ],
  analysis: analysis(120, 0.1),
}

const schmittTriggerGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
    { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
    {
      type: "sine-voltage-source",
      refdes: "VIN",
      props: { amplitudeVolts: 5, frequencyHertz: 100 },
    },
    { type: "resistor", refdes: "RFB", props: { resistanceOhms: 30_000 } },
    { type: "resistor", refdes: "RG", props: { resistanceOhms: 10_000 } },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 10_000 } },
    {
      type: "ideal-op-amp-minus-top",
      refdes: "U1",
      props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 },
    },
  ],
  nets: [
    {
      name: "VPLUS",
      terminals: [
        { refdes: "VPOS", pin: "positive" },
        { refdes: "U1", pin: "vPlus" },
      ],
    },
    {
      name: "VMINUS",
      terminals: [
        { refdes: "VNEG", pin: "positive" },
        { refdes: "U1", pin: "vMinus" },
      ],
    },
    {
      name: "INPUT",
      terminals: [
        { refdes: "VIN", pin: "positive" },
        { refdes: "U1", pin: "inverting" },
      ],
    },
    {
      name: "THRESHOLD",
      terminals: [
        { refdes: "RFB", pin: "b" },
        { refdes: "RG", pin: "a" },
        { refdes: "U1", pin: "nonInverting" },
      ],
    },
    {
      name: "VOUT",
      terminals: [
        { refdes: "U1", pin: "output" },
        { refdes: "RFB", pin: "a" },
        { refdes: "RLOAD", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VPOS", pin: "negative" },
        { refdes: "VNEG", pin: "negative" },
        { refdes: "VIN", pin: "negative" },
        { refdes: "RG", pin: "b" },
        { refdes: "RLOAD", pin: "b" },
      ],
    },
  ],
  analysis: analysis(40, 0.02),
}

const positiveClamperGraph = {
  groundNet: "GND",
  components: [
    {
      type: "sine-voltage-source",
      refdes: "VIN",
      props: { amplitudeVolts: 5, frequencyHertz: 100 },
    },
    {
      type: "capacitor",
      refdes: "C1",
      props: { capacitanceFarads: 0.00001 },
    },
    { type: "diode", refdes: "D1", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "resistor", refdes: "R1", props: { resistanceOhms: 100_000 } },
  ],
  nets: [
    {
      name: "INPUT",
      terminals: [
        { refdes: "VIN", pin: "positive" },
        { refdes: "C1", pin: "a" },
      ],
    },
    {
      name: "CLAMPED",
      terminals: [
        { refdes: "C1", pin: "b" },
        { refdes: "D1", pin: "cathode" },
        { refdes: "R1", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VIN", pin: "negative" },
        { refdes: "D1", pin: "anode" },
        { refdes: "R1", pin: "b" },
      ],
    },
  ],
  analysis: analysis(120, 0.05),
}

const voltageDoublerGraph = {
  groundNet: "GND",
  components: [
    {
      type: "sine-voltage-source",
      refdes: "VIN",
      props: { amplitudeVolts: 5, frequencyHertz: 100 },
    },
    {
      type: "capacitor",
      refdes: "CPUMP",
      props: { capacitanceFarads: 0.0001 },
    },
    { type: "diode", refdes: "DCLAMP", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "diode", refdes: "DCHARGE", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    {
      type: "capacitor",
      refdes: "COUT",
      props: { capacitanceFarads: 0.0001 },
    },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 10_000 } },
  ],
  nets: [
    {
      name: "INPUT",
      terminals: [
        { refdes: "VIN", pin: "positive" },
        { refdes: "CPUMP", pin: "a" },
      ],
    },
    {
      name: "PUMP",
      terminals: [
        { refdes: "CPUMP", pin: "b" },
        { refdes: "DCLAMP", pin: "cathode" },
        { refdes: "DCHARGE", pin: "anode" },
      ],
    },
    {
      name: "VOUT",
      terminals: [
        { refdes: "DCHARGE", pin: "cathode" },
        { refdes: "COUT", pin: "a" },
        { refdes: "RLOAD", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VIN", pin: "negative" },
        { refdes: "DCLAMP", pin: "anode" },
        { refdes: "COUT", pin: "b" },
        { refdes: "RLOAD", pin: "b" },
      ],
    },
  ],
  analysis: analysis(200, 0.1),
}

const comparatorDutyGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 5 } },
    { type: "dc-voltage-source", refdes: "VREF", props: { voltageVolts: 2.5 } },
    {
      type: "sine-voltage-source",
      refdes: "VIN",
      props: { amplitudeVolts: 5, frequencyHertz: 100 },
    },
    { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
    {
      type: "ideal-op-amp-minus-top",
      refdes: "U1",
      props: { gain: 100_000, minOutputVolts: 0, maxOutputVolts: 5 },
    },
  ],
  nets: [
    {
      name: "VCC",
      terminals: [
        { refdes: "VCC", pin: "positive" },
        { refdes: "U1", pin: "vPlus" },
      ],
    },
    {
      name: "INPUT",
      terminals: [
        { refdes: "VIN", pin: "positive" },
        { refdes: "U1", pin: "nonInverting" },
      ],
    },
    {
      name: "REFERENCE",
      terminals: [
        { refdes: "VREF", pin: "positive" },
        { refdes: "U1", pin: "inverting" },
      ],
    },
    {
      name: "OUTPUT",
      terminals: [
        { refdes: "U1", pin: "output" },
        { refdes: "RLOAD", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VCC", pin: "negative" },
        { refdes: "VREF", pin: "negative" },
        { refdes: "VIN", pin: "negative" },
        { refdes: "U1", pin: "vMinus" },
        { refdes: "RLOAD", pin: "b" },
      ],
    },
  ],
  analysis: analysis(40, 0.02),
}

const envelopeLoadComparisonGraph = {
  groundNet: "GND",
  components: [
    {
      type: "sine-voltage-source",
      refdes: "VIN",
      props: { amplitudeVolts: 5, frequencyHertz: 1_000 },
    },
    { type: "diode", refdes: "DL", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "diode", refdes: "DH", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
    { type: "capacitor", refdes: "CL", props: { capacitanceFarads: 0.000001 } },
    { type: "capacitor", refdes: "CH", props: { capacitanceFarads: 0.000001 } },
    { type: "resistor", refdes: "RL", props: { resistanceOhms: 100_000 } },
    { type: "resistor", refdes: "RH", props: { resistanceOhms: 5_000 } },
  ],
  nets: [
    {
      name: "INPUT",
      terminals: [
        { refdes: "VIN", pin: "positive" },
        { refdes: "DL", pin: "anode" },
        { refdes: "DH", pin: "anode" },
      ],
    },
    {
      name: "LIGHT_ENV",
      terminals: [
        { refdes: "DL", pin: "cathode" },
        { refdes: "CL", pin: "a" },
        { refdes: "RL", pin: "a" },
      ],
    },
    {
      name: "HEAVY_ENV",
      terminals: [
        { refdes: "DH", pin: "cathode" },
        { refdes: "CH", pin: "a" },
        { refdes: "RH", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VIN", pin: "negative" },
        { refdes: "CL", pin: "b" },
        { refdes: "CH", pin: "b" },
        { refdes: "RL", pin: "b" },
        { refdes: "RH", pin: "b" },
      ],
    },
  ],
  analysis: analysis(30, 0.01),
}

const nmosDegenerationTransientGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-voltage-source", refdes: "VDD", props: { voltageVolts: 12 } },
    { type: "dc-voltage-source", refdes: "VBIAS", props: { voltageVolts: 2.5 } },
    {
      type: "sine-voltage-source",
      refdes: "VIN",
      props: { amplitudeVolts: 0.25, frequencyHertz: 100 },
    },
    { type: "resistor", refdes: "RDF", props: { resistanceOhms: 2_000 } },
    { type: "resistor", refdes: "RDD", props: { resistanceOhms: 2_000 } },
    { type: "resistor", refdes: "RS", props: { resistanceOhms: 470 } },
    { type: "n-mosfet", refdes: "MFIXED", props: { thresholdVolts: 2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
    { type: "n-mosfet", refdes: "MDEG", props: { thresholdVolts: 2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
  ],
  nets: [
    {
      name: "VDD",
      terminals: [
        { refdes: "VDD", pin: "positive" },
        { refdes: "RDF", pin: "a" },
        { refdes: "RDD", pin: "a" },
      ],
    },
    {
      name: "BIAS",
      terminals: [
        { refdes: "VBIAS", pin: "positive" },
        { refdes: "VIN", pin: "negative" },
      ],
    },
    {
      name: "GATE",
      terminals: [
        { refdes: "VIN", pin: "positive" },
        { refdes: "MFIXED", pin: "gate" },
        { refdes: "MDEG", pin: "gate" },
      ],
    },
    {
      name: "FIXED_DRAIN",
      terminals: [
        { refdes: "RDF", pin: "b" },
        { refdes: "MFIXED", pin: "drain" },
      ],
    },
    {
      name: "DEGENERATED_DRAIN",
      terminals: [
        { refdes: "RDD", pin: "b" },
        { refdes: "MDEG", pin: "drain" },
      ],
    },
    {
      name: "DEGENERATED_SOURCE",
      terminals: [
        { refdes: "MDEG", pin: "source" },
        { refdes: "RS", pin: "a" },
      ],
    },
    {
      name: "GND",
      terminals: [
        { refdes: "VDD", pin: "negative" },
        { refdes: "VBIAS", pin: "negative" },
        { refdes: "MFIXED", pin: "source" },
        { refdes: "RS", pin: "b" },
      ],
    },
  ],
  analysis: analysis(40, 0.1),
}

const zenerNpnCurrentSinkGraph = circuitBenchmarkCases.find(
  (benchmark) => benchmark.id === "zener-npn-current-sink",
)!.graph

const bjtDifferentialVsCommonModeGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-bjt-differential-vs-common-mode",
)!.graph

const opAmpLeakyIntegratorGraph = circuitBenchmarkCases.find(
  (benchmark) => benchmark.id === "op-amp-leaky-integrator",
)!.graph

const opAmpPracticalDifferentiatorGraph = circuitBenchmarkCases.find(
  (benchmark) => benchmark.id === "op-amp-practical-differentiator",
)!.graph

const pnpDifferentialVsCommonModeGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-pnp-differential-vs-common-mode",
)!.graph

const zenerRegulatedLedColorsGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-zener-regulated-led-colors",
)!.graph

const pnpCommonEmitterTransientGraph = circuitBenchmarkCases.find(
  (benchmark) => benchmark.id === "pnp-common-emitter-transient",
)!.graph

const zenerPnpCurrentSourceComplianceGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-zener-pnp-current-source-compliance",
)!.graph

const zenerSeriesLedHeadroomGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-zener-series-led-headroom",
)!.graph

const ordinaryVsPrecisionRectifierGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-ordinary-vs-precision-rectifier",
)!.graph

const zenerClampLoadSweepGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-zener-clamp-load-sweep",
)!.graph

const classBVsClassAbCrossoverGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-class-b-vs-class-ab-crossover",
)!.graph

const dualGainTransimpedanceAmplifiersGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-dual-gain-transimpedance-amplifiers",
)!.graph

const complementaryBjtPhaseSplittersGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-complementary-bjt-phase-splitters",
)!.graph

const singleVsStackedZenerReferencesGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-single-vs-stacked-zener-references",
)!.graph

const instrumentationCommonModeRejectionGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-instrumentation-common-mode-rejection",
)!.graph

const bjtEmitterBypassComparisonGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-bjt-emitter-bypass-comparison",
)!.graph

const stackedZenerMidpointLoadSweepGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-stacked-zener-midpoint-load-sweep",
)!.graph

const logarithmicAmplifierCurrentDecadesGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-logarithmic-amplifier-current-decades",
)!.graph

const partialEmitterBypassProgressionGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-bjt-partial-emitter-bypass-progression",
)!.graph

const zenerRippleCapacitanceSweepGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-zener-ripple-capacitance-sweep",
)!.graph

const antilogarithmicAmplifierInputStepsGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-antilogarithmic-amplifier-input-steps",
)!.graph

const ordinaryVsWidlarCurrentSourceGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-ordinary-vs-widlar-current-source",
)!.graph

const zenerDynamicResistanceSweepGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-zener-dynamic-resistance-sweep",
)!.graph

const bjtEarlyEffectCollectorSweepGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-bjt-early-effect-collector-sweep",
)!.graph

const zenerDynamicResistanceLoadLineSweepGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-zener-dynamic-resistance-load-line-sweep",
)!.graph

const logAntilogRecoverySweepGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-log-antilog-recovery-sweep",
)!.graph

const pnpEarlyVoltageOutputResistanceSweepGraph = frontierBenchmarkCases.find(
  (benchmark) =>
    benchmark.id === "frontier-pnp-early-voltage-output-resistance-sweep",
)!.graph

const bjtVbeVceCurrentSurfaceGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-bjt-vbe-vce-current-surface",
)!.graph

const zenerBreakdownResistanceCurrentMatrixGraph = frontierBenchmarkCases.find(
  (benchmark) =>
    benchmark.id === "frontier-zener-breakdown-resistance-current-matrix",
)!.graph

const pmosChannelLengthModulationSweepGraph = frontierBenchmarkCases.find(
  (benchmark) =>
    benchmark.id === "frontier-pmos-channel-length-modulation-sweep",
)!.graph

const nmosTransconductanceOverdriveSurfaceGraph = frontierBenchmarkCases.find(
  (benchmark) =>
    benchmark.id === "frontier-nmos-transconductance-overdrive-surface",
)!.graph

const nmosTriodeSaturationSurfaceGraph = frontierBenchmarkCases.find(
  (benchmark) =>
    benchmark.id === "frontier-nmos-triode-saturation-region-surface",
)!.graph

const diodeSaturationEmissionCurrentMatrixGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-diode-is-n-current-matrix",
)!.graph

const diodeSeriesResistanceCurrentSweepGraph = frontierBenchmarkCases.find(
  (benchmark) =>
    benchmark.id === "frontier-diode-series-resistance-current-sweep",
)!.graph

const diodeEmissionCurrentDecadeSurfaceGraph = frontierBenchmarkCases.find(
  (benchmark) =>
    benchmark.id === "frontier-diode-emission-current-decade-surface",
)!.graph

const bjtSaturationEmissionCurrentMatrixGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-bjt-is-nf-current-matrix",
)!.graph

const complementaryBjtJunctionCurrentSweepGraph = frontierBenchmarkCases.find(
  (benchmark) =>
    benchmark.id === "frontier-complementary-bjt-junction-current-sweep",
)!.graph

const bjtEmissionBaseVoltageCurrentSurfaceGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-bjt-nf-vbe-current-surface",
)!.graph

const zenerBreakdownCurrentOperatingMatrixGraph = frontierBenchmarkCases.find(
  (benchmark) => benchmark.id === "frontier-zener-ibv-current-matrix",
)!.graph

const zenerForwardSaturationEmissionCurrentMatrixGraph =
  frontierBenchmarkCases.find(
    (benchmark) => benchmark.id === "frontier-zener-forward-is-n-current-matrix",
  )!.graph

const zenerBidirectionalParameterOrthogonalityGraph =
  frontierBenchmarkCases.find(
    (benchmark) =>
      benchmark.id === "frontier-zener-bidirectional-parameter-orthogonality",
  )!.graph

export const intentBenchmarkCases = Schema.decodeUnknownSync(
  Schema.Array(IntentCaseSchema),
)([
  {
    id: "intent-center-tapped-rectifier",
    title: "Center-tapped rectifier behavior from intent",
    topologyMode: "exact",
    prompt:
      "Build a circuit that takes a 50 Hz, 8 V-peak bipolar split-secondary input centered on REF and produces a positive, unfiltered pulsating output into a 2 kOhm load. Use REF as the reference/ground and preserve the meaningful input and output nets AC_P, AC_N, and VOUT. Then simulate and answer: which input path is active in each half-cycle, what polarity and repetition rate does the output have, and what peak and average output values do you observe? Explain the observations using the returned evidence.",
    questions: [
      {
        id: "active-paths",
        prompt: "Which input path is active in each half-cycle, and what evidence supports that?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["derived-rectifier-active-paths"],
      },
      {
        id: "output-polarity-rate",
        prompt: "What polarity and repetition rate does the output have?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "derived-rectifier-output-frequency",
          "trace:V(VOUT)",
        ],
      },
      {
        id: "output-peak-average",
        prompt: "What peak and average output values do you observe?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["trace:V(VOUT)"],
      },
    ],
    smoke: false,
    oracleGraph: centerTappedGraph,
    requiredComponentTypes: [
      "sine-voltage-source",
      "diode",
      "resistor",
    ],
    minimumDurationMs: 40,
    derivedObservations: [
      {
        _tag: "AlternatingConduction",
        id: "derived-rectifier-active-paths",
        first: componentCurrent("DP", "anode"),
        second: componentCurrent("DN", "anode"),
        startFraction: 0.5,
        minimumActiveFraction: 0.2,
        maximumOverlapFraction: 0.05,
      },
      {
        _tag: "Frequency",
        id: "derived-rectifier-output-frequency",
        signal: netVoltage("VOUT"),
        startFraction: 0.5,
        expectedHertz: approximate(100, 1),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "AC_P", "AC_N", "VOUT"],
      traceRanges: [
        {
          signalName: "V(VOUT)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(7.31, 0.25),
        },
        {
          signalName: "V(VOUT)",
          metric: "minimum",
          startFraction: 0.5,
          expected: approximate(0, 0.01),
        },
        {
          signalName: "V(VOUT)",
          metric: "maximum",
          startFraction: 0.5,
          expected: approximate(7.31, 0.25),
        },
        {
          signalName: "V(VOUT)",
          metric: "average",
          startFraction: 0.5,
          expected: approximate(4.44, 0.2),
        },
        {
          signalName: "V(AC_P)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(16, 0.2),
        },
        {
          signalName: "V(AC_N)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(16, 0.2),
        },
      ],
    }),
    references: [
      source(
        "adi-center-tapped-full-wave",
        "Analog Devices University Wiki — diode applications",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "A full-wave rectifier converts both positive and negative halves of the input waveform to a single polarity; a center-tapped transformer uses two diodes; the diodes conduct on alternate half-cycles.",
        "2396997b4168a8b4772b8e34af3b92d0fbe2c48ffda65499edea11f74125cfdd",
      ),
      source(
        "ti-center-tapped-output-rectifier",
        "Texas Instruments SLUP414 — output rectifiers",
        "https://www.ti.com/document-viewer/lit/html/SLUP414/GUID-9504F307-9B5F-40BF-A4C5-06EDD4106C59",
        "With a center-tapped rectifier, one output diode conducts when the transformer secondary voltage is positive and the other output diode conducts when it is negative.",
        "e50d133a71552e77d8f435188e9acd684dd5adef66edfbf93d667001d5de096e",
      ),
      source(
        "ngspice-diode-terminal-order",
        "ngspice User Manual — diode elements",
        "https://ngspice.sourceforge.io/docs/ngspice-41-manual.pdf#page=128",
        "In ngspice, a diode element lists its positive anode node first and its negative cathode node second.",
        "4ddb13590e4a600782eada1381e74ca598087e9171e3b12acba68a9ab5070c2f",
      ),
    ],
  },
  {
    id: "intent-rc-low-pass-cutoff",
    title: "RC low-pass cutoff behavior from intent",
    topologyMode: "exact",
    prompt:
      "Build a first-order low-pass circuit with a 1 V-peak sine input, R = 1 kOhm, and C = 1 uF. Drive it at the circuit's own cutoff frequency, take the output across the capacitor, preserve VIN and VOUT, and simulate long enough to show steady-state behavior. Then answer: what is the cutoff frequency, what gain and phase relationship should be observed, and what does the waveform evidence show?",
    questions: [
      {
        id: "cutoff-frequency",
        prompt: "What cutoff frequency follows from the component values?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-rc-input-frequency"],
      },
      {
        id: "cutoff-gain",
        prompt: "What output gain should be observed at cutoff, and what does the trace show?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-rc-gain"],
      },
      {
        id: "cutoff-phase",
        prompt: "Does the output lead or lag the input at cutoff, and by approximately how much?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["derived-rc-phase"],
      },
    ],
    smoke: false,
    oracleGraph: rcLowPassGraph,
    requiredComponentTypes: [
      "sine-voltage-source",
      "resistor",
      "capacitor",
    ],
    minimumDurationMs: 25,
    derivedObservations: [
      {
        _tag: "Frequency",
        id: "derived-rc-input-frequency",
        signal: netVoltage("VIN"),
        startFraction: 0.5,
        expectedHertz: approximate(159.154943, 0.5),
      },
      {
        _tag: "Gain",
        id: "derived-rc-gain",
        input: netVoltage("VIN"),
        output: netVoltage("VOUT"),
        startFraction: 0.5,
        expectedRatio: approximate(0.707107, 0.02),
      },
      {
        _tag: "PhaseDifference",
        id: "derived-rc-phase",
        reference: netVoltage("VIN"),
        compared: netVoltage("VOUT"),
        frequencyHertz: 159.154943,
        startFraction: 0.5,
        expectedDegrees: approximate(-45, 5),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "VIN", "VOUT"],
      traceRanges: [
        {
          signalName: "V(VOUT)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(1.414214, 0.04),
        },
        {
          signalName: "V(VIN)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(2, 0.02),
        },
      ],
    }),
    references: [
      source(
        "wlu-rc-filter-transfer-function",
        "W&L University — RC filters worksheet",
        "https://erickson.academic.wlu.edu/files/2019/circuits_f2019/labs/RCFilterWorksheet_f2019.pdf",
        "For a first-order RC low-pass filter, H(jw)=1/(1+jwRC) and fc=1/(2*pi*R*C); at cutoff the magnitude is 1/sqrt(2) and phase is -45 degrees.",
        "ba06678504c77690951b39627d6aa96d514b2b9939cc079149e476185d57f529",
      ),
      source(
        "ngspice-transient-analysis",
        "ngspice User Manual — transient analysis",
        "https://ngspice.sourceforge.io/docs/ngspice-41-manual.pdf",
        "ngspice provides transient analysis with a .tran command specifying the time step and stop time.",
        "e738062bd0c72d46062931f153f70ce6b95d2e55e38ad760e0844fab6752c104",
      ),
    ],
  },
  {
    id: "intent-series-rlc-resonance",
    title: "Series RLC resonance behavior from intent",
    topologyMode: "exact",
    prompt:
      "Build a series RLC circuit with a 1 V-peak sine input, R = 100 Ohm, L = 10 mH, and C = 100 uF. Drive it at the circuit's resonant frequency, preserve VIN, R_NODE, and VOUT, and simulate long enough to show steady-state behavior. Then answer: what frequency is resonant, how are source voltage and current phased, what happens to the reactive terms, and what waveform evidence supports the explanation?",
    questions: [
      {
        id: "resonant-frequency",
        prompt: "What resonant frequency follows from the component values?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-rlc-input-frequency"],
      },
      {
        id: "source-current-phase",
        prompt: "At resonance, how are source voltage and current phased?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "derived-rlc-series-current-phase",
          "derived-rlc-source-terminal-current-phase",
        ],
      },
      {
        id: "reactive-cancellation",
        prompt: "What happens to the inductive and capacitive terms at resonance?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["derived-rlc-reactive-cancellation"],
      },
    ],
    smoke: false,
    oracleGraph: seriesRlcGraph,
    requiredComponentTypes: [
      "sine-voltage-source",
      "resistor",
      "inductor",
      "capacitor",
    ],
    minimumDurationMs: 50,
    derivedObservations: [
      {
        _tag: "Frequency",
        id: "derived-rlc-input-frequency",
        signal: netVoltage("VIN"),
        startFraction: 0.5,
        expectedHertz: approximate(159.154943, 0.5),
      },
      {
        _tag: "PhaseDifference",
        id: "derived-rlc-series-current-phase",
        reference: netVoltage("VIN"),
        compared: componentCurrent("R1", "a"),
        frequencyHertz: 159.154943,
        startFraction: 0.5,
        expectedDegrees: approximate(0, 5),
      },
      {
        _tag: "PhaseDifference",
        id: "derived-rlc-source-terminal-current-phase",
        reference: netVoltage("VIN"),
        compared: componentCurrent("V1", "positive"),
        frequencyHertz: 159.154943,
        startFraction: 0.5,
        expectedDegrees: approximate(180, 5),
      },
      {
        _tag: "SumCancellation",
        id: "derived-rlc-reactive-cancellation",
        left: componentPower("C1"),
        right: componentPower("L1"),
        startFraction: 0.5,
        maximumResidualRatio: 0.1,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "VIN", "R_NODE", "VOUT"],
      traceRanges: [
        {
          signalName: "V(VOUT)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(0.2, 0.03),
        },
        {
          signalName: "V(VIN)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(2, 0.02),
        },
        {
          signalName: "V(R_NODE)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(0, 0.015),
        },
      ],
    }),
    references: [
      source(
        "mit-series-rlc-resonance",
        "MIT 6.101 — RLC resonance lecture",
        "https://web.mit.edu/6.101/www/s2020/handouts/L02.pdf",
        "At series RLC resonance, inductive and capacitive reactances cancel, impedance is real, and source current is in phase with source voltage; f0=1/(2*pi*sqrt(L*C)).",
        "6c5656ffc9c5c253671c9db784262b9dad0ff67dc0a8ca97d1a75052b1fdf1a4",
      ),
      source(
        "ngspice-transient-analysis",
        "ngspice User Manual — transient analysis",
        "https://ngspice.sourceforge.io/docs/ngspice-41-manual.pdf",
        "ngspice provides transient analysis with a .tran command specifying the time step and stop time.",
        "e738062bd0c72d46062931f153f70ce6b95d2e55e38ad760e0844fab6752c104",
      ),
    ],
  },
  {
    id: "intent-zener-ripple-regulator",
    title: "Zener shunt regulation from a rippled supply",
    topologyMode: "exact",
    prompt:
      "Build a small-load shunt regulator that turns a nominal 12 V rail carrying 1 V-peak, 50 Hz ripple into an approximately 5.1 V output. Use a 5.1 V Zener, a 680 Ohm ballast resistor, and a 2.2 kOhm load. Preserve RAW and VREG, simulate enough cycles to show regulation, and explain where the ballast current goes, how much ripple remains, and when this circuit would fall out of regulation. Ground is GND.",
    questions: [
      {
        id: "zener-output-level",
        prompt: "What average output level is established, and why is it close to the Zener breakdown voltage?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-zener-average-output"],
      },
      {
        id: "zener-ripple-rejection",
        prompt: "How much of the input ripple reaches VREG?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-input-ripple",
          "derived-zener-output-ripple",
          "derived-zener-ripple-gain",
        ],
      },
      {
        id: "zener-current-budget",
        prompt: "How does the ballast current divide, and what condition would end regulation?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "trace:I(RS.1)",
          "trace:I(RLOAD.1)",
          "trace:I(DZ1.K)",
        ],
      },
    ],
    oracleGraph: zenerRippleRegulatorGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "sine-voltage-source",
      "resistor",
      "zener-diode",
    ],
    minimumDurationMs: 60,
    derivedObservations: [
      {
        _tag: "SignalMetric",
        id: "derived-zener-average-output",
        signal: netVoltage("VREG"),
        metric: "average",
        startFraction: 0.5,
        expected: approximate(5.22799, 0.03),
      },
      {
        _tag: "SignalMetric",
        id: "derived-zener-input-ripple",
        signal: netVoltage("RAW"),
        metric: "peakToPeak",
        startFraction: 0.5,
        expected: approximate(2, 0.03),
      },
      {
        _tag: "SignalMetric",
        id: "derived-zener-output-ripple",
        signal: netVoltage("VREG"),
        metric: "peakToPeak",
        startFraction: 0.5,
        expected: approximate(0.0385673, 0.004),
      },
      {
        _tag: "Gain",
        id: "derived-zener-ripple-gain",
        input: netVoltage("RAW"),
        output: netVoltage("VREG"),
        startFraction: 0.5,
        expectedRatio: approximate(0.0192836, 0.002),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "RAW", "VREG"],
      traceRanges: [
        {
          signalName: "V(RAW)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(2, 0.03),
        },
        {
          signalName: "V(VREG)",
          metric: "average",
          startFraction: 0.5,
          expected: approximate(5.22799, 0.03),
        },
        {
          signalName: "V(VREG)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(0.0385673, 0.004),
        },
      ],
    }),
    references: [
      source(
        "adi-zener-shunt-regulator",
        "Analog Devices University Wiki — Zener diode as voltage regulator",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "A reverse-biased Zener shunt regulator conducts at breakdown and holds the load voltage relatively constant; its series resistor limits current and supplies both Zener and load current.",
        "7e2a4973f60d1e4065f0c677b86e0d68e0a871f3a4adbe935e18e452274a3b77",
      ),
    ],
  },
  {
    id: "intent-bjt-emitter-follower-buffer",
    title: "BJT emitter-follower buffering from intent",
    topologyMode: "exact",
    prompt:
      "Build a beta-100 NPN buffer from a 9 V supply. Establish its base bias with 47 kOhm to the supply and 15 kOhm to ground, take the output from the emitter through a 1 kOhm load to ground, and preserve BASE and EMITTER. Simulate and explain why the output follows rather than inverts, the observed base-emitter offset, and how the input and emitter currents demonstrate buffering.",
    questions: [
      {
        id: "follower-voltage-levels",
        prompt: "What base and emitter voltages are observed?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-follower-base-voltage",
          "derived-follower-emitter-voltage",
        ],
      },
      {
        id: "follower-base-emitter-offset",
        prompt: "What base-emitter offset is observed, and why does the emitter sit below the base?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-follower-base-emitter-offset"],
      },
      {
        id: "follower-current-buffering",
        prompt: "How do the emitter-path and base currents demonstrate current buffering?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-follower-current-ratio"],
      },
    ],
    oracleGraph: emitterFollowerGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "resistor",
      "npn-transistor",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetric",
        id: "derived-follower-base-voltage",
        signal: netVoltage("BASE"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(2.03, 0.15),
      },
      {
        _tag: "SignalMetric",
        id: "derived-follower-emitter-voltage",
        signal: netVoltage("EMITTER"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(1.35, 0.15),
      },
      {
        _tag: "MeanDifference",
        id: "derived-follower-base-emitter-offset",
        minuend: netVoltage("BASE"),
        subtrahend: netVoltage("EMITTER"),
        startFraction: 0.25,
        expected: approximate(0.68, 0.08),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-follower-current-ratio",
        numerator: componentCurrent("RE", "a"),
        denominator: componentCurrent("Q1", "base"),
        startFraction: 0.25,
        expectedRatio: approximate(108, 2),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "BASE", "EMITTER"],
      netVoltages: [
        { name: "BASE", expected: approximate(2.03, 0.15) },
        { name: "EMITTER", expected: approximate(1.35, 0.15) },
      ],
      componentMeasurements: [
        { refdes: "RE", metric: "current", expected: approximate(0.00135, 0.0002) },
      ],
    }),
    references: [
      source(
        "adi-emitter-follower-buffer",
        "Analog Devices University Wiki — single transistor amplifier stages",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-9",
        "An emitter follower takes its output from the emitter, follows the base in phase with near-unity gain, sits roughly one base-emitter drop below the base, and provides high input and low output impedance.",
        "9d64f68a8a0930b6a6b61d1b7f501ef1a83666281ff75e48f96c660c98f18725",
      ),
    ],
  },
  {
    id: "intent-op-amp-inverting-stage",
    title: "Inverting op-amp behavior from intent",
    topologyMode: "exact",
    prompt:
      "Build an ideal inverting amplifier on +12 V and -12 V rails that turns a 1 V-peak, 100 Hz input into an inverted 4 V-peak output. Use 10 kOhm at the input, choose the feedback resistance that establishes the requested gain, hold the non-inverting input at ground, keep the output limits at +/-10 V, add a 10 kOhm output load, and preserve VIN, SUM, and VOUT. Simulate and explain gain, phase, the summing-node voltage, and headroom to the limits.",
    questions: [
      {
        id: "inverting-gain",
        prompt: "What closed-loop gain is observed, and how does the resistor ratio set it?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-inverting-gain"],
      },
      {
        id: "inverting-phase",
        prompt: "What is the input-to-output phase relationship?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["derived-inverting-phase"],
      },
      {
        id: "inverting-virtual-ground-headroom",
        prompt: "What does the summing-node waveform show, and is the output saturating?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-inverting-summing-range",
          "derived-inverting-output-maximum",
          "derived-inverting-output-minimum",
        ],
      },
    ],
    oracleGraph: invertingOpAmpGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "sine-voltage-source",
      "resistor",
      "ideal-op-amp-minus-top",
    ],
    minimumDurationMs: 30,
    derivedObservations: [
      {
        _tag: "Gain",
        id: "derived-inverting-gain",
        input: netVoltage("VIN"),
        output: netVoltage("VOUT"),
        startFraction: 0.5,
        expectedRatio: approximate(4, 0.03),
      },
      {
        _tag: "PhaseDifference",
        id: "derived-inverting-phase",
        reference: netVoltage("VIN"),
        compared: netVoltage("VOUT"),
        frequencyHertz: 100,
        startFraction: 0.5,
        expectedDegrees: approximate(180, 3),
      },
      {
        _tag: "SignalMetric",
        id: "derived-inverting-summing-range",
        signal: netVoltage("SUM"),
        metric: "peakToPeak",
        startFraction: 0.5,
        expected: approximate(0.00008, 0.00003),
      },
      {
        _tag: "SignalMetric",
        id: "derived-inverting-output-maximum",
        signal: netVoltage("VOUT"),
        metric: "maximum",
        startFraction: 0.5,
        expected: approximate(4, 0.04),
      },
      {
        _tag: "SignalMetric",
        id: "derived-inverting-output-minimum",
        signal: netVoltage("VOUT"),
        metric: "minimum",
        startFraction: 0.5,
        expected: approximate(-4, 0.04),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "VIN", "SUM", "VOUT"],
      traceRanges: [
        {
          signalName: "V(VIN)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(2, 0.02),
        },
        {
          signalName: "V(VOUT)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(8, 0.08),
        },
        {
          signalName: "V(SUM)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(0.00008, 0.00003),
        },
      ],
    }),
    references: [
      source(
        "adi-ideal-inverting-op-amp",
        "Analog Devices University Wiki — ideal voltage-feedback op amp",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-2",
        "With negative feedback, an ideal inverting op amp has closed-loop gain minus the feedback-resistor to input-resistor ratio, a virtual-ground summing node, and an output 180 degrees out of phase with its input.",
        "9ca30a725a1e3136ef09460bc549f4f9f43c7dd8583ca2e7cb17a71e9860f600",
      ),
    ],
  },
  {
    id: "intent-nmos-low-side-switch",
    title: "NMOS low-side switching from intent",
    topologyMode: "exact",
    prompt:
      "Use a 2 V-threshold N-channel MOSFET as a low-side switch for a 330 Ohm load from a 5 V supply. Exercise its gate with a 5 V-peak, 50 Hz sine wave so the same run crosses cutoff and on regions. Preserve GATE and DRAIN, simulate several cycles, and explain when current flows, why the drain response is inverted, and what high and low drain levels are observed.",
    questions: [
      {
        id: "nmos-switch-regions",
        prompt: "During which gate portions is the MOSFET cut off or conducting?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "trace:V(GATE)",
          "trace:I(RLOAD.1)",
        ],
      },
      {
        id: "nmos-drain-levels",
        prompt: "What high and low drain levels are observed?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-nmos-drain-maximum",
          "derived-nmos-drain-minimum",
        ],
      },
      {
        id: "nmos-inversion-rate",
        prompt: "Why is the drain waveform inverted, and at what repetition rate does it repeat?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["derived-nmos-drain-frequency"],
      },
    ],
    oracleGraph: nmosLowSideSwitchGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "sine-voltage-source",
      "resistor",
      "n-mosfet",
    ],
    minimumDurationMs: 60,
    derivedObservations: [
      {
        _tag: "SignalMetric",
        id: "derived-nmos-drain-maximum",
        signal: netVoltage("DRAIN"),
        metric: "maximum",
        startFraction: 0.5,
        expected: approximate(5, 0.03),
      },
      {
        _tag: "SignalMetric",
        id: "derived-nmos-drain-minimum",
        signal: netVoltage("DRAIN"),
        metric: "minimum",
        startFraction: 0.5,
        expected: approximate(0.1, 0.02),
      },
      {
        _tag: "Frequency",
        id: "derived-nmos-drain-frequency",
        signal: netVoltage("DRAIN"),
        startFraction: 0.5,
        expectedHertz: approximate(50, 1),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "GATE", "DRAIN"],
      traceRanges: [
        {
          signalName: "V(GATE)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(10, 0.05),
        },
        {
          signalName: "V(DRAIN)",
          metric: "maximum",
          startFraction: 0.5,
          expected: approximate(5, 0.03),
        },
        {
          signalName: "V(DRAIN)",
          metric: "minimum",
          startFraction: 0.5,
          expected: approximate(0.1, 0.02),
        },
      ],
    }),
    references: [
      source(
        "adi-nmos-switch-regions",
        "Analog Devices University Wiki — MOSFET device as a switch",
        "https://wiki.analog.com/university/courses/alm1k/alm-lab-4ms",
        "An NMOS low-side switch is cut off when gate-to-source voltage is below threshold and conducts when it is above threshold, pulling the resistor-fed drain from the supply level toward ground.",
        "b0fc969edb95e7d2b73a9d2622394e260fb0a3443ac804745ed408eadb05c9fa",
      ),
    ],
  },
  {
    id: "intent-bjt-common-emitter-amplifier",
    title: "Biased common-emitter amplification from intent",
    topologyMode: "exact",
    prompt:
      "Build a beta-100 NPN common-emitter voltage amplifier from a 9 V supply. Superimpose a 20 mV-peak, 100 Hz signal on a 1.5 V DC input bias, feed the base through 10 kOhm, use 3.3 kOhm from VCC to the collector, and use 1 kOhm from the emitter to ground. Preserve INPUT, BASE, EMITTER, and COLLECTOR. Simulate several cycles and explain the DC operating point, small-signal voltage gain, and input-to-output phase relationship without claiming the transistor is ideal.",
    questions: [
      {
        id: "common-emitter-operating-point",
        prompt: "Where are the input, emitter, and collector biased, and does that leave output swing?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-common-emitter-input-bias",
          "derived-common-emitter-emitter-bias",
          "derived-common-emitter-collector-bias",
        ],
      },
      {
        id: "common-emitter-gain",
        prompt: "What small-signal voltage gain is observed from INPUT to COLLECTOR?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-common-emitter-gain"],
      },
      {
        id: "common-emitter-phase",
        prompt: "Does the collector waveform follow or invert the input, and by how much phase?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["derived-common-emitter-phase"],
      },
    ],
    oracleGraph: commonEmitterAmplifierGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "sine-voltage-source",
      "resistor",
      "npn-transistor",
    ],
    minimumDurationMs: 40,
    derivedObservations: [
      {
        _tag: "SignalMetric",
        id: "derived-common-emitter-input-bias",
        signal: netVoltage("INPUT"),
        metric: "average",
        startFraction: 0.5,
        expected: approximate(1.5, 0.01),
      },
      {
        _tag: "SignalMetric",
        id: "derived-common-emitter-emitter-bias",
        signal: netVoltage("EMITTER"),
        metric: "average",
        startFraction: 0.5,
        expected: approximate(0.7267, 0.03),
      },
      {
        _tag: "SignalMetric",
        id: "derived-common-emitter-collector-bias",
        signal: netVoltage("COLLECTOR"),
        metric: "average",
        startFraction: 0.5,
        expected: approximate(6.624, 0.08),
      },
      {
        _tag: "Gain",
        id: "derived-common-emitter-gain",
        input: netVoltage("INPUT"),
        output: netVoltage("COLLECTOR"),
        startFraction: 0.5,
        expectedRatio: approximate(2.883, 0.08),
      },
      {
        _tag: "PhaseDifference",
        id: "derived-common-emitter-phase",
        reference: netVoltage("INPUT"),
        compared: netVoltage("COLLECTOR"),
        frequencyHertz: 100,
        startFraction: 0.5,
        expectedDegrees: approximate(180, 4),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "BASE", "EMITTER", "COLLECTOR"],
      traceRanges: [
        {
          signalName: "V(INPUT)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(0.04, 0.002),
        },
        {
          signalName: "V(COLLECTOR)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(0.1153, 0.005),
        },
      ],
    }),
    references: [
      source(
        "adi-common-emitter-amplifier",
        "Analog Devices University Wiki — single transistor amplifier stages",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-9",
        "A biased common-emitter amplifier uses the base as input and collector as output, reproduces small variations with voltage gain, and inverts the output by 180 degrees; bias near the load-line midpoint supports symmetric swing.",
        "1339a5552f710afe6387e2bcfa2946b09815016c7c1dadc55c2067279bb40f55",
      ),
    ],
  },
  {
    id: "intent-zener-bjt-series-regulator",
    title: "Zener-referenced BJT series regulation from intent",
    topologyMode: "exact",
    prompt:
      "Build a simple 12 V series regulator for a 330 Ohm load using a 5.1 V Zener reference, a 680 Ohm reference-feed resistor, and a beta-100 NPN emitter follower as the series pass device. Preserve ZREF and VOUT. Simulate and explain the regulated output level, the base-emitter offset from the reference, and why the Zener/reference path does not need to carry the full load current.",
    questions: [
      {
        id: "series-regulator-levels",
        prompt: "What ZREF and VOUT levels are established?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-series-regulator-reference",
          "derived-series-regulator-output",
        ],
      },
      {
        id: "series-regulator-offset",
        prompt: "What voltage is lost from the Zener reference to the emitter output?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-series-regulator-base-emitter-offset"],
      },
      {
        id: "series-regulator-current-gain",
        prompt: "How does pass-transistor current gain isolate the Zener from the load current?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-series-regulator-current-ratio"],
      },
    ],
    oracleGraph: zenerBjtSeriesRegulatorGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "resistor",
      "zener-diode",
      "npn-transistor",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetric",
        id: "derived-series-regulator-reference",
        signal: netVoltage("ZREF"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(5.25691, 0.03),
      },
      {
        _tag: "SignalMetric",
        id: "derived-series-regulator-output",
        signal: netVoltage("VOUT"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(4.47672, 0.04),
      },
      {
        _tag: "MeanDifference",
        id: "derived-series-regulator-base-emitter-offset",
        minuend: netVoltage("ZREF"),
        subtrahend: netVoltage("VOUT"),
        startFraction: 0.25,
        expected: approximate(0.78, 0.05),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-series-regulator-current-ratio",
        numerator: componentCurrent("RLOAD", "a"),
        denominator: componentCurrent("Q1", "base"),
        startFraction: 0.25,
        expectedRatio: approximate(107.84, 2),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "ZREF", "VOUT"],
      netVoltages: [
        { name: "ZREF", expected: approximate(5.25691, 0.03) },
        { name: "VOUT", expected: approximate(4.47672, 0.04) },
      ],
      componentMeasurements: [
        { refdes: "RZ", metric: "current", expected: approximate(0.00991631, 0.00008) },
        { refdes: "RLOAD", metric: "current", expected: approximate(0.0135658, 0.0001) },
      ],
    }),
    references: [
      source(
        "adi-zener-series-regulator",
        "Analog Devices University Wiki — improved series voltage regulator",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-16",
        "A Zener-referenced emitter follower forms a series voltage regulator: the transistor supplies load current, its base current is smaller than load current by current gain, and the output is about one base-emitter drop below the Zener voltage.",
        "3b02dc06a962841858f96e0d2cf3dbd0e9880e2c85bf25b1ed3207ceb885f8e5",
      ),
    ],
  },
  {
    id: "intent-pmos-high-side-switch",
    title: "PMOS high-side switching from intent",
    topologyMode: "exact",
    prompt:
      "Use a -2 V-threshold P-channel MOSFET as a high-side switch for a 330 Ohm load from a 5 V rail. Drive its gate with a 5 V-peak, 50 Hz sine referenced to ground so one run crosses its on and cutoff conditions. Preserve GATE and OUTPUT, simulate several cycles, and explain why a lower gate turns this device on, what pulls the output low when it is off, and the high and low output levels and repetition rate.",
    questions: [
      {
        id: "pmos-switch-polarity",
        prompt: "Which gate portions turn the PMOS on or off, and why is the control active-low?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["trace:V(GATE)", "trace:I(RLOAD.1)"],
      },
      {
        id: "pmos-output-levels",
        prompt: "What high and low output levels are observed?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-pmos-output-maximum",
          "derived-pmos-output-minimum",
        ],
      },
      {
        id: "pmos-output-rate",
        prompt: "At what rate does the switched output repeat?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-pmos-output-frequency"],
      },
    ],
    oracleGraph: pmosHighSideSwitchGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "sine-voltage-source",
      "resistor",
      "p-mosfet",
    ],
    minimumDurationMs: 60,
    derivedObservations: [
      {
        _tag: "SignalMetric",
        id: "derived-pmos-output-maximum",
        signal: netVoltage("OUTPUT"),
        metric: "maximum",
        startFraction: 0.5,
        expected: approximate(4.962, 0.02),
      },
      {
        _tag: "SignalMetric",
        id: "derived-pmos-output-minimum",
        signal: netVoltage("OUTPUT"),
        metric: "minimum",
        startFraction: 0.5,
        expected: approximate(0, 0.03),
      },
      {
        _tag: "Frequency",
        id: "derived-pmos-output-frequency",
        signal: netVoltage("OUTPUT"),
        startFraction: 0.5,
        expectedHertz: approximate(50, 1),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "GATE", "OUTPUT"],
      traceRanges: [
        {
          signalName: "V(GATE)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(10, 0.05),
        },
        {
          signalName: "V(OUTPUT)",
          metric: "maximum",
          startFraction: 0.5,
          expected: approximate(4.962, 0.02),
        },
        {
          signalName: "V(OUTPUT)",
          metric: "minimum",
          startFraction: 0.5,
          expected: approximate(0, 0.03),
        },
      ],
    }),
    references: [
      source(
        "adi-pmos-high-side-switch",
        "Analog Devices University Wiki — MOSFET applications",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-15",
        "A PMOS high-side switch turns on when its gate is brought sufficiently below its source; when conducting it pulls a ground-loaded drain toward the positive supply, and when off the load pulls the drain toward ground.",
        "e19f9bfca428862df65bb06cbd4c6851ac3e8865b1cca840ccc9539455252ecb",
      ),
    ],
  },
  {
    id: "intent-buffered-zener-heavy-load",
    title: "Behavioral Zener reference buffering under a heavy load",
    topologyMode: "behavioral",
    prompt:
      "Design a buffered reference from a 12 V source that holds a 330 Ohm load near 5.1 V without forcing that load current through the Zener branch. Use a 5.1 V Zener, an ideal op amp, and resistors, preserve ZREF and VOUT, keep the amplifier within 0 V and 10 V output limits, simulate the loaded result, and explain the reference level, tracking error, and why the reference does not collapse. The exact wiring and reference designators are your choice; GND, ZREF, and VOUT are the behavioral interface.",
    questions: [
      {
        id: "buffered-reference-level",
        prompt: "What loaded ZREF and VOUT levels are established?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-buffered-zener-reference-level",
          "derived-buffered-zener-output-level",
        ],
      },
      {
        id: "buffered-reference-tracking",
        prompt: "How closely does the loaded output track the Zener reference?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-buffered-zener-tracking-error"],
      },
      {
        id: "buffered-reference-isolation",
        prompt: "Why can the circuit serve the 330 Ohm load without collapsing the Zener reference?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "derived-buffered-zener-reference-level",
          "derived-buffered-zener-output-level",
        ],
      },
    ],
    oracleGraph: bufferedZenerReferenceGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "resistor",
      "resistor",
      "zener-diode",
      "ideal-op-amp-minus-top",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetric",
        id: "derived-buffered-zener-reference-level",
        signal: netVoltage("ZREF"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(5.25847, 0.03),
      },
      {
        _tag: "SignalMetric",
        id: "derived-buffered-zener-output-level",
        signal: netVoltage("VOUT"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(5.25842, 0.03),
      },
      {
        _tag: "MeanDifference",
        id: "derived-buffered-zener-tracking-error",
        minuend: netVoltage("ZREF"),
        subtrahend: netVoltage("VOUT"),
        startFraction: 0.25,
        expected: approximate(0.0000516, 0.00001),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "ZREF", "VOUT"],
      netVoltages: [
        { name: "ZREF", expected: approximate(5.25847, 0.03) },
        { name: "VOUT", expected: approximate(5.25842, 0.03) },
      ],
    }),
    references: [
      source(
        "adi-buffered-zener-reference",
        "Analog Devices University Wiki — Zener references and buffer stages",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "A reverse-biased Zener can establish a stable reference, and a following buffer-amplifier stage can supply larger load current without making the Zener branch carry that full load.",
        "41b3d4e9e326d005247adab3cd35b406b5ea472a3febeb76cb2cfcbcb8ce0697",
      ),
    ],
  },
  {
    id: "intent-smoothed-bridge-supply",
    title: "Behavioral full-wave rectifier and smoothing supply",
    topologyMode: "behavioral",
    prompt:
      "Design a positive DC supply from a floating 10 V-peak, 50 Hz sine source using a four-diode full-wave bridge, a 470 uF reservoir capacitor, and a 1 kOhm load. Preserve AC_P, AC_N, VOUT, and GND, simulate long enough to settle, and explain the output polarity, average level, remaining ripple, and why the ripple repeats faster than the AC input. Exact diode names and drawing geometry are your choice.",
    questions: [
      {
        id: "smoothed-bridge-output-level",
        prompt: "What average loaded DC level is observed after settling?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-smoothed-bridge-average"],
      },
      {
        id: "smoothed-bridge-ripple",
        prompt: "How much ripple remains across the load?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-smoothed-bridge-ripple"],
      },
      {
        id: "smoothed-bridge-rate",
        prompt: "At what rate does the output ripple repeat, and why is it twice the input rate?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["derived-smoothed-bridge-frequency"],
      },
    ],
    oracleGraph: smoothedBridgeSupplyGraph,
    requiredComponentTypes: [
      "sine-voltage-source",
      "diode",
      "diode",
      "diode",
      "diode",
      "capacitor",
      "resistor",
    ],
    minimumDurationMs: 100,
    derivedObservations: [
      {
        _tag: "SignalMetric",
        id: "derived-smoothed-bridge-average",
        signal: netVoltage("VOUT"),
        metric: "average",
        startFraction: 0.5,
        expected: approximate(8.4108, 0.1),
      },
      {
        _tag: "SignalMetric",
        id: "derived-smoothed-bridge-ripple",
        signal: netVoltage("VOUT"),
        metric: "peakToPeak",
        startFraction: 0.5,
        expected: approximate(0.15545, 0.03),
      },
      {
        _tag: "Frequency",
        id: "derived-smoothed-bridge-frequency",
        signal: netVoltage("VOUT"),
        startFraction: 0.5,
        expectedHertz: approximate(100, 2),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "AC_P", "AC_N", "VOUT"],
      traceRanges: [
        {
          signalName: "V(VOUT)",
          metric: "average",
          startFraction: 0.5,
          expected: approximate(8.4108, 0.1),
        },
        {
          signalName: "V(VOUT)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(0.15545, 0.03),
        },
      ],
    }),
    references: [
      source(
        "adi-full-wave-smoothing",
        "Analog Devices University Wiki — full-wave rectification and smoothing",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "A four-diode bridge rectifies both AC half-cycles to one polarity; a capacitor across the output charges near waveform peaks and discharges into the load between peaks, leaving ripple at twice the input frequency.",
        "a18aa32ed86d0c22095b2359e2c042099614a17b2a80e1b827f27abb6ec141c1",
      ),
    ],
  },
  {
    id: "intent-non-inverting-op-amp-stage",
    title: "Behavioral in-phase op amp gain stage",
    topologyMode: "behavioral",
    prompt:
      "Design an ideal non-inverting amplifier on +/-12 V supplies that turns a 0.5 V-peak, 200 Hz input into an in-phase 3 V-peak output while staying inside +/-10 V output limits. Use a resistive negative-feedback network and a 20 kOhm output load. Preserve INPUT, FEEDBACK, VOUT, and GND, simulate several cycles, and explain the measured gain, phase, feedback-node behavior, and headroom. The gain-setting resistor values and reference designators are otherwise your choice.",
    questions: [
      {
        id: "non-inverting-behavioral-gain",
        prompt: "What closed-loop voltage gain is observed?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-non-inverting-behavioral-gain"],
      },
      {
        id: "non-inverting-behavioral-phase",
        prompt: "What is the input-to-output phase relationship?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["derived-non-inverting-behavioral-phase"],
      },
      {
        id: "non-inverting-behavioral-feedback",
        prompt: "How do the feedback-node range and output limits show closed-loop operation with headroom?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-non-inverting-feedback-range",
          "derived-non-inverting-output-maximum",
          "derived-non-inverting-output-minimum",
        ],
      },
    ],
    oracleGraph: nonInvertingTransientGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "sine-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "ideal-op-amp-minus-top",
    ],
    minimumDurationMs: 20,
    derivedObservations: [
      {
        _tag: "Gain",
        id: "derived-non-inverting-behavioral-gain",
        input: netVoltage("INPUT"),
        output: netVoltage("VOUT"),
        startFraction: 0.5,
        expectedRatio: approximate(5.99964, 0.02),
      },
      {
        _tag: "PhaseDifference",
        id: "derived-non-inverting-behavioral-phase",
        reference: netVoltage("INPUT"),
        compared: netVoltage("VOUT"),
        frequencyHertz: 200,
        startFraction: 0.5,
        expectedDegrees: approximate(0, 1),
      },
      {
        _tag: "SignalMetric",
        id: "derived-non-inverting-feedback-range",
        signal: netVoltage("FEEDBACK"),
        metric: "peakToPeak",
        startFraction: 0.5,
        expected: approximate(0.99994, 0.01),
      },
      {
        _tag: "SignalMetric",
        id: "derived-non-inverting-output-maximum",
        signal: netVoltage("VOUT"),
        metric: "maximum",
        startFraction: 0.5,
        expected: approximate(2.99982, 0.01),
      },
      {
        _tag: "SignalMetric",
        id: "derived-non-inverting-output-minimum",
        signal: netVoltage("VOUT"),
        metric: "minimum",
        startFraction: 0.5,
        expected: approximate(-2.99982, 0.01),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "FEEDBACK", "VOUT"],
      traceRanges: [
        {
          signalName: "V(INPUT)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(1, 0.01),
        },
        {
          signalName: "V(VOUT)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(6, 0.06),
        },
      ],
    }),
    references: [
      source(
        "adi-non-inverting-op-amp",
        "Analog Devices University Wiki — ideal non-inverting op amp",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-2",
        "An ideal non-inverting op amp with negative feedback produces an in-phase output whose closed-loop gain is set by the feedback-divider resistor ratio, provided the output remains within its supply limits.",
        "1f833cd4cf43ad76f90c29afa386da7b83a9cd0521276afa9031f4475a63919e",
      ),
    ],
  },
  {
    id: "intent-nmos-source-follower",
    title: "Behavioral NMOS source follower",
    topologyMode: "behavioral",
    prompt:
      "Design an NMOS source follower from a 9 V supply that accepts a 5 V DC gate drive and drives a 1 kOhm load to GND. Use a 2 V-threshold N-channel MOSFET, preserve GATE, SOURCE, and GND, simulate the loaded operating point, and explain the source voltage, gate-to-source offset, and why SOURCE follows below GATE rather than reaching the drain supply. Reference designators and drawing geometry are your choice.",
    questions: [
      {
        id: "nmos-follower-source-level",
        prompt: "What loaded source voltage is established?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-nmos-follower-source-level"],
      },
      {
        id: "nmos-follower-gate-offset",
        prompt: "How far below the gate does the source settle?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-nmos-follower-gate-source-offset"],
      },
      {
        id: "nmos-follower-operation",
        prompt: "Why does the source follow the gate while remaining below it?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "derived-nmos-follower-source-level",
          "derived-nmos-follower-gate-source-offset",
        ],
      },
    ],
    oracleGraph: nmosSourceFollowerGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "resistor",
      "n-mosfet",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetric",
        id: "derived-nmos-follower-source-level",
        signal: netVoltage("SOURCE"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(2.69085, 0.1),
      },
      {
        _tag: "MeanDifference",
        id: "derived-nmos-follower-gate-source-offset",
        minuend: netVoltage("GATE"),
        subtrahend: netVoltage("SOURCE"),
        startFraction: 0.25,
        expected: approximate(2.30915, 0.1),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "GATE", "SOURCE"],
      netVoltages: [
        { name: "GATE", expected: approximate(5, 0.01) },
        { name: "SOURCE", expected: approximate(2.69085, 0.1) },
      ],
    }),
    references: [
      source(
        "adi-nmos-source-follower",
        "Analog Devices University Wiki — MOSFET applications",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-15",
        "An NMOS source follower takes output from source; as gate voltage rises above threshold, source voltage follows below gate by the gate-source voltage needed to support load current.",
        "9fa7c38ad277f40294bee0f9720aae9261b535b8b42c8c850cdd197c7bdfb095",
      ),
    ],
  },
  {
    id: "intent-bjt-emitter-follower",
    title: "Behavioral BJT emitter-follower current buffer",
    topologyMode: "behavioral",
    prompt:
      "Design a beta-100 NPN emitter follower from a 9 V collector supply that accepts a 3 V DC base drive and drives a 1 kOhm load to GND. Preserve BASE, VOUT, and GND, simulate the loaded operating point, and explain the output level, base-to-emitter offset, and how the transistor supplies the load while the input controls its voltage. Exact reference designators are your choice.",
    questions: [
      {
        id: "bjt-behavioral-output-level",
        prompt: "What loaded output voltage is established?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-bjt-behavioral-output-level"],
      },
      {
        id: "bjt-behavioral-base-offset",
        prompt: "What base-to-output voltage difference is observed?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-bjt-behavioral-base-output-offset"],
      },
      {
        id: "bjt-behavioral-buffering",
        prompt: "How does the emitter follower act as a loaded voltage buffer?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "derived-bjt-behavioral-output-level",
          "derived-bjt-behavioral-base-output-offset",
        ],
      },
    ],
    oracleGraph: bjtBehavioralFollowerGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "resistor",
      "npn-transistor",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetric",
        id: "derived-bjt-behavioral-output-level",
        signal: netVoltage("VOUT"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(2.26592, 0.08),
      },
      {
        _tag: "MeanDifference",
        id: "derived-bjt-behavioral-base-output-offset",
        minuend: netVoltage("BASE"),
        subtrahend: netVoltage("VOUT"),
        startFraction: 0.25,
        expected: approximate(0.73408, 0.05),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "BASE", "VOUT"],
      netVoltages: [
        { name: "BASE", expected: approximate(3, 0.01) },
        { name: "VOUT", expected: approximate(2.26592, 0.08) },
      ],
    }),
    references: [
      source(
        "adi-bjt-emitter-follower-behavior",
        "Analog Devices University Wiki — BJT emitter follower",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-9",
        "An emitter follower takes output from emitter, follows base in phase with near-unity voltage gain, remains about one base-emitter drop below base, and provides current gain.",
        "d6970f6cfe2060b3ed1ae6a926c47b00c020524bdffe7d3da3d0c6d6fe2e766b",
      ),
    ],
  },
  {
    id: "intent-asymmetric-zener-clipper",
    title: "Behavioral asymmetric Zener waveform limiter",
    topologyMode: "behavioral",
    prompt:
      "Design an asymmetric limiter for an 8 V-peak, 100 Hz sine input using a 5.1 V Zener diode, a series resistor, and a resistive load. Preserve INPUT, OUTPUT, and GND, simulate several cycles, and explain the positive and negative clamp levels, why they differ, and whether the limited waveform retains the input repetition rate. Component names and resistor values are otherwise your choice.",
    questions: [
      {
        id: "zener-clipper-positive-limit",
        prompt: "What positive output limit is observed?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-zener-clipper-maximum"],
      },
      {
        id: "zener-clipper-negative-limit",
        prompt: "What negative output limit is observed, and why is its magnitude different?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-zener-clipper-minimum"],
      },
      {
        id: "zener-clipper-frequency",
        prompt: "What repetition rate remains after limiting?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["derived-zener-clipper-frequency"],
      },
    ],
    oracleGraph: asymmetricZenerClipperGraph,
    requiredComponentTypes: [
      "sine-voltage-source",
      "resistor",
      "resistor",
      "zener-diode",
    ],
    minimumDurationMs: 30,
    derivedObservations: [
      {
        _tag: "SignalMetric",
        id: "derived-zener-clipper-maximum",
        signal: netVoltage("OUTPUT"),
        metric: "maximum",
        startFraction: 0.25,
        expected: approximate(5.12227, 0.08),
      },
      {
        _tag: "SignalMetric",
        id: "derived-zener-clipper-minimum",
        signal: netVoltage("OUTPUT"),
        metric: "minimum",
        startFraction: 0.25,
        expected: approximate(-0.777427, 0.05),
      },
      {
        _tag: "Frequency",
        id: "derived-zener-clipper-frequency",
        signal: netVoltage("OUTPUT"),
        startFraction: 0.25,
        expectedHertz: approximate(100, 2),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "OUTPUT"],
      traceRanges: [
        {
          signalName: "V(OUTPUT)",
          metric: "maximum",
          startFraction: 0.25,
          expected: approximate(5.12227, 0.08),
        },
        {
          signalName: "V(OUTPUT)",
          metric: "minimum",
          startFraction: 0.25,
          expected: approximate(-0.777427, 0.05),
        },
      ],
    }),
    references: [
      source(
        "adi-asymmetric-zener-limiter",
        "Analog Devices University Wiki — Zener diode limiting",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "A Zener diode in reverse breakdown limits one waveform polarity near its breakdown voltage while ordinary forward conduction limits the opposite polarity near a diode drop.",
        "1b471bc34816d2aba0aa46623e228c4ddaf6512b5efe9fe9b19fe50604830260",
      ),
    ],
  },
  {
    id: "intent-rc-high-pass-cutoff",
    title: "Behavioral RC high-pass response at cutoff",
    topologyMode: "behavioral",
    prompt:
      "Design a first-order passive RC high-pass stage with a 1 kOhm resistance and 1 uF capacitance, driven by a 1 V-peak sine at its corner frequency. Preserve INPUT, OUTPUT, and GND, simulate enough cycles to settle, and explain the measured frequency, magnitude ratio, and input-to-output phase relationship. Component orientation and reference designators are your choice.",
    questions: [
      {
        id: "high-pass-cutoff-frequency",
        prompt: "What input frequency demonstrates the corner response?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-high-pass-input-frequency"],
      },
      {
        id: "high-pass-cutoff-gain",
        prompt: "What output-to-input magnitude ratio is observed?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-high-pass-gain"],
      },
      {
        id: "high-pass-cutoff-phase",
        prompt: "Does OUTPUT lead or lag INPUT at the corner, and by how much?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["derived-high-pass-phase"],
      },
    ],
    oracleGraph: rcHighPassGraph,
    requiredComponentTypes: [
      "sine-voltage-source",
      "resistor",
      "capacitor",
    ],
    minimumDurationMs: 80,
    derivedObservations: [
      {
        _tag: "Frequency",
        id: "derived-high-pass-input-frequency",
        signal: netVoltage("INPUT"),
        startFraction: 0.5,
        expectedHertz: approximate(159.15, 1),
      },
      {
        _tag: "Gain",
        id: "derived-high-pass-gain",
        input: netVoltage("INPUT"),
        output: netVoltage("OUTPUT"),
        startFraction: 0.5,
        expectedRatio: approximate(0.70709, 0.01),
      },
      {
        _tag: "PhaseDifference",
        id: "derived-high-pass-phase",
        reference: netVoltage("INPUT"),
        compared: netVoltage("OUTPUT"),
        frequencyHertz: 159.154943,
        startFraction: 0.5,
        expectedDegrees: approximate(44.57, 1),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "OUTPUT"],
      traceRanges: [
        {
          signalName: "V(OUTPUT)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(1.41418, 0.02),
        },
      ],
    }),
    references: [
      source(
        "adi-rc-high-pass-corner",
        "Analog Devices University Wiki — polyphase RC filter behavior",
        "https://wiki.analog.com/university/courses/electronics/comms-lab-polyphase-filter",
        "A first-order RC high-pass network attenuates low frequencies; at its corner frequency the output magnitude is about one over square root of two of input and its phase leads by about 45 degrees.",
        "b2847eae2f14ef0f04f320717f863d51903b5264aa314b6347e61824ff32f5f8",
      ),
    ],
  },
  {
    id: "intent-bjt-divider-bias-point",
    title: "Behavioral BJT voltage-divider bias point",
    topologyMode: "behavioral",
    prompt:
      "Design a stable beta-100 NPN DC bias stage from 12 V using a four-resistor voltage-divider, collector-load, and emitter-degeneration network. Aim for BASE near 1.8 V, EMITTER near 1.1 V, and COLLECTOR near 10 V. Preserve BASE, EMITTER, COLLECTOR, and GND, simulate the operating point, and explain the base-emitter offset and how the emitter resistor stabilizes current. Exact resistor values and reference designators are your choice.",
    questions: [
      {
        id: "divider-bias-node-levels",
        prompt: "What base, emitter, and collector levels are established?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-divider-bias-base",
          "derived-divider-bias-emitter",
          "derived-divider-bias-collector",
        ],
      },
      {
        id: "divider-bias-junction-offset",
        prompt: "What base-to-emitter offset is observed?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-divider-bias-base-emitter"],
      },
      {
        id: "divider-bias-stability",
        prompt: "How does emitter degeneration help establish a stable operating point?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "derived-divider-bias-emitter",
          "derived-divider-bias-collector",
        ],
      },
    ],
    oracleGraph: bjtDividerBiasGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "npn-transistor",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetric",
        id: "derived-divider-bias-base",
        signal: netVoltage("BASE"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(1.73852, 0.2),
      },
      {
        _tag: "SignalMetric",
        id: "derived-divider-bias-emitter",
        signal: netVoltage("EMITTER"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(1.02548, 0.2),
      },
      {
        _tag: "SignalMetric",
        id: "derived-divider-bias-collector",
        signal: netVoltage("COLLECTOR"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(9.96781, 0.3),
      },
      {
        _tag: "MeanDifference",
        id: "derived-divider-bias-base-emitter",
        minuend: netVoltage("BASE"),
        subtrahend: netVoltage("EMITTER"),
        startFraction: 0.25,
        expected: approximate(0.71304, 0.05),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "BASE", "EMITTER", "COLLECTOR"],
      netVoltages: [
        { name: "BASE", expected: approximate(1.73852, 0.2) },
        { name: "EMITTER", expected: approximate(1.02548, 0.2) },
        { name: "COLLECTOR", expected: approximate(9.96781, 0.3) },
      ],
    }),
    references: [
      source(
        "adi-bjt-divider-degeneration-bias",
        "Analog Devices University Wiki — transistor bias and emitter degeneration",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-9",
        "Voltage-divider bias establishes a transistor DC operating point, while an emitter resistor adds negative feedback that reduces sensitivity to beta and temperature and improves stability.",
        "6b588961de105f54bede48af4dc55ad5ae3ecc5b961da94f2fbf77315018d49c",
      ),
    ],
  },
  {
    id: "intent-zener-nmos-load-regulator",
    title: "Behavioral Zener-referenced NMOS load regulator",
    topologyMode: "behavioral",
    prompt:
      "Design a simple loaded regulator from 12 V using a 5.1 V Zener reference and a 2 V-threshold NMOS source-follower pass device. Drive a 1 kOhm load without routing the full load current through the Zener. Preserve ZREF, VOUT, and GND, simulate the result, and explain the reference level, loaded output, gate-to-source offset, and current-buffering role. Use at least two resistors; exact values and reference designators are your choice.",
    questions: [
      {
        id: "zener-nmos-regulator-levels",
        prompt: "What Zener-reference and loaded output voltages are established?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-zener-nmos-reference",
          "derived-zener-nmos-output",
        ],
      },
      {
        id: "zener-nmos-regulator-offset",
        prompt: "What gate-reference to source-output offset is observed?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-zener-nmos-offset"],
      },
      {
        id: "zener-nmos-regulator-buffering",
        prompt: "Why does the NMOS allow the load to be driven without collapsing ZREF?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "derived-zener-nmos-reference",
          "derived-zener-nmos-output",
        ],
      },
    ],
    oracleGraph: zenerNmosRegulatorGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "resistor",
      "resistor",
      "zener-diode",
      "n-mosfet",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetric",
        id: "derived-zener-nmos-reference",
        signal: netVoltage("ZREF"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(5.25847, 0.03),
      },
      {
        _tag: "SignalMetric",
        id: "derived-zener-nmos-output",
        signal: netVoltage("VOUT"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(2.94279, 0.15),
      },
      {
        _tag: "MeanDifference",
        id: "derived-zener-nmos-offset",
        minuend: netVoltage("ZREF"),
        subtrahend: netVoltage("VOUT"),
        startFraction: 0.25,
        expected: approximate(2.31569, 0.15),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "ZREF", "VOUT"],
      netVoltages: [
        { name: "ZREF", expected: approximate(5.25847, 0.03) },
        { name: "VOUT", expected: approximate(2.94279, 0.15) },
      ],
    }),
    references: [
      source(
        "adi-zener-reference-for-buffer",
        "Analog Devices University Wiki — Zener references and buffer stages",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "A reverse-biased Zener can establish a stable reference, and a following buffer-amplifier stage can supply larger load current without making the Zener branch carry that full load.",
        "41b3d4e9e326d005247adab3cd35b406b5ea472a3febeb76cb2cfcbcb8ce0697",
      ),
      source(
        "adi-nmos-source-follower-regulator",
        "Analog Devices University Wiki — MOSFET applications",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-15",
        "An NMOS source follower takes output from source; as gate voltage rises above threshold, source voltage follows below gate by the gate-source voltage needed to support load current.",
        "9fa7c38ad277f40294bee0f9720aae9261b535b8b42c8c850cdd197c7bdfb095",
      ),
    ],
  },
  {
    id: "intent-half-wave-rectifier",
    title: "Behavioral positive half-wave rectifier",
    topologyMode: "behavioral",
    prompt:
      "Design a positive half-wave rectifier for an 8 V-peak, 50 Hz sine input using one ordinary diode and a 1 kOhm load. Preserve INPUT, OUTPUT, and GND, simulate several cycles, and explain the output polarity, blocked half-cycle, conducted peak, and repetition rate. Reference designators and drawing geometry are your choice.",
    questions: [
      {
        id: "half-wave-output-polarity",
        prompt: "What minimum and maximum output levels demonstrate half-wave behavior?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-half-wave-minimum",
          "derived-half-wave-maximum",
        ],
      },
      {
        id: "half-wave-output-frequency",
        prompt: "At what rate do the positive output pulses repeat?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-half-wave-frequency"],
      },
      {
        id: "half-wave-conduction",
        prompt: "Why is one input half-cycle blocked and the other reduced by a diode drop?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "derived-half-wave-minimum",
          "derived-half-wave-maximum",
        ],
      },
    ],
    oracleGraph: halfWaveRectifierGraph,
    requiredComponentTypes: [
      "sine-voltage-source",
      "diode",
      "resistor",
    ],
    minimumDurationMs: 40,
    derivedObservations: [
      {
        _tag: "SignalMetric",
        id: "derived-half-wave-minimum",
        signal: netVoltage("OUTPUT"),
        metric: "minimum",
        startFraction: 0.25,
        expected: approximate(0, 0.02),
      },
      {
        _tag: "SignalMetric",
        id: "derived-half-wave-maximum",
        signal: netVoltage("OUTPUT"),
        metric: "maximum",
        startFraction: 0.25,
        expected: approximate(7.29349, 0.1),
      },
      {
        _tag: "Frequency",
        id: "derived-half-wave-frequency",
        signal: netVoltage("OUTPUT"),
        startFraction: 0.25,
        expectedHertz: approximate(50, 1),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "OUTPUT"],
      traceRanges: [
        {
          signalName: "V(OUTPUT)",
          metric: "minimum",
          startFraction: 0.25,
          expected: approximate(0, 0.02),
        },
        {
          signalName: "V(OUTPUT)",
          metric: "maximum",
          startFraction: 0.25,
          expected: approximate(7.29349, 0.1),
        },
      ],
    }),
    references: [
      source(
        "adi-half-wave-rectification",
        "Analog Devices University Wiki — diode rectifiers",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "A half-wave rectifier conducts during only one input half-cycle, producing a single-polarity pulsating output at the input repetition rate with roughly one forward-diode drop removed from the peak.",
        "2a05068c8b4418bf5b61960a073577e79357fa6d27a6d4a9367a638bba879001",
      ),
    ],
  },
  {
    id: "intent-op-amp-window-detector",
    title: "Behavioral dual-comparator window detector",
    topologyMode: "behavioral",
    prompt:
      "Design a two-comparator window detector powered from 5 V and GND with 0-to-5 V output limits. For a 2.5 V INPUT between a 2 V LOWER threshold and 3 V UPPER threshold, make LOW_OK high when INPUT exceeds LOWER and HIGH_OK high when INPUT is below UPPER. Preserve INPUT, LOWER, UPPER, LOW_OK, HIGH_OK, and GND, simulate, and explain why both outputs indicate an in-window value. Exact reference designators are your choice.",
    questions: [
      {
        id: "window-detector-thresholds",
        prompt: "What input and threshold levels define the test window?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-window-input",
          "derived-window-lower",
          "derived-window-upper",
        ],
      },
      {
        id: "window-detector-outputs",
        prompt: "What LOW_OK and HIGH_OK levels are observed?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-window-low-ok",
          "derived-window-high-ok",
        ],
      },
      {
        id: "window-detector-meaning",
        prompt: "Why do both high outputs identify an in-window input?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "derived-window-low-ok",
          "derived-window-high-ok",
        ],
      },
    ],
    oracleGraph: insideWindowComparatorGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetric",
        id: "derived-window-input",
        signal: netVoltage("INPUT"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(2.5, 0.01),
      },
      {
        _tag: "SignalMetric",
        id: "derived-window-lower",
        signal: netVoltage("LOWER"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(2, 0.01),
      },
      {
        _tag: "SignalMetric",
        id: "derived-window-upper",
        signal: netVoltage("UPPER"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(3, 0.01),
      },
      {
        _tag: "SignalMetric",
        id: "derived-window-low-ok",
        signal: netVoltage("LOW_OK"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(5, 0.01),
      },
      {
        _tag: "SignalMetric",
        id: "derived-window-high-ok",
        signal: netVoltage("HIGH_OK"),
        metric: "average",
        startFraction: 0.25,
        expected: approximate(5, 0.01),
      },
    ],
    expected: expected({
      requiredNetNames: [
        "GND",
        "INPUT",
        "LOWER",
        "UPPER",
        "LOW_OK",
        "HIGH_OK",
      ],
      netVoltages: [
        { name: "INPUT", expected: approximate(2.5, 0.01) },
        { name: "LOW_OK", expected: approximate(5, 0.01) },
        { name: "HIGH_OK", expected: approximate(5, 0.01) },
      ],
    }),
    references: [
      source(
        "adi-op-amp-window-comparison",
        "Analog Devices University Wiki — ideal op amp comparator behavior",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-2",
        "An ideal comparator drives one output limit or the other according to the sign of its differential input; a pair of comparators referenced to lower and upper thresholds can identify an in-window voltage.",
        "3bf620b14b427046c4ff6534c95fd1406bca88e0be190fe294483bb4dcf1ed64",
      ),
    ],
  },
  {
    id: "intent-clipped-common-emitter",
    title: "Behavioral overdriven common-emitter stage",
    topologyMode: "behavioral",
    prompt:
      "Design a beta-100 NPN common-emitter stage from 12 V that is intentionally overdriven by a 4 V-peak, 100 Hz sine riding on a 2 V DC base bias. Use collector and emitter resistors, preserve INPUT, EMITTER, COLLECTOR, and GND, simulate several cycles, and explain the input range, collector clipping limits, inversion, and which transistor regions bound the waveform. Resistor values and reference designators are your choice.",
    questions: [
      {
        id: "clipped-emitter-input-range",
        prompt: "What input minimum and maximum overdrive the stage?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-clipped-input-minimum",
          "derived-clipped-input-maximum",
        ],
      },
      {
        id: "clipped-emitter-output-limits",
        prompt: "What collector minimum and maximum show clipping?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-clipped-collector-minimum",
          "derived-clipped-collector-maximum",
        ],
      },
      {
        id: "clipped-emitter-regions",
        prompt: "How do cutoff and saturation create the observed inverted limits?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "derived-clipped-collector-minimum",
          "derived-clipped-collector-maximum",
        ],
      },
    ],
    oracleGraph: clippedCommonEmitterGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "sine-voltage-source",
      "resistor",
      "resistor",
      "npn-transistor",
    ],
    minimumDurationMs: 30,
    derivedObservations: [
      {
        _tag: "SignalMetric",
        id: "derived-clipped-input-minimum",
        signal: netVoltage("INPUT"),
        metric: "minimum",
        startFraction: 0.5,
        expected: approximate(-2, 0.02),
      },
      {
        _tag: "SignalMetric",
        id: "derived-clipped-input-maximum",
        signal: netVoltage("INPUT"),
        metric: "maximum",
        startFraction: 0.5,
        expected: approximate(6, 0.02),
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-clipped-collector-minimum",
        signal: netVoltage("COLLECTOR"),
        metric: "minimum",
        startFraction: 0.5,
        minimumExpected: 0,
        maximumExpected: 6,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-clipped-collector-maximum",
        signal: netVoltage("COLLECTOR"),
        metric: "maximum",
        startFraction: 0.5,
        minimumExpected: 11.5,
        maximumExpected: 12.1,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "EMITTER", "COLLECTOR"],
    }),
    references: [
      source(
        "adi-common-emitter-clipping",
        "Analog Devices University Wiki — common-emitter operating limits",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-9",
        "A common-emitter stage inverts its input, and sufficiently large drive pushes the transistor into cutoff and saturation so the collector waveform clips at its available output limits.",
        "0b5f6ac7eac8d54478220a879e7bee57ea2dd090843626347b069920a11ca12a",
      ),
    ],
  },
  {
    id: "intent-bridge-load-ripple-comparison",
    title: "Behavioral bridge-reservoir load comparison",
    topologyMode: "behavioral",
    prompt:
      "Design two independent positive full-wave bridge reservoir supplies from one floating 10 V-peak, 50 Hz source. Give both branches the same reservoir capacitance, choose clearly different light and heavy resistive loads, and preserve AC_P, AC_N, LIGHT_OUT, HEAVY_OUT, and GND. Simulate long enough to settle and explain why the heavier branch has a lower average output and greater ripple. Capacitance, load values, and reference designators are your choice.",
    questions: [
      {
        id: "bridge-load-useful-dc",
        prompt: "What settled average levels show that both branches produce useful positive DC?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-bridge-light-average",
          "derived-bridge-heavy-average",
        ],
      },
      {
        id: "bridge-load-average-comparison",
        prompt: "How does heavier loading change the average output?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-bridge-heavy-lower-average"],
      },
      {
        id: "bridge-load-ripple-comparison",
        prompt: "How does heavier loading change reservoir ripple, and why?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-bridge-heavy-greater-ripple"],
      },
    ],
    oracleGraph: bridgeLoadComparisonGraph,
    requiredComponentTypes: [
      "sine-voltage-source",
      "diode",
      "diode",
      "diode",
      "diode",
      "diode",
      "diode",
      "diode",
      "diode",
      "capacitor",
      "capacitor",
      "resistor",
      "resistor",
    ],
    minimumDurationMs: 100,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-bridge-light-average",
        signal: netVoltage("LIGHT_OUT"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 5,
        maximumExpected: 10,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-bridge-heavy-average",
        signal: netVoltage("HEAVY_OUT"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 4,
        maximumExpected: 10,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-bridge-heavy-lower-average",
        left: netVoltage("HEAVY_OUT"),
        right: netVoltage("LIGHT_OUT"),
        metric: "average",
        startFraction: 0.5,
        relation: "lessThan",
        minimumDifference: 0.05,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-bridge-heavy-greater-ripple",
        left: netVoltage("HEAVY_OUT"),
        right: netVoltage("LIGHT_OUT"),
        metric: "peakToPeak",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.05,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "AC_P", "AC_N", "LIGHT_OUT", "HEAVY_OUT"],
    }),
    references: [
      source(
        "adi-reservoir-load-ripple",
        "Analog Devices University Wiki — diode rectifiers and reservoir filtering",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "A reservoir capacitor charges near rectified peaks and discharges into the load between peaks; a heavier load increases discharge, producing lower average output and greater ripple.",
        "c40e34a6d8c9df76ea71f483ad68cd907845dddae81718f0ce30b1f10a501454",
      ),
    ],
  },
  {
    id: "intent-single-vs-darlington-follower",
    title: "Behavioral single versus Darlington followers",
    topologyMode: "behavioral",
    prompt:
      "Design side-by-side beta-100 NPN emitter followers from one 9 V supply and a shared input near 4 V. Use one transistor for SINGLE_OUT and a two-transistor Darlington for DARLINGTON_OUT, give both outputs comparable resistive loads, and preserve INPUT, SINGLE_OUT, DARLINGTON_OUT, and GND. Simulate and explain the different voltage offsets and why the Darlington offers much greater compound current gain. Bias and load resistor values and reference designators are your choice.",
    questions: [
      {
        id: "follower-comparison-levels",
        prompt: "What input and output levels are established by the two followers?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-follower-comparison-input",
          "derived-follower-comparison-single",
          "derived-follower-comparison-darlington",
        ],
      },
      {
        id: "follower-comparison-offsets",
        prompt: "Why is the Darlington output farther below the shared input?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-follower-single-below-input",
          "derived-follower-darlington-below-single",
        ],
      },
      {
        id: "follower-comparison-buffering",
        prompt: "What current-buffering tradeoff comes with the extra transistor?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["derived-follower-darlington-below-single"],
      },
    ],
    oracleGraph: followerComparisonGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-follower-comparison-input",
        signal: netVoltage("INPUT"),
        metric: "average",
        startFraction: 0.25,
        minimumExpected: 3.5,
        maximumExpected: 4.5,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-follower-comparison-single",
        signal: netVoltage("SINGLE_OUT"),
        metric: "average",
        startFraction: 0.25,
        minimumExpected: 2,
        maximumExpected: 3.8,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-follower-comparison-darlington",
        signal: netVoltage("DARLINGTON_OUT"),
        metric: "average",
        startFraction: 0.25,
        minimumExpected: 1,
        maximumExpected: 3.3,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-follower-single-below-input",
        left: netVoltage("INPUT"),
        right: netVoltage("SINGLE_OUT"),
        metric: "average",
        startFraction: 0.25,
        relation: "greaterThan",
        minimumDifference: 0.4,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-follower-darlington-below-single",
        left: netVoltage("SINGLE_OUT"),
        right: netVoltage("DARLINGTON_OUT"),
        metric: "average",
        startFraction: 0.25,
        relation: "greaterThan",
        minimumDifference: 0.2,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "SINGLE_OUT", "DARLINGTON_OUT"],
    }),
    references: [
      source(
        "adi-single-and-darlington-followers",
        "Analog Devices University Wiki — BJT emitter followers and Darlington connection",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-9",
        "A single emitter follower sits roughly one base-emitter junction below its base, while a Darlington connection introduces two base-emitter junctions and much greater composite current gain.",
        "ef2179eaea8cc89291ad7627dafdc8d236bfc1fb68a23b84caaf06816305e74d",
      ),
    ],
  },
  {
    id: "intent-bridge-zener-regulator",
    title: "Behavioral bridge and Zener post-regulator",
    topologyMode: "behavioral",
    prompt:
      "Design a positive DC supply from a floating 10 V-peak, 50 Hz source using a four-diode bridge, a reservoir capacitor, and a 5.1 V Zener shunt post-regulator feeding a resistive load. Preserve AC_P, AC_N, RAW_DC, REGULATED, and GND, simulate long enough to settle, and explain how the bridge, reservoir, series resistor, and Zener turn AC into a lower-ripple regulated output. Choose capacitance, series resistance, load resistance, and reference designators yourself.",
    questions: [
      {
        id: "bridge-zener-dc-levels",
        prompt: "What settled RAW_DC and REGULATED averages are produced?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-bridge-zener-raw-average",
          "derived-bridge-zener-regulated-average",
        ],
      },
      {
        id: "bridge-zener-drop",
        prompt: "How far below the reservoir node is the regulated output?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-bridge-zener-raw-above-regulated"],
      },
      {
        id: "bridge-zener-ripple",
        prompt: "How does the Zener stage change the remaining ripple, and why?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-bridge-zener-less-ripple"],
      },
    ],
    oracleGraph: bridgeZenerRegulatorGraph,
    requiredComponentTypes: [
      "sine-voltage-source",
      "diode",
      "diode",
      "diode",
      "diode",
      "capacitor",
      "resistor",
      "resistor",
      "zener-diode",
    ],
    minimumDurationMs: 100,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-bridge-zener-raw-average",
        signal: netVoltage("RAW_DC"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 6,
        maximumExpected: 10,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-bridge-zener-regulated-average",
        signal: netVoltage("REGULATED"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 4.8,
        maximumExpected: 5.5,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-bridge-zener-raw-above-regulated",
        left: netVoltage("RAW_DC"),
        right: netVoltage("REGULATED"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.5,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-bridge-zener-less-ripple",
        left: netVoltage("RAW_DC"),
        right: netVoltage("REGULATED"),
        metric: "peakToPeak",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.02,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "AC_P", "AC_N", "RAW_DC", "REGULATED"],
    }),
    references: [
      source(
        "adi-bridge-reservoir-zener-regulation",
        "Analog Devices University Wiki — rectification, filtering, and Zener regulation",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "A bridge rectifier produces full-wave pulsating DC; reservoir capacitance reduces ripple, and a reverse-biased Zener shunt can hold a downstream node near its breakdown voltage while regulation current remains available.",
        "2be62895845478eb8b8b6f78d1349643be5ea8355855a25e783fc09cf2bd6cc1",
      ),
    ],
  },
  {
    id: "intent-op-amp-schmitt-trigger",
    title: "Behavioral op amp Schmitt trigger",
    topologyMode: "behavioral",
    prompt:
      "Design an inverting Schmitt trigger around an ideal op amp on +/-12 V rails with +/-10 V output limits. Drive it from a 5 V-peak, 100 Hz sine, use a positive-feedback divider to create clearly separated rising and falling input thresholds, add a resistive output load, and preserve INPUT, THRESHOLD, VOUT, and GND. Simulate several cycles and explain output levels, switching polarity, and the measured hysteresis window. Feedback and load resistor values and reference designators are your choice.",
    questions: [
      {
        id: "schmitt-input-output-ranges",
        prompt: "What input and output ranges are observed?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-schmitt-input-range",
          "derived-schmitt-output-minimum",
          "derived-schmitt-output-maximum",
        ],
      },
      {
        id: "schmitt-hysteresis-window",
        prompt: "At what different input levels do rising and falling output transitions occur?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-schmitt-hysteresis-window"],
      },
      {
        id: "schmitt-positive-feedback",
        prompt: "Why does positive feedback produce two switching thresholds?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["derived-schmitt-hysteresis-window"],
      },
    ],
    oracleGraph: schmittTriggerGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "sine-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "ideal-op-amp-minus-top",
    ],
    minimumDurationMs: 30,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-schmitt-input-range",
        signal: netVoltage("INPUT"),
        metric: "peakToPeak",
        startFraction: 0.25,
        minimumExpected: 9.8,
        maximumExpected: 10.2,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-schmitt-output-minimum",
        signal: netVoltage("VOUT"),
        metric: "minimum",
        startFraction: 0.25,
        minimumExpected: -10.1,
        maximumExpected: -9.5,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-schmitt-output-maximum",
        signal: netVoltage("VOUT"),
        metric: "maximum",
        startFraction: 0.25,
        minimumExpected: 9.5,
        maximumExpected: 10.1,
      },
      {
        _tag: "HysteresisWindow",
        id: "derived-schmitt-hysteresis-window",
        input: netVoltage("INPUT"),
        output: netVoltage("VOUT"),
        startFraction: 0.25,
        minimumSeparationVolts: 1,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "THRESHOLD", "VOUT"],
    }),
    references: [
      source(
        "adi-op-amp-schmitt-hysteresis",
        "Analog Devices University Wiki — comparator positive feedback",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-2",
        "Positive feedback in a comparator creates a Schmitt trigger: the input threshold depends on the present output state, so rising and falling transitions occur at separated input voltages.",
        "080a5516f99681a396959ba4ca8bbcd6134d5ea1947834957c118346049e000f",
      ),
    ],
  },
  {
    id: "intent-positive-diode-clamper",
    title: "Behavioral positive diode clamper",
    topologyMode: "behavioral",
    prompt:
      "Design a positive diode clamper for a 5 V-peak, 100 Hz sine. Use one ordinary diode, one coupling capacitor, and one discharge resistor so the negative CLAMPED excursion stays near ground while the waveform retains approximately its original peak-to-peak span. Preserve INPUT, CLAMPED, and GND, simulate until settled, and explain the DC shift and diode charging interval. Capacitance, resistance, and reference designators are your choice.",
    questions: [
      {
        id: "clamper-input-span",
        prompt: "What input peak-to-peak span drives the clamper?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-clamper-input-range"],
      },
      {
        id: "clamper-shifted-limits",
        prompt: "What settled minimum and maximum show the positive DC shift?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-clamper-minimum",
          "derived-clamper-maximum",
          "derived-clamper-output-range",
        ],
      },
      {
        id: "clamper-charge-storage",
        prompt: "How do the diode and capacitor establish the shifted waveform?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "derived-clamper-minimum",
          "derived-clamper-output-range",
        ],
      },
    ],
    oracleGraph: positiveClamperGraph,
    requiredComponentTypes: [
      "sine-voltage-source",
      "capacitor",
      "diode",
      "resistor",
    ],
    minimumDurationMs: 100,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-clamper-input-range",
        signal: netVoltage("INPUT"),
        metric: "peakToPeak",
        startFraction: 0.75,
        minimumExpected: 9.8,
        maximumExpected: 10.2,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-clamper-minimum",
        signal: netVoltage("CLAMPED"),
        metric: "minimum",
        startFraction: 0.75,
        minimumExpected: -0.8,
        maximumExpected: 0.1,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-clamper-maximum",
        signal: netVoltage("CLAMPED"),
        metric: "maximum",
        startFraction: 0.75,
        minimumExpected: 8.5,
        maximumExpected: 10.5,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-clamper-output-range",
        signal: netVoltage("CLAMPED"),
        metric: "peakToPeak",
        startFraction: 0.75,
        minimumExpected: 9.5,
        maximumExpected: 10.2,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "CLAMPED"],
    }),
    references: [
      source(
        "adi-diode-capacitor-clamper",
        "Analog Devices University Wiki — diode clamper circuits",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "A diode clamper uses a capacitor and diode to add a DC level to an AC waveform, holding one excursion near the diode reference while substantially preserving peak-to-peak amplitude.",
        "017fa6df3ffb90b6f8e6cafe8be07648f3c7f1af48358fc511d514f25349e27c",
      ),
    ],
  },
  {
    id: "intent-diode-voltage-doubler",
    title: "Behavioral loaded diode voltage doubler",
    topologyMode: "behavioral",
    prompt:
      "Design a loaded half-wave voltage doubler for a 5 V-peak, 100 Hz sine using two ordinary diodes, a pump capacitor, an output reservoir capacitor, and a resistive load. Preserve INPUT, PUMP, VOUT, and GND, simulate until settled, and explain how clamping plus charge transfer produces a positive DC output substantially above the input peak with finite ripple. Capacitor and load values and reference designators are your choice.",
    questions: [
      {
        id: "doubler-input-pump",
        prompt: "What input range and pump minimum demonstrate the clamping action?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-doubler-input-range",
          "derived-doubler-pump-minimum",
        ],
      },
      {
        id: "doubler-output-level",
        prompt: "What settled average output demonstrates voltage doubling?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-doubler-output-average"],
      },
      {
        id: "doubler-output-ripple",
        prompt: "What ripple remains under load, and why?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["derived-doubler-output-ripple"],
      },
    ],
    oracleGraph: voltageDoublerGraph,
    requiredComponentTypes: [
      "sine-voltage-source",
      "diode",
      "diode",
      "capacitor",
      "capacitor",
      "resistor",
    ],
    minimumDurationMs: 150,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-doubler-input-range",
        signal: netVoltage("INPUT"),
        metric: "peakToPeak",
        startFraction: 0.75,
        minimumExpected: 9.8,
        maximumExpected: 10.2,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-doubler-pump-minimum",
        signal: netVoltage("PUMP"),
        metric: "minimum",
        startFraction: 0.75,
        minimumExpected: -0.9,
        maximumExpected: 0,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-doubler-output-average",
        signal: netVoltage("VOUT"),
        metric: "average",
        startFraction: 0.75,
        minimumExpected: 7.5,
        maximumExpected: 9.5,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-doubler-output-ripple",
        signal: netVoltage("VOUT"),
        metric: "peakToPeak",
        startFraction: 0.75,
        minimumExpected: 0.01,
        maximumExpected: 0.5,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "PUMP", "VOUT"],
    }),
    references: [
      source(
        "adi-diode-capacitor-voltage-doubler",
        "Analog Devices University Wiki — diode-capacitor voltage multipliers",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "A diode-capacitor voltage doubler clamps one pump node and transfers charge on the opposite half-cycle so a storage capacitor can reach nearly twice the input peak, reduced by diode drops and load ripple.",
        "ec9991264522c8e5943a2168db04704a4b7f7cad85fb86ea51636f8eb5572343",
      ),
    ],
  },
  {
    id: "intent-comparator-duty-cycle",
    title: "Behavioral comparator duty-cycle threshold",
    topologyMode: "behavioral",
    prompt:
      "Design an ideal 0-to-5 V comparator powered from 5 V and GND that converts a 5 V-peak, 100 Hz sine INPUT into an OUTPUT that is high for roughly one third of each cycle. Use a fixed positive REFERENCE and a resistive output load, preserve INPUT, REFERENCE, OUTPUT, and GND, simulate several cycles, and explain how the chosen threshold determines the measured high-state fraction. Reference voltage, load value, and reference designators are your choice.",
    questions: [
      {
        id: "comparator-duty-levels",
        prompt: "What input span and output limits are observed?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-comparator-duty-input-range",
          "derived-comparator-duty-output-minimum",
          "derived-comparator-duty-output-maximum",
        ],
      },
      {
        id: "comparator-duty-fraction",
        prompt: "What fraction of time is OUTPUT high?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-comparator-duty-high-fraction"],
      },
      {
        id: "comparator-duty-threshold",
        prompt: "Why does a positive reference shorten the high interval below one half-cycle?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["derived-comparator-duty-high-fraction"],
      },
    ],
    oracleGraph: comparatorDutyGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "sine-voltage-source",
      "resistor",
      "ideal-op-amp-minus-top",
    ],
    minimumDurationMs: 30,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-comparator-duty-input-range",
        signal: netVoltage("INPUT"),
        metric: "peakToPeak",
        startFraction: 0.25,
        minimumExpected: 9.8,
        maximumExpected: 10.2,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-comparator-duty-output-minimum",
        signal: netVoltage("OUTPUT"),
        metric: "minimum",
        startFraction: 0.25,
        minimumExpected: -0.05,
        maximumExpected: 0.1,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-comparator-duty-output-maximum",
        signal: netVoltage("OUTPUT"),
        metric: "maximum",
        startFraction: 0.25,
        minimumExpected: 4.9,
        maximumExpected: 5.1,
      },
      {
        _tag: "HighLevelFraction",
        id: "derived-comparator-duty-high-fraction",
        signal: netVoltage("OUTPUT"),
        startFraction: 0.25,
        minimumHighFraction: 0.3,
        maximumHighFraction: 0.36,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "REFERENCE", "OUTPUT"],
    }),
    references: [
      source(
        "adi-comparator-threshold-duty",
        "Analog Devices University Wiki — comparator threshold behavior",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-2",
        "A comparator output occupies its high state only while the input exceeds the reference; moving the reference within a sinusoidal input range changes the high-state fraction without changing the output limits.",
        "8914c684d62e918380033dea7c10f6801d6d0c111189df6a0cf0c8358ef7b19d",
      ),
    ],
  },
  {
    id: "intent-envelope-load-comparison",
    title: "Behavioral envelope-detector load comparison",
    topologyMode: "behavioral",
    prompt:
      "Design two independent positive diode envelope detectors from one 5 V-peak, 1 kHz sine INPUT. Give both branches equal hold capacitance, choose clearly different light and heavy resistive loads, and preserve LIGHT_ENV, HEAVY_ENV, INPUT, and GND. Simulate until settled and explain why heavier loading lowers the held average and increases ripple. Capacitor and resistor values and reference designators are your choice.",
    questions: [
      {
        id: "envelope-load-levels",
        prompt: "What settled average levels are held by the two detectors?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-envelope-light-average",
          "derived-envelope-heavy-average",
        ],
      },
      {
        id: "envelope-load-average-comparison",
        prompt: "How does the heavy-load average compare with the light branch?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-envelope-heavy-lower-average"],
      },
      {
        id: "envelope-load-ripple-comparison",
        prompt: "How and why does the ripple change under heavier loading?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-envelope-heavy-greater-ripple"],
      },
    ],
    oracleGraph: envelopeLoadComparisonGraph,
    requiredComponentTypes: [
      "sine-voltage-source",
      "diode",
      "diode",
      "capacitor",
      "capacitor",
      "resistor",
      "resistor",
    ],
    minimumDurationMs: 25,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-envelope-light-average",
        signal: netVoltage("LIGHT_ENV"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 3.5,
        maximumExpected: 5,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-envelope-heavy-average",
        signal: netVoltage("HEAVY_ENV"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 3,
        maximumExpected: 5,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-envelope-heavy-lower-average",
        left: netVoltage("HEAVY_ENV"),
        right: netVoltage("LIGHT_ENV"),
        metric: "average",
        startFraction: 0.5,
        relation: "lessThan",
        minimumDifference: 0.1,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-envelope-heavy-greater-ripple",
        left: netVoltage("HEAVY_ENV"),
        right: netVoltage("LIGHT_ENV"),
        metric: "peakToPeak",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.2,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "LIGHT_ENV", "HEAVY_ENV"],
    }),
    references: [
      source(
        "adi-envelope-detector-loading",
        "Analog Devices University Wiki — diode peak and envelope detection",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "An envelope detector diode charges a capacitor near input peaks and the capacitor discharges through the load between peaks; a heavier load lowers the held level and increases ripple.",
        "b0d1e2b5a7398eb31264c5a2e60b30d253ba2da1a8f47f498e3fbf8cb8bbdf13",
      ),
    ],
  },
  {
    id: "intent-nmos-source-degeneration",
    title: "Behavioral NMOS source-degeneration comparison",
    topologyMode: "behavioral",
    prompt:
      "Design two 2 V-threshold NMOS common-source stages from 12 V driven by the same 0.5 V peak-to-peak, 100 Hz gate waveform centered near 2.5 V. Ground one source directly and give the other a source-degeneration resistor. Use drain resistors, preserve GATE, FIXED_DRAIN, DEGENERATED_DRAIN, DEGENERATED_SOURCE, and GND, simulate several cycles, and explain how local feedback shifts bias and reduces drain swing. Resistor values and reference designators are your choice.",
    questions: [
      {
        id: "nmos-degeneration-gate-drive",
        prompt: "What common gate swing drives both stages?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-nmos-degeneration-gate-range"],
      },
      {
        id: "nmos-degeneration-bias",
        prompt: "How does source degeneration shift the average drain voltage?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-nmos-degeneration-higher-drain"],
      },
      {
        id: "nmos-degeneration-gain",
        prompt: "How does local feedback change output swing, and why?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-nmos-degeneration-smaller-swing"],
      },
    ],
    oracleGraph: nmosDegenerationTransientGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "sine-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "n-mosfet",
      "n-mosfet",
    ],
    minimumDurationMs: 30,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-nmos-degeneration-gate-range",
        signal: netVoltage("GATE"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 0.45,
        maximumExpected: 0.55,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-nmos-degeneration-higher-drain",
        left: netVoltage("DEGENERATED_DRAIN"),
        right: netVoltage("FIXED_DRAIN"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 2,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-nmos-degeneration-smaller-swing",
        left: netVoltage("FIXED_DRAIN"),
        right: netVoltage("DEGENERATED_DRAIN"),
        metric: "peakToPeak",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 1,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "GATE", "FIXED_DRAIN", "DEGENERATED_DRAIN", "DEGENERATED_SOURCE"],
    }),
    references: [
      source(
        "adi-mosfet-source-degeneration",
        "Analog Devices University Wiki — MOSFET source degeneration",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-15",
        "A source resistor in a common-source MOSFET stage develops local negative feedback: rising drain current raises source voltage, reduces gate-source overdrive, shifts the bias point, and reduces voltage gain.",
        "ed50e77564d48f65908410dc1e042808d65de3b2d5f6185ee8065ff0908cd9ea",
      ),
    ],
  },
  {
    id: "intent-zener-npn-current-sink",
    title: "Behavioral Zener-referenced NPN current sink",
    topologyMode: "behavioral",
    prompt:
      "Design an NPN current sink from a 12 V supply using a roughly 5.1 V Zener base reference and an emitter resistor chosen for about 1 mA. Add a collector load that leaves clear forward-active headroom. Preserve VREF, EMITTER, COLLECTOR, and GND, simulate the final circuit, and explain how the Zener voltage, base-emitter drop, emitter resistance, and collector headroom establish the behavior. Exact resistor values and reference designators are your choice.",
    questions: [
      {
        id: "zener-sink-reference",
        prompt: "What reference and emitter voltages are observed?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-zener-sink-reference",
          "derived-zener-sink-emitter",
        ],
      },
      {
        id: "zener-sink-base-emitter",
        prompt: "What base-emitter offset supports the current-setting explanation?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-zener-sink-base-emitter-drop"],
      },
      {
        id: "zener-sink-headroom",
        prompt: "Does the collector retain forward-active headroom above the emitter?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-zener-sink-collector-headroom"],
      },
    ],
    oracleGraph: zenerNpnCurrentSinkGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "zener-diode",
      "npn-transistor",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-sink-reference",
        signal: netVoltage("VREF"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 5,
        maximumExpected: 5.3,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-sink-emitter",
        signal: netVoltage("EMITTER"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 4.2,
        maximumExpected: 4.7,
      },
      {
        _tag: "MeanDifference",
        id: "derived-zener-sink-base-emitter-drop",
        minuend: netVoltage("VREF"),
        subtrahend: netVoltage("EMITTER"),
        startFraction: 0.5,
        expected: approximate(0.714, 0.12),
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-zener-sink-collector-headroom",
        left: netVoltage("COLLECTOR"),
        right: netVoltage("EMITTER"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 2,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "VREF", "EMITTER", "COLLECTOR"],
    }),
    references: [
      source(
        "adi-zener-bjt-current-sink",
        "Analog Devices University Wiki — BJT bias and Zener references",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-9",
        "A Zener-referenced BJT current sink holds the base near the Zener voltage; the emitter sits about one base-emitter drop lower, so an emitter resistor sets an approximately constant current while the collector retains enough voltage for forward-active operation.",
        "45be81cfc025ce40feaf3b97793a34f2bf9b8cce3264c4eee84479f117b20819",
      ),
    ],
  },
  {
    id: "intent-bjt-differential-vs-common-mode",
    title: "Behavioral BJT differential versus common-mode response",
    topologyMode: "behavioral",
    prompt:
      "Design two comparable NPN differential pairs on shared positive and negative rails. Drive one pair with a small positive-versus-negative differential input and drive both bases of the other pair from the same small common-mode voltage. Use resistive collector loads and separate tail resistors, preserve DIFF_HIGH_COLLECTOR, DIFF_LOW_COLLECTOR, COMMON_1_COLLECTOR, COMMON_2_COLLECTOR, DIFF_TAIL, COMMON_TAIL, and GND, then simulate and explain current steering versus branch balance. Values and reference designators are your choice.",
    questions: [
      {
        id: "differential-steering",
        prompt: "How far apart are the differential pair's collector levels, and which input side conducts more?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-differential-collector-steering"],
      },
      {
        id: "common-mode-balance",
        prompt: "How closely do the equal-input common-mode collector branches match?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-common-mode-collector-balance"],
      },
      {
        id: "common-mode-region",
        prompt: "What collector level shows that the balanced pair retains operating headroom?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-common-mode-collector-level"],
      },
    ],
    oracleGraph: bjtDifferentialVsCommonModeGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetricComparison",
        id: "derived-differential-collector-steering",
        left: netVoltage("DIFF_LOW_COLLECTOR"),
        right: netVoltage("DIFF_HIGH_COLLECTOR"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 3,
      },
      {
        _tag: "MeanDifference",
        id: "derived-common-mode-collector-balance",
        minuend: netVoltage("COMMON_1_COLLECTOR"),
        subtrahend: netVoltage("COMMON_2_COLLECTOR"),
        startFraction: 0.5,
        expected: approximate(0, 0.05),
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-common-mode-collector-level",
        signal: netVoltage("COMMON_1_COLLECTOR"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 1.5,
        maximumExpected: 4.5,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "DIFF_HIGH_COLLECTOR", "DIFF_LOW_COLLECTOR", "COMMON_1_COLLECTOR", "COMMON_2_COLLECTOR", "DIFF_TAIL", "COMMON_TAIL"],
    }),
    references: [
      source(
        "adi-bjt-differential-common-mode",
        "Analog Devices University Wiki — BJT differential pairs",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-9",
        "A BJT differential pair steers a nearly fixed tail current toward the transistor with the higher base voltage, producing opposite collector-voltage changes; equal common-mode inputs leave the collector branches nearly balanced.",
        "8d680f1adbce5616154a42ecae606ce0a95803a7b9e7333a7dc0c42064717884",
      ),
    ],
  },
  {
    id: "intent-op-amp-leaky-integrator",
    title: "Behavioral leaky op amp integrator",
    topologyMode: "behavioral",
    prompt:
      "Design an inverting leaky integrator on split supplies for a 1 V-peak, 100 Hz sine INPUT. Use an input resistor, a capacitor with a parallel feedback resistor for a DC path, an output load, and an ideal op amp whose limits do not clip. Choose practical R and C values that produce a clear but bounded integrated waveform. Preserve INPUT, SUM, VOUT, and GND, simulate several settled cycles, and explain the gain, phase, virtual-ground behavior, and purpose of the leakage resistor. Values and reference designators are your choice.",
    questions: [
      {
        id: "integrator-gain",
        prompt: "What input and output spans establish the observed gain?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-integrator-input-range",
          "derived-integrator-output-range",
          "derived-integrator-gain",
        ],
      },
      {
        id: "integrator-phase",
        prompt: "What phase relationship demonstrates integration at 100 Hz?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-integrator-phase"],
      },
      {
        id: "integrator-summing-node",
        prompt: "What does SUM show, and why is the parallel feedback resistor still needed?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["derived-integrator-summing-range"],
      },
    ],
    oracleGraph: opAmpLeakyIntegratorGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "sine-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "capacitor",
      "ideal-op-amp-minus-top",
    ],
    minimumDurationMs: 50,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-integrator-input-range",
        signal: netVoltage("INPUT"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 1.9,
        maximumExpected: 2.1,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-integrator-output-range",
        signal: netVoltage("VOUT"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 0.5,
        maximumExpected: 8,
      },
      {
        _tag: "Gain",
        id: "derived-integrator-gain",
        input: netVoltage("INPUT"),
        output: netVoltage("VOUT"),
        startFraction: 0.5,
        expectedRatio: approximate(1.593, 0.25),
      },
      {
        _tag: "PhaseDifference",
        id: "derived-integrator-phase",
        reference: netVoltage("INPUT"),
        compared: netVoltage("VOUT"),
        frequencyHertz: 100,
        startFraction: 0.5,
        expectedDegrees: approximate(99, 12),
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-integrator-summing-range",
        signal: netVoltage("SUM"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 0,
        maximumExpected: 0.001,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "SUM", "VOUT"],
    }),
    references: [
      source(
        "adi-op-amp-leaky-integrator",
        "Analog Devices University Wiki — op amp integrator behavior",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-2",
        "An inverting op amp with capacitive feedback integrates the input: above the leakage pole its magnitude falls with frequency and the output approaches a 90-degree phase lead relative to a sine input, while a parallel feedback resistor provides a DC path.",
        "73d7f5c3e90e2004ba219be478ba26f30b992a38e4bf9b76842f60a62f89b1c8",
      ),
    ],
  },
  {
    id: "intent-op-amp-practical-differentiator",
    title: "Behavioral practical op amp differentiator",
    topologyMode: "behavioral",
    prompt:
      "Design a practical inverting op amp differentiator on split supplies for a 1 V-peak, 100 Hz sine INPUT. Put a capacitor and series resistor in the input path, use resistive feedback, add an output load, and choose values and output limits that produce a clear differentiated waveform without clipping. Preserve INPUT, COUPLED, SUM, VOUT, and GND, simulate several settled cycles, and explain the gain, phase, virtual-ground behavior, and reason for the series resistor. Values and reference designators are your choice.",
    questions: [
      {
        id: "differentiator-gain",
        prompt: "What input and output spans establish the observed gain?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-differentiator-input-range",
          "derived-differentiator-output-range",
          "derived-differentiator-gain",
        ],
      },
      {
        id: "differentiator-phase",
        prompt: "What phase relationship demonstrates differentiation at 100 Hz?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-differentiator-phase"],
      },
      {
        id: "differentiator-summing-node",
        prompt: "What does SUM show, and why is the input series resistor useful?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["derived-differentiator-summing-range"],
      },
    ],
    oracleGraph: opAmpPracticalDifferentiatorGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "sine-voltage-source",
      "capacitor",
      "resistor",
      "resistor",
      "resistor",
      "ideal-op-amp-minus-top",
    ],
    minimumDurationMs: 50,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-differentiator-input-range",
        signal: netVoltage("INPUT"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 1.9,
        maximumExpected: 2.1,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-differentiator-output-range",
        signal: netVoltage("VOUT"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 0.4,
        maximumExpected: 6,
      },
      {
        _tag: "Gain",
        id: "derived-differentiator-gain",
        input: netVoltage("INPUT"),
        output: netVoltage("VOUT"),
        startFraction: 0.5,
        expectedRatio: approximate(0.627, 0.2),
      },
      {
        _tag: "PhaseDifference",
        id: "derived-differentiator-phase",
        reference: netVoltage("INPUT"),
        compared: netVoltage("VOUT"),
        frequencyHertz: 100,
        startFraction: 0.5,
        expectedDegrees: approximate(-94, 12),
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-differentiator-summing-range",
        signal: netVoltage("SUM"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 0,
        maximumExpected: 0.001,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "COUPLED", "SUM", "VOUT"],
    }),
    references: [
      source(
        "adi-op-amp-practical-differentiator",
        "Analog Devices University Wiki — op amp differentiator behavior",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-2",
        "A practical inverting op amp differentiator uses an input capacitor and series resistor with resistive feedback: below its high-frequency limiting corner, output magnitude rises with frequency and a sine output approaches a 90-degree phase lag, while the series resistor limits high-frequency gain.",
        "c515385ab984e2225f4e91b7ecc455f030c87cce6c7aaaef4b6fa9412ebf0bc2",
      ),
    ],
  },
  {
    id: "intent-pnp-differential-vs-common-mode",
    title: "Behavioral PNP differential versus common-mode response",
    topologyMode: "behavioral",
    prompt:
      "Design two comparable PNP differential pairs between shared positive and negative rails. Drive one pair with a small negative-versus-positive differential input and drive both bases of the other pair from the same small common-mode voltage. Use resistive collector loads and separate emitter-tail resistors, preserve DIFF_LOW_COLLECTOR, DIFF_HIGH_COLLECTOR, COMMON_1_COLLECTOR, COMMON_2_COLLECTOR, DIFF_TAIL, COMMON_TAIL, and GND, then simulate and explain lower-base current steering versus equal-input branch balance. Values and reference designators are your choice.",
    questions: [
      {
        id: "pnp-differential-steering",
        prompt: "How far apart are the differential collector levels, and which base side conducts more?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-pnp-differential-steering"],
      },
      {
        id: "pnp-common-mode-balance",
        prompt: "How closely do the equal-input common-mode collector branches match?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-pnp-common-mode-balance"],
      },
      {
        id: "pnp-common-mode-region",
        prompt: "What collector level demonstrates a balanced PNP operating point?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-pnp-common-mode-level"],
      },
    ],
    oracleGraph: pnpDifferentialVsCommonModeGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "pnp-transistor",
      "pnp-transistor",
      "pnp-transistor",
      "pnp-transistor",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetricComparison",
        id: "derived-pnp-differential-steering",
        left: netVoltage("DIFF_LOW_COLLECTOR"),
        right: netVoltage("DIFF_HIGH_COLLECTOR"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 3,
      },
      {
        _tag: "MeanDifference",
        id: "derived-pnp-common-mode-balance",
        minuend: netVoltage("COMMON_1_COLLECTOR"),
        subtrahend: netVoltage("COMMON_2_COLLECTOR"),
        startFraction: 0.5,
        expected: approximate(0, 0.05),
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-pnp-common-mode-level",
        signal: netVoltage("COMMON_1_COLLECTOR"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: -4.5,
        maximumExpected: -1.5,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "DIFF_LOW_COLLECTOR", "DIFF_HIGH_COLLECTOR", "COMMON_1_COLLECTOR", "COMMON_2_COLLECTOR", "DIFF_TAIL", "COMMON_TAIL"],
    }),
    references: [
      source(
        "adi-pnp-differential-common-mode",
        "Analog Devices University Wiki — PNP differential pairs",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-9",
        "A PNP differential pair steers its source current toward the transistor with the lower base voltage; equal common-mode base voltages leave matched collector branches balanced, with polarities complementary to an NPN pair.",
        "d84a5a9b8ecebd89a1ff8290b8ce01903eb2f800ace2745abb08667b52ac5005",
      ),
    ],
  },
  {
    id: "intent-zener-regulated-led-colors",
    title: "Behavioral Zener-regulated color-dependent LEDs",
    topologyMode: "behavioral",
    prompt:
      "Design a Zener shunt regulator from a DC supply and use its regulated rail to feed separate red and blue LED branches through current-limiting resistors. Choose practical values that keep the Zener conducting while both LEDs are lit. Preserve REGULATED, RED_ANODE, BLUE_ANODE, and GND, simulate, and explain the regulated level, color-dependent LED forward drops, and why the two equal-resistance branches draw different current. Values and reference designators are your choice.",
    questions: [
      {
        id: "led-regulated-level",
        prompt: "What rail level shows that the Zener remains in regulation under both LED loads?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-led-regulated-level"],
      },
      {
        id: "led-color-drops",
        prompt: "What red and blue forward levels are observed?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-red-led-drop",
          "derived-blue-led-drop",
        ],
      },
      {
        id: "led-color-ordering",
        prompt: "Which LED color has the higher forward drop, and by how much at minimum?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-blue-above-red"],
      },
    ],
    oracleGraph: zenerRegulatedLedColorsGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "resistor",
      "zener-diode",
      "resistor",
      "resistor",
      "led",
      "led",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-led-regulated-level",
        signal: netVoltage("REGULATED"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 4.8,
        maximumExpected: 5.4,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-red-led-drop",
        signal: netVoltage("RED_ANODE"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 1.5,
        maximumExpected: 2.3,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-blue-led-drop",
        signal: netVoltage("BLUE_ANODE"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 2.6,
        maximumExpected: 3.6,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-blue-above-red",
        left: netVoltage("BLUE_ANODE"),
        right: netVoltage("RED_ANODE"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.6,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "REGULATED", "RED_ANODE", "BLUE_ANODE"],
    }),
    references: [
      source(
        "adi-zener-regulated-led-colors",
        "Analog Devices University Wiki — diode and LED behavior",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "LED forward voltage depends on semiconductor bandgap and emitted color; under comparable bias a blue LED has a higher forward drop than a red LED, while a Zener shunt can supply both from a bounded regulated rail.",
        "b84c075840dacade1879b56a67f93314d364f78850040648b7b7e8d2dfe0a610",
      ),
    ],
  },
  {
    id: "intent-pnp-common-emitter-amplifier",
    title: "Behavioral PNP common-emitter amplifier",
    topologyMode: "behavioral",
    prompt:
      "Design a beta-100 PNP common-emitter amplifier from a negative supply. Bias a small sine input at a negative DC level, use resistive base drive plus collector and emitter resistors, and choose values that keep the transistor forward-active while producing visible voltage gain without clipping. Preserve INPUT, BASE, EMITTER, COLLECTOR, and GND, simulate several settled cycles, and explain the negative operating point, gain, and phase. Values and reference designators are your choice.",
    questions: [
      {
        id: "pnp-amplifier-operating-point",
        prompt: "What input and collector averages establish a valid negative-rail operating point?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-pnp-amplifier-input-average",
          "derived-pnp-amplifier-collector-average",
        ],
      },
      {
        id: "pnp-amplifier-gain",
        prompt: "What input and collector spans establish the small-signal gain?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-pnp-amplifier-input-range",
          "derived-pnp-amplifier-output-range",
          "derived-pnp-amplifier-gain",
        ],
      },
      {
        id: "pnp-amplifier-phase",
        prompt: "What phase relationship identifies common-emitter inversion?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-pnp-amplifier-phase"],
      },
    ],
    oracleGraph: pnpCommonEmitterTransientGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "sine-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "pnp-transistor",
    ],
    minimumDurationMs: 50,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-pnp-amplifier-input-average",
        signal: netVoltage("INPUT"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: -3,
        maximumExpected: -0.8,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-pnp-amplifier-collector-average",
        signal: netVoltage("COLLECTOR"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: -8,
        maximumExpected: -3,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-pnp-amplifier-input-range",
        signal: netVoltage("INPUT"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 0.02,
        maximumExpected: 0.1,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-pnp-amplifier-output-range",
        signal: netVoltage("COLLECTOR"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 0.05,
        maximumExpected: 1,
      },
      {
        _tag: "Gain",
        id: "derived-pnp-amplifier-gain",
        input: netVoltage("INPUT"),
        output: netVoltage("COLLECTOR"),
        startFraction: 0.5,
        expectedRatio: approximate(2.88, 1.5),
      },
      {
        _tag: "PhaseDifference",
        id: "derived-pnp-amplifier-phase",
        reference: netVoltage("INPUT"),
        compared: netVoltage("COLLECTOR"),
        frequencyHertz: 100,
        startFraction: 0.5,
        expectedDegrees: approximate(180, 15),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "BASE", "EMITTER", "COLLECTOR"],
    }),
    references: [
      source(
        "adi-pnp-common-emitter-amplifier",
        "Analog Devices University Wiki — common-emitter BJT amplifiers",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-9",
        "A common-emitter PNP amplifier biased from a negative supply is complementary to an NPN stage: a small base-voltage increase reduces collector current, producing an inverted collector waveform around a negative DC operating point.",
        "1986a2770f54cba67e107fa366c92ec79b3c68e8004996b128c9322ee9bc17b2",
      ),
    ],
  },
  {
    id: "intent-zener-pnp-current-source-compliance",
    title: "Behavioral Zener-referenced PNP compliance comparison",
    topologyMode: "behavioral",
    prompt:
      "Design two high-side PNP current-source branches from a positive supply using one roughly 5.1 V Zener base reference. Use equal emitter resistors so both branches target the same current, then choose one collector load that leaves clear forward-active headroom and another that forces the collector close to its emitter and limits compliance. Preserve VREF, ACTIVE_EMITTER, LIMITED_EMITTER, ACTIVE_COLLECTOR, LIMITED_COLLECTOR, and GND, simulate, and explain the complementary base-emitter offset and compliance failure. Values and reference designators are your choice.",
    questions: [
      {
        id: "pnp-source-reference",
        prompt: "What reference and emitter levels establish the PNP source current?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-pnp-source-reference",
          "derived-pnp-source-base-emitter",
        ],
      },
      {
        id: "pnp-source-active-headroom",
        prompt: "What voltage separation shows the active branch retains collector-emitter headroom?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-pnp-source-active-headroom"],
      },
      {
        id: "pnp-source-compliance",
        prompt: "How do the limited collector and emitter levels demonstrate saturation?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-pnp-source-limited-collector",
          "derived-pnp-source-limited-headroom",
        ],
      },
    ],
    oracleGraph: zenerPnpCurrentSourceComplianceGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "resistor",
      "zener-diode",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "pnp-transistor",
      "pnp-transistor",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-pnp-source-reference",
        signal: netVoltage("VREF"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 4.8,
        maximumExpected: 5.4,
      },
      {
        _tag: "MeanDifference",
        id: "derived-pnp-source-base-emitter",
        minuend: netVoltage("ACTIVE_EMITTER"),
        subtrahend: netVoltage("VREF"),
        startFraction: 0.5,
        expected: approximate(0.714, 0.12),
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-pnp-source-active-headroom",
        left: netVoltage("ACTIVE_EMITTER"),
        right: netVoltage("ACTIVE_COLLECTOR"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 2,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-pnp-source-limited-collector",
        left: netVoltage("LIMITED_COLLECTOR"),
        right: netVoltage("ACTIVE_COLLECTOR"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 2,
      },
      {
        _tag: "MeanDifference",
        id: "derived-pnp-source-limited-headroom",
        minuend: netVoltage("LIMITED_EMITTER"),
        subtrahend: netVoltage("LIMITED_COLLECTOR"),
        startFraction: 0.5,
        expected: approximate(0.033, 0.15),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "VREF", "ACTIVE_EMITTER", "LIMITED_EMITTER", "ACTIVE_COLLECTOR", "LIMITED_COLLECTOR"],
    }),
    references: [
      source(
        "adi-zener-pnp-current-source-compliance",
        "Analog Devices University Wiki — PNP bias and compliance",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-9",
        "A Zener-referenced high-side PNP current source uses the reference and base-emitter voltage to set emitter current; as the collector approaches the emitter voltage, insufficient collector-emitter headroom forces saturation and reduces load current.",
        "9cab7a8a63bfb86f570142540f1a855602905239a8fa127bc54bd52bb5b3f374",
      ),
    ],
  },
  {
    id: "intent-zener-series-led-headroom",
    title: "Behavioral Zener-fed LED-string headroom",
    topologyMode: "behavioral",
    prompt:
      "Design a roughly 5.1 V Zener shunt rail that simultaneously feeds two branches through equal current-limiting resistors: one branch has a single red LED, while the other has a blue LED in series with a red LED. Keep the Zener regulating under both loads. Preserve REGULATED, RED_ANODE, STRING_TOP, STRING_MID, and GND, simulate, and explain the individual LED drops, their series sum, and why the series branch draws less current despite equal resistors. Supply and resistor values and reference designators are your choice.",
    questions: [
      {
        id: "led-string-regulation",
        prompt: "What rail voltage shows that the Zener stays regulated?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-led-string-regulated-level"],
      },
      {
        id: "led-string-drops",
        prompt: "What red and blue drops make up the series string?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-led-string-red-drop",
          "derived-led-string-blue-drop",
        ],
      },
      {
        id: "led-string-current-headroom",
        prompt: "How do the two resistor drops prove which equal-resistance branch carries more current?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-led-string-resistor-drop-comparison"],
      },
    ],
    oracleGraph: zenerSeriesLedHeadroomGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "resistor",
      "zener-diode",
      "resistor",
      "resistor",
      "led",
      "led",
      "led",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-led-string-regulated-level",
        signal: netVoltage("REGULATED"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 4.8,
        maximumExpected: 5.4,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-led-string-red-drop",
        signal: netVoltage("STRING_MID"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 1.4,
        maximumExpected: 2.2,
      },
      {
        _tag: "MeanDifference",
        id: "derived-led-string-blue-drop",
        minuend: netVoltage("STRING_TOP"),
        subtrahend: netVoltage("STRING_MID"),
        startFraction: 0.5,
        expected: approximate(2.94, 0.5),
      },
      {
        _tag: "MeanDifferenceComparison",
        id: "derived-led-string-resistor-drop-comparison",
        leftMinuend: netVoltage("REGULATED"),
        leftSubtrahend: netVoltage("RED_ANODE"),
        rightMinuend: netVoltage("REGULATED"),
        rightSubtrahend: netVoltage("STRING_TOP"),
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 1.5,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "REGULATED", "RED_ANODE", "STRING_TOP", "STRING_MID"],
    }),
    references: [
      source(
        "adi-zener-series-led-headroom",
        "Analog Devices University Wiki — series diode and LED behavior",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "LED forward voltages add in a series string and every device carries the same current; from a limited regulated rail, a red-plus-blue string leaves less resistor headroom and therefore draws less current than a single red LED through an equal resistor.",
        "6efc6fa57e6cbfb867c1c90e7728aee34d245fb23ad79169e63fd8cc735fabeb",
      ),
    ],
  },
  {
    id: "intent-ordinary-vs-precision-rectifier",
    title: "Behavioral ordinary versus precision rectification",
    topologyMode: "behavioral",
    prompt:
      "Design two positive half-wave rectifiers for the same small sine INPUT and equal resistive loads. Use one ordinary diode branch and one op amp precision branch that places a diode inside negative feedback on split supplies. Keep the op amp out of clipping during the positive half-cycle. Preserve INPUT, ORDINARY_OUT, PRECISION_DRIVE, PRECISION_OUT, and GND, simulate several cycles, and explain negative blocking plus how feedback recovers the positive peak that the ordinary diode loses. Values and reference designators are your choice.",
    questions: [
      {
        id: "precision-rectifier-input",
        prompt: "What input span establishes the small-signal test?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-precision-rectifier-input-range"],
      },
      {
        id: "precision-rectifier-peaks",
        prompt: "What ordinary and precision peaks quantify diode-drop recovery?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-ordinary-rectifier-peak",
          "derived-precision-rectifier-peak",
          "derived-precision-above-ordinary",
        ],
      },
      {
        id: "precision-rectifier-blocking",
        prompt: "What minimum output shows that the precision branch still blocks the negative half-cycle?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-precision-rectifier-minimum"],
      },
    ],
    oracleGraph: ordinaryVsPrecisionRectifierGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "sine-voltage-source",
      "diode",
      "resistor",
      "ideal-op-amp-minus-top",
      "diode",
      "resistor",
    ],
    minimumDurationMs: 30,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-precision-rectifier-input-range",
        signal: netVoltage("INPUT"),
        metric: "peakToPeak",
        startFraction: 0.25,
        minimumExpected: 1.9,
        maximumExpected: 2.1,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-ordinary-rectifier-peak",
        signal: netVoltage("ORDINARY_OUT"),
        metric: "maximum",
        startFraction: 0.25,
        minimumExpected: 0.2,
        maximumExpected: 0.7,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-precision-rectifier-peak",
        signal: netVoltage("PRECISION_OUT"),
        metric: "maximum",
        startFraction: 0.25,
        minimumExpected: 0.9,
        maximumExpected: 1.05,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-precision-above-ordinary",
        left: netVoltage("PRECISION_OUT"),
        right: netVoltage("ORDINARY_OUT"),
        metric: "maximum",
        startFraction: 0.25,
        relation: "greaterThan",
        minimumDifference: 0.4,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-precision-rectifier-minimum",
        signal: netVoltage("PRECISION_OUT"),
        metric: "minimum",
        startFraction: 0.25,
        minimumExpected: -0.01,
        maximumExpected: 0.05,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "ORDINARY_OUT", "PRECISION_DRIVE", "PRECISION_OUT"],
    }),
    references: [
      source(
        "adi-op-amp-precision-rectifier",
        "Analog Devices University Wiki — op amp precision rectification",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-2",
        "In a precision half-wave rectifier, an op amp places the diode inside the feedback loop, compensating its forward drop during the conducting half-cycle so small positive inputs are reproduced while the opposite polarity is blocked.",
        "13fc3591ad54043481b10c6ee8679f43df7b13c7ad48f596b0713f13ed69f843",
      ),
    ],
  },
  {
    id: "intent-zener-clamp-load-sweep",
    title: "Behavioral Zener clamp load sweep",
    topologyMode: "behavioral",
    prompt:
      "Design three comparable asymmetric Zener limiter branches driven by one sine INPUT. Use roughly 5.1 V Zeners and equal source resistors, then choose light, medium, and heavy resistive loads so LIGHT_OUT has strong avalanche clamping, MEDIUM_OUT is near the boundary, and HEAVY_OUT never reaches breakdown and behaves like a divider. Preserve INPUT, LIGHT_OUT, MEDIUM_OUT, HEAVY_OUT, and GND, simulate several cycles, and explain the positive peaks and negative forward clamps. Values and reference designators are your choice.",
    questions: [
      {
        id: "zener-clamp-input",
        prompt: "What input range drives all three branches?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-zener-clamp-input-range"],
      },
      {
        id: "zener-clamp-positive-loads",
        prompt: "How do the three positive peaks distinguish breakdown from load-induced dropout?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-clamp-light-peak",
          "derived-zener-clamp-medium-peak",
          "derived-zener-clamp-heavy-peak",
          "derived-zener-clamp-light-above-heavy",
        ],
      },
      {
        id: "zener-clamp-negative",
        prompt: "What heavy-branch minimum demonstrates ordinary forward conduction on the negative half-cycle?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-zener-clamp-negative-level"],
      },
    ],
    oracleGraph: zenerClampLoadSweepGraph,
    requiredComponentTypes: [
      "sine-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "zener-diode",
      "zener-diode",
      "zener-diode",
    ],
    minimumDurationMs: 30,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-clamp-input-range",
        signal: netVoltage("INPUT"),
        metric: "peakToPeak",
        startFraction: 0.25,
        minimumExpected: 19,
        maximumExpected: 21,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-clamp-light-peak",
        signal: netVoltage("LIGHT_OUT"),
        metric: "maximum",
        startFraction: 0.25,
        minimumExpected: 4.9,
        maximumExpected: 5.5,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-clamp-medium-peak",
        signal: netVoltage("MEDIUM_OUT"),
        metric: "maximum",
        startFraction: 0.25,
        minimumExpected: 4.8,
        maximumExpected: 5.5,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-clamp-heavy-peak",
        signal: netVoltage("HEAVY_OUT"),
        metric: "maximum",
        startFraction: 0.25,
        minimumExpected: 2.5,
        maximumExpected: 4,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-zener-clamp-light-above-heavy",
        left: netVoltage("LIGHT_OUT"),
        right: netVoltage("HEAVY_OUT"),
        metric: "maximum",
        startFraction: 0.25,
        relation: "greaterThan",
        minimumDifference: 1,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-clamp-negative-level",
        signal: netVoltage("HEAVY_OUT"),
        metric: "minimum",
        startFraction: 0.25,
        minimumExpected: -1,
        maximumExpected: -0.4,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "LIGHT_OUT", "MEDIUM_OUT", "HEAVY_OUT"],
    }),
    references: [
      source(
        "adi-zener-clamp-load-dropout",
        "Analog Devices University Wiki — Zener shunt behavior",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "A shunt Zener clamps only when source current exceeds load current and leaves avalanche current; a sufficiently heavy load pulls the node below breakdown, so the circuit behaves as a passive divider instead of a regulated clamp.",
        "03c501e97459e42c9038d0d39f6df4859fa9d834dcb946d39cc60525d3a77b39",
      ),
    ],
  },
  {
    id: "intent-class-b-vs-class-ab-crossover",
    title: "Behavioral class-B versus class-AB crossover tracking",
    topologyMode: "behavioral",
    prompt:
      "Design two complementary NPN/PNP emitter followers on shared split rails and drive them from the same sine net DRIVE. Leave both bases of the first branch directly driven for class-B operation. Give the second branch complementary base bias and small emitter ballast resistors for class-AB operation. Use equal output loads, preserve CLASS_B_OUT, CLASS_AB_OUT, the biased base nets, and GND, simulate several cycles, and explain peak loss, crossover dead band, improved zero-crossing tracking, and the quiescent-current tradeoff. Values and reference designators are your choice.",
    questions: [
      {
        id: "class-output-spans",
        prompt: "What drive and output spans show the class-B peak loss and class-AB recovery?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-class-drive-range",
          "derived-class-b-output-range",
          "derived-class-ab-output-range",
          "derived-class-ab-greater-span",
        ],
      },
      {
        id: "class-tracking-error",
        prompt: "How much does complementary bias reduce normalized tracking error through the cycle?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-class-ab-tracking-improvement"],
      },
      {
        id: "class-crossover-explanation",
        prompt: "Why does the class-B branch distort near zero while class AB tracks, and what is the tradeoff?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "derived-class-ab-tracking-improvement",
          "adi-class-b-class-ab-crossover",
        ],
      },
    ],
    oracleGraph: classBVsClassAbCrossoverGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "sine-voltage-source",
      "resistor",
      "npn-transistor",
      "pnp-transistor",
      "dc-voltage-source",
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "npn-transistor",
      "pnp-transistor",
    ],
    minimumDurationMs: 30,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-class-drive-range",
        signal: netVoltage("DRIVE"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 5.5,
        maximumExpected: 6.5,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-class-b-output-range",
        signal: netVoltage("CLASS_B_OUT"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 4,
        maximumExpected: 5,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-class-ab-output-range",
        signal: netVoltage("CLASS_AB_OUT"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 5.5,
        maximumExpected: 6.2,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-class-ab-greater-span",
        left: netVoltage("CLASS_AB_OUT"),
        right: netVoltage("CLASS_B_OUT"),
        metric: "peakToPeak",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 1,
      },
      {
        _tag: "TrackingErrorComparison",
        id: "derived-class-ab-tracking-improvement",
        reference: netVoltage("DRIVE"),
        baseline: netVoltage("CLASS_B_OUT"),
        improved: netVoltage("CLASS_AB_OUT"),
        startFraction: 0.5,
        minimumReductionRatio: 0.2,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "DRIVE", "CLASS_B_OUT", "AB_N_BASE", "AB_P_BASE", "CLASS_AB_OUT"],
    }),
    references: [
      source(
        "adi-class-b-class-ab-crossover",
        "Analog Devices University Wiki — complementary emitter followers",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-9",
        "A complementary class-B emitter follower has a crossover dead band because neither transistor conducts until its base-emitter junction is forward biased; complementary bias toward class AB reduces normalized tracking error through zero at the cost of quiescent current.",
        "73afb86b5a7d739bea0702f636ea8a13f51ccf64fb66c54795b6dac7fe740b63",
      ),
    ],
  },
  {
    id: "intent-dual-gain-transimpedance-amplifiers",
    title: "Behavioral dual-gain transimpedance conversion",
    topologyMode: "behavioral",
    prompt:
      "Design two linear op amp current-to-voltage converters on shared split supplies. Inject the same small DC current into both inverting summing nodes, keep the non-inverting inputs at ground, and choose feedback resistors in a two-to-one ratio so the second negative output has twice the magnitude of the first without clipping. Preserve SUM_10K, OUT_10K, SUM_20K, OUT_20K, and GND, simulate, and explain current balance, virtual ground, polarity, and the resistance-to-output scaling. Values and reference designators are your choice.",
    questions: [
      {
        id: "transimpedance-virtual-grounds",
        prompt: "What measured summing-node levels demonstrate virtual-ground operation?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-transimpedance-sum-10k",
          "derived-transimpedance-sum-20k",
        ],
      },
      {
        id: "transimpedance-output-polarity",
        prompt: "What output levels demonstrate inverted current-to-voltage conversion without clipping?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-transimpedance-output-10k",
          "derived-transimpedance-output-20k",
        ],
      },
      {
        id: "transimpedance-gain-scaling",
        prompt: "How does the measured output ratio prove that doubling feedback resistance doubles transimpedance?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-transimpedance-output-ratio"],
      },
    ],
    oracleGraph: dualGainTransimpedanceAmplifiersGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-current-source",
      "dc-current-source",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-transimpedance-sum-10k",
        signal: netVoltage("SUM_10K"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: -0.001,
        maximumExpected: 0.001,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-transimpedance-sum-20k",
        signal: netVoltage("SUM_20K"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: -0.001,
        maximumExpected: 0.001,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-transimpedance-output-10k",
        signal: netVoltage("OUT_10K"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: -3,
        maximumExpected: -2,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-transimpedance-output-20k",
        signal: netVoltage("OUT_20K"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: -5.5,
        maximumExpected: -4.5,
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-transimpedance-output-ratio",
        numerator: netVoltage("OUT_20K"),
        denominator: netVoltage("OUT_10K"),
        startFraction: 0.5,
        expectedRatio: approximate(2, 0.05),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "SUM_10K", "OUT_10K", "SUM_20K", "OUT_20K"],
    }),
    references: [
      source(
        "adi-op-amp-transimpedance-scaling",
        "Analog Devices University Wiki — transimpedance amplifiers",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-2",
        "An op amp transimpedance amplifier holds its inverting input near virtual ground and converts input current to an inverted output voltage set by the feedback resistance; doubling feedback resistance doubles output magnitude for the same input current while feedback remains linear.",
        "6f938abc1fc9f1faf8783e6f9f9637e958249fd1bf857b3e0bb01414e8e7cf37",
      ),
    ],
  },
  {
    id: "intent-complementary-bjt-phase-splitters",
    title: "Behavioral complementary BJT phase splitting",
    topologyMode: "behavioral",
    prompt:
      "Design complementary NPN and PNP phase-splitter stages on positive and negative rails. Give each transistor equal collector and emitter resistors, bias them at mirrored operating points, and drive them with mirrored small sine inputs. Preserve N_INPUT, P_INPUT, N_COLLECTOR, P_COLLECTOR, N_EMITTER, P_EMITTER, and GND, simulate several cycles, and explain collector inversion, emitter following, nearly equal AC swings, and complementary symmetry. Values and reference designators are your choice.",
    questions: [
      {
        id: "phase-splitter-npn-phase",
        prompt: "What phase measurements show that the NPN emitter follows while its collector inverts?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-phase-splitter-collector-phase",
          "derived-phase-splitter-emitter-phase",
        ],
      },
      {
        id: "phase-splitter-output-gains",
        prompt: "What collector and emitter gains show nearly equal AC output swings?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-phase-splitter-collector-gain",
          "derived-phase-splitter-emitter-gain",
        ],
      },
      {
        id: "phase-splitter-complementary-symmetry",
        prompt: "How closely do the positive-rail and negative-rail collector and emitter outputs cancel?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-phase-splitter-collector-symmetry",
          "derived-phase-splitter-emitter-symmetry",
        ],
      },
    ],
    oracleGraph: complementaryBjtPhaseSplittersGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "sine-voltage-source",
      "sine-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "npn-transistor",
      "pnp-transistor",
    ],
    minimumDurationMs: 50,
    derivedObservations: [
      {
        _tag: "PhaseDifference",
        id: "derived-phase-splitter-collector-phase",
        reference: netVoltage("N_INPUT"),
        compared: netVoltage("N_COLLECTOR"),
        frequencyHertz: 100,
        startFraction: 0.5,
        expectedDegrees: approximate(180, 5),
      },
      {
        _tag: "PhaseDifference",
        id: "derived-phase-splitter-emitter-phase",
        reference: netVoltage("N_INPUT"),
        compared: netVoltage("N_EMITTER"),
        frequencyHertz: 100,
        startFraction: 0.5,
        expectedDegrees: approximate(0, 5),
      },
      {
        _tag: "Gain",
        id: "derived-phase-splitter-collector-gain",
        input: netVoltage("N_INPUT"),
        output: netVoltage("N_COLLECTOR"),
        startFraction: 0.5,
        expectedRatio: approximate(0.916, 0.12),
      },
      {
        _tag: "Gain",
        id: "derived-phase-splitter-emitter-gain",
        input: netVoltage("N_INPUT"),
        output: netVoltage("N_EMITTER"),
        startFraction: 0.5,
        expectedRatio: approximate(0.925, 0.12),
      },
      {
        _tag: "SumCancellation",
        id: "derived-phase-splitter-collector-symmetry",
        left: netVoltage("N_COLLECTOR"),
        right: netVoltage("P_COLLECTOR"),
        startFraction: 0.5,
        maximumResidualRatio: 0.01,
      },
      {
        _tag: "SumCancellation",
        id: "derived-phase-splitter-emitter-symmetry",
        left: netVoltage("N_EMITTER"),
        right: netVoltage("P_EMITTER"),
        startFraction: 0.5,
        maximumResidualRatio: 0.01,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "N_INPUT", "P_INPUT", "N_COLLECTOR", "P_COLLECTOR", "N_EMITTER", "P_EMITTER"],
    }),
    references: [
      source(
        "adi-bjt-phase-splitter",
        "Analog Devices University Wiki — transistor phase splitting",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-9",
        "A transistor phase splitter takes collector and emitter outputs from one common-emitter stage: the emitter follows the base signal while the collector is inverted; equal collector and emitter resistances produce nearly equal AC output magnitudes, with the small mismatch set by collector versus emitter current.",
        "a5f89304dd0c8e9388becf295b1a942651be119e52f34babb2526be3eb58b898",
      ),
    ],
  },
  {
    id: "intent-single-vs-stacked-zener-references",
    title: "Behavioral single versus stacked Zener references",
    topologyMode: "behavioral",
    prompt:
      "Design two loaded Zener references from one positive supply. Use one reverse-breakdown device for SINGLE_REF and a series pair of similar devices for STACK_TOP, preserving their STACK_MID junction. Choose separate feed resistors so both branches retain useful avalanche current under equal loads. Preserve SINGLE_REF, STACK_TOP, STACK_MID, and GND, simulate, and explain individual breakdown levels, series voltage addition, and why the stacked output is about twice the single output. Values and reference designators are your choice.",
    questions: [
      {
        id: "zener-stack-individual-levels",
        prompt: "What three measured levels demonstrate similar individual breakdown voltages?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-zener-single-level",
          "derived-zener-stack-mid-level",
          "derived-zener-upper-drop",
        ],
      },
      {
        id: "zener-stack-total-level",
        prompt: "What total stacked voltage demonstrates two breakdown drops in series?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-zener-stack-total-level"],
      },
      {
        id: "zener-stack-output-ratio",
        prompt: "What measured ratio proves that the pair produces approximately twice the single-device reference?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-zener-stack-output-ratio"],
      },
    ],
    oracleGraph: singleVsStackedZenerReferencesGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "resistor",
      "zener-diode",
      "resistor",
      "resistor",
      "zener-diode",
      "zener-diode",
      "resistor",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-single-level",
        signal: netVoltage("SINGLE_REF"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 4.9,
        maximumExpected: 5.4,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-stack-mid-level",
        signal: netVoltage("STACK_MID"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 4.9,
        maximumExpected: 5.4,
      },
      {
        _tag: "MeanDifference",
        id: "derived-zener-upper-drop",
        minuend: netVoltage("STACK_TOP"),
        subtrahend: netVoltage("STACK_MID"),
        startFraction: 0.5,
        expected: approximate(5.15, 0.25),
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-stack-total-level",
        signal: netVoltage("STACK_TOP"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 9.8,
        maximumExpected: 10.7,
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-zener-stack-output-ratio",
        numerator: netVoltage("STACK_TOP"),
        denominator: netVoltage("SINGLE_REF"),
        startFraction: 0.5,
        expectedRatio: approximate(2, 0.08),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "SINGLE_REF", "STACK_TOP", "STACK_MID"],
    }),
    references: [
      source(
        "adi-series-zener-reference-addition",
        "Analog Devices University Wiki — series Zener references",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "Series Zener diodes in reverse breakdown add their individual reference voltages; the same avalanche current flows through every diode in the series stack, so two similar 5.1 V devices produce roughly twice the voltage of one device when adequate current and headroom remain.",
        "043091e3059ed22e10fa989f9b2654e9098c8d730246b7e4cb0aafc8b3b2da41",
      ),
    ],
  },
  {
    id: "intent-instrumentation-common-mode-rejection",
    title: "Behavioral instrumentation-amplifier common-mode rejection",
    topologyMode: "behavioral",
    prompt:
      "Design a three-op-amp instrumentation amplifier whose two inputs carry a small fixed differential voltage on top of a much larger shared sine common-mode waveform. Use a matched difference stage and enough linear output headroom that only the differential signal is amplified. Preserve COMMON, INPUT_P, INPUT_N, FIRST_P, FIRST_N, INA_OUT, and GND, simulate several cycles, and explain input differential voltage, common-mode span, differential gain, and residual output ripple. Values and reference designators are your choice.",
    questions: [
      {
        id: "instrumentation-input-separation",
        prompt: "What common-mode span and input difference define the rejection test?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-instrumentation-common-span",
          "derived-instrumentation-input-difference",
        ],
      },
      {
        id: "instrumentation-output-level",
        prompt: "What average output demonstrates amplification of the small differential input?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-instrumentation-output-level"],
      },
      {
        id: "instrumentation-common-rejection",
        prompt: "How small is output ripple while both inputs carry the common-mode sine?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-instrumentation-output-ripple"],
      },
    ],
    oracleGraph: instrumentationCommonModeRejectionGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "sine-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
    ],
    minimumDurationMs: 30,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-instrumentation-common-span",
        signal: netVoltage("COMMON"),
        metric: "peakToPeak",
        startFraction: 0.25,
        minimumExpected: 3.8,
        maximumExpected: 4.2,
      },
      {
        _tag: "MeanDifference",
        id: "derived-instrumentation-input-difference",
        minuend: netVoltage("INPUT_P"),
        subtrahend: netVoltage("INPUT_N"),
        startFraction: 0.25,
        expected: approximate(0.1, 0.01),
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-instrumentation-output-level",
        signal: netVoltage("INA_OUT"),
        metric: "average",
        startFraction: 0.25,
        minimumExpected: 0.55,
        maximumExpected: 0.65,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-instrumentation-output-ripple",
        signal: netVoltage("INA_OUT"),
        metric: "peakToPeak",
        startFraction: 0.25,
        minimumExpected: 0,
        maximumExpected: 0.005,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "COMMON", "INPUT_P", "INPUT_N", "FIRST_P", "FIRST_N", "INA_OUT"],
    }),
    references: [
      source(
        "adi-instrumentation-common-mode-rejection",
        "Analog Devices University Wiki — instrumentation amplifiers",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-2",
        "A three-op-amp instrumentation amplifier uses high-input-impedance non-inverting stages followed by a matched difference amplifier; the resistor network amplifies differential voltage while ideally rejecting a voltage common to both inputs.",
        "e7308a49324e6e0367823322a049cb1cdf30667dec7005cfbf105bb79e3a9901",
      ),
    ],
  },
  {
    id: "intent-bjt-emitter-bypass-comparison",
    title: "Behavioral BJT emitter-bypass gain comparison",
    topologyMode: "behavioral",
    prompt:
      "Design two otherwise comparable NPN common-emitter amplifiers driven from one small biased sine input. Keep an emitter resistor active for AC feedback in the first branch, and bypass the second branch's emitter resistor with a capacitor that has useful impedance at the signal frequency. Preserve INPUT, UNBYPASSED_COLLECTOR, UNBYPASSED_EMITTER, BYPASSED_COLLECTOR, BYPASSED_EMITTER, and GND, simulate settled cycles, and explain equal DC bias, phase inversion, reduced emitter motion, and increased collector gain after bypassing. Values and reference designators are your choice.",
    questions: [
      {
        id: "bjt-bypass-gain-change",
        prompt: "What two measured gains and collector swings quantify the bypass effect?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-bjt-unbypassed-gain",
          "derived-bjt-bypassed-gain",
          "derived-bjt-bypassed-greater-swing",
        ],
      },
      {
        id: "bjt-bypass-emitter-motion",
        prompt: "How do the emitter swings demonstrate reduced AC degeneration in the bypassed branch?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-bjt-bypass-emitter-reduction"],
      },
      {
        id: "bjt-bypass-phase",
        prompt: "What phase evidence shows unbypassed inversion and the bypass capacitor's additional reactive shift?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-bjt-unbypassed-phase",
          "derived-bjt-bypassed-phase",
        ],
      },
    ],
    oracleGraph: bjtEmitterBypassComparisonGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "sine-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "npn-transistor",
      "resistor",
      "resistor",
      "resistor",
      "capacitor",
      "npn-transistor",
    ],
    minimumDurationMs: 50,
    derivedObservations: [
      {
        _tag: "Gain",
        id: "derived-bjt-unbypassed-gain",
        input: netVoltage("INPUT"),
        output: netVoltage("UNBYPASSED_COLLECTOR"),
        startFraction: 0.5,
        expectedRatio: approximate(2.88, 0.5),
      },
      {
        _tag: "Gain",
        id: "derived-bjt-bypassed-gain",
        input: netVoltage("INPUT"),
        output: netVoltage("BYPASSED_COLLECTOR"),
        startFraction: 0.5,
        expectedRatio: approximate(14.77, 2),
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-bjt-bypassed-greater-swing",
        left: netVoltage("BYPASSED_COLLECTOR"),
        right: netVoltage("UNBYPASSED_COLLECTOR"),
        metric: "peakToPeak",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.15,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-bjt-bypass-emitter-reduction",
        left: netVoltage("UNBYPASSED_EMITTER"),
        right: netVoltage("BYPASSED_EMITTER"),
        metric: "peakToPeak",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.002,
      },
      {
        _tag: "PhaseDifference",
        id: "derived-bjt-unbypassed-phase",
        reference: netVoltage("INPUT"),
        compared: netVoltage("UNBYPASSED_COLLECTOR"),
        frequencyHertz: 100,
        startFraction: 0.5,
        expectedDegrees: approximate(180, 5),
      },
      {
        _tag: "PhaseDifference",
        id: "derived-bjt-bypassed-phase",
        reference: netVoltage("INPUT"),
        compared: netVoltage("BYPASSED_COLLECTOR"),
        frequencyHertz: 100,
        startFraction: 0.5,
        expectedDegrees: approximate(-135.4, 10),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "UNBYPASSED_COLLECTOR", "UNBYPASSED_EMITTER", "BYPASSED_COLLECTOR", "BYPASSED_EMITTER"],
    }),
    references: [
      source(
        "adi-bjt-emitter-bypass-feedback",
        "Analog Devices University Wiki — emitter degeneration and bypass",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-9",
        "An emitter resistor provides AC negative feedback and lowers common-emitter gain; a bypass capacitor presents lower impedance at signal frequency, reducing emitter degeneration and increasing inverted collector swing while leaving the DC bias path through the resistor.",
        "4a3fb90ed43efaf521ad4ef17456a4b27b8a42548280b90e865460e56bebca74",
      ),
    ],
  },
  {
    id: "intent-stacked-zener-midpoint-load-sweep",
    title: "Behavioral stacked-Zener midpoint-load dropout",
    topologyMode: "behavioral",
    prompt:
      "Design three comparable two-device Zener stacks from one positive supply. Load every stack top equally, then use light, medium, and heavy loads at the three diode midpoints so the first two lower devices remain in breakdown while the heavy branch's lower device drops out. Preserve LIGHT_TOP, LIGHT_MID, MEDIUM_TOP, MEDIUM_MID, HEAVY_TOP, HEAVY_MID, and GND, simulate, and explain current diversion, the falling midpoint voltage, and why the heavy branch's upper diode can still retain roughly one breakdown drop. Values and reference designators are your choice.",
    questions: [
      {
        id: "zener-midpoint-load-levels",
        prompt: "What light, medium, and heavy midpoint levels show the transition into dropout?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-midpoint-light-level",
          "derived-zener-midpoint-medium-level",
          "derived-zener-midpoint-heavy-level",
          "derived-zener-midpoint-light-above-heavy",
        ],
      },
      {
        id: "zener-midpoint-upper-device",
        prompt: "What heavy-branch top-to-mid drop shows that the upper device still operates in breakdown?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-zener-midpoint-heavy-upper-drop"],
      },
      {
        id: "zener-midpoint-current-diversion",
        prompt: "Why does loading the midpoint remove avalanche current from the lower device first?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "derived-zener-midpoint-light-above-heavy",
          "adi-zener-midpoint-load-dropout",
        ],
      },
    ],
    oracleGraph: stackedZenerMidpointLoadSweepGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "zener-diode",
      "zener-diode",
      "resistor",
      "resistor",
      "resistor",
      "zener-diode",
      "zener-diode",
      "resistor",
      "resistor",
      "resistor",
      "zener-diode",
      "zener-diode",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-midpoint-light-level",
        signal: netVoltage("LIGHT_MID"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 4.9,
        maximumExpected: 5.4,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-midpoint-medium-level",
        signal: netVoltage("MEDIUM_MID"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 4.9,
        maximumExpected: 5.4,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-midpoint-heavy-level",
        signal: netVoltage("HEAVY_MID"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 4.2,
        maximumExpected: 4.8,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-zener-midpoint-light-above-heavy",
        left: netVoltage("LIGHT_MID"),
        right: netVoltage("HEAVY_MID"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.4,
      },
      {
        _tag: "MeanDifference",
        id: "derived-zener-midpoint-heavy-upper-drop",
        minuend: netVoltage("HEAVY_TOP"),
        subtrahend: netVoltage("HEAVY_MID"),
        startFraction: 0.5,
        expected: approximate(5.17, 0.3),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "LIGHT_TOP", "LIGHT_MID", "MEDIUM_TOP", "MEDIUM_MID", "HEAVY_TOP", "HEAVY_MID"],
    }),
    references: [
      source(
        "adi-zener-midpoint-load-dropout",
        "Analog Devices University Wiki — Zener current and load behavior",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "A load connected to the midpoint of series Zener diodes subtracts from the current available to the lower device; a sufficiently heavy midpoint load can pull the lower diode below breakdown while the upper diode still supports approximately its own Zener voltage.",
        "7cc60b6684dd56a9a4cae4fd3bcf4058371ab36694a9419ef18eedfea891031b",
      ),
    ],
  },
  {
    id: "intent-logarithmic-amplifier-current-decades",
    title: "Behavioral logarithmic current-to-voltage conversion",
    topologyMode: "behavioral",
    prompt:
      "Design three comparable op amp logarithmic converters for positive input currents separated by two consecutive tenfold steps. Put one ordinary PN diode in each negative-feedback path, hold each non-inverting input at the reference node, and choose equal input resistors so LOW_INPUT, MID_INPUT, and HIGH_INPUT produce three current decades without clipping. Preserve all three input, summing, and output nets as LOW_INPUT, MID_INPUT, HIGH_INPUT, LOW_SUM, MID_SUM, HIGH_SUM, LOW_LOG, MID_LOG, HIGH_LOG, and GND. Simulate and explain virtual ground, inverted output polarity, and why two tenfold current increases produce nearly equal voltage increments. Values and reference designators are your choice.",
    questions: [
      {
        id: "log-amplifier-input-decades",
        prompt: "What measured input ratios establish two consecutive current decades with equal input resistors?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-log-input-mid-low-ratio",
          "derived-log-input-high-mid-ratio",
        ],
      },
      {
        id: "log-amplifier-output-levels",
        prompt: "What three output levels and summing-node evidence show negative logarithmic conversion with virtual ground?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-log-low-output",
          "derived-log-mid-output",
          "derived-log-high-output",
          "derived-log-mid-sum",
        ],
      },
      {
        id: "log-amplifier-equal-decade-steps",
        prompt: "What two output-voltage steps demonstrate logarithmic rather than linear scaling, and why should they be similar?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-log-low-mid-step",
          "derived-log-mid-high-step",
          "adi-diode-feedback-logarithmic-conversion",
        ],
      },
    ],
    oracleGraph: logarithmicAmplifierCurrentDecadesGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "diode",
      "diode",
      "diode",
      "resistor",
      "resistor",
      "resistor",
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "MagnitudeRatio",
        id: "derived-log-input-mid-low-ratio",
        numerator: netVoltage("MID_INPUT"),
        denominator: netVoltage("LOW_INPUT"),
        startFraction: 0.5,
        expectedRatio: approximate(10, 0.2),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-log-input-high-mid-ratio",
        numerator: netVoltage("HIGH_INPUT"),
        denominator: netVoltage("MID_INPUT"),
        startFraction: 0.5,
        expectedRatio: approximate(10, 0.2),
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-log-low-output",
        signal: netVoltage("LOW_LOG"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: -0.58,
        maximumExpected: -0.5,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-log-mid-output",
        signal: netVoltage("MID_LOG"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: -0.64,
        maximumExpected: -0.56,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-log-high-output",
        signal: netVoltage("HIGH_LOG"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: -0.7,
        maximumExpected: -0.62,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-log-mid-sum",
        signal: netVoltage("MID_SUM"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: -0.001,
        maximumExpected: 0.001,
      },
      {
        _tag: "MeanDifference",
        id: "derived-log-low-mid-step",
        minuend: netVoltage("LOW_LOG"),
        subtrahend: netVoltage("MID_LOG"),
        startFraction: 0.5,
        expected: approximate(0.05956, 0.006),
      },
      {
        _tag: "MeanDifference",
        id: "derived-log-mid-high-step",
        minuend: netVoltage("MID_LOG"),
        subtrahend: netVoltage("HIGH_LOG"),
        startFraction: 0.5,
        expected: approximate(0.05956, 0.006),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "LOW_INPUT", "MID_INPUT", "HIGH_INPUT", "LOW_SUM", "MID_SUM", "HIGH_SUM", "LOW_LOG", "MID_LOG", "HIGH_LOG"],
    }),
    references: [
      source(
        "adi-diode-feedback-logarithmic-conversion",
        "Analog Devices Nonlinear Circuits Handbook — logarithmic circuits",
        "https://www.analog.com/media/en/training-seminars/design-handbooks/Nonlinear-Circuits-Handbook/Part3.pdf",
        "An op amp with a diode in its negative-feedback path holds the summing node near virtual ground and forces input current through the junction; the exponential diode law therefore makes output voltage logarithmic, producing approximately 59.5 mV per tenfold current change near room temperature.",
        "2a7bcf63c9d2ad0638198dbdaf2cfb6ffb6f42b3c118b3745c4071c4ff7e52c8",
      ),
    ],
  },
  {
    id: "intent-bjt-partial-emitter-bypass-progression",
    title: "Behavioral partial emitter-bypass progression",
    topologyMode: "behavioral",
    prompt:
      "Design three otherwise comparable NPN common-emitter amplifiers driven by one small biased sine input. Keep the first stage's full emitter resistance active for AC degeneration, split the second stage's equal total DC emitter resistance and bypass only its lower section, and bypass the third stage's full emitter resistance. Preserve INPUT, UNBYPASSED_COLLECTOR, UNBYPASSED_EMITTER, PARTIAL_COLLECTOR, PARTIAL_EMITTER, PARTIAL_TAP, FULL_COLLECTOR, FULL_EMITTER, and GND. Simulate settled cycles and explain how equal total DC resistance preserves bias while the remaining unbypassed AC resistance orders the gains UNBYPASSED < PARTIAL < FULL. Values and reference designators are your choice.",
    questions: [
      {
        id: "partial-bypass-dc-bias",
        prompt: "What collector averages show that all three stages retain essentially the same DC operating point?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-partial-bypass-unbypassed-partial-dc",
          "derived-partial-bypass-partial-full-dc",
        ],
      },
      {
        id: "partial-bypass-gain-progression",
        prompt: "What three measured gains and swing comparisons demonstrate the ordered bypass progression?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-partial-bypass-unbypassed-gain",
          "derived-partial-bypass-partial-gain",
          "derived-partial-bypass-full-gain",
          "derived-partial-bypass-partial-above-unbypassed",
          "derived-partial-bypass-full-above-partial",
        ],
      },
      {
        id: "partial-bypass-resistance-role",
        prompt: "Why does bypassing only part of the emitter resistance preserve DC bias but produce intermediate AC gain?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "derived-partial-bypass-partial-gain",
          "adi-partial-emitter-bypass-gain",
        ],
      },
    ],
    oracleGraph: partialEmitterBypassProgressionGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "sine-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "npn-transistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "capacitor",
      "npn-transistor",
      "resistor",
      "resistor",
      "resistor",
      "capacitor",
      "npn-transistor",
    ],
    minimumDurationMs: 50,
    derivedObservations: [
      {
        _tag: "MeanDifference",
        id: "derived-partial-bypass-unbypassed-partial-dc",
        minuend: netVoltage("UNBYPASSED_COLLECTOR"),
        subtrahend: netVoltage("PARTIAL_COLLECTOR"),
        startFraction: 0.5,
        expected: approximate(0, 0.02),
      },
      {
        _tag: "MeanDifference",
        id: "derived-partial-bypass-partial-full-dc",
        minuend: netVoltage("PARTIAL_COLLECTOR"),
        subtrahend: netVoltage("FULL_COLLECTOR"),
        startFraction: 0.5,
        expected: approximate(0, 0.02),
      },
      {
        _tag: "Gain",
        id: "derived-partial-bypass-unbypassed-gain",
        input: netVoltage("INPUT"),
        output: netVoltage("UNBYPASSED_COLLECTOR"),
        startFraction: 0.5,
        expectedRatio: approximate(2.88, 0.5),
      },
      {
        _tag: "Gain",
        id: "derived-partial-bypass-partial-gain",
        input: netVoltage("INPUT"),
        output: netVoltage("PARTIAL_COLLECTOR"),
        startFraction: 0.5,
        expectedRatio: approximate(10.8, 1.2),
      },
      {
        _tag: "Gain",
        id: "derived-partial-bypass-full-gain",
        input: netVoltage("INPUT"),
        output: netVoltage("FULL_COLLECTOR"),
        startFraction: 0.5,
        expectedRatio: approximate(14.77, 1.8),
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-partial-bypass-partial-above-unbypassed",
        left: netVoltage("PARTIAL_COLLECTOR"),
        right: netVoltage("UNBYPASSED_COLLECTOR"),
        metric: "peakToPeak",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.1,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-partial-bypass-full-above-partial",
        left: netVoltage("FULL_COLLECTOR"),
        right: netVoltage("PARTIAL_COLLECTOR"),
        metric: "peakToPeak",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.05,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "UNBYPASSED_COLLECTOR", "UNBYPASSED_EMITTER", "PARTIAL_COLLECTOR", "PARTIAL_EMITTER", "PARTIAL_TAP", "FULL_COLLECTOR", "FULL_EMITTER"],
    }),
    references: [
      source(
        "adi-partial-emitter-bypass-gain",
        "Analog Devices University Wiki — partial emitter bypass",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-9",
        "Splitting the emitter resistance lets the full series resistance establish DC bias while a sufficiently large capacitor bypasses only the lower section for AC; the remaining unbypassed resistance sets an intermediate common-emitter gain between fully degenerated and fully bypassed stages.",
        "43e7ecfd98549b179b359880d83e45b9e33fc2e2bc1bf61388f74b9d6515d956",
      ),
    ],
  },
  {
    id: "intent-zener-ripple-capacitance-sweep",
    title: "Behavioral Zener-reference capacitance sweep",
    topologyMode: "behavioral",
    prompt:
      "Design three comparable loaded Zener shunt references driven by one positive supply with a high-frequency sine ripple superimposed on its DC level. Leave RAW_REF without shunt capacitance, add a useful capacitor across FILTERED_REF, and add substantially more capacitance across HEAVY_FILTER_REF. Keep every Zener in reverse breakdown with similar average output voltage. Preserve RIPPLE_SUPPLY, RAW_REF, FILTERED_REF, HEAVY_FILTER_REF, and GND, simulate settled cycles, and explain why output ripple must decrease monotonically as capacitance increases. Values and reference designators are your choice.",
    questions: [
      {
        id: "zener-capacitance-input-ripple",
        prompt: "What supply ripple span establishes the common disturbance applied to all branches?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-zener-capacitance-supply-ripple"],
      },
      {
        id: "zener-capacitance-dc-levels",
        prompt: "What average levels show that all three branches retain the same Zener reference function?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-capacitance-raw-dc",
          "derived-zener-capacitance-filtered-dc",
          "derived-zener-capacitance-heavy-dc",
        ],
      },
      {
        id: "zener-capacitance-ripple-ordering",
        prompt: "What three ripple amplitudes and pairwise margins demonstrate increasing shunt-capacitance filtering?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-capacitance-raw-ripple",
          "derived-zener-capacitance-filtered-ripple",
          "derived-zener-capacitance-heavy-ripple",
          "derived-zener-capacitance-raw-above-filtered",
          "derived-zener-capacitance-filtered-above-heavy",
          "adi-zener-reference-capacitive-ripple-filtering",
        ],
      },
    ],
    oracleGraph: zenerRippleCapacitanceSweepGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "sine-voltage-source",
      "resistor",
      "zener-diode",
      "resistor",
      "resistor",
      "zener-diode",
      "resistor",
      "capacitor",
      "resistor",
      "zener-diode",
      "resistor",
      "capacitor",
    ],
    minimumDurationMs: 8,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-capacitance-supply-ripple",
        signal: netVoltage("RIPPLE_SUPPLY"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 1.9,
        maximumExpected: 2.1,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-capacitance-raw-dc",
        signal: netVoltage("RAW_REF"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 5,
        maximumExpected: 5.3,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-capacitance-filtered-dc",
        signal: netVoltage("FILTERED_REF"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 5,
        maximumExpected: 5.3,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-capacitance-heavy-dc",
        signal: netVoltage("HEAVY_FILTER_REF"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 5,
        maximumExpected: 5.3,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-capacitance-raw-ripple",
        signal: netVoltage("RAW_REF"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 0.06,
        maximumExpected: 0.09,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-capacitance-filtered-ripple",
        signal: netVoltage("FILTERED_REF"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 0.006,
        maximumExpected: 0.011,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-capacitance-heavy-ripple",
        signal: netVoltage("HEAVY_FILTER_REF"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 0.0005,
        maximumExpected: 0.002,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-zener-capacitance-raw-above-filtered",
        left: netVoltage("RAW_REF"),
        right: netVoltage("FILTERED_REF"),
        metric: "peakToPeak",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.005,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-zener-capacitance-filtered-above-heavy",
        left: netVoltage("FILTERED_REF"),
        right: netVoltage("HEAVY_FILTER_REF"),
        metric: "peakToPeak",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.004,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "RIPPLE_SUPPLY", "RAW_REF", "FILTERED_REF", "HEAVY_FILTER_REF"],
    }),
    references: [
      source(
        "adi-zener-reference-capacitive-ripple-filtering",
        "Analog Devices University Wiki — capacitor ripple filtering",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-6",
        "A capacitor shunting a reference node passes AC ripple while leaving the DC bias path intact; because capacitive reactance decreases as capacitance and frequency increase, larger shunt capacitance produces lower ripple while the reverse-biased Zener continues to set the average reference level.",
        "c0623f4df7254595e3175b0f0605f4a5aa8cf91b72deaf1843a1e03159ee8be5",
      ),
    ],
  },
  {
    id: "intent-antilogarithmic-amplifier-input-steps",
    title: "Behavioral antilogarithmic voltage-to-current progression",
    topologyMode: "behavioral",
    prompt:
      "Design three comparable op amp antilogarithmic converters whose positive DC input voltages are separated by two equal, modest increments. Put one ordinary PN diode in each input path, hold each non-inverting input at the reference node, and use equal linear feedback resistors so the junction currents become measurable negative output voltages without clipping. Preserve LOW_INPUT, MID_INPUT, HIGH_INPUT, LOW_SUM, MID_SUM, HIGH_SUM, LOW_OUT, MID_OUT, HIGH_OUT, and GND. Simulate and explain virtual ground and why equal input-voltage steps produce nearly equal output-magnitude ratios rather than equal output-voltage differences. Values and reference designators are your choice.",
    questions: [
      {
        id: "antilog-equal-input-steps",
        prompt: "What two measured input-voltage increments establish the equal-step excitation?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-antilog-low-mid-input-step",
          "derived-antilog-mid-high-input-step",
        ],
      },
      {
        id: "antilog-exponential-output-ratios",
        prompt: "What adjacent output-magnitude ratios demonstrate exponential conversion?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-antilog-mid-low-output-ratio",
          "derived-antilog-high-mid-output-ratio",
          "adi-diode-input-antilogarithmic-conversion",
        ],
      },
      {
        id: "antilog-virtual-ground-and-polarity",
        prompt: "What summing-node and output-level evidence shows closed negative feedback with inverted polarity?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-antilog-mid-sum",
          "derived-antilog-low-output",
          "derived-antilog-mid-output",
          "derived-antilog-high-output",
        ],
      },
    ],
    oracleGraph: antilogarithmicAmplifierInputStepsGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "diode",
      "diode",
      "diode",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "MeanDifference",
        id: "derived-antilog-low-mid-input-step",
        minuend: netVoltage("MID_INPUT"),
        subtrahend: netVoltage("LOW_INPUT"),
        startFraction: 0.5,
        expected: approximate(0.04, 0.005),
      },
      {
        _tag: "MeanDifference",
        id: "derived-antilog-mid-high-input-step",
        minuend: netVoltage("HIGH_INPUT"),
        subtrahend: netVoltage("MID_INPUT"),
        startFraction: 0.5,
        expected: approximate(0.04, 0.005),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-antilog-mid-low-output-ratio",
        numerator: netVoltage("MID_OUT"),
        denominator: netVoltage("LOW_OUT"),
        startFraction: 0.5,
        expectedRatio: approximate(4.69, 0.4),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-antilog-high-mid-output-ratio",
        numerator: netVoltage("HIGH_OUT"),
        denominator: netVoltage("MID_OUT"),
        startFraction: 0.5,
        expectedRatio: approximate(4.69, 0.4),
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-antilog-mid-sum",
        signal: netVoltage("MID_SUM"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: -0.001,
        maximumExpected: 0.001,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-antilog-low-output",
        signal: netVoltage("LOW_OUT"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: -0.3,
        maximumExpected: -0.15,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-antilog-mid-output",
        signal: netVoltage("MID_OUT"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: -1.2,
        maximumExpected: -0.8,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-antilog-high-output",
        signal: netVoltage("HIGH_OUT"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: -5.3,
        maximumExpected: -4.2,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "LOW_INPUT", "MID_INPUT", "HIGH_INPUT", "LOW_SUM", "MID_SUM", "HIGH_SUM", "LOW_OUT", "MID_OUT", "HIGH_OUT"],
    }),
    references: [
      source(
        "adi-diode-input-antilogarithmic-conversion",
        "Analog Devices University Wiki — exponential (antilog) output amplifiers",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-7",
        "With a PN diode in the input path and a linear resistor in negative feedback, an ideal op amp holds the summing node at virtual ground; the diode exponential current-voltage law therefore makes output magnitude exponential in positive input voltage, so equal voltage increments produce equal output-current ratios.",
        "685a3c945e87431da22f10c6760e6ecd35a24ec5552bb7ccd072e1ad28b179a7",
      ),
    ],
  },
  {
    id: "intent-ordinary-vs-widlar-current-source",
    title: "Behavioral ordinary-mirror versus Widlar comparison",
    topologyMode: "behavioral",
    prompt:
      "Design two comparable matched-NPN current-source branches from one positive supply. Use equal reference and collector resistors with a diode-connected reference device in each branch. Ground the ordinary mirror's two emitters, but add an emitter resistor only beneath the Widlar output transistor so it produces a much smaller collector current while retaining useful compliance. Preserve VCC, ORDINARY_BASE, ORDINARY_OUT, WIDLAR_BASE, WIDLAR_OUT, WIDLAR_EMITTER, and GND. Simulate and explain how matched reference bias leads to very different equal-load voltage drops and therefore output currents, and how the emitter voltage reveals local degeneration. Values and reference designators are your choice.",
    questions: [
      {
        id: "widlar-reference-bias-comparison",
        prompt: "What base-voltage difference shows that the two equal-resistor reference branches have comparable bias?",
        answerKind: "comparison",
        requiredEvidenceRefs: ["derived-widlar-reference-base-match"],
      },
      {
        id: "widlar-output-current-reduction",
        prompt: "What two equal-load voltage drops and comparison margin demonstrate the Widlar current reduction?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-widlar-ordinary-output-drop",
          "derived-widlar-reduced-output-drop",
          "derived-widlar-ordinary-drop-above-reduced",
        ],
      },
      {
        id: "widlar-emitter-degeneration",
        prompt: "How does the measured emitter voltage explain the reduced current and preserved output headroom?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "derived-widlar-emitter-voltage",
          "derived-widlar-output-headroom",
          "adi-widlar-output-emitter-degeneration",
        ],
      },
    ],
    oracleGraph: ordinaryVsWidlarCurrentSourceGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "resistor",
      "resistor",
      "npn-transistor",
      "npn-transistor",
      "resistor",
      "resistor",
      "resistor",
      "npn-transistor",
      "npn-transistor",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "MeanDifference",
        id: "derived-widlar-reference-base-match",
        minuend: netVoltage("ORDINARY_BASE"),
        subtrahend: netVoltage("WIDLAR_BASE"),
        startFraction: 0.5,
        expected: approximate(0, 0.03),
      },
      {
        _tag: "MeanDifference",
        id: "derived-widlar-ordinary-output-drop",
        minuend: netVoltage("VCC"),
        subtrahend: netVoltage("ORDINARY_OUT"),
        startFraction: 0.5,
        expected: approximate(1.83635, 0.3),
      },
      {
        _tag: "MeanDifference",
        id: "derived-widlar-reduced-output-drop",
        minuend: netVoltage("VCC"),
        subtrahend: netVoltage("WIDLAR_OUT"),
        startFraction: 0.5,
        expected: approximate(0.0807323, 0.05),
      },
      {
        _tag: "MeanDifferenceComparison",
        id: "derived-widlar-ordinary-drop-above-reduced",
        leftMinuend: netVoltage("VCC"),
        leftSubtrahend: netVoltage("ORDINARY_OUT"),
        rightMinuend: netVoltage("VCC"),
        rightSubtrahend: netVoltage("WIDLAR_OUT"),
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 1,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-widlar-emitter-voltage",
        signal: netVoltage("WIDLAR_EMITTER"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 0.04,
        maximumExpected: 0.15,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-widlar-output-headroom",
        signal: netVoltage("WIDLAR_OUT"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 8.5,
        maximumExpected: 9,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "VCC", "ORDINARY_BASE", "ORDINARY_OUT", "WIDLAR_BASE", "WIDLAR_OUT", "WIDLAR_EMITTER"],
    }),
    references: [
      source(
        "adi-widlar-output-emitter-degeneration",
        "Analog Devices University Wiki — Widlar current source",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-11",
        "A Widlar current source adds an emitter-degeneration resistor only to the output transistor; its voltage drop subtracts from that transistor’s base-emitter voltage, reducing collector current relative to the diode-connected reference and allowing low currents with moderate resistor values.",
        "f28adab279fb9b1511ad8ffe784b6ed514770df73376a80c05b686eda5facc3b",
      ),
    ],
  },
  {
    id: "intent-zener-dynamic-resistance-sweep",
    title: "Behavioral Zener dynamic-resistance ripple sweep",
    topologyMode: "behavioral",
    prompt:
      "Design three comparable loaded Zener shunt references driven by one positive supply with a high-frequency sine ripple superimposed on its DC level. Keep the breakdown voltage, feed resistance, and load resistance alike, but use low, medium, and high Zener dynamic resistance. Preserve RIPPLE_SUPPLY, STIFF_REF, MEDIUM_REF, SOFT_REF, and GND. Simulate settled cycles and explain how finite avalanche slope changes both the average reference and ripple transfer, with ripple ordered STIFF_REF < MEDIUM_REF < SOFT_REF. Values and reference designators are your choice.",
    questions: [
      {
        id: "zener-dynamic-resistance-common-ripple",
        prompt: "What source ripple span establishes the common disturbance?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-zener-dynamic-supply-ripple"],
      },
      {
        id: "zener-dynamic-resistance-ripple-ordering",
        prompt: "What three output ripples and pairwise margins demonstrate increasing ripple transfer?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-dynamic-stiff-ripple",
          "derived-zener-dynamic-medium-ripple",
          "derived-zener-dynamic-soft-ripple",
          "derived-zener-dynamic-medium-above-stiff",
          "derived-zener-dynamic-soft-above-medium",
          "adi-zener-low-dynamic-resistance-stability",
        ],
      },
      {
        id: "zener-dynamic-resistance-dc-shift",
        prompt: "How do the three average reference levels reveal the finite-slope voltage shift?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-dynamic-stiff-dc",
          "derived-zener-dynamic-medium-dc",
          "derived-zener-dynamic-soft-dc",
          "derived-zener-dynamic-medium-dc-above-stiff",
          "derived-zener-dynamic-soft-dc-above-medium",
        ],
      },
    ],
    oracleGraph: zenerDynamicResistanceSweepGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "sine-voltage-source",
      "resistor",
      "zener-diode",
      "resistor",
      "resistor",
      "zener-diode",
      "resistor",
      "resistor",
      "zener-diode",
      "resistor",
    ],
    minimumDurationMs: 8,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-dynamic-supply-ripple",
        signal: netVoltage("RIPPLE_SUPPLY"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 1.9,
        maximumExpected: 2.1,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-dynamic-stiff-ripple",
        signal: netVoltage("STIFF_REF"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 0.05,
        maximumExpected: 0.12,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-dynamic-medium-ripple",
        signal: netVoltage("MEDIUM_REF"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 0.18,
        maximumExpected: 0.36,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-dynamic-soft-ripple",
        signal: netVoltage("SOFT_REF"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 0.38,
        maximumExpected: 0.6,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-zener-dynamic-medium-above-stiff",
        left: netVoltage("MEDIUM_REF"),
        right: netVoltage("STIFF_REF"),
        metric: "peakToPeak",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.1,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-zener-dynamic-soft-above-medium",
        left: netVoltage("SOFT_REF"),
        right: netVoltage("MEDIUM_REF"),
        metric: "peakToPeak",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.1,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-dynamic-stiff-dc",
        signal: netVoltage("STIFF_REF"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 5.1,
        maximumExpected: 5.4,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-dynamic-medium-dc",
        signal: netVoltage("MEDIUM_REF"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 5.4,
        maximumExpected: 5.7,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-zener-dynamic-soft-dc",
        signal: netVoltage("SOFT_REF"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 5.7,
        maximumExpected: 6,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-zener-dynamic-medium-dc-above-stiff",
        left: netVoltage("MEDIUM_REF"),
        right: netVoltage("STIFF_REF"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.15,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-zener-dynamic-soft-dc-above-medium",
        left: netVoltage("SOFT_REF"),
        right: netVoltage("MEDIUM_REF"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.15,
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "RIPPLE_SUPPLY", "STIFF_REF", "MEDIUM_REF", "SOFT_REF"],
    }),
    references: [
      source(
        "adi-zener-low-dynamic-resistance-stability",
        "Analog Devices — high-side current sensing with wide dynamic range",
        "https://www.analog.com/en/resources/analog-dialogue/articles/high-side-current-sensing-wide-dynamic-range.html",
        "Zener voltage stability improves as dynamic resistance decreases; a larger incremental breakdown resistance converts supply-driven current variation into a larger reference-voltage variation, increasing ripple transfer.",
        "fd7b8725f91cae60449cda4f40d4f7b7df534822c805a2aa8022d8409e04f339",
      ),
    ],
  },
  {
    id: "intent-bjt-early-effect-collector-sweep",
    title: "Behavioral BJT Early-effect collector-voltage sweep",
    topologyMode: "behavioral",
    prompt:
      "Design three comparable forward-active NPN branches whose emitters share the reference node and whose bases share one fixed bias near a normal silicon VBE. Give the collectors substantially different positive voltages through equal, small current-sense resistors so collector current can be compared without materially disturbing VCE. Preserve SHARED_BASE, LOW_SUPPLY, MID_SUPPLY, HIGH_SUPPLY, LOW_COLLECTOR, MID_COLLECTOR, HIGH_COLLECTOR, and GND. Simulate and explain the small monotonic collector-current increase at fixed VBE and the finite output resistance implied by the current-versus-voltage slope. Exact voltages, resistor values, and reference designators are your choice, but all devices must remain forward-active.",
    questions: [
      {
        id: "early-effect-common-base-bias",
        prompt: "What measured shared-base level establishes equal forward bias for all three devices?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-early-effect-shared-base"],
      },
      {
        id: "early-effect-current-ordering",
        prompt: "What three branch currents and pairwise margins demonstrate that collector current rises with VCE at fixed VBE?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-early-effect-low-current",
          "derived-early-effect-mid-current",
          "derived-early-effect-high-current",
          "derived-early-effect-mid-above-low",
          "derived-early-effect-high-above-mid",
          "adi-bjt-early-effect-output-slope",
        ],
      },
      {
        id: "early-effect-output-resistance",
        prompt: "What adjacent ΔVCE/ΔIC values quantify the transistor's finite output resistance?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-early-effect-low-mid-output-resistance",
          "derived-early-effect-mid-high-output-resistance",
        ],
      },
    ],
    oracleGraph: bjtEarlyEffectCollectorSweepGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-early-effect-shared-base",
        signal: netVoltage("SHARED_BASE"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 0.6,
        maximumExpected: 0.8,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-early-effect-low-current",
        signal: branchCurrent("LOW_SUPPLY", "LOW_COLLECTOR", "resistor"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 0.0005,
        maximumExpected: 0.0007,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-early-effect-mid-current",
        signal: branchCurrent("MID_SUPPLY", "MID_COLLECTOR", "resistor"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 0.0005,
        maximumExpected: 0.0007,
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-early-effect-high-current",
        signal: branchCurrent("HIGH_SUPPLY", "HIGH_COLLECTOR", "resistor"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: 0.0005,
        maximumExpected: 0.0007,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-early-effect-mid-above-low",
        left: branchCurrent("MID_SUPPLY", "MID_COLLECTOR", "resistor"),
        right: branchCurrent("LOW_SUPPLY", "LOW_COLLECTOR", "resistor"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.00001,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-early-effect-high-above-mid",
        left: branchCurrent("HIGH_SUPPLY", "HIGH_COLLECTOR", "resistor"),
        right: branchCurrent("MID_SUPPLY", "MID_COLLECTOR", "resistor"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.00001,
      },
      {
        _tag: "DifferenceRatio",
        id: "derived-early-effect-low-mid-output-resistance",
        numeratorMinuend: netVoltage("MID_COLLECTOR"),
        numeratorSubtrahend: netVoltage("LOW_COLLECTOR"),
        denominatorMinuend: branchCurrent("MID_SUPPLY", "MID_COLLECTOR", "resistor"),
        denominatorSubtrahend: branchCurrent("LOW_SUPPLY", "LOW_COLLECTOR", "resistor"),
        startFraction: 0.5,
        expectedRatio: approximate(176_350, 15_000),
      },
      {
        _tag: "DifferenceRatio",
        id: "derived-early-effect-mid-high-output-resistance",
        numeratorMinuend: netVoltage("HIGH_COLLECTOR"),
        numeratorSubtrahend: netVoltage("MID_COLLECTOR"),
        denominatorMinuend: branchCurrent("HIGH_SUPPLY", "HIGH_COLLECTOR", "resistor"),
        denominatorSubtrahend: branchCurrent("MID_SUPPLY", "MID_COLLECTOR", "resistor"),
        startFraction: 0.5,
        expectedRatio: approximate(176_350, 15_000),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "SHARED_BASE", "LOW_SUPPLY", "MID_SUPPLY", "HIGH_SUPPLY", "LOW_COLLECTOR", "MID_COLLECTOR", "HIGH_COLLECTOR"],
    }),
    references: [
      source(
        "adi-bjt-early-effect-output-slope",
        "Analog Devices University Wiki — BJT Early effect",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-8",
        "At fixed base drive in forward-active operation, the Early effect makes BJT collector current rise slightly as collector-emitter voltage increases; extrapolating that finite slope defines the Early voltage, so the device has finite rather than infinite output resistance.",
        "606e3e39d0d7380fb0ce77ad6665becb3e4fe73c56df01d2807a847d97ea2f3e",
      ),
    ],
  },
  {
    id: "intent-zener-dynamic-resistance-load-line",
    title: "Behavioral Zener incremental-resistance load line",
    topologyMode: "behavioral",
    prompt:
      "Design three comparable unloaded Zener shunt branches from one positive DC supply. Use equal nominal breakdown voltages and target about 50 Ohm avalanche dynamic resistance in every Zener, but choose three feed resistors that establish clearly separated low, medium, and high reverse currents. Preserve VCC, LOW_REF, MID_REF, HIGH_REF, and GND. Simulate and explain why reverse voltage rises with bias current, then calculate the two adjacent incremental ΔVZ/ΔIZ slopes. Supply voltage, feed values, and reference designators are your choice as long as all three devices operate in breakdown.",
    questions: [
      {
        id: "zener-load-line-current-ordering",
        prompt: "What branch currents demonstrate three increasing reverse-bias operating points?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-load-line-low-current",
          "derived-zener-load-line-mid-current",
          "derived-zener-load-line-high-current",
          "derived-zener-load-line-mid-current-above-low",
          "derived-zener-load-line-high-current-above-mid",
        ],
      },
      {
        id: "zener-load-line-voltage-ordering",
        prompt: "What reference voltages and margins show finite-slope voltage rise with current?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-load-line-low-voltage",
          "derived-zener-load-line-mid-voltage",
          "derived-zener-load-line-high-voltage",
          "derived-zener-load-line-mid-voltage-above-low",
          "derived-zener-load-line-high-voltage-above-mid",
          "adi-zener-breakdown-bias-dynamic-resistance",
        ],
      },
      {
        id: "zener-load-line-incremental-slopes",
        prompt: "What two ΔVZ/ΔIZ values recover the modeled avalanche dynamic resistance?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-load-line-low-mid-slope",
          "derived-zener-load-line-mid-high-slope",
        ],
      },
    ],
    oracleGraph: zenerDynamicResistanceLoadLineSweepGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "zener-diode",
      "zener-diode",
      "zener-diode",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      ...(["LOW", "MID", "HIGH"] as const).map((prefix) => ({
        _tag: "SignalMetricRange" as const,
        id: `derived-zener-load-line-${prefix.toLowerCase()}-current`,
        signal: branchCurrent("VCC", `${prefix}_REF`, "resistor"),
        metric: "average" as const,
        startFraction: 0.5,
        minimumExpected: 0.002,
        maximumExpected: 0.011,
      })),
      ...(["LOW", "MID", "HIGH"] as const).map((prefix) => ({
        _tag: "SignalMetricRange" as const,
        id: `derived-zener-load-line-${prefix.toLowerCase()}-voltage`,
        signal: netVoltage(`${prefix}_REF`),
        metric: "average" as const,
        startFraction: 0.5,
        minimumExpected: 5,
        maximumExpected: 5.8,
      })),
      {
        _tag: "SignalMetricComparison",
        id: "derived-zener-load-line-mid-current-above-low",
        left: branchCurrent("VCC", "MID_REF", "resistor"),
        right: branchCurrent("VCC", "LOW_REF", "resistor"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.001,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-zener-load-line-high-current-above-mid",
        left: branchCurrent("VCC", "HIGH_REF", "resistor"),
        right: branchCurrent("VCC", "MID_REF", "resistor"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.001,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-zener-load-line-mid-voltage-above-low",
        left: netVoltage("MID_REF"),
        right: netVoltage("LOW_REF"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.1,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-zener-load-line-high-voltage-above-mid",
        left: netVoltage("HIGH_REF"),
        right: netVoltage("MID_REF"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.1,
      },
      {
        _tag: "DifferenceRatio",
        id: "derived-zener-load-line-low-mid-slope",
        numeratorMinuend: netVoltage("MID_REF"),
        numeratorSubtrahend: netVoltage("LOW_REF"),
        denominatorMinuend: branchCurrent("VCC", "MID_REF", "resistor"),
        denominatorSubtrahend: branchCurrent("VCC", "LOW_REF", "resistor"),
        startFraction: 0.5,
        expectedRatio: approximate(55, 6),
      },
      {
        _tag: "DifferenceRatio",
        id: "derived-zener-load-line-mid-high-slope",
        numeratorMinuend: netVoltage("HIGH_REF"),
        numeratorSubtrahend: netVoltage("MID_REF"),
        denominatorMinuend: branchCurrent("VCC", "HIGH_REF", "resistor"),
        denominatorSubtrahend: branchCurrent("VCC", "MID_REF", "resistor"),
        startFraction: 0.5,
        expectedRatio: approximate(55, 6),
      },
    ],
    expected: expected({
      requiredNetNames: ["GND", "VCC", "LOW_REF", "MID_REF", "HIGH_REF"],
    }),
    references: [
      source(
        "adi-zener-breakdown-bias-dynamic-resistance",
        "Analog Devices — Zener reverse-bias operating point",
        "https://www.analog.com/en/resources/design-notes/2022/07/16/10/01/current-sensing-on-a-negative-voltage-supply-rail-using-a-precision-instrumentation-amplifier.html",
        "A Zener should be biased well into reverse breakdown at a low-dynamic-resistance point because near breakdown its voltage is not well regulated; changing its series resistance changes current and moves the operating voltage along the reverse I-V characteristic.",
        "f18d9d42461549b6f26b7cd36c734deb544bb523b3fe77bb555a31b21ee01e51",
      ),
    ],
  },
  {
    id: "intent-log-antilog-recovery-sweep",
    title: "Behavioral matched log-antilog recovery over decades",
    topologyMode: "behavioral",
    prompt:
      "Design three matched nonlinear signal chains on common bipolar rails. Each chain should use an ordinary PN-junction diode in an op amp logarithmic stage, a unity inverter, and a matched diode in an op amp antilogarithmic stage with equal input/feedback scaling. Choose a safe positive low input, then increase it by one decade twice without clipping. Preserve LOW_INPUT, MID_INPUT, HIGH_INPUT; each LOW/MID/HIGH_LOG_SUM, LOG_OUT, INVERT_SUM, EXP_INPUT, ANTILOG_SUM, and RECOVERED net; plus GND. Simulate and explain the equal log-voltage steps, virtual grounds, negative recovered polarity, and near-unity magnitude recovery across all three decades. Component values and reference designators are your choice.",
    questions: [
      {
        id: "log-antilog-input-and-log-decades",
        prompt: "What input ratios and log-output steps demonstrate logarithmic conversion across two decades?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-log-antilog-mid-low-input-ratio",
          "derived-log-antilog-high-mid-input-ratio",
          "derived-log-antilog-low-mid-log-step",
          "derived-log-antilog-mid-high-log-step",
          "adi-matched-log-antilog-inverse-conversion",
        ],
      },
      {
        id: "log-antilog-recovery-accuracy",
        prompt: "What three recovered/input magnitude ratios and adjacent output ratios show linear magnitude recovery?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-log-antilog-low-recovery",
          "derived-log-antilog-mid-recovery",
          "derived-log-antilog-high-recovery",
          "derived-log-antilog-mid-low-output-ratio",
          "derived-log-antilog-high-mid-output-ratio",
        ],
      },
      {
        id: "log-antilog-feedback-and-polarity",
        prompt: "What summing-node levels and output ordering establish closed feedback and negative recovered polarity?",
        answerKind: "qualitative",
        requiredEvidenceRefs: [
          "derived-log-antilog-mid-log-sum",
          "derived-log-antilog-mid-invert-sum",
          "derived-log-antilog-mid-antilog-sum",
          "derived-log-antilog-low-above-mid-output",
          "derived-log-antilog-mid-above-high-output",
        ],
      },
    ],
    oracleGraph: logAntilogRecoverySweepGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "diode",
      "diode",
      "diode",
      "diode",
      "diode",
      "diode",
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
      "ideal-op-amp-minus-top",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "MagnitudeRatio",
        id: "derived-log-antilog-mid-low-input-ratio",
        numerator: netVoltage("MID_INPUT"),
        denominator: netVoltage("LOW_INPUT"),
        startFraction: 0.5,
        expectedRatio: approximate(10, 0.2),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-log-antilog-high-mid-input-ratio",
        numerator: netVoltage("HIGH_INPUT"),
        denominator: netVoltage("MID_INPUT"),
        startFraction: 0.5,
        expectedRatio: approximate(10, 0.2),
      },
      {
        _tag: "MeanDifference",
        id: "derived-log-antilog-low-mid-log-step",
        minuend: netVoltage("LOW_LOG_OUT"),
        subtrahend: netVoltage("MID_LOG_OUT"),
        startFraction: 0.5,
        expected: approximate(0.05956, 0.005),
      },
      {
        _tag: "MeanDifference",
        id: "derived-log-antilog-mid-high-log-step",
        minuend: netVoltage("MID_LOG_OUT"),
        subtrahend: netVoltage("HIGH_LOG_OUT"),
        startFraction: 0.5,
        expected: approximate(0.05956, 0.005),
      },
      ...(["LOW", "MID", "HIGH"] as const).map((prefix) => ({
        _tag: "MagnitudeRatio" as const,
        id: `derived-log-antilog-${prefix.toLowerCase()}-recovery`,
        numerator: netVoltage(`${prefix}_RECOVERED`),
        denominator: netVoltage(`${prefix}_INPUT`),
        startFraction: 0.5,
        expectedRatio: approximate(1, 0.02),
      })),
      {
        _tag: "MagnitudeRatio",
        id: "derived-log-antilog-mid-low-output-ratio",
        numerator: netVoltage("MID_RECOVERED"),
        denominator: netVoltage("LOW_RECOVERED"),
        startFraction: 0.5,
        expectedRatio: approximate(10, 0.2),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-log-antilog-high-mid-output-ratio",
        numerator: netVoltage("HIGH_RECOVERED"),
        denominator: netVoltage("MID_RECOVERED"),
        startFraction: 0.5,
        expectedRatio: approximate(10, 0.2),
      },
      ...(["LOG_SUM", "INVERT_SUM", "ANTILOG_SUM"] as const).map((suffix) => ({
        _tag: "SignalMetricRange" as const,
        id: `derived-log-antilog-mid-${suffix.toLowerCase().replace("_", "-")}`,
        signal: netVoltage(`MID_${suffix}`),
        metric: "average" as const,
        startFraction: 0.5,
        minimumExpected: -0.001,
        maximumExpected: 0.001,
      })),
      {
        _tag: "SignalMetricComparison",
        id: "derived-log-antilog-low-above-mid-output",
        left: netVoltage("LOW_RECOVERED"),
        right: netVoltage("MID_RECOVERED"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 0.1,
      },
      {
        _tag: "SignalMetricComparison",
        id: "derived-log-antilog-mid-above-high-output",
        left: netVoltage("MID_RECOVERED"),
        right: netVoltage("HIGH_RECOVERED"),
        metric: "average",
        startFraction: 0.5,
        relation: "greaterThan",
        minimumDifference: 1,
      },
    ],
    expected: expected({
      requiredNetNames: [
        "GND",
        ...(["LOW", "MID", "HIGH"] as const).flatMap((prefix) => [
          `${prefix}_INPUT`,
          `${prefix}_LOG_SUM`,
          `${prefix}_LOG_OUT`,
          `${prefix}_INVERT_SUM`,
          `${prefix}_EXP_INPUT`,
          `${prefix}_ANTILOG_SUM`,
          `${prefix}_RECOVERED`,
        ]),
      ],
    }),
    references: [
      source(
        "adi-matched-log-antilog-inverse-conversion",
        "Analog Devices University Wiki — logarithmic and exponential amplifiers",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-7",
        "Matched logarithmic and antilogarithmic conversions are inverse operations: a diode-feedback log stage maps input-current decades into equal junction-voltage steps, while a diode-input antilog stage maps those voltage steps back into proportional output-current decades; equal scaling therefore recovers the original magnitude up to inversion and nonideal error.",
        "d728d21699c777487f8927765cb5ca94dc87a8a750d4e0541a36a2faebd26396",
      ),
    ],
  },
  {
    id: "intent-pnp-early-voltage-output-resistance-sweep",
    title: "Behavioral PNP Early-voltage output-resistance sweep",
    topologyMode: "behavioral",
    prompt:
      "Design three matched pairs of forward-active PNP transistors. Hold every emitter at the reference node and every base at the same fixed negative silicon-junction bias. Within each pair, use equal small current-sense resistors to compare a collector near -3 V with one near -9 V. Target substantially different Early voltages near 40 V, 100 V, and 250 V for the three pairs. Preserve SHARED_BASE; LOW_SUPPLY and HIGH_SUPPLY; VAF40_LOW_COLLECTOR, VAF40_HIGH_COLLECTOR, VAF100_LOW_COLLECTOR, VAF100_HIGH_COLLECTOR, VAF250_LOW_COLLECTOR, VAF250_HIGH_COLLECTOR; and GND. Simulate and explain how the same collector-voltage step produces progressively smaller current changes and progressively larger inferred output resistance. Exact sense-resistor values and reference designators are your choice.",
    questions: [
      {
        id: "pnp-early-voltage-common-bias",
        prompt: "What shared-base voltage demonstrates equal forward bias across all six PNP devices?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-pnp-early-voltage-shared-base"],
      },
      {
        id: "pnp-early-voltage-current-steps",
        prompt: "What low/high collector currents establish a nonzero Early-effect step for each modeled pair?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-pnp-early-voltage-vaf40-low-current",
          "derived-pnp-early-voltage-vaf40-high-current",
          "derived-pnp-early-voltage-vaf100-low-current",
          "derived-pnp-early-voltage-vaf100-high-current",
          "derived-pnp-early-voltage-vaf250-low-current",
          "derived-pnp-early-voltage-vaf250-high-current",
        ],
      },
      {
        id: "pnp-early-voltage-output-resistance-progression",
        prompt: "What three ΔVCE/ΔIC values demonstrate increasing output resistance as Early voltage rises?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-pnp-early-voltage-vaf40-output-resistance",
          "derived-pnp-early-voltage-vaf100-output-resistance",
          "derived-pnp-early-voltage-vaf250-output-resistance",
          "adi-bjt-early-voltage-output-resistance",
        ],
      },
    ],
    oracleGraph: pnpEarlyVoltageOutputResistanceSweepGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "pnp-transistor",
      "pnp-transistor",
      "pnp-transistor",
      "pnp-transistor",
      "pnp-transistor",
      "pnp-transistor",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-pnp-early-voltage-shared-base",
        signal: netVoltage("SHARED_BASE"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: -0.8,
        maximumExpected: -0.6,
      },
      ...(["VAF40", "VAF100", "VAF250"] as const).flatMap((prefix) => [
        {
          _tag: "SignalMetricRange" as const,
          id: `derived-pnp-early-voltage-${prefix.toLowerCase()}-low-current`,
          signal: branchCurrent(`${prefix}_LOW_COLLECTOR`, "LOW_SUPPLY", "resistor"),
          metric: "average" as const,
          startFraction: 0.5,
          minimumExpected: 0.0005,
          maximumExpected: 0.00075,
        },
        {
          _tag: "SignalMetricRange" as const,
          id: `derived-pnp-early-voltage-${prefix.toLowerCase()}-high-current`,
          signal: branchCurrent(`${prefix}_HIGH_COLLECTOR`, "HIGH_SUPPLY", "resistor"),
          metric: "average" as const,
          startFraction: 0.5,
          minimumExpected: 0.0005,
          maximumExpected: 0.00075,
        },
      ]),
      {
        _tag: "DifferenceRatio",
        id: "derived-pnp-early-voltage-vaf40-output-resistance",
        numeratorMinuend: netVoltage("VAF40_LOW_COLLECTOR"),
        numeratorSubtrahend: netVoltage("VAF40_HIGH_COLLECTOR"),
        denominatorMinuend: branchCurrent("VAF40_HIGH_COLLECTOR", "HIGH_SUPPLY", "resistor"),
        denominatorSubtrahend: branchCurrent("VAF40_LOW_COLLECTOR", "LOW_SUPPLY", "resistor"),
        startFraction: 0.5,
        expectedRatio: approximate(70_500, 10_000),
      },
      {
        _tag: "DifferenceRatio",
        id: "derived-pnp-early-voltage-vaf100-output-resistance",
        numeratorMinuend: netVoltage("VAF100_LOW_COLLECTOR"),
        numeratorSubtrahend: netVoltage("VAF100_HIGH_COLLECTOR"),
        denominatorMinuend: branchCurrent("VAF100_HIGH_COLLECTOR", "HIGH_SUPPLY", "resistor"),
        denominatorSubtrahend: branchCurrent("VAF100_LOW_COLLECTOR", "LOW_SUPPLY", "resistor"),
        startFraction: 0.5,
        expectedRatio: approximate(176_350, 20_000),
      },
      {
        _tag: "DifferenceRatio",
        id: "derived-pnp-early-voltage-vaf250-output-resistance",
        numeratorMinuend: netVoltage("VAF250_LOW_COLLECTOR"),
        numeratorSubtrahend: netVoltage("VAF250_HIGH_COLLECTOR"),
        denominatorMinuend: branchCurrent("VAF250_HIGH_COLLECTOR", "HIGH_SUPPLY", "resistor"),
        denominatorSubtrahend: branchCurrent("VAF250_LOW_COLLECTOR", "LOW_SUPPLY", "resistor"),
        startFraction: 0.5,
        expectedRatio: approximate(440_900, 45_000),
      },
    ],
    expected: expected({
      requiredNetNames: [
        "GND",
        "SHARED_BASE",
        "LOW_SUPPLY",
        "HIGH_SUPPLY",
        "VAF40_LOW_COLLECTOR",
        "VAF40_HIGH_COLLECTOR",
        "VAF100_LOW_COLLECTOR",
        "VAF100_HIGH_COLLECTOR",
        "VAF250_LOW_COLLECTOR",
        "VAF250_HIGH_COLLECTOR",
      ],
    }),
    references: [
      source(
        "adi-bjt-early-voltage-output-resistance",
        "Analog Devices University Wiki — BJT Early voltage and output resistance",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-8",
        "At one fixed base-emitter bias in forward-active operation, a BJT with larger Early voltage has a flatter collector-current-versus-collector-voltage characteristic and therefore a larger small-signal output resistance for a comparable operating current.",
        "e13300b9624230d76e61e682fba047d6fae5d8dcc99bb4ea46bb4c48e8181cdb",
      ),
    ],
  },
  {
    id: "intent-bjt-vbe-vce-current-surface",
    title: "Behavioral BJT VBE/VCE current surface",
    topologyMode: "behavioral",
    prompt:
      "Design nine comparable forward-active NPN branches as a three-by-three operating-point surface. Use three shared base-bias rows near 0.64 V, 0.66 V, and 0.68 V with equal voltage steps, and three shared collector-supply columns near 3 V, 6 V, and 9 V. Give every branch the same beta, the same finite Early voltage near 100 V, a grounded emitter, and an equal small collector current-sense resistor. Preserve BASE_640, BASE_660, BASE_680; SUPPLY_3V, SUPPLY_6V, SUPPLY_9V; every B640/B660/B680 by C3/C6/C9 collector net; and GND. Simulate and explain both dimensions: equal VBE steps yield approximately equal multiplicative collector-current ratios in every column, while increasing VCE yields a smaller but nonzero current rise in every row. Exact resistor values and reference designators are your choice.",
    questions: [
      {
        id: "bjt-surface-equal-vbe-steps",
        prompt: "What two measured base-voltage increments establish the equal VBE steps?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-bjt-surface-base-640-660-step",
          "derived-bjt-surface-base-660-680-step",
        ],
      },
      {
        id: "bjt-surface-exponential-current-ratios",
        prompt: "What adjacent current ratios in all three collector columns demonstrate exponential VBE control?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-bjt-surface-c3-mid-low-ratio",
          "derived-bjt-surface-c3-high-mid-ratio",
          "derived-bjt-surface-c6-mid-low-ratio",
          "derived-bjt-surface-c6-high-mid-ratio",
          "derived-bjt-surface-c9-mid-low-ratio",
          "derived-bjt-surface-c9-high-mid-ratio",
          "adi-bjt-vbe-exponential-and-vce-slope",
        ],
      },
      {
        id: "bjt-surface-finite-output-resistance",
        prompt: "What low-to-high collector ΔV/ΔI values show a finite Early-effect slope at each base bias?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-bjt-surface-b640-output-resistance",
          "derived-bjt-surface-b660-output-resistance",
          "derived-bjt-surface-b680-output-resistance",
        ],
      },
    ],
    oracleGraph: bjtVbeVceCurrentSurfaceGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "MeanDifference",
        id: "derived-bjt-surface-base-640-660-step",
        minuend: netVoltage("BASE_660"),
        subtrahend: netVoltage("BASE_640"),
        startFraction: 0.5,
        expected: approximate(0.02, 0.002),
      },
      {
        _tag: "MeanDifference",
        id: "derived-bjt-surface-base-660-680-step",
        minuend: netVoltage("BASE_680"),
        subtrahend: netVoltage("BASE_660"),
        startFraction: 0.5,
        expected: approximate(0.02, 0.002),
      },
      ...([3, 6, 9] as const).flatMap((collectorVolts) => [
        {
          _tag: "MagnitudeRatio" as const,
          id: `derived-bjt-surface-c${collectorVolts}-mid-low-ratio`,
          numerator: branchCurrent(
            `SUPPLY_${collectorVolts}V`,
            `B660_C${collectorVolts}_COLLECTOR`,
            "resistor",
          ),
          denominator: branchCurrent(
            `SUPPLY_${collectorVolts}V`,
            `B640_C${collectorVolts}_COLLECTOR`,
            "resistor",
          ),
          startFraction: 0.5,
          expectedRatio: approximate(2.166, 0.15),
        },
        {
          _tag: "MagnitudeRatio" as const,
          id: `derived-bjt-surface-c${collectorVolts}-high-mid-ratio`,
          numerator: branchCurrent(
            `SUPPLY_${collectorVolts}V`,
            `B680_C${collectorVolts}_COLLECTOR`,
            "resistor",
          ),
          denominator: branchCurrent(
            `SUPPLY_${collectorVolts}V`,
            `B660_C${collectorVolts}_COLLECTOR`,
            "resistor",
          ),
          startFraction: 0.5,
          expectedRatio: approximate(2.166, 0.15),
        },
      ]),
      ...(["B640", "B660", "B680"] as const).map((basePrefix) => ({
        _tag: "DifferenceRatio" as const,
        id: `derived-bjt-surface-${basePrefix.toLowerCase()}-output-resistance`,
        numeratorMinuend: netVoltage(`${basePrefix}_C9_COLLECTOR`),
        numeratorSubtrahend: netVoltage(`${basePrefix}_C3_COLLECTOR`),
        denominatorMinuend: branchCurrent(
          "SUPPLY_9V",
          `${basePrefix}_C9_COLLECTOR`,
          "resistor",
        ),
        denominatorSubtrahend: branchCurrent(
          "SUPPLY_3V",
          `${basePrefix}_C3_COLLECTOR`,
          "resistor",
        ),
        startFraction: 0.5,
        expectedRatio:
          basePrefix === "B640"
            ? approximate(1_794_000, 180_000)
            : basePrefix === "B660"
              ? approximate(828_000, 85_000)
              : approximate(382_000, 40_000),
      })),
    ],
    expected: expected({
      requiredNetNames: [
        "GND",
        "BASE_640",
        "BASE_660",
        "BASE_680",
        "SUPPLY_3V",
        "SUPPLY_6V",
        "SUPPLY_9V",
        ...(["B640", "B660", "B680"] as const).flatMap((basePrefix) =>
          ([3, 6, 9] as const).map(
            (collectorVolts) =>
              `${basePrefix}_C${collectorVolts}_COLLECTOR`,
          ),
        ),
      ],
    }),
    references: [
      source(
        "adi-bjt-vbe-exponential-and-vce-slope",
        "Analog Devices University Wiki — BJT forward-active current surface",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-8",
        "In forward-active operation, BJT collector current changes exponentially with base-emitter voltage, so equal VBE increments give approximately equal current ratios; finite Early effect adds a smaller collector-voltage dependence at each fixed VBE.",
        "e3a0402dbd40a660187db5df6d37e2adb67f607eacd87276d79d8605733d0a84",
      ),
    ],
  },
  {
    id: "intent-zener-breakdown-resistance-current-matrix",
    title: "Behavioral Zener breakdown/resistance/current matrix",
    topologyMode: "behavioral",
    prompt:
      "Design eight independently current-biased Zener references as a two-by-two-by-two comparison. Use nominal breakdown-voltage groups near 4.7 V and 5.6 V, dynamic-resistance groups near 10 Ohm and 100 Ohm, and low/high reverse-current points near 2 mA and 8 mA for every parameter pair. Ideal current sources may inject current from GND into each cathode; ground every anode. Preserve REF_4V7_R10_I2, REF_4V7_R10_I8, REF_4V7_R100_I2, REF_4V7_R100_I8, REF_5V6_R10_I2, REF_5V6_R10_I8, REF_5V6_R100_I2, REF_5V6_R100_I8, and GND. Simulate and separate the effects: infer each incremental ΔV/ΔI slope and show that changing nominal breakdown adds about 0.9 V independently of current and dynamic resistance. Reference designators are your choice.",
    questions: [
      {
        id: "zener-matrix-bias-currents",
        prompt: "What eight measured branch currents establish the four low/high reverse-bias pairs?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          ...(["4v7", "5v6"] as const).flatMap((breakdown) =>
            (["r10", "r100"] as const).flatMap((resistance) => [
              `derived-zener-matrix-${breakdown}-${resistance}-i2-current`,
              `derived-zener-matrix-${breakdown}-${resistance}-i8-current`,
            ]),
          ),
        ],
      },
      {
        id: "zener-matrix-incremental-slopes",
        prompt: "What four ΔV/ΔI values recover the two distinct dynamic-resistance groups?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-matrix-4v7-r10-slope",
          "derived-zener-matrix-4v7-r100-slope",
          "derived-zener-matrix-5v6-r10-slope",
          "derived-zener-matrix-5v6-r100-slope",
          "adi-zener-breakdown-incremental-and-series-resistance",
        ],
      },
      {
        id: "zener-matrix-breakdown-offsets",
        prompt: "What four 5.6 V minus 4.7 V differences show an independent nominal breakdown offset?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-matrix-r10-i2-breakdown-shift",
          "derived-zener-matrix-r10-i8-breakdown-shift",
          "derived-zener-matrix-r100-i2-breakdown-shift",
          "derived-zener-matrix-r100-i8-breakdown-shift",
        ],
      },
    ],
    oracleGraph: zenerBreakdownResistanceCurrentMatrixGraph,
    requiredComponentTypes: [
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      ...(["4V7", "5V6"] as const).flatMap((breakdown) =>
        (["R10", "R100"] as const).flatMap((resistance) =>
          (["I2", "I8"] as const).map((current) => ({
            _tag: "SignalMetricRange" as const,
            id: `derived-zener-matrix-${breakdown.toLowerCase()}-${resistance.toLowerCase()}-${current.toLowerCase()}-current`,
            signal: branchCurrent(
              "GND",
              `REF_${breakdown}_${resistance}_${current}`,
              "dc-current-source",
            ),
            metric: "average" as const,
            startFraction: 0.5,
            minimumExpected: current === "I2" ? 0.0019 : 0.0079,
            maximumExpected: current === "I2" ? 0.0021 : 0.0081,
          })),
        ),
      ),
      ...(["4V7", "5V6"] as const).flatMap((breakdown) =>
        (["R10", "R100"] as const).map((resistance) => ({
          _tag: "DifferenceRatio" as const,
          id: `derived-zener-matrix-${breakdown.toLowerCase()}-${resistance.toLowerCase()}-slope`,
          numeratorMinuend: netVoltage(`REF_${breakdown}_${resistance}_I8`),
          numeratorSubtrahend: netVoltage(`REF_${breakdown}_${resistance}_I2`),
          denominatorMinuend: branchCurrent(
            "GND",
            `REF_${breakdown}_${resistance}_I8`,
            "dc-current-source",
          ),
          denominatorSubtrahend: branchCurrent(
            "GND",
            `REF_${breakdown}_${resistance}_I2`,
            "dc-current-source",
          ),
          startFraction: 0.5,
          expectedRatio:
            resistance === "R10"
              ? approximate(15.98, 1.5)
              : approximate(105.98, 2.5),
        })),
      ),
      ...(["R10", "R100"] as const).flatMap((resistance) =>
        (["I2", "I8"] as const).map((current) => ({
          _tag: "MeanDifference" as const,
          id: `derived-zener-matrix-${resistance.toLowerCase()}-${current.toLowerCase()}-breakdown-shift`,
          minuend: netVoltage(`REF_5V6_${resistance}_${current}`),
          subtrahend: netVoltage(`REF_4V7_${resistance}_${current}`),
          startFraction: 0.5,
          expected: approximate(0.9, 0.01),
        })),
      ),
    ],
    expected: expected({
      requiredNetNames: [
        "GND",
        ...(["4V7", "5V6"] as const).flatMap((breakdown) =>
          (["R10", "R100"] as const).flatMap((resistance) =>
            (["I2", "I8"] as const).map(
              (current) => `REF_${breakdown}_${resistance}_${current}`,
            ),
          ),
        ),
      ],
    }),
    references: [
      source(
        "adi-zener-breakdown-incremental-and-series-resistance",
        "Analog Devices University Wiki — real-diode incremental and series resistance",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-5",
        "Above Zener breakdown, measured voltage changes with reverse current because the junction curve has finite incremental slope and the semiconductor contributes series resistance; over a small current interval, delta voltage divided by delta current is the effective resistance while the nominal breakdown level remains an independent voltage offset.",
        "a039c03f08bbd7b34947fd99839e3c6bfd1af8ddf033df6622e799c0cfb40392",
      ),
    ],
  },
  {
    id: "intent-pmos-channel-length-modulation-sweep",
    title: "Behavioral PMOS channel-length-modulation sweep",
    topologyMode: "behavioral",
    prompt:
      "Design three matched pairs of forward-conducting P-channel MOSFET branches around a common reference. Hold every source at the reference and every gate at the same fixed negative bias that gives about 1 V of overdrive for a roughly -2 V threshold. Give all six devices the same transconductance parameter near 8 mA/V^2, but target substantially different channel-length-modulation values near 0.005 /V, 0.02 /V, and 0.08 /V for the three pairs. Within each pair, use equal small current-sense resistors to compare a drain near -3 V with one near -9 V. Preserve SHARED_GATE, LOW_SUPPLY, HIGH_SUPPLY; each L0005/L0020/L0080 low/high drain net; and GND. Simulate and explain how increasing channel-length modulation makes the current step larger and inferred output resistance smaller. Exact reference designators and sense resistance are your choice.",
    questions: [
      {
        id: "pmos-lambda-common-gate",
        prompt:
          "What shared-gate voltage establishes equal overdrive across all six devices?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-pmos-lambda-shared-gate"],
      },
      {
        id: "pmos-lambda-current-steps",
        prompt:
          "What low/high branch currents demonstrate a finite positive output slope for every modulation value?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          ...(["l0005", "l0020", "l0080"] as const).flatMap((lambda) => [
            `derived-pmos-lambda-${lambda}-low-current`,
            `derived-pmos-lambda-${lambda}-high-current`,
            `derived-pmos-lambda-${lambda}-high-above-low`,
          ]),
        ],
      },
      {
        id: "pmos-lambda-output-resistance",
        prompt:
          "What three drain-voltage-step/current-step ratios establish the decreasing output-resistance progression?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-pmos-lambda-l0005-output-resistance",
          "derived-pmos-lambda-l0020-output-resistance",
          "derived-pmos-lambda-l0080-output-resistance",
          "adi-mosfet-channel-length-modulation-output-resistance",
        ],
      },
    ],
    oracleGraph: pmosChannelLengthModulationSweepGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "p-mosfet",
      "p-mosfet",
      "p-mosfet",
      "p-mosfet",
      "p-mosfet",
      "p-mosfet",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetricRange",
        id: "derived-pmos-lambda-shared-gate",
        signal: netVoltage("SHARED_GATE"),
        metric: "average",
        startFraction: 0.5,
        minimumExpected: -3.1,
        maximumExpected: -2.9,
      },
      ...(["L0005", "L0020", "L0080"] as const).flatMap((lambda) => [
        {
          _tag: "SignalMetricRange" as const,
          id: `derived-pmos-lambda-${lambda.toLowerCase()}-low-current`,
          signal: branchCurrent(
            `${lambda}_LOW_DRAIN`,
            "LOW_SUPPLY",
            "resistor",
          ),
          metric: "average" as const,
          startFraction: 0.5,
          minimumExpected: 0.0039,
          maximumExpected: 0.0051,
        },
        {
          _tag: "SignalMetricRange" as const,
          id: `derived-pmos-lambda-${lambda.toLowerCase()}-high-current`,
          signal: branchCurrent(
            `${lambda}_HIGH_DRAIN`,
            "HIGH_SUPPLY",
            "resistor",
          ),
          metric: "average" as const,
          startFraction: 0.5,
          minimumExpected: 0.004,
          maximumExpected: 0.007,
        },
        {
          _tag: "SignalMetricComparison" as const,
          id: `derived-pmos-lambda-${lambda.toLowerCase()}-high-above-low`,
          left: branchCurrent(
            `${lambda}_HIGH_DRAIN`,
            "HIGH_SUPPLY",
            "resistor",
          ),
          right: branchCurrent(
            `${lambda}_LOW_DRAIN`,
            "LOW_SUPPLY",
            "resistor",
          ),
          metric: "average" as const,
          startFraction: 0.5,
          relation: "greaterThan" as const,
          minimumDifference: 0.00005,
        },
      ]),
      ...(["L0005", "L0020", "L0080"] as const).map((lambda) => ({
        _tag: "DifferenceRatio" as const,
        id: `derived-pmos-lambda-${lambda.toLowerCase()}-output-resistance`,
        numeratorMinuend: netVoltage(`${lambda}_LOW_DRAIN`),
        numeratorSubtrahend: netVoltage(`${lambda}_HIGH_DRAIN`),
        denominatorMinuend: branchCurrent(
          `${lambda}_HIGH_DRAIN`,
          "HIGH_SUPPLY",
          "resistor",
        ),
        denominatorSubtrahend: branchCurrent(
          `${lambda}_LOW_DRAIN`,
          "LOW_SUPPLY",
          "resistor",
        ),
        startFraction: 0.5,
        expectedRatio:
          lambda === "L0005"
            ? approximate(50_000, 5_000)
            : lambda === "L0020"
              ? approximate(12_500, 1_500)
              : approximate(3_125, 400),
      })),
    ],
    expected: expected({
      requiredNetNames: [
        "GND",
        "SHARED_GATE",
        "LOW_SUPPLY",
        "HIGH_SUPPLY",
        ...(["L0005", "L0020", "L0080"] as const).flatMap((lambda) => [
          `${lambda}_LOW_DRAIN`,
          `${lambda}_HIGH_DRAIN`,
        ]),
      ],
    }),
    references: [
      source(
        "adi-mosfet-channel-length-modulation-output-resistance",
        "Analog Devices University Wiki — MOSFET output characteristics",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-15",
        "In a MOSFET saturation characteristic, channel-length modulation gives drain current a finite positive slope with drain voltage; a larger modulation parameter produces a steeper slope and lower small-signal output resistance at the same gate overdrive.",
        "ebf5b66fa21af4cb20570f9bf895210b9f66b422b0c5e97d63a0f3bcacfd8dd5",
      ),
    ],
  },
  {
    id: "intent-nmos-transconductance-overdrive-surface",
    title: "Behavioral NMOS transconductance/overdrive surface",
    topologyMode: "behavioral",
    prompt:
      "Design nine comparable N-channel MOSFET saturation branches as a three-by-three parameter surface. Use a common positive drain supply, equal small current-sense resistors, grounded sources, and thresholds near 2 V. Make three device-strength rows with transconductance parameters near 5 mA/V^2, 20 mA/V^2, and 50 mA/V^2. Make three shared gate-bias columns near 2.5 V, 3 V, and 3.5 V so overdrive is 0.5 V, 1 V, and 1.5 V. Set channel-length modulation to zero so the two requested dimensions are isolated. Preserve VOV05_GATE, VOV10_GATE, VOV15_GATE; every KP005/KP020/KP050 by VOV05/VOV10/VOV15 drain net; VDD; and GND. Simulate and explain the linear current scaling with device strength and square-law scaling with overdrive. Supply voltage, sense resistance, and reference designators are your choice as long as every device remains saturated.",
    questions: [
      {
        id: "nmos-surface-gate-spacing",
        prompt:
          "What adjacent gate-bias differences establish the requested overdrive progression?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-nmos-surface-vov05-vov10-gate-step",
          "derived-nmos-surface-vov10-vov15-gate-step",
        ],
      },
      {
        id: "nmos-surface-square-law",
        prompt:
          "What within-row current ratios demonstrate square-law dependence on overdrive?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          ...(["kp005", "kp020", "kp050"] as const).flatMap((strength) => [
            `derived-nmos-surface-${strength}-vov10-vov05-ratio`,
            `derived-nmos-surface-${strength}-vov15-vov10-ratio`,
          ]),
          "adi-mosfet-square-law-transconductance-surface",
        ],
      },
      {
        id: "nmos-surface-strength-scaling",
        prompt:
          "What cross-row ratios at each gate bias demonstrate linear scaling with the transconductance parameter?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          ...(["vov05", "vov10", "vov15"] as const).flatMap((overdrive) => [
            `derived-nmos-surface-${overdrive}-kp020-kp005-ratio`,
            `derived-nmos-surface-${overdrive}-kp050-kp020-ratio`,
          ]),
        ],
      },
    ],
    oracleGraph: nmosTransconductanceOverdriveSurfaceGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "n-mosfet",
      "n-mosfet",
      "n-mosfet",
      "n-mosfet",
      "n-mosfet",
      "n-mosfet",
      "n-mosfet",
      "n-mosfet",
      "n-mosfet",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "MeanDifference",
        id: "derived-nmos-surface-vov05-vov10-gate-step",
        minuend: netVoltage("VOV10_GATE"),
        subtrahend: netVoltage("VOV05_GATE"),
        startFraction: 0.5,
        expected: approximate(0.5, 0.02),
      },
      {
        _tag: "MeanDifference",
        id: "derived-nmos-surface-vov10-vov15-gate-step",
        minuend: netVoltage("VOV15_GATE"),
        subtrahend: netVoltage("VOV10_GATE"),
        startFraction: 0.5,
        expected: approximate(0.5, 0.02),
      },
      ...(["KP005", "KP020", "KP050"] as const).flatMap((strength) => [
        {
          _tag: "MagnitudeRatio" as const,
          id: `derived-nmos-surface-${strength.toLowerCase()}-vov10-vov05-ratio`,
          numerator: branchCurrent(
            "VDD",
            `${strength}_VOV10_DRAIN`,
            "resistor",
          ),
          denominator: branchCurrent(
            "VDD",
            `${strength}_VOV05_DRAIN`,
            "resistor",
          ),
          startFraction: 0.5,
          expectedRatio: approximate(4, 0.15),
        },
        {
          _tag: "MagnitudeRatio" as const,
          id: `derived-nmos-surface-${strength.toLowerCase()}-vov15-vov10-ratio`,
          numerator: branchCurrent(
            "VDD",
            `${strength}_VOV15_DRAIN`,
            "resistor",
          ),
          denominator: branchCurrent(
            "VDD",
            `${strength}_VOV10_DRAIN`,
            "resistor",
          ),
          startFraction: 0.5,
          expectedRatio: approximate(2.25, 0.12),
        },
      ]),
      ...(["VOV05", "VOV10", "VOV15"] as const).flatMap((overdrive) => [
        {
          _tag: "MagnitudeRatio" as const,
          id: `derived-nmos-surface-${overdrive.toLowerCase()}-kp020-kp005-ratio`,
          numerator: branchCurrent(
            "VDD",
            `KP020_${overdrive}_DRAIN`,
            "resistor",
          ),
          denominator: branchCurrent(
            "VDD",
            `KP005_${overdrive}_DRAIN`,
            "resistor",
          ),
          startFraction: 0.5,
          expectedRatio: approximate(4, 0.15),
        },
        {
          _tag: "MagnitudeRatio" as const,
          id: `derived-nmos-surface-${overdrive.toLowerCase()}-kp050-kp020-ratio`,
          numerator: branchCurrent(
            "VDD",
            `KP050_${overdrive}_DRAIN`,
            "resistor",
          ),
          denominator: branchCurrent(
            "VDD",
            `KP020_${overdrive}_DRAIN`,
            "resistor",
          ),
          startFraction: 0.5,
          expectedRatio: approximate(2.5, 0.12),
        },
      ]),
    ],
    expected: expected({
      requiredNetNames: [
        "GND",
        "VDD",
        "VOV05_GATE",
        "VOV10_GATE",
        "VOV15_GATE",
        ...(["KP005", "KP020", "KP050"] as const).flatMap((strength) =>
          (["VOV05", "VOV10", "VOV15"] as const).map(
            (overdrive) => `${strength}_${overdrive}_DRAIN`,
          ),
        ),
      ],
    }),
    references: [
      source(
        "adi-mosfet-square-law-transconductance-surface",
        "Analog Devices University Wiki — simplified MOSFET square law",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-15",
        "For the simplified square-law MOSFET model in saturation, drain current is proportional to the transconductance parameter and to the square of gate overdrive, so scaling device strength changes current linearly while doubling overdrive changes it by about four.",
        "8f1771acf738da09d71bf80240fa0da963279a3e723481c684791e66f9c6463a",
      ),
    ],
  },
  {
    id: "intent-nmos-triode-saturation-region-surface",
    title: "Behavioral NMOS triode-to-saturation surface",
    topologyMode: "behavioral",
    prompt:
      "Design two three-point N-channel MOSFET output-characteristic rows using a common 2 V threshold, a transconductance parameter near 10 mA/V^2, grounded sources, equal small drain current-sense resistors, and zero channel-length modulation. Bias the first row near 1 V gate overdrive and choose low/mid drain voltages near one-quarter and three-quarters of that overdrive plus a high drain voltage well above it. Bias the second row near 2 V overdrive and use the same normalized drain-voltage fractions plus a high saturated point. Preserve VOV1_GATE, VOV2_GATE; VOV1_D025_DRAIN, VOV1_D075_DRAIN, VOV1_D300_DRAIN; VOV2_D050_DRAIN, VOV2_D150_DRAIN, VOV2_D600_DRAIN; their corresponding supply nets; and GND. Simulate and identify rising triode behavior, flattening on entry to saturation, and the approximately fourfold saturated-current increase when overdrive doubles. Exact drain supplies, sense resistance, and reference designators are your choice.",
    questions: [
      {
        id: "nmos-region-operating-currents",
        prompt:
          "What six branch currents establish the two output-characteristic rows?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          ...(["vov1-d025", "vov1-d075", "vov1-d300", "vov2-d050", "vov2-d150", "vov2-d600"] as const).map(
            (point) => `derived-nmos-region-${point}-current`,
          ),
        ],
      },
      {
        id: "nmos-region-triode-to-saturation",
        prompt:
          "What within-row current ratios show strong triode-region rise followed by flattening near saturation?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-nmos-region-vov1-mid-low-ratio",
          "derived-nmos-region-vov1-high-mid-ratio",
          "derived-nmos-region-vov2-mid-low-ratio",
          "derived-nmos-region-vov2-high-mid-ratio",
          "adi-mosfet-triode-saturation-boundary",
        ],
      },
      {
        id: "nmos-region-overdrive-square-law",
        prompt:
          "What gate difference and saturated-current ratio demonstrate the effect of doubling overdrive?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-nmos-region-gate-step",
          "derived-nmos-region-saturated-current-ratio",
        ],
      },
    ],
    oracleGraph: nmosTriodeSaturationSurfaceGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "n-mosfet",
      "n-mosfet",
      "n-mosfet",
      "n-mosfet",
      "n-mosfet",
      "n-mosfet",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      ...([
        ["VOV1", "D025", 0.002, 0.00235],
        ["VOV1", "D075", 0.0045, 0.00485],
        ["VOV1", "D300", 0.00485, 0.00515],
        ["VOV2", "D050", 0.0083, 0.00895],
        ["VOV2", "D150", 0.0182, 0.0191],
        ["VOV2", "D600", 0.0197, 0.0203],
      ] as const).map(([row, point, minimumExpected, maximumExpected]) => ({
        _tag: "SignalMetricRange" as const,
        id: `derived-nmos-region-${row.toLowerCase()}-${point.toLowerCase()}-current`,
        signal: branchCurrent(
          `${row}_${point}_SUPPLY`,
          `${row}_${point}_DRAIN`,
          "resistor",
        ),
        metric: "average" as const,
        startFraction: 0.5,
        minimumExpected,
        maximumExpected,
      })),
      {
        _tag: "MagnitudeRatio",
        id: "derived-nmos-region-vov1-mid-low-ratio",
        numerator: branchCurrent(
          "VOV1_D075_SUPPLY",
          "VOV1_D075_DRAIN",
          "resistor",
        ),
        denominator: branchCurrent(
          "VOV1_D025_SUPPLY",
          "VOV1_D025_DRAIN",
          "resistor",
        ),
        startFraction: 0.5,
        expectedRatio: approximate(2.154, 0.15),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-nmos-region-vov1-high-mid-ratio",
        numerator: branchCurrent(
          "VOV1_D300_SUPPLY",
          "VOV1_D300_DRAIN",
          "resistor",
        ),
        denominator: branchCurrent(
          "VOV1_D075_SUPPLY",
          "VOV1_D075_DRAIN",
          "resistor",
        ),
        startFraction: 0.5,
        expectedRatio: approximate(1.069, 0.08),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-nmos-region-vov2-mid-low-ratio",
        numerator: branchCurrent(
          "VOV2_D150_SUPPLY",
          "VOV2_D150_DRAIN",
          "resistor",
        ),
        denominator: branchCurrent(
          "VOV2_D050_SUPPLY",
          "VOV2_D050_DRAIN",
          "resistor",
        ),
        startFraction: 0.5,
        expectedRatio: approximate(2.164, 0.15),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-nmos-region-vov2-high-mid-ratio",
        numerator: branchCurrent(
          "VOV2_D600_SUPPLY",
          "VOV2_D600_DRAIN",
          "resistor",
        ),
        denominator: branchCurrent(
          "VOV2_D150_SUPPLY",
          "VOV2_D150_DRAIN",
          "resistor",
        ),
        startFraction: 0.5,
        expectedRatio: approximate(1.072, 0.08),
      },
      {
        _tag: "MeanDifference",
        id: "derived-nmos-region-gate-step",
        minuend: netVoltage("VOV2_GATE"),
        subtrahend: netVoltage("VOV1_GATE"),
        startFraction: 0.5,
        expected: approximate(1, 0.03),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-nmos-region-saturated-current-ratio",
        numerator: branchCurrent(
          "VOV2_D600_SUPPLY",
          "VOV2_D600_DRAIN",
          "resistor",
        ),
        denominator: branchCurrent(
          "VOV1_D300_SUPPLY",
          "VOV1_D300_DRAIN",
          "resistor",
        ),
        startFraction: 0.5,
        expectedRatio: approximate(4, 0.15),
      },
    ],
    expected: expected({
      requiredNetNames: [
        "GND",
        "VOV1_GATE",
        "VOV2_GATE",
        ...(["VOV1_D025", "VOV1_D075", "VOV1_D300", "VOV2_D050", "VOV2_D150", "VOV2_D600"] as const).flatMap(
          (point) => [`${point}_SUPPLY`, `${point}_DRAIN`],
        ),
      ],
    }),
    references: [
      source(
        "adi-mosfet-triode-saturation-boundary",
        "Analog Devices University Wiki — MOSFET triode and saturation regions",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-15",
        "An enhancement NMOS operates in the triode region when drain-source voltage is below gate overdrive, where current rises strongly with drain voltage; above that boundary it enters saturation and current becomes approximately flat when channel-length modulation is absent.",
        "3896dbc538742ec899ee3c4c72edb5a7f22253587f665525cf9a22379ae92157",
      ),
    ],
  },
  {
    id: "intent-diode-is-n-current-matrix",
    title: "Behavioral diode saturation-current/emission/current matrix",
    topologyMode: "behavioral",
    prompt:
      "Design eight independently current-biased ordinary-diode branches around a common reference. Use two saturation-current families near 10 fA and 1 pA, cross each with emission coefficients near 1 and 2, and exercise every resulting model near 0.1 mA and 1 mA. Keep series resistance negligible so the junction law is isolated. Preserve GND and every FORWARD_IS14_N1/IS14_N2/IS12_N1/IS12_N2 by I01/I1 observation net. Simulate the complete matrix and explain, from measured evidence, how saturation current shifts voltage, emission coefficient scales voltage, and a decade of current adds a repeatable logarithmic increment. Exact reference designators and current-source implementation are your choice.",
    questions: [
      {
        id: "diode-matrix-operating-voltages",
        prompt:
          "What eight forward voltages establish that every parameter combination and current point was exercised?",
        answerKind: "numeric",
        requiredEvidenceRefs: ([
          "is14-n1-i01",
          "is14-n1-i1",
          "is14-n2-i01",
          "is14-n2-i1",
          "is12-n1-i01",
          "is12-n1-i1",
          "is12-n2-i01",
          "is12-n2-i1",
        ] as const).map((point) => `derived-diode-matrix-${point}-voltage`),
      },
      {
        id: "diode-matrix-saturation-current-shift",
        prompt:
          "At equal current and emission coefficient, how far does the higher-saturation-current family shift the forward voltage downward?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-diode-matrix-n1-i1-is-shift",
          "derived-diode-matrix-n2-i1-is-shift",
          "adi-spice-diode-is-n-law",
        ],
      },
      {
        id: "diode-matrix-emission-and-current-scaling",
        prompt:
          "What voltage ratios and decade increments demonstrate emission-coefficient and logarithmic-current scaling?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-diode-matrix-is14-i01-n2-n1-ratio",
          "derived-diode-matrix-is12-i1-n2-n1-ratio",
          "derived-diode-matrix-is14-n1-decade-step",
          "derived-diode-matrix-is14-n2-decade-step",
        ],
      },
    ],
    oracleGraph: diodeSaturationEmissionCurrentMatrixGraph,
    requiredComponentTypes: [
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "diode",
      "diode",
      "diode",
      "diode",
      "diode",
      "diode",
      "diode",
      "diode",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      ...([
        ["IS14_N1_I01", 0.58, 0.61],
        ["IS14_N1_I1", 0.64, 0.67],
        ["IS14_N2_I01", 1.17, 1.21],
        ["IS14_N2_I1", 1.29, 1.33],
        ["IS12_N1_I01", 0.46, 0.49],
        ["IS12_N1_I1", 0.52, 0.55],
        ["IS12_N2_I01", 0.93, 0.98],
        ["IS12_N2_I1", 1.05, 1.09],
      ] as const).map(([point, minimumExpected, maximumExpected]) => ({
        _tag: "SignalMetricRange" as const,
        id: `derived-diode-matrix-${point.toLowerCase().replaceAll("_", "-")}-voltage`,
        signal: netVoltage(`FORWARD_${point}`),
        metric: "average" as const,
        startFraction: 0.5,
        minimumExpected,
        maximumExpected,
      })),
      {
        _tag: "MeanDifference",
        id: "derived-diode-matrix-n1-i1-is-shift",
        minuend: netVoltage("FORWARD_IS14_N1_I1"),
        subtrahend: netVoltage("FORWARD_IS12_N1_I1"),
        startFraction: 0.5,
        expected: approximate(0.119112, 0.008),
      },
      {
        _tag: "MeanDifference",
        id: "derived-diode-matrix-n2-i1-is-shift",
        minuend: netVoltage("FORWARD_IS14_N2_I1"),
        subtrahend: netVoltage("FORWARD_IS12_N2_I1"),
        startFraction: 0.5,
        expected: approximate(0.238225, 0.012),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-diode-matrix-is14-i01-n2-n1-ratio",
        numerator: netVoltage("FORWARD_IS14_N2_I01"),
        denominator: netVoltage("FORWARD_IS14_N1_I01"),
        startFraction: 0.5,
        expectedRatio: approximate(2, 0.04),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-diode-matrix-is12-i1-n2-n1-ratio",
        numerator: netVoltage("FORWARD_IS12_N2_I1"),
        denominator: netVoltage("FORWARD_IS12_N1_I1"),
        startFraction: 0.5,
        expectedRatio: approximate(2, 0.04),
      },
      {
        _tag: "MeanDifference",
        id: "derived-diode-matrix-is14-n1-decade-step",
        minuend: netVoltage("FORWARD_IS14_N1_I1"),
        subtrahend: netVoltage("FORWARD_IS14_N1_I01"),
        startFraction: 0.5,
        expected: approximate(0.059556, 0.006),
      },
      {
        _tag: "MeanDifference",
        id: "derived-diode-matrix-is14-n2-decade-step",
        minuend: netVoltage("FORWARD_IS14_N2_I1"),
        subtrahend: netVoltage("FORWARD_IS14_N2_I01"),
        startFraction: 0.5,
        expected: approximate(0.119112, 0.009),
      },
    ],
    expected: expected({
      requiredNetNames: [
        "GND",
        ...(["IS14_N1", "IS14_N2", "IS12_N1", "IS12_N2"] as const).flatMap(
          (model) =>
            (["I01", "I1"] as const).map(
              (current) => `FORWARD_${model}_${current}`,
            ),
        ),
      ],
    }),
    references: [
      source(
        "adi-spice-diode-is-n-law",
        "Analog Devices EngineerZone — LTspice diode-model equation",
        "https://ez.analog.com/design-tools-and-calculators/ltspice/f/q-a/117159/ltspice-diode-model-analysis/348920",
        "The SPICE diode law is I = Is × (exp(Vjunction/(N × Vt)) - 1), where Is is saturation current and N is emission coefficient; therefore at fixed current a larger Is lowers junction voltage, while a larger N scales it upward.",
        "3bc11970102c216306ea166c6c405aa0d568fa8abe10755bbca9e5b5683c4384",
      ),
    ],
  },
  {
    id: "intent-diode-series-resistance-current-sweep",
    title: "Behavioral diode series-resistance current sweep",
    topologyMode: "behavioral",
    prompt:
      "Design three matched pairs of independently current-biased ordinary-diode branches around a common reference. Hold saturation current near 10 fA and emission coefficient near 1 for every device, but target series resistances near 0 Ohm, 25 Ohm, and 100 Ohm for the three pairs. Bias each pair near 1 mA and 10 mA. Preserve GND and every FORWARD_RS0/RS25/RS100 by I1/I10 observation net. Simulate all six voltages, infer each pair's incremental voltage/current slope, and separate the common junction contribution from the increasing ohmic contribution. Exact reference designators and source implementation are your choice.",
    questions: [
      {
        id: "diode-rs-operating-voltages",
        prompt:
          "What six forward voltages establish the current and series-resistance sweep?",
        answerKind: "numeric",
        requiredEvidenceRefs: ([
          "rs0-i1",
          "rs0-i10",
          "rs25-i1",
          "rs25-i10",
          "rs100-i1",
          "rs100-i10",
        ] as const).map((point) => `derived-diode-rs-${point}-voltage`),
      },
      {
        id: "diode-rs-incremental-slopes",
        prompt:
          "What three incremental voltage/current slopes demonstrate the junction slope plus 0, 25, and 100 Ohm series resistance?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-diode-rs-rs0-slope",
          "derived-diode-rs-rs25-slope",
          "derived-diode-rs-rs100-slope",
          "adi-spice-diode-series-resistance",
        ],
      },
      {
        id: "diode-rs-extra-drop",
        prompt:
          "At 10 mA, what additional drops demonstrate the current-proportional effect of the 25 Ohm and 100 Ohm models?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-diode-rs-rs25-i10-extra-drop",
          "derived-diode-rs-rs100-i10-extra-drop",
        ],
      },
    ],
    oracleGraph: diodeSeriesResistanceCurrentSweepGraph,
    requiredComponentTypes: [
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "diode",
      "diode",
      "diode",
      "diode",
      "diode",
      "diode",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      ...([
        ["RS0_I1", 0.64, 0.67],
        ["RS0_I10", 0.7, 0.73],
        ["RS25_I1", 0.665, 0.695],
        ["RS25_I10", 0.95, 0.98],
        ["RS100_I1", 0.74, 0.77],
        ["RS100_I10", 1.7, 1.73],
      ] as const).map(([point, minimumExpected, maximumExpected]) => ({
        _tag: "SignalMetricRange" as const,
        id: `derived-diode-rs-${point.toLowerCase().replaceAll("_", "-")}-voltage`,
        signal: netVoltage(`FORWARD_${point}`),
        metric: "average" as const,
        startFraction: 0.5,
        minimumExpected,
        maximumExpected,
      })),
      ...([
        ["RS0", 6.61735, 0.8],
        ["RS25", 31.61735, 1.5],
        ["RS100", 106.61735, 4],
      ] as const).map(([resistance, expectedRatio, absoluteTolerance]) => ({
        _tag: "DifferenceRatio" as const,
        id: `derived-diode-rs-${resistance.toLowerCase()}-slope`,
        numeratorMinuend: netVoltage(`FORWARD_${resistance}_I10`),
        numeratorSubtrahend: netVoltage(`FORWARD_${resistance}_I1`),
        denominatorMinuend: branchCurrent(
          "GND",
          `FORWARD_${resistance}_I10`,
          "dc-current-source",
        ),
        denominatorSubtrahend: branchCurrent(
          "GND",
          `FORWARD_${resistance}_I1`,
          "dc-current-source",
        ),
        startFraction: 0.5,
        expectedRatio: approximate(expectedRatio, absoluteTolerance),
      })),
      {
        _tag: "MeanDifference",
        id: "derived-diode-rs-rs25-i10-extra-drop",
        minuend: netVoltage("FORWARD_RS25_I10"),
        subtrahend: netVoltage("FORWARD_RS0_I10"),
        startFraction: 0.5,
        expected: approximate(0.25, 0.015),
      },
      {
        _tag: "MeanDifference",
        id: "derived-diode-rs-rs100-i10-extra-drop",
        minuend: netVoltage("FORWARD_RS100_I10"),
        subtrahend: netVoltage("FORWARD_RS0_I10"),
        startFraction: 0.5,
        expected: approximate(1, 0.025),
      },
    ],
    expected: expected({
      requiredNetNames: [
        "GND",
        ...(["RS0", "RS25", "RS100"] as const).flatMap((resistance) =>
          (["I1", "I10"] as const).map(
            (current) => `FORWARD_${resistance}_${current}`,
          ),
        ),
      ],
    }),
    references: [
      source(
        "adi-spice-diode-series-resistance",
        "Analog Devices EngineerZone — LTspice diode series resistance",
        "https://ez.analog.com/design-tools-and-calculators/ltspice/f/q-a/117159/ltspice-diode-model-analysis/348920",
        "A real SPICE diode includes ohmic series resistance Rs, so its external forward voltage is the exponential junction voltage plus current times Rs; high-current incremental slope therefore includes that series resistance.",
        "108035d0202182ebdc30c6a1a0e89697614b84d5bcaca9e3d19da36e798601ab",
      ),
    ],
  },
  {
    id: "intent-diode-emission-current-decade-surface",
    title: "Behavioral diode emission/current-decade surface",
    topologyMode: "behavioral",
    prompt:
      "Design nine independently current-biased ordinary-diode branches around a common reference. Hold saturation current near 10 fA and series resistance near zero. Use three emission-coefficient families near 1, 1.5, and 2, and bias each family at three current decades near 10 uA, 100 uA, and 1 mA. Preserve GND and every FORWARD_N1/N15/N2 by I001/I01/I1 observation net. Simulate the complete surface, then demonstrate that adjacent current decades produce nearly equal voltage increments within each family and that those increments scale in proportion to emission coefficient. Exact reference designators and current-source implementation are your choice.",
    questions: [
      {
        id: "diode-decade-operating-voltages",
        prompt:
          "What nine forward voltages establish all emission-coefficient and current-decade points?",
        answerKind: "numeric",
        requiredEvidenceRefs: ([
          "n1-i001",
          "n1-i01",
          "n1-i1",
          "n15-i001",
          "n15-i01",
          "n15-i1",
          "n2-i001",
          "n2-i01",
          "n2-i1",
        ] as const).map((point) => `derived-diode-decade-${point}-voltage`),
      },
      {
        id: "diode-decade-equal-log-steps",
        prompt:
          "What adjacent voltage steps show that equal current ratios produce nearly equal increments within every row?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          ...(["n1", "n15", "n2"] as const).flatMap((emission) => [
            `derived-diode-decade-${emission}-low-mid-step`,
            `derived-diode-decade-${emission}-mid-high-step`,
          ]),
          "adi-diode-current-ratio-voltage-step",
        ],
      },
      {
        id: "diode-decade-emission-scaling",
        prompt:
          "What ratios between row increments demonstrate proportional scaling with emission coefficient?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-diode-decade-low-mid-n15-n1-ratio",
          "derived-diode-decade-low-mid-n2-n1-ratio",
          "derived-diode-decade-mid-high-n15-n1-ratio",
          "derived-diode-decade-mid-high-n2-n1-ratio",
        ],
      },
    ],
    oracleGraph: diodeEmissionCurrentDecadeSurfaceGraph,
    requiredComponentTypes: [
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "diode",
      "diode",
      "diode",
      "diode",
      "diode",
      "diode",
      "diode",
      "diode",
      "diode",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      ...([
        ["N1_I001", 0.52, 0.55],
        ["N1_I01", 0.58, 0.61],
        ["N1_I1", 0.64, 0.67],
        ["N15_I001", 0.79, 0.82],
        ["N15_I01", 0.88, 0.91],
        ["N15_I1", 0.97, 1],
        ["N2_I001", 1.05, 1.09],
        ["N2_I01", 1.17, 1.21],
        ["N2_I1", 1.29, 1.33],
      ] as const).map(([point, minimumExpected, maximumExpected]) => ({
        _tag: "SignalMetricRange" as const,
        id: `derived-diode-decade-${point.toLowerCase().replaceAll("_", "-")}-voltage`,
        signal: netVoltage(`FORWARD_${point}`),
        metric: "average" as const,
        startFraction: 0.5,
        minimumExpected,
        maximumExpected,
      })),
      ...([
        ["N1", 0.059556, 0.006],
        ["N15", 0.089334, 0.007],
        ["N2", 0.119112, 0.009],
      ] as const).flatMap(
        ([emission, expectedStep, absoluteTolerance]) => [
          {
            _tag: "MeanDifference" as const,
            id: `derived-diode-decade-${emission.toLowerCase()}-low-mid-step`,
            minuend: netVoltage(`FORWARD_${emission}_I01`),
            subtrahend: netVoltage(`FORWARD_${emission}_I001`),
            startFraction: 0.5,
            expected: approximate(expectedStep, absoluteTolerance),
          },
          {
            _tag: "MeanDifference" as const,
            id: `derived-diode-decade-${emission.toLowerCase()}-mid-high-step`,
            minuend: netVoltage(`FORWARD_${emission}_I1`),
            subtrahend: netVoltage(`FORWARD_${emission}_I01`),
            startFraction: 0.5,
            expected: approximate(expectedStep, absoluteTolerance),
          },
        ],
      ),
      ...([
        ["N15", 1.5, 0.08],
        ["N2", 2, 0.1],
      ] as const).flatMap(
        ([emission, expectedRatio, absoluteTolerance]) => [
          {
            _tag: "DifferenceRatio" as const,
            id: `derived-diode-decade-low-mid-${emission.toLowerCase()}-n1-ratio`,
            numeratorMinuend: netVoltage(`FORWARD_${emission}_I01`),
            numeratorSubtrahend: netVoltage(`FORWARD_${emission}_I001`),
            denominatorMinuend: netVoltage("FORWARD_N1_I01"),
            denominatorSubtrahend: netVoltage("FORWARD_N1_I001"),
            startFraction: 0.5,
            expectedRatio: approximate(expectedRatio, absoluteTolerance),
          },
          {
            _tag: "DifferenceRatio" as const,
            id: `derived-diode-decade-mid-high-${emission.toLowerCase()}-n1-ratio`,
            numeratorMinuend: netVoltage(`FORWARD_${emission}_I1`),
            numeratorSubtrahend: netVoltage(`FORWARD_${emission}_I01`),
            denominatorMinuend: netVoltage("FORWARD_N1_I1"),
            denominatorSubtrahend: netVoltage("FORWARD_N1_I01"),
            startFraction: 0.5,
            expectedRatio: approximate(expectedRatio, absoluteTolerance),
          },
        ],
      ),
    ],
    expected: expected({
      requiredNetNames: [
        "GND",
        ...(["N1", "N15", "N2"] as const).flatMap((emission) =>
          (["I001", "I01", "I1"] as const).map(
            (current) => `FORWARD_${emission}_${current}`,
          ),
        ),
      ],
    }),
    references: [
      source(
        "adi-diode-current-ratio-voltage-step",
        "Analog Devices University Wiki — diode voltage and current ratios",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-5",
        "For a fixed diode model and temperature, the diode-voltage difference depends on the current ratio; equal current ratios produce equal voltage increments, and the N × Vt factor scales those increments with emission coefficient.",
        "21c65df815facb3aa21c3bed40e01c080bd7e5fb9f82a172153b2bc6735f1697",
      ),
    ],
  },
  {
    id: "intent-bjt-is-nf-current-matrix",
    title: "Behavioral BJT saturation-current/emission/current matrix",
    topologyMode: "behavioral",
    prompt:
      "Design eight independently current-biased, diode-connected NPN branches around a common reference. Use two transport-saturation-current families near 1 fA and 100 fA, cross each with forward emission coefficients near 1 and 1.5, and exercise every resulting model near 0.1 mA and 1 mA. Keep beta near 100 and Early voltage near 100 V so the junction law is isolated. Preserve GND and every VBE_IS15_NF1/IS15_NF15/IS13_NF1/IS13_NF15 by I01/I1 observation net. Simulate the complete matrix and explain, from measured evidence, how transport saturation current shifts VBE, how forward emission coefficient scales it, and how a current decade adds a repeatable logarithmic increment. Exact reference designators and current-bias implementation are your choice.",
    questions: [
      {
        id: "bjt-matrix-operating-voltages",
        prompt:
          "What eight base-emitter voltages establish that every parameter combination and current point was exercised?",
        answerKind: "numeric",
        requiredEvidenceRefs: ([
          "is15-nf1-i01",
          "is15-nf1-i1",
          "is15-nf15-i01",
          "is15-nf15-i1",
          "is13-nf1-i01",
          "is13-nf1-i1",
          "is13-nf15-i01",
          "is13-nf15-i1",
        ] as const).map((point) => `derived-bjt-matrix-${point}-voltage`),
      },
      {
        id: "bjt-matrix-saturation-current-shift",
        prompt:
          "At equal current and emission coefficient, how far does the higher-transport-saturation-current family shift VBE downward?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-bjt-matrix-nf1-i1-is-shift",
          "derived-bjt-matrix-nf15-i1-is-shift",
          "ngspice-bjt-is-nf-parameters",
        ],
      },
      {
        id: "bjt-matrix-emission-and-current-scaling",
        prompt:
          "What voltage ratios and decade increments demonstrate forward-emission-coefficient and logarithmic-current scaling?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-bjt-matrix-is15-i01-nf15-nf1-ratio",
          "derived-bjt-matrix-is13-i1-nf15-nf1-ratio",
          "derived-bjt-matrix-is15-nf1-decade-step",
          "derived-bjt-matrix-is15-nf15-decade-step",
        ],
      },
    ],
    oracleGraph: bjtSaturationEmissionCurrentMatrixGraph,
    requiredComponentTypes: [
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      ...([
        ["IS15_NF1_I01", 0.645, 0.665],
        ["IS15_NF1_I1", 0.704, 0.725],
        ["IS15_NF15_I01", 0.972, 0.993],
        ["IS15_NF15_I1", 1.061, 1.082],
        ["IS13_NF1_I01", 0.525, 0.546],
        ["IS13_NF1_I1", 0.585, 0.606],
        ["IS13_NF15_I01", 0.793, 0.814],
        ["IS13_NF15_I1", 0.882, 0.904],
      ] as const).map(([point, minimumExpected, maximumExpected]) => ({
        _tag: "SignalMetricRange" as const,
        id: `derived-bjt-matrix-${point.toLowerCase().replaceAll("_", "-")}-voltage`,
        signal: netVoltage(`VBE_${point}`),
        metric: "average" as const,
        startFraction: 0.5,
        minimumExpected,
        maximumExpected,
      })),
      {
        _tag: "MeanDifference",
        id: "derived-bjt-matrix-nf1-i1-is-shift",
        minuend: netVoltage("VBE_IS15_NF1_I1"),
        subtrahend: netVoltage("VBE_IS13_NF1_I1"),
        startFraction: 0.5,
        expected: approximate(0.119112, 0.008),
      },
      {
        _tag: "MeanDifference",
        id: "derived-bjt-matrix-nf15-i1-is-shift",
        minuend: netVoltage("VBE_IS15_NF15_I1"),
        subtrahend: netVoltage("VBE_IS13_NF15_I1"),
        startFraction: 0.5,
        expected: approximate(0.178669, 0.01),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-bjt-matrix-is15-i01-nf15-nf1-ratio",
        numerator: netVoltage("VBE_IS15_NF15_I01"),
        denominator: netVoltage("VBE_IS15_NF1_I01"),
        startFraction: 0.5,
        expectedRatio: approximate(1.5, 0.04),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-bjt-matrix-is13-i1-nf15-nf1-ratio",
        numerator: netVoltage("VBE_IS13_NF15_I1"),
        denominator: netVoltage("VBE_IS13_NF1_I1"),
        startFraction: 0.5,
        expectedRatio: approximate(1.5, 0.04),
      },
      {
        _tag: "MeanDifference",
        id: "derived-bjt-matrix-is15-nf1-decade-step",
        minuend: netVoltage("VBE_IS15_NF1_I1"),
        subtrahend: netVoltage("VBE_IS15_NF1_I01"),
        startFraction: 0.5,
        expected: approximate(0.059556, 0.006),
      },
      {
        _tag: "MeanDifference",
        id: "derived-bjt-matrix-is15-nf15-decade-step",
        minuend: netVoltage("VBE_IS15_NF15_I1"),
        subtrahend: netVoltage("VBE_IS15_NF15_I01"),
        startFraction: 0.5,
        expected: approximate(0.089334, 0.007),
      },
    ],
    expected: expected({
      requiredNetNames: [
        "GND",
        ...(["IS15_NF1", "IS15_NF15", "IS13_NF1", "IS13_NF15"] as const).flatMap(
          (model) =>
            (["I01", "I1"] as const).map(
              (current) => `VBE_${model}_${current}`,
            ),
        ),
      ],
    }),
    references: [
      source(
        "ngspice-bjt-is-nf-parameters",
        "ngspice manual — Gummel-Poon BJT model parameters",
        "https://nmg.gitlab.io/ngspice-manual/bjts/bjtmodels_npn_pnp/gummel-poonbjtparameters_incl_modelextensions.html",
        "In ngspice's modified Gummel-Poon BJT model, IS is transport saturation current and NF is the forward-current emission coefficient; together they determine forward current gain behavior and the exponential base-emitter relation.",
        "7b915e8cad77ec4167419bd3f786ccea00f09c5a0697c115e68f50df93e1a5c9",
      ),
    ],
  },
  {
    id: "intent-complementary-bjt-junction-current-sweep",
    title: "Behavioral complementary BJT junction-current sweep",
    topologyMode: "behavioral",
    prompt:
      "Design matched complementary diode-connected BJT branches around a common reference. Use NPN and PNP devices with transport saturation current near 1 fA, beta near 100, and Early voltage near 100 V. Create forward-emission-coefficient families near 1 and 1.4, and bias each polarity near 0.1 mA and 1 mA with the appropriate source direction. Preserve GND and every VBE_N/P_NF1/NF14 by I01/I1 observation net. Simulate all eight signed voltages and explain the measured complementary symmetry, polarity, equal current-decade increments, and proportional emission-coefficient scaling. Exact reference designators and current-bias implementation are your choice.",
    questions: [
      {
        id: "complementary-bjt-signed-voltages",
        prompt:
          "What eight signed base-emitter voltages establish the two polarities, emission families, and current points?",
        answerKind: "numeric",
        requiredEvidenceRefs: ([
          "n-nf1-i01",
          "p-nf1-i01",
          "n-nf1-i1",
          "p-nf1-i1",
          "n-nf14-i01",
          "p-nf14-i01",
          "n-nf14-i1",
          "p-nf14-i1",
        ] as const).map((point) => `derived-complementary-bjt-${point}-voltage`),
      },
      {
        id: "complementary-bjt-magnitude-and-polarity-symmetry",
        prompt:
          "Which magnitude comparisons demonstrate matched but opposite-polarity NPN and PNP junction behavior?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-complementary-bjt-nf1-i01-p-n-magnitude-ratio",
          "derived-complementary-bjt-nf1-i1-p-n-magnitude-ratio",
          "derived-complementary-bjt-nf14-i01-p-n-magnitude-ratio",
          "derived-complementary-bjt-nf14-i1-p-n-magnitude-ratio",
          "adi-bjt-complementary-junction-symmetry",
        ],
      },
      {
        id: "complementary-bjt-step-and-emission-scaling",
        prompt:
          "What current-decade and NF-family ratios show that both polarities obey the same logarithmic junction law?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-complementary-bjt-nf1-complementary-step-ratio",
          "derived-complementary-bjt-nf14-complementary-step-ratio",
          "derived-complementary-bjt-n-i1-nf14-nf1-ratio",
          "derived-complementary-bjt-p-i1-nf14-nf1-ratio",
        ],
      },
    ],
    oracleGraph: complementaryBjtJunctionCurrentSweepGraph,
    requiredComponentTypes: [
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "pnp-transistor",
      "pnp-transistor",
      "pnp-transistor",
      "pnp-transistor",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      ...([
        ["N_NF1_I01", 0.645, 0.665],
        ["P_NF1_I01", -0.665, -0.645],
        ["N_NF1_I1", 0.704, 0.725],
        ["P_NF1_I1", -0.725, -0.704],
        ["N_NF14_I01", 0.906, 0.928],
        ["P_NF14_I01", -0.928, -0.906],
        ["N_NF14_I1", 0.989, 1.011],
        ["P_NF14_I1", -1.011, -0.989],
      ] as const).map(([point, minimumExpected, maximumExpected]) => ({
        _tag: "SignalMetricRange" as const,
        id: `derived-complementary-bjt-${point.toLowerCase().replaceAll("_", "-")}-voltage`,
        signal: netVoltage(`VBE_${point}`),
        metric: "average" as const,
        startFraction: 0.5,
        minimumExpected,
        maximumExpected,
      })),
      ...(["NF1_I01", "NF1_I1", "NF14_I01", "NF14_I1"] as const).map(
        (point) => ({
          _tag: "MagnitudeRatio" as const,
          id: `derived-complementary-bjt-${point.toLowerCase().replaceAll("_", "-")}-p-n-magnitude-ratio`,
          numerator: netVoltage(`VBE_P_${point}`),
          denominator: netVoltage(`VBE_N_${point}`),
          startFraction: 0.5,
          expectedRatio: approximate(1, 0.025),
        }),
      ),
      ...(["NF1", "NF14"] as const).map((model) => ({
        _tag: "DifferenceRatio" as const,
        id: `derived-complementary-bjt-${model.toLowerCase()}-complementary-step-ratio`,
        numeratorMinuend: netVoltage(`VBE_N_${model}_I1`),
        numeratorSubtrahend: netVoltage(`VBE_N_${model}_I01`),
        denominatorMinuend: netVoltage(`VBE_P_${model}_I01`),
        denominatorSubtrahend: netVoltage(`VBE_P_${model}_I1`),
        startFraction: 0.5,
        expectedRatio: approximate(1, 0.04),
      })),
      ...(["N", "P"] as const).map((polarity) => ({
        _tag: "MagnitudeRatio" as const,
        id: `derived-complementary-bjt-${polarity.toLowerCase()}-i1-nf14-nf1-ratio`,
        numerator: netVoltage(`VBE_${polarity}_NF14_I1`),
        denominator: netVoltage(`VBE_${polarity}_NF1_I1`),
        startFraction: 0.5,
        expectedRatio: approximate(1.4, 0.04),
      })),
    ],
    expected: expected({
      requiredNetNames: [
        "GND",
        ...(["NF1", "NF14"] as const).flatMap((model) =>
          (["I01", "I1"] as const).flatMap((current) => [
            `VBE_N_${model}_${current}`,
            `VBE_P_${model}_${current}`,
          ]),
        ),
      ],
    }),
    references: [
      source(
        "adi-bjt-complementary-junction-symmetry",
        "Analog Devices University Wiki — BJT junction and Ebers-Moll behavior",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-8",
        "The Ebers-Moll view treats a BJT's base-emitter junction like a Shockley diode whose current is mirrored into the collector; matched NPN and PNP junction models therefore produce opposite-polarity base-emitter voltages with equal magnitudes under mirrored bias.",
        "2589b6d6e6201cae2657b1bd5fb3c6e8bb2ba6aadd3424bac8218eba7f716d96",
      ),
    ],
  },
  {
    id: "intent-bjt-nf-vbe-current-surface",
    title: "Behavioral BJT emission-coefficient/VBE current surface",
    topologyMode: "behavioral",
    prompt:
      "Design a three-by-three forward-active NPN experiment around a common reference. Use one collector supply near 5 V and equal sense resistors near 100 Ohm. Hold beta near 100, Early voltage near 100 V, and transport saturation current near 1 fA across all nine devices. Use forward-emission-coefficient rows near 1, 1.2, and 1.5 and shared base-voltage columns near 0.62 V, 0.66 V, and 0.70 V. Preserve GND, VCC, BASE_620, BASE_660, BASE_700, and every NF1/NF12/NF15 by B620/B660/B700 collector net. Simulate the complete current surface and explain, from branch-current evidence, the exponential ratio produced by each equal base-voltage step and why that ratio falls as forward emission coefficient rises. Exact reference designators and shared-source implementation are your choice.",
    questions: [
      {
        id: "bjt-nf-surface-branch-currents",
        prompt:
          "What nine collector-branch currents establish the complete NF-by-VBE operating surface?",
        answerKind: "numeric",
        requiredEvidenceRefs: ([
          "nf1-b620",
          "nf1-b660",
          "nf1-b700",
          "nf12-b620",
          "nf12-b660",
          "nf12-b700",
          "nf15-b620",
          "nf15-b660",
          "nf15-b700",
        ] as const).map((point) => `derived-bjt-nf-surface-${point}-current`),
      },
      {
        id: "bjt-nf-surface-equal-voltage-steps",
        prompt:
          "What measured base-voltage differences establish two equal 40 mV stimulus steps?",
        answerKind: "numeric",
        requiredEvidenceRefs: [
          "derived-bjt-nf-surface-base-low-mid-step",
          "derived-bjt-nf-surface-base-mid-high-step",
        ],
      },
      {
        id: "bjt-nf-surface-exponential-ratio-progression",
        prompt:
          "What six adjacent current ratios show an exponential response within each row and a decreasing ratio as NF increases?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-bjt-nf-surface-nf1-low-mid-ratio",
          "derived-bjt-nf-surface-nf1-mid-high-ratio",
          "derived-bjt-nf-surface-nf12-low-mid-ratio",
          "derived-bjt-nf-surface-nf12-mid-high-ratio",
          "derived-bjt-nf-surface-nf15-low-mid-ratio",
          "derived-bjt-nf-surface-nf15-mid-high-ratio",
          "adi-bjt-vbe-exponential-nf-slope",
        ],
      },
    ],
    oracleGraph: bjtEmissionBaseVoltageCurrentSurfaceGraph,
    requiredComponentTypes: [
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "dc-voltage-source",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "resistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
      "npn-transistor",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      ...([
        ["NF1", "B620", 0.00002685011937],
        ["NF1", "B660", 0.00012600077017],
        ["NF1", "B700", 0.00059108201344],
        ["NF12", "B620", 4.94206691e-7],
        ["NF12", "B660", 0.00000179238515],
        ["NF12", "B700", 0.00000650065182],
        ["NF15", "B620", 9.10524421e-9],
        ["NF15", "B660", 2.55031079e-8],
        ["NF15", "B700", 7.14628862e-8],
      ] as const).map(([emission, base, expectedCurrent]) => ({
        _tag: "SignalMetricRange" as const,
        id: `derived-bjt-nf-surface-${emission.toLowerCase()}-${base.toLowerCase()}-current`,
        signal: branchCurrent(
          "VCC",
          `${emission}_${base}_COLLECTOR`,
          "resistor",
        ),
        metric: "average" as const,
        startFraction: 0.5,
        minimumExpected: expectedCurrent * 0.97,
        maximumExpected: expectedCurrent * 1.03,
      })),
      {
        _tag: "MeanDifference",
        id: "derived-bjt-nf-surface-base-low-mid-step",
        minuend: netVoltage("BASE_660"),
        subtrahend: netVoltage("BASE_620"),
        startFraction: 0.5,
        expected: approximate(0.04, 0.002),
      },
      {
        _tag: "MeanDifference",
        id: "derived-bjt-nf-surface-base-mid-high-step",
        minuend: netVoltage("BASE_700"),
        subtrahend: netVoltage("BASE_660"),
        startFraction: 0.5,
        expected: approximate(0.04, 0.002),
      },
      ...([
        ["NF1", 4.6919, 0.08],
        ["NF12", 3.6268, 0.07],
        ["NF15", 2.8015, 0.06],
      ] as const).flatMap(([emission, expectedRatio, absoluteTolerance]) => [
        {
          _tag: "MagnitudeRatio" as const,
          id: `derived-bjt-nf-surface-${emission.toLowerCase()}-low-mid-ratio`,
          numerator: branchCurrent(
            "VCC",
            `${emission}_B660_COLLECTOR`,
            "resistor",
          ),
          denominator: branchCurrent(
            "VCC",
            `${emission}_B620_COLLECTOR`,
            "resistor",
          ),
          startFraction: 0.5,
          expectedRatio: approximate(expectedRatio, absoluteTolerance),
        },
        {
          _tag: "MagnitudeRatio" as const,
          id: `derived-bjt-nf-surface-${emission.toLowerCase()}-mid-high-ratio`,
          numerator: branchCurrent(
            "VCC",
            `${emission}_B700_COLLECTOR`,
            "resistor",
          ),
          denominator: branchCurrent(
            "VCC",
            `${emission}_B660_COLLECTOR`,
            "resistor",
          ),
          startFraction: 0.5,
          expectedRatio: approximate(expectedRatio, absoluteTolerance),
        },
      ]),
    ],
    expected: expected({
      requiredNetNames: [
        "GND",
        "VCC",
        "BASE_620",
        "BASE_660",
        "BASE_700",
        ...(["NF1", "NF12", "NF15"] as const).flatMap((emission) =>
          (["B620", "B660", "B700"] as const).map(
            (base) => `${emission}_${base}_COLLECTOR`,
          ),
        ),
      ],
    }),
    references: [
      source(
        "adi-bjt-vbe-exponential-nf-slope",
        "Analog Devices University Wiki — BJT exponential base-emitter relation",
        "https://wiki.analog.com/university/courses/electronics/text/chapter-8",
        "For forward-active BJT operation, collector current depends exponentially on base-emitter voltage; increasing the forward emission coefficient reduces the exponential current ratio produced by a fixed base-voltage step.",
        "6e21a7f8a01cef08213ed486e893908609ee5d04548e0fad6c764d1ba2cfb2e1",
      ),
    ],
  },
  {
    id: "intent-zener-ibv-current-matrix",
    title: "Behavioral Zener breakdown-reference-current operating matrix",
    topologyMode: "behavioral",
    prompt:
      "Design nine independently current-biased Zener reference branches around a common ground. Hold nominal breakdown voltage near 5.1 V, forward saturation current near 10 fA, emission coefficient near 1, and dynamic resistance near 1 Ohm. Cross breakdown reference currents near 0.1 mA, 1 mA, and 10 mA with reverse operating currents near 20 mA, 50 mA, and 100 mA. Preserve GND and every REF_IBV01/IBV1/IBV10 by I20/I50/I100 observation net. Simulate the complete voltage surface and explain, from measured evidence, the equal offsets between IBV decades and the common logarithmic-plus-ohmic operating-current response. Exact reference designators and current-bias implementation are your choice.",
    questions: [
      {
        id: "zener-ibv-matrix-operating-voltages",
        prompt:
          "What nine reference voltages establish the complete IBV-by-current surface?",
        answerKind: "numeric",
        requiredEvidenceRefs: ([
          "ibv01-i20",
          "ibv01-i50",
          "ibv01-i100",
          "ibv1-i20",
          "ibv1-i50",
          "ibv1-i100",
          "ibv10-i20",
          "ibv10-i50",
          "ibv10-i100",
        ] as const).map((point) => `derived-zener-ibv-${point}-voltage`),
      },
      {
        id: "zener-ibv-matrix-decade-offsets",
        prompt:
          "What equal voltage offsets demonstrate the effect of each decade increase in breakdown reference current?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-ibv-i20-low-mid-offset",
          "derived-zener-ibv-i20-mid-high-offset",
          "derived-zener-ibv-i100-low-mid-offset",
          "derived-zener-ibv-i100-mid-high-offset",
          "ngspice-zener-bv-ibv-breakdown",
        ],
      },
      {
        id: "zener-ibv-matrix-current-response",
        prompt:
          "Which difference ratios show that every IBV row has the same response to the two operating-current steps?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-ibv-low-mid-current-step-row-ratio",
          "derived-zener-ibv-mid-high-current-step-row-ratio",
        ],
      },
    ],
    oracleGraph: zenerBreakdownCurrentOperatingMatrixGraph,
    requiredComponentTypes: [
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      ...([
        ["IBV01_I20", 5.247, 5.267],
        ["IBV01_I50", 5.3, 5.321],
        ["IBV01_I100", 5.368, 5.389],
        ["IBV1_I20", 5.187, 5.208],
        ["IBV1_I50", 5.241, 5.262],
        ["IBV1_I100", 5.309, 5.33],
        ["IBV10_I20", 5.127, 5.149],
        ["IBV10_I50", 5.181, 5.202],
        ["IBV10_I100", 5.249, 5.27],
      ] as const).map(([point, minimumExpected, maximumExpected]) => ({
        _tag: "SignalMetricRange" as const,
        id: `derived-zener-ibv-${point.toLowerCase().replaceAll("_", "-")}-voltage`,
        signal: netVoltage(`REF_${point}`),
        metric: "average" as const,
        startFraction: 0.5,
        minimumExpected,
        maximumExpected,
      })),
      ...(["I20", "I100"] as const).flatMap((current) => [
        {
          _tag: "MeanDifference" as const,
          id: `derived-zener-ibv-${current.toLowerCase()}-low-mid-offset`,
          minuend: netVoltage(`REF_IBV01_${current}`),
          subtrahend: netVoltage(`REF_IBV1_${current}`),
          startFraction: 0.5,
          expected: approximate(0.059556, 0.006),
        },
        {
          _tag: "MeanDifference" as const,
          id: `derived-zener-ibv-${current.toLowerCase()}-mid-high-offset`,
          minuend: netVoltage(`REF_IBV1_${current}`),
          subtrahend: netVoltage(`REF_IBV10_${current}`),
          startFraction: 0.5,
          expected: approximate(0.059556, 0.006),
        },
      ]),
      {
        _tag: "DifferenceRatio",
        id: "derived-zener-ibv-low-mid-current-step-row-ratio",
        numeratorMinuend: netVoltage("REF_IBV01_I50"),
        numeratorSubtrahend: netVoltage("REF_IBV01_I20"),
        denominatorMinuend: netVoltage("REF_IBV10_I50"),
        denominatorSubtrahend: netVoltage("REF_IBV10_I20"),
        startFraction: 0.5,
        expectedRatio: approximate(1, 0.04),
      },
      {
        _tag: "DifferenceRatio",
        id: "derived-zener-ibv-mid-high-current-step-row-ratio",
        numeratorMinuend: netVoltage("REF_IBV01_I100"),
        numeratorSubtrahend: netVoltage("REF_IBV01_I50"),
        denominatorMinuend: netVoltage("REF_IBV10_I100"),
        denominatorSubtrahend: netVoltage("REF_IBV10_I50"),
        startFraction: 0.5,
        expectedRatio: approximate(1, 0.04),
      },
    ],
    expected: expected({
      requiredNetNames: [
        "GND",
        ...(["IBV01", "IBV1", "IBV10"] as const).flatMap((model) =>
          (["I20", "I50", "I100"] as const).map(
            (current) => `REF_${model}_${current}`,
          ),
        ),
      ],
    }),
    references: [
      source(
        "ngspice-zener-bv-ibv-breakdown",
        "ngspice manual — diode reverse-breakdown parameters",
        "https://nmg.gitlab.io/ngspice-manual/diodes/diodeequations/diodedc%2Ctransientandacmodelequations.html",
        "ngspice models diode reverse breakdown with positive BV and IBV parameters: BV is the nominal breakdown voltage and IBV is the current at the onset of breakdown, after which reverse current rises exponentially.",
        "22cf9fc9510fd4c8343badfa264278f669079e934eb89bf85abbfa288655d5aa",
      ),
    ],
  },
  {
    id: "intent-zener-forward-is-n-current-matrix",
    title: "Behavioral Zener forward Is/N/current matrix",
    topologyMode: "behavioral",
    prompt:
      "Design eight independently current-biased Zener branches in forward polarity around a common ground. Hold nominal breakdown voltage near 5.1 V, breakdown reference current near 1 mA, and dynamic resistance near 1 mOhm. Cross forward saturation currents near 10 fA and 1 pA with emission coefficients near 1 and 2, then exercise every model near 0.1 mA and 1 mA. Preserve GND and every FORWARD_IS14_N1/IS14_N2/IS12_N1/IS12_N2 by I01/I1 observation net. Simulate the complete matrix and explain the saturation-current offset, emission-coefficient scaling, and logarithmic current-decade increments. Exact reference designators and current-bias implementation are your choice.",
    questions: [
      {
        id: "zener-forward-matrix-operating-voltages",
        prompt:
          "What eight forward voltages establish every Is, N, and current combination?",
        answerKind: "numeric",
        requiredEvidenceRefs: ([
          "is14-n1-i01",
          "is14-n1-i1",
          "is14-n2-i01",
          "is14-n2-i1",
          "is12-n1-i01",
          "is12-n1-i1",
          "is12-n2-i01",
          "is12-n2-i1",
        ] as const).map((point) => `derived-zener-forward-${point}-voltage`),
      },
      {
        id: "zener-forward-matrix-is-shift",
        prompt:
          "At matched current and N, how far does the higher-Is family shift forward voltage downward?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-forward-n1-i1-is-shift",
          "derived-zener-forward-n2-i1-is-shift",
          "ngspice-zener-forward-is-n",
        ],
      },
      {
        id: "zener-forward-matrix-n-and-current-scaling",
        prompt:
          "What voltage ratios and decade steps demonstrate emission-coefficient and logarithmic-current scaling?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-forward-is14-i01-n2-n1-ratio",
          "derived-zener-forward-is12-i1-n2-n1-ratio",
          "derived-zener-forward-is14-n1-decade-step",
          "derived-zener-forward-is14-n2-decade-step",
        ],
      },
    ],
    oracleGraph: zenerForwardSaturationEmissionCurrentMatrixGraph,
    requiredComponentTypes: [
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      ...([
        ["IS14_N1_I01", 0.585, 0.606],
        ["IS14_N1_I1", 0.645, 0.666],
        ["IS14_N2_I01", 1.18, 1.202],
        ["IS14_N2_I1", 1.299, 1.321],
        ["IS12_N1_I01", 0.466, 0.487],
        ["IS12_N1_I1", 0.526, 0.547],
        ["IS12_N2_I01", 0.942, 0.964],
        ["IS12_N2_I1", 1.061, 1.083],
      ] as const).map(([point, minimumExpected, maximumExpected]) => ({
        _tag: "SignalMetricRange" as const,
        id: `derived-zener-forward-${point.toLowerCase().replaceAll("_", "-")}-voltage`,
        signal: netVoltage(`FORWARD_${point}`),
        metric: "average" as const,
        startFraction: 0.5,
        minimumExpected,
        maximumExpected,
      })),
      {
        _tag: "MeanDifference",
        id: "derived-zener-forward-n1-i1-is-shift",
        minuend: netVoltage("FORWARD_IS14_N1_I1"),
        subtrahend: netVoltage("FORWARD_IS12_N1_I1"),
        startFraction: 0.5,
        expected: approximate(0.119112, 0.008),
      },
      {
        _tag: "MeanDifference",
        id: "derived-zener-forward-n2-i1-is-shift",
        minuend: netVoltage("FORWARD_IS14_N2_I1"),
        subtrahend: netVoltage("FORWARD_IS12_N2_I1"),
        startFraction: 0.5,
        expected: approximate(0.238225, 0.012),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-zener-forward-is14-i01-n2-n1-ratio",
        numerator: netVoltage("FORWARD_IS14_N2_I01"),
        denominator: netVoltage("FORWARD_IS14_N1_I01"),
        startFraction: 0.5,
        expectedRatio: approximate(2, 0.04),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-zener-forward-is12-i1-n2-n1-ratio",
        numerator: netVoltage("FORWARD_IS12_N2_I1"),
        denominator: netVoltage("FORWARD_IS12_N1_I1"),
        startFraction: 0.5,
        expectedRatio: approximate(2, 0.04),
      },
      {
        _tag: "MeanDifference",
        id: "derived-zener-forward-is14-n1-decade-step",
        minuend: netVoltage("FORWARD_IS14_N1_I1"),
        subtrahend: netVoltage("FORWARD_IS14_N1_I01"),
        startFraction: 0.5,
        expected: approximate(0.059557, 0.006),
      },
      {
        _tag: "MeanDifference",
        id: "derived-zener-forward-is14-n2-decade-step",
        minuend: netVoltage("FORWARD_IS14_N2_I1"),
        subtrahend: netVoltage("FORWARD_IS14_N2_I01"),
        startFraction: 0.5,
        expected: approximate(0.119113, 0.009),
      },
    ],
    expected: expected({
      requiredNetNames: [
        "GND",
        ...(["IS14_N1", "IS14_N2", "IS12_N1", "IS12_N2"] as const).flatMap(
          (model) =>
            (["I01", "I1"] as const).map(
              (current) => `FORWARD_${model}_${current}`,
            ),
        ),
      ],
    }),
    references: [
      source(
        "ngspice-zener-forward-is-n",
        "ngspice manual — diode forward DC parameters",
        "https://nmg.gitlab.io/ngspice-manual/diodes/diodemodel_d.html",
        "The ngspice diode model's forward DC characteristic is determined by saturation current Is and emission coefficient N, while Rs contributes an ohmic series voltage drop.",
        "dcdb5a842fd84b0402686a29c9952fa0cdc7800ceaa54aa998ffbd2f9f13bce4",
      ),
    ],
  },
  {
    id: "intent-zener-bidirectional-parameter-orthogonality",
    title: "Behavioral Zener bidirectional parameter orthogonality",
    topologyMode: "behavioral",
    prompt:
      "Design four matched pairs of Zener branches around a common ground, one branch forward-biased near 1 mA and one reverse-biased near 20 mA per model. Hold nominal breakdown voltage near 5.1 V and dynamic resistance near 1 mOhm. Use a baseline with IBV near 1 mA, Is near 10 fA, and N near 1; compare it with a higher-Is model near 1 pA, a higher-N model near 1.5, and a higher-IBV model near 10 mA while holding the other parameters at baseline. Preserve GND and every FORWARD_BASE/HIGH_IS/HIGH_N/HIGH_IBV and REVERSE_BASE/HIGH_IS/HIGH_N/HIGH_IBV observation net. Simulate all eight voltages and explain which parameter changes forward behavior, reverse behavior, or both. Exact reference designators and bias implementation are your choice.",
    questions: [
      {
        id: "zener-bidirectional-operating-voltages",
        prompt:
          "What eight forward and reverse voltages establish every model comparison?",
        answerKind: "numeric",
        requiredEvidenceRefs: ([
          "forward-base",
          "reverse-base",
          "forward-high-is",
          "reverse-high-is",
          "forward-high-n",
          "reverse-high-n",
          "forward-high-ibv",
          "reverse-high-ibv",
        ] as const).map((point) => `derived-zener-orthogonality-${point}-voltage`),
      },
      {
        id: "zener-bidirectional-forward-parameter-effects",
        prompt:
          "Which comparisons show the forward effects of Is and N and the forward invariance to IBV?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-orthogonality-forward-is-shift",
          "derived-zener-orthogonality-forward-n-ratio",
          "derived-zener-orthogonality-forward-ibv-invariance",
          "ngspice-zener-bidirectional-dc-parameters",
        ],
      },
      {
        id: "zener-bidirectional-reverse-parameter-effects",
        prompt:
          "Which comparisons show reverse invariance to Is, reverse dependence on N, and the IBV shift?",
        answerKind: "comparison",
        requiredEvidenceRefs: [
          "derived-zener-orthogonality-reverse-is-invariance",
          "derived-zener-orthogonality-reverse-n-shift",
          "derived-zener-orthogonality-reverse-ibv-shift",
        ],
      },
    ],
    oracleGraph: zenerBidirectionalParameterOrthogonalityGraph,
    requiredComponentTypes: [
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "dc-current-source",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
      "zener-diode",
    ],
    minimumDurationMs: 10,
    derivedObservations: [
      ...([
        ["FORWARD_BASE", 0.645, 0.666],
        ["REVERSE_BASE", 5.167, 5.188],
        ["FORWARD_HIGH_IS", 0.526, 0.547],
        ["REVERSE_HIGH_IS", 5.167, 5.188],
        ["FORWARD_HIGH_N", 0.972, 0.993],
        ["REVERSE_HIGH_N", 5.205, 5.227],
        ["FORWARD_HIGH_IBV", 0.645, 0.666],
        ["REVERSE_HIGH_IBV", 5.107, 5.129],
      ] as const).map(([net, minimumExpected, maximumExpected]) => ({
        _tag: "SignalMetricRange" as const,
        id: `derived-zener-orthogonality-${net.toLowerCase().replaceAll("_", "-")}-voltage`,
        signal: netVoltage(net),
        metric: "average" as const,
        startFraction: 0.5,
        minimumExpected,
        maximumExpected,
      })),
      {
        _tag: "MeanDifference",
        id: "derived-zener-orthogonality-forward-is-shift",
        minuend: netVoltage("FORWARD_BASE"),
        subtrahend: netVoltage("FORWARD_HIGH_IS"),
        startFraction: 0.5,
        expected: approximate(0.119112, 0.008),
      },
      {
        _tag: "MagnitudeRatio",
        id: "derived-zener-orthogonality-forward-n-ratio",
        numerator: netVoltage("FORWARD_HIGH_N"),
        denominator: netVoltage("FORWARD_BASE"),
        startFraction: 0.5,
        expectedRatio: approximate(1.5, 0.04),
      },
      {
        _tag: "MeanDifference",
        id: "derived-zener-orthogonality-forward-ibv-invariance",
        minuend: netVoltage("FORWARD_HIGH_IBV"),
        subtrahend: netVoltage("FORWARD_BASE"),
        startFraction: 0.5,
        expected: approximate(0, 0.002),
      },
      {
        _tag: "MeanDifference",
        id: "derived-zener-orthogonality-reverse-is-invariance",
        minuend: netVoltage("REVERSE_HIGH_IS"),
        subtrahend: netVoltage("REVERSE_BASE"),
        startFraction: 0.5,
        expected: approximate(0, 0.002),
      },
      {
        _tag: "MeanDifference",
        id: "derived-zener-orthogonality-reverse-n-shift",
        minuend: netVoltage("REVERSE_HIGH_N"),
        subtrahend: netVoltage("REVERSE_BASE"),
        startFraction: 0.5,
        expected: approximate(0.038742, 0.006),
      },
      {
        _tag: "MeanDifference",
        id: "derived-zener-orthogonality-reverse-ibv-shift",
        minuend: netVoltage("REVERSE_BASE"),
        subtrahend: netVoltage("REVERSE_HIGH_IBV"),
        startFraction: 0.5,
        expected: approximate(0.059556, 0.006),
      },
    ],
    expected: expected({
      requiredNetNames: [
        "GND",
        ...(["BASE", "HIGH_IS", "HIGH_N", "HIGH_IBV"] as const).flatMap(
          (model) => [`FORWARD_${model}`, `REVERSE_${model}`],
        ),
      ],
    }),
    references: [
      source(
        "ngspice-zener-bidirectional-dc-parameters",
        "ngspice manual — bidirectional diode DC model",
        "https://nmg.gitlab.io/ngspice-manual/diodes/diodemodel_d.html",
        "A Zener represented by ngspice's diode model uses Is and N to determine forward DC behavior, BV and IBV to determine reverse breakdown, and Rs as an ohmic resistance in the external junction path.",
        "dab1db0fd0ae027c4d31128f85b4e2da752144bc54fbbabfb7f8ddfe0c8ed448",
      ),
    ],
  },
  ...amplifierAssignmentIntentCases,
])
