import { Schema } from "effect"
import { CircuitBenchmarkCaseSchema } from "../schema"
import { amplifierAssignmentFrontierCases } from "./amplifier-assignment-cases"

const analysis = (durationMs = 10, timeStepMs = 0.1) => ({
  durationMs,
  timeStepMs,
})

const approximate = (value: number, absoluteTolerance: number) => ({
  value,
  absoluteTolerance,
})

const expected = ({
  requiredNetNames,
  netVoltages = [],
  componentMeasurements = [],
  traces = [],
  traceRanges = [],
}: {
  readonly requiredNetNames: ReadonlyArray<string>
  readonly netVoltages?: ReadonlyArray<unknown>
  readonly componentMeasurements?: ReadonlyArray<unknown>
  readonly traces?: ReadonlyArray<unknown>
  readonly traceRanges?: ReadonlyArray<unknown>
}) => ({
  requiredNetNames,
  statuses: ["success"],
  netVoltages,
  componentMeasurements,
  traces,
  traceRanges,
  diagnosticIncludes: [],
})

const mosfetProps = (
  thresholdVolts: number,
  transconductanceAmpsPerVoltSquared: number,
  channelLengthModulationPerVolt: number,
) => ({
  thresholdVolts,
  transconductanceAmpsPerVoltSquared,
  channelLengthModulationPerVolt,
})

const diodeProps = (
  saturationCurrentAmps: number,
  emissionCoefficient: number,
  seriesResistanceOhms: number,
) => ({
  model: "DDEFAULT",
  saturationCurrentAmps,
  emissionCoefficient,
  seriesResistanceOhms,
})

const zenerProps = (
  breakdownVolts: number,
  breakdownCurrentAmps: number,
  saturationCurrentAmps: number,
  emissionCoefficient: number,
  dynamicResistanceOhms: number,
) => ({
  breakdownVolts,
  breakdownCurrentAmps,
  saturationCurrentAmps,
  emissionCoefficient,
  dynamicResistanceOhms,
})

const diodeForwardVolts = (
  currentAmps: number,
  saturationCurrentAmps: number,
  emissionCoefficient: number,
  seriesResistanceOhms = 0,
) =>
  emissionCoefficient *
    0.02586491700648847 *
    Math.log(currentAmps / saturationCurrentAmps + 1) +
  currentAmps * seriesResistanceOhms

const bjtProps = (
  saturationCurrentAmps: number,
  forwardEmissionCoefficient: number,
  beta = 100,
  earlyVoltageVolts = 100,
) => ({
  beta,
  earlyVoltageVolts,
  saturationCurrentAmps,
  forwardEmissionCoefficient,
})

const diodeConnectedBjtVolts = (
  saturationCurrentAmps: 1e-15 | 1e-13,
  forwardEmissionCoefficient: number,
  currentAmps: 0.0001 | 0.001,
) => {
  const unitEmissionVolts =
    saturationCurrentAmps === 1e-15
      ? currentAmps === 0.0001
        ? 0.65486053
        : 0.7144167
      : currentAmps === 0.0001
        ? 0.53574819
        : 0.59530436
  return unitEmissionVolts * forwardEmissionCoefficient
}

const saturatedMosfetCurrent = (
  transconductanceAmpsPerVoltSquared: number,
  overdriveVolts: number,
  channelLengthModulationPerVolt: number,
  drainSupplyMagnitudeVolts: number,
  senseResistanceOhms: number,
) => {
  const zeroModulationCurrent =
    (transconductanceAmpsPerVoltSquared / 2) * overdriveVolts ** 2
  return (
    (zeroModulationCurrent *
      (1 +
        channelLengthModulationPerVolt * drainSupplyMagnitudeVolts)) /
    (1 +
      zeroModulationCurrent *
        channelLengthModulationPerVolt *
        senseResistanceOhms)
  )
}

const ladderSeriesOhms = [
  100, 120, 150, 180, 220, 270, 330, 390, 470, 560, 680, 820, 1_000, 1_200,
  1_500,
] as const
const ladderShuntOhms = [
  2_000, 2_400, 3_000, 3_600, 4_400, 5_400, 6_600, 7_800, 9_400, 11_200,
  13_600, 16_400, 20_000, 24_000, 30_000,
] as const

function loadedLadderCase(sectionCount: 8 | 15) {
  const seriesOhms = ladderSeriesOhms.slice(0, sectionCount)
  const shuntOhms = ladderShuntOhms.slice(0, sectionCount)
  const nodeNames = Array.from(
    { length: sectionCount },
    (_, index) => `N${index + 1}`,
  )
  const voltages = loadedLadderVoltages(24, seriesOhms, shuntOhms)
  const sections = seriesOhms
    .map(
      (series, index) =>
        `section ${index + 1}: ${series} Ohm series and ${shuntOhms[index]} Ohm shunt at ${nodeNames[index]}`,
    )
    .join("; ")
  return {
    id: `frontier-${sectionCount === 8 ? "eight" : "fifteen"}-section-loaded-ladder`,
    title: `${sectionCount}-section loaded resistor ladder`,
    prompt: `Build a ${sectionCount}-section loaded resistor ladder driven by 24 V. Each section has one series resistor from the preceding node and one shunt resistor from its node to GND. Preserve every node name N1 through N${sectionCount}. Values are ${sections}. Simulate and report all ${sectionCount} node voltages with evidence.`,
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 24 } },
        ...seriesOhms.map((resistanceOhms, index) => ({
          type: "resistor",
          refdes: `RS${index + 1}`,
          props: { resistanceOhms },
        })),
        ...shuntOhms.map((resistanceOhms, index) => ({
          type: "resistor",
          refdes: `RL${index + 1}`,
          props: { resistanceOhms },
        })),
      ],
      nets: [
        {
          name: "VIN",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "RS1", pin: "a" },
          ],
        },
        ...nodeNames.map((name, index) => ({
          name,
          terminals: [
            { refdes: `RS${index + 1}`, pin: "b" },
            ...(index + 1 === sectionCount
              ? []
              : [{ refdes: `RS${index + 2}`, pin: "a" }]),
            { refdes: `RL${index + 1}`, pin: "a" },
          ],
        })),
        {
          name: "GND",
          terminals: [
            { refdes: "V1", pin: "negative" },
            ...shuntOhms.map((_, index) => ({
              refdes: `RL${index + 1}`,
              pin: "b",
            })),
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", ...nodeNames],
      netVoltages: nodeNames.map((name, index) => ({
        name,
        expected: approximate(
          voltages[index] ?? 0,
          Math.max(0.005, (voltages[index] ?? 0) * 0.002),
        ),
      })),
    }),
  }
}

function loadedLadderVoltages(
  sourceVolts: number,
  seriesOhms: ReadonlyArray<number>,
  shuntOhms: ReadonlyArray<number>,
): ReadonlyArray<number> {
  const equivalent = Array<number>(seriesOhms.length)
  for (let index = seriesOhms.length - 1; index >= 0; index -= 1) {
    const shunt = shuntOhms[index] ?? Number.POSITIVE_INFINITY
    const downstream =
      index + 1 === seriesOhms.length
        ? Number.POSITIVE_INFINITY
        : (seriesOhms[index + 1] ?? 0) + (equivalent[index + 1] ?? 0)
    equivalent[index] =
      downstream === Number.POSITIVE_INFINITY
        ? shunt
        : (shunt * downstream) / (shunt + downstream)
  }
  const voltages: number[] = []
  let input = sourceVolts
  for (let index = 0; index < seriesOhms.length; index += 1) {
    const load = equivalent[index] ?? 0
    const voltage = input * (load / ((seriesOhms[index] ?? 0) + load))
    voltages.push(voltage)
    input = voltage
  }
  return voltages
}

type MeshResistor = {
  readonly refdes: string
  readonly from: string
  readonly to: string
  readonly ohms: number
}

function resistorMeshCase() {
  const rows = 4
  const columns = 5
  const groundNode = "N45"
  const nodeNames = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => `N${row + 1}${column + 1}`),
  ).flat()
  const horizontal: MeshResistor[] = Array.from(
    { length: rows },
    (_, row) =>
      Array.from({ length: columns - 1 }, (_, column) => ({
        refdes: `H${row + 1}${column + 1}`,
        from: `N${row + 1}${column + 1}`,
        to: `N${row + 1}${column + 2}`,
        ohms: (row + 1) * 1_000 + (column + 1) * 100,
      })),
  ).flat()
  const vertical: MeshResistor[] = Array.from(
    { length: rows - 1 },
    (_, row) =>
      Array.from({ length: columns }, (_, column) => ({
        refdes: `V${row + 1}${column + 1}`,
        from: `N${row + 1}${column + 1}`,
        to: `N${row + 2}${column + 1}`,
        ohms: (row + 1) * 1_000 + (column + 1) * 100 + 50,
      })),
  ).flat()
  const resistors = [...horizontal, ...vertical]
  const voltages = solveResistorNetwork(
    nodeNames.filter((name) => name !== groundNode),
    resistors,
    { N11: 12, [groundNode]: 0 },
  )
  const observedNodes = ["N15", "N22", "N33", "N41"]
  return {
    id: "frontier-four-by-five-resistor-mesh",
    title: "Four-by-five resistive mesh",
    prompt:
      "Build a 4-row by 5-column resistive mesh with nodes named N11 through N45. Treat N45 as GND and connect a 12 V source from N11 to GND. For every horizontal neighbor, add Hrc from Nrc to Nr(c+1) with resistance (1000*r + 100*c) Ohms. For every vertical neighbor, add Vrc from Nrc to N(r+1)c with resistance (1000*r + 100*c + 50) Ohms. Thus H11 is 1100 Ohms and V11 is 1150 Ohms. Preserve all node names, simulate, and report N15, N22, N33, and N41 with evidence.",
    smoke: false,
    graph: {
      groundNet: groundNode,
      components: [
        { type: "dc-voltage-source", refdes: "VS", props: { voltageVolts: 12 } },
        ...resistors.map((resistor) => ({
          type: "resistor",
          refdes: resistor.refdes,
          props: { resistanceOhms: resistor.ohms },
        })),
      ],
      nets: nodeNames.map((name) => ({
        name,
        terminals: [
          ...(name === "N11" ? [{ refdes: "VS", pin: "positive" }] : []),
          ...(name === groundNode ? [{ refdes: "VS", pin: "negative" }] : []),
          ...resistors.flatMap((resistor) => [
            ...(resistor.from === name
              ? [{ refdes: resistor.refdes, pin: "a" }]
              : []),
            ...(resistor.to === name
              ? [{ refdes: resistor.refdes, pin: "b" }]
              : []),
          ]),
        ],
      })),
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        ...nodeNames.filter((name) => name !== groundNode),
      ],
      netVoltages: observedNodes.map((name) => ({
        name,
        expected: approximate(voltages[name] ?? 0, 0.02),
      })),
    }),
  }
}

function solveResistorNetwork(
  nodeNames: ReadonlyArray<string>,
  resistors: ReadonlyArray<MeshResistor>,
  fixedVoltages: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  const unknownNames = nodeNames.filter(
    (name) => fixedVoltages[name] === undefined,
  )
  const indexByName = new Map(
    unknownNames.map((name, index) => [name, index]),
  )
  const matrix = unknownNames.map(() => Array(unknownNames.length).fill(0))
  const rightHandSide = Array(unknownNames.length).fill(0)

  for (const resistor of resistors) {
    const conductance = 1 / resistor.ohms
    stampResistorNode(
      resistor.from,
      resistor.to,
      conductance,
      indexByName,
      fixedVoltages,
      matrix,
      rightHandSide,
    )
    stampResistorNode(
      resistor.to,
      resistor.from,
      conductance,
      indexByName,
      fixedVoltages,
      matrix,
      rightHandSide,
    )
  }

  const solved = solveLinearSystem(matrix, rightHandSide)
  return {
    ...fixedVoltages,
    ...Object.fromEntries(unknownNames.map((name, index) => [name, solved[index] ?? 0])),
  }
}

function stampResistorNode(
  node: string,
  peer: string,
  conductance: number,
  indexByName: ReadonlyMap<string, number>,
  fixedVoltages: Readonly<Record<string, number>>,
  matrix: number[][],
  rightHandSide: number[],
): void {
  const row = indexByName.get(node)
  if (row === undefined) return
  const matrixRow = matrix[row]
  if (matrixRow === undefined) return
  matrixRow[row] = (matrixRow[row] ?? 0) + conductance
  const peerColumn = indexByName.get(peer)
  if (peerColumn !== undefined) {
    matrixRow[peerColumn] = (matrixRow[peerColumn] ?? 0) - conductance
  } else {
    rightHandSide[row] =
      (rightHandSide[row] ?? 0) + conductance * (fixedVoltages[peer] ?? 0)
  }
}

function solveLinearSystem(matrix: number[][], values: number[]): number[] {
  const augmented = matrix.map((row, index) => [
    ...row,
    values[index] ?? 0,
  ])
  for (let pivot = 0; pivot < augmented.length; pivot += 1) {
    let pivotRow = pivot
    for (let row = pivot + 1; row < augmented.length; row += 1) {
      if (
        Math.abs(augmented[row]?.[pivot] ?? 0) >
        Math.abs(augmented[pivotRow]?.[pivot] ?? 0)
      ) {
        pivotRow = row
      }
    }
    const selected = augmented[pivotRow]
    const current = augmented[pivot]
    if (selected === undefined || current === undefined) continue
    augmented[pivot] = selected
    augmented[pivotRow] = current
    const divisor = augmented[pivot]?.[pivot] ?? 0
    for (let column = pivot; column <= augmented.length; column += 1) {
      const row = augmented[pivot]
      if (row !== undefined) row[column] = (row[column] ?? 0) / divisor
    }
    for (let row = 0; row < augmented.length; row += 1) {
      if (row === pivot) continue
      const factor = augmented[row]?.[pivot] ?? 0
      for (let column = pivot; column <= augmented.length; column += 1) {
        const target = augmented[row]
        const source = augmented[pivot]
        if (target !== undefined && source !== undefined) {
          target[column] = (target[column] ?? 0) - factor * (source[column] ?? 0)
        }
      }
    }
  }
  return augmented.map((row) => row.at(-1) ?? 0)
}

function splitRailReferenceCase() {
  return {
    id: "frontier-split-rail-reference",
    title: "Split rails around an aliased reference",
    prompt:
      "Build a split-rail circuit with +12 V and -5 V rails around an interior reference node named REF. Connect VHI positive to P and negative to REF; connect VLO positive to REF and negative to N, and declare REF as ground. Add a 1 kOhm load from P to N. Add a 1 kOhm plus 1 kOhm divider from P to REF with midpoint MIDP, and a 1 kOhm plus 1 kOhm divider from REF to N with midpoint MIDN. Preserve P, N, MIDP, and MIDN. Simulate and report all four node voltages with evidence.",
    smoke: false,
    graph: {
      groundNet: "REF",
      components: [
        { type: "dc-voltage-source", refdes: "VHI", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VLO", props: { voltageVolts: 5 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RP", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RPREF", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RNREF", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RN", props: { resistanceOhms: 1_000 } },
      ],
      nets: [
        {
          name: "P",
          terminals: [
            { refdes: "VHI", pin: "positive" },
            { refdes: "RLOAD", pin: "a" },
            { refdes: "RP", pin: "a" },
          ],
        },
        {
          name: "REF",
          terminals: [
            { refdes: "VHI", pin: "negative" },
            { refdes: "VLO", pin: "positive" },
            { refdes: "RPREF", pin: "b" },
            { refdes: "RNREF", pin: "a" },
          ],
        },
        {
          name: "N",
          terminals: [
            { refdes: "VLO", pin: "negative" },
            { refdes: "RLOAD", pin: "b" },
            { refdes: "RN", pin: "b" },
          ],
        },
        {
          name: "MIDP",
          terminals: [
            { refdes: "RP", pin: "b" },
            { refdes: "RPREF", pin: "a" },
          ],
        },
        {
          name: "MIDN",
          terminals: [
            { refdes: "RNREF", pin: "b" },
            { refdes: "RN", pin: "a" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "P", "N", "MIDP", "MIDN"],
      netVoltages: [
        { name: "P", expected: approximate(12, 0.02) },
        { name: "N", expected: approximate(-5, 0.02) },
        { name: "MIDP", expected: approximate(6, 0.02) },
        { name: "MIDN", expected: approximate(-2.5, 0.02) },
      ],
    }),
  }
}

function seriesRlcFilterCase() {
  const amplitudeVolts = 1
  const frequencyHertz = 100
  const resistanceOhms = 100
  const inductanceHenries = 0.01
  const capacitanceFarads = 0.00001
  const omega = 2 * Math.PI * frequencyHertz
  const capacitiveReactance = 1 / (omega * capacitanceFarads)
  const reactiveOhms = omega * inductanceHenries - capacitiveReactance
  const outputAmplitude =
    amplitudeVolts *
    (capacitiveReactance /
      Math.hypot(resistanceOhms, reactiveOhms))
  return {
    id: "frontier-series-rlc-filter",
    title: "Series RLC transient filter",
    prompt:
      "Build a series RLC filter driven by a 1 V peak, 100 Hz sine source. Connect V1 from VIN to GND, R1 100 Ohms from VIN to R_NODE, L1 10 mH from R_NODE to VOUT, and C1 10 uF from VOUT to GND. Preserve R_NODE and VOUT. Simulate for 100 ms with waveform evidence and report the VOUT peak-to-peak voltage.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        {
          type: "sine-voltage-source",
          refdes: "V1",
          props: { amplitudeVolts, frequencyHertz },
        },
        { type: "resistor", refdes: "R1", props: { resistanceOhms } },
        { type: "inductor", refdes: "L1", props: { inductanceHenries } },
        { type: "capacitor", refdes: "C1", props: { capacitanceFarads } },
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
      analysis: analysis(100, 0.05),
    },
    expected: expected({
      requiredNetNames: ["GND", "R_NODE", "VOUT"],
      traceRanges: [
        {
          signalName: "V(VOUT)",
          metric: "peakToPeak",
          expected: approximate(outputAmplitude * 2, 0.12),
        },
      ],
    }),
  }
}

function currentFedLedCase() {
  return {
    id: "frontier-current-fed-led",
    title: "Current-fed nonlinear LED chain",
    prompt:
      "Build a 10 mA DC current source feeding a 330 Ohm resistor and a red LED in series, returning to GND. Connect the current-source positive terminal to GND, its negative terminal to CURRENT_IN, R1 from CURRENT_IN to LED_A, and LED1 from LED_A to GND. Preserve CURRENT_IN and LED_A. Simulate and report both node voltages, resistor current, and resistor power with evidence.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-current-source", refdes: "I1", props: { currentAmps: 0.01 } },
        { type: "resistor", refdes: "R1", props: { resistanceOhms: 330 } },
        { type: "led", refdes: "LED1", props: { color: "red" } },
      ],
      nets: [
        {
          name: "GND",
          terminals: [
            { refdes: "I1", pin: "positive" },
            { refdes: "LED1", pin: "cathode" },
          ],
        },
        {
          name: "CURRENT_IN",
          terminals: [
            { refdes: "I1", pin: "negative" },
            { refdes: "R1", pin: "a" },
          ],
        },
        {
          name: "LED_A",
          terminals: [
            { refdes: "R1", pin: "b" },
            { refdes: "LED1", pin: "anode" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "CURRENT_IN", "LED_A"],
      netVoltages: [
        { name: "CURRENT_IN", expected: approximate(5.2, 0.35) },
        { name: "LED_A", expected: approximate(1.9, 0.25) },
      ],
      componentMeasurements: [
        { refdes: "R1", metric: "current", expected: approximate(0.01, 0.0002) },
        { refdes: "R1", metric: "power", expected: approximate(0.033, 0.001) },
      ],
    }),
  }
}

function dualFrequencyMixerCase() {
  const busVoltage = (timeSeconds: number) =>
    1.6 * Math.sin(2 * Math.PI * 50 * timeSeconds) +
    0.4 * Math.sin(2 * Math.PI * 120 * timeSeconds)
  const rangeSamples = Array.from({ length: 20_001 }, (_, index) =>
    busVoltage(index / 200_000),
  )
  const peakToPeak = Math.max(...rangeSamples) - Math.min(...rangeSamples)
  const observedSeconds = [0.105, 0.115, 0.125]
  return {
    id: "frontier-dual-frequency-mixer",
    title: "Two-frequency resistive mixer",
    prompt:
      "Build a two-frequency summing network. Use VLOW, a 4 V peak 50 Hz sine source from SLOW to GND, feeding BUS through RLOW 1 kOhm. Use VHIGH, a 2 V peak 120 Hz sine source from SHIGH to GND, feeding the same BUS through RHIGH 2 kOhm. Add RLOAD 1 kOhm from BUS to GND. Preserve SLOW, SHIGH, and BUS. Simulate for 200 ms with a 0.1 ms step or finer and report waveform evidence showing both source contributions at BUS.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        {
          type: "sine-voltage-source",
          refdes: "VLOW",
          props: { amplitudeVolts: 4, frequencyHertz: 50 },
        },
        {
          type: "sine-voltage-source",
          refdes: "VHIGH",
          props: { amplitudeVolts: 2, frequencyHertz: 120 },
        },
        { type: "resistor", refdes: "RLOW", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RHIGH", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
      ],
      nets: [
        {
          name: "SLOW",
          terminals: [
            { refdes: "VLOW", pin: "positive" },
            { refdes: "RLOW", pin: "a" },
          ],
        },
        {
          name: "SHIGH",
          terminals: [
            { refdes: "VHIGH", pin: "positive" },
            { refdes: "RHIGH", pin: "a" },
          ],
        },
        {
          name: "BUS",
          terminals: [
            { refdes: "RLOW", pin: "b" },
            { refdes: "RHIGH", pin: "b" },
            { refdes: "RLOAD", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VLOW", pin: "negative" },
            { refdes: "VHIGH", pin: "negative" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(200, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "SLOW", "SHIGH", "BUS"],
      traces: observedSeconds.map((atSeconds) => ({
        signalName: "V(BUS)",
        atSeconds,
        expected: approximate(busVoltage(atSeconds), 0.05),
      })),
      traceRanges: [
        {
          signalName: "V(BUS)",
          metric: "peakToPeak",
          expected: approximate(peakToPeak, 0.08),
        },
      ],
    }),
  }
}

function biasedDualDiodeLimiterCase() {
  return {
    id: "frontier-biased-dual-diode-limiter",
    title: "Biased dual-diode limiter",
    prompt:
      "Build a biased two-sided diode limiter. Create a +3 V rail POS and a -3 V rail NEG around an interior reference REF, and declare REF as ground. Drive VIN with a 10 V peak 50 Hz sine source referenced to REF, then connect VIN through RS 1 kOhm to OUT and RLOAD 10 kOhm from OUT to REF. Clamp positive excursions with DHI from OUT anode to POS cathode. Clamp negative excursions with DLO from NEG anode to OUT cathode. Use DDEFAULT diodes. Preserve POS, NEG, VIN, and OUT. Simulate two cycles and report OUT at both input peaks plus its peak-to-peak range.",
    smoke: false,
    graph: {
      groundNet: "REF",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 3 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: 3 } },
        {
          type: "sine-voltage-source",
          refdes: "VIN_SOURCE",
          props: { amplitudeVolts: 10, frequencyHertz: 50 },
        },
        { type: "resistor", refdes: "RS", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 10_000 } },
        { type: "diode", refdes: "DHI", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "diode", refdes: "DLO", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
      ],
      nets: [
        {
          name: "POS",
          terminals: [
            { refdes: "VPOS", pin: "positive" },
            { refdes: "DHI", pin: "cathode" },
          ],
        },
        {
          name: "NEG",
          terminals: [
            { refdes: "VNEG", pin: "negative" },
            { refdes: "DLO", pin: "anode" },
          ],
        },
        {
          name: "VIN",
          terminals: [
            { refdes: "VIN_SOURCE", pin: "positive" },
            { refdes: "RS", pin: "a" },
          ],
        },
        {
          name: "OUT",
          terminals: [
            { refdes: "RS", pin: "b" },
            { refdes: "RLOAD", pin: "a" },
            { refdes: "DHI", pin: "anode" },
            { refdes: "DLO", pin: "cathode" },
          ],
        },
        {
          name: "REF",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "positive" },
            { refdes: "VIN_SOURCE", pin: "negative" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(40, 0.05),
    },
    expected: expected({
      requiredNetNames: ["GND", "POS", "NEG", "VIN", "OUT"],
      traces: [
        { signalName: "V(OUT)", atSeconds: 0.005, expected: approximate(3.7, 0.3) },
        { signalName: "V(OUT)", atSeconds: 0.015, expected: approximate(-3.7, 0.3) },
      ],
      traceRanges: [
        {
          signalName: "V(OUT)",
          metric: "peakToPeak",
          expected: approximate(7.4, 0.5),
        },
      ],
    }),
  }
}

function dualRailBridgeSupplyCase() {
  return {
    id: "frontier-dual-rail-bridge-supply",
    title: "Dual-rail filtered bridge supply",
    prompt:
      "Build a dual-rail full-wave supply from two independent floating 10 V peak, 50 Hz sine sources. Use four DDEFAULT diodes for each bridge. The first bridge must rectify onto VPOS relative to an interior reference REF. Reverse the second bridge so REF is its positive output and VNEG is its negative output. Declare REF as ground. Put a 470 uF smoothing capacitor and 1 kOhm load across VPOS-to-REF, and another 470 uF capacitor and 1 kOhm load across REF-to-VNEG. Preserve VPOS and VNEG. Simulate for 100 ms and report both final rail voltages with evidence.",
    smoke: false,
    graph: {
      groundNet: "REF",
      components: [
        {
          type: "sine-voltage-source",
          refdes: "VACP",
          props: { amplitudeVolts: 10, frequencyHertz: 50 },
        },
        {
          type: "sine-voltage-source",
          refdes: "VACN",
          props: { amplitudeVolts: 10, frequencyHertz: 50 },
        },
        ...["DP1", "DP2", "DP3", "DP4", "DN1", "DN2", "DN3", "DN4"].map(
          (refdes) => ({ type: "diode", refdes, props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } }),
        ),
        { type: "capacitor", refdes: "CP", props: { capacitanceFarads: 0.00047 } },
        { type: "capacitor", refdes: "CN", props: { capacitanceFarads: 0.00047 } },
        { type: "resistor", refdes: "RP", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RN", props: { resistanceOhms: 1_000 } },
      ],
      nets: [
        {
          name: "PAC_A",
          terminals: [
            { refdes: "VACP", pin: "positive" },
            { refdes: "DP1", pin: "anode" },
            { refdes: "DP3", pin: "cathode" },
          ],
        },
        {
          name: "PAC_B",
          terminals: [
            { refdes: "VACP", pin: "negative" },
            { refdes: "DP2", pin: "anode" },
            { refdes: "DP4", pin: "cathode" },
          ],
        },
        {
          name: "VPOS",
          terminals: [
            { refdes: "DP1", pin: "cathode" },
            { refdes: "DP2", pin: "cathode" },
            { refdes: "CP", pin: "a" },
            { refdes: "RP", pin: "a" },
          ],
        },
        {
          name: "NAC_A",
          terminals: [
            { refdes: "VACN", pin: "positive" },
            { refdes: "DN1", pin: "anode" },
            { refdes: "DN3", pin: "cathode" },
          ],
        },
        {
          name: "NAC_B",
          terminals: [
            { refdes: "VACN", pin: "negative" },
            { refdes: "DN2", pin: "anode" },
            { refdes: "DN4", pin: "cathode" },
          ],
        },
        {
          name: "VNEG",
          terminals: [
            { refdes: "DN3", pin: "anode" },
            { refdes: "DN4", pin: "anode" },
            { refdes: "CN", pin: "b" },
            { refdes: "RN", pin: "b" },
          ],
        },
        {
          name: "REF",
          terminals: [
            { refdes: "DP3", pin: "anode" },
            { refdes: "DP4", pin: "anode" },
            { refdes: "CP", pin: "b" },
            { refdes: "RP", pin: "b" },
            { refdes: "DN1", pin: "cathode" },
            { refdes: "DN2", pin: "cathode" },
            { refdes: "CN", pin: "a" },
            { refdes: "RN", pin: "a" },
          ],
        },
      ],
      analysis: analysis(100, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "VPOS", "VNEG"],
      netVoltages: [
        { name: "VPOS", expected: approximate(8.5, 1) },
        { name: "VNEG", expected: approximate(-8.5, 1) },
      ],
    }),
  }
}

function parallelResonantTankCase() {
  return {
    id: "frontier-parallel-resonant-tank",
    title: "Parallel-resonant RLC tank",
    prompt:
      "Build a parallel-resonant RLC tank. Use a 1 V peak, 159.154943 Hz sine source from VIN to GND and a 50 Ohm source resistor from VIN to TANK. Connect a 1 kOhm load, a 10 mH inductor, and a 100 uF capacitor all in parallel from TANK to GND. Preserve TANK. Simulate for 100 ms with a 0.02 ms step or finer and report its waveform peak-to-peak voltage with evidence.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        {
          type: "sine-voltage-source",
          refdes: "V1",
          props: { amplitudeVolts: 1, frequencyHertz: 159.154943 },
        },
        { type: "resistor", refdes: "RS", props: { resistanceOhms: 50 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
        { type: "inductor", refdes: "L1", props: { inductanceHenries: 0.01 } },
        { type: "capacitor", refdes: "C1", props: { capacitanceFarads: 0.0001 } },
      ],
      nets: [
        {
          name: "VIN",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "RS", pin: "a" },
          ],
        },
        {
          name: "TANK",
          terminals: [
            { refdes: "RS", pin: "b" },
            { refdes: "RLOAD", pin: "a" },
            { refdes: "L1", pin: "a" },
            { refdes: "C1", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "V1", pin: "negative" },
            { refdes: "RLOAD", pin: "b" },
            { refdes: "L1", pin: "b" },
            { refdes: "C1", pin: "b" },
          ],
        },
      ],
      analysis: analysis(100, 0.02),
    },
    expected: expected({
      requiredNetNames: ["GND", "TANK"],
      traceRanges: [
        {
          signalName: "V(TANK)",
          metric: "peakToPeak",
          expected: approximate(1.905, 0.1),
        },
      ],
    }),
  }
}

function acCoupledLedClamperCase() {
  return {
    id: "frontier-ac-coupled-led-clamper",
    title: "AC-coupled LED clamper",
    prompt:
      "Build an AC-coupled positive clamper. Use a 5 V peak, 100 Hz sine source from AC_IN to REF and a 10 uF coupling capacitor from AC_IN to CLAMP_OUT. Clamp the negative excursion with a DDEFAULT diode whose anode is REF and cathode is CLAMP_OUT. Add a 100 kOhm bias resistor from CLAMP_OUT to REF and a separate 47 kOhm resistor followed by a red LED from CLAMP_OUT to REF. Declare REF as ground. Preserve CLAMP_OUT and LED_A. Simulate for 120 ms with a 0.1 ms step or finer and report CLAMP_OUT at settled positive and negative peaks plus its peak-to-peak range.",
    smoke: false,
    graph: {
      groundNet: "REF",
      components: [
        {
          type: "sine-voltage-source",
          refdes: "V1",
          props: { amplitudeVolts: 5, frequencyHertz: 100 },
        },
        { type: "capacitor", refdes: "C1", props: { capacitanceFarads: 0.00001 } },
        { type: "diode", refdes: "DCLAMP", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "resistor", refdes: "RBIAS", props: { resistanceOhms: 100_000 } },
        { type: "resistor", refdes: "RLED", props: { resistanceOhms: 47_000 } },
        { type: "led", refdes: "LED1", props: { color: "red" } },
      ],
      nets: [
        {
          name: "AC_IN",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "C1", pin: "a" },
          ],
        },
        {
          name: "CLAMP_OUT",
          terminals: [
            { refdes: "C1", pin: "b" },
            { refdes: "DCLAMP", pin: "cathode" },
            { refdes: "RBIAS", pin: "a" },
            { refdes: "RLED", pin: "a" },
          ],
        },
        {
          name: "LED_A",
          terminals: [
            { refdes: "RLED", pin: "b" },
            { refdes: "LED1", pin: "anode" },
          ],
        },
        {
          name: "REF",
          terminals: [
            { refdes: "V1", pin: "negative" },
            { refdes: "DCLAMP", pin: "anode" },
            { refdes: "RBIAS", pin: "b" },
            { refdes: "LED1", pin: "cathode" },
          ],
        },
      ],
      analysis: analysis(120, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "CLAMP_OUT", "LED_A"],
      traces: [
        {
          signalName: "V(CLAMP_OUT)",
          atSeconds: 0.1025,
          expected: approximate(8.5, 1),
        },
        {
          signalName: "V(CLAMP_OUT)",
          atSeconds: 0.1075,
          expected: approximate(-0.6, 0.35),
        },
      ],
      traceRanges: [
        {
          signalName: "V(CLAMP_OUT)",
          metric: "peakToPeak",
          expected: approximate(9.5, 1.2),
        },
      ],
    }),
  }
}

function centerTappedRectifierCase() {
  return {
    id: "frontier-center-tapped-rectifier",
    title: "Center-tapped filtered rectifier",
    prompt:
      "Build a center-tapped full-wave rectifier. VP is an 8 V peak, 50 Hz sine source from AC_P to REF. VN is another 8 V peak, 50 Hz sine source wired with its positive terminal to REF and negative terminal to AC_N, making AC_N the opposite phase. Connect DP from AC_P anode to VOUT cathode and DN from AC_N anode to VOUT cathode. Add a 470 uF capacitor and 2 kOhm load from VOUT to REF, plus a separate 1 kOhm resistor followed by a red LED from VOUT to REF. Declare REF as ground. Preserve AC_P, AC_N, VOUT, and LED_A. Simulate for 100 ms and report the final output and LED evidence.",
    smoke: false,
    graph: {
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
        { type: "capacitor", refdes: "C1", props: { capacitanceFarads: 0.00047 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RLED", props: { resistanceOhms: 1_000 } },
        { type: "led", refdes: "LED1", props: { color: "red" } },
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
            { refdes: "C1", pin: "a" },
            { refdes: "RLOAD", pin: "a" },
            { refdes: "RLED", pin: "a" },
          ],
        },
        {
          name: "LED_A",
          terminals: [
            { refdes: "RLED", pin: "b" },
            { refdes: "LED1", pin: "anode" },
          ],
        },
        {
          name: "REF",
          terminals: [
            { refdes: "VP", pin: "negative" },
            { refdes: "VN", pin: "positive" },
            { refdes: "C1", pin: "b" },
            { refdes: "RLOAD", pin: "b" },
            { refdes: "LED1", pin: "cathode" },
          ],
        },
      ],
      analysis: analysis(100, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "VOUT", "LED_A"],
      netVoltages: [
        { name: "VOUT", expected: approximate(6.7, 1) },
        { name: "LED_A", expected: approximate(1.9, 0.3) },
      ],
      componentMeasurements: [
        { refdes: "RLOAD", metric: "current", expected: approximate(0.0033, 0.0008) },
        { refdes: "RLED", metric: "current", expected: approximate(0.0048, 0.0012) },
      ],
    }),
  }
}

function twoFrequencySplitRailLimiterCase() {
  return {
    id: "frontier-two-frequency-split-rail-limiter",
    title: "Two-frequency split-rail limiter",
    prompt:
      "Build a two-frequency split-rail diode limiter around an interior reference REF. Create POS at +3 V and NEG at -3 V, and declare REF as ground. Feed BUS from an 8 V peak, 50 Hz source through RLOW 1 kOhm and from a 4 V peak, 100 Hz source through RHIGH 1 kOhm. Add RLOAD 10 kOhm from BUS to REF. Clamp positive BUS excursions with DHI from BUS anode to POS cathode, and negative excursions with DLO from NEG anode to BUS cathode. Preserve POS, NEG, SLOW, SHIGH, and BUS. Simulate 40 ms with a 0.05 ms step or finer and report BUS at the low-frequency peaks plus its peak-to-peak range.",
    smoke: false,
    graph: {
      groundNet: "REF",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 3 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: 3 } },
        {
          type: "sine-voltage-source",
          refdes: "VLOW",
          props: { amplitudeVolts: 8, frequencyHertz: 50 },
        },
        {
          type: "sine-voltage-source",
          refdes: "VHIGH",
          props: { amplitudeVolts: 4, frequencyHertz: 100 },
        },
        { type: "resistor", refdes: "RLOW", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RHIGH", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 10_000 } },
        { type: "diode", refdes: "DHI", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "diode", refdes: "DLO", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
      ],
      nets: [
        {
          name: "POS",
          terminals: [
            { refdes: "VPOS", pin: "positive" },
            { refdes: "DHI", pin: "cathode" },
          ],
        },
        {
          name: "NEG",
          terminals: [
            { refdes: "VNEG", pin: "negative" },
            { refdes: "DLO", pin: "anode" },
          ],
        },
        {
          name: "SLOW",
          terminals: [
            { refdes: "VLOW", pin: "positive" },
            { refdes: "RLOW", pin: "a" },
          ],
        },
        {
          name: "SHIGH",
          terminals: [
            { refdes: "VHIGH", pin: "positive" },
            { refdes: "RHIGH", pin: "a" },
          ],
        },
        {
          name: "BUS",
          terminals: [
            { refdes: "RLOW", pin: "b" },
            { refdes: "RHIGH", pin: "b" },
            { refdes: "RLOAD", pin: "a" },
            { refdes: "DHI", pin: "anode" },
            { refdes: "DLO", pin: "cathode" },
          ],
        },
        {
          name: "REF",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "positive" },
            { refdes: "VLOW", pin: "negative" },
            { refdes: "VHIGH", pin: "negative" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(40, 0.05),
    },
    expected: expected({
      requiredNetNames: ["GND", "POS", "NEG", "SLOW", "SHIGH", "BUS"],
      traces: [
        { signalName: "V(BUS)", atSeconds: 0.005, expected: approximate(3.7, 0.3) },
        { signalName: "V(BUS)", atSeconds: 0.015, expected: approximate(-3.7, 0.3) },
      ],
      traceRanges: [
        {
          signalName: "V(BUS)",
          metric: "peakToPeak",
          expected: approximate(7.4, 0.5),
        },
      ],
    }),
  }
}

function reactiveTwoFrequencyMixerCase() {
  return {
    id: "frontier-reactive-two-frequency-mixer",
    title: "Reactive two-frequency mixer",
    prompt:
      "Build a two-frequency reactive mixer. Use VLOW, a 4 V peak, 50 Hz sine source from SLOW to GND through RLOW 1 kOhm, and VHIGH, a 2 V peak, 120 Hz sine source from SHIGH to GND through RHIGH 2 kOhm. Join both resistors at BUS. Connect RLOAD 1 kOhm from BUS to GND, and connect a 100 mH inductor from BUS to LC_NODE followed by a 10 uF capacitor from LC_NODE to GND. Preserve SLOW, SHIGH, BUS, and LC_NODE. Simulate for 80 ms with a 0.1 ms step or finer and report BUS waveform evidence.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        {
          type: "sine-voltage-source",
          refdes: "VLOW",
          props: { amplitudeVolts: 4, frequencyHertz: 50 },
        },
        {
          type: "sine-voltage-source",
          refdes: "VHIGH",
          props: { amplitudeVolts: 2, frequencyHertz: 120 },
        },
        { type: "resistor", refdes: "RLOW", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RHIGH", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
        { type: "inductor", refdes: "L1", props: { inductanceHenries: 0.1 } },
        { type: "capacitor", refdes: "C1", props: { capacitanceFarads: 0.00001 } },
      ],
      nets: [
        {
          name: "SLOW",
          terminals: [
            { refdes: "VLOW", pin: "positive" },
            { refdes: "RLOW", pin: "a" },
          ],
        },
        {
          name: "SHIGH",
          terminals: [
            { refdes: "VHIGH", pin: "positive" },
            { refdes: "RHIGH", pin: "a" },
          ],
        },
        {
          name: "BUS",
          terminals: [
            { refdes: "RLOW", pin: "b" },
            { refdes: "RHIGH", pin: "b" },
            { refdes: "RLOAD", pin: "a" },
            { refdes: "L1", pin: "a" },
          ],
        },
        {
          name: "LC_NODE",
          terminals: [
            { refdes: "L1", pin: "b" },
            { refdes: "C1", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VLOW", pin: "negative" },
            { refdes: "VHIGH", pin: "negative" },
            { refdes: "RLOAD", pin: "b" },
            { refdes: "C1", pin: "b" },
          ],
        },
      ],
      analysis: analysis(80, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "SLOW", "SHIGH", "BUS", "LC_NODE"],
      traces: [
        { signalName: "V(BUS)", atSeconds: 0.0375, expected: approximate(-0.864, 0.12) },
        { signalName: "V(BUS)", atSeconds: 0.04375, expected: approximate(0.22, 0.12) },
        { signalName: "V(BUS)", atSeconds: 0.06875, expected: approximate(0.916, 0.12) },
      ],
      traceRanges: [
        {
          signalName: "V(BUS)",
          metric: "peakToPeak",
          expected: approximate(1.9, 0.2),
        },
      ],
    }),
  }
}

