import { Schema } from "effect"
import { IntentCaseSchema } from "../intent-schema"
import { CircuitBenchmarkCaseSchema } from "../schema"

const approximate = (value: number, absoluteTolerance: number) => ({
  value,
  absoluteTolerance,
})

const analysis = (durationMs: number, timeStepMs: number) => ({
  durationMs,
  timeStepMs,
})

const expected = (
  requiredNetNames: ReadonlyArray<string>,
  traceRanges: ReadonlyArray<unknown>,
) => ({
  requiredNetNames,
  statuses: ["success"],
  netVoltages: [],
  componentMeasurements: [],
  traces: [],
  traceRanges,
  diagnosticIncludes: [],
})

const bjtProps = {
  beta: 100,
  earlyVoltageVolts: 100,
  saturationCurrentAmps: 1e-15,
  forwardEmissionCoefficient: 1,
}

const diodeProps = {
  model: "DDEFAULT",
  saturationCurrentAmps: 1e-14,
  emissionCoefficient: 1,
  seriesResistanceOhms: 0,
}

export const pulseVoltageSourceReleaseCase = Schema.decodeUnknownSync(
  CircuitBenchmarkCaseSchema,
)({
  id: "pulse-voltage-source-duty-cycle",
  title: "Pulse/PWM voltage-source duty cycle",
  prompt: "Drive a 1 kOhm load from a two-terminal pulse voltage source that switches from 0 V to 5 V at 1 kHz with 25% duty cycle, 10 ns rise/fall times, and no delay. Preserve PWM_OUT and GND, simulate four periods, and report the low/high levels, frequency, duty behavior, average voltage, and load current.",
  smoke: false,
  graph: {
    groundNet: "GND",
    components: [
      { type: "pulse-voltage-source", refdes: "VPWM", props: { initialVoltageVolts: 0, pulsedVoltageVolts: 5, frequencyHertz: 1_000, dutyCyclePercent: 25, delaySeconds: 0, riseTimeSeconds: 10e-9, fallTimeSeconds: 10e-9 } },
      { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
    ],
    nets: [
      { name: "PWM_OUT", terminals: [{ refdes: "VPWM", pin: "positive" }, { refdes: "RLOAD", pin: "a" }] },
      { name: "GND", terminals: [{ refdes: "VPWM", pin: "negative" }, { refdes: "RLOAD", pin: "b" }] },
    ],
    analysis: analysis(4, 0.02),
  },
  expected: expected(
    ["GND", "PWM_OUT"],
    [
      { signalName: "V(PWM_OUT)", metric: "minimum", startFraction: 0.25, expected: approximate(0, 0.001) },
      { signalName: "V(PWM_OUT)", metric: "maximum", startFraction: 0.25, expected: approximate(5, 0.001) },
      { signalName: "V(PWM_OUT)", metric: "average", startFraction: 0.25, expected: approximate(1.25, 0.05) },
    ],
  ),
})

export const imageClassACommonEmitterGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-power-rail", refdes: "VCC", props: { voltageVolts: 15 } },
    { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 0.01, frequencyHertz: 1_000 } },
    { type: "resistor", refdes: "R1", props: { resistanceOhms: 68_000 } },
    { type: "resistor", refdes: "R2", props: { resistanceOhms: 27_000 } },
    { type: "resistor", refdes: "RC", props: { resistanceOhms: 3_900 } },
    { type: "resistor", refdes: "RE", props: { resistanceOhms: 2_200 } },
    { type: "resistor", refdes: "RL", props: { resistanceOhms: 3_900 } },
    { type: "capacitor", refdes: "CIN", props: { capacitanceFarads: 1e-6 } },
    { type: "capacitor", refdes: "COUT", props: { capacitanceFarads: 10e-6 } },
    { type: "capacitor", refdes: "CE", props: { capacitanceFarads: 100e-6 } },
    { type: "npn-transistor", refdes: "QA", props: bjtProps },
  ],
  nets: [
    { name: "VCC", terminals: [{ refdes: "VCC", pin: "rail" }, { refdes: "R1", pin: "a" }, { refdes: "RC", pin: "a" }] },
    { name: "CLASS_A_INPUT", terminals: [{ refdes: "VIN", pin: "positive" }, { refdes: "CIN", pin: "a" }] },
    { name: "CLASS_A_BASE", terminals: [{ refdes: "CIN", pin: "b" }, { refdes: "R1", pin: "b" }, { refdes: "R2", pin: "a" }, { refdes: "QA", pin: "base" }] },
    { name: "CLASS_A_COLLECTOR", terminals: [{ refdes: "RC", pin: "b" }, { refdes: "QA", pin: "collector" }, { refdes: "COUT", pin: "a" }] },
    { name: "CLASS_A_EMITTER", terminals: [{ refdes: "QA", pin: "emitter" }, { refdes: "RE", pin: "a" }, { refdes: "CE", pin: "a" }] },
    { name: "CLASS_A_OUT", terminals: [{ refdes: "COUT", pin: "b" }, { refdes: "RL", pin: "a" }] },
    { name: "GND", terminals: [{ refdes: "VIN", pin: "negative" }, { refdes: "R2", pin: "b" }, { refdes: "RE", pin: "b" }, { refdes: "CE", pin: "b" }, { refdes: "RL", pin: "b" }] },
  ],
  analysis: analysis(20, 0.02),
} as const