function asymmetricDualRailBridgeCase() {
  return {
    id: "frontier-asymmetric-dual-rail-bridge",
    title: "Asymmetric dual-rail bridge supply",
    prompt:
      "Build two independent full-wave rectifier supplies around an interior REF ground. The positive bridge uses a floating 10 V peak, 50 Hz sine source, four DDEFAULT diodes, a 470 uF capacitor, and a 680 Ohm load from VPOS to REF. The negative bridge uses a floating 8 V peak, 75 Hz sine source with reversed bridge polarity, four DDEFAULT diodes, a 1 mF capacitor, and a 1.5 kOhm load from REF to VNEG. Declare REF as ground. Preserve VPOS and VNEG. Simulate for 120 ms and report both final rail voltages with waveform evidence.",
    smoke: false,
    graph: {
      groundNet: "REF",
      components: [
        {
          type: "sine-voltage-source",
          refdes: "VACP",
          props: { amplitudeVolts: 10, frequencyHertz: 50 },
        },
        {
          type: "sine-voltage-source",
          refdes: "VACN",
          props: { amplitudeVolts: 8, frequencyHertz: 75 },
        },
        ...["DP1", "DP2", "DP3", "DP4", "DN1", "DN2", "DN3", "DN4"].map(
          (refdes) => ({ type: "diode", refdes, props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } }),
        ),
        { type: "capacitor", refdes: "CP", props: { capacitanceFarads: 0.00047 } },
        { type: "capacitor", refdes: "CN", props: { capacitanceFarads: 0.001 } },
        { type: "resistor", refdes: "RP", props: { resistanceOhms: 680 } },
        { type: "resistor", refdes: "RN", props: { resistanceOhms: 1_500 } },
      ],
      nets: [
        {
          name: "PAC_A",
          terminals: [
            { refdes: "VACP", pin: "positive" },
            { refdes: "DP1", pin: "anode" },
            { refdes: "DP3", pin: "cathode" },
          ],
        },
        {
          name: "PAC_B",
          terminals: [
            { refdes: "VACP", pin: "negative" },
            { refdes: "DP2", pin: "anode" },
            { refdes: "DP4", pin: "cathode" },
          ],
        },
        {
          name: "VPOS",
          terminals: [
            { refdes: "DP1", pin: "cathode" },
            { refdes: "DP2", pin: "cathode" },
            { refdes: "CP", pin: "a" },
            { refdes: "RP", pin: "a" },
          ],
        },
        {
          name: "NAC_A",
          terminals: [
            { refdes: "VACN", pin: "positive" },
            { refdes: "DN1", pin: "anode" },
            { refdes: "DN3", pin: "cathode" },
          ],
        },
        {
          name: "NAC_B",
          terminals: [
            { refdes: "VACN", pin: "negative" },
            { refdes: "DN2", pin: "anode" },
            { refdes: "DN4", pin: "cathode" },
          ],
        },
        {
          name: "VNEG",
          terminals: [
            { refdes: "DN3", pin: "anode" },
            { refdes: "DN4", pin: "anode" },
            { refdes: "CN", pin: "b" },
            { refdes: "RN", pin: "b" },
          ],
        },
        {
          name: "REF",
          terminals: [
            { refdes: "DP3", pin: "anode" },
            { refdes: "DP4", pin: "anode" },
            { refdes: "CP", pin: "b" },
            { refdes: "RP", pin: "b" },
            { refdes: "DN1", pin: "cathode" },
            { refdes: "DN2", pin: "cathode" },
            { refdes: "CN", pin: "a" },
            { refdes: "RN", pin: "a" },
          ],
        },
      ],
      analysis: analysis(120, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "VPOS", "VNEG"],
      netVoltages: [
        { name: "VPOS", expected: approximate(8.2, 1) },
        { name: "VNEG", expected: approximate(-6.5, 1) },
      ],
    }),
  }
}

function zenerSineLimiterCase() {
  return {
    id: "frontier-zener-sine-limiter",
    title: "Asymmetric Zener sine limiter",
    prompt:
      "Build an asymmetric Zener limiter driven by a 10 V peak, 50 Hz sine source. Connect VIN through RS 1 kOhm to CLAMP, put a 10 kOhm load from CLAMP to GND, and connect a 5.1 V Zener diode with cathode at CLAMP and anode at GND. Preserve VIN and CLAMP. Simulate two cycles with a 0.1 ms step or finer and report the settled positive clamp, negative forward clamp, and peak-to-peak range.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        {
          type: "sine-voltage-source",
          refdes: "V1",
          props: { amplitudeVolts: 10, frequencyHertz: 50 },
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
          name: "VIN",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "RS", pin: "a" },
          ],
        },
        {
          name: "CLAMP",
          terminals: [
            { refdes: "RS", pin: "b" },
            { refdes: "RLOAD", pin: "a" },
            { refdes: "DZ1", pin: "cathode" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "V1", pin: "negative" },
            { refdes: "RLOAD", pin: "b" },
            { refdes: "DZ1", pin: "anode" },
          ],
        },
      ],
      analysis: analysis(40, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "VIN", "CLAMP"],
      traces: [
        {
          signalName: "V(CLAMP)",
          atSeconds: 0.005,
          expected: approximate(5.14, 0.25),
        },
        {
          signalName: "V(CLAMP)",
          atSeconds: 0.015,
          expected: approximate(-0.74, 0.15),
        },
      ],
      traceRanges: [
        {
          signalName: "V(CLAMP)",
          metric: "maximum",
          expected: approximate(5.14, 0.25),
        },
        {
          signalName: "V(CLAMP)",
          metric: "minimum",
          expected: approximate(-0.74, 0.15),
        },
        {
          signalName: "V(CLAMP)",
          metric: "peakToPeak",
          expected: approximate(5.88, 0.35),
        },
      ],
    }),
  }
}

function bjtCurrentMirrorCase() {
  return {
    id: "frontier-bjt-current-mirror",
    title: "Matched NPN current mirror",
    prompt:
      "Build a matched beta-100 NPN current mirror from a 5 V supply. Ground both emitters. Diode-connect QREF by joining its collector and base at MIRROR_BASE, join QOUT base there too, and feed MIRROR_BASE from VCC through RREF 2 kOhm. Feed QOUT collector at OUT from VCC through RLOAD 1 kOhm. Preserve MIRROR_BASE and OUT, simulate, and compare the reference and mirrored currents with evidence.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 5 } },
        { type: "resistor", refdes: "RREF", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
        { type: "npn-transistor", refdes: "QREF", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "QOUT", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "RREF", pin: "a" },
            { refdes: "RLOAD", pin: "a" },
          ],
        },
        {
          name: "MIRROR_BASE",
          terminals: [
            { refdes: "RREF", pin: "b" },
            { refdes: "QREF", pin: "base" },
            { refdes: "QREF", pin: "collector" },
            { refdes: "QOUT", pin: "base" },
          ],
        },
        {
          name: "OUT",
          terminals: [
            { refdes: "RLOAD", pin: "b" },
            { refdes: "QOUT", pin: "collector" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "V1", pin: "negative" },
            { refdes: "QREF", pin: "emitter" },
            { refdes: "QOUT", pin: "emitter" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "MIRROR_BASE", "OUT"],
      netVoltages: [
        { name: "MIRROR_BASE", expected: approximate(0.72, 0.1) },
        { name: "OUT", expected: approximate(2.9, 0.25) },
      ],
      componentMeasurements: [
        {
          refdes: "RREF",
          metric: "current",
          expected: approximate(0.00214, 0.0002),
        },
        {
          refdes: "RLOAD",
          metric: "current",
          expected: approximate(0.0021, 0.0002),
        },
      ],
    }),
  }
}

function complementaryMosfetRegionsCase() {
  return {
    id: "frontier-complementary-mosfet-regions",
    title: "Complementary MOSFET logic regions",
    prompt:
      "Build two independent complementary MOSFET inverter branches from one 5 V VDD supply. Every N-channel device has a 2 V threshold and every P-channel device has a -2 V threshold. Drive the first pair from IN_LOW with a 0 V source so OUT_HIGH is high; drive the second pair from IN_HIGH with a 5 V source so OUT_LOW is low. In each pair, join the P-channel source to VDD, N-channel source to GND, both gates to the input, and both drains to the output. Add a 100 kOhm load from each output to GND. Preserve IN_LOW, IN_HIGH, OUT_HIGH, and OUT_LOW, then simulate and report both output levels and load currents.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VDD", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VINL", props: { voltageVolts: 0 } },
        { type: "dc-voltage-source", refdes: "VINH", props: { voltageVolts: 5 } },
        { type: "p-mosfet", refdes: "MPH", props: { thresholdVolts: -2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
        { type: "n-mosfet", refdes: "MNH", props: { thresholdVolts: 2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
        { type: "p-mosfet", refdes: "MPL", props: { thresholdVolts: -2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
        { type: "n-mosfet", refdes: "MNL", props: { thresholdVolts: 2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
        { type: "resistor", refdes: "RHIGH", props: { resistanceOhms: 100_000 } },
        { type: "resistor", refdes: "RLOW", props: { resistanceOhms: 100_000 } },
      ],
      nets: [
        {
          name: "VDD",
          terminals: [
            { refdes: "VDD", pin: "positive" },
            { refdes: "MPH", pin: "source" },
            { refdes: "MPL", pin: "source" },
          ],
        },
        {
          name: "IN_LOW",
          terminals: [
            { refdes: "VINL", pin: "positive" },
            { refdes: "MPH", pin: "gate" },
            { refdes: "MNH", pin: "gate" },
          ],
        },
        {
          name: "IN_HIGH",
          terminals: [
            { refdes: "VINH", pin: "positive" },
            { refdes: "MPL", pin: "gate" },
            { refdes: "MNL", pin: "gate" },
          ],
        },
        {
          name: "OUT_HIGH",
          terminals: [
            { refdes: "MPH", pin: "drain" },
            { refdes: "MNH", pin: "drain" },
            { refdes: "RHIGH", pin: "a" },
          ],
        },
        {
          name: "OUT_LOW",
          terminals: [
            { refdes: "MPL", pin: "drain" },
            { refdes: "MNL", pin: "drain" },
            { refdes: "RLOW", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VDD", pin: "negative" },
            { refdes: "VINL", pin: "negative" },
            { refdes: "VINH", pin: "negative" },
            { refdes: "MNH", pin: "source" },
            { refdes: "MNL", pin: "source" },
            { refdes: "RHIGH", pin: "b" },
            { refdes: "RLOW", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "IN_LOW", "IN_HIGH", "OUT_HIGH", "OUT_LOW"],
      netVoltages: [
        { name: "OUT_HIGH", expected: approximate(5, 0.02) },
        { name: "OUT_LOW", expected: approximate(0, 0.02) },
      ],
      componentMeasurements: [
        { refdes: "RHIGH", metric: "current", expected: approximate(0.00005, 5e-6) },
        { refdes: "RLOW", metric: "current", expected: approximate(0, 1e-8) },
      ],
    }),
  }
}

function opAmpOutputLimitsCase() {
  return {
    id: "frontier-op-amp-output-limits",
    title: "Dual-polarity ideal op amp saturation",
    prompt:
      "Build two independent ideal op amp saturation branches powered from shared +5 V and -5 V rails. Give both op amps gain 100000 and explicit output limits of -4 V and +4 V. Ground both inverting inputs. Drive UHI non-inverting input from +1 V and ULO non-inverting input from -1 V. Load each output to GND with 10 kOhm. Preserve POS_INPUT, NEG_INPUT, OUT_HIGH, and OUT_LOW, then simulate and report both saturated output voltages and load currents.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -5 } },
        { type: "dc-voltage-source", refdes: "VINP", props: { voltageVolts: 1 } },
        { type: "dc-voltage-source", refdes: "VINN", props: { voltageVolts: -1 } },
        {
          type: "ideal-op-amp-minus-top",
          refdes: "UHI",
          props: { gain: 100_000, minOutputVolts: -4, maxOutputVolts: 4 },
        },
        {
          type: "ideal-op-amp-minus-top",
          refdes: "ULO",
          props: { gain: 100_000, minOutputVolts: -4, maxOutputVolts: 4 },
        },
        { type: "resistor", refdes: "RHIGH", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RLOW", props: { resistanceOhms: 10_000 } },
      ],
      nets: [
        {
          name: "VPLUS",
          terminals: [
            { refdes: "VPOS", pin: "positive" },
            { refdes: "UHI", pin: "vPlus" },
            { refdes: "ULO", pin: "vPlus" },
          ],
        },
        {
          name: "VMINUS",
          terminals: [
            { refdes: "VNEG", pin: "positive" },
            { refdes: "UHI", pin: "vMinus" },
            { refdes: "ULO", pin: "vMinus" },
          ],
        },
        {
          name: "POS_INPUT",
          terminals: [
            { refdes: "VINP", pin: "positive" },
            { refdes: "UHI", pin: "nonInverting" },
          ],
        },
        {
          name: "NEG_INPUT",
          terminals: [
            { refdes: "VINN", pin: "positive" },
            { refdes: "ULO", pin: "nonInverting" },
          ],
        },
        {
          name: "OUT_HIGH",
          terminals: [
            { refdes: "UHI", pin: "output" },
            { refdes: "RHIGH", pin: "a" },
          ],
        },
        {
          name: "OUT_LOW",
          terminals: [
            { refdes: "ULO", pin: "output" },
            { refdes: "RLOW", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VINP", pin: "negative" },
            { refdes: "VINN", pin: "negative" },
            { refdes: "UHI", pin: "inverting" },
            { refdes: "ULO", pin: "inverting" },
            { refdes: "RHIGH", pin: "b" },
            { refdes: "RLOW", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "POS_INPUT", "NEG_INPUT", "OUT_HIGH", "OUT_LOW"],
      netVoltages: [
        { name: "OUT_HIGH", expected: approximate(4, 0.01) },
        { name: "OUT_LOW", expected: approximate(-4, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RHIGH", metric: "current", expected: approximate(0.0004, 2e-6) },
        { refdes: "RLOW", metric: "current", expected: approximate(-0.0004, 2e-6) },
      ],
    }),
  }
}

function cascadedLogicCase() {
  const logicInput = (refdes: string, position: 0 | 1) => ({
    type: "logic-input" as const,
    refdes,
    props: {
      position,
      highLogicVoltageVolts: 5,
      lowLogicVoltageVolts: 0,
      ternary: false,
      momentary: false,
    },
  })
  const reference = (refdes: string) => ({ refdes, pin: "reference" })
  return {
    id: "frontier-cascaded-logic",
    title: "Four-stage combinational logic cascade",
    prompt:
      "Build a referenced 5 V combinational logic cascade with A high, B low, and C low. Feed A and B into a two-input AND gate at AND_STAGE. Invert C at NOT_C. OR AND_STAGE with NOT_C at OR_STAGE, then invert OR_STAGE to FINAL. Connect every logic reference pin to GND and attach one logic output at FINAL with a 2.5 V threshold drawing 250 uA. Simulate and report A, B, C, all three intermediate nets, FINAL, and the output-load current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        logicInput("IN_A", 1),
        logicInput("IN_B", 0),
        logicInput("IN_C", 0),
        { type: "and-gate", refdes: "U_AND", props: { inputCount: 2, highLogicVoltageVolts: 5 } },
        { type: "inverter", refdes: "U_NOT_C", props: { highLogicVoltageVolts: 5 } },
        { type: "or-gate", refdes: "U_OR", props: { inputCount: 2, highLogicVoltageVolts: 5 } },
        { type: "inverter", refdes: "U_FINAL", props: { highLogicVoltageVolts: 5 } },
        {
          type: "logic-output",
          refdes: "OUT_FINAL",
          props: { thresholdVolts: 2.5, currentRequiredAmps: 0.00025 },
        },
      ],
      nets: [
        {
          name: "A",
          terminals: [
            { refdes: "IN_A", pin: "output" },
            { refdes: "U_AND", pin: "a" },
          ],
        },
        {
          name: "B",
          terminals: [
            { refdes: "IN_B", pin: "output" },
            { refdes: "U_AND", pin: "b" },
          ],
        },
        {
          name: "C",
          terminals: [
            { refdes: "IN_C", pin: "output" },
            { refdes: "U_NOT_C", pin: "input" },
          ],
        },
        {
          name: "AND_STAGE",
          terminals: [
            { refdes: "U_AND", pin: "output" },
            { refdes: "U_OR", pin: "a" },
          ],
        },
        {
          name: "NOT_C",
          terminals: [
            { refdes: "U_NOT_C", pin: "output" },
            { refdes: "U_OR", pin: "b" },
          ],
        },
        {
          name: "OR_STAGE",
          terminals: [
            { refdes: "U_OR", pin: "output" },
            { refdes: "U_FINAL", pin: "input" },
          ],
        },
        {
          name: "FINAL",
          terminals: [
            { refdes: "U_FINAL", pin: "output" },
            { refdes: "OUT_FINAL", pin: "input" },
          ],
        },
        {
          name: "GND",
          terminals: [
            reference("IN_A"),
            reference("IN_B"),
            reference("IN_C"),
            reference("U_AND"),
            reference("U_NOT_C"),
            reference("U_OR"),
            reference("U_FINAL"),
            reference("OUT_FINAL"),
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "A", "B", "C", "AND_STAGE", "NOT_C", "OR_STAGE", "FINAL"],
      netVoltages: [
        { name: "A", expected: approximate(5, 0.001) },
        { name: "B", expected: approximate(0, 0.001) },
        { name: "C", expected: approximate(0, 0.001) },
        { name: "AND_STAGE", expected: approximate(0, 0.001) },
        { name: "NOT_C", expected: approximate(5, 0.001) },
        { name: "OR_STAGE", expected: approximate(5, 0.001) },
        { name: "FINAL", expected: approximate(0, 0.001) },
      ],
      componentMeasurements: [
        {
          refdes: "OUT_FINAL",
          metric: "current",
          expected: approximate(0.00025, 1e-7),
        },
      ],
    }),
  }
}

function zenerBjtSeriesRegulatorCase() {
  return {
    id: "frontier-zener-bjt-series-regulator",
    title: "Zener-referenced BJT series regulator",
    prompt:
      "Build a simple series regulator from 12 V. Feed ZREF through 680 Ohm, clamp ZREF with a 5.1 V Zener whose cathode is at ZREF, and drive the base of a beta-100 NPN from ZREF. Tie its collector to 12 V, take VOUT from its emitter, and load VOUT with 330 Ohm to GND. Preserve ZREF and VOUT, simulate, and report the reference voltage, output voltage, ballast current, and load current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 12 } },
        { type: "resistor", refdes: "RZ", props: { resistanceOhms: 680 } },
        { type: "zener-diode", refdes: "DZ1", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
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
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "ZREF", "VOUT"],
      netVoltages: [
        { name: "ZREF", expected: approximate(5.25691, 0.02) },
        { name: "VOUT", expected: approximate(4.47672, 0.02) },
      ],
      componentMeasurements: [
        { refdes: "RZ", metric: "current", expected: approximate(0.00991631, 0.00002) },
        { refdes: "RLOAD", metric: "current", expected: approximate(0.0135658, 0.00003) },
      ],
    }),
  }
}

function cascadedNmosInvertersCase() {
  return {
    id: "frontier-cascaded-nmos-inverters",
    title: "Cascaded resistor-load NMOS inverters",
    prompt:
      "Build two cascaded resistor-load NMOS inverter stages from one 5 V supply. Use a 5 V input, a 1 kOhm pull-up on each stage, and a 2 V-threshold NMOS in each stage with both sources at GND. Connect STAGE_ONE to the second gate and add a 100 kOhm load from FINAL to GND. Preserve INPUT, STAGE_ONE, and FINAL, simulate, and report both stage levels and the final load current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VDD", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VIN", props: { voltageVolts: 5 } },
        { type: "resistor", refdes: "R1", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "R2", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 100_000 } },
        { type: "n-mosfet", refdes: "M1", props: { thresholdVolts: 2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
        { type: "n-mosfet", refdes: "M2", props: { thresholdVolts: 2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
      ],
      nets: [
        {
          name: "VDD",
          terminals: [
            { refdes: "VDD", pin: "positive" },
            { refdes: "R1", pin: "a" },
            { refdes: "R2", pin: "a" },
          ],
        },
        {
          name: "INPUT",
          terminals: [
            { refdes: "VIN", pin: "positive" },
            { refdes: "M1", pin: "gate" },
          ],
        },
        {
          name: "STAGE_ONE",
          terminals: [
            { refdes: "R1", pin: "b" },
            { refdes: "M1", pin: "drain" },
            { refdes: "M2", pin: "gate" },
          ],
        },
        {
          name: "FINAL",
          terminals: [
            { refdes: "R2", pin: "b" },
            { refdes: "M2", pin: "drain" },
            { refdes: "RLOAD", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VDD", pin: "negative" },
            { refdes: "VIN", pin: "negative" },
            { refdes: "M1", pin: "source" },
            { refdes: "M2", pin: "source" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "STAGE_ONE", "FINAL"],
      netVoltages: [
        { name: "STAGE_ONE", expected: approximate(0.0333, 0.006) },
        { name: "FINAL", expected: approximate(4.9505, 0.006) },
      ],
      componentMeasurements: [
        { refdes: "R1", metric: "current", expected: approximate(0.004967, 0.00003) },
        { refdes: "RLOAD", metric: "current", expected: approximate(0.0000495, 3e-7) },
      ],
    }),
  }
}

function darlingtonEmitterFollowerCase() {
  return {
    id: "frontier-darlington-emitter-follower",
    title: "Two-stage Darlington emitter follower",
    prompt:
      "Build a two-NPN Darlington emitter follower from a 9 V supply using beta 100 for both devices. Tie both collectors to VCC. Drive Q1 base from a 4 V source through 10 kOhm, connect Q1 emitter only to Q2 base, and take VOUT from Q2 emitter through a 1 kOhm load to GND. Preserve BASE, INTERSTAGE, and VOUT, simulate, and report all three voltages and load current to demonstrate two base-emitter drops and compound current gain.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 9 } },
        { type: "dc-voltage-source", refdes: "VDRIVE", props: { voltageVolts: 4 } },
        { type: "resistor", refdes: "RB", props: { resistanceOhms: 10_000 } },
        { type: "npn-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "Q2", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "VCC", pin: "positive" },
            { refdes: "Q1", pin: "collector" },
            { refdes: "Q2", pin: "collector" },
          ],
        },
        {
          name: "DRIVE",
          terminals: [
            { refdes: "VDRIVE", pin: "positive" },
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
          name: "INTERSTAGE",
          terminals: [
            { refdes: "Q1", pin: "emitter" },
            { refdes: "Q2", pin: "base" },
          ],
        },
        {
          name: "VOUT",
          terminals: [
            { refdes: "Q2", pin: "emitter" },
            { refdes: "RLOAD", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "VDRIVE", pin: "negative" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "BASE", "INTERSTAGE", "VOUT"],
      netVoltages: [
        { name: "BASE", expected: approximate(3.998, 0.01) },
        { name: "INTERSTAGE", expected: approximate(3.38, 0.04) },
        { name: "VOUT", expected: approximate(2.642, 0.04) },
      ],
      componentMeasurements: [
        { refdes: "RLOAD", metric: "current", expected: approximate(0.002642, 0.00004) },
      ],
    }),
  }
}

function biasedCommonEmitterAmplifierCase() {
  return {
    id: "frontier-biased-common-emitter-amplifier",
    title: "Biased common-emitter transient amplifier",
    prompt:
      "Build a beta-100 NPN common-emitter amplifier from 9 V. Superimpose a 20 mV-peak, 100 Hz sine on a 1.5 V DC input bias, feed the base through 10 kOhm, use a 3.3 kOhm collector resistor to VCC, and a 1 kOhm emitter resistor to GND. Preserve INPUT, BASE, EMITTER, and COLLECTOR, simulate six cycles, and report the DC operating point plus input and collector waveform ranges showing inverted small-signal gain.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 9 } },
        { type: "dc-voltage-source", refdes: "VBIAS", props: { voltageVolts: 1.5 } },
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
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "BASE", "EMITTER", "COLLECTOR"],
      traceRanges: [
        {
          signalName: "V(INPUT)",
          metric: "average",
          startFraction: 0.5,
          expected: approximate(1.5, 0.01),
        },
        {
          signalName: "V(INPUT)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(0.04, 0.002),
        },
        {
          signalName: "V(COLLECTOR)",
          metric: "average",
          startFraction: 0.5,
          expected: approximate(6.624, 0.08),
        },
        {
          signalName: "V(COLLECTOR)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(0.1153, 0.005),
        },
      ],
    }),
  }
}

function zenerOpAmpBufferedReferenceCase() {
  return {
    id: "frontier-zener-op-amp-buffered-reference",
    title: "Zener reference buffered by an ideal op amp",
    prompt:
      "Build a 5.1 V Zener reference from a 12 V supply using a 680 Ohm feed resistor, then buffer ZREF with an ideal voltage follower powered from 12 V and GND. Give the op amp gain 100000 and output limits of 0 V and 10 V. Load VBUF with 330 Ohm to GND. Preserve ZREF and VBUF, simulate, and report both voltages, the Zener-feed current, and load current to show that the buffer supplies a load larger than the reference branch current without collapsing ZREF.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 12 } },
        { type: "resistor", refdes: "RZ", props: { resistanceOhms: 680 } },
        { type: "zener-diode", refdes: "DZ1", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
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
          name: "VBUF",
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
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "ZREF", "VBUF"],
      netVoltages: [
        { name: "ZREF", expected: approximate(5.25847, 0.02) },
        { name: "VBUF", expected: approximate(5.25842, 0.02) },
      ],
      componentMeasurements: [
        { refdes: "RZ", metric: "current", expected: approximate(0.00991401, 0.00002) },
        { refdes: "RLOAD", metric: "current", expected: approximate(0.0159346, 0.00003) },
      ],
    }),
  }
}

function comparatorBjtSwitchCase() {
  return {
    id: "frontier-comparator-bjt-switch",
    title: "Ideal comparators driving NPN low-side switches",
    prompt:
      "Build two ideal 0-to-4 V comparators powered from 5 V and GND, both with gain 100000 and their inverting inputs grounded. Drive one non-inverting input from +0.2 V and the other from -0.2 V. Feed each comparator output through 10 kOhm into a beta-100 NPN base. Ground both emitters and pull each collector to 5 V through 1 kOhm. Preserve COMP_HIGH, COMP_LOW, SWITCHED_LOW, and SWITCHED_HIGH, simulate, and report the comparator and collector levels showing the full analog-to-switch chain.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VIN_HI", props: { voltageVolts: 0.2 } },
        { type: "dc-voltage-source", refdes: "VIN_LO", props: { voltageVolts: -0.2 } },
        {
          type: "ideal-op-amp-minus-top",
          refdes: "UHI",
          props: { gain: 100_000, minOutputVolts: 0, maxOutputVolts: 4 },
        },
        {
          type: "ideal-op-amp-minus-top",
          refdes: "ULO",
          props: { gain: 100_000, minOutputVolts: 0, maxOutputVolts: 4 },
        },
        { type: "resistor", refdes: "RB_HI", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RB_LO", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RC_HI", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RC_LO", props: { resistanceOhms: 1_000 } },
        { type: "npn-transistor", refdes: "QHI", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "QLO", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "VCC", pin: "positive" },
            { refdes: "UHI", pin: "vPlus" },
            { refdes: "ULO", pin: "vPlus" },
            { refdes: "RC_HI", pin: "a" },
            { refdes: "RC_LO", pin: "a" },
          ],
        },
        {
          name: "SENSE_HIGH",
          terminals: [
            { refdes: "VIN_HI", pin: "positive" },
            { refdes: "UHI", pin: "nonInverting" },
          ],
        },
        {
          name: "SENSE_LOW",
          terminals: [
            { refdes: "VIN_LO", pin: "positive" },
            { refdes: "ULO", pin: "nonInverting" },
          ],
        },
        {
          name: "COMP_HIGH",
          terminals: [
            { refdes: "UHI", pin: "output" },
            { refdes: "RB_HI", pin: "a" },
          ],
        },
        {
          name: "COMP_LOW",
          terminals: [
            { refdes: "ULO", pin: "output" },
            { refdes: "RB_LO", pin: "a" },
          ],
        },
        {
          name: "BASE_HIGH",
          terminals: [
            { refdes: "RB_HI", pin: "b" },
            { refdes: "QHI", pin: "base" },
          ],
        },
        {
          name: "BASE_LOW",
          terminals: [
            { refdes: "RB_LO", pin: "b" },
            { refdes: "QLO", pin: "base" },
          ],
        },
        {
          name: "SWITCHED_LOW",
          terminals: [
            { refdes: "RC_HI", pin: "b" },
            { refdes: "QHI", pin: "collector" },
          ],
        },
        {
          name: "SWITCHED_HIGH",
          terminals: [
            { refdes: "RC_LO", pin: "b" },
            { refdes: "QLO", pin: "collector" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "VIN_HI", pin: "negative" },
            { refdes: "VIN_LO", pin: "negative" },
            { refdes: "UHI", pin: "vMinus" },
            { refdes: "ULO", pin: "vMinus" },
            { refdes: "UHI", pin: "inverting" },
            { refdes: "ULO", pin: "inverting" },
            { refdes: "QHI", pin: "emitter" },
            { refdes: "QLO", pin: "emitter" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "COMP_HIGH", "COMP_LOW", "SWITCHED_LOW", "SWITCHED_HIGH"],
      netVoltages: [
        { name: "COMP_HIGH", expected: approximate(4, 0.01) },
        { name: "COMP_LOW", expected: approximate(0, 0.01) },
        { name: "SWITCHED_LOW", expected: approximate(0.078, 0.01) },
        { name: "SWITCHED_HIGH", expected: approximate(5, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RC_HI", metric: "current", expected: approximate(0.00496, 0.00008) },
        { refdes: "RC_LO", metric: "current", expected: approximate(0, 1e-8) },
      ],
    }),
  }
}

function bjtDifferentialPairCase() {
  return {
    id: "frontier-bjt-differential-pair",
    title: "BJT differential-pair current steering",
    prompt:
      "Build a beta-100 NPN differential pair on +5 V and -5 V rails. Use a 2 kOhm collector resistor from +5 V to each collector, join both emitters at TAIL, and connect TAIL through 2 kOhm to -5 V. Drive Q_HIGH base from +50 mV and Q_LOW base from -50 mV, both referenced to GND. Preserve HIGH_COLLECTOR, LOW_COLLECTOR, and TAIL, simulate, and report both collector voltages, both collector currents, and tail current to demonstrate differential current steering.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -5 } },
        { type: "dc-voltage-source", refdes: "VIN_HIGH", props: { voltageVolts: 0.05 } },
        { type: "dc-voltage-source", refdes: "VIN_LOW", props: { voltageVolts: -0.05 } },
        { type: "resistor", refdes: "RC_HIGH", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RC_LOW", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RTAIL", props: { resistanceOhms: 2_000 } },
        { type: "npn-transistor", refdes: "Q_HIGH", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "Q_LOW", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VPLUS",
          terminals: [
            { refdes: "VPOS", pin: "positive" },
            { refdes: "RC_HIGH", pin: "a" },
            { refdes: "RC_LOW", pin: "a" },
          ],
        },
        {
          name: "VMINUS",
          terminals: [
            { refdes: "VNEG", pin: "positive" },
            { refdes: "RTAIL", pin: "b" },
          ],
        },
        {
          name: "INPUT_HIGH",
          terminals: [
            { refdes: "VIN_HIGH", pin: "positive" },
            { refdes: "Q_HIGH", pin: "base" },
          ],
        },
        {
          name: "INPUT_LOW",
          terminals: [
            { refdes: "VIN_LOW", pin: "positive" },
            { refdes: "Q_LOW", pin: "base" },
          ],
        },
        {
          name: "HIGH_COLLECTOR",
          terminals: [
            { refdes: "RC_HIGH", pin: "b" },
            { refdes: "Q_HIGH", pin: "collector" },
          ],
        },
        {
          name: "LOW_COLLECTOR",
          terminals: [
            { refdes: "RC_LOW", pin: "b" },
            { refdes: "Q_LOW", pin: "collector" },
          ],
        },
        {
          name: "TAIL",
          terminals: [
            { refdes: "Q_HIGH", pin: "emitter" },
            { refdes: "Q_LOW", pin: "emitter" },
            { refdes: "RTAIL", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VIN_HIGH", pin: "negative" },
            { refdes: "VIN_LOW", pin: "negative" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "HIGH_COLLECTOR", "LOW_COLLECTOR", "TAIL"],
      netVoltages: [
        { name: "HIGH_COLLECTOR", expected: approximate(0.8172, 0.02) },
        { name: "LOW_COLLECTOR", expected: approximate(4.9088, 0.01) },
        { name: "TAIL", expected: approximate(-0.6836, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RC_HIGH", metric: "current", expected: approximate(0.0020914, 0.00001) },
        { refdes: "RC_LOW", metric: "current", expected: approximate(0.00004561, 0.000005) },
        { refdes: "RTAIL", metric: "current", expected: approximate(0.0021582, 0.00001) },
      ],
    }),
  }
}

function opAmpWeightedSummerCase() {
  return {
    id: "frontier-op-amp-weighted-summer",
    title: "Two-frequency weighted op amp summer",
    prompt:
      "Build an ideal inverting weighted summer on +/-12 V rails with output limits of +/-10 V. Drive input A with 0.5 V peak at 100 Hz through 10 kOhm and input B with 0.25 V peak at 250 Hz through 20 kOhm. Use 40 kOhm feedback, ground the non-inverting input, and load VOUT with 20 kOhm. Preserve INPUT_A, INPUT_B, SUM, and VOUT, simulate 40 ms, and report waveform samples showing VOUT equals the inverted weighted sum -4*A -2*B while SUM remains near virtual ground.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "sine-voltage-source", refdes: "VA", props: { amplitudeVolts: 0.5, frequencyHertz: 100 } },
        { type: "sine-voltage-source", refdes: "VB", props: { amplitudeVolts: 0.25, frequencyHertz: 250 } },
        { type: "resistor", refdes: "RA", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RB", props: { resistanceOhms: 20_000 } },
        { type: "resistor", refdes: "RF", props: { resistanceOhms: 40_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 20_000 } },
        { type: "ideal-op-amp-minus-top", refdes: "U1", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
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
          name: "INPUT_A",
          terminals: [
            { refdes: "VA", pin: "positive" },
            { refdes: "RA", pin: "a" },
          ],
        },
        {
          name: "INPUT_B",
          terminals: [
            { refdes: "VB", pin: "positive" },
            { refdes: "RB", pin: "a" },
          ],
        },
        {
          name: "SUM",
          terminals: [
            { refdes: "RA", pin: "b" },
            { refdes: "RB", pin: "b" },
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
            { refdes: "VA", pin: "negative" },
            { refdes: "VB", pin: "negative" },
            { refdes: "U1", pin: "nonInverting" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(40, 0.05),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT_A", "INPUT_B", "SUM", "VOUT"],
      traces: [
        { signalName: "V(VOUT)", atSeconds: 0.0025, expected: approximate(-1.6463, 0.005) },
        { signalName: "V(VOUT)", atSeconds: 0.005, expected: approximate(-0.5, 0.005) },
        { signalName: "V(VOUT)", atSeconds: 0.0075, expected: approximate(2.3534, 0.005) },
      ],
      traceRanges: [
        { signalName: "V(SUM)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.0000488, 0.000002) },
        { signalName: "V(VOUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(4.8799, 0.01) },
      ],
    }),
  }
}

function bridgeLoadRippleComparisonCase() {
  const diode = (refdes: string) => ({
    type: "diode" as const,
    refdes,
    props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 },
  })
  return {
    id: "frontier-bridge-load-ripple-comparison",
    title: "Full-wave reservoir ripple under two loads",
    prompt:
      "Build two independent full-wave bridge outputs from one floating 10 V-peak, 50 Hz source. Use four DDEFAULT diodes per bridge and a 470 uF reservoir capacitor on each output. Load LIGHT_OUT with 2 kOhm and HEAVY_OUT with 330 Ohm, both referenced to the common bridge-negative GND. Preserve AC_P, AC_N, LIGHT_OUT, and HEAVY_OUT, simulate 120 ms, and compare settled average voltage, ripple, and load current to demonstrate capacitor discharge under load.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "sine-voltage-source", refdes: "VAC", props: { amplitudeVolts: 10, frequencyHertz: 50 } },
        ...["DL1", "DL2", "DL3", "DL4", "DH1", "DH2", "DH3", "DH4"].map(diode),
        { type: "capacitor", refdes: "CL", props: { capacitanceFarads: 0.00047 } },
        { type: "capacitor", refdes: "CH", props: { capacitanceFarads: 0.00047 } },
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
    },
    expected: expected({
      requiredNetNames: ["GND", "AC_P", "AC_N", "LIGHT_OUT", "HEAVY_OUT"],
      componentMeasurements: [
        { refdes: "RLIGHT", metric: "current", expected: approximate(0.0042256, 0.00001) },
        { refdes: "RHEAVY", metric: "current", expected: approximate(0.0249474, 0.00002) },
      ],
      traceRanges: [
        { signalName: "V(LIGHT_OUT)", metric: "average", startFraction: 0.5, expected: approximate(8.4518, 0.01) },
        { signalName: "V(LIGHT_OUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.08004, 0.005) },
        { signalName: "V(HEAVY_OUT)", metric: "average", startFraction: 0.5, expected: approximate(8.26, 0.01) },
        { signalName: "V(HEAVY_OUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.45088, 0.01) },
      ],
    }),
  }
}

function bjtCurrentMirrorComplianceCase() {
  return {
    id: "frontier-bjt-current-mirror-compliance",
    title: "BJT current-mirror output compliance",
    prompt:
      "Build a beta-100 three-NPN current mirror from a 5 V supply. Set the diode-connected reference branch with 2 kOhm from VCC to MIRROR_BASE. Tie all emitters to GND and all bases to MIRROR_BASE. Feed ACTIVE_COLLECTOR from VCC through 1 kOhm and LIMITED_COLLECTOR through 10 kOhm. Preserve MIRROR_BASE and both collector nets, simulate, and compare the two output currents and collector voltages to show active-region mirroring versus compliance-limited saturation.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 5 } },
        { type: "resistor", refdes: "RREF", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RACTIVE", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RLIMITED", props: { resistanceOhms: 10_000 } },
        { type: "npn-transistor", refdes: "QREF", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "QACTIVE", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "QLIMITED", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "VCC", pin: "positive" },
            { refdes: "RREF", pin: "a" },
            { refdes: "RACTIVE", pin: "a" },
            { refdes: "RLIMITED", pin: "a" },
          ],
        },
        {
          name: "MIRROR_BASE",
          terminals: [
            { refdes: "RREF", pin: "b" },
            { refdes: "QREF", pin: "base" },
            { refdes: "QREF", pin: "collector" },
            { refdes: "QACTIVE", pin: "base" },
            { refdes: "QLIMITED", pin: "base" },
          ],
        },
        {
          name: "ACTIVE_COLLECTOR",
          terminals: [
            { refdes: "RACTIVE", pin: "b" },
            { refdes: "QACTIVE", pin: "collector" },
          ],
        },
        {
          name: "LIMITED_COLLECTOR",
          terminals: [
            { refdes: "RLIMITED", pin: "b" },
            { refdes: "QLIMITED", pin: "collector" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "QREF", pin: "emitter" },
            { refdes: "QACTIVE", pin: "emitter" },
            { refdes: "QLIMITED", pin: "emitter" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        "MIRROR_BASE",
        "ACTIVE_COLLECTOR",
        "LIMITED_COLLECTOR",
      ],
      netVoltages: [
        { name: "MIRROR_BASE", expected: approximate(0.7262, 0.01) },
        { name: "ACTIVE_COLLECTOR", expected: approximate(3.3968, 0.01) },
        { name: "LIMITED_COLLECTOR", expected: approximate(0.02802, 0.005) },
      ],
      componentMeasurements: [
        { refdes: "RREF", metric: "current", expected: approximate(0.0021369, 0.00001) },
        { refdes: "RACTIVE", metric: "current", expected: approximate(0.00160321, 0.00001) },
        { refdes: "RLIMITED", metric: "current", expected: approximate(0.0004972, 0.000005) },
      ],
    }),
  }
}

function complementaryEmitterFollowerCase() {
  return {
    id: "frontier-complementary-emitter-follower",
    title: "Complementary class-B emitter follower",
    prompt:
      "Build a complementary beta-100 BJT emitter follower on +/-9 V rails. Tie the NPN collector to +9 V and PNP collector to -9 V, drive both bases from one 3 V-peak, 100 Hz sine net named DRIVE, join both emitters at VOUT, and load VOUT with 1 kOhm to GND. Simulate 40 ms and report positive and negative output peaks, zero-crossing behavior, and peak-to-peak swing to demonstrate the class-B base-emitter dead band.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 9 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -9 } },
        {
          type: "sine-voltage-source",
          refdes: "VIN",
          props: { amplitudeVolts: 3, frequencyHertz: 100 },
        },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
        { type: "npn-transistor", refdes: "QN", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "QP", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VPLUS",
          terminals: [
            { refdes: "VPOS", pin: "positive" },
            { refdes: "QN", pin: "collector" },
          ],
        },
        {
          name: "VMINUS",
          terminals: [
            { refdes: "VNEG", pin: "positive" },
            { refdes: "QP", pin: "collector" },
          ],
        },
        {
          name: "DRIVE",
          terminals: [
            { refdes: "VIN", pin: "positive" },
            { refdes: "QN", pin: "base" },
            { refdes: "QP", pin: "base" },
          ],
        },
        {
          name: "VOUT",
          terminals: [
            { refdes: "QN", pin: "emitter" },
            { refdes: "QP", pin: "emitter" },
            { refdes: "RLOAD", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VIN", pin: "negative" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(40, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "DRIVE", "VOUT"],
      traces: [
        { signalName: "V(VOUT)", atSeconds: 0.0025, expected: approximate(2.26592, 0.01) },
        { signalName: "V(VOUT)", atSeconds: 0.005, expected: approximate(0, 0.005) },
        { signalName: "V(VOUT)", atSeconds: 0.0075, expected: approximate(-2.26592, 0.01) },
      ],
      traceRanges: [
        { signalName: "V(VOUT)", metric: "maximum", startFraction: 0.5, expected: approximate(2.26592, 0.01) },
        { signalName: "V(VOUT)", metric: "minimum", startFraction: 0.5, expected: approximate(-2.26592, 0.01) },
        { signalName: "V(VOUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(4.53184, 0.01) },
      ],
    }),
  }
}

function opAmpDifferenceAmplifierCase() {
  return {
    id: "frontier-op-amp-difference-amplifier",
    title: "Two-frequency op amp difference amplifier",
    prompt:
      "Build an ideal difference amplifier on +/-12 V rails with +/-10 V output limits and gain 100000. Drive INPUT_A with 0.5 V peak at 100 Hz and INPUT_B with 0.25 V peak at 250 Hz. Use matched 10 kOhm input and 20 kOhm gain resistors so VOUT equals 2*(INPUT_A-INPUT_B), and load VOUT with 20 kOhm to GND. Preserve INPUT_A, INPUT_B, PLUS, MINUS, and VOUT, simulate 40 ms, and report samples, output range, and the small closed-loop input difference.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        {
          type: "sine-voltage-source",
          refdes: "VA",
          props: { amplitudeVolts: 0.5, frequencyHertz: 100 },
        },
        {
          type: "sine-voltage-source",
          refdes: "VB",
          props: { amplitudeVolts: 0.25, frequencyHertz: 250 },
        },
        { type: "resistor", refdes: "RA", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RAG", props: { resistanceOhms: 20_000 } },
        { type: "resistor", refdes: "RB", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RF", props: { resistanceOhms: 20_000 } },
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
          name: "INPUT_A",
          terminals: [
            { refdes: "VA", pin: "positive" },
            { refdes: "RA", pin: "a" },
          ],
        },
        {
          name: "PLUS",
          terminals: [
            { refdes: "RA", pin: "b" },
            { refdes: "RAG", pin: "a" },
            { refdes: "U1", pin: "nonInverting" },
          ],
        },
        {
          name: "INPUT_B",
          terminals: [
            { refdes: "VB", pin: "positive" },
            { refdes: "RB", pin: "a" },
          ],
        },
        {
          name: "MINUS",
          terminals: [
            { refdes: "RB", pin: "b" },
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
            { refdes: "VA", pin: "negative" },
            { refdes: "VB", pin: "negative" },
            { refdes: "RAG", pin: "b" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(40, 0.05),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT_A", "INPUT_B", "PLUS", "MINUS", "VOUT"],
      traces: [
        { signalName: "V(VOUT)", atSeconds: 0.0025, expected: approximate(1.35351, 0.005) },
        { signalName: "V(VOUT)", atSeconds: 0.005, expected: approximate(-0.49999, 0.005) },
        { signalName: "V(VOUT)", atSeconds: 0.0075, expected: approximate(-0.64643, 0.005) },
      ],
      traceRanges: [
        { signalName: "V(VOUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(2.92477, 0.01) },
        { signalName: "V(PLUS)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.66667, 0.005) },
        { signalName: "V(MINUS)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.66665, 0.005) },
      ],
    }),
  }
}

function cmosInverterTransientCase() {
  return {
    id: "frontier-cmos-inverter-transient",
    title: "Complementary MOS inverter transient transfer",
    prompt:
      "Build a complementary MOS inverter from a 5 V supply using a +2 V-threshold NMOS and -2 V-threshold PMOS. Create a 0-to-5 V, 100 Hz GATE waveform by stacking a 2.5 V-peak sine source on a 2.5 V DC bias. Tie both gates to GATE, join both drains at VOUT, tie the PMOS source to VDD and NMOS source to GND, and load VOUT with 10 kOhm to GND. Simulate 40 ms and report GATE range, VOUT high/low levels, and samples at the input extrema to demonstrate inversion.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VDD", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VBIAS", props: { voltageVolts: 2.5 } },
        {
          type: "sine-voltage-source",
          refdes: "VGATE",
          props: { amplitudeVolts: 2.5, frequencyHertz: 100 },
        },
        { type: "n-mosfet", refdes: "MN", props: { thresholdVolts: 2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
        { type: "p-mosfet", refdes: "MP", props: { thresholdVolts: -2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 10_000 } },
      ],
      nets: [
        {
          name: "VDD",
          terminals: [
            { refdes: "VDD", pin: "positive" },
            { refdes: "MP", pin: "source" },
          ],
        },
        {
          name: "BIAS",
          terminals: [
            { refdes: "VBIAS", pin: "positive" },
            { refdes: "VGATE", pin: "negative" },
          ],
        },
        {
          name: "GATE",
          terminals: [
            { refdes: "VGATE", pin: "positive" },
            { refdes: "MN", pin: "gate" },
            { refdes: "MP", pin: "gate" },
          ],
        },
        {
          name: "VOUT",
          terminals: [
            { refdes: "MN", pin: "drain" },
            { refdes: "MP", pin: "drain" },
            { refdes: "RLOAD", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VDD", pin: "negative" },
            { refdes: "VBIAS", pin: "negative" },
            { refdes: "MN", pin: "source" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(40, 0.02),
    },
    expected: expected({
      requiredNetNames: ["GND", "GATE", "VOUT"],
      traces: [
        { signalName: "V(VOUT)", atSeconds: 0.0025, expected: approximate(0, 0.005) },
        { signalName: "V(VOUT)", atSeconds: 0.0075, expected: approximate(4.99667, 0.005) },
      ],
      traceRanges: [
        { signalName: "V(GATE)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(5, 0.02) },
        { signalName: "V(VOUT)", metric: "minimum", startFraction: 0.5, expected: approximate(0, 0.005) },
        { signalName: "V(VOUT)", metric: "maximum", startFraction: 0.5, expected: approximate(4.99667, 0.005) },
      ],
    }),
  }
}

function zenerNmosSeriesRegulatorCase() {
  return {
    id: "frontier-zener-nmos-series-regulator",
    title: "Zener-referenced NMOS source regulator",
    prompt:
      "Build a loaded series regulator from 12 V using a 5.1 V Zener reference fed through 680 Ohm and a 2 V-threshold NMOS source follower. Tie the NMOS drain to VCC, gate to ZREF, and source to VOUT with a 1 kOhm load to GND. Preserve ZREF and VOUT, simulate, and report reference voltage, loaded output, gate-to-source offset, reference current, and load current.",
    smoke: false,
    graph: {
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
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "ZREF", "VOUT"],
      netVoltages: [
        { name: "ZREF", expected: approximate(5.25847, 0.005) },
        { name: "VOUT", expected: approximate(2.94279, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RZ", metric: "current", expected: approximate(0.00991401, 0.00001) },
        { refdes: "RLOAD", metric: "current", expected: approximate(0.00294279, 0.00001) },
      ],
    }),
  }
}

function bjtEmitterDegenerationComparisonCase() {
  return {
    id: "frontier-bjt-emitter-degeneration-comparison",
    title: "BJT emitter-degeneration bias comparison",
    prompt:
      "Build two beta-100 NPN branches from one 12 V supply. Feed each base from VCC through 200 kOhm and each collector through 2 kOhm. Ground QFIXED emitter directly; connect QDEGENERATED emitter through 1 kOhm to GND. Preserve FIXED_BASE, FIXED_COLLECTOR, DEGENERATED_BASE, DEGENERATED_EMITTER, and DEGENERATED_COLLECTOR. Simulate and compare both bias points and collector currents to show emitter-resistor feedback.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 12 } },
        { type: "resistor", refdes: "RBF", props: { resistanceOhms: 200_000 } },
        { type: "resistor", refdes: "RBD", props: { resistanceOhms: 200_000 } },
        { type: "resistor", refdes: "RCF", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RCD", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RE", props: { resistanceOhms: 1_000 } },
        { type: "npn-transistor", refdes: "QFIXED", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "QDEGENERATED", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "VCC", pin: "positive" },
            { refdes: "RBF", pin: "a" },
            { refdes: "RBD", pin: "a" },
            { refdes: "RCF", pin: "a" },
            { refdes: "RCD", pin: "a" },
          ],
        },
        {
          name: "FIXED_BASE",
          terminals: [
            { refdes: "RBF", pin: "b" },
            { refdes: "QFIXED", pin: "base" },
          ],
        },
        {
          name: "FIXED_COLLECTOR",
          terminals: [
            { refdes: "RCF", pin: "b" },
            { refdes: "QFIXED", pin: "collector" },
          ],
        },
        {
          name: "DEGENERATED_BASE",
          terminals: [
            { refdes: "RBD", pin: "b" },
            { refdes: "QDEGENERATED", pin: "base" },
          ],
        },
        {
          name: "DEGENERATED_COLLECTOR",
          terminals: [
            { refdes: "RCD", pin: "b" },
            { refdes: "QDEGENERATED", pin: "collector" },
          ],
        },
        {
          name: "DEGENERATED_EMITTER",
          terminals: [
            { refdes: "QDEGENERATED", pin: "emitter" },
            { refdes: "RE", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "QFIXED", pin: "emitter" },
            { refdes: "RE", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        "FIXED_BASE",
        "FIXED_COLLECTOR",
        "DEGENERATED_BASE",
        "DEGENERATED_EMITTER",
        "DEGENERATED_COLLECTOR",
      ],
      netVoltages: [
        { name: "FIXED_BASE", expected: approximate(0.75933, 0.01) },
        { name: "FIXED_COLLECTOR", expected: approximate(0.75933, 0.01) },
        { name: "DEGENERATED_BASE", expected: approximate(4.5241, 0.01) },
        { name: "DEGENERATED_EMITTER", expected: approximate(3.77533, 0.01) },
        { name: "DEGENERATED_COLLECTOR", expected: approximate(4.52411, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RCF", metric: "current", expected: approximate(0.00562034, 0.00001) },
        { refdes: "RCD", metric: "current", expected: approximate(0.00373795, 0.00001) },
      ],
    }),
  }
}

function opAmpWindowComparatorCase() {
  const comparator = (refdes: string) => ({
    type: "ideal-op-amp-minus-top" as const,
    refdes,
    props: { gain: 100_000, minOutputVolts: 0, maxOutputVolts: 5 },
  })
  return {
    id: "frontier-op-amp-window-comparator",
    title: "Three-region op amp window comparison",
    prompt:
      "Build a six-comparator window test powered from 5 V and GND with 0-to-5 V limits and gain 100000. Use shared LOWER=2 V and UPPER=3 V references. Test BELOW=1 V, INSIDE=2.5 V, and ABOVE=4 V. For each input, create a lower-bound output that is high when input exceeds LOWER and an upper-bound output that is high when input is below UPPER. Preserve BELOW_LOW_OK, BELOW_HIGH_OK, INSIDE_LOW_OK, INSIDE_HIGH_OK, ABOVE_LOW_OK, and ABOVE_HIGH_OK; simulate and report all six outputs.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VLOWER", props: { voltageVolts: 2 } },
        { type: "dc-voltage-source", refdes: "VUPPER", props: { voltageVolts: 3 } },
        { type: "dc-voltage-source", refdes: "VBELOW", props: { voltageVolts: 1 } },
        { type: "dc-voltage-source", refdes: "VINSIDE", props: { voltageVolts: 2.5 } },
        { type: "dc-voltage-source", refdes: "VABOVE", props: { voltageVolts: 4 } },
        ...["UBL", "UBH", "UIL", "UIH", "UAL", "UAH"].map(comparator),
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "VCC", pin: "positive" },
            ...["UBL", "UBH", "UIL", "UIH", "UAL", "UAH"].map((refdes) => ({ refdes, pin: "vPlus" })),
          ],
        },
        {
          name: "LOWER",
          terminals: [
            { refdes: "VLOWER", pin: "positive" },
            { refdes: "UBL", pin: "inverting" },
            { refdes: "UIL", pin: "inverting" },
            { refdes: "UAL", pin: "inverting" },
          ],
        },
        {
          name: "UPPER",
          terminals: [
            { refdes: "VUPPER", pin: "positive" },
            { refdes: "UBH", pin: "nonInverting" },
            { refdes: "UIH", pin: "nonInverting" },
            { refdes: "UAH", pin: "nonInverting" },
          ],
        },
        {
          name: "BELOW",
          terminals: [
            { refdes: "VBELOW", pin: "positive" },
            { refdes: "UBL", pin: "nonInverting" },
            { refdes: "UBH", pin: "inverting" },
          ],
        },
        {
          name: "INSIDE",
          terminals: [
            { refdes: "VINSIDE", pin: "positive" },
            { refdes: "UIL", pin: "nonInverting" },
            { refdes: "UIH", pin: "inverting" },
          ],
        },
        {
          name: "ABOVE",
          terminals: [
            { refdes: "VABOVE", pin: "positive" },
            { refdes: "UAL", pin: "nonInverting" },
            { refdes: "UAH", pin: "inverting" },
          ],
        },
        { name: "BELOW_LOW_OK", terminals: [{ refdes: "UBL", pin: "output" }] },
        { name: "BELOW_HIGH_OK", terminals: [{ refdes: "UBH", pin: "output" }] },
        { name: "INSIDE_LOW_OK", terminals: [{ refdes: "UIL", pin: "output" }] },
        { name: "INSIDE_HIGH_OK", terminals: [{ refdes: "UIH", pin: "output" }] },
        { name: "ABOVE_LOW_OK", terminals: [{ refdes: "UAL", pin: "output" }] },
        { name: "ABOVE_HIGH_OK", terminals: [{ refdes: "UAH", pin: "output" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "VLOWER", pin: "negative" },
            { refdes: "VUPPER", pin: "negative" },
            { refdes: "VBELOW", pin: "negative" },
            { refdes: "VINSIDE", pin: "negative" },
            { refdes: "VABOVE", pin: "negative" },
            ...["UBL", "UBH", "UIL", "UIH", "UAL", "UAH"].map((refdes) => ({ refdes, pin: "vMinus" })),
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        "BELOW_LOW_OK",
        "BELOW_HIGH_OK",
        "INSIDE_LOW_OK",
        "INSIDE_HIGH_OK",
        "ABOVE_LOW_OK",
        "ABOVE_HIGH_OK",
      ],
      netVoltages: [
        { name: "BELOW_LOW_OK", expected: approximate(0, 0.001) },
        { name: "BELOW_HIGH_OK", expected: approximate(5, 0.001) },
        { name: "INSIDE_LOW_OK", expected: approximate(5, 0.001) },
        { name: "INSIDE_HIGH_OK", expected: approximate(5, 0.001) },
        { name: "ABOVE_LOW_OK", expected: approximate(5, 0.001) },
        { name: "ABOVE_HIGH_OK", expected: approximate(0, 0.001) },
      ],
    }),
  }
}

function bufferedReferenceLoadComparisonCase() {
  const follower = (refdes: string) => ({
    type: "ideal-op-amp-minus-top" as const,
    refdes,
    props: { gain: 100_000, minOutputVolts: 0, maxOutputVolts: 10 },
  })
  return {
    id: "frontier-buffered-reference-load-comparison",
    title: "Buffered Zener reference under unequal loads",
    prompt:
      "Build one 5.1 V Zener reference from 12 V through 680 Ohm, then drive two independent ideal voltage followers from ZREF. Power both from 12 V and GND with 0-to-10 V output limits and gain 100000. Load LIGHT_OUT with 10 kOhm and HEAVY_OUT with 330 Ohm. Preserve ZREF, LIGHT_OUT, and HEAVY_OUT, simulate, and compare tracking error and load currents to demonstrate reference isolation.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 12 } },
        { type: "resistor", refdes: "RZ", props: { resistanceOhms: 680 } },
        { type: "zener-diode", refdes: "DZ1", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        follower("ULIGHT"),
        follower("UHEAVY"),
        { type: "resistor", refdes: "RLIGHT", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RHEAVY", props: { resistanceOhms: 330 } },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "VCC", pin: "positive" },
            { refdes: "RZ", pin: "a" },
            { refdes: "ULIGHT", pin: "vPlus" },
            { refdes: "UHEAVY", pin: "vPlus" },
          ],
        },
        {
          name: "ZREF",
          terminals: [
            { refdes: "RZ", pin: "b" },
            { refdes: "DZ1", pin: "cathode" },
            { refdes: "ULIGHT", pin: "nonInverting" },
            { refdes: "UHEAVY", pin: "nonInverting" },
          ],
        },
        {
          name: "LIGHT_OUT",
          terminals: [
            { refdes: "ULIGHT", pin: "inverting" },
            { refdes: "ULIGHT", pin: "output" },
            { refdes: "RLIGHT", pin: "a" },
          ],
        },
        {
          name: "HEAVY_OUT",
          terminals: [
            { refdes: "UHEAVY", pin: "inverting" },
            { refdes: "UHEAVY", pin: "output" },
            { refdes: "RHEAVY", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "DZ1", pin: "anode" },
            { refdes: "ULIGHT", pin: "vMinus" },
            { refdes: "UHEAVY", pin: "vMinus" },
            { refdes: "RLIGHT", pin: "b" },
            { refdes: "RHEAVY", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "ZREF", "LIGHT_OUT", "HEAVY_OUT"],
      netVoltages: [
        { name: "ZREF", expected: approximate(5.25847, 0.005) },
        { name: "LIGHT_OUT", expected: approximate(5.25842, 0.005) },
        { name: "HEAVY_OUT", expected: approximate(5.25842, 0.005) },
      ],
      componentMeasurements: [
        { refdes: "RLIGHT", metric: "current", expected: approximate(0.000525842, 0.000005) },
        { refdes: "RHEAVY", metric: "current", expected: approximate(0.0159346, 0.00001) },
      ],
    }),
  }
}

function clippedCommonEmitterCase() {
  return {
    id: "frontier-clipped-common-emitter-transient",
    title: "Overdriven common-emitter clipping",
    prompt:
      "Build a beta-100 NPN common-emitter stage from 12 V with 2 kOhm collector and 1 kOhm emitter resistors. Create INPUT by stacking a 4 V-peak, 100 Hz sine source on a 2 V DC bias, drive the base directly, and preserve INPUT, EMITTER, and COLLECTOR. Simulate 40 ms and report input range plus collector minimum, maximum, and peak-to-peak swing to show cutoff and saturation clipping.",
    smoke: false,
    graph: {
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
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "EMITTER", "COLLECTOR"],
      traceRanges: [
        { signalName: "V(INPUT)", metric: "minimum", startFraction: 0.5, expected: approximate(-2, 0.02) },
        { signalName: "V(INPUT)", metric: "maximum", startFraction: 0.5, expected: approximate(6, 0.02) },
        { signalName: "V(COLLECTOR)", metric: "minimum", startFraction: 0.5, expected: approximate(4.13092, 0.02) },
        { signalName: "V(COLLECTOR)", metric: "maximum", startFraction: 0.5, expected: approximate(12, 0.005) },
        { signalName: "V(COLLECTOR)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(7.86908, 0.02) },
      ],
    }),
  }
}

function bridgeZenerPostRegulatorCase() {
  return {
    id: "frontier-bridge-zener-post-regulator",
    title: "Filtered bridge with Zener post-regulation",
    prompt:
      "Build a floating 10 V-peak, 50 Hz full-wave bridge with four DDEFAULT diodes. Smooth RAW_DC with 470 uF and feed REGULATED through 220 Ohm. Shunt REGULATED with a 5.1 V Zener and 1 kOhm load to GND. Preserve AC_P, AC_N, RAW_DC, and REGULATED, simulate 160 ms, and compare settled means and ripple to show rectification, reservoir storage, and Zener post-regulation.",
    smoke: false,
    graph: {
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
    },
    expected: expected({
      requiredNetNames: ["GND", "AC_P", "AC_N", "RAW_DC", "REGULATED"],
      componentMeasurements: [
        { refdes: "RZ", metric: "current", expected: approximate(0.0140816, 0.00002) },
        { refdes: "RLOAD", metric: "current", expected: approximate(0.00524473, 0.00001) },
      ],
      traceRanges: [
        { signalName: "V(RAW_DC)", metric: "average", startFraction: 0.5, expected: approximate(8.35299, 0.01) },
        { signalName: "V(RAW_DC)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.258982, 0.01) },
        { signalName: "V(REGULATED)", metric: "average", startFraction: 0.5, expected: approximate(5.24527, 0.005) },
        { signalName: "V(REGULATED)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.0141912, 0.003) },
      ],
    }),
  }
}

function opAmpSchmittTriggerCase() {
  return {
    id: "frontier-op-amp-schmitt-trigger",
    title: "Inverting op amp Schmitt trigger",
    prompt:
      "Build an ideal inverting Schmitt trigger on +/-12 V rails with +/-10 V output limits. Drive INPUT with a 5 V-peak, 100 Hz sine. Feed one quarter of VOUT to the non-inverting THRESHOLD node using 30 kOhm from VOUT and 10 kOhm to GND; drive the inverting input directly and load VOUT with 10 kOhm. Simulate 40 ms and report threshold and output extrema plus samples that demonstrate hysteretic switching.",
    smoke: false,
    graph: {
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
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "THRESHOLD", "VOUT"],
      traces: [
        { signalName: "V(VOUT)", atSeconds: 0.0025, expected: approximate(-10, 0.02) },
        { signalName: "V(VOUT)", atSeconds: 0.0075, expected: approximate(10, 0.02) },
      ],
      traceRanges: [
        { signalName: "V(THRESHOLD)", metric: "minimum", startFraction: 0.25, expected: approximate(-2.5, 0.02) },
        { signalName: "V(THRESHOLD)", metric: "maximum", startFraction: 0.25, expected: approximate(2.5, 0.02) },
        { signalName: "V(VOUT)", metric: "peakToPeak", startFraction: 0.25, expected: approximate(20, 0.02) },
      ],
    }),
  }
}

function bjtCascodeBiasCase() {
  return {
    id: "frontier-bjt-cascode-bias",
    title: "Two-transistor NPN cascode bias",
    prompt:
      "Build a beta-100 NPN cascode from 12 V. Bias the lower base from 2 V through 10 kOhm and its emitter through 1 kOhm to GND. Bias the upper common base from 5 V through 10 kOhm, join the lower collector only to the upper emitter at CASCODE_NODE, and connect the upper collector through 2 kOhm to VCC at OUTPUT. Preserve both bases, EMITTER, CASCODE_NODE, and OUTPUT, simulate, and report the stacked bias voltages and collector current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VLOW", props: { voltageVolts: 2 } },
        { type: "dc-voltage-source", refdes: "VHIGH", props: { voltageVolts: 5 } },
        { type: "resistor", refdes: "RBLOW", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RBHIGH", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RE", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RC", props: { resistanceOhms: 2_000 } },
        { type: "npn-transistor", refdes: "QLOW", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "QHIGH", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
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
          name: "LOW_DRIVE",
          terminals: [
            { refdes: "VLOW", pin: "positive" },
            { refdes: "RBLOW", pin: "a" },
          ],
        },
        {
          name: "HIGH_DRIVE",
          terminals: [
            { refdes: "VHIGH", pin: "positive" },
            { refdes: "RBHIGH", pin: "a" },
          ],
        },
        {
          name: "LOW_BASE",
          terminals: [
            { refdes: "RBLOW", pin: "b" },
            { refdes: "QLOW", pin: "base" },
          ],
        },
        {
          name: "HIGH_BASE",
          terminals: [
            { refdes: "RBHIGH", pin: "b" },
            { refdes: "QHIGH", pin: "base" },
          ],
        },
        {
          name: "EMITTER",
          terminals: [
            { refdes: "QLOW", pin: "emitter" },
            { refdes: "RE", pin: "a" },
          ],
        },
        {
          name: "CASCODE_NODE",
          terminals: [
            { refdes: "QLOW", pin: "collector" },
            { refdes: "QHIGH", pin: "emitter" },
          ],
        },
        {
          name: "OUTPUT",
          terminals: [
            { refdes: "QHIGH", pin: "collector" },
            { refdes: "RC", pin: "b" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "VLOW", pin: "negative" },
            { refdes: "VHIGH", pin: "negative" },
            { refdes: "RE", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "LOW_BASE", "HIGH_BASE", "EMITTER", "CASCODE_NODE", "OUTPUT"],
      netVoltages: [
        { name: "LOW_BASE", expected: approximate(1.88682, 0.01) },
        { name: "HIGH_BASE", expected: approximate(4.8906, 0.01) },
        { name: "EMITTER", expected: approximate(1.16895, 0.01) },
        { name: "CASCODE_NODE", expected: approximate(4.1736, 0.01) },
        { name: "OUTPUT", expected: approximate(9.70662, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RC", metric: "current", expected: approximate(0.00114669, 0.00001) },
        { refdes: "RE", metric: "current", expected: approximate(0.00116895, 0.00001) },
      ],
    }),
  }
}

function voltageDoublerZenerRegulatorCase() {
  return {
    id: "frontier-voltage-doubler-zener-regulator",
    title: "Voltage doubler feeding a Zener regulator",
    prompt:
      "Build a loaded half-wave voltage doubler from a 5 V-peak, 100 Hz sine. Use 100 uF for the pump and raw-output capacitors with two DDEFAULT diodes, then feed REGULATED from RAW_DC through 330 Ohm. Shunt REGULATED with a 5.1 V Zener and 2 kOhm load. Preserve INPUT, PUMP, RAW_DC, and REGULATED, simulate 200 ms, and report raw versus regulated mean and ripple plus both load-path currents.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        {
          type: "sine-voltage-source",
          refdes: "VIN",
          props: { amplitudeVolts: 5, frequencyHertz: 100 },
        },
        { type: "capacitor", refdes: "CPUMP", props: { capacitanceFarads: 0.0001 } },
        { type: "diode", refdes: "DCLAMP", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "diode", refdes: "DCHARGE", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "capacitor", refdes: "CRAW", props: { capacitanceFarads: 0.0001 } },
        { type: "resistor", refdes: "RZ", props: { resistanceOhms: 330 } },
        { type: "zener-diode", refdes: "DZ", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 2_000 } },
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
          name: "RAW_DC",
          terminals: [
            { refdes: "DCHARGE", pin: "cathode" },
            { refdes: "CRAW", pin: "a" },
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
            { refdes: "VIN", pin: "negative" },
            { refdes: "DCLAMP", pin: "anode" },
            { refdes: "CRAW", pin: "b" },
            { refdes: "DZ", pin: "anode" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(200, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "PUMP", "RAW_DC", "REGULATED"],
      componentMeasurements: [
        { refdes: "RZ", metric: "current", expected: approximate(0.00652368, 0.00002) },
        { refdes: "RLOAD", metric: "current", expected: approximate(0.0025874, 0.00001) },
      ],
      traceRanges: [
        { signalName: "V(RAW_DC)", metric: "average", startFraction: 0.75, expected: approximate(7.55647, 0.01) },
        { signalName: "V(RAW_DC)", metric: "peakToPeak", startFraction: 0.75, expected: approximate(0.616846, 0.01) },
        { signalName: "V(REGULATED)", metric: "average", startFraction: 0.75, expected: approximate(5.18519, 0.005) },
        { signalName: "V(REGULATED)", metric: "peakToPeak", startFraction: 0.75, expected: approximate(0.0278274, 0.003) },
      ],
    }),
  }
}

function pnpCurrentMirrorComplianceCase() {
  return {
    id: "frontier-pnp-current-mirror-compliance",
    title: "PNP mirror output-compliance comparison",
    prompt:
      "Build a beta-100 three-PNP high-side current mirror from 5 V. Diode-connect QREF and set its MIRROR_BASE branch with 2 kOhm to GND. Tie all emitters to VCC and all bases to MIRROR_BASE. Load ACTIVE_OUT with 1 kOhm and LIMITED_OUT with 10 kOhm to GND. Preserve both outputs, simulate, and compare voltages and signed currents to show forward-active mirroring versus compliance-limited saturation.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 5 } },
        { type: "resistor", refdes: "RREF", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RACTIVE", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RLIMITED", props: { resistanceOhms: 10_000 } },
        { type: "pnp-transistor", refdes: "QREF", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "QACTIVE", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "QLIMITED", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "VCC", pin: "positive" },
            { refdes: "QREF", pin: "emitter" },
            { refdes: "QACTIVE", pin: "emitter" },
            { refdes: "QLIMITED", pin: "emitter" },
          ],
        },
        {
          name: "MIRROR_BASE",
          terminals: [
            { refdes: "QREF", pin: "base" },
            { refdes: "QREF", pin: "collector" },
            { refdes: "QACTIVE", pin: "base" },
            { refdes: "QLIMITED", pin: "base" },
            { refdes: "RREF", pin: "a" },
          ],
        },
        {
          name: "ACTIVE_OUT",
          terminals: [
            { refdes: "QACTIVE", pin: "collector" },
            { refdes: "RACTIVE", pin: "a" },
          ],
        },
        {
          name: "LIMITED_OUT",
          terminals: [
            { refdes: "QLIMITED", pin: "collector" },
            { refdes: "RLIMITED", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "RREF", pin: "b" },
            { refdes: "RACTIVE", pin: "b" },
            { refdes: "RLIMITED", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "MIRROR_BASE", "ACTIVE_OUT", "LIMITED_OUT"],
      netVoltages: [
        { name: "MIRROR_BASE", expected: approximate(4.2738, 0.01) },
        { name: "ACTIVE_OUT", expected: approximate(1.60321, 0.01) },
        { name: "LIMITED_OUT", expected: approximate(4.97198, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RACTIVE", metric: "current", expected: approximate(0.00160321, 0.00001) },
        { refdes: "RLIMITED", metric: "current", expected: approximate(0.0004972, 0.00001) },
      ],
    }),
  }
}

function nmosSourceDegenerationTransientCase() {
  return {
    id: "frontier-nmos-source-degeneration-transient",
    title: "Transient NMOS source-degeneration comparison",
    prompt:
      "Build two 2 V-threshold NMOS common-source amplifiers from 12 V with 2 kOhm drain resistors. Drive both gates with a 0.25 V-peak, 100 Hz sine stacked on 2.5 V DC. Ground MFIXED source directly and give MDEG a 470 Ohm source resistor. Preserve GATE, FIXED_DRAIN, DEGENERATED_DRAIN, and DEGENERATED_SOURCE, simulate 50 ms, and compare settled drain swing and bias to demonstrate local feedback.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VDD", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VBIAS", props: { voltageVolts: 2.5 } },
        { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 0.25, frequencyHertz: 100 } },
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
    },
    expected: expected({
      requiredNetNames: ["GND", "GATE", "FIXED_DRAIN", "DEGENERATED_DRAIN", "DEGENERATED_SOURCE"],
      traceRanges: [
        { signalName: "V(GATE)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.5, 0.01) },
        { signalName: "V(FIXED_DRAIN)", metric: "average", startFraction: 0.5, expected: approximate(2.81111, 0.02) },
        { signalName: "V(FIXED_DRAIN)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(8.1747, 0.02) },
        { signalName: "V(DEGENERATED_DRAIN)", metric: "average", startFraction: 0.5, expected: approximate(10.52435, 0.02) },
        { signalName: "V(DEGENERATED_DRAIN)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(1.71245, 0.02) },
      ],
    }),
  }
}

function comparatorDutyNmosSwitchCase() {
  return {
    id: "frontier-comparator-duty-nmos-switch",
    title: "Threshold comparator driving an NMOS switch",
    prompt:
      "Build a 0-to-5 V ideal comparator whose non-inverting input is a 5 V-peak, 100 Hz sine and whose inverting input is held at 2.5 V. Feed COMP_OUT through 1 kOhm to the gate of a 2 V-threshold NMOS. Pull SWITCH_OUT up to 12 V through 1 kOhm with the NMOS source at GND. Preserve INPUT, REFERENCE, COMP_OUT, GATE, and SWITCH_OUT, simulate four cycles, and report complementary pulse levels and settled averages.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VDD", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VREF", props: { voltageVolts: 2.5 } },
        { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 5, frequencyHertz: 100 } },
        { type: "resistor", refdes: "RG", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RD", props: { resistanceOhms: 1_000 } },
        { type: "n-mosfet", refdes: "M1", props: { thresholdVolts: 2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
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
          name: "VDD",
          terminals: [
            { refdes: "VDD", pin: "positive" },
            { refdes: "RD", pin: "a" },
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
          name: "COMP_OUT",
          terminals: [
            { refdes: "U1", pin: "output" },
            { refdes: "RG", pin: "a" },
          ],
        },
        {
          name: "GATE",
          terminals: [
            { refdes: "RG", pin: "b" },
            { refdes: "M1", pin: "gate" },
          ],
        },
        {
          name: "SWITCH_OUT",
          terminals: [
            { refdes: "RD", pin: "b" },
            { refdes: "M1", pin: "drain" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "VDD", pin: "negative" },
            { refdes: "VREF", pin: "negative" },
            { refdes: "VIN", pin: "negative" },
            { refdes: "U1", pin: "vMinus" },
            { refdes: "M1", pin: "source" },
          ],
        },
      ],
      analysis: analysis(40, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "REFERENCE", "COMP_OUT", "GATE", "SWITCH_OUT"],
      traces: [
        { signalName: "V(COMP_OUT)", atSeconds: 0.0025, expected: approximate(5, 0.01) },
        { signalName: "V(SWITCH_OUT)", atSeconds: 0.0025, expected: approximate(0.08041, 0.01) },
        { signalName: "V(SWITCH_OUT)", atSeconds: 0.0075, expected: approximate(12, 0.05) },
      ],
      traceRanges: [
        { signalName: "V(COMP_OUT)", metric: "average", startFraction: 0.25, expected: approximate(1.65889, 0.02) },
        { signalName: "V(SWITCH_OUT)", metric: "average", startFraction: 0.25, expected: approximate(8.0268, 0.015) },
        { signalName: "V(SWITCH_OUT)", metric: "peakToPeak", startFraction: 0.25, expected: approximate(11.91959, 0.02) },
      ],
    }),
  }
}

function envelopeLoadComparisonCase() {
  return {
    id: "frontier-envelope-load-comparison",
    title: "Envelope detector under two loads",
    prompt:
      "Build two independent diode envelope detectors from one 5 V-peak, 1 kHz sine. Give each branch one DDEFAULT diode and 1 uF hold capacitor. Load LIGHT_ENV with 100 kOhm and HEAVY_ENV with 5 kOhm. Preserve INPUT, LIGHT_ENV, and HEAVY_ENV, simulate 50 ms, and compare settled averages and ripple to show capacitor discharge under load.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 5, frequencyHertz: 1_000 } },
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
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "LIGHT_ENV", "HEAVY_ENV"],
      traceRanges: [
        { signalName: "V(LIGHT_ENV)", metric: "average", startFraction: 0.5, expected: approximate(4.32994, 0.01) },
        { signalName: "V(LIGHT_ENV)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.04027, 0.005) },
        { signalName: "V(HEAVY_ENV)", metric: "average", startFraction: 0.5, expected: approximate(3.98006, 0.01) },
        { signalName: "V(HEAVY_ENV)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.70622, 0.01) },
      ],
    }),
  }
}

function comparatorWindowLogicPulseCase() {
  return {
    id: "frontier-comparator-window-logic-pulse",
    title: "Analog window converted to a logic pulse",
    prompt:
      "Build a window pulse generator from a 5 V-peak, 100 Hz sine INPUT. Use two ideal 0-to-5 V comparators powered from 5 V and GND: LOW_OK is high above a 1 V LOWER reference, HIGH_OK is high below a 3 V UPPER reference. Feed those outputs into a two-input 5 V AND gate referenced to GND and load WINDOW with a 10 kOhm resistor. Preserve INPUT, LOWER, UPPER, LOW_OK, HIGH_OK, and WINDOW, simulate four cycles, and report samples and average showing pulses only while INPUT lies inside the window.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VLOW", props: { voltageVolts: 1 } },
        { type: "dc-voltage-source", refdes: "VHIGH", props: { voltageVolts: 3 } },
        { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 5, frequencyHertz: 100 } },
        { type: "ideal-op-amp-minus-top", refdes: "ULOW", props: { gain: 100_000, minOutputVolts: 0, maxOutputVolts: 5 } },
        { type: "ideal-op-amp-minus-top", refdes: "UHIGH", props: { gain: 100_000, minOutputVolts: 0, maxOutputVolts: 5 } },
        { type: "and-gate", refdes: "UAND", props: { inputCount: 2, highLogicVoltageVolts: 5 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 10_000 } },
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
          name: "INPUT",
          terminals: [
            { refdes: "VIN", pin: "positive" },
            { refdes: "ULOW", pin: "nonInverting" },
            { refdes: "UHIGH", pin: "inverting" },
          ],
        },
        {
          name: "LOWER",
          terminals: [
            { refdes: "VLOW", pin: "positive" },
            { refdes: "ULOW", pin: "inverting" },
          ],
        },
        {
          name: "UPPER",
          terminals: [
            { refdes: "VHIGH", pin: "positive" },
            { refdes: "UHIGH", pin: "nonInverting" },
          ],
        },
        {
          name: "LOW_OK",
          terminals: [
            { refdes: "ULOW", pin: "output" },
            { refdes: "UAND", pin: "a" },
          ],
        },
        {
          name: "HIGH_OK",
          terminals: [
            { refdes: "UHIGH", pin: "output" },
            { refdes: "UAND", pin: "b" },
          ],
        },
        {
          name: "WINDOW",
          terminals: [
            { refdes: "UAND", pin: "output" },
            { refdes: "RLOAD", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "VLOW", pin: "negative" },
            { refdes: "VHIGH", pin: "negative" },
            { refdes: "VIN", pin: "negative" },
            { refdes: "ULOW", pin: "vMinus" },
            { refdes: "UHIGH", pin: "vMinus" },
            { refdes: "UAND", pin: "reference" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(40, 0.02),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "LOWER", "UPPER", "LOW_OK", "HIGH_OK", "WINDOW"],
      traces: [
        { signalName: "V(WINDOW)", atSeconds: 0.001, expected: approximate(5, 0.01) },
        { signalName: "V(WINDOW)", atSeconds: 0.0025, expected: approximate(0, 0.01) },
        { signalName: "V(WINDOW)", atSeconds: 0.004, expected: approximate(5, 0.01) },
        { signalName: "V(WINDOW)", atSeconds: 0.0075, expected: approximate(0, 0.01) },
      ],
      traceRanges: [
        { signalName: "V(WINDOW)", metric: "minimum", startFraction: 0.25, expected: approximate(0, 0.01) },
        { signalName: "V(WINDOW)", metric: "maximum", startFraction: 0.25, expected: approximate(5, 0.01) },
        { signalName: "V(WINDOW)", metric: "average", startFraction: 0.25, expected: approximate(0.70391, 0.02) },
      ],
    }),
  }
}

function zenerBjtCurrentSinkComplianceCase() {
  return {
    id: "frontier-zener-bjt-current-sink-compliance",
    title: "Zener-referenced BJT current-sink compliance",
    prompt:
      "Build two beta-100 NPN current sinks from one 5.1 V Zener base reference on a 12 V rail. Feed the reference through 1 kOhm. Give each emitter 4.3 kOhm to GND; pull ACTIVE_COLLECTOR up through 3 kOhm and LIMITED_COLLECTOR through 10 kOhm. Preserve both emitter and collector nets, simulate, and compare their currents and collector-emitter headroom to show the high-load branch leaving forward-active compliance.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 12 } },
        { type: "resistor", refdes: "RZ", props: { resistanceOhms: 1_000 } },
        { type: "zener-diode", refdes: "DZ", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "npn-transistor", refdes: "QA", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "QL", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "resistor", refdes: "REA", props: { resistanceOhms: 4_300 } },
        { type: "resistor", refdes: "REL", props: { resistanceOhms: 4_300 } },
        { type: "resistor", refdes: "RCA", props: { resistanceOhms: 3_000 } },
        { type: "resistor", refdes: "RCL", props: { resistanceOhms: 10_000 } },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "VCC", pin: "positive" },
            { refdes: "RZ", pin: "a" },
            { refdes: "RCA", pin: "a" },
            { refdes: "RCL", pin: "a" },
          ],
        },
        {
          name: "VREF",
          terminals: [
            { refdes: "RZ", pin: "b" },
            { refdes: "DZ", pin: "cathode" },
            { refdes: "QA", pin: "base" },
            { refdes: "QL", pin: "base" },
          ],
        },
        {
          name: "ACTIVE_EMITTER",
          terminals: [
            { refdes: "QA", pin: "emitter" },
            { refdes: "REA", pin: "a" },
          ],
        },
        {
          name: "LIMITED_EMITTER",
          terminals: [
            { refdes: "QL", pin: "emitter" },
            { refdes: "REL", pin: "a" },
          ],
        },
        {
          name: "ACTIVE_COLLECTOR",
          terminals: [
            { refdes: "RCA", pin: "b" },
            { refdes: "QA", pin: "collector" },
          ],
        },
        {
          name: "LIMITED_COLLECTOR",
          terminals: [
            { refdes: "RCL", pin: "b" },
            { refdes: "QL", pin: "collector" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "DZ", pin: "anode" },
            { refdes: "REA", pin: "b" },
            { refdes: "REL", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "VREF", "ACTIVE_EMITTER", "LIMITED_EMITTER", "ACTIVE_COLLECTOR", "LIMITED_COLLECTOR"],
      netVoltages: [
        { name: "VREF", expected: approximate(5.21312, 0.02) },
        { name: "ACTIVE_EMITTER", expected: approximate(4.49847, 0.02) },
        { name: "ACTIVE_COLLECTOR", expected: approximate(8.88872, 0.03) },
        { name: "LIMITED_EMITTER", expected: approximate(4.49122, 0.02) },
        { name: "LIMITED_COLLECTOR", expected: approximate(4.53098, 0.03) },
      ],
      componentMeasurements: [
        { refdes: "RCA", metric: "current", expected: approximate(0.00103709, 0.00001) },
        { refdes: "RCL", metric: "current", expected: approximate(0.000746902, 0.00001) },
        { refdes: "REL", metric: "current", expected: approximate(0.00104447, 0.00001) },
      ],
    }),
  }
}

function bjtDifferentialVsCommonModeCase() {
  return {
    id: "frontier-bjt-differential-vs-common-mode",
    title: "BJT differential versus common-mode response",
    prompt:
      "Build two separate beta-100 NPN differential pairs on shared +5 V and -5 V rails. Give every collector 2 kOhm to +5 V and each pair its own 2 kOhm tail resistor to -5 V. Drive the first pair at +50 mV and -50 mV; drive both bases of the second pair at +50 mV. Preserve all four collector nets and both tails, then compare large differential steering with common-mode branch balance.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -5 } },
        { type: "dc-voltage-source", refdes: "VDH", props: { voltageVolts: 0.05 } },
        { type: "dc-voltage-source", refdes: "VDL", props: { voltageVolts: -0.05 } },
        { type: "dc-voltage-source", refdes: "VCM", props: { voltageVolts: 0.05 } },
        { type: "resistor", refdes: "RCDH", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RCDL", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RCC1", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RCC2", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RTD", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RTC", props: { resistanceOhms: 2_000 } },
        { type: "npn-transistor", refdes: "QDH", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "QDL", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "QC1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "QC2", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VPLUS",
          terminals: [
            { refdes: "VPOS", pin: "positive" },
            { refdes: "RCDH", pin: "a" },
            { refdes: "RCDL", pin: "a" },
            { refdes: "RCC1", pin: "a" },
            { refdes: "RCC2", pin: "a" },
          ],
        },
        {
          name: "VMINUS",
          terminals: [
            { refdes: "VNEG", pin: "positive" },
            { refdes: "RTD", pin: "b" },
            { refdes: "RTC", pin: "b" },
          ],
        },
        { name: "DIFF_HIGH_INPUT", terminals: [{ refdes: "VDH", pin: "positive" }, { refdes: "QDH", pin: "base" }] },
        { name: "DIFF_LOW_INPUT", terminals: [{ refdes: "VDL", pin: "positive" }, { refdes: "QDL", pin: "base" }] },
        { name: "COMMON_INPUT", terminals: [{ refdes: "VCM", pin: "positive" }, { refdes: "QC1", pin: "base" }, { refdes: "QC2", pin: "base" }] },
        { name: "DIFF_HIGH_COLLECTOR", terminals: [{ refdes: "RCDH", pin: "b" }, { refdes: "QDH", pin: "collector" }] },
        { name: "DIFF_LOW_COLLECTOR", terminals: [{ refdes: "RCDL", pin: "b" }, { refdes: "QDL", pin: "collector" }] },
        { name: "COMMON_1_COLLECTOR", terminals: [{ refdes: "RCC1", pin: "b" }, { refdes: "QC1", pin: "collector" }] },
        { name: "COMMON_2_COLLECTOR", terminals: [{ refdes: "RCC2", pin: "b" }, { refdes: "QC2", pin: "collector" }] },
        { name: "DIFF_TAIL", terminals: [{ refdes: "QDH", pin: "emitter" }, { refdes: "QDL", pin: "emitter" }, { refdes: "RTD", pin: "a" }] },
        { name: "COMMON_TAIL", terminals: [{ refdes: "QC1", pin: "emitter" }, { refdes: "QC2", pin: "emitter" }, { refdes: "RTC", pin: "a" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VDH", pin: "negative" },
            { refdes: "VDL", pin: "negative" },
            { refdes: "VCM", pin: "negative" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "DIFF_HIGH_COLLECTOR", "DIFF_LOW_COLLECTOR", "COMMON_1_COLLECTOR", "COMMON_2_COLLECTOR", "DIFF_TAIL", "COMMON_TAIL"],
      netVoltages: [
        { name: "DIFF_HIGH_COLLECTOR", expected: approximate(0.81716, 0.02) },
        { name: "DIFF_LOW_COLLECTOR", expected: approximate(4.90878, 0.02) },
        { name: "COMMON_1_COLLECTOR", expected: approximate(2.85377, 0.02) },
        { name: "COMMON_2_COLLECTOR", expected: approximate(2.85377, 0.02) },
        { name: "DIFF_TAIL", expected: approximate(-0.68356, 0.02) },
        { name: "COMMON_TAIL", expected: approximate(-0.66578, 0.02) },
      ],
    }),
  }
}

function dualFrequencyOpAmpIntegratorsCase() {
  return {
    id: "frontier-dual-frequency-op-amp-integrators",
    title: "Dual-frequency leaky op amp integrators",
    prompt:
      "Build two identical inverting leaky integrators on shared +/-12 V supplies with +/-10 V output limits. Each uses 10 kOhm input resistance and parallel 50 kOhm plus 0.1 uF feedback, with a 20 kOhm output load. Drive LOW_INPUT at 1 V peak and 100 Hz and HIGH_INPUT at 1 V peak and 500 Hz. Preserve both summing and output nets, simulate 40 ms, and compare settled output swings and virtual-ground errors.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "sine-voltage-source", refdes: "VLOW", props: { amplitudeVolts: 1, frequencyHertz: 100 } },
        { type: "sine-voltage-source", refdes: "VHIGH", props: { amplitudeVolts: 1, frequencyHertz: 500 } },
        { type: "resistor", refdes: "RIL", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RFL", props: { resistanceOhms: 50_000 } },
        { type: "capacitor", refdes: "CFL", props: { capacitanceFarads: 0.0000001 } },
        { type: "resistor", refdes: "RLL", props: { resistanceOhms: 20_000 } },
        { type: "resistor", refdes: "RIH", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RFH", props: { resistanceOhms: 50_000 } },
        { type: "capacitor", refdes: "CFH", props: { capacitanceFarads: 0.0000001 } },
        { type: "resistor", refdes: "RLH", props: { resistanceOhms: 20_000 } },
        { type: "ideal-op-amp-minus-top", refdes: "UL", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
        { type: "ideal-op-amp-minus-top", refdes: "UH", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "UL", pin: "vPlus" }, { refdes: "UH", pin: "vPlus" }] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "UL", pin: "vMinus" }, { refdes: "UH", pin: "vMinus" }] },
        { name: "LOW_INPUT", terminals: [{ refdes: "VLOW", pin: "positive" }, { refdes: "RIL", pin: "a" }] },
        { name: "HIGH_INPUT", terminals: [{ refdes: "VHIGH", pin: "positive" }, { refdes: "RIH", pin: "a" }] },
        { name: "LOW_SUM", terminals: [{ refdes: "RIL", pin: "b" }, { refdes: "RFL", pin: "a" }, { refdes: "CFL", pin: "a" }, { refdes: "UL", pin: "inverting" }] },
        { name: "HIGH_SUM", terminals: [{ refdes: "RIH", pin: "b" }, { refdes: "RFH", pin: "a" }, { refdes: "CFH", pin: "a" }, { refdes: "UH", pin: "inverting" }] },
        { name: "LOW_OUT", terminals: [{ refdes: "RFL", pin: "b" }, { refdes: "CFL", pin: "b" }, { refdes: "RLL", pin: "a" }, { refdes: "UL", pin: "output" }] },
        { name: "HIGH_OUT", terminals: [{ refdes: "RFH", pin: "b" }, { refdes: "CFH", pin: "b" }, { refdes: "RLH", pin: "a" }, { refdes: "UH", pin: "output" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VLOW", pin: "negative" },
            { refdes: "VHIGH", pin: "negative" },
            { refdes: "UL", pin: "nonInverting" },
            { refdes: "UH", pin: "nonInverting" },
            { refdes: "RLL", pin: "b" },
            { refdes: "RLH", pin: "b" },
          ],
        },
      ],
      analysis: analysis(40, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "LOW_INPUT", "HIGH_INPUT", "LOW_SUM", "HIGH_SUM", "LOW_OUT", "HIGH_OUT"],
      traceRanges: [
        { signalName: "V(LOW_OUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(3.04227, 0.03) },
        { signalName: "V(HIGH_OUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.63789, 0.01) },
        { signalName: "V(LOW_SUM)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.00003042, 0.000002) },
        { signalName: "V(HIGH_SUM)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.00000638, 0.000001) },
      ],
    }),
  }
}

function dualFrequencyOpAmpDifferentiatorsCase() {
  return {
    id: "frontier-dual-frequency-op-amp-differentiators",
    title: "Dual-frequency practical op amp differentiators",
    prompt:
      "Build two identical practical inverting differentiators on shared +/-12 V supplies with +/-10 V output limits. Each input passes through 0.1 uF in series with 1 kOhm to its summing node, with 10 kOhm feedback and a 20 kOhm load. Drive LOW_INPUT at 1 V peak and 100 Hz and HIGH_INPUT at 1 V peak and 500 Hz. Preserve both coupled, summing, and output nets, simulate 40 ms, and compare settled output swings and virtual-ground errors.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "sine-voltage-source", refdes: "VLOW", props: { amplitudeVolts: 1, frequencyHertz: 100 } },
        { type: "sine-voltage-source", refdes: "VHIGH", props: { amplitudeVolts: 1, frequencyHertz: 500 } },
        { type: "capacitor", refdes: "CIL", props: { capacitanceFarads: 0.0000001 } },
        { type: "resistor", refdes: "RIL", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RFL", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RLL", props: { resistanceOhms: 20_000 } },
        { type: "capacitor", refdes: "CIH", props: { capacitanceFarads: 0.0000001 } },
        { type: "resistor", refdes: "RIH", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RFH", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RLH", props: { resistanceOhms: 20_000 } },
        { type: "ideal-op-amp-minus-top", refdes: "UL", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
        { type: "ideal-op-amp-minus-top", refdes: "UH", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "UL", pin: "vPlus" }, { refdes: "UH", pin: "vPlus" }] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "UL", pin: "vMinus" }, { refdes: "UH", pin: "vMinus" }] },
        { name: "LOW_INPUT", terminals: [{ refdes: "VLOW", pin: "positive" }, { refdes: "CIL", pin: "a" }] },
        { name: "HIGH_INPUT", terminals: [{ refdes: "VHIGH", pin: "positive" }, { refdes: "CIH", pin: "a" }] },
        { name: "LOW_COUPLED", terminals: [{ refdes: "CIL", pin: "b" }, { refdes: "RIL", pin: "a" }] },
        { name: "HIGH_COUPLED", terminals: [{ refdes: "CIH", pin: "b" }, { refdes: "RIH", pin: "a" }] },
        { name: "LOW_SUM", terminals: [{ refdes: "RIL", pin: "b" }, { refdes: "RFL", pin: "a" }, { refdes: "UL", pin: "inverting" }] },
        { name: "HIGH_SUM", terminals: [{ refdes: "RIH", pin: "b" }, { refdes: "RFH", pin: "a" }, { refdes: "UH", pin: "inverting" }] },
        { name: "LOW_OUT", terminals: [{ refdes: "RFL", pin: "b" }, { refdes: "RLL", pin: "a" }, { refdes: "UL", pin: "output" }] },
        { name: "HIGH_OUT", terminals: [{ refdes: "RFH", pin: "b" }, { refdes: "RLH", pin: "a" }, { refdes: "UH", pin: "output" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VLOW", pin: "negative" },
            { refdes: "VHIGH", pin: "negative" },
            { refdes: "UL", pin: "nonInverting" },
            { refdes: "UH", pin: "nonInverting" },
            { refdes: "RLL", pin: "b" },
            { refdes: "RLH", pin: "b" },
          ],
        },
      ],
      analysis: analysis(40, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "LOW_INPUT", "HIGH_INPUT", "LOW_COUPLED", "HIGH_COUPLED", "LOW_SUM", "HIGH_SUM", "LOW_OUT", "HIGH_OUT"],
      traceRanges: [
        { signalName: "V(LOW_OUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(1.25413, 0.02) },
        { signalName: "V(HIGH_OUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(5.97626, 0.05) },
        { signalName: "V(LOW_SUM)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.000012541, 0.000001) },
        { signalName: "V(HIGH_SUM)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.000059763, 0.000003) },
      ],
    }),
  }
}

function pnpDifferentialVsCommonModeCase() {
  return {
    id: "frontier-pnp-differential-vs-common-mode",
    title: "PNP differential versus common-mode response",
    prompt:
      "Build two separate beta-100 PNP differential pairs on shared +5 V and -5 V rails. Give each pair a 2 kOhm emitter-tail resistor to +5 V and every collector a 2 kOhm resistor to -5 V. Drive the first pair's bases at -50 mV and +50 mV; drive both bases of the second pair at +50 mV. Preserve all collectors and tails, then compare lower-base current steering with common-mode branch balance.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -5 } },
        { type: "dc-voltage-source", refdes: "VDL", props: { voltageVolts: -0.05 } },
        { type: "dc-voltage-source", refdes: "VDH", props: { voltageVolts: 0.05 } },
        { type: "dc-voltage-source", refdes: "VCM", props: { voltageVolts: 0.05 } },
        { type: "resistor", refdes: "RCDL", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RCDH", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RCC1", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RCC2", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RTD", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RTC", props: { resistanceOhms: 2_000 } },
        { type: "pnp-transistor", refdes: "QDL", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "QDH", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "QC1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "QC2", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "RTD", pin: "a" }, { refdes: "RTC", pin: "a" }] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "RCDL", pin: "b" }, { refdes: "RCDH", pin: "b" }, { refdes: "RCC1", pin: "b" }, { refdes: "RCC2", pin: "b" }] },
        { name: "DIFF_LOW_INPUT", terminals: [{ refdes: "VDL", pin: "positive" }, { refdes: "QDL", pin: "base" }] },
        { name: "DIFF_HIGH_INPUT", terminals: [{ refdes: "VDH", pin: "positive" }, { refdes: "QDH", pin: "base" }] },
        { name: "COMMON_INPUT", terminals: [{ refdes: "VCM", pin: "positive" }, { refdes: "QC1", pin: "base" }, { refdes: "QC2", pin: "base" }] },
        { name: "DIFF_LOW_COLLECTOR", terminals: [{ refdes: "RCDL", pin: "a" }, { refdes: "QDL", pin: "collector" }] },
        { name: "DIFF_HIGH_COLLECTOR", terminals: [{ refdes: "RCDH", pin: "a" }, { refdes: "QDH", pin: "collector" }] },
        { name: "COMMON_1_COLLECTOR", terminals: [{ refdes: "RCC1", pin: "a" }, { refdes: "QC1", pin: "collector" }] },
        { name: "COMMON_2_COLLECTOR", terminals: [{ refdes: "RCC2", pin: "a" }, { refdes: "QC2", pin: "collector" }] },
        { name: "DIFF_TAIL", terminals: [{ refdes: "RTD", pin: "b" }, { refdes: "QDL", pin: "emitter" }, { refdes: "QDH", pin: "emitter" }] },
        { name: "COMMON_TAIL", terminals: [{ refdes: "RTC", pin: "b" }, { refdes: "QC1", pin: "emitter" }, { refdes: "QC2", pin: "emitter" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VDL", pin: "negative" },
            { refdes: "VDH", pin: "negative" },
            { refdes: "VCM", pin: "negative" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "DIFF_LOW_COLLECTOR", "DIFF_HIGH_COLLECTOR", "COMMON_1_COLLECTOR", "COMMON_2_COLLECTOR", "DIFF_TAIL", "COMMON_TAIL"],
      netVoltages: [
        { name: "DIFF_LOW_COLLECTOR", expected: approximate(-0.81716, 0.02) },
        { name: "DIFF_HIGH_COLLECTOR", expected: approximate(-4.90878, 0.02) },
        { name: "COMMON_1_COLLECTOR", expected: approximate(-2.90294, 0.02) },
        { name: "COMMON_2_COLLECTOR", expected: approximate(-2.90294, 0.02) },
        { name: "DIFF_TAIL", expected: approximate(0.68356, 0.02) },
        { name: "COMMON_TAIL", expected: approximate(0.76515, 0.02) },
      ],
    }),
  }
}

function zenerRegulatedLedColorsCase() {
  return {
    id: "frontier-zener-regulated-led-colors",
    title: "Zener-regulated red and blue LED branches",
    prompt:
      "Build a 5.1 V Zener shunt regulator from 12 V through 330 Ohm. From REGULATED, feed separate red and blue LEDs through 1 kOhm resistors to GND. Preserve REGULATED, RED_ANODE, and BLUE_ANODE, simulate, and report the regulated rail, both color-dependent forward drops, branch currents, and remaining Zener current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 12 } },
        { type: "resistor", refdes: "RZ", props: { resistanceOhms: 330 } },
        { type: "zener-diode", refdes: "DZ", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "resistor", refdes: "RR", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RB", props: { resistanceOhms: 1_000 } },
        { type: "led", refdes: "LEDR", props: { color: "red" } },
        { type: "led", refdes: "LEDB", props: { color: "blue" } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RZ", pin: "a" }] },
        { name: "REGULATED", terminals: [{ refdes: "RZ", pin: "b" }, { refdes: "DZ", pin: "cathode" }, { refdes: "RR", pin: "a" }, { refdes: "RB", pin: "a" }] },
        { name: "RED_ANODE", terminals: [{ refdes: "RR", pin: "b" }, { refdes: "LEDR", pin: "anode" }] },
        { name: "BLUE_ANODE", terminals: [{ refdes: "RB", pin: "b" }, { refdes: "LEDB", pin: "anode" }] },
        { name: "GND", terminals: [{ refdes: "VCC", pin: "negative" }, { refdes: "DZ", pin: "anode" }, { refdes: "LEDR", pin: "cathode" }, { refdes: "LEDB", pin: "cathode" }] },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "REGULATED", "RED_ANODE", "BLUE_ANODE"],
      netVoltages: [
        { name: "REGULATED", expected: approximate(5.31421, 0.02) },
        { name: "RED_ANODE", expected: approximate(1.85094, 0.02) },
        { name: "BLUE_ANODE", expected: approximate(3.02075, 0.03) },
      ],
      componentMeasurements: [
        { refdes: "RR", metric: "current", expected: approximate(0.00346326, 0.00005) },
        { refdes: "RB", metric: "current", expected: approximate(0.00229346, 0.00005) },
        { refdes: "RZ", metric: "current", expected: approximate(0.02026, 0.0001) },
      ],
    }),
  }
}

function complementaryCommonEmitterTransientsCase() {
  return {
    id: "frontier-complementary-common-emitter-transients",
    title: "Complementary NPN and PNP common-emitter transients",
    prompt:
      "Build complementary beta-100 common-emitter amplifiers on +9 V and -9 V rails. Drive the NPN base path with a 20 mV-peak, 100 Hz sine centered at +1.5 V and the PNP base path with an in-phase 20 mV-peak sine centered at -1.5 V. Give each a 10 kOhm base resistor, 3.3 kOhm collector resistor, and 1 kOhm emitter resistor. Preserve both inputs, collectors, and emitters, simulate six cycles, and compare mirrored DC bias, equal output swing, and phase inversion.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 9 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -9 } },
        { type: "dc-voltage-source", refdes: "VNBIAS", props: { voltageVolts: 1.5 } },
        { type: "dc-voltage-source", refdes: "VPBIAS", props: { voltageVolts: -1.5 } },
        { type: "sine-voltage-source", refdes: "VNIN", props: { amplitudeVolts: 0.02, frequencyHertz: 100 } },
        { type: "sine-voltage-source", refdes: "VPIN", props: { amplitudeVolts: 0.02, frequencyHertz: 100 } },
        { type: "resistor", refdes: "RBN", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RCN", props: { resistanceOhms: 3_300 } },
        { type: "resistor", refdes: "REN", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RBP", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RCP", props: { resistanceOhms: 3_300 } },
        { type: "resistor", refdes: "REP", props: { resistanceOhms: 1_000 } },
        { type: "npn-transistor", refdes: "QN", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "QP", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VPOS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "RCN", pin: "a" }] },
        { name: "VNEG", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "RCP", pin: "b" }] },
        { name: "N_BIAS", terminals: [{ refdes: "VNBIAS", pin: "positive" }, { refdes: "VNIN", pin: "negative" }] },
        { name: "P_BIAS", terminals: [{ refdes: "VPBIAS", pin: "positive" }, { refdes: "VPIN", pin: "negative" }] },
        { name: "N_INPUT", terminals: [{ refdes: "VNIN", pin: "positive" }, { refdes: "RBN", pin: "a" }] },
        { name: "P_INPUT", terminals: [{ refdes: "VPIN", pin: "positive" }, { refdes: "RBP", pin: "a" }] },
        { name: "N_BASE", terminals: [{ refdes: "RBN", pin: "b" }, { refdes: "QN", pin: "base" }] },
        { name: "P_BASE", terminals: [{ refdes: "RBP", pin: "b" }, { refdes: "QP", pin: "base" }] },
        { name: "N_COLLECTOR", terminals: [{ refdes: "RCN", pin: "b" }, { refdes: "QN", pin: "collector" }] },
        { name: "P_COLLECTOR", terminals: [{ refdes: "RCP", pin: "a" }, { refdes: "QP", pin: "collector" }] },
        { name: "N_EMITTER", terminals: [{ refdes: "QN", pin: "emitter" }, { refdes: "REN", pin: "a" }] },
        { name: "P_EMITTER", terminals: [{ refdes: "QP", pin: "emitter" }, { refdes: "REP", pin: "b" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VNBIAS", pin: "negative" },
            { refdes: "VPBIAS", pin: "negative" },
            { refdes: "REN", pin: "b" },
            { refdes: "REP", pin: "a" },
          ],
        },
      ],
      analysis: analysis(60, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "N_INPUT", "P_INPUT", "N_COLLECTOR", "P_COLLECTOR", "N_EMITTER", "P_EMITTER"],
      traceRanges: [
        { signalName: "V(N_COLLECTOR)", metric: "average", startFraction: 0.5, expected: approximate(6.62445, 0.02) },
        { signalName: "V(P_COLLECTOR)", metric: "average", startFraction: 0.5, expected: approximate(-6.62445, 0.02) },
        { signalName: "V(N_COLLECTOR)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.11532, 0.005) },
        { signalName: "V(P_COLLECTOR)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.11532, 0.005) },
      ],
    }),
  }
}

function zenerPnpCurrentSourceComplianceCase() {
  return {
    id: "frontier-zener-pnp-current-source-compliance",
    title: "Zener-referenced PNP current-source compliance",
    prompt:
      "Build two beta-100 high-side PNP current-source branches from 12 V using one 5.1 V Zener base reference fed through 680 Ohm. Give each emitter a 6.2 kOhm resistor to 12 V. Load ACTIVE_COLLECTOR with 2 kOhm to GND and LIMITED_COLLECTOR with 10 kOhm to GND. Preserve VREF, both emitters, and both collectors, simulate, and compare the forward-active branch with the branch that runs out of collector-emitter compliance.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 12 } },
        { type: "resistor", refdes: "RZ", props: { resistanceOhms: 680 } },
        { type: "zener-diode", refdes: "DZ", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "resistor", refdes: "REA", props: { resistanceOhms: 6_200 } },
        { type: "resistor", refdes: "REL", props: { resistanceOhms: 6_200 } },
        { type: "resistor", refdes: "RLA", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RLL", props: { resistanceOhms: 10_000 } },
        { type: "pnp-transistor", refdes: "QA", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "QL", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RZ", pin: "a" }, { refdes: "REA", pin: "a" }, { refdes: "REL", pin: "a" }] },
        { name: "VREF", terminals: [{ refdes: "RZ", pin: "b" }, { refdes: "DZ", pin: "cathode" }, { refdes: "QA", pin: "base" }, { refdes: "QL", pin: "base" }] },
        { name: "ACTIVE_EMITTER", terminals: [{ refdes: "REA", pin: "b" }, { refdes: "QA", pin: "emitter" }] },
        { name: "LIMITED_EMITTER", terminals: [{ refdes: "REL", pin: "b" }, { refdes: "QL", pin: "emitter" }] },
        { name: "ACTIVE_COLLECTOR", terminals: [{ refdes: "QA", pin: "collector" }, { refdes: "RLA", pin: "a" }] },
        { name: "LIMITED_COLLECTOR", terminals: [{ refdes: "QL", pin: "collector" }, { refdes: "RLL", pin: "a" }] },
        { name: "GND", terminals: [{ refdes: "VCC", pin: "negative" }, { refdes: "DZ", pin: "anode" }, { refdes: "RLA", pin: "b" }, { refdes: "RLL", pin: "b" }] },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "VREF", "ACTIVE_EMITTER", "LIMITED_EMITTER", "ACTIVE_COLLECTOR", "LIMITED_COLLECTOR"],
      netVoltages: [
        { name: "VREF", expected: approximate(5.26321, 0.02) },
        { name: "ACTIVE_EMITTER", expected: approximate(5.97604, 0.02) },
        { name: "LIMITED_EMITTER", expected: approximate(5.98517, 0.02) },
        { name: "ACTIVE_COLLECTOR", expected: approximate(1.92459, 0.02) },
        { name: "LIMITED_COLLECTOR", expected: approximate(5.95158, 0.02) },
      ],
      componentMeasurements: [
        { refdes: "RLA", metric: "current", expected: approximate(0.000962294, 0.00001) },
        { refdes: "RLL", metric: "current", expected: approximate(0.000595158, 0.00001) },
      ],
    }),
  }
}

function zenerSeriesLedHeadroomCase() {
  return {
    id: "frontier-zener-series-led-headroom",
    title: "Zener rail LED-string headroom comparison",
    prompt:
      "Build a 5.1 V Zener shunt from 12 V through 330 Ohm. From REGULATED, feed one red LED through 1 kOhm and a separate blue-then-red series string through another 1 kOhm, both to GND. Preserve RED_ANODE, STRING_TOP, and STRING_MID, simulate, and compare individual color drops, total string drop, equal-resistor voltage drops, branch currents, and remaining Zener current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 12 } },
        { type: "resistor", refdes: "RZ", props: { resistanceOhms: 330 } },
        { type: "zener-diode", refdes: "DZ", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "resistor", refdes: "RRED", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RSTRING", props: { resistanceOhms: 1_000 } },
        { type: "led", refdes: "LED_ONLY_RED", props: { color: "red" } },
        { type: "led", refdes: "LED_STRING_BLUE", props: { color: "blue" } },
        { type: "led", refdes: "LED_STRING_RED", props: { color: "red" } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RZ", pin: "a" }] },
        { name: "REGULATED", terminals: [{ refdes: "RZ", pin: "b" }, { refdes: "DZ", pin: "cathode" }, { refdes: "RRED", pin: "a" }, { refdes: "RSTRING", pin: "a" }] },
        { name: "RED_ANODE", terminals: [{ refdes: "RRED", pin: "b" }, { refdes: "LED_ONLY_RED", pin: "anode" }] },
        { name: "STRING_TOP", terminals: [{ refdes: "RSTRING", pin: "b" }, { refdes: "LED_STRING_BLUE", pin: "anode" }] },
        { name: "STRING_MID", terminals: [{ refdes: "LED_STRING_BLUE", pin: "cathode" }, { refdes: "LED_STRING_RED", pin: "anode" }] },
        { name: "GND", terminals: [{ refdes: "VCC", pin: "negative" }, { refdes: "DZ", pin: "anode" }, { refdes: "LED_ONLY_RED", pin: "cathode" }, { refdes: "LED_STRING_RED", pin: "cathode" }] },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "REGULATED", "RED_ANODE", "STRING_TOP", "STRING_MID"],
      netVoltages: [
        { name: "REGULATED", expected: approximate(5.33291, 0.02) },
        { name: "RED_ANODE", expected: approximate(1.85122, 0.02) },
        { name: "STRING_TOP", expected: approximate(4.71473, 0.02) },
        { name: "STRING_MID", expected: approximate(1.7618, 0.02) },
      ],
      componentMeasurements: [
        { refdes: "RRED", metric: "current", expected: approximate(0.00348169, 0.00002) },
        { refdes: "RSTRING", metric: "current", expected: approximate(0.000618181, 0.00001) },
        { refdes: "LED_STRING_BLUE", metric: "voltage", expected: approximate(2.95293, 0.02) },
        { refdes: "LED_STRING_RED", metric: "voltage", expected: approximate(1.7618, 0.02) },
        { refdes: "RZ", metric: "current", expected: approximate(0.0202033, 0.0001) },
      ],
    }),
  }
}

function ordinaryVsPrecisionRectifierCase() {
  return {
    id: "frontier-ordinary-vs-precision-rectifier",
    title: "Ordinary versus precision half-wave rectification",
    prompt:
      "Drive two positive half-wave rectifier branches from one 1 V-peak, 100 Hz INPUT. The ordinary branch is one DDEFAULT diode feeding a 10 kOhm load. The precision branch uses a gain-100000 ideal op amp on +/-12 V supplies with +/-10 V limits, its output driving a DDEFAULT diode, and feedback from PRECISION_OUT to the inverting input; load it with 10 kOhm. Preserve ORDINARY_OUT, PRECISION_DRIVE, and PRECISION_OUT, simulate four cycles, and compare diode-drop loss, negative blocking, and positive peak recovery.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 1, frequencyHertz: 100 } },
        { type: "diode", refdes: "DORD", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "resistor", refdes: "RORD", props: { resistanceOhms: 10_000 } },
        { type: "ideal-op-amp-minus-top", refdes: "U1", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
        { type: "diode", refdes: "DPREC", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "resistor", refdes: "RPREC", props: { resistanceOhms: 10_000 } },
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "U1", pin: "vPlus" }] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "U1", pin: "vMinus" }] },
        { name: "INPUT", terminals: [{ refdes: "VIN", pin: "positive" }, { refdes: "DORD", pin: "anode" }, { refdes: "U1", pin: "nonInverting" }] },
        { name: "ORDINARY_OUT", terminals: [{ refdes: "DORD", pin: "cathode" }, { refdes: "RORD", pin: "a" }] },
        { name: "PRECISION_DRIVE", terminals: [{ refdes: "U1", pin: "output" }, { refdes: "DPREC", pin: "anode" }] },
        { name: "PRECISION_OUT", terminals: [{ refdes: "DPREC", pin: "cathode" }, { refdes: "U1", pin: "inverting" }, { refdes: "RPREC", pin: "a" }] },
        { name: "GND", terminals: [{ refdes: "VPOS", pin: "negative" }, { refdes: "VNEG", pin: "negative" }, { refdes: "VIN", pin: "negative" }, { refdes: "RORD", pin: "b" }, { refdes: "RPREC", pin: "b" }] },
      ],
      analysis: analysis(40, 0.02),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "ORDINARY_OUT", "PRECISION_DRIVE", "PRECISION_OUT"],
      traceRanges: [
        { signalName: "V(ORDINARY_OUT)", metric: "minimum", startFraction: 0.25, expected: approximate(0, 0.001) },
        { signalName: "V(ORDINARY_OUT)", metric: "maximum", startFraction: 0.25, expected: approximate(0.42648, 0.01) },
        { signalName: "V(PRECISION_OUT)", metric: "minimum", startFraction: 0.25, expected: approximate(0, 0.001) },
        { signalName: "V(PRECISION_OUT)", metric: "maximum", startFraction: 0.25, expected: approximate(0.99998, 0.005) },
      ],
    }),
  }
}

function zenerClampLoadSweepCase() {
  return {
    id: "frontier-zener-clamp-load-sweep",
    title: "Three-load Zener clamp sweep",
    prompt:
      "Drive three limiter branches from one 10 V-peak, 100 Hz INPUT. Give every branch a 1 kOhm source resistor and a 5.1 V, 10 Ohm-dynamic-resistance Zener from output cathode to GND. Load LIGHT_OUT with 10 kOhm, MEDIUM_OUT with 2 kOhm, and HEAVY_OUT with 500 Ohm. Simulate four cycles and compare positive peaks across strong breakdown, marginal breakdown, and passive-divider dropout, plus their negative forward clamps.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 10, frequencyHertz: 100 } },
        { type: "resistor", refdes: "RSL", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RSM", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RSH", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RLIGHT", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RMEDIUM", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RHEAVY", props: { resistanceOhms: 500 } },
        { type: "zener-diode", refdes: "DZL", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "zener-diode", refdes: "DZM", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "zener-diode", refdes: "DZH", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
      ],
      nets: [
        { name: "INPUT", terminals: [{ refdes: "VIN", pin: "positive" }, { refdes: "RSL", pin: "a" }, { refdes: "RSM", pin: "a" }, { refdes: "RSH", pin: "a" }] },
        { name: "LIGHT_OUT", terminals: [{ refdes: "RSL", pin: "b" }, { refdes: "RLIGHT", pin: "a" }, { refdes: "DZL", pin: "cathode" }] },
        { name: "MEDIUM_OUT", terminals: [{ refdes: "RSM", pin: "b" }, { refdes: "RMEDIUM", pin: "a" }, { refdes: "DZM", pin: "cathode" }] },
        { name: "HEAVY_OUT", terminals: [{ refdes: "RSH", pin: "b" }, { refdes: "RHEAVY", pin: "a" }, { refdes: "DZH", pin: "cathode" }] },
        { name: "GND", terminals: [{ refdes: "VIN", pin: "negative" }, { refdes: "RLIGHT", pin: "b" }, { refdes: "RMEDIUM", pin: "b" }, { refdes: "RHEAVY", pin: "b" }, { refdes: "DZL", pin: "anode" }, { refdes: "DZM", pin: "anode" }, { refdes: "DZH", pin: "anode" }] },
      ],
      analysis: analysis(40, 0.02),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "LIGHT_OUT", "MEDIUM_OUT", "HEAVY_OUT"],
      traceRanges: [
        { signalName: "V(LIGHT_OUT)", metric: "maximum", startFraction: 0.25, expected: approximate(5.18075, 0.02) },
        { signalName: "V(MEDIUM_OUT)", metric: "maximum", startFraction: 0.25, expected: approximate(5.1442, 0.02) },
        { signalName: "V(HEAVY_OUT)", metric: "maximum", startFraction: 0.25, expected: approximate(3.33333, 0.02) },
        { signalName: "V(LIGHT_OUT)", metric: "minimum", startFraction: 0.25, expected: approximate(-0.803443, 0.02) },
        { signalName: "V(MEDIUM_OUT)", metric: "minimum", startFraction: 0.25, expected: approximate(-0.79938, 0.02) },
        { signalName: "V(HEAVY_OUT)", metric: "minimum", startFraction: 0.25, expected: approximate(-0.78421, 0.02) },
      ],
    }),
  }
}

function classBVsClassAbCrossoverCase() {
  return {
    id: "frontier-class-b-vs-class-ab-crossover",
    title: "Class-B versus class-AB crossover tracking",
    prompt:
      "Drive two beta-100 complementary emitter followers from one 3 V-peak, 100 Hz DRIVE on shared +/-9 V rails. The CLASS_B_OUT branch ties both bases directly to DRIVE and both emitters to its 1 kOhm load. For CLASS_AB_OUT, bias the NPN base 0.75 V above DRIVE and PNP base 0.75 V below DRIVE, then connect each emitter through 10 Ohm to the output and use another 1 kOhm load. Preserve both outputs and biased bases, simulate four cycles, and compare peak loss and near-zero crossover tracking.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 9 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -9 } },
        { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 3, frequencyHertz: 100 } },
        { type: "resistor", refdes: "RBLOAD", props: { resistanceOhms: 1_000 } },
        { type: "npn-transistor", refdes: "QBN", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "QBP", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "dc-voltage-source", refdes: "VAN", props: { voltageVolts: 0.75 } },
        { type: "dc-voltage-source", refdes: "VAP", props: { voltageVolts: 0.75 } },
        { type: "resistor", refdes: "RAN", props: { resistanceOhms: 10 } },
        { type: "resistor", refdes: "RAP", props: { resistanceOhms: 10 } },
        { type: "resistor", refdes: "RALOAD", props: { resistanceOhms: 1_000 } },
        { type: "npn-transistor", refdes: "QAN", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "QAP", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "QBN", pin: "collector" }, { refdes: "QAN", pin: "collector" }] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "QBP", pin: "collector" }, { refdes: "QAP", pin: "collector" }] },
        { name: "DRIVE", terminals: [{ refdes: "VIN", pin: "positive" }, { refdes: "QBN", pin: "base" }, { refdes: "QBP", pin: "base" }, { refdes: "VAN", pin: "negative" }, { refdes: "VAP", pin: "positive" }] },
        { name: "CLASS_B_OUT", terminals: [{ refdes: "QBN", pin: "emitter" }, { refdes: "QBP", pin: "emitter" }, { refdes: "RBLOAD", pin: "a" }] },
        { name: "AB_N_BASE", terminals: [{ refdes: "VAN", pin: "positive" }, { refdes: "QAN", pin: "base" }] },
        { name: "AB_P_BASE", terminals: [{ refdes: "VAP", pin: "negative" }, { refdes: "QAP", pin: "base" }] },
        { name: "AB_N_EMITTER", terminals: [{ refdes: "QAN", pin: "emitter" }, { refdes: "RAN", pin: "a" }] },
        { name: "AB_P_EMITTER", terminals: [{ refdes: "QAP", pin: "emitter" }, { refdes: "RAP", pin: "a" }] },
        { name: "CLASS_AB_OUT", terminals: [{ refdes: "RAN", pin: "b" }, { refdes: "RAP", pin: "b" }, { refdes: "RALOAD", pin: "a" }] },
        { name: "GND", terminals: [{ refdes: "VPOS", pin: "negative" }, { refdes: "VNEG", pin: "negative" }, { refdes: "VIN", pin: "negative" }, { refdes: "RBLOAD", pin: "b" }, { refdes: "RALOAD", pin: "b" }] },
      ],
      analysis: analysis(40, 0.05),
    },
    expected: expected({
      requiredNetNames: ["GND", "DRIVE", "CLASS_B_OUT", "AB_N_BASE", "AB_P_BASE", "CLASS_AB_OUT"],
      traces: [
        { signalName: "V(CLASS_B_OUT)", atSeconds: 0.0005, expected: approximate(0.25043, 0.02) },
        { signalName: "V(CLASS_AB_OUT)", atSeconds: 0.0005, expected: approximate(0.91627, 0.02) },
      ],
      traceRanges: [
        { signalName: "V(CLASS_B_OUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(4.53184, 0.02) },
        { signalName: "V(CLASS_AB_OUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(5.92932, 0.02) },
      ],
    }),
  }
}