export const imageClassBPushPullGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-power-rail", refdes: "VCC", props: { voltageVolts: 15 } },
    { type: "dc-power-rail", refdes: "VEE", props: { voltageVolts: -15 } },
    { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 14, frequencyHertz: 1_000 } },
    { type: "npn-transistor", refdes: "QBN", props: bjtProps },
    { type: "pnp-transistor", refdes: "QBP", props: bjtProps },
    { type: "resistor", refdes: "RLB", props: { resistanceOhms: 30 } },
  ],
  nets: [
    { name: "VCC", terminals: [{ refdes: "VCC", pin: "rail" }, { refdes: "QBN", pin: "collector" }] },
    { name: "VEE", terminals: [{ refdes: "VEE", pin: "rail" }, { refdes: "QBP", pin: "collector" }] },
    { name: "DRIVE", terminals: [{ refdes: "VIN", pin: "positive" }, { refdes: "QBN", pin: "base" }, { refdes: "QBP", pin: "base" }] },
    { name: "CLASS_B_OUT", terminals: [{ refdes: "QBN", pin: "emitter" }, { refdes: "QBP", pin: "emitter" }, { refdes: "RLB", pin: "a" }] },
    { name: "GND", terminals: [{ refdes: "VIN", pin: "negative" }, { refdes: "RLB", pin: "b" }] },
  ],
  analysis: analysis(10, 0.02),
} as const

export const imageClassAbPushPullGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-power-rail", refdes: "VCC", props: { voltageVolts: 15 } },
    { type: "dc-power-rail", refdes: "VEE", props: { voltageVolts: -15 } },
    { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 14, frequencyHertz: 1_000 } },
    { type: "resistor", refdes: "RAB1", props: { resistanceOhms: 510 } },
    { type: "resistor", refdes: "RAB2", props: { resistanceOhms: 510 } },
    { type: "diode", refdes: "DAB1", props: diodeProps },
    { type: "diode", refdes: "DAB2", props: diodeProps },
    { type: "npn-transistor", refdes: "QABN", props: bjtProps },
    { type: "pnp-transistor", refdes: "QABP", props: bjtProps },
    { type: "resistor", refdes: "RLAB", props: { resistanceOhms: 30 } },
  ],
  nets: [
    { name: "VCC", terminals: [{ refdes: "VCC", pin: "rail" }, { refdes: "RAB1", pin: "a" }, { refdes: "QABN", pin: "collector" }] },
    { name: "VEE", terminals: [{ refdes: "VEE", pin: "rail" }, { refdes: "RAB2", pin: "b" }, { refdes: "QABP", pin: "collector" }] },
    { name: "AB_N_BASE", terminals: [{ refdes: "RAB1", pin: "b" }, { refdes: "DAB1", pin: "anode" }, { refdes: "QABN", pin: "base" }] },
    { name: "DRIVE", terminals: [{ refdes: "VIN", pin: "positive" }, { refdes: "DAB1", pin: "cathode" }, { refdes: "DAB2", pin: "anode" }] },
    { name: "AB_P_BASE", terminals: [{ refdes: "DAB2", pin: "cathode" }, { refdes: "RAB2", pin: "a" }, { refdes: "QABP", pin: "base" }] },
    { name: "CLASS_AB_OUT", terminals: [{ refdes: "QABN", pin: "emitter" }, { refdes: "QABP", pin: "emitter" }, { refdes: "RLAB", pin: "a" }] },
    { name: "GND", terminals: [{ refdes: "VIN", pin: "negative" }, { refdes: "RLAB", pin: "b" }] },
  ],
  analysis: analysis(10, 0.02),
} as const

export const derivedClassCTunedGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-power-rail", refdes: "VCC", props: { voltageVolts: 12 } },
    { type: "dc-voltage-source", refdes: "VBIAS", props: { voltageVolts: -0.4 } },
    { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 1.5, frequencyHertz: 20_000 } },
    { type: "resistor", refdes: "RBC", props: { resistanceOhms: 470 } },
    { type: "resistor", refdes: "RTANK", props: { resistanceOhms: 1_000 } },
    { type: "inductor", refdes: "LTANK", props: { inductanceHenries: 1e-3 } },
    { type: "capacitor", refdes: "CTANK", props: { capacitanceFarads: 63.325e-9 } },
    { type: "npn-transistor", refdes: "QC", props: bjtProps },
  ],
  nets: [
    { name: "VCC", terminals: [{ refdes: "VCC", pin: "rail" }, { refdes: "RTANK", pin: "a" }, { refdes: "LTANK", pin: "a" }, { refdes: "CTANK", pin: "a" }] },
    { name: "C_BIAS", terminals: [{ refdes: "VBIAS", pin: "positive" }, { refdes: "VIN", pin: "negative" }] },
    { name: "CLASS_C_DRIVE", terminals: [{ refdes: "VIN", pin: "positive" }, { refdes: "RBC", pin: "a" }] },
    { name: "CLASS_C_BASE", terminals: [{ refdes: "RBC", pin: "b" }, { refdes: "QC", pin: "base" }] },
    { name: "CLASS_C_OUT", terminals: [{ refdes: "RTANK", pin: "b" }, { refdes: "LTANK", pin: "b" }, { refdes: "CTANK", pin: "b" }, { refdes: "QC", pin: "collector" }] },
    { name: "GND", terminals: [{ refdes: "VBIAS", pin: "negative" }, { refdes: "QC", pin: "emitter" }] },
  ],
  analysis: analysis(1, 0.001),
} as const

export const derivedClassDPwmGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-power-rail", refdes: "VDD", props: { voltageVolts: 12 } },
    { type: "pulse-voltage-source", refdes: "VPWM", props: { initialVoltageVolts: 0, pulsedVoltageVolts: 12, frequencyHertz: 20_000, dutyCyclePercent: 40, delaySeconds: 0, riseTimeSeconds: 50e-9, fallTimeSeconds: 50e-9 } },
    { type: "p-mosfet", refdes: "MDP", props: { thresholdVolts: -2, transconductanceAmpsPerVoltSquared: 0.5, channelLengthModulationPerVolt: 0.01 } },
    { type: "n-mosfet", refdes: "MDN", props: { thresholdVolts: 2, transconductanceAmpsPerVoltSquared: 0.5, channelLengthModulationPerVolt: 0.01 } },
    { type: "inductor", refdes: "LDF", props: { inductanceHenries: 220e-6 } },
    { type: "capacitor", refdes: "CDF", props: { capacitanceFarads: 10e-6 } },
    { type: "resistor", refdes: "RLD", props: { resistanceOhms: 8 } },
  ],
  nets: [
    { name: "VDD", terminals: [{ refdes: "VDD", pin: "rail" }, { refdes: "MDP", pin: "source" }] },
    { name: "PWM_GATE", terminals: [{ refdes: "VPWM", pin: "positive" }, { refdes: "MDP", pin: "gate" }, { refdes: "MDN", pin: "gate" }] },
    { name: "CLASS_D_SWITCH", terminals: [{ refdes: "MDP", pin: "drain" }, { refdes: "MDN", pin: "drain" }, { refdes: "LDF", pin: "a" }] },
    { name: "CLASS_D_OUT", terminals: [{ refdes: "LDF", pin: "b" }, { refdes: "CDF", pin: "a" }, { refdes: "RLD", pin: "a" }] },
    { name: "GND", terminals: [{ refdes: "VPWM", pin: "negative" }, { refdes: "MDN", pin: "source" }, { refdes: "CDF", pin: "b" }, { refdes: "RLD", pin: "b" }] },
  ],
  analysis: analysis(2, 0.001),
} as const

export const imageR5ZeroOffsetGraph = {
  groundNet: "GND",
  components: [
    { type: "dc-power-rail", refdes: "VCC", props: { voltageVolts: 9 } },
    { type: "dc-power-rail", refdes: "VEE", props: { voltageVolts: -9 } },
    { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 0.1, frequencyHertz: 1_000 } },
    { type: "capacitor", refdes: "C1", props: { capacitanceFarads: 1e-6 } },
    { type: "resistor", refdes: "R1", props: { resistanceOhms: 10_000 } },
    { type: "resistor", refdes: "R2", props: { resistanceOhms: 68_000 } },
    { type: "resistor", refdes: "R3", props: { resistanceOhms: 10_000 } },
    { type: "resistor", refdes: "R4", props: { resistanceOhms: 2_700 } },
    { type: "resistor", refdes: "R5", props: { resistanceOhms: 4_020 } },
    { type: "resistor", refdes: "RL", props: { resistanceOhms: 330 } },
    { type: "diode", refdes: "D1", props: diodeProps },
    { type: "diode", refdes: "D2", props: diodeProps },
    { type: "npn-transistor", refdes: "QUP", props: bjtProps },
    { type: "pnp-transistor", refdes: "QDOWN", props: bjtProps },
    { type: "npn-transistor", refdes: "QDRIVER", props: bjtProps },
  ],
  nets: [
    { name: "VCC", terminals: [{ refdes: "VCC", pin: "rail" }, { refdes: "R1", pin: "a" }, { refdes: "R2", pin: "a" }, { refdes: "QUP", pin: "collector" }] },
    { name: "INPUT", terminals: [{ refdes: "VIN", pin: "positive" }, { refdes: "C1", pin: "a" }] },
    { name: "DRIVER_BASE", terminals: [{ refdes: "C1", pin: "b" }, { refdes: "R2", pin: "b" }, { refdes: "R5", pin: "a" }, { refdes: "QDRIVER", pin: "base" }] },
    { name: "R5_BOTTOM", terminals: [{ refdes: "R5", pin: "b" }, { refdes: "R3", pin: "a" }] },
    { name: "DRIVER_EMITTER", terminals: [{ refdes: "QDRIVER", pin: "emitter" }, { refdes: "R4", pin: "a" }] },
    { name: "UPPER_BASE", terminals: [{ refdes: "R1", pin: "b" }, { refdes: "D1", pin: "anode" }, { refdes: "QUP", pin: "base" }] },
    { name: "DIODE_MID", terminals: [{ refdes: "D1", pin: "cathode" }, { refdes: "D2", pin: "anode" }] },
    { name: "LOWER_BASE", terminals: [{ refdes: "D2", pin: "cathode" }, { refdes: "QDOWN", pin: "base" }, { refdes: "QDRIVER", pin: "collector" }] },
    { name: "OUTPUT", terminals: [{ refdes: "QUP", pin: "emitter" }, { refdes: "QDOWN", pin: "emitter" }, { refdes: "RL", pin: "a" }] },
    { name: "VEE", terminals: [{ refdes: "VEE", pin: "rail" }, { refdes: "R3", pin: "b" }, { refdes: "R4", pin: "b" }, { refdes: "QDOWN", pin: "collector" }] },
    { name: "GND", terminals: [{ refdes: "VIN", pin: "negative" }, { refdes: "RL", pin: "b" }] },
  ],
  analysis: analysis(20, 0.02),
} as const