function dualGainTransimpedanceAmplifiersCase() {
  return {
    id: "frontier-dual-gain-transimpedance-amplifiers",
    title: "Dual-gain transimpedance amplifiers",
    prompt:
      "Build two independent transimpedance amplifiers on shared +/-12 V supplies using gain-100000 ideal op amps limited to +/-10 V. Inject 0.25 mA from GND into each inverting node and ground both non-inverting inputs. Use 10 kOhm feedback and a 20 kOhm load for OUT_10K, then 20 kOhm feedback and a 20 kOhm load for OUT_20K. Preserve both SUM nodes and outputs, simulate, and show equal input currents, virtual grounds, negative outputs, and the doubled output magnitude from doubled feedback resistance.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "dc-current-source", refdes: "I10", props: { currentAmps: 0.00025 } },
        { type: "dc-current-source", refdes: "I20", props: { currentAmps: 0.00025 } },
        { type: "resistor", refdes: "RF10", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RF20", props: { resistanceOhms: 20_000 } },
        { type: "resistor", refdes: "RL10", props: { resistanceOhms: 20_000 } },
        { type: "resistor", refdes: "RL20", props: { resistanceOhms: 20_000 } },
        { type: "ideal-op-amp-minus-top", refdes: "U10", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
        { type: "ideal-op-amp-minus-top", refdes: "U20", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "U10", pin: "vPlus" }, { refdes: "U20", pin: "vPlus" }] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "U10", pin: "vMinus" }, { refdes: "U20", pin: "vMinus" }] },
        { name: "SUM_10K", terminals: [{ refdes: "I10", pin: "negative" }, { refdes: "RF10", pin: "a" }, { refdes: "U10", pin: "inverting" }] },
        { name: "OUT_10K", terminals: [{ refdes: "RF10", pin: "b" }, { refdes: "RL10", pin: "a" }, { refdes: "U10", pin: "output" }] },
        { name: "SUM_20K", terminals: [{ refdes: "I20", pin: "negative" }, { refdes: "RF20", pin: "a" }, { refdes: "U20", pin: "inverting" }] },
        { name: "OUT_20K", terminals: [{ refdes: "RF20", pin: "b" }, { refdes: "RL20", pin: "a" }, { refdes: "U20", pin: "output" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "I10", pin: "positive" },
            { refdes: "I20", pin: "positive" },
            { refdes: "U10", pin: "nonInverting" },
            { refdes: "U20", pin: "nonInverting" },
            { refdes: "RL10", pin: "b" },
            { refdes: "RL20", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "SUM_10K", "OUT_10K", "SUM_20K", "OUT_20K"],
      netVoltages: [
        { name: "SUM_10K", expected: approximate(0.000025, 0.000002) },
        { name: "OUT_10K", expected: approximate(-2.49998, 0.005) },
        { name: "SUM_20K", expected: approximate(0.00005, 0.000002) },
        { name: "OUT_20K", expected: approximate(-4.99995, 0.005) },
      ],
      componentMeasurements: [
        { refdes: "I10", metric: "current", expected: approximate(0.00025, 0.000001) },
        { refdes: "RF10", metric: "current", expected: approximate(0.00025, 0.000001) },
        { refdes: "I20", metric: "current", expected: approximate(0.00025, 0.000001) },
        { refdes: "RF20", metric: "current", expected: approximate(0.00025, 0.000001) },
      ],
    }),
  }
}

function complementaryBjtPhaseSplittersCase() {
  return {
    id: "frontier-complementary-bjt-phase-splitters",
    title: "Complementary BJT phase splitters",
    prompt:
      "Build complementary beta-100 NPN and PNP phase splitters on +9 V and -9 V rails. Drive the NPN from a 20 mV-peak, 100 Hz sine centered at +1.5 V and orient a second equal sine so the PNP input is its exact negative around -1.5 V. Give each transistor a 10 kOhm base resistor plus equal 2 kOhm collector and emitter resistors. Preserve both inputs, collectors, and emitters, simulate six cycles, and show mirrored DC levels, nearly equal collector/emitter swings, and opposite output phases within each branch.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 9 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -9 } },
        { type: "dc-voltage-source", refdes: "VNBIAS", props: { voltageVolts: 1.5 } },
        { type: "dc-voltage-source", refdes: "VPBIAS", props: { voltageVolts: -1.5 } },
        { type: "sine-voltage-source", refdes: "VNIN", props: { amplitudeVolts: 0.02, frequencyHertz: 100 } },
        { type: "sine-voltage-source", refdes: "VPIN", props: { amplitudeVolts: 0.02, frequencyHertz: 100 } },
        { type: "resistor", refdes: "RBN", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RCN", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "REN", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RBP", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RCP", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "REP", props: { resistanceOhms: 2_000 } },
        { type: "npn-transistor", refdes: "QN", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "QP", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VPOS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "RCN", pin: "a" }] },
        { name: "VNEG", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "RCP", pin: "b" }] },
        { name: "N_BIAS", terminals: [{ refdes: "VNBIAS", pin: "positive" }, { refdes: "VNIN", pin: "negative" }] },
        { name: "P_BIAS", terminals: [{ refdes: "VPBIAS", pin: "positive" }, { refdes: "VPIN", pin: "positive" }] },
        { name: "N_INPUT", terminals: [{ refdes: "VNIN", pin: "positive" }, { refdes: "RBN", pin: "a" }] },
        { name: "P_INPUT", terminals: [{ refdes: "VPIN", pin: "negative" }, { refdes: "RBP", pin: "a" }] },
        { name: "N_BASE", terminals: [{ refdes: "RBN", pin: "b" }, { refdes: "QN", pin: "base" }] },
        { name: "P_BASE", terminals: [{ refdes: "RBP", pin: "b" }, { refdes: "QP", pin: "base" }] },
        { name: "N_COLLECTOR", terminals: [{ refdes: "RCN", pin: "b" }, { refdes: "QN", pin: "collector" }] },
        { name: "P_COLLECTOR", terminals: [{ refdes: "RCP", pin: "a" }, { refdes: "QP", pin: "collector" }] },
        { name: "N_EMITTER", terminals: [{ refdes: "QN", pin: "emitter" }, { refdes: "REN", pin: "a" }] },
        { name: "P_EMITTER", terminals: [{ refdes: "QP", pin: "emitter" }, { refdes: "REP", pin: "b" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VNBIAS", pin: "negative" },
            { refdes: "VPBIAS", pin: "negative" },
            { refdes: "REN", pin: "b" },
            { refdes: "REP", pin: "a" },
          ],
        },
      ],
      analysis: analysis(60, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "N_INPUT", "P_INPUT", "N_COLLECTOR", "P_COLLECTOR", "N_EMITTER", "P_EMITTER"],
      traces: [
        { signalName: "V(N_COLLECTOR)", atSeconds: 0.0525, expected: approximate(8.2131, 0.005) },
        { signalName: "V(N_EMITTER)", atSeconds: 0.0525, expected: approximate(0.79427, 0.003) },
        { signalName: "V(P_COLLECTOR)", atSeconds: 0.0525, expected: approximate(-8.2131, 0.005) },
        { signalName: "V(P_EMITTER)", atSeconds: 0.0525, expected: approximate(-0.79427, 0.003) },
      ],
      traceRanges: [
        { signalName: "V(N_COLLECTOR)", metric: "average", startFraction: 0.5, expected: approximate(8.23143, 0.01) },
        { signalName: "V(P_COLLECTOR)", metric: "average", startFraction: 0.5, expected: approximate(-8.23143, 0.01) },
        { signalName: "V(N_COLLECTOR)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.03666, 0.002) },
        { signalName: "V(N_EMITTER)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.03701, 0.002) },
        { signalName: "V(P_COLLECTOR)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.03666, 0.002) },
        { signalName: "V(P_EMITTER)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.03701, 0.002) },
      ],
    }),
  }
}