export const amplifierAssignmentFrontierCases = Schema.decodeUnknownSync(
  Schema.Array(CircuitBenchmarkCaseSchema),
)([
  {
    id: "frontier-image1-class-a-ce-amplifier",
    title: "Image 1 class-A common-emitter amplifier",
    prompt: "Recreate the photographed +15 V voltage-divider-biased common-emitter amplifier using R1=68 kOhm, R2=27 kOhm, RC=3.9 kOhm, RE=2.2 kOhm, RL=3.9 kOhm, CIN=1 uF, COUT=10 uF, and CE=100 uF. Drive it with 10 mV peak at 1 kHz, preserve CLASS_A_INPUT, CLASS_A_BASE, CLASS_A_EMITTER, CLASS_A_COLLECTOR, CLASS_A_OUT, VCC, and GND, then simulate and report its bias, intrinsic emitter resistance, voltage gain, phase, operation, tradeoffs, and a suitable household use.",
    smoke: false,
    graph: imageClassACommonEmitterGraph,
    expected: expected(
      ["GND", "VCC", "CLASS_A_INPUT", "CLASS_A_BASE", "CLASS_A_EMITTER", "CLASS_A_COLLECTOR", "CLASS_A_OUT"],
      [
        { signalName: "V(CLASS_A_OUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(2.10125, 0.04) },
        { signalName: "V(CLASS_A_OUT)", metric: "average", startFraction: 0.5, expected: approximate(0, 0.01) },
        { signalName: "I(QA.E)", metric: "average", startFraction: 0.5, expected: approximate(-0.00148625, 0.00002) },
      ],
    ),
  },
  {
    id: "frontier-image2-class-b-push-pull",
    title: "Image 2 class-B complementary push-pull",
    prompt: "Derive a class-B complementary emitter follower from the photographed +/-15 V, 30 Ohm power stage by removing diode bias and driving both transistor bases directly with one 14 V-peak, 1 kHz input. Preserve DRIVE, CLASS_B_OUT, VCC, VEE, and GND; simulate and report output span, crossover dead band, operation, tradeoffs, and a suitable household use.",
    smoke: false,
    graph: imageClassBPushPullGraph,
    expected: expected(
      ["GND", "VCC", "VEE", "DRIVE", "CLASS_B_OUT"],
      [
        { signalName: "V(CLASS_B_OUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(26.20196, 0.06) },
        { signalName: "V(CLASS_B_OUT)", metric: "minimum", startFraction: 0.5, expected: approximate(-13.10098, 0.04) },
        { signalName: "V(CLASS_B_OUT)", metric: "maximum", startFraction: 0.5, expected: approximate(13.10098, 0.04) },
      ],
    ),
  },
  {
    id: "frontier-image2-class-ab-push-pull",
    title: "Image 2 diode-biased class-AB push-pull",
    prompt: "Recreate the photographed +/-15 V complementary class-AB stage with two 510 Ohm rail-bias resistors, two DDEFAULT bias diodes, one beta-100 NPN/PNP pair, a 30 Ohm load, and a 14 V-peak 1 kHz drive at the diode midpoint. Preserve DRIVE, AB_N_BASE, AB_P_BASE, CLASS_AB_OUT, VCC, VEE, and GND; simulate and report clipping, crossover behavior, operation, tradeoffs, and a suitable household use.",
    smoke: false,
    graph: imageClassAbPushPullGraph,
    expected: expected(
      ["GND", "VCC", "VEE", "DRIVE", "AB_N_BASE", "AB_P_BASE", "CLASS_AB_OUT"],
      [
        { signalName: "V(CLASS_AB_OUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(24.27151, 0.06) },
        { signalName: "V(CLASS_AB_OUT)", metric: "minimum", startFraction: 0.5, expected: approximate(-12.13576, 0.04) },
        { signalName: "V(CLASS_AB_OUT)", metric: "maximum", startFraction: 0.5, expected: approximate(12.13576, 0.04) },
      ],
    ),
  },
  {
    id: "frontier-derived-class-c-tuned-amplifier",
    title: "Derived class-C resonant BJT amplifier",
    prompt: "Build a class-C NPN stage on +12 V using a -0.4 V DC base offset plus 1.5 V-peak 20 kHz drive through 470 Ohm. Tune a parallel collector tank with 1 mH, 63.325 nF, and 1 kOhm damping to 20 kHz. Preserve CLASS_C_DRIVE, CLASS_C_BASE, CLASS_C_OUT, VCC, and GND; simulate and report conduction duty, resonant output, operation, tradeoffs, and a suitable household RF use.",
    smoke: false,
    graph: derivedClassCTunedGraph,
    expected: expected(
      ["GND", "VCC", "CLASS_C_DRIVE", "CLASS_C_BASE", "CLASS_C_OUT"],
      [
        { signalName: "V(CLASS_C_OUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(23.6024, 0.12) },
        { signalName: "V(CLASS_C_OUT)", metric: "average", startFraction: 0.5, expected: approximate(12, 0.03) },
        { signalName: "I(QC.C)", metric: "average", startFraction: 0.5, expected: approximate(0.00623213, 0.0001) },
      ],
    ),
  },
  {
    id: "frontier-derived-class-d-pwm-stage",
    title: "Derived class-D complementary PWM power stage",
    prompt: "Build a single-supply inverting class-D power stage with a 12 V rail, one 0-to-12 V 20 kHz 40%-high PWM source driving the shared gates of complementary P/N MOSFETs, and a 220 uH plus 10 uF LC output filter driving 8 Ohm. Preserve PWM_GATE, CLASS_D_SWITCH, CLASS_D_OUT, VDD, and GND; simulate and report switch-node levels, explain why the high-side output duty is the complementary 60%, then report filtered average/ripple, operation, tradeoffs, and a suitable household use.",
    smoke: false,
    graph: derivedClassDPwmGraph,
    expected: expected(
      ["GND", "VDD", "PWM_GATE", "CLASS_D_SWITCH", "CLASS_D_OUT"],
      [
        { signalName: "V(CLASS_D_SWITCH)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(12.13023, 0.08) },
        { signalName: "V(CLASS_D_OUT)", metric: "average", startFraction: 0.5, expected: approximate(7.01071, 0.06) },
        { signalName: "V(CLASS_D_OUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.42751, 0.06) },
      ],
    ),
  },
  {
    id: "frontier-image3-r5-zero-offset",
    title: "Image 3 R5-adjusted class-AB driver",
    prompt: "Recreate the photographed +/-9 V class-AB stage: 10 kOhm R1, 68 kOhm R2, adjustable R5 up to 5 kOhm over 10 kOhm R3, 2.7 kOhm R4, two DDEFAULT bias diodes, a 2N3904-like common-emitter driver, complementary output pair, 330 Ohm load, and 1 uF input coupling. Adjust R5 so OUTPUT averages 0 V, preserve all named bias nodes, simulate, and report the selected R5, DC offset, output, operation, and adjustment method.",
    smoke: false,
    graph: imageR5ZeroOffsetGraph,
    expected: expected(
      ["GND", "VCC", "VEE", "INPUT", "DRIVER_BASE", "DRIVER_EMITTER", "UPPER_BASE", "DIODE_MID", "LOWER_BASE", "OUTPUT"],
      [
        { signalName: "V(OUTPUT)", metric: "average", startFraction: 0.5, expected: approximate(0, 0.002) },
        { signalName: "V(OUTPUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.48323, 0.015) },
        { signalName: "V(DRIVER_BASE)", metric: "average", startFraction: 0.5, expected: approximate(-6.0157, 0.015) },
      ],
    ),
  },
])

const netVoltage = (netName: string) => ({ _tag: "NetVoltage", netName })
const componentCurrent = (refdes: string, terminal: string) => ({
  _tag: "ComponentCurrent",
  refdes,
  terminal,
})

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
  retrievedAt: "2026-09-02",
  claimsSha256,
  claims: [claims],
})

const commonEmitterReference = source(
  "adi-class-a-common-emitter",
  "Analog Devices University Wiki — Class A NPN common-emitter amplifier",
  "https://wiki.analog.com/university/courses/engineering_discovery/lab_10",
  "At room temperature a BJT intrinsic emitter resistance is approximately the thermal voltage divided by quiescent collector current; Analog Devices gives VT as about 26 mV and explains that a common-emitter stage inverts its output by 180 degrees.",
  "a1b51e75b5d328f3bee09526cdf10dffc6c05c42f2c0e7e99338eb5a7afbe6ad",
)

const amplifierClassesReference = source(
  "adi-power-amplifier-classes",
  "Analog Devices — Power Amplifier glossary",
  "https://www.analog.com/en/resources/glossary/power-amplifier.html",
  "Power-amplifier classes A, AB, B, and C are distinguished by conduction angle: A conducts for 360 degrees, AB for 180 to 360 degrees, B for 180 degrees, and C for less than 180 degrees; Class D instead uses PWM rail-to-rail switching.",
  "7b98aac839fb9d2e995033d58c6b25a348bb0c89b079eb91d5dd603f1696798e",
)

const classAbReference = source(
  "adi-class-b-ab-crossover",
  "Analog Devices University Wiki — Push-pull Class B and Class AB amplifiers",
  "https://wiki.analog.com/university/courses/engineering_discovery/lab_14",
  "A complementary Class-B emitter follower has crossover distortion around zero because neither BJT conducts until its base-emitter junction is forward biased; diode or transistor level shifting toward Class AB reduces that dead zone but introduces quiescent current and thermal-bias concerns.",
  "a9eae08bb66b5e22a4dc12bd510372b6a00dd19294718c5b5d31ebf81cffe4bf",
)

const classDReference = source(
  "ti-class-d-lc-filter",
  "Texas Instruments SLOA119B — Class-D LC Filter Design",
  "https://www.ti.com/lit/pdf/sloa119",
  "A Class-D stage produces high-frequency PWM switching content; an LC low-pass output filter attenuates switching components and supports audio delivery and EMI control, while filter selection affects efficiency, cost, and performance.",
  "1fabfb21be902131b2396dd95be70f1a7082ea244342896aec4f7444a8281b1d",
)

const midpointReference = source(
  "adi-push-pull-quiescent-midpoint",
  "Analog Devices University Wiki — Three-stage push-pull amplifier",
  "https://wiki.analog.com/university/courses/alm1k/alm-lab-mstageamp",
  "A push-pull amplifier should have its quiescent output centered at the supply midpoint; the DC output is monitored while the bias adjustment is set, before judging the signal waveform.",
  "3cbe991db43915f5f87cba833cecd6cb543633fd49eee72069680d4a4760d5a4",
)

export const amplifierAssignmentIntentCases = Schema.decodeUnknownSync(
  Schema.Array(IntentCaseSchema),
)([
  {
    id: "intent-image1-class-a-ce-amplifier",
    title: "Derived Image 1 class-A common-emitter analysis",
    topologyMode: "exact",
    prompt: "Recreate the photographed +15 V voltage-divider-biased class-A common-emitter circuit with its stated resistors and coupling/bypass capacitors. Drive it with a small 100 Hz sine, preserve the named base, emitter, collector, input, and output nets, simulate after settling, calculate r'e from simulated quiescent emitter current, and explain the measured output, operation, advantages, disadvantages, and a sensible household-appliance use.",
    questions: [
      {
        id: "class-a-bias-and-re",
        prompt: "What quiescent emitter current and derived intrinsic emitter resistance r'e does the simulation establish?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-class-a-emitter-current", "derived-class-a-intrinsic-emitter-resistance", "adi-class-a-common-emitter"],
      },
      {
        id: "class-a-output-operation",
        prompt: "What output span, voltage gain, and phase establish class-A common-emitter operation?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-class-a-output-span", "derived-class-a-gain", "derived-class-a-phase", "adi-class-a-common-emitter"],
      },
      {
        id: "class-a-tradeoffs-appliance",
        prompt: "What are the main class-A pros and cons, and which household appliance is a defensible use with a reason tied to those properties?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["adi-power-amplifier-classes", "derived-class-a-output-span"],
      },
    ],
    references: [commonEmitterReference, amplifierClassesReference],
    oracleGraph: imageClassACommonEmitterGraph,
    expected: expected(["GND", "VCC", "CLASS_A_INPUT", "CLASS_A_BASE", "CLASS_A_EMITTER", "CLASS_A_COLLECTOR", "CLASS_A_OUT"], []),
    requiredComponentTypes: imageClassACommonEmitterGraph.components.map(({ type }) => type),
    minimumDurationMs: 10,
    derivedObservations: [
      {
        _tag: "SignalMetric",
        id: "derived-class-a-emitter-current",
        signal: componentCurrent("QA", "emitter"),
        metric: "average",
        startFraction: 0.5,
        expected: approximate(-0.00148625, 0.00002),
      },
      {
        _tag: "BjtIntrinsicEmitterResistance",
        id: "derived-class-a-intrinsic-emitter-resistance",
        emitterCurrent: componentCurrent("QA", "emitter"),
        startFraction: 0.5,
        thermalVoltageVolts: 0.026,
        expectedOhms: approximate(17.494, 0.4),
      },
      {
        _tag: "SignalMetricRange",
        id: "derived-class-a-output-span",
        signal: netVoltage("CLASS_A_OUT"),
        metric: "peakToPeak",
        startFraction: 0.5,
        minimumExpected: 2.05,
        maximumExpected: 2.15,
      },
      {
        _tag: "Gain",
        id: "derived-class-a-gain",
        input: netVoltage("CLASS_A_INPUT"),
        output: netVoltage("CLASS_A_OUT"),
        startFraction: 0.5,
        expectedRatio: approximate(105.27, 3),
      },
      {
        _tag: "PhaseDifference",
        id: "derived-class-a-phase",
        reference: netVoltage("CLASS_A_INPUT"),
        compared: netVoltage("CLASS_A_OUT"),
        frequencyHertz: 1_000,
        startFraction: 0.5,
        expectedDegrees: approximate(-170, 6),
      },
    ],
  },
  {
    id: "intent-image2-class-b-push-pull",
    title: "Derived Image 2 class-B push-pull analysis",
    topologyMode: "exact",
    prompt: "Derive the unbiased complementary class-B emitter follower from the photographed +/-15 V power stage, drive both bases directly with the same 14 V-peak 1 kHz input, retain the 30 Ohm load and named rails/output, simulate, and explain the output, conduction operation, crossover behavior, advantages, disadvantages, and a suitable household-appliance use.",
    questions: [
      {
        id: "class-b-output",
        prompt: "What input/output spans and measured tracking gain characterize this class-B stage?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-class-b-drive-span", "derived-class-b-output-span", "derived-class-b-gain"],
      },
      {
        id: "class-b-operation-tradeoffs-appliance",
        prompt: "How does class-B push-pull operation create its efficiency/distortion tradeoff, and which household appliance is defensible for it?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["adi-power-amplifier-classes", "adi-class-b-ab-crossover", "derived-class-b-output-span"],
      },
    ],
    references: [amplifierClassesReference, classAbReference],
    oracleGraph: imageClassBPushPullGraph,
    expected: expected(["GND", "VCC", "VEE", "DRIVE", "CLASS_B_OUT"], []),
    requiredComponentTypes: imageClassBPushPullGraph.components.map(({ type }) => type),
    minimumDurationMs: 5,
    derivedObservations: [
      { _tag: "SignalMetricRange", id: "derived-class-b-drive-span", signal: netVoltage("DRIVE"), metric: "peakToPeak", startFraction: 0.5, minimumExpected: 27.8, maximumExpected: 28.2 },
      { _tag: "SignalMetricRange", id: "derived-class-b-output-span", signal: netVoltage("CLASS_B_OUT"), metric: "peakToPeak", startFraction: 0.5, minimumExpected: 26.1, maximumExpected: 26.35 },
      { _tag: "Gain", id: "derived-class-b-gain", input: netVoltage("DRIVE"), output: netVoltage("CLASS_B_OUT"), startFraction: 0.5, expectedRatio: approximate(0.936, 0.01) },
    ],
  },
  {
    id: "intent-image2-class-ab-push-pull",
    title: "Derived Image 2 class-AB push-pull analysis",
    topologyMode: "exact",
    prompt: "Recreate the photographed diode-biased complementary class-AB stage on +/-15 V with 510 Ohm rail resistors, two bias diodes, a 30 Ohm load, and a 14 V-peak 1 kHz midpoint drive. Preserve both base nets and the output, simulate, and explain measured clipping/output, bias operation, crossover improvement, advantages, disadvantages, and a suitable household-appliance use.",
    questions: [
      {
        id: "class-ab-output-bias",
        prompt: "What output span and two diode-derived base offsets characterize this stage?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-class-ab-output-span", "derived-class-ab-upper-bias", "derived-class-ab-lower-bias"],
      },
      {
        id: "class-ab-operation-tradeoffs-appliance",
        prompt: "Why does class AB reduce crossover distortion, what efficiency/thermal tradeoff remains, and which household appliance fits it?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["adi-class-b-ab-crossover", "adi-power-amplifier-classes", "derived-class-ab-output-span"],
      },
    ],
    references: [amplifierClassesReference, classAbReference],
    oracleGraph: imageClassAbPushPullGraph,
    expected: expected(["GND", "VCC", "VEE", "DRIVE", "AB_N_BASE", "AB_P_BASE", "CLASS_AB_OUT"], []),
    requiredComponentTypes: imageClassAbPushPullGraph.components.map(({ type }) => type),
    minimumDurationMs: 5,
    derivedObservations: [
      { _tag: "SignalMetricRange", id: "derived-class-ab-output-span", signal: netVoltage("CLASS_AB_OUT"), metric: "peakToPeak", startFraction: 0.5, minimumExpected: 24.1, maximumExpected: 24.4 },
      { _tag: "MeanDifference", id: "derived-class-ab-upper-bias", minuend: netVoltage("AB_N_BASE"), subtrahend: netVoltage("DRIVE"), startFraction: 0.5, expected: approximate(0.55, 0.2) },
      { _tag: "MeanDifference", id: "derived-class-ab-lower-bias", minuend: netVoltage("DRIVE"), subtrahend: netVoltage("AB_P_BASE"), startFraction: 0.5, expected: approximate(0.55, 0.2) },
    ],
  },
  {
    id: "intent-derived-class-c-tuned-amplifier",
    title: "Derived class-C resonant-amplifier analysis",
    topologyMode: "exact",
    prompt: "Build the below-cutoff NPN class-C circuit with a 20 kHz parallel collector tank, preserve drive/base/output, simulate enough cycles to settle, and explain the collector-current duty, resonant output, nonlinear operation, advantages, disadvantages, and a suitable household RF appliance.",
    questions: [
      {
        id: "class-c-output-conduction",
        prompt: "What measured conduction fraction, output span, and output frequency demonstrate tuned class-C behavior?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-class-c-conduction-fraction", "derived-class-c-output-span", "derived-class-c-output-frequency"],
      },
      {
        id: "class-c-operation-tradeoffs-appliance",
        prompt: "Why does sub-180-degree conduction require a tuned load, what are the main tradeoffs, and which household RF appliance fits?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["adi-power-amplifier-classes", "derived-class-c-conduction-fraction", "derived-class-c-output-frequency"],
      },
    ],
    references: [amplifierClassesReference],
    oracleGraph: derivedClassCTunedGraph,
    expected: expected(["GND", "VCC", "CLASS_C_DRIVE", "CLASS_C_BASE", "CLASS_C_OUT"], []),
    requiredComponentTypes: derivedClassCTunedGraph.components.map(({ type }) => type),
    minimumDurationMs: 0.5,
    derivedObservations: [
      { _tag: "HighLevelFraction", id: "derived-class-c-conduction-fraction", signal: componentCurrent("QC", "collector"), startFraction: 0.5, minimumHighFraction: 0.05, maximumHighFraction: 0.45 },
      { _tag: "SignalMetricRange", id: "derived-class-c-output-span", signal: netVoltage("CLASS_C_OUT"), metric: "peakToPeak", startFraction: 0.5, minimumExpected: 23.3, maximumExpected: 23.9 },
      { _tag: "Frequency", id: "derived-class-c-output-frequency", signal: netVoltage("CLASS_C_OUT"), startFraction: 0.5, expectedHertz: approximate(20_000, 1_500) },
    ],
  },
  {
    id: "intent-derived-class-d-pwm-stage",
    title: "Derived class-D PWM-stage analysis",
    topologyMode: "exact",
    prompt: "Build the 12 V shared-gate complementary MOSFET class-D inverter driven by a 20 kHz, 40%-high PWM waveform and followed by the specified LC/load filter. Preserve gate, switch, and filtered output, simulate after settling, and explain the complementary 60% high-side output duty, rail switching, filtered output, advantages, disadvantages, and a suitable household-appliance use.",
    questions: [
      {
        id: "class-d-switch-filter-output",
        prompt: "What gate-high occupancy, complementary high-side output duty, switch span, filtered level, and ripple demonstrate inverting switching and filtering?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-class-d-pwm-fraction", "derived-class-d-switch-span", "derived-class-d-output-average", "derived-class-d-output-ripple", "derived-class-d-filter-reduction"],
      },
      {
        id: "class-d-operation-tradeoffs-appliance",
        prompt: "How does Class D obtain efficiency, what switching/filter/EMI tradeoffs remain, and which household appliance fits?",
        answerKind: "qualitative",
        requiredEvidenceRefs: ["adi-power-amplifier-classes", "ti-class-d-lc-filter", "derived-class-d-filter-reduction"],
      },
    ],
    references: [amplifierClassesReference, classDReference],
    oracleGraph: derivedClassDPwmGraph,
    expected: expected(["GND", "VDD", "PWM_GATE", "CLASS_D_SWITCH", "CLASS_D_OUT"], []),
    requiredComponentTypes: derivedClassDPwmGraph.components.map(({ type }) => type),
    minimumDurationMs: 1,
    derivedObservations: [
      { _tag: "HighLevelFraction", id: "derived-class-d-pwm-fraction", signal: netVoltage("PWM_GATE"), startFraction: 0.5, minimumHighFraction: 0.36, maximumHighFraction: 0.44 },
      { _tag: "SignalMetricRange", id: "derived-class-d-switch-span", signal: netVoltage("CLASS_D_SWITCH"), metric: "peakToPeak", startFraction: 0.5, minimumExpected: 11.8, maximumExpected: 12.5 },
      { _tag: "SignalMetricRange", id: "derived-class-d-output-average", signal: netVoltage("CLASS_D_OUT"), metric: "average", startFraction: 0.5, minimumExpected: 6.9, maximumExpected: 7.15 },
      { _tag: "SignalMetricRange", id: "derived-class-d-output-ripple", signal: netVoltage("CLASS_D_OUT"), metric: "peakToPeak", startFraction: 0.5, minimumExpected: 0.3, maximumExpected: 0.6 },
      { _tag: "SignalMetricComparison", id: "derived-class-d-filter-reduction", left: netVoltage("CLASS_D_SWITCH"), right: netVoltage("CLASS_D_OUT"), metric: "peakToPeak", startFraction: 0.5, relation: "greaterThan", minimumDifference: 10 },
    ],
  },
  {
    id: "intent-image3-r5-zero-offset",
    title: "Derived Image 3 R5 zero-offset adjustment",
    topologyMode: "exact",
    prompt: "Recreate the photographed +/-9 V common-emitter-driven complementary output stage with R5 as the adjustable 0-to-5 kOhm bias leg. Tune R5 while monitoring DC OUTPUT until the quiescent midpoint is 0 V, retain the photographed values and named bias nodes, simulate with the AC input, and report the selected R5, residual offset, output, operation, and adjustment method.",
    questions: [
      {
        id: "r5-optimal-setting",
        prompt: "Which R5 value is selected, and what measured mean output proves the DC setting is optimal?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["project.circuit.components", "derived-r5-output-offset", "adi-push-pull-quiescent-midpoint"],
      },
      {
        id: "r5-output-operation",
        prompt: "What output span and driver-base level result, and how should R5 be adjusted in practice?",
        answerKind: "numeric",
        requiredEvidenceRefs: ["derived-r5-output-span", "derived-r5-driver-base", "adi-push-pull-quiescent-midpoint"],
      },
    ],
    references: [midpointReference, classAbReference],
    oracleGraph: imageR5ZeroOffsetGraph,
    expected: expected(["GND", "VCC", "VEE", "INPUT", "DRIVER_BASE", "DRIVER_EMITTER", "UPPER_BASE", "DIODE_MID", "LOWER_BASE", "OUTPUT"], []),
    requiredComponentTypes: imageR5ZeroOffsetGraph.components.map(({ type }) => type),
    minimumDurationMs: 10,
    derivedObservations: [
      { _tag: "SignalMetric", id: "derived-r5-output-offset", signal: netVoltage("OUTPUT"), metric: "average", startFraction: 0.5, expected: approximate(0, 0.002) },
      { _tag: "SignalMetric", id: "derived-r5-output-span", signal: netVoltage("OUTPUT"), metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.48323, 0.015) },
      { _tag: "SignalMetric", id: "derived-r5-driver-base", signal: netVoltage("DRIVER_BASE"), metric: "average", startFraction: 0.5, expected: approximate(-6.0157, 0.015) },
    ],
  },
])