function singleVsStackedZenerReferencesCase() {
  return {
    id: "frontier-single-vs-stacked-zener-references",
    title: "Single versus stacked Zener references",
    prompt:
      "Build two independent loaded Zener references from one 15 V supply. Feed one 5.1 V Zener and 10 kOhm load through 1.5 kOhm to make SINGLE_REF. Feed two series 5.1 V Zeners and another 10 kOhm load through 680 Ohm to make STACK_TOP, preserving their STACK_MID junction. Simulate and compare the nearly equal individual breakdown voltages and currents while the stacked output is approximately twice the single output.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 15 } },
        { type: "resistor", refdes: "RSS", props: { resistanceOhms: 1_500 } },
        { type: "zener-diode", refdes: "DZS", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "resistor", refdes: "RLS", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RST", props: { resistanceOhms: 680 } },
        { type: "zener-diode", refdes: "DZT1", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "zener-diode", refdes: "DZT2", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "resistor", refdes: "RLT", props: { resistanceOhms: 10_000 } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RSS", pin: "a" }, { refdes: "RST", pin: "a" }] },
        { name: "SINGLE_REF", terminals: [{ refdes: "RSS", pin: "b" }, { refdes: "DZS", pin: "cathode" }, { refdes: "RLS", pin: "a" }] },
        { name: "STACK_TOP", terminals: [{ refdes: "RST", pin: "b" }, { refdes: "DZT1", pin: "cathode" }, { refdes: "RLT", pin: "a" }] },
        { name: "STACK_MID", terminals: [{ refdes: "DZT1", pin: "anode" }, { refdes: "DZT2", pin: "cathode" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "DZS", pin: "anode" },
            { refdes: "RLS", pin: "b" },
            { refdes: "DZT2", pin: "anode" },
            { refdes: "RLT", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "SINGLE_REF", "STACK_TOP", "STACK_MID"],
      netVoltages: [
        { name: "SINGLE_REF", expected: approximate(5.20646, 0.02) },
        { name: "STACK_TOP", expected: approximate(10.40454, 0.02) },
        { name: "STACK_MID", expected: approximate(5.20227, 0.02) },
      ],
      componentMeasurements: [
        { refdes: "DZS", metric: "voltage", expected: approximate(-5.20646, 0.02) },
        { refdes: "DZS", metric: "current", expected: approximate(-0.00600838, 0.00002) },
        { refdes: "DZT1", metric: "voltage", expected: approximate(-5.20227, 0.02) },
        { refdes: "DZT1", metric: "current", expected: approximate(-0.00571757, 0.00002) },
        { refdes: "DZT2", metric: "voltage", expected: approximate(-5.20227, 0.02) },
        { refdes: "DZT2", metric: "current", expected: approximate(-0.00571757, 0.00002) },
      ],
    }),
  }
}

function instrumentationCommonModeRejectionCase() {
  return {
    id: "frontier-instrumentation-common-mode-rejection",
    title: "Instrumentation amplifier common-mode rejection",
    prompt:
      "Build a three-op-amp instrumentation amplifier on +/-12 V supplies with gain-100000 devices limited to +/-10 V. Make a COMMON waveform that is a 2 V-peak, 100 Hz sine centered at 3 V, then hold INPUT_P 50 mV above COMMON and INPUT_N 50 mV below it with floating DC sources. Use 10 kOhm first-stage feedback resistors and 10 kOhm between the inverting nodes, followed by a 10 kOhm/20 kOhm difference stage and 20 kOhm load. Preserve COMMON, both inputs, first-stage outputs, and INA_OUT, simulate four cycles, and show roughly 4 V common-mode input swings while the 0.1 V differential produces a nearly constant 0.6 V output.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "dc-voltage-source", refdes: "VCMDC", props: { voltageVolts: 3 } },
        { type: "sine-voltage-source", refdes: "VCMAC", props: { amplitudeVolts: 2, frequencyHertz: 100 } },
        { type: "dc-voltage-source", refdes: "VDP", props: { voltageVolts: 0.05 } },
        { type: "dc-voltage-source", refdes: "VDN", props: { voltageVolts: 0.05 } },
        { type: "resistor", refdes: "RFP", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RFN", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RGAIN", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RINN", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RFB", props: { resistanceOhms: 20_000 } },
        { type: "resistor", refdes: "RINP", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RREF", props: { resistanceOhms: 20_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 20_000 } },
        { type: "ideal-op-amp-minus-top", refdes: "UP", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
        { type: "ideal-op-amp-minus-top", refdes: "UN", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
        { type: "ideal-op-amp-minus-top", refdes: "UD", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "UP", pin: "vPlus" }, { refdes: "UN", pin: "vPlus" }, { refdes: "UD", pin: "vPlus" }] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "UP", pin: "vMinus" }, { refdes: "UN", pin: "vMinus" }, { refdes: "UD", pin: "vMinus" }] },
        { name: "CM_BIAS", terminals: [{ refdes: "VCMDC", pin: "positive" }, { refdes: "VCMAC", pin: "negative" }] },
        { name: "COMMON", terminals: [{ refdes: "VCMAC", pin: "positive" }, { refdes: "VDP", pin: "negative" }, { refdes: "VDN", pin: "positive" }] },
        { name: "INPUT_P", terminals: [{ refdes: "VDP", pin: "positive" }, { refdes: "UP", pin: "nonInverting" }] },
        { name: "INPUT_N", terminals: [{ refdes: "VDN", pin: "negative" }, { refdes: "UN", pin: "nonInverting" }] },
        { name: "INV_P", terminals: [{ refdes: "UP", pin: "inverting" }, { refdes: "RFP", pin: "a" }, { refdes: "RGAIN", pin: "a" }] },
        { name: "INV_N", terminals: [{ refdes: "UN", pin: "inverting" }, { refdes: "RFN", pin: "a" }, { refdes: "RGAIN", pin: "b" }] },
        { name: "FIRST_P", terminals: [{ refdes: "UP", pin: "output" }, { refdes: "RFP", pin: "b" }, { refdes: "RINP", pin: "a" }] },
        { name: "FIRST_N", terminals: [{ refdes: "UN", pin: "output" }, { refdes: "RFN", pin: "b" }, { refdes: "RINN", pin: "a" }] },
        { name: "DIFF_REF", terminals: [{ refdes: "UD", pin: "nonInverting" }, { refdes: "RINP", pin: "b" }, { refdes: "RREF", pin: "a" }] },
        { name: "DIFF_SUM", terminals: [{ refdes: "UD", pin: "inverting" }, { refdes: "RINN", pin: "b" }, { refdes: "RFB", pin: "a" }] },
        { name: "INA_OUT", terminals: [{ refdes: "UD", pin: "output" }, { refdes: "RFB", pin: "b" }, { refdes: "RLOAD", pin: "a" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VCMDC", pin: "negative" },
            { refdes: "RREF", pin: "b" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(40, 0.05),
    },
    expected: expected({
      requiredNetNames: ["GND", "COMMON", "INPUT_P", "INPUT_N", "FIRST_P", "FIRST_N", "INA_OUT"],
      traces: [
        { signalName: "V(INA_OUT)", atSeconds: 0.0025, expected: approximate(0.599964, 0.002) },
        { signalName: "V(INA_OUT)", atSeconds: 0.0075, expected: approximate(0.599964, 0.002) },
      ],
      traceRanges: [
        { signalName: "V(COMMON)", metric: "peakToPeak", startFraction: 0.25, expected: approximate(4, 0.005) },
        { signalName: "V(INPUT_P)", metric: "peakToPeak", startFraction: 0.25, expected: approximate(4, 0.005) },
        { signalName: "V(INPUT_N)", metric: "peakToPeak", startFraction: 0.25, expected: approximate(4, 0.005) },
        { signalName: "V(INA_OUT)", metric: "average", startFraction: 0.25, expected: approximate(0.599964, 0.002) },
        { signalName: "V(INA_OUT)", metric: "peakToPeak", startFraction: 0.25, expected: approximate(0, 0.000001) },
      ],
    }),
  }
}

function bjtEmitterBypassComparisonCase() {
  return {
    id: "frontier-bjt-emitter-bypass-comparison",
    title: "BJT emitter-bypass gain comparison",
    prompt:
      "Drive two beta-100 NPN common-emitter stages from one 10 mV-peak, 100 Hz INPUT centered at 1.5 V. Give both 10 kOhm base resistors, 3.3 kOhm collector resistors to 9 V, and 1 kOhm emitter resistors to GND. Leave the UNBYPASSED branch resistively degenerated, but place 10 uF across the BYPASSED emitter resistor. Preserve both emitters and collectors, simulate ten cycles, and compare equal DC bias with reduced emitter swing, increased inverted collector gain, and unchanged frequency in the bypassed branch.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 9 } },
        { type: "dc-voltage-source", refdes: "VBIAS", props: { voltageVolts: 1.5 } },
        { type: "sine-voltage-source", refdes: "VSIGNAL", props: { amplitudeVolts: 0.01, frequencyHertz: 100 } },
        { type: "resistor", refdes: "RBU", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RCU", props: { resistanceOhms: 3_300 } },
        { type: "resistor", refdes: "REU", props: { resistanceOhms: 1_000 } },
        { type: "npn-transistor", refdes: "QU", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "resistor", refdes: "RBB", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RCB", props: { resistanceOhms: 3_300 } },
        { type: "resistor", refdes: "REB", props: { resistanceOhms: 1_000 } },
        { type: "capacitor", refdes: "CE", props: { capacitanceFarads: 0.00001 } },
        { type: "npn-transistor", refdes: "QB", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RCU", pin: "a" }, { refdes: "RCB", pin: "a" }] },
        { name: "BIAS", terminals: [{ refdes: "VBIAS", pin: "positive" }, { refdes: "VSIGNAL", pin: "negative" }] },
        { name: "INPUT", terminals: [{ refdes: "VSIGNAL", pin: "positive" }, { refdes: "RBU", pin: "a" }, { refdes: "RBB", pin: "a" }] },
        { name: "UNBYPASSED_BASE", terminals: [{ refdes: "RBU", pin: "b" }, { refdes: "QU", pin: "base" }] },
        { name: "UNBYPASSED_COLLECTOR", terminals: [{ refdes: "RCU", pin: "b" }, { refdes: "QU", pin: "collector" }] },
        { name: "UNBYPASSED_EMITTER", terminals: [{ refdes: "QU", pin: "emitter" }, { refdes: "REU", pin: "a" }] },
        { name: "BYPASSED_BASE", terminals: [{ refdes: "RBB", pin: "b" }, { refdes: "QB", pin: "base" }] },
        { name: "BYPASSED_COLLECTOR", terminals: [{ refdes: "RCB", pin: "b" }, { refdes: "QB", pin: "collector" }] },
        { name: "BYPASSED_EMITTER", terminals: [{ refdes: "QB", pin: "emitter" }, { refdes: "REB", pin: "a" }, { refdes: "CE", pin: "a" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "VBIAS", pin: "negative" },
            { refdes: "REU", pin: "b" },
            { refdes: "REB", pin: "b" },
            { refdes: "CE", pin: "b" },
          ],
        },
      ],
      analysis: analysis(60, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "UNBYPASSED_COLLECTOR", "UNBYPASSED_EMITTER", "BYPASSED_COLLECTOR", "BYPASSED_EMITTER"],
      traceRanges: [
        { signalName: "V(UNBYPASSED_COLLECTOR)", metric: "average", startFraction: 0.5, expected: approximate(6.62446, 0.01) },
        { signalName: "V(BYPASSED_COLLECTOR)", metric: "average", startFraction: 0.5, expected: approximate(6.6244, 0.01) },
        { signalName: "V(UNBYPASSED_COLLECTOR)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.05766, 0.005) },
        { signalName: "V(BYPASSED_COLLECTOR)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.29541, 0.01) },
        { signalName: "V(UNBYPASSED_EMITTER)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.01764, 0.002) },
        { signalName: "V(BYPASSED_EMITTER)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.01421, 0.002) },
      ],
    }),
  }
}

function stackedZenerMidpointLoadSweepCase() {
  return {
    id: "frontier-stacked-zener-midpoint-load-sweep",
    title: "Stacked Zener midpoint-load sweep",
    prompt:
      "Build three independent two-device 5.1 V Zener stacks from one 15 V supply. Feed each through 330 Ohm, load every TOP node with 10 kOhm, and load the MID nodes with 10 kOhm, 1 kOhm, and 300 Ohm for LIGHT, MEDIUM, and HEAVY branches. Preserve all six TOP/MID nets, simulate, and show both devices regulating under lighter midpoint loads while the heavy lower device drops below breakdown even though the upper device retains roughly one Zener drop.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 15 } },
        { type: "resistor", refdes: "RSL", props: { resistanceOhms: 330 } },
        { type: "resistor", refdes: "RTL", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RML", props: { resistanceOhms: 10_000 } },
        { type: "zener-diode", refdes: "DZL1", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "zener-diode", refdes: "DZL2", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "resistor", refdes: "RSM", props: { resistanceOhms: 330 } },
        { type: "resistor", refdes: "RTM", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RMM", props: { resistanceOhms: 1_000 } },
        { type: "zener-diode", refdes: "DZM1", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "zener-diode", refdes: "DZM2", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "resistor", refdes: "RSH", props: { resistanceOhms: 330 } },
        { type: "resistor", refdes: "RTH", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RMH", props: { resistanceOhms: 300 } },
        { type: "zener-diode", refdes: "DZH1", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "zener-diode", refdes: "DZH2", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RSL", pin: "a" }, { refdes: "RSM", pin: "a" }, { refdes: "RSH", pin: "a" }] },
        { name: "LIGHT_TOP", terminals: [{ refdes: "RSL", pin: "b" }, { refdes: "DZL1", pin: "cathode" }, { refdes: "RTL", pin: "a" }] },
        { name: "LIGHT_MID", terminals: [{ refdes: "DZL1", pin: "anode" }, { refdes: "DZL2", pin: "cathode" }, { refdes: "RML", pin: "a" }] },
        { name: "MEDIUM_TOP", terminals: [{ refdes: "RSM", pin: "b" }, { refdes: "DZM1", pin: "cathode" }, { refdes: "RTM", pin: "a" }] },
        { name: "MEDIUM_MID", terminals: [{ refdes: "DZM1", pin: "anode" }, { refdes: "DZM2", pin: "cathode" }, { refdes: "RMM", pin: "a" }] },
        { name: "HEAVY_TOP", terminals: [{ refdes: "RSH", pin: "b" }, { refdes: "DZH1", pin: "cathode" }, { refdes: "RTH", pin: "a" }] },
        { name: "HEAVY_MID", terminals: [{ refdes: "DZH1", pin: "anode" }, { refdes: "DZH2", pin: "cathode" }, { refdes: "RMH", pin: "a" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "DZL2", pin: "anode" },
            { refdes: "RTL", pin: "b" },
            { refdes: "RML", pin: "b" },
            { refdes: "DZM2", pin: "anode" },
            { refdes: "RTM", pin: "b" },
            { refdes: "RMM", pin: "b" },
            { refdes: "DZH2", pin: "anode" },
            { refdes: "RTH", pin: "b" },
            { refdes: "RMH", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "LIGHT_TOP", "LIGHT_MID", "MEDIUM_TOP", "MEDIUM_MID", "HEAVY_TOP", "HEAVY_MID"],
      netVoltages: [
        { name: "LIGHT_TOP", expected: approximate(10.57096, 0.02) },
        { name: "LIGHT_MID", expected: approximate(5.28228, 0.02) },
        { name: "MEDIUM_TOP", expected: approximate(10.51539, 0.02) },
        { name: "MEDIUM_MID", expected: approximate(5.2246, 0.02) },
        { name: "HEAVY_TOP", expected: approximate(9.77505, 0.02) },
        { name: "HEAVY_MID", expected: approximate(4.4567, 0.02) },
      ],
      componentMeasurements: [
        { refdes: "DZH1", metric: "voltage", expected: approximate(-5.31835, 0.02) },
        { refdes: "DZH2", metric: "voltage", expected: approximate(-4.4567, 0.02) },
        { refdes: "DZH2", metric: "current", expected: approximate(0, 0.000001) },
      ],
    }),
  }
}

function logarithmicAmplifierCurrentDecadesCase() {
  return {
    id: "frontier-logarithmic-amplifier-current-decades",
    title: "Diode-feedback logarithmic current decades",
    prompt:
      "Build three diode-feedback logarithmic amplifiers sharing +/-12 V supplies. Use gain-100000 ideal op amps limited to +/-10 V, grounded non-inverting inputs, 10 kOhm input resistors, DDEFAULT feedback diodes from each SUM anode to its LOG output cathode, and 100 kOhm output loads. Drive LOW_INPUT, MID_INPUT, and HIGH_INPUT with 0.1 V, 1 V, and 10 V so the input currents span 10 uA, 100 uA, and 1 mA. Preserve all three inputs, sums, and outputs, simulate, and show nearly equal output-voltage steps for each tenfold current increase rather than a linear tenfold output change.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "dc-voltage-source", refdes: "VINL", props: { voltageVolts: 0.1 } },
        { type: "dc-voltage-source", refdes: "VINM", props: { voltageVolts: 1 } },
        { type: "dc-voltage-source", refdes: "VINH", props: { voltageVolts: 10 } },
        { type: "resistor", refdes: "RINL", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RINM", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RINH", props: { resistanceOhms: 10_000 } },
        { type: "diode", refdes: "DL", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "diode", refdes: "DM", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "diode", refdes: "DH", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "resistor", refdes: "RLOADL", props: { resistanceOhms: 100_000 } },
        { type: "resistor", refdes: "RLOADM", props: { resistanceOhms: 100_000 } },
        { type: "resistor", refdes: "RLOADH", props: { resistanceOhms: 100_000 } },
        { type: "ideal-op-amp-minus-top", refdes: "UL", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
        { type: "ideal-op-amp-minus-top", refdes: "UM", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
        { type: "ideal-op-amp-minus-top", refdes: "UH", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "UL", pin: "vPlus" }, { refdes: "UM", pin: "vPlus" }, { refdes: "UH", pin: "vPlus" }] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "UL", pin: "vMinus" }, { refdes: "UM", pin: "vMinus" }, { refdes: "UH", pin: "vMinus" }] },
        { name: "LOW_INPUT", terminals: [{ refdes: "VINL", pin: "positive" }, { refdes: "RINL", pin: "a" }] },
        { name: "MID_INPUT", terminals: [{ refdes: "VINM", pin: "positive" }, { refdes: "RINM", pin: "a" }] },
        { name: "HIGH_INPUT", terminals: [{ refdes: "VINH", pin: "positive" }, { refdes: "RINH", pin: "a" }] },
        { name: "LOW_SUM", terminals: [{ refdes: "RINL", pin: "b" }, { refdes: "DL", pin: "anode" }, { refdes: "UL", pin: "inverting" }] },
        { name: "MID_SUM", terminals: [{ refdes: "RINM", pin: "b" }, { refdes: "DM", pin: "anode" }, { refdes: "UM", pin: "inverting" }] },
        { name: "HIGH_SUM", terminals: [{ refdes: "RINH", pin: "b" }, { refdes: "DH", pin: "anode" }, { refdes: "UH", pin: "inverting" }] },
        { name: "LOW_LOG", terminals: [{ refdes: "DL", pin: "cathode" }, { refdes: "UL", pin: "output" }, { refdes: "RLOADL", pin: "a" }] },
        { name: "MID_LOG", terminals: [{ refdes: "DM", pin: "cathode" }, { refdes: "UM", pin: "output" }, { refdes: "RLOADM", pin: "a" }] },
        { name: "HIGH_LOG", terminals: [{ refdes: "DH", pin: "cathode" }, { refdes: "UH", pin: "output" }, { refdes: "RLOADH", pin: "a" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VINL", pin: "negative" },
            { refdes: "VINM", pin: "negative" },
            { refdes: "VINH", pin: "negative" },
            { refdes: "UL", pin: "nonInverting" },
            { refdes: "UM", pin: "nonInverting" },
            { refdes: "UH", pin: "nonInverting" },
            { refdes: "RLOADL", pin: "b" },
            { refdes: "RLOADM", pin: "b" },
            { refdes: "RLOADH", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "LOW_INPUT", "MID_INPUT", "HIGH_INPUT", "LOW_SUM", "MID_SUM", "HIGH_SUM", "LOW_LOG", "MID_LOG", "HIGH_LOG"],
      netVoltages: [
        { name: "LOW_LOG", expected: approximate(-0.535999, 0.002) },
        { name: "MID_LOG", expected: approximate(-0.595556, 0.002) },
        { name: "HIGH_LOG", expected: approximate(-0.655111, 0.002) },
      ],
      componentMeasurements: [
        { refdes: "RINL", metric: "current", expected: approximate(0.00000999946, 0.00000002) },
        { refdes: "RINM", metric: "current", expected: approximate(0.0000999994, 0.0000001) },
        { refdes: "RINH", metric: "current", expected: approximate(0.000999999, 0.000001) },
      ],
    }),
  }
}

function partialEmitterBypassProgressionCase() {
  return {
    id: "frontier-bjt-partial-emitter-bypass-progression",
    title: "BJT emitter-bypass degeneration progression",
    prompt:
      "Drive three beta-100 NPN common-emitter stages from one 10 mV-peak, 100 Hz INPUT centered at 1.5 V. Give every stage a 10 kOhm base resistor, a 3.3 kOhm collector resistor to 9 V, and 1 kOhm total DC emitter resistance. Leave the first emitter resistor unbypassed; split the second into 100 Ohm plus 900 Ohm and bypass only the 900 Ohm section with 10 uF; bypass the third stage's full 1 kOhm with 10 uF. Preserve every collector and emitter plus PARTIAL_TAP, simulate settled cycles, and demonstrate matched DC bias with collector swing ordered UNBYPASSED < PARTIAL < FULL.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 9 } },
        { type: "dc-voltage-source", refdes: "VBIAS", props: { voltageVolts: 1.5 } },
        { type: "sine-voltage-source", refdes: "VSIGNAL", props: { amplitudeVolts: 0.01, frequencyHertz: 100 } },
        { type: "resistor", refdes: "RBU", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RCU", props: { resistanceOhms: 3_300 } },
        { type: "resistor", refdes: "REU", props: { resistanceOhms: 1_000 } },
        { type: "npn-transistor", refdes: "QU", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "resistor", refdes: "RBP", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RCP", props: { resistanceOhms: 3_300 } },
        { type: "resistor", refdes: "REPF", props: { resistanceOhms: 100 } },
        { type: "resistor", refdes: "REPB", props: { resistanceOhms: 900 } },
        { type: "capacitor", refdes: "CEP", props: { capacitanceFarads: 0.00001 } },
        { type: "npn-transistor", refdes: "QP", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "resistor", refdes: "RBF", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RCF", props: { resistanceOhms: 3_300 } },
        { type: "resistor", refdes: "REF", props: { resistanceOhms: 1_000 } },
        { type: "capacitor", refdes: "CEF", props: { capacitanceFarads: 0.00001 } },
        { type: "npn-transistor", refdes: "QF", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RCU", pin: "a" }, { refdes: "RCP", pin: "a" }, { refdes: "RCF", pin: "a" }] },
        { name: "BIAS", terminals: [{ refdes: "VBIAS", pin: "positive" }, { refdes: "VSIGNAL", pin: "negative" }] },
        { name: "INPUT", terminals: [{ refdes: "VSIGNAL", pin: "positive" }, { refdes: "RBU", pin: "a" }, { refdes: "RBP", pin: "a" }, { refdes: "RBF", pin: "a" }] },
        { name: "UNBYPASSED_BASE", terminals: [{ refdes: "RBU", pin: "b" }, { refdes: "QU", pin: "base" }] },
        { name: "UNBYPASSED_COLLECTOR", terminals: [{ refdes: "RCU", pin: "b" }, { refdes: "QU", pin: "collector" }] },
        { name: "UNBYPASSED_EMITTER", terminals: [{ refdes: "QU", pin: "emitter" }, { refdes: "REU", pin: "a" }] },
        { name: "PARTIAL_BASE", terminals: [{ refdes: "RBP", pin: "b" }, { refdes: "QP", pin: "base" }] },
        { name: "PARTIAL_COLLECTOR", terminals: [{ refdes: "RCP", pin: "b" }, { refdes: "QP", pin: "collector" }] },
        { name: "PARTIAL_EMITTER", terminals: [{ refdes: "QP", pin: "emitter" }, { refdes: "REPF", pin: "a" }] },
        { name: "PARTIAL_TAP", terminals: [{ refdes: "REPF", pin: "b" }, { refdes: "REPB", pin: "a" }, { refdes: "CEP", pin: "a" }] },
        { name: "FULL_BASE", terminals: [{ refdes: "RBF", pin: "b" }, { refdes: "QF", pin: "base" }] },
        { name: "FULL_COLLECTOR", terminals: [{ refdes: "RCF", pin: "b" }, { refdes: "QF", pin: "collector" }] },
        { name: "FULL_EMITTER", terminals: [{ refdes: "QF", pin: "emitter" }, { refdes: "REF", pin: "a" }, { refdes: "CEF", pin: "a" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "VBIAS", pin: "negative" },
            { refdes: "REU", pin: "b" },
            { refdes: "REPB", pin: "b" },
            { refdes: "CEP", pin: "b" },
            { refdes: "REF", pin: "b" },
            { refdes: "CEF", pin: "b" },
          ],
        },
      ],
      analysis: analysis(60, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "UNBYPASSED_COLLECTOR", "UNBYPASSED_EMITTER", "PARTIAL_COLLECTOR", "PARTIAL_EMITTER", "PARTIAL_TAP", "FULL_COLLECTOR", "FULL_EMITTER"],
      traceRanges: [
        { signalName: "V(UNBYPASSED_COLLECTOR)", metric: "average", startFraction: 0.5, expected: approximate(6.62446, 0.01) },
        { signalName: "V(PARTIAL_COLLECTOR)", metric: "average", startFraction: 0.5, expected: approximate(6.62442, 0.01) },
        { signalName: "V(FULL_COLLECTOR)", metric: "average", startFraction: 0.5, expected: approximate(6.6244, 0.01) },
        { signalName: "V(UNBYPASSED_COLLECTOR)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.057658, 0.005) },
        { signalName: "V(PARTIAL_COLLECTOR)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.215964, 0.01) },
        { signalName: "V(FULL_COLLECTOR)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.295406, 0.01) },
      ],
    }),
  }
}

function zenerRippleCapacitanceSweepCase() {
  return {
    id: "frontier-zener-ripple-capacitance-sweep",
    title: "Zener-reference ripple capacitance sweep",
    prompt:
      "Build three 5.1 V Zener shunt references from one 9 V supply carrying 1 V-peak, 1 kHz series ripple. Give every branch a 330 Ohm feed and 2 kOhm load. Leave RAW_REF without a capacitor, place 100 uF across FILTERED_REF, and place 1000 uF across HEAVY_FILTER_REF. Preserve the ripple supply and all three outputs, simulate settled cycles, and demonstrate similar DC levels but monotonically lower ripple as shunt capacitance increases.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VDC", props: { voltageVolts: 9 } },
        { type: "sine-voltage-source", refdes: "VRIPPLE", props: { amplitudeVolts: 1, frequencyHertz: 1_000 } },
        { type: "resistor", refdes: "RSR", props: { resistanceOhms: 330 } },
        { type: "zener-diode", refdes: "DZR", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "resistor", refdes: "RLR", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RSF", props: { resistanceOhms: 330 } },
        { type: "zener-diode", refdes: "DZF", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "resistor", refdes: "RLF", props: { resistanceOhms: 2_000 } },
        { type: "capacitor", refdes: "CF", props: { capacitanceFarads: 0.0001 } },
        { type: "resistor", refdes: "RSH", props: { resistanceOhms: 330 } },
        { type: "zener-diode", refdes: "DZH", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "resistor", refdes: "RLH", props: { resistanceOhms: 2_000 } },
        { type: "capacitor", refdes: "CH", props: { capacitanceFarads: 0.001 } },
      ],
      nets: [
        { name: "DC_BIAS", terminals: [{ refdes: "VDC", pin: "positive" }, { refdes: "VRIPPLE", pin: "negative" }] },
        { name: "RIPPLE_SUPPLY", terminals: [{ refdes: "VRIPPLE", pin: "positive" }, { refdes: "RSR", pin: "a" }, { refdes: "RSF", pin: "a" }, { refdes: "RSH", pin: "a" }] },
        { name: "RAW_REF", terminals: [{ refdes: "RSR", pin: "b" }, { refdes: "DZR", pin: "cathode" }, { refdes: "RLR", pin: "a" }] },
        { name: "FILTERED_REF", terminals: [{ refdes: "RSF", pin: "b" }, { refdes: "DZF", pin: "cathode" }, { refdes: "RLF", pin: "a" }, { refdes: "CF", pin: "a" }] },
        { name: "HEAVY_FILTER_REF", terminals: [{ refdes: "RSH", pin: "b" }, { refdes: "DZH", pin: "cathode" }, { refdes: "RLH", pin: "a" }, { refdes: "CH", pin: "a" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VDC", pin: "negative" },
            { refdes: "DZR", pin: "anode" },
            { refdes: "RLR", pin: "b" },
            { refdes: "DZF", pin: "anode" },
            { refdes: "RLF", pin: "b" },
            { refdes: "CF", pin: "b" },
            { refdes: "DZH", pin: "anode" },
            { refdes: "RLH", pin: "b" },
            { refdes: "CH", pin: "b" },
          ],
        },
      ],
      analysis: analysis(10, 0.01),
    },
    expected: expected({
      requiredNetNames: ["GND", "RIPPLE_SUPPLY", "RAW_REF", "FILTERED_REF", "HEAVY_FILTER_REF"],
      traceRanges: [
        { signalName: "V(RIPPLE_SUPPLY)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(2, 0.005) },
        { signalName: "V(RAW_REF)", metric: "average", startFraction: 0.5, expected: approximate(5.24304, 0.01) },
        { signalName: "V(FILTERED_REF)", metric: "average", startFraction: 0.5, expected: approximate(5.24375, 0.01) },
        { signalName: "V(HEAVY_FILTER_REF)", metric: "average", startFraction: 0.5, expected: approximate(5.24401, 0.01) },
        { signalName: "V(RAW_REF)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.0756946, 0.003) },
        { signalName: "V(FILTERED_REF)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.00961917, 0.002) },
        { signalName: "V(HEAVY_FILTER_REF)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.00106038, 0.0005) },
      ],
    }),
  }
}

function antilogarithmicAmplifierInputStepsCase() {
  return {
    id: "frontier-antilogarithmic-amplifier-input-steps",
    title: "Antilogarithmic amplifier input-step progression",
    prompt:
      "Build three diode-input antilogarithmic amplifiers on shared +/-12 V rails using gain-100000 ideal op amps limited to +/-10 V. Drive their DDEFAULT input diodes with 0.55556 V, 0.59556 V, and 0.63556 V. Ground every non-inverting input and close each loop with 10 kOhm feedback plus a 100 kOhm output load. Preserve all inputs, summing nodes, and outputs, simulate, and demonstrate that equal 40 mV input steps produce approximately equal multiplicative increases in output-current magnitude.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "dc-voltage-source", refdes: "VINL", props: { voltageVolts: 0.55556 } },
        { type: "dc-voltage-source", refdes: "VINM", props: { voltageVolts: 0.59556 } },
        { type: "dc-voltage-source", refdes: "VINH", props: { voltageVolts: 0.63556 } },
        { type: "diode", refdes: "DL", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "diode", refdes: "DM", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "diode", refdes: "DH", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "resistor", refdes: "RFL", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RFM", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RFH", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RLOADL", props: { resistanceOhms: 100_000 } },
        { type: "resistor", refdes: "RLOADM", props: { resistanceOhms: 100_000 } },
        { type: "resistor", refdes: "RLOADH", props: { resistanceOhms: 100_000 } },
        { type: "ideal-op-amp-minus-top", refdes: "UL", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
        { type: "ideal-op-amp-minus-top", refdes: "UM", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
        { type: "ideal-op-amp-minus-top", refdes: "UH", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "UL", pin: "vPlus" }, { refdes: "UM", pin: "vPlus" }, { refdes: "UH", pin: "vPlus" }] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "UL", pin: "vMinus" }, { refdes: "UM", pin: "vMinus" }, { refdes: "UH", pin: "vMinus" }] },
        { name: "LOW_INPUT", terminals: [{ refdes: "VINL", pin: "positive" }, { refdes: "DL", pin: "anode" }] },
        { name: "MID_INPUT", terminals: [{ refdes: "VINM", pin: "positive" }, { refdes: "DM", pin: "anode" }] },
        { name: "HIGH_INPUT", terminals: [{ refdes: "VINH", pin: "positive" }, { refdes: "DH", pin: "anode" }] },
        { name: "LOW_SUM", terminals: [{ refdes: "DL", pin: "cathode" }, { refdes: "RFL", pin: "a" }, { refdes: "UL", pin: "inverting" }] },
        { name: "MID_SUM", terminals: [{ refdes: "DM", pin: "cathode" }, { refdes: "RFM", pin: "a" }, { refdes: "UM", pin: "inverting" }] },
        { name: "HIGH_SUM", terminals: [{ refdes: "DH", pin: "cathode" }, { refdes: "RFH", pin: "a" }, { refdes: "UH", pin: "inverting" }] },
        { name: "LOW_OUT", terminals: [{ refdes: "RFL", pin: "b" }, { refdes: "UL", pin: "output" }, { refdes: "RLOADL", pin: "a" }] },
        { name: "MID_OUT", terminals: [{ refdes: "RFM", pin: "b" }, { refdes: "UM", pin: "output" }, { refdes: "RLOADM", pin: "a" }] },
        { name: "HIGH_OUT", terminals: [{ refdes: "RFH", pin: "b" }, { refdes: "UH", pin: "output" }, { refdes: "RLOADH", pin: "a" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VINL", pin: "negative" },
            { refdes: "VINM", pin: "negative" },
            { refdes: "VINH", pin: "negative" },
            { refdes: "UL", pin: "nonInverting" },
            { refdes: "UM", pin: "nonInverting" },
            { refdes: "UH", pin: "nonInverting" },
            { refdes: "RLOADL", pin: "b" },
            { refdes: "RLOADM", pin: "b" },
            { refdes: "RLOADH", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "LOW_INPUT", "MID_INPUT", "HIGH_INPUT", "LOW_SUM", "MID_SUM", "HIGH_SUM", "LOW_OUT", "MID_OUT", "HIGH_OUT"],
      netVoltages: [
        { name: "LOW_OUT", expected: approximate(-0.216612, 0.003) },
        { name: "MID_OUT", expected: approximate(-1.01668, 0.005) },
        { name: "HIGH_OUT", expected: approximate(-4.76639, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RFL", metric: "current", expected: approximate(0.0000216615, 0.0000001) },
        { refdes: "RFM", metric: "current", expected: approximate(0.000101669, 0.0000003) },
        { refdes: "RFH", metric: "current", expected: approximate(0.000476643, 0.000001) },
      ],
    }),
  }
}

function ordinaryVsWidlarCurrentSourceCase() {
  return {
    id: "frontier-ordinary-vs-widlar-current-source",
    title: "Ordinary mirror versus Widlar current source",
    prompt:
      "Build two beta-100 NPN current-source branches from one 9 V supply. In both, feed a diode-connected reference transistor through 4.7 kOhm and tie a matched output transistor base to it. Ground both emitters in the ordinary mirror. In the Widlar branch, ground only the reference emitter and put 1 kOhm below the output emitter. Pull each output collector up through 1 kOhm. Preserve both base and output nodes plus the Widlar emitter, simulate, and compare matched reference currents with the emitter resistor's large output-current reduction.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 9 } },
        { type: "resistor", refdes: "RREFO", props: { resistanceOhms: 4_700 } },
        { type: "resistor", refdes: "RLOADO", props: { resistanceOhms: 1_000 } },
        { type: "npn-transistor", refdes: "QREFO", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "QOUTO", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "resistor", refdes: "RREFW", props: { resistanceOhms: 4_700 } },
        { type: "resistor", refdes: "RLOADW", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "REW", props: { resistanceOhms: 1_000 } },
        { type: "npn-transistor", refdes: "QREFW", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "QOUTW", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RREFO", pin: "a" }, { refdes: "RLOADO", pin: "a" }, { refdes: "RREFW", pin: "a" }, { refdes: "RLOADW", pin: "a" }] },
        { name: "ORDINARY_BASE", terminals: [{ refdes: "RREFO", pin: "b" }, { refdes: "QREFO", pin: "base" }, { refdes: "QREFO", pin: "collector" }, { refdes: "QOUTO", pin: "base" }] },
        { name: "ORDINARY_OUT", terminals: [{ refdes: "RLOADO", pin: "b" }, { refdes: "QOUTO", pin: "collector" }] },
        { name: "WIDLAR_BASE", terminals: [{ refdes: "RREFW", pin: "b" }, { refdes: "QREFW", pin: "base" }, { refdes: "QREFW", pin: "collector" }, { refdes: "QOUTW", pin: "base" }] },
        { name: "WIDLAR_OUT", terminals: [{ refdes: "RLOADW", pin: "b" }, { refdes: "QOUTW", pin: "collector" }] },
        { name: "WIDLAR_EMITTER", terminals: [{ refdes: "QOUTW", pin: "emitter" }, { refdes: "REW", pin: "a" }] },
        { name: "GND", terminals: [{ refdes: "VCC", pin: "negative" }, { refdes: "QREFO", pin: "emitter" }, { refdes: "QOUTO", pin: "emitter" }, { refdes: "QREFW", pin: "emitter" }, { refdes: "REW", pin: "b" }] },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "ORDINARY_BASE", "ORDINARY_OUT", "WIDLAR_BASE", "WIDLAR_OUT", "WIDLAR_EMITTER"],
      netVoltages: [
        { name: "ORDINARY_OUT", expected: approximate(7.16365, 0.01) },
        { name: "WIDLAR_OUT", expected: approximate(8.91927, 0.005) },
        { name: "WIDLAR_EMITTER", expected: approximate(0.0814785, 0.002) },
      ],
      componentMeasurements: [
        { refdes: "RREFO", metric: "current", expected: approximate(0.00175983, 0.000005) },
        { refdes: "RLOADO", metric: "current", expected: approximate(0.00183635, 0.000005) },
        { refdes: "RREFW", metric: "current", expected: approximate(0.00175978, 0.000005) },
        { refdes: "RLOADW", metric: "current", expected: approximate(0.0000807323, 0.000001) },
      ],
    }),
  }
}

function zenerDynamicResistanceSweepCase() {
  return {
    id: "frontier-zener-dynamic-resistance-sweep",
    title: "Zener dynamic-resistance ripple sweep",
    prompt:
      "Build three 5.1 V Zener shunt references from one 9 V supply carrying 1 V-peak, 1 kHz series ripple. Give every branch a 330 Ohm feed and 2 kOhm load, but set the Zener dynamic resistances to 10 Ohm, 50 Ohm, and 100 Ohm. Preserve RIPPLE_SUPPLY, STIFF_REF, MEDIUM_REF, and SOFT_REF, simulate settled cycles, and demonstrate increasing average reference shift and monotonically increasing ripple transfer as avalanche dynamic resistance rises.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VDC", props: { voltageVolts: 9 } },
        { type: "sine-voltage-source", refdes: "VRIPPLE", props: { amplitudeVolts: 1, frequencyHertz: 1_000 } },
        { type: "resistor", refdes: "RSS", props: { resistanceOhms: 330 } },
        { type: "zener-diode", refdes: "DZS", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "resistor", refdes: "RLS", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RSM", props: { resistanceOhms: 330 } },
        { type: "zener-diode", refdes: "DZM", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 50 } },
        { type: "resistor", refdes: "RLM", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RSO", props: { resistanceOhms: 330 } },
        { type: "zener-diode", refdes: "DZO", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 100 } },
        { type: "resistor", refdes: "RLO", props: { resistanceOhms: 2_000 } },
      ],
      nets: [
        { name: "DC_BIAS", terminals: [{ refdes: "VDC", pin: "positive" }, { refdes: "VRIPPLE", pin: "negative" }] },
        { name: "RIPPLE_SUPPLY", terminals: [{ refdes: "VRIPPLE", pin: "positive" }, { refdes: "RSS", pin: "a" }, { refdes: "RSM", pin: "a" }, { refdes: "RSO", pin: "a" }] },
        { name: "STIFF_REF", terminals: [{ refdes: "RSS", pin: "b" }, { refdes: "DZS", pin: "cathode" }, { refdes: "RLS", pin: "a" }] },
        { name: "MEDIUM_REF", terminals: [{ refdes: "RSM", pin: "b" }, { refdes: "DZM", pin: "cathode" }, { refdes: "RLM", pin: "a" }] },
        { name: "SOFT_REF", terminals: [{ refdes: "RSO", pin: "b" }, { refdes: "DZO", pin: "cathode" }, { refdes: "RLO", pin: "a" }] },
        { name: "GND", terminals: [{ refdes: "VDC", pin: "negative" }, { refdes: "DZS", pin: "anode" }, { refdes: "RLS", pin: "b" }, { refdes: "DZM", pin: "anode" }, { refdes: "RLM", pin: "b" }, { refdes: "DZO", pin: "anode" }, { refdes: "RLO", pin: "b" }] },
      ],
      analysis: analysis(10, 0.01),
    },
    expected: expected({
      requiredNetNames: ["GND", "RIPPLE_SUPPLY", "STIFF_REF", "MEDIUM_REF", "SOFT_REF"],
      traceRanges: [
        { signalName: "V(RIPPLE_SUPPLY)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(2, 0.005) },
        { signalName: "V(STIFF_REF)", metric: "average", startFraction: 0.5, expected: approximate(5.24304, 0.02) },
        { signalName: "V(MEDIUM_REF)", metric: "average", startFraction: 0.5, expected: approximate(5.53819, 0.01) },
        { signalName: "V(SOFT_REF)", metric: "average", startFraction: 0.5, expected: approximate(5.82088, 0.02) },
        { signalName: "V(STIFF_REF)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.0756946, 0.003) },
        { signalName: "V(MEDIUM_REF)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.272642, 0.005) },
        { signalName: "V(SOFT_REF)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.461018, 0.005) },
      ],
    }),
  }
}

function bjtEarlyEffectCollectorSweepCase() {
  const operatingPoints = [
    { prefix: "LOW", supplyVolts: 3 },
    { prefix: "MID", supplyVolts: 6 },
    { prefix: "HIGH", supplyVolts: 9 },
  ] as const
  return {
    id: "frontier-bjt-early-effect-collector-sweep",
    title: "BJT Early-effect collector-voltage sweep",
    prompt:
      "Build three beta-100 NPN transistors with emitters at GND and bases tied to one ideal 0.7 V source. Feed their collectors through separate 10 Ohm sense resistors from 3 V, 6 V, and 9 V supplies. Preserve SHARED_BASE plus LOW_COLLECTOR, MID_COLLECTOR, and HIGH_COLLECTOR. Simulate and report every collector current and voltage, demonstrating monotonic collector-current growth with VCE at fixed VBE from finite Early voltage rather than treating each transistor as an ideal current source.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VBASE", props: { voltageVolts: 0.7 } },
        ...operatingPoints.flatMap(({ prefix, supplyVolts }) => [
          { type: "dc-voltage-source", refdes: `V${prefix}`, props: { voltageVolts: supplyVolts } },
          { type: "resistor", refdes: `R${prefix}`, props: { resistanceOhms: 10 } },
          { type: "npn-transistor", refdes: `Q${prefix}`, props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        ]),
      ],
      nets: [
        {
          name: "SHARED_BASE",
          terminals: [
            { refdes: "VBASE", pin: "positive" },
            ...operatingPoints.map(({ prefix }) => ({ refdes: `Q${prefix}`, pin: "base" })),
          ],
        },
        ...operatingPoints.flatMap(({ prefix }) => [
          { name: `${prefix}_SUPPLY`, terminals: [{ refdes: `V${prefix}`, pin: "positive" }, { refdes: `R${prefix}`, pin: "a" }] },
          { name: `${prefix}_COLLECTOR`, terminals: [{ refdes: `R${prefix}`, pin: "b" }, { refdes: `Q${prefix}`, pin: "collector" }] },
        ]),
        {
          name: "GND",
          terminals: [
            { refdes: "VBASE", pin: "negative" },
            ...operatingPoints.flatMap(({ prefix }) => [
              { refdes: `V${prefix}`, pin: "negative" },
              { refdes: `Q${prefix}`, pin: "emitter" },
            ]),
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "SHARED_BASE", ...operatingPoints.map(({ prefix }) => `${prefix}_COLLECTOR`)],
      netVoltages: operatingPoints.map(({ prefix }) => ({
        name: `${prefix}_COLLECTOR`,
        expected: approximate(
          prefix === "LOW" ? 2.9942 : prefix === "MID" ? 5.99403 : 8.99386,
          0.002,
        ),
      })),
      componentMeasurements: operatingPoints.map(({ prefix }) => ({
        refdes: `R${prefix}`,
        metric: "current",
        expected: approximate(
          prefix === "LOW" ? 0.000580044 : prefix === "MID" ? 0.000597054 : 0.000614064,
          0.000001,
        ),
      })),
    }),
  }
}

function zenerDynamicResistanceLoadLineSweepCase() {
  const operatingPoints = [
    { prefix: "LOW", feedOhms: 1_500 },
    { prefix: "MID", feedOhms: 680 },
    { prefix: "HIGH", feedOhms: 330 },
  ] as const
  return {
    id: "frontier-zener-dynamic-resistance-load-line-sweep",
    title: "Zener dynamic-resistance three-point load line",
    prompt:
      "Build three unloaded 5.1 V Zener branches from one 9 V supply. Give all three Zeners 50 Ohm dynamic resistance and feed LOW_REF through 1.5 kOhm, MID_REF through 680 Ohm, and HIGH_REF through 330 Ohm. Preserve all reference nets, simulate, and report each feed current and voltage. Validate increasing avalanche voltage with current and approximately consistent incremental load-line slopes between adjacent operating points.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 9 } },
        ...operatingPoints.flatMap(({ prefix, feedOhms }) => [
          { type: "resistor", refdes: `R${prefix}`, props: { resistanceOhms: feedOhms } },
          { type: "zener-diode", refdes: `DZ${prefix}`, props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 50 } },
        ]),
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "VCC", pin: "positive" },
            ...operatingPoints.map(({ prefix }) => ({ refdes: `R${prefix}`, pin: "a" })),
          ],
        },
        ...operatingPoints.map(({ prefix }) => ({
          name: `${prefix}_REF`,
          terminals: [{ refdes: `R${prefix}`, pin: "b" }, { refdes: `DZ${prefix}`, pin: "cathode" }],
        })),
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            ...operatingPoints.map(({ prefix }) => ({ refdes: `DZ${prefix}`, pin: "anode" })),
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", ...operatingPoints.map(({ prefix }) => `${prefix}_REF`)],
      netVoltages: operatingPoints.map(({ prefix }) => ({
        name: `${prefix}_REF`,
        expected: approximate(
          prefix === "LOW" ? 5.24875 : prefix === "MID" ? 5.40723 : 5.66511,
          0.002,
        ),
      })),
      componentMeasurements: operatingPoints.map(({ prefix }) => ({
        refdes: `R${prefix}`,
        metric: "current",
        expected: approximate(
          prefix === "LOW" ? 0.00250083 : prefix === "MID" ? 0.00528349 : 0.0101057,
          0.000002,
        ),
      })),
    }),
  }
}

function logAntilogRecoverySweepCase() {
  const operatingPoints = [
    { prefix: "LOW", inputVolts: 0.05 },
    { prefix: "MID", inputVolts: 0.5 },
    { prefix: "HIGH", inputVolts: 5 },
  ] as const
  const opAmpRefdes = operatingPoints.flatMap(({ prefix }) => [
    `ULOG${prefix}`,
    `UINV${prefix}`,
    `UANTI${prefix}`,
  ])
  return {
    id: "frontier-log-antilog-recovery-sweep",
    title: "Matched log-antilog recovery sweep",
    prompt:
      "Build three independent matched log→unity-inverter→antilog chains on shared +/-12 V rails using gain-100000 ideal op amps limited to +/-10 V and DDEFAULT diodes. Use 10 kOhm for every signal and feedback resistor. Drive LOW_INPUT with 0.05 V, MID_INPUT with 0.5 V, and HIGH_INPUT with 5 V. Preserve each chain's input, LOG_OUT, EXP_INPUT, and RECOVERED nets; simulate and show equal logarithmic-voltage steps for the two input decades while each final output linearly recovers the corresponding input with negative polarity.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        ...operatingPoints.flatMap(({ prefix, inputVolts }) => [
          { type: "dc-voltage-source", refdes: `VIN${prefix}`, props: { voltageVolts: inputVolts } },
          { type: "resistor", refdes: `RLOG${prefix}`, props: { resistanceOhms: 10_000 } },
          { type: "diode", refdes: `DLOG${prefix}`, props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
          { type: "resistor", refdes: `RINV_IN${prefix}`, props: { resistanceOhms: 10_000 } },
          { type: "resistor", refdes: `RINV_FB${prefix}`, props: { resistanceOhms: 10_000 } },
          { type: "diode", refdes: `DEXP${prefix}`, props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
          { type: "resistor", refdes: `RANTI${prefix}`, props: { resistanceOhms: 10_000 } },
          { type: "ideal-op-amp-minus-top", refdes: `ULOG${prefix}`, props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
          { type: "ideal-op-amp-minus-top", refdes: `UINV${prefix}`, props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
          { type: "ideal-op-amp-minus-top", refdes: `UANTI${prefix}`, props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
        ]),
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, ...opAmpRefdes.map((refdes) => ({ refdes, pin: "vPlus" }))] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, ...opAmpRefdes.map((refdes) => ({ refdes, pin: "vMinus" }))] },
        ...operatingPoints.flatMap(({ prefix }) => [
          { name: `${prefix}_INPUT`, terminals: [{ refdes: `VIN${prefix}`, pin: "positive" }, { refdes: `RLOG${prefix}`, pin: "a" }] },
          { name: `${prefix}_LOG_SUM`, terminals: [{ refdes: `RLOG${prefix}`, pin: "b" }, { refdes: `DLOG${prefix}`, pin: "anode" }, { refdes: `ULOG${prefix}`, pin: "inverting" }] },
          { name: `${prefix}_LOG_OUT`, terminals: [{ refdes: `DLOG${prefix}`, pin: "cathode" }, { refdes: `ULOG${prefix}`, pin: "output" }, { refdes: `RINV_IN${prefix}`, pin: "a" }] },
          { name: `${prefix}_INVERT_SUM`, terminals: [{ refdes: `RINV_IN${prefix}`, pin: "b" }, { refdes: `RINV_FB${prefix}`, pin: "a" }, { refdes: `UINV${prefix}`, pin: "inverting" }] },
          { name: `${prefix}_EXP_INPUT`, terminals: [{ refdes: `RINV_FB${prefix}`, pin: "b" }, { refdes: `UINV${prefix}`, pin: "output" }, { refdes: `DEXP${prefix}`, pin: "anode" }] },
          { name: `${prefix}_ANTILOG_SUM`, terminals: [{ refdes: `DEXP${prefix}`, pin: "cathode" }, { refdes: `RANTI${prefix}`, pin: "a" }, { refdes: `UANTI${prefix}`, pin: "inverting" }] },
          { name: `${prefix}_RECOVERED`, terminals: [{ refdes: `RANTI${prefix}`, pin: "b" }, { refdes: `UANTI${prefix}`, pin: "output" }] },
        ]),
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            ...operatingPoints.flatMap(({ prefix }) => [
              { refdes: `VIN${prefix}`, pin: "negative" },
              { refdes: `ULOG${prefix}`, pin: "nonInverting" },
              { refdes: `UINV${prefix}`, pin: "nonInverting" },
              { refdes: `UANTI${prefix}`, pin: "nonInverting" },
            ]),
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        ...operatingPoints.flatMap(({ prefix }) => [
          `${prefix}_INPUT`,
          `${prefix}_LOG_OUT`,
          `${prefix}_EXP_INPUT`,
          `${prefix}_RECOVERED`,
        ]),
      ],
      netVoltages: operatingPoints.flatMap(({ prefix }) => [
        {
          name: `${prefix}_LOG_OUT`,
          expected: approximate(prefix === "LOW" ? -0.518069 : prefix === "MID" ? -0.577627 : -0.637183, 0.001),
        },
        {
          name: `${prefix}_EXP_INPUT`,
          expected: approximate(prefix === "LOW" ? 0.518059 : prefix === "MID" ? 0.577616 : 0.637171, 0.001),
        },
        {
          name: `${prefix}_RECOVERED`,
          expected: approximate(prefix === "LOW" ? -0.0499633 : prefix === "MID" ? -0.499558 : -4.98663, 0.01),
        },
      ]),
      componentMeasurements: operatingPoints.map(({ prefix }) => ({
        refdes: `RANTI${prefix}`,
        metric: "current",
        expected: approximate(
          prefix === "LOW" ? 0.00000499638 : prefix === "MID" ? 0.0000499563 : 0.000498668,
          prefix === "HIGH" ? 0.000002 : 0.0000003,
        ),
      })),
    }),
  }
}

function pnpEarlyVoltageOutputResistanceSweepCase() {
  const models = [
    { prefix: "VAF40", earlyVoltageVolts: 40, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 },
    { prefix: "VAF100", earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 },
    { prefix: "VAF250", earlyVoltageVolts: 250, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 },
  ] as const
  return {
    id: "frontier-pnp-early-voltage-output-resistance-sweep",
    title: "PNP Early-voltage output-resistance sweep",
    prompt:
      "Build three matched pairs of beta-100 PNP transistors with emitters at GND and every base held at -0.7 V. Give the pairs Early voltages of 40 V, 100 V, and 250 V. For each pair, pull one collector toward -3 V and the other toward -9 V through separate 10 Ohm sense resistors. Preserve all six collector nets and SHARED_BASE, simulate, and report the voltage and current changes. Demonstrate that the magnitude of the collector-current step shrinks and the inferred output resistance grows monotonically with modeled Early voltage.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VBASE", props: { voltageVolts: -0.7 } },
        { type: "dc-voltage-source", refdes: "VLOW", props: { voltageVolts: -3 } },
        { type: "dc-voltage-source", refdes: "VHIGH", props: { voltageVolts: -9 } },
        ...models.flatMap(({ prefix, earlyVoltageVolts }) => [
          { type: "resistor", refdes: `R${prefix}_LOW`, props: { resistanceOhms: 10 } },
          { type: "resistor", refdes: `R${prefix}_HIGH`, props: { resistanceOhms: 10 } },
          { type: "pnp-transistor", refdes: `Q${prefix}_LOW`, props: { beta: 100, earlyVoltageVolts, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
          { type: "pnp-transistor", refdes: `Q${prefix}_HIGH`, props: { beta: 100, earlyVoltageVolts, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        ]),
      ],
      nets: [
        {
          name: "LOW_SUPPLY",
          terminals: [
            { refdes: "VLOW", pin: "positive" },
            ...models.map(({ prefix }) => ({ refdes: `R${prefix}_LOW`, pin: "b" })),
          ],
        },
        {
          name: "HIGH_SUPPLY",
          terminals: [
            { refdes: "VHIGH", pin: "positive" },
            ...models.map(({ prefix }) => ({ refdes: `R${prefix}_HIGH`, pin: "b" })),
          ],
        },
        {
          name: "SHARED_BASE",
          terminals: [
            { refdes: "VBASE", pin: "positive" },
            ...models.flatMap(({ prefix }) => [
              { refdes: `Q${prefix}_LOW`, pin: "base" },
              { refdes: `Q${prefix}_HIGH`, pin: "base" },
            ]),
          ],
        },
        ...models.flatMap(({ prefix }) => [
          { name: `${prefix}_LOW_COLLECTOR`, terminals: [{ refdes: `R${prefix}_LOW`, pin: "a" }, { refdes: `Q${prefix}_LOW`, pin: "collector" }] },
          { name: `${prefix}_HIGH_COLLECTOR`, terminals: [{ refdes: `R${prefix}_HIGH`, pin: "a" }, { refdes: `Q${prefix}_HIGH`, pin: "collector" }] },
        ]),
        {
          name: "GND",
          terminals: [
            { refdes: "VBASE", pin: "negative" },
            { refdes: "VLOW", pin: "negative" },
            { refdes: "VHIGH", pin: "negative" },
            ...models.flatMap(({ prefix }) => [
              { refdes: `Q${prefix}_LOW`, pin: "emitter" },
              { refdes: `Q${prefix}_HIGH`, pin: "emitter" },
            ]),
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        "SHARED_BASE",
        ...models.flatMap(({ prefix }) => [
          `${prefix}_LOW_COLLECTOR`,
          `${prefix}_HIGH_COLLECTOR`,
        ]),
      ],
      netVoltages: models.flatMap(({ prefix, earlyVoltageVolts }) => [
        {
          name: `${prefix}_LOW_COLLECTOR`,
          expected: approximate(
            earlyVoltageVolts === 40 ? -2.994004 : earlyVoltageVolts === 100 ? -2.9942 : -2.994278,
            0.002,
          ),
        },
        {
          name: `${prefix}_HIGH_COLLECTOR`,
          expected: approximate(
            earlyVoltageVolts === 40 ? -8.993154 : earlyVoltageVolts === 100 ? -8.993859 : -8.994142,
            0.002,
          ),
        },
      ]),
      componentMeasurements: models.flatMap(({ prefix, earlyVoltageVolts }) => [
        {
          refdes: `R${prefix}_LOW`,
          metric: "current",
          expected: approximate(
            earlyVoltageVolts === 40 ? 0.000599554 : earlyVoltageVolts === 100 ? 0.000580044 : 0.000572238,
            0.000001,
          ),
        },
        {
          refdes: `R${prefix}_HIGH`,
          metric: "current",
          expected: approximate(
            earlyVoltageVolts === 40 ? 0.000684597 : earlyVoltageVolts === 100 ? 0.000614064 : 0.000585847,
            0.000001,
          ),
        },
      ]),
    }),
  }
}

function bjtVbeVceCurrentSurfaceCase() {
  const basePoints = [
    { prefix: "B640", baseVolts: 0.64, currentAtFiveVolts: 0.0000581657 },
    { prefix: "B660", baseVolts: 0.66, currentAtFiveVolts: 0.000126001 },
    { prefix: "B680", baseVolts: 0.68, currentAtFiveVolts: 0.000272927 },
  ] as const
  const collectorPoints = [
    { prefix: "C3", supplyVolts: 3 },
    { prefix: "C6", supplyVolts: 6 },
    { prefix: "C9", supplyVolts: 9 },
  ] as const
  const expectedCurrent = (currentAtFiveVolts: number, supplyVolts: number) =>
    currentAtFiveVolts * (100 + supplyVolts) / 105
  return {
    id: "frontier-bjt-vbe-vce-current-surface",
    title: "BJT VBE/VCE current surface",
    prompt:
      "Build a 3-by-3 matrix of beta-100 NPN branches with 100 V Early voltage and emitters at GND. The three base rows share ideal biases of 0.64 V, 0.66 V, and 0.68 V. The three collector columns use 3 V, 6 V, and 9 V supplies, with one 100 Ohm sense resistor per transistor. Preserve BASE_640, BASE_660, BASE_680; SUPPLY_3V, SUPPLY_6V, SUPPLY_9V; and every B640/B660/B680 by C3/C6/C9 collector net. Simulate all nine operating points and show both dimensions of the device surface: equal VBE steps produce nearly equal multiplicative current ratios, while collector current still rises modestly with VCE within each base-bias row.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        ...basePoints.map(({ prefix, baseVolts }) => ({
          type: "dc-voltage-source",
          refdes: `V${prefix}`,
          props: { voltageVolts: baseVolts },
        })),
        ...collectorPoints.map(({ prefix, supplyVolts }) => ({
          type: "dc-voltage-source",
          refdes: `V${prefix}`,
          props: { voltageVolts: supplyVolts },
        })),
        ...basePoints.flatMap(({ prefix: basePrefix }) =>
          collectorPoints.flatMap(({ prefix: collectorPrefix }) => [
            { type: "resistor", refdes: `R${basePrefix}_${collectorPrefix}`, props: { resistanceOhms: 100 } },
            { type: "npn-transistor", refdes: `Q${basePrefix}_${collectorPrefix}`, props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
          ]),
        ),
      ],
      nets: [
        ...basePoints.map(({ prefix }) => ({
          name: `BASE_${prefix.slice(1)}`,
          terminals: [
            { refdes: `V${prefix}`, pin: "positive" },
            ...collectorPoints.map(({ prefix: collectorPrefix }) => ({
              refdes: `Q${prefix}_${collectorPrefix}`,
              pin: "base",
            })),
          ],
        })),
        ...collectorPoints.map(({ prefix, supplyVolts }) => ({
          name: `SUPPLY_${supplyVolts}V`,
          terminals: [
            { refdes: `V${prefix}`, pin: "positive" },
            ...basePoints.map(({ prefix: basePrefix }) => ({
              refdes: `R${basePrefix}_${prefix}`,
              pin: "a",
            })),
          ],
        })),
        ...basePoints.flatMap(({ prefix: basePrefix }) =>
          collectorPoints.map(({ prefix: collectorPrefix }) => ({
            name: `${basePrefix}_${collectorPrefix}_COLLECTOR`,
            terminals: [
              { refdes: `R${basePrefix}_${collectorPrefix}`, pin: "b" },
              { refdes: `Q${basePrefix}_${collectorPrefix}`, pin: "collector" },
            ],
          })),
        ),
        {
          name: "GND",
          terminals: [
            ...basePoints.map(({ prefix }) => ({ refdes: `V${prefix}`, pin: "negative" })),
            ...collectorPoints.map(({ prefix }) => ({ refdes: `V${prefix}`, pin: "negative" })),
            ...basePoints.flatMap(({ prefix: basePrefix }) =>
              collectorPoints.map(({ prefix: collectorPrefix }) => ({
                refdes: `Q${basePrefix}_${collectorPrefix}`,
                pin: "emitter",
              })),
            ),
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        ...basePoints.map(({ prefix }) => `BASE_${prefix.slice(1)}`),
        ...collectorPoints.map(({ supplyVolts }) => `SUPPLY_${supplyVolts}V`),
        ...basePoints.flatMap(({ prefix: basePrefix }) =>
          collectorPoints.map(
            ({ prefix: collectorPrefix }) =>
              `${basePrefix}_${collectorPrefix}_COLLECTOR`,
          ),
        ),
      ],
      netVoltages: basePoints.flatMap(({ prefix: basePrefix, currentAtFiveVolts }) =>
        collectorPoints.map(({ prefix: collectorPrefix, supplyVolts }) => {
          const current = expectedCurrent(currentAtFiveVolts, supplyVolts)
          return {
            name: `${basePrefix}_${collectorPrefix}_COLLECTOR`,
            expected: approximate(supplyVolts - current * 100, 0.003),
          }
        }),
      ),
      componentMeasurements: basePoints.flatMap(({ prefix: basePrefix, currentAtFiveVolts }) =>
        collectorPoints.map(({ prefix: collectorPrefix, supplyVolts }) => ({
          refdes: `R${basePrefix}_${collectorPrefix}`,
          metric: "current",
          expected: approximate(
            expectedCurrent(currentAtFiveVolts, supplyVolts),
            0.000002,
          ),
        })),
      ),
    }),
  }
}

function zenerBreakdownResistanceCurrentMatrixCase() {
  const breakdowns = [
    { prefix: "4V7", breakdownVolts: 4.7 },
    { prefix: "5V6", breakdownVolts: 5.6 },
  ] as const
  const resistances = [
    { prefix: "R10", dynamicResistanceOhms: 10 },
    { prefix: "R100", dynamicResistanceOhms: 100 },
  ] as const
  const currents = [
    { prefix: "I2", currentAmps: 0.002 },
    { prefix: "I8", currentAmps: 0.008 },
  ] as const
  const referenceVolts = (
    breakdownVolts: number,
    dynamicResistanceOhms: number,
    currentAmps: number,
  ) =>
    breakdownVolts +
    0.02585 * Math.log(currentAmps / 0.001) +
    dynamicResistanceOhms * currentAmps
  return {
    id: "frontier-zener-breakdown-resistance-current-matrix",
    title: "Zener breakdown/resistance/current matrix",
    prompt:
      "Build eight independently current-biased Zener references covering a 2-by-2-by-2 matrix: nominal breakdown voltages 4.7 V and 5.6 V, dynamic resistances 10 Ohm and 100 Ohm, and reverse currents 2 mA and 8 mA. Use one ideal DC current source per branch from GND into the cathode and ground every anode. Preserve REF_4V7_R10_I2, REF_4V7_R10_I8, REF_4V7_R100_I2, REF_4V7_R100_I8, REF_5V6_R10_I2, REF_5V6_R10_I8, REF_5V6_R100_I2, REF_5V6_R100_I8, and GND. Simulate and report the complete voltage surface, separating the nominal 0.9 V breakdown shift from the approximately 16 Ohm and 106 Ohm measured incremental slopes.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: breakdowns.flatMap(({ prefix: breakdownPrefix, breakdownVolts }) =>
        resistances.flatMap(({ prefix: resistancePrefix, dynamicResistanceOhms }) =>
          currents.flatMap(({ prefix: currentPrefix, currentAmps }) => {
            const suffix = `${breakdownPrefix}_${resistancePrefix}_${currentPrefix}`
            return [
              { type: "dc-current-source", refdes: `I${suffix}`, props: { currentAmps } },
              {
                type: "zener-diode",
                refdes: `DZ${suffix}`,
                props: {
                  breakdownVolts,
                  breakdownCurrentAmps: 0.001,
                  saturationCurrentAmps: 1e-14,
                  emissionCoefficient: 1,
                  dynamicResistanceOhms,
                },
              },
            ]
          }),
        ),
      ),
      nets: [
        ...breakdowns.flatMap(({ prefix: breakdownPrefix }) =>
          resistances.flatMap(({ prefix: resistancePrefix }) =>
            currents.map(({ prefix: currentPrefix }) => {
              const suffix = `${breakdownPrefix}_${resistancePrefix}_${currentPrefix}`
              return {
                name: `REF_${suffix}`,
                terminals: [
                  { refdes: `I${suffix}`, pin: "negative" },
                  { refdes: `DZ${suffix}`, pin: "cathode" },
                ],
              }
            }),
          ),
        ),
        {
          name: "GND",
          terminals: breakdowns.flatMap(({ prefix: breakdownPrefix }) =>
            resistances.flatMap(({ prefix: resistancePrefix }) =>
              currents.flatMap(({ prefix: currentPrefix }) => {
                const suffix = `${breakdownPrefix}_${resistancePrefix}_${currentPrefix}`
                return [
                  { refdes: `I${suffix}`, pin: "positive" },
                  { refdes: `DZ${suffix}`, pin: "anode" },
                ]
              }),
            ),
          ),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        ...breakdowns.flatMap(({ prefix: breakdownPrefix }) =>
          resistances.flatMap(({ prefix: resistancePrefix }) =>
            currents.map(
              ({ prefix: currentPrefix }) =>
                `REF_${breakdownPrefix}_${resistancePrefix}_${currentPrefix}`,
            ),
          ),
        ),
      ],
      netVoltages: breakdowns.flatMap(({ prefix: breakdownPrefix, breakdownVolts }) =>
        resistances.flatMap(({ prefix: resistancePrefix, dynamicResistanceOhms }) =>
          currents.map(({ prefix: currentPrefix, currentAmps }) => ({
            name: `REF_${breakdownPrefix}_${resistancePrefix}_${currentPrefix}`,
            expected: approximate(
              referenceVolts(
                breakdownVolts,
                dynamicResistanceOhms,
                currentAmps,
              ),
              0.003,
            ),
          })),
        ),
      ),
      componentMeasurements: breakdowns.flatMap(({ prefix: breakdownPrefix }) =>
        resistances.flatMap(({ prefix: resistancePrefix }) =>
          currents.map(({ prefix: currentPrefix, currentAmps }) => ({
            refdes: `I${breakdownPrefix}_${resistancePrefix}_${currentPrefix}`,
            metric: "current",
            expected: approximate(currentAmps, 0.000001),
          })),
        ),
      ),
    }),
  }
}

function pmosChannelLengthModulationSweepCase() {
  const models = [
    { prefix: "L0005", channelLengthModulationPerVolt: 0.005 },
    { prefix: "L0020", channelLengthModulationPerVolt: 0.02 },
    { prefix: "L0080", channelLengthModulationPerVolt: 0.08 },
  ] as const
  const drainPoints = [
    { prefix: "LOW", supplyRefdes: "VLOW", supplyMagnitudeVolts: 3 },
    { prefix: "HIGH", supplyRefdes: "VHIGH", supplyMagnitudeVolts: 9 },
  ] as const
  const current = (
    channelLengthModulationPerVolt: number,
    drainSupplyMagnitudeVolts: number,
  ) =>
    saturatedMosfetCurrent(
      0.008,
      1,
      channelLengthModulationPerVolt,
      drainSupplyMagnitudeVolts,
      10,
    )

  return {
    id: "frontier-pmos-channel-length-modulation-sweep",
    title: "P-channel MOSFET channel-length-modulation sweep",
    prompt:
      "Build three matched pairs of P-channel MOSFET branches around a grounded source and a shared -3 V gate. Give every device a -2 V threshold and an 8 mA/V^2 transconductance parameter. Use channel-length-modulation values 0.005 /V, 0.02 /V, and 0.08 /V for the three pairs. Within each pair connect one drain through 10 Ohm to -3 V and the other through 10 Ohm to -9 V. Preserve SHARED_GATE, LOW_SUPPLY, HIGH_SUPPLY, and every L0005/L0020/L0080 low/high drain net. Simulate all six operating points and report the progression from high to low inferred output resistance as channel-length modulation increases.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        {
          type: "dc-voltage-source",
          refdes: "VGATE",
          props: { voltageVolts: -3 },
        },
        {
          type: "dc-voltage-source",
          refdes: "VLOW",
          props: { voltageVolts: -3 },
        },
        {
          type: "dc-voltage-source",
          refdes: "VHIGH",
          props: { voltageVolts: -9 },
        },
        ...models.flatMap(({ prefix, channelLengthModulationPerVolt }) =>
          drainPoints.flatMap(({ prefix: drainPrefix }) => [
            {
              type: "resistor",
              refdes: `R${prefix}_${drainPrefix}`,
              props: { resistanceOhms: 10 },
            },
            {
              type: "p-mosfet",
              refdes: `M${prefix}_${drainPrefix}`,
              props: mosfetProps(
                -2,
                0.008,
                channelLengthModulationPerVolt,
              ),
            },
          ]),
        ),
      ],
      nets: [
        {
          name: "SHARED_GATE",
          terminals: [
            { refdes: "VGATE", pin: "positive" },
            ...models.flatMap(({ prefix }) =>
              drainPoints.map(({ prefix: drainPrefix }) => ({
                refdes: `M${prefix}_${drainPrefix}`,
                pin: "gate",
              })),
            ),
          ],
        },
        ...drainPoints.map(({ prefix, supplyRefdes }) => ({
          name: `${prefix}_SUPPLY`,
          terminals: [
            { refdes: supplyRefdes, pin: "positive" },
            ...models.map(({ prefix: modelPrefix }) => ({
              refdes: `R${modelPrefix}_${prefix}`,
              pin: "b",
            })),
          ],
        })),
        ...models.flatMap(({ prefix }) =>
          drainPoints.map(({ prefix: drainPrefix }) => ({
            name: `${prefix}_${drainPrefix}_DRAIN`,
            terminals: [
              { refdes: `R${prefix}_${drainPrefix}`, pin: "a" },
              { refdes: `M${prefix}_${drainPrefix}`, pin: "drain" },
            ],
          })),
        ),
        {
          name: "GND",
          terminals: [
            { refdes: "VGATE", pin: "negative" },
            { refdes: "VLOW", pin: "negative" },
            { refdes: "VHIGH", pin: "negative" },
            ...models.flatMap(({ prefix }) =>
              drainPoints.map(({ prefix: drainPrefix }) => ({
                refdes: `M${prefix}_${drainPrefix}`,
                pin: "source",
              })),
            ),
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        "SHARED_GATE",
        "LOW_SUPPLY",
        "HIGH_SUPPLY",
        ...models.flatMap(({ prefix }) =>
          drainPoints.map(
            ({ prefix: drainPrefix }) => `${prefix}_${drainPrefix}_DRAIN`,
          ),
        ),
      ],
      netVoltages: models.flatMap(
        ({ prefix, channelLengthModulationPerVolt }) =>
          drainPoints.map(
            ({ prefix: drainPrefix, supplyMagnitudeVolts }) => {
              const branchCurrent = current(
                channelLengthModulationPerVolt,
                supplyMagnitudeVolts,
              )
              return {
                name: `${prefix}_${drainPrefix}_DRAIN`,
                expected: approximate(
                  -supplyMagnitudeVolts + branchCurrent * 10,
                  0.003,
                ),
              }
            },
          ),
      ),
      componentMeasurements: models.flatMap(
        ({ prefix, channelLengthModulationPerVolt }) =>
          drainPoints.map(({ prefix: drainPrefix, supplyMagnitudeVolts }) => ({
            refdes: `R${prefix}_${drainPrefix}`,
            metric: "current",
            expected: approximate(
              current(
                channelLengthModulationPerVolt,
                supplyMagnitudeVolts,
              ),
              0.000002,
            ),
          })),
      ),
    }),
  }
}

function nmosTransconductanceOverdriveSurfaceCase() {
  const strengths = [
    { prefix: "KP005", transconductanceAmpsPerVoltSquared: 0.005 },
    { prefix: "KP020", transconductanceAmpsPerVoltSquared: 0.02 },
    { prefix: "KP050", transconductanceAmpsPerVoltSquared: 0.05 },
  ] as const
  const overdrives = [
    { prefix: "VOV05", gateVolts: 2.5, overdriveVolts: 0.5 },
    { prefix: "VOV10", gateVolts: 3, overdriveVolts: 1 },
    { prefix: "VOV15", gateVolts: 3.5, overdriveVolts: 1.5 },
  ] as const
  const current = (
    transconductanceAmpsPerVoltSquared: number,
    overdriveVolts: number,
  ) => (transconductanceAmpsPerVoltSquared / 2) * overdriveVolts ** 2

  return {
    id: "frontier-nmos-transconductance-overdrive-surface",
    title: "NMOS transconductance/overdrive current surface",
    prompt:
      "Build a three-by-three matrix of N-channel MOSFET saturation branches from one 9 V drain supply through equal 10 Ohm sense resistors. Every source is grounded, every threshold is 2 V, and channel-length modulation is zero. Use transconductance-parameter rows of 5 mA/V^2, 20 mA/V^2, and 50 mA/V^2; use shared gate columns of 2.5 V, 3 V, and 3.5 V for overdrives of 0.5 V, 1 V, and 1.5 V. Preserve all three gate nets and all nine KP-by-VOV drain nets. Simulate the complete surface and report linear scaling with transconductance parameter plus square-law scaling with gate overdrive.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VDD", props: { voltageVolts: 9 } },
        ...overdrives.map(({ prefix, gateVolts }) => ({
          type: "dc-voltage-source",
          refdes: `VG_${prefix}`,
          props: { voltageVolts: gateVolts },
        })),
        ...strengths.flatMap(
          ({ prefix: strengthPrefix, transconductanceAmpsPerVoltSquared }) =>
            overdrives.flatMap(({ prefix: overdrivePrefix }) => [
              {
                type: "resistor",
                refdes: `R${strengthPrefix}_${overdrivePrefix}`,
                props: { resistanceOhms: 10 },
              },
              {
                type: "n-mosfet",
                refdes: `M${strengthPrefix}_${overdrivePrefix}`,
                props: mosfetProps(
                  2,
                  transconductanceAmpsPerVoltSquared,
                  0,
                ),
              },
            ]),
        ),
      ],
      nets: [
        {
          name: "VDD",
          terminals: [
            { refdes: "VDD", pin: "positive" },
            ...strengths.flatMap(({ prefix: strengthPrefix }) =>
              overdrives.map(({ prefix: overdrivePrefix }) => ({
                refdes: `R${strengthPrefix}_${overdrivePrefix}`,
                pin: "a",
              })),
            ),
          ],
        },
        ...overdrives.map(({ prefix }) => ({
          name: `${prefix}_GATE`,
          terminals: [
            { refdes: `VG_${prefix}`, pin: "positive" },
            ...strengths.map(({ prefix: strengthPrefix }) => ({
              refdes: `M${strengthPrefix}_${prefix}`,
              pin: "gate",
            })),
          ],
        })),
        ...strengths.flatMap(({ prefix: strengthPrefix }) =>
          overdrives.map(({ prefix: overdrivePrefix }) => ({
            name: `${strengthPrefix}_${overdrivePrefix}_DRAIN`,
            terminals: [
              { refdes: `R${strengthPrefix}_${overdrivePrefix}`, pin: "b" },
              { refdes: `M${strengthPrefix}_${overdrivePrefix}`, pin: "drain" },
            ],
          })),
        ),
        {
          name: "GND",
          terminals: [
            { refdes: "VDD", pin: "negative" },
            ...overdrives.map(({ prefix }) => ({
              refdes: `VG_${prefix}`,
              pin: "negative",
            })),
            ...strengths.flatMap(({ prefix: strengthPrefix }) =>
              overdrives.map(({ prefix: overdrivePrefix }) => ({
                refdes: `M${strengthPrefix}_${overdrivePrefix}`,
                pin: "source",
              })),
            ),
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        "VDD",
        ...overdrives.map(({ prefix }) => `${prefix}_GATE`),
        ...strengths.flatMap(({ prefix: strengthPrefix }) =>
          overdrives.map(
            ({ prefix: overdrivePrefix }) =>
              `${strengthPrefix}_${overdrivePrefix}_DRAIN`,
          ),
        ),
      ],
      netVoltages: strengths.flatMap(
        ({ prefix: strengthPrefix, transconductanceAmpsPerVoltSquared }) =>
          overdrives.map(({ prefix: overdrivePrefix, overdriveVolts }) => {
            const branchCurrent = current(
              transconductanceAmpsPerVoltSquared,
              overdriveVolts,
            )
            return {
              name: `${strengthPrefix}_${overdrivePrefix}_DRAIN`,
              expected: approximate(9 - branchCurrent * 10, 0.003),
            }
          }),
      ),
      componentMeasurements: strengths.flatMap(
        ({ prefix: strengthPrefix, transconductanceAmpsPerVoltSquared }) =>
          overdrives.map(({ prefix: overdrivePrefix, overdriveVolts }) => ({
            refdes: `R${strengthPrefix}_${overdrivePrefix}`,
            metric: "current",
            expected: approximate(
              current(
                transconductanceAmpsPerVoltSquared,
                overdriveVolts,
              ),
              0.000003,
            ),
          })),
      ),
    }),
  }
}

function nmosTriodeSaturationSurfaceCase() {
  const rows = [
    {
      prefix: "VOV1",
      gateVolts: 3,
      points: [
        {
          prefix: "D025",
          supplyVolts: 0.25,
          current: 0.0021711925,
          drainVolts: 0.247828808,
        },
        {
          prefix: "D075",
          supplyVolts: 0.75,
          current: 0.0046757014,
          drainVolts: 0.745324299,
        },
        {
          prefix: "D300",
          supplyVolts: 3,
          current: 0.005,
          drainVolts: 2.995,
        },
      ],
    },
    {
      prefix: "VOV2",
      gateVolts: 4,
      points: [
        {
          prefix: "D050",
          supplyVolts: 0.5,
          current: 0.0086203236,
          drainVolts: 0.491379676,
        },
        {
          prefix: "D150",
          supplyVolts: 1.5,
          current: 0.018654985,
          drainVolts: 1.481345015,
        },
        {
          prefix: "D600",
          supplyVolts: 6,
          current: 0.02,
          drainVolts: 5.98,
        },
      ],
    },
  ] as const

  return {
    id: "frontier-nmos-triode-saturation-region-surface",
    title: "NMOS triode-to-saturation region surface",
    prompt:
      "Build two three-point N-channel MOSFET output-characteristic rows. Every device has a grounded source, 2 V threshold, 10 mA/V^2 transconductance parameter, zero channel-length modulation, and a 1 Ohm drain sense resistor. Hold the first row at a 3 V gate (1 V overdrive) and bias its drains from 0.25 V, 0.75 V, and 3 V supplies. Hold the second row at a 4 V gate (2 V overdrive) and bias its drains from 0.5 V, 1.5 V, and 6 V supplies. Preserve both gate nets and all six drain nets. Simulate and identify the rising triode-region points, the nearly flat saturation point in each row, and the fourfold saturated-current increase when overdrive doubles.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: rows.flatMap(({ prefix: rowPrefix, gateVolts, points }) => [
        {
          type: "dc-voltage-source",
          refdes: `VG_${rowPrefix}`,
          props: { voltageVolts: gateVolts },
        },
        ...points.flatMap(({ prefix: pointPrefix, supplyVolts }) => [
          {
            type: "dc-voltage-source",
            refdes: `VD_${rowPrefix}_${pointPrefix}`,
            props: { voltageVolts: supplyVolts },
          },
          {
            type: "resistor",
            refdes: `R_${rowPrefix}_${pointPrefix}`,
            props: { resistanceOhms: 1 },
          },
          {
            type: "n-mosfet",
            refdes: `M_${rowPrefix}_${pointPrefix}`,
            props: mosfetProps(2, 0.01, 0),
          },
        ]),
      ]),
      nets: [
        ...rows.map(({ prefix: rowPrefix, points }) => ({
          name: `${rowPrefix}_GATE`,
          terminals: [
            { refdes: `VG_${rowPrefix}`, pin: "positive" },
            ...points.map(({ prefix: pointPrefix }) => ({
              refdes: `M_${rowPrefix}_${pointPrefix}`,
              pin: "gate",
            })),
          ],
        })),
        ...rows.flatMap(({ prefix: rowPrefix, points }) =>
          points.flatMap(({ prefix: pointPrefix }) => [
            {
              name: `${rowPrefix}_${pointPrefix}_SUPPLY`,
              terminals: [
                { refdes: `VD_${rowPrefix}_${pointPrefix}`, pin: "positive" },
                { refdes: `R_${rowPrefix}_${pointPrefix}`, pin: "a" },
              ],
            },
            {
              name: `${rowPrefix}_${pointPrefix}_DRAIN`,
              terminals: [
                { refdes: `R_${rowPrefix}_${pointPrefix}`, pin: "b" },
                { refdes: `M_${rowPrefix}_${pointPrefix}`, pin: "drain" },
              ],
            },
          ]),
        ),
        {
          name: "GND",
          terminals: rows.flatMap(({ prefix: rowPrefix, points }) => [
            { refdes: `VG_${rowPrefix}`, pin: "negative" },
            ...points.flatMap(({ prefix: pointPrefix }) => [
              { refdes: `VD_${rowPrefix}_${pointPrefix}`, pin: "negative" },
              { refdes: `M_${rowPrefix}_${pointPrefix}`, pin: "source" },
            ]),
          ]),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        ...rows.map(({ prefix }) => `${prefix}_GATE`),
        ...rows.flatMap(({ prefix: rowPrefix, points }) =>
          points.flatMap(({ prefix: pointPrefix }) => [
            `${rowPrefix}_${pointPrefix}_SUPPLY`,
            `${rowPrefix}_${pointPrefix}_DRAIN`,
          ]),
        ),
      ],
      netVoltages: rows.flatMap(({ prefix: rowPrefix, points }) =>
        points.map(({ prefix: pointPrefix, drainVolts }) => ({
          name: `${rowPrefix}_${pointPrefix}_DRAIN`,
          expected: approximate(drainVolts, 0.003),
        })),
      ),
      componentMeasurements: rows.flatMap(({ prefix: rowPrefix, points }) =>
        points.map(({ prefix: pointPrefix, current }) => ({
          refdes: `R_${rowPrefix}_${pointPrefix}`,
          metric: "current",
          expected: approximate(current, 0.000003),
        })),
      ),
    }),
  }
}

function diodeSaturationEmissionCurrentMatrixCase() {
  const models = [
    { prefix: "IS14_N1", saturationCurrentAmps: 1e-14, emissionCoefficient: 1 },
    { prefix: "IS14_N2", saturationCurrentAmps: 1e-14, emissionCoefficient: 2 },
    { prefix: "IS12_N1", saturationCurrentAmps: 1e-12, emissionCoefficient: 1 },
    { prefix: "IS12_N2", saturationCurrentAmps: 1e-12, emissionCoefficient: 2 },
  ] as const
  const currents = [
    { prefix: "I01", currentAmps: 0.0001 },
    { prefix: "I1", currentAmps: 0.001 },
  ] as const

  return {
    id: "frontier-diode-is-n-current-matrix",
    title: "Diode saturation-current/emission/current matrix",
    prompt:
      "Build eight independently current-biased ordinary-diode branches with grounded cathodes and zero series resistance. Use a two-by-two device-model matrix of saturation currents 10 fA and 1 pA with emission coefficients 1 and 2. Exercise every model at both 0.1 mA and 1 mA. Preserve all eight FORWARD_IS14_N1/IS14_N2/IS12_N1/IS12_N2 by I01/I1 net names and GND. Simulate the complete voltage matrix, showing that larger saturation current lowers forward voltage, emission coefficient scales voltage, and each current decade produces a repeatable logarithmic increment.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: models.flatMap(
        ({ prefix: modelPrefix, saturationCurrentAmps, emissionCoefficient }) =>
          currents.flatMap(({ prefix: currentPrefix, currentAmps }) => {
            const suffix = `${modelPrefix}_${currentPrefix}`
            return [
              {
                type: "dc-current-source",
                refdes: `I${suffix}`,
                props: { currentAmps },
              },
              {
                type: "diode",
                refdes: `D${suffix}`,
                props: diodeProps(
                  saturationCurrentAmps,
                  emissionCoefficient,
                  0,
                ),
              },
            ]
          }),
      ),
      nets: [
        ...models.flatMap(({ prefix: modelPrefix }) =>
          currents.map(({ prefix: currentPrefix }) => {
            const suffix = `${modelPrefix}_${currentPrefix}`
            return {
              name: `FORWARD_${suffix}`,
              terminals: [
                { refdes: `I${suffix}`, pin: "negative" },
                { refdes: `D${suffix}`, pin: "anode" },
              ],
            }
          }),
        ),
        {
          name: "GND",
          terminals: models.flatMap(({ prefix: modelPrefix }) =>
            currents.flatMap(({ prefix: currentPrefix }) => {
              const suffix = `${modelPrefix}_${currentPrefix}`
              return [
                { refdes: `I${suffix}`, pin: "positive" },
                { refdes: `D${suffix}`, pin: "cathode" },
              ]
            }),
          ),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        ...models.flatMap(({ prefix: modelPrefix }) =>
          currents.map(
            ({ prefix: currentPrefix }) =>
              `FORWARD_${modelPrefix}_${currentPrefix}`,
          ),
        ),
      ],
      netVoltages: models.flatMap(
        ({ prefix: modelPrefix, saturationCurrentAmps, emissionCoefficient }) =>
          currents.map(({ prefix: currentPrefix, currentAmps }) => ({
            name: `FORWARD_${modelPrefix}_${currentPrefix}`,
            expected: approximate(
              diodeForwardVolts(
                currentAmps,
                saturationCurrentAmps,
                emissionCoefficient,
              ),
              0.001,
            ),
          })),
      ),
      componentMeasurements: models.flatMap(({ prefix: modelPrefix }) =>
        currents.map(({ prefix: currentPrefix, currentAmps }) => ({
          refdes: `I${modelPrefix}_${currentPrefix}`,
          metric: "current",
          expected: approximate(currentAmps, 0.000001),
        })),
      ),
    }),
  }
}

function diodeSeriesResistanceCurrentSweepCase() {
  const resistances = [
    { prefix: "RS0", seriesResistanceOhms: 0 },
    { prefix: "RS25", seriesResistanceOhms: 25 },
    { prefix: "RS100", seriesResistanceOhms: 100 },
  ] as const
  const currents = [
    { prefix: "I1", currentAmps: 0.001 },
    { prefix: "I10", currentAmps: 0.01 },
  ] as const

  return {
    id: "frontier-diode-series-resistance-current-sweep",
    title: "Diode series-resistance current sweep",
    prompt:
      "Build three matched pairs of independently current-biased ordinary diodes with grounded cathodes. Give all six devices 10 fA saturation current and emission coefficient 1. Use series-resistance rows of 0 Ohm, 25 Ohm, and 100 Ohm; exercise each row at 1 mA and 10 mA. Preserve every FORWARD_RS0/RS25/RS100 by I1/I10 net and GND. Simulate all six voltages and infer each row's incremental voltage/current slope, separating the shared logarithmic junction slope from the modeled series resistance.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: resistances.flatMap(
        ({ prefix: resistancePrefix, seriesResistanceOhms }) =>
          currents.flatMap(({ prefix: currentPrefix, currentAmps }) => {
            const suffix = `${resistancePrefix}_${currentPrefix}`
            return [
              {
                type: "dc-current-source",
                refdes: `I${suffix}`,
                props: { currentAmps },
              },
              {
                type: "diode",
                refdes: `D${suffix}`,
                props: diodeProps(1e-14, 1, seriesResistanceOhms),
              },
            ]
          }),
      ),
      nets: [
        ...resistances.flatMap(({ prefix: resistancePrefix }) =>
          currents.map(({ prefix: currentPrefix }) => {
            const suffix = `${resistancePrefix}_${currentPrefix}`
            return {
              name: `FORWARD_${suffix}`,
              terminals: [
                { refdes: `I${suffix}`, pin: "negative" },
                { refdes: `D${suffix}`, pin: "anode" },
              ],
            }
          }),
        ),
        {
          name: "GND",
          terminals: resistances.flatMap(({ prefix: resistancePrefix }) =>
            currents.flatMap(({ prefix: currentPrefix }) => {
              const suffix = `${resistancePrefix}_${currentPrefix}`
              return [
                { refdes: `I${suffix}`, pin: "positive" },
                { refdes: `D${suffix}`, pin: "cathode" },
              ]
            }),
          ),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        ...resistances.flatMap(({ prefix: resistancePrefix }) =>
          currents.map(
            ({ prefix: currentPrefix }) =>
              `FORWARD_${resistancePrefix}_${currentPrefix}`,
          ),
        ),
      ],
      netVoltages: resistances.flatMap(
        ({ prefix: resistancePrefix, seriesResistanceOhms }) =>
          currents.map(({ prefix: currentPrefix, currentAmps }) => ({
            name: `FORWARD_${resistancePrefix}_${currentPrefix}`,
            expected: approximate(
              diodeForwardVolts(currentAmps, 1e-14, 1, seriesResistanceOhms),
              0.001,
            ),
          })),
      ),
      componentMeasurements: resistances.flatMap(
        ({ prefix: resistancePrefix }) =>
          currents.map(({ prefix: currentPrefix, currentAmps }) => ({
            refdes: `I${resistancePrefix}_${currentPrefix}`,
            metric: "current",
            expected: approximate(currentAmps, 0.000001),
          })),
      ),
    }),
  }
}

function diodeEmissionCurrentDecadeSurfaceCase() {
  const emissions = [
    { prefix: "N1", emissionCoefficient: 1 },
    { prefix: "N15", emissionCoefficient: 1.5 },
    { prefix: "N2", emissionCoefficient: 2 },
  ] as const
  const currents = [
    { prefix: "I001", currentAmps: 0.00001 },
    { prefix: "I01", currentAmps: 0.0001 },
    { prefix: "I1", currentAmps: 0.001 },
  ] as const

  return {
    id: "frontier-diode-emission-current-decade-surface",
    title: "Diode emission-coefficient current-decade surface",
    prompt:
      "Build a three-by-three surface of independently current-biased ordinary diodes with grounded cathodes. Give every device 10 fA saturation current and zero series resistance. Use emission-coefficient rows 1, 1.5, and 2, and current columns 10 uA, 100 uA, and 1 mA. Preserve every FORWARD_N1/N15/N2 by I001/I01/I1 net and GND. Simulate all nine voltages and demonstrate that equal current decades give nearly equal voltage steps within a row while the step size grows in proportion to emission coefficient.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: emissions.flatMap(
        ({ prefix: emissionPrefix, emissionCoefficient }) =>
          currents.flatMap(({ prefix: currentPrefix, currentAmps }) => {
            const suffix = `${emissionPrefix}_${currentPrefix}`
            return [
              {
                type: "dc-current-source",
                refdes: `I${suffix}`,
                props: { currentAmps },
              },
              {
                type: "diode",
                refdes: `D${suffix}`,
                props: diodeProps(1e-14, emissionCoefficient, 0),
              },
            ]
          }),
      ),
      nets: [
        ...emissions.flatMap(({ prefix: emissionPrefix }) =>
          currents.map(({ prefix: currentPrefix }) => {
            const suffix = `${emissionPrefix}_${currentPrefix}`
            return {
              name: `FORWARD_${suffix}`,
              terminals: [
                { refdes: `I${suffix}`, pin: "negative" },
                { refdes: `D${suffix}`, pin: "anode" },
              ],
            }
          }),
        ),
        {
          name: "GND",
          terminals: emissions.flatMap(({ prefix: emissionPrefix }) =>
            currents.flatMap(({ prefix: currentPrefix }) => {
              const suffix = `${emissionPrefix}_${currentPrefix}`
              return [
                { refdes: `I${suffix}`, pin: "positive" },
                { refdes: `D${suffix}`, pin: "cathode" },
              ]
            }),
          ),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        ...emissions.flatMap(({ prefix: emissionPrefix }) =>
          currents.map(
            ({ prefix: currentPrefix }) =>
              `FORWARD_${emissionPrefix}_${currentPrefix}`,
          ),
        ),
      ],
      netVoltages: emissions.flatMap(
        ({ prefix: emissionPrefix, emissionCoefficient }) =>
          currents.map(({ prefix: currentPrefix, currentAmps }) => ({
            name: `FORWARD_${emissionPrefix}_${currentPrefix}`,
            expected: approximate(
              diodeForwardVolts(currentAmps, 1e-14, emissionCoefficient),
              0.001,
            ),
          })),
      ),
      componentMeasurements: emissions.flatMap(({ prefix: emissionPrefix }) =>
        currents.map(({ prefix: currentPrefix, currentAmps }) => ({
          refdes: `I${emissionPrefix}_${currentPrefix}`,
          metric: "current",
          expected: approximate(currentAmps, 0.000001),
        })),
      ),
    }),
  }
}

function bjtSaturationEmissionCurrentMatrixCase() {
  const models = [
    { prefix: "IS15_NF1", saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 },
    { prefix: "IS15_NF15", saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1.5 },
    { prefix: "IS13_NF1", saturationCurrentAmps: 1e-13, forwardEmissionCoefficient: 1 },
    { prefix: "IS13_NF15", saturationCurrentAmps: 1e-13, forwardEmissionCoefficient: 1.5 },
  ] as const
  const currents = [
    { prefix: "I01", currentAmps: 0.0001 },
    { prefix: "I1", currentAmps: 0.001 },
  ] as const

  return {
    id: "frontier-bjt-is-nf-current-matrix",
    title: "BJT saturation-current/emission/current matrix",
    prompt:
      "Build eight independently current-biased, diode-connected beta-100 NPN transistors with every base tied to its collector and every emitter at GND. Use a two-by-two model matrix of transport saturation currents 1 fA and 100 fA with forward emission coefficients 1 and 1.5, all with 100 V Early voltage. Exercise every model at 0.1 mA and 1 mA. Preserve every VBE_IS15_NF1/IS15_NF15/IS13_NF1/IS13_NF15 by I01/I1 net and GND. Simulate all eight voltages, showing the saturation-current offset, emission-coefficient scaling, and logarithmic current-decade increments.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: models.flatMap(
        ({ prefix: modelPrefix, saturationCurrentAmps, forwardEmissionCoefficient }) =>
          currents.flatMap(({ prefix: currentPrefix, currentAmps }) => {
            const suffix = `${modelPrefix}_${currentPrefix}`
            return [
              {
                type: "dc-current-source",
                refdes: `I${suffix}`,
                props: { currentAmps },
              },
              {
                type: "npn-transistor",
                refdes: `Q${suffix}`,
                props: bjtProps(
                  saturationCurrentAmps,
                  forwardEmissionCoefficient,
                ),
              },
            ]
          }),
      ),
      nets: [
        ...models.flatMap(({ prefix: modelPrefix }) =>
          currents.map(({ prefix: currentPrefix }) => {
            const suffix = `${modelPrefix}_${currentPrefix}`
            return {
              name: `VBE_${suffix}`,
              terminals: [
                { refdes: `I${suffix}`, pin: "negative" },
                { refdes: `Q${suffix}`, pin: "base" },
                { refdes: `Q${suffix}`, pin: "collector" },
              ],
            }
          }),
        ),
        {
          name: "GND",
          terminals: models.flatMap(({ prefix: modelPrefix }) =>
            currents.flatMap(({ prefix: currentPrefix }) => {
              const suffix = `${modelPrefix}_${currentPrefix}`
              return [
                { refdes: `I${suffix}`, pin: "positive" },
                { refdes: `Q${suffix}`, pin: "emitter" },
              ]
            }),
          ),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        ...models.flatMap(({ prefix: modelPrefix }) =>
          currents.map(
            ({ prefix: currentPrefix }) => `VBE_${modelPrefix}_${currentPrefix}`,
          ),
        ),
      ],
      netVoltages: models.flatMap(
        ({ prefix: modelPrefix, saturationCurrentAmps, forwardEmissionCoefficient }) =>
          currents.map(({ prefix: currentPrefix, currentAmps }) => ({
            name: `VBE_${modelPrefix}_${currentPrefix}`,
            expected: approximate(
              diodeConnectedBjtVolts(
                saturationCurrentAmps,
                forwardEmissionCoefficient,
                currentAmps,
              ),
              0.001,
            ),
          })),
      ),
      componentMeasurements: models.flatMap(({ prefix: modelPrefix }) =>
        currents.map(({ prefix: currentPrefix, currentAmps }) => ({
          refdes: `I${modelPrefix}_${currentPrefix}`,
          metric: "current",
          expected: approximate(currentAmps, 0.000001),
        })),
      ),
    }),
  }
}

function complementaryBjtJunctionCurrentSweepCase() {
  const models = [
    { prefix: "NF1", forwardEmissionCoefficient: 1 },
    { prefix: "NF14", forwardEmissionCoefficient: 1.4 },
  ] as const
  const currents = [
    { prefix: "I01", currentAmps: 0.0001 },
    { prefix: "I1", currentAmps: 0.001 },
  ] as const

  return {
    id: "frontier-complementary-bjt-junction-current-sweep",
    title: "Complementary BJT junction-current sweep",
    prompt:
      "Build two matched complementary diode-connected BJT pairs at each of two current levels. Tie every base to its collector and every emitter to GND. Use beta 100, Early voltage 100 V, and transport saturation current 1 fA throughout; use forward emission coefficient 1 for one NPN/PNP family and 1.4 for the other. Bias every polarity at 0.1 mA and 1 mA with the appropriate source direction. Preserve every VBE_N/P_NF1/NF14 by I01/I1 net and GND. Simulate all eight signed voltages and demonstrate equal complementary magnitudes, equal current-decade steps by polarity, and proportional emission-coefficient scaling.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: models.flatMap(({ prefix: modelPrefix, forwardEmissionCoefficient }) =>
        currents.flatMap(({ prefix: currentPrefix, currentAmps }) => {
          const suffix = `${modelPrefix}_${currentPrefix}`
          return [
            {
              type: "dc-current-source",
              refdes: `IN_${suffix}`,
              props: { currentAmps },
            },
            {
              type: "dc-current-source",
              refdes: `IP_${suffix}`,
              props: { currentAmps },
            },
            {
              type: "npn-transistor",
              refdes: `QN_${suffix}`,
              props: bjtProps(1e-15, forwardEmissionCoefficient),
            },
            {
              type: "pnp-transistor",
              refdes: `QP_${suffix}`,
              props: bjtProps(1e-15, forwardEmissionCoefficient),
            },
          ]
        }),
      ),
      nets: [
        ...models.flatMap(({ prefix: modelPrefix }) =>
          currents.flatMap(({ prefix: currentPrefix }) => {
            const suffix = `${modelPrefix}_${currentPrefix}`
            return [
              {
                name: `VBE_N_${suffix}`,
                terminals: [
                  { refdes: `IN_${suffix}`, pin: "negative" },
                  { refdes: `QN_${suffix}`, pin: "base" },
                  { refdes: `QN_${suffix}`, pin: "collector" },
                ],
              },
              {
                name: `VBE_P_${suffix}`,
                terminals: [
                  { refdes: `IP_${suffix}`, pin: "positive" },
                  { refdes: `QP_${suffix}`, pin: "base" },
                  { refdes: `QP_${suffix}`, pin: "collector" },
                ],
              },
            ]
          }),
        ),
        {
          name: "GND",
          terminals: models.flatMap(({ prefix: modelPrefix }) =>
            currents.flatMap(({ prefix: currentPrefix }) => {
              const suffix = `${modelPrefix}_${currentPrefix}`
              return [
                { refdes: `IN_${suffix}`, pin: "positive" },
                { refdes: `IP_${suffix}`, pin: "negative" },
                { refdes: `QN_${suffix}`, pin: "emitter" },
                { refdes: `QP_${suffix}`, pin: "emitter" },
              ]
            }),
          ),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        ...models.flatMap(({ prefix: modelPrefix }) =>
          currents.flatMap(({ prefix: currentPrefix }) => [
            `VBE_N_${modelPrefix}_${currentPrefix}`,
            `VBE_P_${modelPrefix}_${currentPrefix}`,
          ]),
        ),
      ],
      netVoltages: models.flatMap(({ prefix: modelPrefix, forwardEmissionCoefficient }) =>
        currents.flatMap(({ prefix: currentPrefix, currentAmps }) => {
          const magnitude = diodeConnectedBjtVolts(
            1e-15,
            forwardEmissionCoefficient,
            currentAmps,
          )
          return [
            {
              name: `VBE_N_${modelPrefix}_${currentPrefix}`,
              expected: approximate(magnitude, 0.001),
            },
            {
              name: `VBE_P_${modelPrefix}_${currentPrefix}`,
              expected: approximate(-magnitude, 0.001),
            },
          ]
        }),
      ),
      componentMeasurements: models.flatMap(({ prefix: modelPrefix }) =>
        currents.flatMap(({ prefix: currentPrefix, currentAmps }) => [
          {
            refdes: `IN_${modelPrefix}_${currentPrefix}`,
            metric: "current",
            expected: approximate(currentAmps, 0.000001),
          },
          {
            refdes: `IP_${modelPrefix}_${currentPrefix}`,
            metric: "current",
            expected: approximate(currentAmps, 0.000001),
          },
        ]),
      ),
    }),
  }
}

function bjtEmissionBaseVoltageCurrentSurfaceCase() {
  const emissions = [
    { prefix: "NF1", forwardEmissionCoefficient: 1 },
    { prefix: "NF12", forwardEmissionCoefficient: 1.2 },
    { prefix: "NF15", forwardEmissionCoefficient: 1.5 },
  ] as const
  const basePoints = [
    { prefix: "B620", baseVolts: 0.62 },
    { prefix: "B660", baseVolts: 0.66 },
    { prefix: "B700", baseVolts: 0.7 },
  ] as const
  const branchCurrents = {
    NF1: {
      B620: 0.00002685011937,
      B660: 0.00012600077017,
      B700: 0.00059108201344,
    },
    NF12: {
      B620: 4.94206691e-7,
      B660: 0.00000179238515,
      B700: 0.00000650065182,
    },
    NF15: {
      B620: 9.10524421e-9,
      B660: 2.55031079e-8,
      B700: 7.14628862e-8,
    },
  } as const

  return {
    id: "frontier-bjt-nf-vbe-current-surface",
    title: "BJT emission-coefficient/VBE current surface",
    prompt:
      "Build a three-by-three forward-active NPN surface from one 5 V collector supply through equal 100 Ohm sense resistors, with every emitter at GND. Give all nine devices beta 100, Early voltage 100 V, and transport saturation current 1 fA. Use forward-emission-coefficient rows 1, 1.2, and 1.5, and shared base-voltage columns 0.62 V, 0.66 V, and 0.70 V. Preserve BASE_620, BASE_660, BASE_700, every NF1/NF12/NF15 by B620/B660/B700 collector net, VCC, and GND. Simulate the complete current surface, showing exponential current ratios for equal base-voltage steps and the reduced exponential slope as forward emission coefficient increases.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 5 } },
        ...basePoints.map(({ prefix, baseVolts }) => ({
          type: "dc-voltage-source",
          refdes: `V${prefix}`,
          props: { voltageVolts: baseVolts },
        })),
        ...emissions.flatMap(({ prefix: emissionPrefix, forwardEmissionCoefficient }) =>
          basePoints.flatMap(({ prefix: basePrefix }) => [
            {
              type: "resistor",
              refdes: `R${emissionPrefix}_${basePrefix}`,
              props: { resistanceOhms: 100 },
            },
            {
              type: "npn-transistor",
              refdes: `Q${emissionPrefix}_${basePrefix}`,
              props: bjtProps(1e-15, forwardEmissionCoefficient),
            },
          ]),
        ),
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "VCC", pin: "positive" },
            ...emissions.flatMap(({ prefix: emissionPrefix }) =>
              basePoints.map(({ prefix: basePrefix }) => ({
                refdes: `R${emissionPrefix}_${basePrefix}`,
                pin: "a",
              })),
            ),
          ],
        },
        ...basePoints.map(({ prefix: basePrefix }) => ({
          name: `BASE_${basePrefix.slice(1)}`,
          terminals: [
            { refdes: `V${basePrefix}`, pin: "positive" },
            ...emissions.map(({ prefix: emissionPrefix }) => ({
              refdes: `Q${emissionPrefix}_${basePrefix}`,
              pin: "base",
            })),
          ],
        })),
        ...emissions.flatMap(({ prefix: emissionPrefix }) =>
          basePoints.map(({ prefix: basePrefix }) => ({
            name: `${emissionPrefix}_${basePrefix}_COLLECTOR`,
            terminals: [
              { refdes: `R${emissionPrefix}_${basePrefix}`, pin: "b" },
              { refdes: `Q${emissionPrefix}_${basePrefix}`, pin: "collector" },
            ],
          })),
        ),
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            ...basePoints.map(({ prefix }) => ({
              refdes: `V${prefix}`,
              pin: "negative",
            })),
            ...emissions.flatMap(({ prefix: emissionPrefix }) =>
              basePoints.map(({ prefix: basePrefix }) => ({
                refdes: `Q${emissionPrefix}_${basePrefix}`,
                pin: "emitter",
              })),
            ),
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        "VCC",
        ...basePoints.map(({ prefix }) => `BASE_${prefix.slice(1)}`),
        ...emissions.flatMap(({ prefix: emissionPrefix }) =>
          basePoints.map(
            ({ prefix: basePrefix }) =>
              `${emissionPrefix}_${basePrefix}_COLLECTOR`,
          ),
        ),
      ],
      netVoltages: emissions.flatMap(
        ({ prefix: emissionPrefix }) =>
          basePoints.map(({ prefix: basePrefix }) => {
            const current = branchCurrents[emissionPrefix][basePrefix]
            return {
              name: `${emissionPrefix}_${basePrefix}_COLLECTOR`,
              expected: approximate(5 - current * 100, 0.001),
            }
          }),
      ),
      componentMeasurements: emissions.flatMap(
        ({ prefix: emissionPrefix }) =>
          basePoints.map(({ prefix: basePrefix }) => {
            const current = branchCurrents[emissionPrefix][basePrefix]
            return {
              refdes: `R${emissionPrefix}_${basePrefix}`,
              metric: "current",
              expected: approximate(
                current,
                Math.max(current * 0.01, 1e-10),
              ),
            }
          }),
      ),
    }),
  }
}

function zenerBreakdownCurrentOperatingMatrixCase() {
  const models = [
    { prefix: "IBV01", breakdownCurrentAmps: 0.0001 },
    { prefix: "IBV1", breakdownCurrentAmps: 0.001 },
    { prefix: "IBV10", breakdownCurrentAmps: 0.01 },
  ] as const
  const currents = [
    { prefix: "I20", currentAmps: 0.02 },
    { prefix: "I50", currentAmps: 0.05 },
    { prefix: "I100", currentAmps: 0.1 },
  ] as const
  const referenceVolts = {
    IBV01: { I20: 5.25704054, I50: 5.31074032, I100: 5.37866852 },
    IBV1: { I20: 5.19748437, I50: 5.25118415, I100: 5.31911234 },
    IBV10: { I20: 5.13792819, I50: 5.19162798, I100: 5.25955617 },
  } as const

  return {
    id: "frontier-zener-ibv-current-matrix",
    title: "Zener breakdown-reference-current operating matrix",
    prompt:
      "Build nine independently current-biased 5.1 V Zener branches with all anodes at GND. Use 10 fA saturation current, emission coefficient 1, and 1 Ohm dynamic resistance throughout. Cross modeled breakdown reference currents of 0.1 mA, 1 mA, and 10 mA with reverse operating currents of 20 mA, 50 mA, and 100 mA. Preserve every REF_IBV01/IBV1/IBV10 by I20/I50/I100 net and GND. Simulate the complete voltage surface, demonstrating equal voltage offsets between IBV decades and repeatable logarithmic-plus-ohmic changes across operating current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: models.flatMap(({ prefix: modelPrefix, breakdownCurrentAmps }) =>
        currents.flatMap(({ prefix: currentPrefix, currentAmps }) => {
          const suffix = `${modelPrefix}_${currentPrefix}`
          return [
            {
              type: "dc-current-source",
              refdes: `I${suffix}`,
              props: { currentAmps },
            },
            {
              type: "zener-diode",
              refdes: `DZ${suffix}`,
              props: zenerProps(5.1, breakdownCurrentAmps, 1e-14, 1, 1),
            },
          ]
        }),
      ),
      nets: [
        ...models.flatMap(({ prefix: modelPrefix }) =>
          currents.map(({ prefix: currentPrefix }) => {
            const suffix = `${modelPrefix}_${currentPrefix}`
            return {
              name: `REF_${suffix}`,
              terminals: [
                { refdes: `I${suffix}`, pin: "negative" },
                { refdes: `DZ${suffix}`, pin: "cathode" },
              ],
            }
          }),
        ),
        {
          name: "GND",
          terminals: models.flatMap(({ prefix: modelPrefix }) =>
            currents.flatMap(({ prefix: currentPrefix }) => {
              const suffix = `${modelPrefix}_${currentPrefix}`
              return [
                { refdes: `I${suffix}`, pin: "positive" },
                { refdes: `DZ${suffix}`, pin: "anode" },
              ]
            }),
          ),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        ...models.flatMap(({ prefix: modelPrefix }) =>
          currents.map(
            ({ prefix: currentPrefix }) => `REF_${modelPrefix}_${currentPrefix}`,
          ),
        ),
      ],
      netVoltages: models.flatMap(({ prefix: modelPrefix }) =>
        currents.map(({ prefix: currentPrefix }) => ({
          name: `REF_${modelPrefix}_${currentPrefix}`,
          expected: approximate(
            referenceVolts[modelPrefix][currentPrefix],
            0.001,
          ),
        })),
      ),
      componentMeasurements: models.flatMap(({ prefix: modelPrefix }) =>
        currents.map(({ prefix: currentPrefix, currentAmps }) => ({
          refdes: `I${modelPrefix}_${currentPrefix}`,
          metric: "current",
          expected: approximate(currentAmps, 0.000002),
        })),
      ),
    }),
  }
}

function zenerForwardSaturationEmissionCurrentMatrixCase() {
  const models = [
    { prefix: "IS14_N1", saturationCurrentAmps: 1e-14, emissionCoefficient: 1 },
    { prefix: "IS14_N2", saturationCurrentAmps: 1e-14, emissionCoefficient: 2 },
    { prefix: "IS12_N1", saturationCurrentAmps: 1e-12, emissionCoefficient: 1 },
    { prefix: "IS12_N2", saturationCurrentAmps: 1e-12, emissionCoefficient: 2 },
  ] as const
  const currents = [
    { prefix: "I01", currentAmps: 0.0001 },
    { prefix: "I1", currentAmps: 0.001 },
  ] as const
  const forwardVolts = {
    IS14_N1: { I01: 0.59556182, I1: 0.6551189 },
    IS14_N2: { I01: 1.19112355, I1: 1.31023679 },
    IS12_N1: { I01: 0.47644948, I1: 0.53600655 },
    IS12_N2: { I01: 0.95289886, I1: 1.0720121 },
  } as const

  return {
    id: "frontier-zener-forward-is-n-current-matrix",
    title: "Zener forward Is/N/current matrix",
    prompt:
      "Build eight independently current-biased Zener diodes in forward polarity with all cathodes at GND. Give every device nominal breakdown voltage 5.1 V, breakdown reference current 1 mA, and negligible 1 mOhm dynamic resistance. Cross forward saturation currents of 10 fA and 1 pA with emission coefficients 1 and 2, then exercise every model at 0.1 mA and 1 mA. Preserve every FORWARD_IS14_N1/IS14_N2/IS12_N1/IS12_N2 by I01/I1 net and GND. Simulate the complete matrix, showing the Is offset, N scaling, and current-decade increment of the Zener's forward junction.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: models.flatMap(
        ({ prefix: modelPrefix, saturationCurrentAmps, emissionCoefficient }) =>
          currents.flatMap(({ prefix: currentPrefix, currentAmps }) => {
            const suffix = `${modelPrefix}_${currentPrefix}`
            return [
              {
                type: "dc-current-source",
                refdes: `I${suffix}`,
                props: { currentAmps },
              },
              {
                type: "zener-diode",
                refdes: `DZ${suffix}`,
                props: zenerProps(
                  5.1,
                  0.001,
                  saturationCurrentAmps,
                  emissionCoefficient,
                  0.001,
                ),
              },
            ]
          }),
      ),
      nets: [
        ...models.flatMap(({ prefix: modelPrefix }) =>
          currents.map(({ prefix: currentPrefix }) => {
            const suffix = `${modelPrefix}_${currentPrefix}`
            return {
              name: `FORWARD_${suffix}`,
              terminals: [
                { refdes: `I${suffix}`, pin: "negative" },
                { refdes: `DZ${suffix}`, pin: "anode" },
              ],
            }
          }),
        ),
        {
          name: "GND",
          terminals: models.flatMap(({ prefix: modelPrefix }) =>
            currents.flatMap(({ prefix: currentPrefix }) => {
              const suffix = `${modelPrefix}_${currentPrefix}`
              return [
                { refdes: `I${suffix}`, pin: "positive" },
                { refdes: `DZ${suffix}`, pin: "cathode" },
              ]
            }),
          ),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        ...models.flatMap(({ prefix: modelPrefix }) =>
          currents.map(
            ({ prefix: currentPrefix }) => `FORWARD_${modelPrefix}_${currentPrefix}`,
          ),
        ),
      ],
      netVoltages: models.flatMap(({ prefix: modelPrefix }) =>
        currents.map(({ prefix: currentPrefix }) => ({
          name: `FORWARD_${modelPrefix}_${currentPrefix}`,
          expected: approximate(
            forwardVolts[modelPrefix][currentPrefix],
            0.001,
          ),
        })),
      ),
      componentMeasurements: models.flatMap(({ prefix: modelPrefix }) =>
        currents.map(({ prefix: currentPrefix, currentAmps }) => ({
          refdes: `I${modelPrefix}_${currentPrefix}`,
          metric: "current",
          expected: approximate(currentAmps, 0.000001),
        })),
      ),
    }),
  }
}

function zenerBidirectionalParameterOrthogonalityCase() {
  const models = [
    {
      prefix: "BASE",
      breakdownCurrentAmps: 0.001,
      saturationCurrentAmps: 1e-14,
      emissionCoefficient: 1,
      forwardVolts: 0.6551189,
      reverseVolts: 5.17750437,
    },
    {
      prefix: "HIGH_IS",
      breakdownCurrentAmps: 0.001,
      saturationCurrentAmps: 1e-12,
      emissionCoefficient: 1,
      forwardVolts: 0.53600655,
      reverseVolts: 5.17750437,
    },
    {
      prefix: "HIGH_N",
      breakdownCurrentAmps: 0.001,
      saturationCurrentAmps: 1e-14,
      emissionCoefficient: 1.5,
      forwardVolts: 0.98267784,
      reverseVolts: 5.21624655,
    },
    {
      prefix: "HIGH_IBV",
      breakdownCurrentAmps: 0.01,
      saturationCurrentAmps: 1e-14,
      emissionCoefficient: 1,
      forwardVolts: 0.6551189,
      reverseVolts: 5.11794819,
    },
  ] as const

  return {
    id: "frontier-zener-bidirectional-parameter-orthogonality",
    title: "Zener bidirectional parameter orthogonality",
    prompt:
      "Build four matched pairs of Zener branches, one forward-biased at 1 mA and one reverse-biased at 20 mA per model. Use nominal breakdown voltage 5.1 V and 1 mOhm dynamic resistance throughout. The baseline model has IBV 1 mA, Is 10 fA, and N 1; compare it with one 1 pA-Is model, one N=1.5 model, and one 10 mA-IBV model while holding the other parameters at baseline. Preserve every FORWARD_BASE/HIGH_IS/HIGH_N/HIGH_IBV and REVERSE_BASE/HIGH_IS/HIGH_N/HIGH_IBV net plus GND. Simulate all eight voltages and distinguish which model parameter moves the forward branch, the reverse branch, or both.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: models.flatMap(
        ({
          prefix,
          breakdownCurrentAmps,
          saturationCurrentAmps,
          emissionCoefficient,
        }) => [
          {
            type: "dc-current-source",
            refdes: `IF_${prefix}`,
            props: { currentAmps: 0.001 },
          },
          {
            type: "dc-current-source",
            refdes: `IR_${prefix}`,
            props: { currentAmps: 0.02 },
          },
          {
            type: "zener-diode",
            refdes: `DZF_${prefix}`,
            props: zenerProps(
              5.1,
              breakdownCurrentAmps,
              saturationCurrentAmps,
              emissionCoefficient,
              0.001,
            ),
          },
          {
            type: "zener-diode",
            refdes: `DZR_${prefix}`,
            props: zenerProps(
              5.1,
              breakdownCurrentAmps,
              saturationCurrentAmps,
              emissionCoefficient,
              0.001,
            ),
          },
        ],
      ),
      nets: [
        ...models.flatMap(({ prefix }) => [
          {
            name: `FORWARD_${prefix}`,
            terminals: [
              { refdes: `IF_${prefix}`, pin: "negative" },
              { refdes: `DZF_${prefix}`, pin: "anode" },
            ],
          },
          {
            name: `REVERSE_${prefix}`,
            terminals: [
              { refdes: `IR_${prefix}`, pin: "negative" },
              { refdes: `DZR_${prefix}`, pin: "cathode" },
            ],
          },
        ]),
        {
          name: "GND",
          terminals: models.flatMap(({ prefix }) => [
            { refdes: `IF_${prefix}`, pin: "positive" },
            { refdes: `IR_${prefix}`, pin: "positive" },
            { refdes: `DZF_${prefix}`, pin: "cathode" },
            { refdes: `DZR_${prefix}`, pin: "anode" },
          ]),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        ...models.flatMap(({ prefix }) => [
          `FORWARD_${prefix}`,
          `REVERSE_${prefix}`,
        ]),
      ],
      netVoltages: models.flatMap(({ prefix, forwardVolts, reverseVolts }) => [
        {
          name: `FORWARD_${prefix}`,
          expected: approximate(forwardVolts, 0.001),
        },
        {
          name: `REVERSE_${prefix}`,
          expected: approximate(reverseVolts, 0.001),
        },
      ]),
      componentMeasurements: models.flatMap(({ prefix }) => [
        {
          refdes: `IF_${prefix}`,
          metric: "current",
          expected: approximate(0.001, 0.000001),
        },
        {
          refdes: `IR_${prefix}`,
          metric: "current",
          expected: approximate(0.02, 0.000002),
        },
      ]),
    }),
  }
}

/**
 * Ordered model frontier. Each case adds a distinct reasoning burden while
 * staying inside the current idealized component catalog. The frontier runner
 * stops after the first failed case, so ordering is part of the benchmark.
 */
export const frontierBenchmarkCases = Schema.decodeUnknownSync(
  Schema.Array(CircuitBenchmarkCaseSchema),
)([
  {
    id: "frontier-three-tap-ladder",
    title: "Three-resistor voltage ladder",
    prompt:
      "Build a 12 V source feeding three 1 kOhm resistors in one series chain to GND. Name the node after the first resistor TAP_A and the node after the second resistor TAP_B. Simulate and report both tap voltages and the chain current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 12 } },
        { type: "resistor", refdes: "R1", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "R2", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "R3", props: { resistanceOhms: 1_000 } },
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
          name: "TAP_A",
          terminals: [
            { refdes: "R1", pin: "b" },
            { refdes: "R2", pin: "a" },
          ],
        },
        {
          name: "TAP_B",
          terminals: [
            { refdes: "R2", pin: "b" },
            { refdes: "R3", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "R3", pin: "b" },
            { refdes: "V1", pin: "negative" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "TAP_A", "TAP_B"],
      netVoltages: [
        { name: "TAP_A", expected: approximate(8, 0.02) },
        { name: "TAP_B", expected: approximate(4, 0.02) },
      ],
      componentMeasurements: [
        { refdes: "R2", metric: "current", expected: approximate(0.004, 0.00002) },
      ],
    }),
  },
  {
    id: "frontier-branched-divider",
    title: "Branched loaded divider",
    prompt:
      "Build this loaded 12 V resistor network using four 1 kOhm resistors: R1 from the source to MID, R2 from MID to GND, R3 from MID to OUT, and R4 from OUT to GND. Preserve the net names MID and OUT. Simulate and report both node voltages and the current through each branch.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 12 } },
        { type: "resistor", refdes: "R1", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "R2", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "R3", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "R4", props: { resistanceOhms: 1_000 } },
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
          name: "MID",
          terminals: [
            { refdes: "R1", pin: "b" },
            { refdes: "R2", pin: "a" },
            { refdes: "R3", pin: "a" },
          ],
        },
        {
          name: "OUT",
          terminals: [
            { refdes: "R3", pin: "b" },
            { refdes: "R4", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "R2", pin: "b" },
            { refdes: "R4", pin: "b" },
            { refdes: "V1", pin: "negative" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "MID", "OUT"],
      netVoltages: [
        { name: "MID", expected: approximate(4.8, 0.02) },
        { name: "OUT", expected: approximate(2.4, 0.02) },
      ],
      componentMeasurements: [
        { refdes: "R1", metric: "current", expected: approximate(0.0072, 0.00003) },
        { refdes: "R2", metric: "current", expected: approximate(0.0048, 0.00003) },
        { refdes: "R3", metric: "current", expected: approximate(0.0024, 0.00003) },
        { refdes: "R4", metric: "power", expected: approximate(0.00576, 0.00005) },
      ],
    }),
  },
  {
    id: "frontier-parallel-nonlinear-loads",
    title: "Parallel LED and diode loads",
    prompt:
      "Build a 9 V supply with two independent parallel branches to GND. Branch one is a 330 Ohm resistor followed by a red LED. Branch two is a 1 kOhm resistor followed by a forward-biased DDEFAULT diode. Name the LED anode node LED_A and the diode anode node DIODE_A. Simulate and compare both branch currents and junction voltages.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 9 } },
        { type: "resistor", refdes: "RLED", props: { resistanceOhms: 330 } },
        { type: "led", refdes: "LED1", props: { color: "red" } },
        { type: "resistor", refdes: "RD", props: { resistanceOhms: 1_000 } },
        { type: "diode", refdes: "D1", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
      ],
      nets: [
        {
          name: "VIN",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "RLED", pin: "a" },
            { refdes: "RD", pin: "a" },
          ],
        },
        {
          name: "LED_A",
          terminals: [
            { refdes: "RLED", pin: "b" },
            { refdes: "LED1", pin: "anode" },
          ],
        },
        {
          name: "DIODE_A",
          terminals: [
            { refdes: "RD", pin: "b" },
            { refdes: "D1", pin: "anode" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "LED1", pin: "cathode" },
            { refdes: "D1", pin: "cathode" },
            { refdes: "V1", pin: "negative" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "LED_A", "DIODE_A"],
      netVoltages: [
        { name: "LED_A", expected: approximate(1.95, 0.2) },
        { name: "DIODE_A", expected: approximate(0.71, 0.1) },
      ],
      componentMeasurements: [
        { refdes: "RLED", metric: "current", expected: approximate(0.0214, 0.002) },
        { refdes: "RD", metric: "current", expected: approximate(0.0083, 0.001) },
      ],
    }),
  },
  {
    id: "frontier-diode-or",
    title: "Dual-source diode OR",
    prompt:
      "Build a diode-OR supply selector. Use one 5 V source on HIGH and one 3.3 V source on LOW, each referenced to GND. Feed HIGH through one DDEFAULT diode and LOW through another DDEFAULT diode into a common BUS. Add a 1 kOhm load from BUS to GND. Simulate and identify which source supplies the load.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VHIGH", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VLOW", props: { voltageVolts: 3.3 } },
        { type: "diode", refdes: "DHIGH", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "diode", refdes: "DLOW", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
      ],
      nets: [
        {
          name: "HIGH",
          terminals: [
            { refdes: "VHIGH", pin: "positive" },
            { refdes: "DHIGH", pin: "anode" },
          ],
        },
        {
          name: "LOW",
          terminals: [
            { refdes: "VLOW", pin: "positive" },
            { refdes: "DLOW", pin: "anode" },
          ],
        },
        {
          name: "BUS",
          terminals: [
            { refdes: "DHIGH", pin: "cathode" },
            { refdes: "DLOW", pin: "cathode" },
            { refdes: "RLOAD", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VHIGH", pin: "negative" },
            { refdes: "VLOW", pin: "negative" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "HIGH", "LOW", "BUS"],
      netVoltages: [{ name: "BUS", expected: approximate(4.3, 0.15) }],
      componentMeasurements: [
        { refdes: "RLOAD", metric: "current", expected: approximate(0.0043, 0.0003) },
      ],
    }),
  },
  {
    id: "frontier-full-wave-bridge",
    title: "Full-wave bridge rectifier",
    prompt:
      "Build a full-wave bridge rectifier using one floating 10 V peak, 50 Hz sine source, four DDEFAULT diodes, and a 1 kOhm load. Name the rectified output VOUT and use GND as the bridge negative output. Simulate two complete input cycles and report waveform evidence showing both positive half-cycles at VOUT.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        {
          type: "sine-voltage-source",
          refdes: "V1",
          props: { amplitudeVolts: 10, frequencyHertz: 50 },
        },
        { type: "diode", refdes: "D1", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "diode", refdes: "D2", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "diode", refdes: "D3", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "diode", refdes: "D4", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
      ],
      nets: [
        {
          name: "AC_P",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "D1", pin: "anode" },
            { refdes: "D3", pin: "cathode" },
          ],
        },
        {
          name: "AC_N",
          terminals: [
            { refdes: "V1", pin: "negative" },
            { refdes: "D2", pin: "anode" },
            { refdes: "D4", pin: "cathode" },
          ],
        },
        {
          name: "VOUT",
          terminals: [
            { refdes: "D1", pin: "cathode" },
            { refdes: "D2", pin: "cathode" },
            { refdes: "RLOAD", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "D3", pin: "anode" },
            { refdes: "D4", pin: "anode" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(40, 0.05),
    },
    expected: expected({
      requiredNetNames: ["GND", "VOUT"],
      traces: [
        { signalName: "V(VOUT)", atSeconds: 0.005, expected: approximate(8.6, 0.5) },
        { signalName: "V(VOUT)", atSeconds: 0.015, expected: approximate(8.6, 0.5) },
      ],
      traceRanges: [
        {
          signalName: "V(VOUT)",
          metric: "peakToPeak",
          expected: approximate(8.6, 0.5),
        },
      ],
    }),
  },
  {
    id: "frontier-filtered-bridge-led",
    title: "Filtered bridge with indicator load",
    prompt:
      "Extend a full-wave bridge rectifier driven by a floating 10 V peak, 50 Hz sine source. Use four DDEFAULT diodes, a 470 uF smoothing capacitor and 1 kOhm load across VOUT to GND, plus a separate VOUT-to-680-Ohm-to-red-LED-to-GND indicator branch. Simulate for 100 ms and report the final VOUT, LED junction voltage, and both load currents.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        {
          type: "sine-voltage-source",
          refdes: "V1",
          props: { amplitudeVolts: 10, frequencyHertz: 50 },
        },
        { type: "diode", refdes: "D1", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "diode", refdes: "D2", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "diode", refdes: "D3", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "diode", refdes: "D4", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "capacitor", refdes: "C1", props: { capacitanceFarads: 0.00047 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RLED", props: { resistanceOhms: 680 } },
        { type: "led", refdes: "LED1", props: { color: "red" } },
      ],
      nets: [
        {
          name: "AC_P",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "D1", pin: "anode" },
            { refdes: "D3", pin: "cathode" },
          ],
        },
        {
          name: "AC_N",
          terminals: [
            { refdes: "V1", pin: "negative" },
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
            { refdes: "RLED", pin: "a" },
          ],
        },
        {
          name: "LED_A",
          terminals: [
            { refdes: "RLED", pin: "b" },
            { refdes: "LED1", pin: "anode" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "D3", pin: "anode" },
            { refdes: "D4", pin: "anode" },
            { refdes: "C1", pin: "b" },
            { refdes: "RLOAD", pin: "b" },
            { refdes: "LED1", pin: "cathode" },
          ],
        },
      ],
      analysis: analysis(100, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "VOUT"],
      netVoltages: [
        { name: "VOUT", expected: approximate(8.2, 0.8) },
        { name: "LED_A", expected: approximate(1.9, 0.25) },
      ],
      componentMeasurements: [
        { refdes: "RLOAD", metric: "current", expected: approximate(0.0082, 0.001) },
        { refdes: "RLED", metric: "current", expected: approximate(0.0093, 0.002) },
      ],
    }),
  },
  loadedLadderCase(8),
  loadedLadderCase(15),
  resistorMeshCase(),
  splitRailReferenceCase(),
  seriesRlcFilterCase(),
  currentFedLedCase(),
  dualFrequencyMixerCase(),
  biasedDualDiodeLimiterCase(),
  dualRailBridgeSupplyCase(),
  parallelResonantTankCase(),
  acCoupledLedClamperCase(),
  centerTappedRectifierCase(),
  twoFrequencySplitRailLimiterCase(),
  reactiveTwoFrequencyMixerCase(),
  asymmetricDualRailBridgeCase(),
  zenerSineLimiterCase(),
  bjtCurrentMirrorCase(),
  complementaryMosfetRegionsCase(),
  opAmpOutputLimitsCase(),
  cascadedLogicCase(),
  zenerBjtSeriesRegulatorCase(),
  cascadedNmosInvertersCase(),
  darlingtonEmitterFollowerCase(),
  biasedCommonEmitterAmplifierCase(),
  zenerOpAmpBufferedReferenceCase(),
  comparatorBjtSwitchCase(),
  bjtDifferentialPairCase(),
  opAmpWeightedSummerCase(),
  bridgeLoadRippleComparisonCase(),
  bjtCurrentMirrorComplianceCase(),
  complementaryEmitterFollowerCase(),
  opAmpDifferenceAmplifierCase(),
  cmosInverterTransientCase(),
  zenerNmosSeriesRegulatorCase(),
  bjtEmitterDegenerationComparisonCase(),
  opAmpWindowComparatorCase(),
  bufferedReferenceLoadComparisonCase(),
  clippedCommonEmitterCase(),
  bridgeZenerPostRegulatorCase(),
  opAmpSchmittTriggerCase(),
  bjtCascodeBiasCase(),
  voltageDoublerZenerRegulatorCase(),
  pnpCurrentMirrorComplianceCase(),
  nmosSourceDegenerationTransientCase(),
  comparatorDutyNmosSwitchCase(),
  envelopeLoadComparisonCase(),
  comparatorWindowLogicPulseCase(),
  zenerBjtCurrentSinkComplianceCase(),
  bjtDifferentialVsCommonModeCase(),
  dualFrequencyOpAmpIntegratorsCase(),
  dualFrequencyOpAmpDifferentiatorsCase(),
  pnpDifferentialVsCommonModeCase(),
  zenerRegulatedLedColorsCase(),
  complementaryCommonEmitterTransientsCase(),
  zenerPnpCurrentSourceComplianceCase(),
  zenerSeriesLedHeadroomCase(),
  ordinaryVsPrecisionRectifierCase(),
  zenerClampLoadSweepCase(),
  classBVsClassAbCrossoverCase(),
  dualGainTransimpedanceAmplifiersCase(),
  complementaryBjtPhaseSplittersCase(),
  singleVsStackedZenerReferencesCase(),
  instrumentationCommonModeRejectionCase(),
  bjtEmitterBypassComparisonCase(),
  stackedZenerMidpointLoadSweepCase(),
  logarithmicAmplifierCurrentDecadesCase(),
  partialEmitterBypassProgressionCase(),
  zenerRippleCapacitanceSweepCase(),
  antilogarithmicAmplifierInputStepsCase(),
  ordinaryVsWidlarCurrentSourceCase(),
  zenerDynamicResistanceSweepCase(),
  bjtEarlyEffectCollectorSweepCase(),
  zenerDynamicResistanceLoadLineSweepCase(),
  logAntilogRecoverySweepCase(),
  pnpEarlyVoltageOutputResistanceSweepCase(),
  bjtVbeVceCurrentSurfaceCase(),
  zenerBreakdownResistanceCurrentMatrixCase(),
  pmosChannelLengthModulationSweepCase(),
  nmosTransconductanceOverdriveSurfaceCase(),
  nmosTriodeSaturationSurfaceCase(),
  diodeSaturationEmissionCurrentMatrixCase(),
  diodeSeriesResistanceCurrentSweepCase(),
  diodeEmissionCurrentDecadeSurfaceCase(),
  bjtSaturationEmissionCurrentMatrixCase(),
  complementaryBjtJunctionCurrentSweepCase(),
  bjtEmissionBaseVoltageCurrentSurfaceCase(),
  zenerBreakdownCurrentOperatingMatrixCase(),
  zenerForwardSaturationEmissionCurrentMatrixCase(),
  zenerBidirectionalParameterOrthogonalityCase(),
  ...amplifierAssignmentFrontierCases,
])
