import { Schema } from "effect"
import { CircuitBenchmarkCaseSchema } from "../schema"
import { pulseVoltageSourceReleaseCase } from "./amplifier-assignment-cases"

const analysis = (durationMs = 10, timeStepMs = 0.1) => ({
  durationMs,
  timeStepMs,
})

const approximate = (value: number, absoluteTolerance: number) => ({
  value,
  absoluteTolerance,
})

const expected = ({
  requiredNetNames = ["GND"],
  statuses = ["success"],
  netVoltages = [],
  componentMeasurements = [],
  traces = [],
  traceRanges = [],
  diagnosticIncludes = [],
}: {
  readonly requiredNetNames?: ReadonlyArray<string>
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

function diodeSaturationCurrentComparisonCase() {
  const points = [
    { prefix: "IS14", saturationCurrentAmps: 1e-14, forwardVolts: 0.6551179 },
    { prefix: "IS12", saturationCurrentAmps: 1e-12, forwardVolts: 0.53600555 },
  ] as const

  return {
    id: "diode-saturation-current-forward-voltage",
    title: "Diode saturation-current forward-voltage shift",
    prompt:
      "Build two independently current-biased ordinary diodes with cathodes at GND. Inject 1 mA into each anode with an ideal current source. Give both devices emission coefficient 1 and zero series resistance, but use saturation currents of 10 fA and 1 pA. Preserve FORWARD_IS14, FORWARD_IS12, and GND, simulate, and report both forward voltages, demonstrating the logarithmic reduction in junction voltage when saturation current increases by 100x.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: points.flatMap(({ prefix, saturationCurrentAmps }) => [
        {
          type: "dc-current-source",
          refdes: `I${prefix}`,
          props: { currentAmps: 0.001 },
        },
        {
          type: "diode",
          refdes: `D${prefix}`,
          props: diodeProps(saturationCurrentAmps, 1, 0),
        },
      ]),
      nets: [
        ...points.map(({ prefix }) => ({
          name: `FORWARD_${prefix}`,
          terminals: [
            { refdes: `I${prefix}`, pin: "negative" },
            { refdes: `D${prefix}`, pin: "anode" },
          ],
        })),
        {
          name: "GND",
          terminals: points.flatMap(({ prefix }) => [
            { refdes: `I${prefix}`, pin: "positive" },
            { refdes: `D${prefix}`, pin: "cathode" },
          ]),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "FORWARD_IS14", "FORWARD_IS12"],
      netVoltages: points.map(({ prefix, forwardVolts }) => ({
        name: `FORWARD_${prefix}`,
        expected: approximate(forwardVolts, 0.001),
      })),
      componentMeasurements: points.map(({ prefix }) => ({
        refdes: `I${prefix}`,
        metric: "current",
        expected: approximate(0.001, 0.000001),
      })),
    }),
  }
}

function diodeEmissionCoefficientComparisonCase() {
  const points = [
    { prefix: "N1", emissionCoefficient: 1, forwardVolts: 0.6551179 },
    { prefix: "N15", emissionCoefficient: 1.5, forwardVolts: 0.98267684 },
    { prefix: "N2", emissionCoefficient: 2, forwardVolts: 1.31023579 },
  ] as const

  return {
    id: "diode-emission-coefficient-forward-voltage",
    title: "Diode emission-coefficient forward-voltage scaling",
    prompt:
      "Build three independently current-biased ordinary diodes with cathodes at GND and ideal 1 mA current sources feeding their anodes. Give every device 10 fA saturation current and zero series resistance, but use emission coefficients 1, 1.5, and 2. Preserve FORWARD_N1, FORWARD_N15, FORWARD_N2, and GND. Simulate and show that at equal current the junction voltage scales in proportion to emission coefficient.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: points.flatMap(({ prefix, emissionCoefficient }) => [
        {
          type: "dc-current-source",
          refdes: `I${prefix}`,
          props: { currentAmps: 0.001 },
        },
        {
          type: "diode",
          refdes: `D${prefix}`,
          props: diodeProps(1e-14, emissionCoefficient, 0),
        },
      ]),
      nets: [
        ...points.map(({ prefix }) => ({
          name: `FORWARD_${prefix}`,
          terminals: [
            { refdes: `I${prefix}`, pin: "negative" },
            { refdes: `D${prefix}`, pin: "anode" },
          ],
        })),
        {
          name: "GND",
          terminals: points.flatMap(({ prefix }) => [
            { refdes: `I${prefix}`, pin: "positive" },
            { refdes: `D${prefix}`, pin: "cathode" },
          ]),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "FORWARD_N1", "FORWARD_N15", "FORWARD_N2"],
      netVoltages: points.map(({ prefix, forwardVolts }) => ({
        name: `FORWARD_${prefix}`,
        expected: approximate(forwardVolts, 0.001),
      })),
      componentMeasurements: points.map(({ prefix }) => ({
        refdes: `I${prefix}`,
        metric: "current",
        expected: approximate(0.001, 0.000001),
      })),
    }),
  }
}

function diodeSeriesResistanceCurrentMatrixCase() {
  const resistances = [
    { prefix: "RS0", seriesResistanceOhms: 0 },
    { prefix: "RS50", seriesResistanceOhms: 50 },
  ] as const
  const currents = [
    { prefix: "I1", currentAmps: 0.001 },
    { prefix: "I10", currentAmps: 0.01 },
  ] as const
  const forwardVolts = (
    seriesResistanceOhms: number,
    currentAmps: number,
  ) =>
    (currentAmps === 0.001 ? 0.6551179 : 0.71467407) +
    seriesResistanceOhms * currentAmps

  return {
    id: "diode-series-resistance-current-matrix",
    title: "Diode series-resistance current matrix",
    prompt:
      "Build four independently current-biased ordinary diodes with grounded cathodes. Give every device 10 fA saturation current and emission coefficient 1. Use a two-by-two matrix of series resistances 0 Ohm and 50 Ohm with forward currents 1 mA and 10 mA. Preserve FORWARD_RS0_I1, FORWARD_RS0_I10, FORWARD_RS50_I1, FORWARD_RS50_I10, and GND. Simulate and report the complete voltage matrix, demonstrating the common logarithmic junction rise plus the additional current-proportional voltage from modeled series resistance.",
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
              forwardVolts(seriesResistanceOhms, currentAmps),
              0.001,
            ),
          })),
      ),
      componentMeasurements: resistances.flatMap(({ prefix: resistancePrefix }) =>
        currents.map(({ prefix: currentPrefix, currentAmps }) => ({
          refdes: `I${resistancePrefix}_${currentPrefix}`,
          metric: "current",
          expected: approximate(currentAmps, 0.000002),
        })),
      ),
    }),
  }
}

function bjtSaturationCurrentVbeShiftCase() {
  const points = [
    { prefix: "IS15", saturationCurrentAmps: 1e-15, baseVolts: 0.7144167 },
    { prefix: "IS13", saturationCurrentAmps: 1e-13, baseVolts: 0.59530436 },
  ] as const

  return {
    id: "bjt-saturation-current-vbe-shift",
    title: "BJT saturation-current base-emitter voltage shift",
    prompt:
      "Build two diode-connected beta-100 NPN transistors with each base tied to its collector, each emitter at GND, and an ideal 1 mA current source feeding each base/collector node from GND. Give both devices forward emission coefficient 1 and Early voltage 100 V, but use transport saturation currents of 1 fA and 100 fA. Preserve VBE_IS15, VBE_IS13, and GND. Simulate and report both base-emitter voltages, demonstrating the logarithmic voltage reduction when saturation current rises by 100x.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: points.flatMap(({ prefix, saturationCurrentAmps }) => [
        {
          type: "dc-current-source",
          refdes: `I${prefix}`,
          props: { currentAmps: 0.001 },
        },
        {
          type: "npn-transistor",
          refdes: `Q${prefix}`,
          props: bjtProps(saturationCurrentAmps, 1),
        },
      ]),
      nets: [
        ...points.map(({ prefix }) => ({
          name: `VBE_${prefix}`,
          terminals: [
            { refdes: `I${prefix}`, pin: "negative" },
            { refdes: `Q${prefix}`, pin: "base" },
            { refdes: `Q${prefix}`, pin: "collector" },
          ],
        })),
        {
          name: "GND",
          terminals: points.flatMap(({ prefix }) => [
            { refdes: `I${prefix}`, pin: "positive" },
            { refdes: `Q${prefix}`, pin: "emitter" },
          ]),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "VBE_IS15", "VBE_IS13"],
      netVoltages: points.map(({ prefix, baseVolts }) => ({
        name: `VBE_${prefix}`,
        expected: approximate(baseVolts, 0.001),
      })),
      componentMeasurements: points.map(({ prefix }) => ({
        refdes: `I${prefix}`,
        metric: "current",
        expected: approximate(0.001, 0.000001),
      })),
    }),
  }
}

function bjtForwardEmissionCoefficientVbeCase() {
  const points = [
    { prefix: "NF1", forwardEmissionCoefficient: 1, baseVolts: 0.7144167 },
    { prefix: "NF12", forwardEmissionCoefficient: 1.2, baseVolts: 0.85730004 },
    { prefix: "NF15", forwardEmissionCoefficient: 1.5, baseVolts: 1.07162506 },
  ] as const

  return {
    id: "bjt-forward-emission-coefficient-vbe-scaling",
    title: "BJT forward-emission-coefficient VBE scaling",
    prompt:
      "Build three diode-connected beta-100 NPN transistors with base and collector tied together, emitters at GND, and separate ideal 1 mA current sources feeding the junction nodes from GND. Give every transistor 1 fA transport saturation current and 100 V Early voltage, but use forward emission coefficients 1, 1.2, and 1.5. Preserve VBE_NF1, VBE_NF12, VBE_NF15, and GND. Simulate and report all three base-emitter voltages, demonstrating proportional voltage scaling with forward emission coefficient at matched current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: points.flatMap(
        ({ prefix, forwardEmissionCoefficient }) => [
          {
            type: "dc-current-source",
            refdes: `I${prefix}`,
            props: { currentAmps: 0.001 },
          },
          {
            type: "npn-transistor",
            refdes: `Q${prefix}`,
            props: bjtProps(1e-15, forwardEmissionCoefficient),
          },
        ],
      ),
      nets: [
        ...points.map(({ prefix }) => ({
          name: `VBE_${prefix}`,
          terminals: [
            { refdes: `I${prefix}`, pin: "negative" },
            { refdes: `Q${prefix}`, pin: "base" },
            { refdes: `Q${prefix}`, pin: "collector" },
          ],
        })),
        {
          name: "GND",
          terminals: points.flatMap(({ prefix }) => [
            { refdes: `I${prefix}`, pin: "positive" },
            { refdes: `Q${prefix}`, pin: "emitter" },
          ]),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "VBE_NF1", "VBE_NF12", "VBE_NF15"],
      netVoltages: points.map(({ prefix, baseVolts }) => ({
        name: `VBE_${prefix}`,
        expected: approximate(baseVolts, 0.001),
      })),
      componentMeasurements: points.map(({ prefix }) => ({
        refdes: `I${prefix}`,
        metric: "current",
        expected: approximate(0.001, 0.000001),
      })),
    }),
  }
}

function complementaryBjtJunctionSymmetryCase() {
  const models = [
    { prefix: "NF1", forwardEmissionCoefficient: 1, magnitudeVolts: 0.7144167 },
    { prefix: "NF14", forwardEmissionCoefficient: 1.4, magnitudeVolts: 1.00018338 },
  ] as const

  return {
    id: "complementary-bjt-junction-parameter-symmetry",
    title: "Complementary BJT junction-parameter symmetry",
    prompt:
      "Build two matched complementary diode-connected BJT pairs around GND. In every transistor tie base to collector and use beta 100, Early voltage 100 V, and transport saturation current 1 fA. Give one NPN/PNP pair forward emission coefficient 1 and the other pair 1.4. Bias every junction at 1 mA with source polarity appropriate to its transistor, preserve VBE_N_NF1, VBE_P_NF1, VBE_N_NF14, VBE_P_NF14, and GND, then simulate. Report the signed voltages and demonstrate equal NPN/PNP magnitudes plus the emission-coefficient scaling.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: models.flatMap(
        ({ prefix, forwardEmissionCoefficient }) => [
          {
            type: "dc-current-source",
            refdes: `IN_${prefix}`,
            props: { currentAmps: 0.001 },
          },
          {
            type: "dc-current-source",
            refdes: `IP_${prefix}`,
            props: { currentAmps: 0.001 },
          },
          {
            type: "npn-transistor",
            refdes: `QN_${prefix}`,
            props: bjtProps(1e-15, forwardEmissionCoefficient),
          },
          {
            type: "pnp-transistor",
            refdes: `QP_${prefix}`,
            props: bjtProps(1e-15, forwardEmissionCoefficient),
          },
        ],
      ),
      nets: [
        ...models.flatMap(({ prefix }) => [
          {
            name: `VBE_N_${prefix}`,
            terminals: [
              { refdes: `IN_${prefix}`, pin: "negative" },
              { refdes: `QN_${prefix}`, pin: "base" },
              { refdes: `QN_${prefix}`, pin: "collector" },
            ],
          },
          {
            name: `VBE_P_${prefix}`,
            terminals: [
              { refdes: `IP_${prefix}`, pin: "positive" },
              { refdes: `QP_${prefix}`, pin: "base" },
              { refdes: `QP_${prefix}`, pin: "collector" },
            ],
          },
        ]),
        {
          name: "GND",
          terminals: models.flatMap(({ prefix }) => [
            { refdes: `IN_${prefix}`, pin: "positive" },
            { refdes: `IP_${prefix}`, pin: "negative" },
            { refdes: `QN_${prefix}`, pin: "emitter" },
            { refdes: `QP_${prefix}`, pin: "emitter" },
          ]),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        ...models.flatMap(({ prefix }) => [
          `VBE_N_${prefix}`,
          `VBE_P_${prefix}`,
        ]),
      ],
      netVoltages: models.flatMap(({ prefix, magnitudeVolts }) => [
        {
          name: `VBE_N_${prefix}`,
          expected: approximate(magnitudeVolts, 0.001),
        },
        {
          name: `VBE_P_${prefix}`,
          expected: approximate(-magnitudeVolts, 0.001),
        },
      ]),
      componentMeasurements: models.flatMap(({ prefix }) => [
        {
          refdes: `IN_${prefix}`,
          metric: "current",
          expected: approximate(0.001, 0.000001),
        },
        {
          refdes: `IP_${prefix}`,
          metric: "current",
          expected: approximate(0.001, 0.000001),
        },
      ]),
    }),
  }
}

function zenerBreakdownCurrentShiftCase() {
  const points = [
    { prefix: "IBV01", breakdownCurrentAmps: 0.0001, referenceVolts: 5.25704054 },
    { prefix: "IBV1", breakdownCurrentAmps: 0.001, referenceVolts: 5.19748437 },
    { prefix: "IBV10", breakdownCurrentAmps: 0.01, referenceVolts: 5.13792819 },
  ] as const

  return {
    id: "zener-breakdown-current-reference-shift",
    title: "Zener breakdown-current reference-voltage shift",
    prompt:
      "Build three independently current-biased 5.1 V Zener branches with every anode at GND. Inject 20 mA into every cathode and use 10 fA saturation current, emission coefficient 1, and 1 Ohm dynamic resistance throughout. Set the modeled breakdown reference currents to 0.1 mA, 1 mA, and 10 mA. Preserve REF_IBV01, REF_IBV1, REF_IBV10, and GND. Simulate and report all three reverse voltages, demonstrating how IBV selects the current point associated with nominal BV and shifts the exponential breakdown curve at matched operating current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: points.flatMap(({ prefix, breakdownCurrentAmps }) => [
        {
          type: "dc-current-source",
          refdes: `I${prefix}`,
          props: { currentAmps: 0.02 },
        },
        {
          type: "zener-diode",
          refdes: `DZ${prefix}`,
          props: zenerProps(5.1, breakdownCurrentAmps, 1e-14, 1, 1),
        },
      ]),
      nets: [
        ...points.map(({ prefix }) => ({
          name: `REF_${prefix}`,
          terminals: [
            { refdes: `I${prefix}`, pin: "negative" },
            { refdes: `DZ${prefix}`, pin: "cathode" },
          ],
        })),
        {
          name: "GND",
          terminals: points.flatMap(({ prefix }) => [
            { refdes: `I${prefix}`, pin: "positive" },
            { refdes: `DZ${prefix}`, pin: "anode" },
          ]),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "REF_IBV01", "REF_IBV1", "REF_IBV10"],
      netVoltages: points.map(({ prefix, referenceVolts }) => ({
        name: `REF_${prefix}`,
        expected: approximate(referenceVolts, 0.001),
      })),
      componentMeasurements: points.map(({ prefix }) => ({
        refdes: `I${prefix}`,
        metric: "current",
        expected: approximate(0.02, 0.000002),
      })),
    }),
  }
}

function zenerForwardSaturationCurrentCase() {
  const points = [
    { prefix: "IS14", saturationCurrentAmps: 1e-14, forwardVolts: 0.6551189 },
    { prefix: "IS12", saturationCurrentAmps: 1e-12, forwardVolts: 0.53600655 },
  ] as const

  return {
    id: "zener-forward-saturation-current-voltage-shift",
    title: "Zener forward saturation-current voltage shift",
    prompt:
      "Build two independently current-biased Zener diodes in forward polarity, with every cathode at GND and 1 mA injected into every anode. Give both devices nominal breakdown voltage 5.1 V, breakdown reference current 1 mA, emission coefficient 1, and negligible 1 mOhm dynamic resistance, but use forward saturation currents of 10 fA and 1 pA. Preserve FORWARD_IS14, FORWARD_IS12, and GND. Simulate and report both forward voltages, demonstrating that the Zener component retains the ordinary junction's logarithmic forward dependence on Is.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: points.flatMap(({ prefix, saturationCurrentAmps }) => [
        {
          type: "dc-current-source",
          refdes: `I${prefix}`,
          props: { currentAmps: 0.001 },
        },
        {
          type: "zener-diode",
          refdes: `DZ${prefix}`,
          props: zenerProps(5.1, 0.001, saturationCurrentAmps, 1, 0.001),
        },
      ]),
      nets: [
        ...points.map(({ prefix }) => ({
          name: `FORWARD_${prefix}`,
          terminals: [
            { refdes: `I${prefix}`, pin: "negative" },
            { refdes: `DZ${prefix}`, pin: "anode" },
          ],
        })),
        {
          name: "GND",
          terminals: points.flatMap(({ prefix }) => [
            { refdes: `I${prefix}`, pin: "positive" },
            { refdes: `DZ${prefix}`, pin: "cathode" },
          ]),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "FORWARD_IS14", "FORWARD_IS12"],
      netVoltages: points.map(({ prefix, forwardVolts }) => ({
        name: `FORWARD_${prefix}`,
        expected: approximate(forwardVolts, 0.001),
      })),
      componentMeasurements: points.map(({ prefix }) => ({
        refdes: `I${prefix}`,
        metric: "current",
        expected: approximate(0.001, 0.000001),
      })),
    }),
  }
}

function zenerForwardEmissionCoefficientCase() {
  const points = [
    { prefix: "N1", emissionCoefficient: 1, forwardVolts: 0.6551189 },
    { prefix: "N15", emissionCoefficient: 1.5, forwardVolts: 0.98267784 },
    { prefix: "N2", emissionCoefficient: 2, forwardVolts: 1.31023679 },
  ] as const

  return {
    id: "zener-forward-emission-coefficient-voltage-scaling",
    title: "Zener forward emission-coefficient voltage scaling",
    prompt:
      "Build three independently current-biased Zener diodes in forward polarity, with every cathode at GND and 1 mA injected into every anode. Give every device nominal breakdown voltage 5.1 V, breakdown reference current 1 mA, forward saturation current 10 fA, and negligible 1 mOhm dynamic resistance. Use emission coefficients 1, 1.5, and 2. Preserve FORWARD_N1, FORWARD_N15, FORWARD_N2, and GND. Simulate and report all three forward voltages, demonstrating proportional junction-voltage scaling with N at matched current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: points.flatMap(({ prefix, emissionCoefficient }) => [
        {
          type: "dc-current-source",
          refdes: `I${prefix}`,
          props: { currentAmps: 0.001 },
        },
        {
          type: "zener-diode",
          refdes: `DZ${prefix}`,
          props: zenerProps(5.1, 0.001, 1e-14, emissionCoefficient, 0.001),
        },
      ]),
      nets: [
        ...points.map(({ prefix }) => ({
          name: `FORWARD_${prefix}`,
          terminals: [
            { refdes: `I${prefix}`, pin: "negative" },
            { refdes: `DZ${prefix}`, pin: "anode" },
          ],
        })),
        {
          name: "GND",
          terminals: points.flatMap(({ prefix }) => [
            { refdes: `I${prefix}`, pin: "positive" },
            { refdes: `DZ${prefix}`, pin: "cathode" },
          ]),
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "FORWARD_N1", "FORWARD_N15", "FORWARD_N2"],
      netVoltages: points.map(({ prefix, forwardVolts }) => ({
        name: `FORWARD_${prefix}`,
        expected: approximate(forwardVolts, 0.001),
      })),
      componentMeasurements: points.map(({ prefix }) => ({
        refdes: `I${prefix}`,
        metric: "current",
        expected: approximate(0.001, 0.000001),
      })),
    }),
  }
}

function nmosChannelLengthModulationCase() {
  const models = [
    {
      prefix: "L001",
      channelLengthModulationPerVolt: 0.01,
      lowCurrent: 0.0051974013,
      highCurrent: 0.0053973013,
      lowDrainVolts: 3.948025987,
      highDrainVolts: 7.946026987,
    },
    {
      prefix: "L005",
      channelLengthModulationPerVolt: 0.05,
      lowCurrent: 0.0059850374,
      highCurrent: 0.0069825436,
      lowDrainVolts: 3.940149626,
      highDrainVolts: 7.930174564,
    },
  ] as const
  const drainPoints = [
    { prefix: "LOW", supplyRefdes: "VLOW", supplyVolts: 4 },
    { prefix: "HIGH", supplyRefdes: "VHIGH", supplyVolts: 8 },
  ] as const

  return {
    id: "nmos-channel-length-modulation-output-resistance",
    title: "NMOS channel-length-modulation output resistance",
    prompt:
      "Build two matched pairs of N-channel MOSFET branches with 2 V thresholds, 10 mA/V^2 transconductance parameters, grounded sources, and gates held together at 3 V. Give one pair 0.01 /V channel-length modulation and the other 0.05 /V. Within each pair, feed one drain from 4 V and one from 8 V through separate 10 Ohm current-sense resistors. Preserve SHARED_GATE and all four drain nets, simulate, and report the currents and inferred output resistances, showing that larger channel-length modulation produces a larger current step and lower output resistance.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VGATE", props: { voltageVolts: 3 } },
        { type: "dc-voltage-source", refdes: "VLOW", props: { voltageVolts: 4 } },
        { type: "dc-voltage-source", refdes: "VHIGH", props: { voltageVolts: 8 } },
        ...models.flatMap(({ prefix, channelLengthModulationPerVolt }) =>
          drainPoints.flatMap(({ prefix: drainPrefix }) => [
            {
              type: "resistor",
              refdes: `R${prefix}_${drainPrefix}`,
              props: { resistanceOhms: 10 },
            },
            {
              type: "n-mosfet",
              refdes: `M${prefix}_${drainPrefix}`,
              props: mosfetProps(2, 0.01, channelLengthModulationPerVolt),
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
        ...drainPoints.map(({ prefix, supplyRefdes, supplyVolts }) => ({
          name: `${prefix}_${supplyVolts}V_SUPPLY`,
          terminals: [
            { refdes: supplyRefdes, pin: "positive" },
            ...models.map(({ prefix: modelPrefix }) => ({
              refdes: `R${modelPrefix}_${prefix}`,
              pin: "a",
            })),
          ],
        })),
        ...models.flatMap(({ prefix }) =>
          drainPoints.map(({ prefix: drainPrefix }) => ({
            name: `${prefix}_${drainPrefix}_DRAIN`,
            terminals: [
              { refdes: `R${prefix}_${drainPrefix}`, pin: "b" },
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
        "L001_LOW_DRAIN",
        "L001_HIGH_DRAIN",
        "L005_LOW_DRAIN",
        "L005_HIGH_DRAIN",
      ],
      netVoltages: models.flatMap(
        ({ prefix, lowDrainVolts, highDrainVolts }) => [
          {
            name: `${prefix}_LOW_DRAIN`,
            expected: approximate(lowDrainVolts, 0.002),
          },
          {
            name: `${prefix}_HIGH_DRAIN`,
            expected: approximate(highDrainVolts, 0.002),
          },
        ],
      ),
      componentMeasurements: models.flatMap(
        ({ prefix, lowCurrent, highCurrent }) => [
          {
            refdes: `R${prefix}_LOW`,
            metric: "current",
            expected: approximate(lowCurrent, 0.000002),
          },
          {
            refdes: `R${prefix}_HIGH`,
            metric: "current",
            expected: approximate(highCurrent, 0.000002),
          },
        ],
      ),
    }),
  }
}

function complementaryMosfetTransconductanceCase() {
  const strengths = [
    {
      prefix: "KP005",
      transconductanceAmpsPerVoltSquared: 0.005,
      current: 0.0027486257,
      drainMagnitudeVolts: 4.972513743,
    },
    {
      prefix: "KP020",
      transconductanceAmpsPerVoltSquared: 0.02,
      current: 0.0109780439,
      drainMagnitudeVolts: 4.890219561,
    },
  ] as const

  return {
    id: "complementary-mosfet-transconductance-strength",
    title: "Complementary MOSFET transconductance strength",
    prompt:
      "Build mirrored N-channel and P-channel MOSFET branches around GND. Use +5 V and -5 V drain supplies through 10 Ohm current-sense resistors, +3 V and -3 V gates, grounded sources, thresholds of +2 V and -2 V, and 0.02 /V channel-length modulation. For each polarity compare 5 mA/V^2 and 20 mA/V^2 transconductance parameters. Preserve all four drain nets and both gate nets, simulate, and show fourfold current scaling together with N/P magnitude symmetry.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -5 } },
        { type: "dc-voltage-source", refdes: "VGATE_N", props: { voltageVolts: 3 } },
        { type: "dc-voltage-source", refdes: "VGATE_P", props: { voltageVolts: -3 } },
        ...strengths.flatMap(
          ({ prefix, transconductanceAmpsPerVoltSquared }) => [
            {
              type: "resistor",
              refdes: `RN_${prefix}`,
              props: { resistanceOhms: 10 },
            },
            {
              type: "n-mosfet",
              refdes: `MN_${prefix}`,
              props: mosfetProps(
                2,
                transconductanceAmpsPerVoltSquared,
                0.02,
              ),
            },
            {
              type: "resistor",
              refdes: `RP_${prefix}`,
              props: { resistanceOhms: 10 },
            },
            {
              type: "p-mosfet",
              refdes: `MP_${prefix}`,
              props: mosfetProps(
                -2,
                transconductanceAmpsPerVoltSquared,
                0.02,
              ),
            },
          ],
        ),
      ],
      nets: [
        {
          name: "POS_SUPPLY",
          terminals: [
            { refdes: "VPOS", pin: "positive" },
            ...strengths.map(({ prefix }) => ({
              refdes: `RN_${prefix}`,
              pin: "a",
            })),
          ],
        },
        {
          name: "NEG_SUPPLY",
          terminals: [
            { refdes: "VNEG", pin: "positive" },
            ...strengths.map(({ prefix }) => ({
              refdes: `RP_${prefix}`,
              pin: "b",
            })),
          ],
        },
        {
          name: "N_GATE",
          terminals: [
            { refdes: "VGATE_N", pin: "positive" },
            ...strengths.map(({ prefix }) => ({
              refdes: `MN_${prefix}`,
              pin: "gate",
            })),
          ],
        },
        {
          name: "P_GATE",
          terminals: [
            { refdes: "VGATE_P", pin: "positive" },
            ...strengths.map(({ prefix }) => ({
              refdes: `MP_${prefix}`,
              pin: "gate",
            })),
          ],
        },
        ...strengths.flatMap(({ prefix }) => [
          {
            name: `N_${prefix}_DRAIN`,
            terminals: [
              { refdes: `RN_${prefix}`, pin: "b" },
              { refdes: `MN_${prefix}`, pin: "drain" },
            ],
          },
          {
            name: `P_${prefix}_DRAIN`,
            terminals: [
              { refdes: `RP_${prefix}`, pin: "a" },
              { refdes: `MP_${prefix}`, pin: "drain" },
            ],
          },
        ]),
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VGATE_N", pin: "negative" },
            { refdes: "VGATE_P", pin: "negative" },
            ...strengths.flatMap(({ prefix }) => [
              { refdes: `MN_${prefix}`, pin: "source" },
              { refdes: `MP_${prefix}`, pin: "source" },
            ]),
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        "N_GATE",
        "P_GATE",
        "N_KP005_DRAIN",
        "P_KP005_DRAIN",
        "N_KP020_DRAIN",
        "P_KP020_DRAIN",
      ],
      netVoltages: strengths.flatMap(
        ({ prefix, drainMagnitudeVolts }) => [
          {
            name: `N_${prefix}_DRAIN`,
            expected: approximate(drainMagnitudeVolts, 0.002),
          },
          {
            name: `P_${prefix}_DRAIN`,
            expected: approximate(-drainMagnitudeVolts, 0.002),
          },
        ],
      ),
      componentMeasurements: strengths.flatMap(({ prefix, current }) => [
        {
          refdes: `RN_${prefix}`,
          metric: "current",
          expected: approximate(current, 0.000002),
        },
        {
          refdes: `RP_${prefix}`,
          metric: "current",
          expected: approximate(current, 0.000002),
        },
      ]),
    }),
  }
}

function nmosSquareLawOverdriveCase() {
  const points = [
    { prefix: "VOV05", gateVolts: 2.5, current: 0.00125, drainVolts: 4.9875 },
    { prefix: "VOV10", gateVolts: 3, current: 0.005, drainVolts: 4.95 },
    { prefix: "VOV20", gateVolts: 4, current: 0.02, drainVolts: 4.8 },
  ] as const

  return {
    id: "nmos-square-law-overdrive-current",
    title: "NMOS square-law overdrive current",
    prompt:
      "Build three N-channel MOSFET branches from one 5 V drain supply through separate 10 Ohm current-sense resistors. Give every device a 2 V threshold, 10 mA/V^2 transconductance parameter, zero channel-length modulation, and a grounded source. Bias the gates at 2.5 V, 3 V, and 4 V so overdrive is 0.5 V, 1 V, and 2 V. Preserve all gates and drains, simulate, and show that doubling overdrive multiplies saturation current by about four while drain voltage no longer changes the current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VDD", props: { voltageVolts: 5 } },
        ...points.flatMap(({ prefix, gateVolts }) => [
          {
            type: "dc-voltage-source",
            refdes: `VG_${prefix}`,
            props: { voltageVolts: gateVolts },
          },
          {
            type: "resistor",
            refdes: `R_${prefix}`,
            props: { resistanceOhms: 10 },
          },
          {
            type: "n-mosfet",
            refdes: `M_${prefix}`,
            props: mosfetProps(2, 0.01, 0),
          },
        ]),
      ],
      nets: [
        {
          name: "VDD",
          terminals: [
            { refdes: "VDD", pin: "positive" },
            ...points.map(({ prefix }) => ({ refdes: `R_${prefix}`, pin: "a" })),
          ],
        },
        ...points.flatMap(({ prefix }) => [
          {
            name: `${prefix}_GATE`,
            terminals: [
              { refdes: `VG_${prefix}`, pin: "positive" },
              { refdes: `M_${prefix}`, pin: "gate" },
            ],
          },
          {
            name: `${prefix}_DRAIN`,
            terminals: [
              { refdes: `R_${prefix}`, pin: "b" },
              { refdes: `M_${prefix}`, pin: "drain" },
            ],
          },
        ]),
        {
          name: "GND",
          terminals: [
            { refdes: "VDD", pin: "negative" },
            ...points.flatMap(({ prefix }) => [
              { refdes: `VG_${prefix}`, pin: "negative" },
              { refdes: `M_${prefix}`, pin: "source" },
            ]),
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        ...points.flatMap(({ prefix }) => [
          `${prefix}_GATE`,
          `${prefix}_DRAIN`,
        ]),
      ],
      netVoltages: points.map(({ prefix, drainVolts }) => ({
        name: `${prefix}_DRAIN`,
        expected: approximate(drainVolts, 0.002),
      })),
      componentMeasurements: points.map(({ prefix, current }) => ({
        refdes: `R_${prefix}`,
        metric: "current",
        expected: approximate(current, 0.000002),
      })),
    }),
  }
}

function complementaryDarlingtonDiodeBiasCase(
  diodeCount: 1 | 2 | 3 | 4,
  usePowerRails = false,
) {
  const pathNets = Array.from(
    { length: diodeCount + 1 },
    (_, index) => index === 0
      ? "UPPER_BIAS"
      : index === diodeCount
        ? "LOWER_BIAS"
        : `BIAS_${index}`,
  )
  const inputNet = pathNets[Math.floor(diodeCount / 2)]!
  const bjt = {
    beta: 100,
    earlyVoltageVolts: 100,
    saturationCurrentAmps: 1e-15,
    forwardEmissionCoefficient: 1,
  }
  const outputRange = {
    1: { minimum: -4.11375, maximum: 3.45270, peakToPeak: 7.56645 },
    2: { minimum: -4.11375, maximum: 4.11375, peakToPeak: 8.22750 },
    3: { minimum: -4.77226, maximum: 4.11375, peakToPeak: 8.88601 },
    4: { minimum: -4.77224, maximum: 4.77224, peakToPeak: 9.54449 },
  }[diodeCount]
  const idSuffix = usePowerRails ? "-power-rails" : ""
  return {
    id: `complementary-darlington-${diodeCount}-diode-bias${idSuffix}`,
    title: `Complementary Darlington with ${diodeCount}-diode bias string${
      usePowerRails ? " and one-pin power rails" : ""
    }`,
    prompt:
      `Build a complementary Darlington emitter-follower output stage on +/-15 V rails with two beta-100 NPN devices above VOUT and two beta-100 PNP devices below it. ${
        usePowerRails
          ? "Create the rails with one-terminal dc-power-rail components named VCC and VEE, using +15 V and -15 V relative to their implicit GND reference."
          : "Create the split supply with ordinary two-terminal voltage sources."
      } Bias the first bases with a ${diodeCount}-diode silicon string between 5.1 kOhm rail resistors, drive the nearest center tap from a 5 V-peak 1 kHz sine source, and load VOUT with 30 Ohm to GND. Preserve every bias node, both Darlington interstage nodes, VOUT, and GND; simulate four cycles and report the output extrema and span so the effect of using ${diodeCount} rather than four bias diodes is inspectable.`,
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        ...(usePowerRails
          ? [
              { type: "dc-power-rail" as const, refdes: "VCC", props: { voltageVolts: 15 } },
              { type: "dc-power-rail" as const, refdes: "VEE", props: { voltageVolts: -15 } },
            ]
          : [
              { type: "dc-voltage-source" as const, refdes: "VPOS", props: { voltageVolts: 15 } },
              { type: "dc-voltage-source" as const, refdes: "VNEG", props: { voltageVolts: 15 } },
            ]),
        { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 5, frequencyHertz: 1_000 } },
        { type: "resistor", refdes: "R1", props: { resistanceOhms: 5_100 } },
        { type: "resistor", refdes: "R2", props: { resistanceOhms: 5_100 } },
        { type: "resistor", refdes: "RL", props: { resistanceOhms: 30 } },
        ...Array.from({ length: diodeCount }, (_, index) => ({
          type: "diode" as const,
          refdes: `D${index + 1}`,
          props: diodeProps(1e-14, 1, 0),
        })),
        { type: "npn-transistor", refdes: "QN1", props: bjt },
        { type: "npn-transistor", refdes: "QN2", props: bjt },
        { type: "pnp-transistor", refdes: "QP1", props: bjt },
        { type: "pnp-transistor", refdes: "QP2", props: bjt },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            ...(usePowerRails
              ? [{ refdes: "VCC", pin: "rail" }]
              : [{ refdes: "VPOS", pin: "positive" }]),
            { refdes: "R1", pin: "a" },
            { refdes: "QN1", pin: "collector" },
            { refdes: "QN2", pin: "collector" },
          ],
        },
        ...pathNets.map((name, index) => ({
          name,
          terminals: [
            ...(index > 0 ? [{ refdes: `D${index}`, pin: "cathode" }] : []),
            ...(index < diodeCount ? [{ refdes: `D${index + 1}`, pin: "anode" }] : []),
            ...(index === 0
              ? [{ refdes: "R1", pin: "b" }, { refdes: "QN1", pin: "base" }]
              : []),
            ...(index === diodeCount
              ? [{ refdes: "R2", pin: "a" }, { refdes: "QP1", pin: "base" }]
              : []),
            ...(name === inputNet ? [{ refdes: "VIN", pin: "positive" }] : []),
          ],
        })),
        {
          name: "VEE",
          terminals: [
            { refdes: "R2", pin: "b" },
            ...(usePowerRails
              ? [{ refdes: "VEE", pin: "rail" }]
              : [{ refdes: "VNEG", pin: "negative" }]),
            { refdes: "QP1", pin: "collector" },
            { refdes: "QP2", pin: "collector" },
          ],
        },
        {
          name: "UPPER_DRIVE",
          terminals: [
            { refdes: "QN1", pin: "emitter" },
            { refdes: "QN2", pin: "base" },
          ],
        },
        {
          name: "LOWER_DRIVE",
          terminals: [
            { refdes: "QP1", pin: "emitter" },
            { refdes: "QP2", pin: "base" },
          ],
        },
        {
          name: "VOUT",
          terminals: [
            { refdes: "QN2", pin: "emitter" },
            { refdes: "QP2", pin: "emitter" },
            { refdes: "RL", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            ...(usePowerRails
              ? []
              : [
                  { refdes: "VPOS", pin: "negative" },
                  { refdes: "VNEG", pin: "positive" },
                ]),
            { refdes: "VIN", pin: "negative" },
            { refdes: "RL", pin: "b" },
          ],
        },
      ],
      analysis: analysis(4, 0.005),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        "VCC",
        "VEE",
        ...pathNets,
        "UPPER_DRIVE",
        "LOWER_DRIVE",
        "VOUT",
      ],
      traceRanges: [
        { signalName: "V(VOUT)", metric: "minimum", startFraction: 0.5, expected: approximate(outputRange.minimum, 0.01) },
        { signalName: "V(VOUT)", metric: "maximum", startFraction: 0.5, expected: approximate(outputRange.maximum, 0.01) },
        { signalName: "V(VOUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(outputRange.peakToPeak, 0.02) },
      ],
      componentMeasurements: usePowerRails
        ? [
            { refdes: "VCC", metric: "voltage", expected: approximate(15, 0.000001) },
            { refdes: "VEE", metric: "voltage", expected: approximate(-15, 0.000001) },
          ]
        : [],
    }),
  }
}

/**
 * Behavior-complete circuit cases for the currently modeled agent catalog.
 * These are idealized electronics cases, not photovoltaic device models.
 */
export const circuitBenchmarkCases = Schema.decodeUnknownSync(
  Schema.Array(CircuitBenchmarkCaseSchema),
)([
  {
    id: "source-to-ground",
    title: "DC source to ground",
    prompt:
      "Create a 5 V DC source connected from a net named VIN to GND. Simulate it and report VIN with simulation evidence.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 5 } },
      ],
      nets: [
        { name: "VIN", terminals: [{ refdes: "V1", pin: "positive" }] },
        { name: "GND", terminals: [{ refdes: "V1", pin: "negative" }] },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "VIN"],
      netVoltages: [{ name: "VIN", expected: approximate(5, 0.01) }],
    }),
  },
  {
    id: "voltage-divider",
    title: "Equal-resistor voltage divider",
    prompt:
      "Create a 5 V source feeding two 10 kOhm resistors in series to GND. Name their midpoint VOUT. Simulate it and report VOUT with evidence.",
    smoke: true,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 5 } },
        { type: "resistor", refdes: "R1", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "R2", props: { resistanceOhms: 10_000 } },
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
            { refdes: "R2", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "R2", pin: "b" },
            { refdes: "V1", pin: "negative" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "VOUT"],
      netVoltages: [
        { name: "VIN", expected: approximate(5, 0.01) },
        { name: "VOUT", expected: approximate(2.5, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "R1", metric: "current", expected: approximate(0.00025, 2e-6) },
        { refdes: "R2", metric: "power", expected: approximate(0.000625, 1e-5) },
      ],
    }),
  },
  {
    id: "rc-filter",
    title: "RC low-pass response",
    prompt:
      "Create a low-pass filter driven by a 1 V peak, 100 Hz sine source: 1 kOhm series resistor, 1 uF capacitor to GND, and output net VOUT. Simulate long enough to show its filtered waveform.",
    smoke: true,
    graph: {
      groundNet: "GND",
      components: [
        {
          type: "sine-voltage-source",
          refdes: "V1",
          props: { amplitudeVolts: 1, frequencyHertz: 100 },
        },
        { type: "resistor", refdes: "R1", props: { resistanceOhms: 1_000 } },
        { type: "capacitor", refdes: "C1", props: { capacitanceFarads: 1e-6 } },
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
            { refdes: "C1", pin: "b" },
            { refdes: "V1", pin: "negative" },
          ],
        },
      ],
      analysis: analysis(40, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "VOUT"],
      traceRanges: [
        {
          signalName: "V(VOUT)",
          metric: "peakToPeak",
          expected: approximate(1.693, 0.08),
        },
      ],
    }),
  },
  {
    id: "rl-filter",
    title: "RL low-pass response",
    prompt:
      "Create a 1 V peak, 100 Hz sine source driving a 10 mH inductor and 10 Ohm resistor in series to GND. Name the resistor input VOUT and simulate the waveform.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        {
          type: "sine-voltage-source",
          refdes: "V1",
          props: { amplitudeVolts: 1, frequencyHertz: 100 },
        },
        { type: "inductor", refdes: "L1", props: { inductanceHenries: 0.01 } },
        { type: "resistor", refdes: "R1", props: { resistanceOhms: 10 } },
      ],
      nets: [
        {
          name: "VIN",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "L1", pin: "a" },
          ],
        },
        {
          name: "VOUT",
          terminals: [
            { refdes: "L1", pin: "b" },
            { refdes: "R1", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "R1", pin: "b" },
            { refdes: "V1", pin: "negative" },
          ],
        },
      ],
      analysis: analysis(40, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "VOUT"],
      traceRanges: [
        {
          signalName: "V(VOUT)",
          metric: "peakToPeak",
          expected: approximate(1.693, 0.1),
        },
      ],
    }),
  },
  {
    id: "sine-source",
    title: "Sine source waveform",
    prompt:
      "Create a 2 V peak, 50 Hz sine voltage source driving a 1 kOhm load to GND. Simulate two cycles and report waveform evidence.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        {
          type: "sine-voltage-source",
          refdes: "V1",
          props: { amplitudeVolts: 2, frequencyHertz: 50 },
        },
        { type: "resistor", refdes: "R1", props: { resistanceOhms: 1_000 } },
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
          name: "GND",
          terminals: [
            { refdes: "R1", pin: "b" },
            { refdes: "V1", pin: "negative" },
          ],
        },
      ],
      analysis: analysis(40, 0.1),
    },
    expected: expected({
      traces: [
        { signalName: "V(VIN)", atSeconds: 0.005, expected: approximate(2, 0.03) },
        { signalName: "V(VIN)", atSeconds: 0.015, expected: approximate(-2, 0.03) },
      ],
      traceRanges: [
        {
          signalName: "V(VIN)",
          metric: "peakToPeak",
          expected: approximate(4, 0.05),
        },
      ],
    }),
  },
  {
    id: "current-source-load",
    title: "Current-source load",
    prompt:
      "Create a 100 mA DC current source that raises a net named LOAD through a 100 Ohm resistor to GND. Simulate and report LOAD voltage and resistor power.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-current-source", refdes: "I1", props: { currentAmps: 0.1 } },
        { type: "resistor", refdes: "R1", props: { resistanceOhms: 100 } },
      ],
      nets: [
        {
          name: "GND",
          terminals: [
            { refdes: "I1", pin: "positive" },
            { refdes: "R1", pin: "b" },
          ],
        },
        {
          name: "LOAD",
          terminals: [
            { refdes: "I1", pin: "negative" },
            { refdes: "R1", pin: "a" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "LOAD"],
      netVoltages: [{ name: "LOAD", expected: approximate(10, 0.05) }],
      componentMeasurements: [
        { refdes: "R1", metric: "current", expected: approximate(0.1, 0.001) },
        { refdes: "R1", metric: "power", expected: approximate(1, 0.01) },
      ],
    }),
  },
  {
    id: "forward-diode",
    title: "Forward-biased diode",
    prompt:
      "Create a 12 V source feeding a DDEFAULT diode and then a 100 Ohm load to GND. Simulate it and report the load voltage and current.",
    smoke: true,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 12 } },
        { type: "diode", refdes: "D1", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "resistor", refdes: "R1", props: { resistanceOhms: 100 } },
      ],
      nets: [
        {
          name: "SOURCE",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "D1", pin: "anode" },
          ],
        },
        {
          name: "LOAD",
          terminals: [
            { refdes: "D1", pin: "cathode" },
            { refdes: "R1", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "R1", pin: "b" },
            { refdes: "V1", pin: "negative" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      netVoltages: [{ name: "LOAD", expected: approximate(11.25, 0.25) }],
      componentMeasurements: [
        { refdes: "R1", metric: "current", expected: approximate(0.1125, 0.01) },
      ],
    }),
  },
  {
    id: "reverse-diode",
    title: "Reverse-biased diode",
    prompt:
      "Create a 5 V source with a reverse-biased DDEFAULT diode before a 100 Ohm load to GND. Simulate and confirm the load is isolated.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 5 } },
        { type: "diode", refdes: "D1", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "resistor", refdes: "R1", props: { resistanceOhms: 100 } },
      ],
      nets: [
        {
          name: "SOURCE",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "D1", pin: "cathode" },
          ],
        },
        {
          name: "LOAD",
          terminals: [
            { refdes: "D1", pin: "anode" },
            { refdes: "R1", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "R1", pin: "b" },
            { refdes: "V1", pin: "negative" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      netVoltages: [{ name: "LOAD", expected: approximate(0, 1e-6) }],
      componentMeasurements: [
        { refdes: "R1", metric: "current", expected: approximate(0, 1e-9) },
      ],
    }),
  },
  {
    id: "led-limiter",
    title: "LED current limiter",
    prompt:
      "Create a 5 V source driving a red LED through a 330 Ohm current-limiting resistor to GND. Simulate it and report LED voltage and current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 5 } },
        { type: "resistor", refdes: "R1", props: { resistanceOhms: 330 } },
        { type: "led", refdes: "LED1", props: { color: "red" } },
      ],
      nets: [
        {
          name: "SOURCE",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "R1", pin: "a" },
          ],
        },
        {
          name: "LED_ANODE",
          terminals: [
            { refdes: "R1", pin: "b" },
            { refdes: "LED1", pin: "anode" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "LED1", pin: "cathode" },
            { refdes: "V1", pin: "negative" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      netVoltages: [
        { name: "LED_ANODE", expected: approximate(1.9, 0.2) },
      ],
      componentMeasurements: [
        { refdes: "R1", metric: "current", expected: approximate(0.0094, 0.001) },
      ],
    }),
  },
  {
    id: "zener-shunt-regulator",
    title: "Zener shunt regulator",
    prompt:
      "Create a 12 V supply feeding VREG through a 680 Ohm series resistor. Regulate VREG with a 5.1 V Zener diode whose cathode is at VREG and anode is at GND, and add a 2.2 kOhm load from VREG to GND. Simulate and report the regulated voltage and both resistor currents.",
    smoke: true,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 12 } },
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
          name: "VIN",
          terminals: [
            { refdes: "V1", pin: "positive" },
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
            { refdes: "V1", pin: "negative" },
            { refdes: "DZ1", pin: "anode" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "VREG"],
      netVoltages: [{ name: "VREG", expected: approximate(5.15, 0.25) }],
      componentMeasurements: [
        { refdes: "RS", metric: "current", expected: approximate(0.0101, 0.001) },
        {
          refdes: "RLOAD",
          metric: "current",
          expected: approximate(0.00234, 0.0002),
        },
      ],
    }),
  },
  {
    id: "npn-current-gain",
    title: "NPN common-emitter current gain",
    prompt:
      "Create an NPN common-emitter stage with beta 100. Use a 10 V collector supply through a 1 kOhm collector resistor, ground the emitter, and drive the base from a separate 1.2 V source through 100 kOhm. Preserve BASE and COLLECTOR, simulate, and report base-path and collector-path currents with evidence.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 10 } },
        { type: "dc-voltage-source", refdes: "VBIAS", props: { voltageVolts: 1.2 } },
        { type: "resistor", refdes: "RC", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RB", props: { resistanceOhms: 100_000 } },
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
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "VBIAS", pin: "negative" },
            { refdes: "Q1", pin: "emitter" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "BASE", "COLLECTOR"],
      netVoltages: [
        { name: "BASE", expected: approximate(0.67, 0.08) },
        { name: "COLLECTOR", expected: approximate(9.47, 0.2) },
      ],
      componentMeasurements: [
        { refdes: "RB", metric: "current", expected: approximate(5.3e-6, 1e-6) },
        { refdes: "RC", metric: "current", expected: approximate(0.00053, 0.0001) },
      ],
    }),
  },
  {
    id: "npn-emitter-follower",
    title: "NPN emitter follower",
    prompt:
      "Create a beta-100 NPN emitter follower from a 9 V supply. Tie the collector to VCC, bias BASE with 47 kOhm from VCC and 15 kOhm to GND, and connect a 1 kOhm emitter resistor from EMITTER to GND. Simulate and report BASE and EMITTER to demonstrate the base-emitter offset.",
    smoke: false,
    graph: {
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
      analysis: analysis(),
    },
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
  },
  {
    id: "pnp-high-side-switch",
    title: "PNP high-side switch",
    prompt:
      "Create a beta-100 PNP high-side switch from a 5 V supply. Tie the emitter to VCC, pull BASE to GND through 22 kOhm, connect the collector to OUT, and load OUT with 330 Ohm to GND. Simulate and report OUT and the load current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 5 } },
        { type: "resistor", refdes: "RB", props: { resistanceOhms: 22_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 330 } },
        { type: "pnp-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "Q1", pin: "emitter" },
          ],
        },
        {
          name: "BASE",
          terminals: [
            { refdes: "Q1", pin: "base" },
            { refdes: "RB", pin: "a" },
          ],
        },
        {
          name: "OUT",
          terminals: [
            { refdes: "Q1", pin: "collector" },
            { refdes: "RLOAD", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "V1", pin: "negative" },
            { refdes: "RB", pin: "b" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "BASE", "OUT"],
      netVoltages: [
        { name: "OUT", expected: approximate(4.85, 0.2) },
      ],
      componentMeasurements: [
        { refdes: "RLOAD", metric: "current", expected: approximate(0.0147, 0.001) },
      ],
    }),
  },
  {
    id: "nmos-low-side-regions",
    title: "N-channel MOSFET on and cutoff regions",
    prompt:
      "Create two 2 V-threshold N-channel MOSFET low-side branches from one 5 V VDD supply. Feed each drain from VDD through a 330 Ohm resistor. Drive M_ON gate from a separate 5 V source and ground its source. Tie both gate and source of M_OFF to GND. Preserve ON_DRAIN and OFF_DRAIN, simulate, and compare their voltages and branch currents.",
    smoke: true,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VDD", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VG", props: { voltageVolts: 5 } },
        { type: "resistor", refdes: "RON", props: { resistanceOhms: 330 } },
        { type: "resistor", refdes: "ROFF", props: { resistanceOhms: 330 } },
        { type: "n-mosfet", refdes: "M_ON", props: { thresholdVolts: 2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
        { type: "n-mosfet", refdes: "M_OFF", props: { thresholdVolts: 2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
      ],
      nets: [
        {
          name: "VDD",
          terminals: [
            { refdes: "VDD", pin: "positive" },
            { refdes: "RON", pin: "a" },
            { refdes: "ROFF", pin: "a" },
          ],
        },
        {
          name: "GATE_HIGH",
          terminals: [
            { refdes: "VG", pin: "positive" },
            { refdes: "M_ON", pin: "gate" },
          ],
        },
        {
          name: "ON_DRAIN",
          terminals: [
            { refdes: "RON", pin: "b" },
            { refdes: "M_ON", pin: "drain" },
          ],
        },
        {
          name: "OFF_DRAIN",
          terminals: [
            { refdes: "ROFF", pin: "b" },
            { refdes: "M_OFF", pin: "drain" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VDD", pin: "negative" },
            { refdes: "VG", pin: "negative" },
            { refdes: "M_ON", pin: "source" },
            { refdes: "M_OFF", pin: "gate" },
            { refdes: "M_OFF", pin: "source" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "ON_DRAIN", "OFF_DRAIN"],
      netVoltages: [
        { name: "ON_DRAIN", expected: approximate(0.1, 0.08) },
        { name: "OFF_DRAIN", expected: approximate(5, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RON", metric: "current", expected: approximate(0.01485, 0.001) },
        { refdes: "ROFF", metric: "current", expected: approximate(0, 1e-8) },
      ],
    }),
  },
  {
    id: "pmos-high-side-regions",
    title: "P-channel MOSFET on and cutoff regions",
    prompt:
      "Create two -2 V-threshold P-channel MOSFET high-side branches from one 5 V VDD supply. Tie both sources to VDD and load each drain with 330 Ohm to GND. Ground M_ON gate, but tie M_OFF gate to VDD. Preserve ON_OUT and OFF_OUT, simulate, and compare their voltages and load currents.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VDD", props: { voltageVolts: 5 } },
        { type: "resistor", refdes: "RON", props: { resistanceOhms: 330 } },
        { type: "resistor", refdes: "ROFF", props: { resistanceOhms: 330 } },
        { type: "p-mosfet", refdes: "M_ON", props: { thresholdVolts: -2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
        { type: "p-mosfet", refdes: "M_OFF", props: { thresholdVolts: -2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
      ],
      nets: [
        {
          name: "VDD",
          terminals: [
            { refdes: "VDD", pin: "positive" },
            { refdes: "M_ON", pin: "source" },
            { refdes: "M_OFF", pin: "source" },
            { refdes: "M_OFF", pin: "gate" },
          ],
        },
        {
          name: "ON_OUT",
          terminals: [
            { refdes: "M_ON", pin: "drain" },
            { refdes: "RON", pin: "a" },
          ],
        },
        {
          name: "OFF_OUT",
          terminals: [
            { refdes: "M_OFF", pin: "drain" },
            { refdes: "ROFF", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VDD", pin: "negative" },
            { refdes: "M_ON", pin: "gate" },
            { refdes: "RON", pin: "b" },
            { refdes: "ROFF", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "ON_OUT", "OFF_OUT"],
      netVoltages: [
        { name: "ON_OUT", expected: approximate(4.9, 0.08) },
        { name: "OFF_OUT", expected: approximate(0, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RON", metric: "current", expected: approximate(0.01485, 0.001) },
        { refdes: "ROFF", metric: "current", expected: approximate(0, 1e-8) },
      ],
    }),
  },
  {
    id: "op-amp-voltage-follower",
    title: "Rail-limited ideal op amp follower",
    prompt:
      "Create an ideal op amp voltage follower with gain 100000 and output limits -10 V to +10 V. Power it from VPLUS at +12 V and VMINUS at -12 V, drive its non-inverting input from a 2 V source, tie its output to its inverting input at OUT, and add a 10 kOhm load from OUT to GND. Simulate and report INPUT, OUT, and load current.",
    smoke: true,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "dc-voltage-source", refdes: "VIN", props: { voltageVolts: 2 } },
        {
          type: "ideal-op-amp-minus-top",
          refdes: "U1",
          props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 },
        },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 10_000 } },
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
            { refdes: "U1", pin: "nonInverting" },
          ],
        },
        {
          name: "OUT",
          terminals: [
            { refdes: "U1", pin: "output" },
            { refdes: "U1", pin: "inverting" },
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
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "OUT"],
      netVoltages: [
        { name: "INPUT", expected: approximate(2, 0.01) },
        { name: "OUT", expected: approximate(2, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RLOAD", metric: "current", expected: approximate(0.0002, 2e-6) },
      ],
    }),
  },
  {
    id: "op-amp-inverting-amplifier",
    title: "Ideal op amp inverting amplifier",
    prompt:
      "Create an ideal inverting amplifier with gain 100000 and output limits -10 V to +10 V, powered from +12 V and -12 V rails. Drive VIN at 1 V through RIN 10 kOhm into SUM, connect RF 40 kOhm from SUM to OUT, ground the non-inverting input, and add RLOAD 10 kOhm from OUT to GND. Simulate and report SUM, OUT, and the input-path current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "dc-voltage-source", refdes: "VIN", props: { voltageVolts: 1 } },
        {
          type: "ideal-op-amp-minus-top",
          refdes: "U1",
          props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 },
        },
        { type: "resistor", refdes: "RIN", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RF", props: { resistanceOhms: 40_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 10_000 } },
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
            { refdes: "VIN", pin: "positive" },
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
          name: "OUT",
          terminals: [
            { refdes: "RF", pin: "b" },
            { refdes: "U1", pin: "output" },
            { refdes: "RLOAD", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VIN", pin: "negative" },
            { refdes: "U1", pin: "nonInverting" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "SUM", "OUT"],
      netVoltages: [
        { name: "SUM", expected: approximate(0, 0.001) },
        { name: "OUT", expected: approximate(-4, 0.02) },
      ],
      componentMeasurements: [
        { refdes: "RIN", metric: "current", expected: approximate(0.0001, 2e-6) },
      ],
    }),
  },
  {
    id: "logic-gate-truth-regions",
    title: "Ideal logic gate truth regions",
    prompt:
      "Create explicit 5 V HIGH and 0 V LOW logic inputs, then exercise both regions of two-input AND and OR gates plus both inverter regions. Produce AND_HIGH from HIGH/HIGH, AND_LOW from HIGH/LOW, OR_HIGH from HIGH/LOW, OR_LOW from LOW/LOW, INV_HIGH from LOW, and INV_LOW from HIGH. Use 5 V gate levels, connect every logic reference pin to GND, and attach a logic output drawing 100 uA with a 2.5 V threshold to every result net. Simulate and report all six result voltages and output-load currents.",
    smoke: true,
    graph: {
      groundNet: "GND",
      components: [
        {
          type: "logic-input",
          refdes: "IN_HIGH",
          props: {
            position: 1,
            highLogicVoltageVolts: 5,
            lowLogicVoltageVolts: 0,
            ternary: false,
            momentary: false,
          },
        },
        {
          type: "logic-input",
          refdes: "IN_LOW",
          props: {
            position: 0,
            highLogicVoltageVolts: 5,
            lowLogicVoltageVolts: 0,
            ternary: false,
            momentary: false,
          },
        },
        { type: "and-gate", refdes: "U_AND_HIGH", props: { inputCount: 2, highLogicVoltageVolts: 5 } },
        { type: "and-gate", refdes: "U_AND_LOW", props: { inputCount: 2, highLogicVoltageVolts: 5 } },
        { type: "or-gate", refdes: "U_OR_HIGH", props: { inputCount: 2, highLogicVoltageVolts: 5 } },
        { type: "or-gate", refdes: "U_OR_LOW", props: { inputCount: 2, highLogicVoltageVolts: 5 } },
        { type: "inverter", refdes: "U_INV_HIGH", props: { highLogicVoltageVolts: 5 } },
        { type: "inverter", refdes: "U_INV_LOW", props: { highLogicVoltageVolts: 5 } },
        ...["AND_HIGH", "AND_LOW", "OR_HIGH", "OR_LOW", "INV_HIGH", "INV_LOW"].map(
          (name) => ({
            type: "logic-output" as const,
            refdes: `OUT_${name}`,
            props: { thresholdVolts: 2.5, currentRequiredAmps: 0.0001 },
          }),
        ),
      ],
      nets: [
        {
          name: "HIGH",
          terminals: [
            { refdes: "IN_HIGH", pin: "output" },
            { refdes: "U_AND_HIGH", pin: "a" },
            { refdes: "U_AND_HIGH", pin: "b" },
            { refdes: "U_AND_LOW", pin: "a" },
            { refdes: "U_OR_HIGH", pin: "a" },
            { refdes: "U_INV_LOW", pin: "input" },
          ],
        },
        {
          name: "LOW",
          terminals: [
            { refdes: "IN_LOW", pin: "output" },
            { refdes: "U_AND_LOW", pin: "b" },
            { refdes: "U_OR_HIGH", pin: "b" },
            { refdes: "U_OR_LOW", pin: "a" },
            { refdes: "U_OR_LOW", pin: "b" },
            { refdes: "U_INV_HIGH", pin: "input" },
          ],
        },
        ...["AND_HIGH", "AND_LOW", "OR_HIGH", "OR_LOW", "INV_HIGH", "INV_LOW"].map(
          (name) => ({
            name,
            terminals: [
              {
                refdes: `U_${name}`,
                pin: "output",
              },
              { refdes: `OUT_${name}`, pin: "input" },
            ],
          }),
        ),
        {
          name: "GND",
          terminals: [
            { refdes: "IN_HIGH", pin: "reference" },
            { refdes: "IN_LOW", pin: "reference" },
            ...["AND_HIGH", "AND_LOW", "OR_HIGH", "OR_LOW", "INV_HIGH", "INV_LOW"].flatMap(
              (name) => [
                { refdes: `U_${name}`, pin: "reference" },
                { refdes: `OUT_${name}`, pin: "reference" },
              ],
            ),
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        "HIGH",
        "LOW",
        "AND_HIGH",
        "AND_LOW",
        "OR_HIGH",
        "OR_LOW",
        "INV_HIGH",
        "INV_LOW",
      ],
      netVoltages: [
        { name: "HIGH", expected: approximate(5, 0.001) },
        { name: "LOW", expected: approximate(0, 0.001) },
        { name: "AND_HIGH", expected: approximate(5, 0.001) },
        { name: "AND_LOW", expected: approximate(0, 0.001) },
        { name: "OR_HIGH", expected: approximate(5, 0.001) },
        { name: "OR_LOW", expected: approximate(0, 0.001) },
        { name: "INV_HIGH", expected: approximate(5, 0.001) },
        { name: "INV_LOW", expected: approximate(0, 0.001) },
      ],
      componentMeasurements: [
        ...["AND_HIGH", "AND_LOW", "OR_HIGH", "OR_LOW", "INV_HIGH", "INV_LOW"].map(
          (name) => ({
            refdes: `OUT_${name}`,
            metric: "current" as const,
            expected: approximate(0.0001, 1e-7),
          }),
        ),
      ],
    }),
  },
  {
    id: "switch-topology",
    title: "Open and closed switch topology",
    prompt:
      "Create one 5 V source and two 100 Ohm loads to GND. Feed R1 directly from PV through a closed switch whose terminals share PV. Put an open switch between PV and R2 on a separate LOAD net. Simulate and compare both load currents.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 5 } },
        { type: "switch", refdes: "SCLOSED", props: { state: "closed" } },
        { type: "switch", refdes: "SOPEN", props: { state: "open" } },
        { type: "resistor", refdes: "R1", props: { resistanceOhms: 100 } },
        { type: "resistor", refdes: "R2", props: { resistanceOhms: 100 } },
      ],
      nets: [
        {
          name: "PV",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "SCLOSED", pin: "a" },
            { refdes: "SCLOSED", pin: "b" },
            { refdes: "SOPEN", pin: "a" },
            { refdes: "R1", pin: "a" },
          ],
        },
        {
          name: "LOAD",
          terminals: [
            { refdes: "SOPEN", pin: "b" },
            { refdes: "R2", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "V1", pin: "negative" },
            { refdes: "R1", pin: "b" },
            { refdes: "R2", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "PV", "LOAD"],
      netVoltages: [
        { name: "PV", expected: approximate(5, 0.01) },
        { name: "LOAD", expected: approximate(0, 1e-6) },
      ],
      componentMeasurements: [
        { refdes: "R1", metric: "current", expected: approximate(0.05, 0.001) },
        { refdes: "R2", metric: "current", expected: approximate(0, 1e-9) },
      ],
    }),
  },
  {
    id: "zener-regulation-dropout",
    title: "Zener regulation and load dropout",
    prompt:
      "Create two 5.1 V Zener shunt branches from one 12 V supply. Give each branch a 680 Ohm series resistor and orient each Zener cathode toward its output. Load REGULATED with 2.2 kOhm and OVERLOADED with 330 Ohm, both to GND. Simulate and compare both output voltages and both series currents to show when the Zener branch drops out of regulation.",
    smoke: true,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 12 } },
        { type: "resistor", refdes: "RS_OK", props: { resistanceOhms: 680 } },
        { type: "resistor", refdes: "RS_DROP", props: { resistanceOhms: 680 } },
        { type: "zener-diode", refdes: "DZ_OK", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "zener-diode", refdes: "DZ_DROP", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "resistor", refdes: "RL_OK", props: { resistanceOhms: 2_200 } },
        { type: "resistor", refdes: "RL_DROP", props: { resistanceOhms: 330 } },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "RS_OK", pin: "a" },
            { refdes: "RS_DROP", pin: "a" },
          ],
        },
        {
          name: "REGULATED",
          terminals: [
            { refdes: "RS_OK", pin: "b" },
            { refdes: "DZ_OK", pin: "cathode" },
            { refdes: "RL_OK", pin: "a" },
          ],
        },
        {
          name: "OVERLOADED",
          terminals: [
            { refdes: "RS_DROP", pin: "b" },
            { refdes: "DZ_DROP", pin: "cathode" },
            { refdes: "RL_DROP", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "V1", pin: "negative" },
            { refdes: "DZ_OK", pin: "anode" },
            { refdes: "DZ_DROP", pin: "anode" },
            { refdes: "RL_OK", pin: "b" },
            { refdes: "RL_DROP", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "REGULATED", "OVERLOADED"],
      netVoltages: [
        { name: "REGULATED", expected: approximate(5.22822, 0.03) },
        { name: "OVERLOADED", expected: approximate(3.921, 0.02) },
      ],
      componentMeasurements: [
        { refdes: "RS_OK", metric: "current", expected: approximate(0.0099585, 0.00008) },
        { refdes: "RS_DROP", metric: "current", expected: approximate(0.01188, 0.00008) },
      ],
    }),
  },
  {
    id: "npn-operating-regions",
    title: "NPN cutoff, forward-active, and saturation regions",
    prompt:
      "Create three beta-100 NPN common-emitter branches from one 5 V collector supply, each with a 1 kOhm collector resistor. Ground every emitter. Ground Q_OFF base, drive Q_ACTIVE base from 1.2 V through 100 kOhm, and drive Q_SAT base from 5 V through 1 kOhm. Preserve OFF_COLLECTOR, ACTIVE_COLLECTOR, and SAT_COLLECTOR, simulate, and compare collector voltages and currents across cutoff, forward-active, and saturation.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VACTIVE", props: { voltageVolts: 1.2 } },
        { type: "dc-voltage-source", refdes: "VSAT", props: { voltageVolts: 5 } },
        { type: "resistor", refdes: "RC_OFF", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RC_ACTIVE", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RC_SAT", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RB_ACTIVE", props: { resistanceOhms: 100_000 } },
        { type: "resistor", refdes: "RB_SAT", props: { resistanceOhms: 1_000 } },
        { type: "npn-transistor", refdes: "Q_OFF", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "Q_ACTIVE", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "Q_SAT", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "VCC", pin: "positive" },
            { refdes: "RC_OFF", pin: "a" },
            { refdes: "RC_ACTIVE", pin: "a" },
            { refdes: "RC_SAT", pin: "a" },
          ],
        },
        {
          name: "ACTIVE_DRIVE",
          terminals: [
            { refdes: "VACTIVE", pin: "positive" },
            { refdes: "RB_ACTIVE", pin: "a" },
          ],
        },
        {
          name: "SAT_DRIVE",
          terminals: [
            { refdes: "VSAT", pin: "positive" },
            { refdes: "RB_SAT", pin: "a" },
          ],
        },
        {
          name: "ACTIVE_BASE",
          terminals: [
            { refdes: "RB_ACTIVE", pin: "b" },
            { refdes: "Q_ACTIVE", pin: "base" },
          ],
        },
        {
          name: "SAT_BASE",
          terminals: [
            { refdes: "RB_SAT", pin: "b" },
            { refdes: "Q_SAT", pin: "base" },
          ],
        },
        {
          name: "OFF_COLLECTOR",
          terminals: [
            { refdes: "RC_OFF", pin: "b" },
            { refdes: "Q_OFF", pin: "collector" },
          ],
        },
        {
          name: "ACTIVE_COLLECTOR",
          terminals: [
            { refdes: "RC_ACTIVE", pin: "b" },
            { refdes: "Q_ACTIVE", pin: "collector" },
          ],
        },
        {
          name: "SAT_COLLECTOR",
          terminals: [
            { refdes: "RC_SAT", pin: "b" },
            { refdes: "Q_SAT", pin: "collector" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "VACTIVE", pin: "negative" },
            { refdes: "VSAT", pin: "negative" },
            { refdes: "Q_OFF", pin: "base" },
            { refdes: "Q_OFF", pin: "emitter" },
            { refdes: "Q_ACTIVE", pin: "emitter" },
            { refdes: "Q_SAT", pin: "emitter" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "OFF_COLLECTOR", "ACTIVE_COLLECTOR", "SAT_COLLECTOR"],
      netVoltages: [
        { name: "OFF_COLLECTOR", expected: approximate(5, 0.01) },
        { name: "ACTIVE_COLLECTOR", expected: approximate(4.478, 0.03) },
        { name: "SAT_COLLECTOR", expected: approximate(0.0303, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RC_OFF", metric: "current", expected: approximate(0, 1e-8) },
        { refdes: "RC_ACTIVE", metric: "current", expected: approximate(0.000522, 0.00003) },
        { refdes: "RC_SAT", metric: "current", expected: approximate(0.00497, 0.00005) },
      ],
    }),
  },
  {
    id: "op-amp-non-inverting-amplifier",
    title: "Ideal op amp non-inverting gain",
    prompt:
      "Create an ideal non-inverting amplifier powered from +5 V and -5 V rails with output limits of -4 V and +4 V. Drive the non-inverting input with 1 V, use 10 kOhm from the inverting input to GND and 20 kOhm feedback from output to the inverting input, and load VOUT with 10 kOhm to GND. Preserve FEEDBACK and VOUT, simulate, and report the gain and feedback-node voltage.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -5 } },
        { type: "dc-voltage-source", refdes: "VIN", props: { voltageVolts: 1 } },
        { type: "resistor", refdes: "RG", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RF", props: { resistanceOhms: 20_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 10_000 } },
        {
          type: "ideal-op-amp-minus-top",
          refdes: "U1",
          props: { gain: 100_000, minOutputVolts: -4, maxOutputVolts: 4 },
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
            { refdes: "VIN", pin: "negative" },
            { refdes: "RG", pin: "b" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "FEEDBACK", "VOUT"],
      netVoltages: [
        { name: "FEEDBACK", expected: approximate(0.99997, 0.0002) },
        { name: "VOUT", expected: approximate(2.99991, 0.0003) },
      ],
      componentMeasurements: [
        { refdes: "RLOAD", metric: "current", expected: approximate(0.00029999, 2e-7) },
      ],
    }),
  },
  {
    id: "pnp-operating-regions",
    title: "PNP cutoff, forward-active, and saturation regions",
    prompt:
      "Create three beta-100 PNP high-side branches from one 5 V emitter supply, each with a 1 kOhm collector load to GND. Tie Q_OFF base to VCC, pull Q_ACTIVE base toward ground through 10 MOhm, and pull Q_SAT base toward ground through 1 kOhm. Preserve OFF_COLLECTOR, ACTIVE_COLLECTOR, and SAT_COLLECTOR, simulate, and compare collector voltages and currents across cutoff, forward-active, and saturation.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 5 } },
        { type: "resistor", refdes: "RC_OFF", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RC_ACTIVE", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RC_SAT", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RB_ACTIVE", props: { resistanceOhms: 10_000_000 } },
        { type: "resistor", refdes: "RB_SAT", props: { resistanceOhms: 1_000 } },
        { type: "pnp-transistor", refdes: "Q_OFF", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "Q_ACTIVE", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "Q_SAT", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "VCC", pin: "positive" },
            { refdes: "Q_OFF", pin: "emitter" },
            { refdes: "Q_OFF", pin: "base" },
            { refdes: "Q_ACTIVE", pin: "emitter" },
            { refdes: "Q_SAT", pin: "emitter" },
          ],
        },
        {
          name: "ACTIVE_BASE",
          terminals: [
            { refdes: "RB_ACTIVE", pin: "a" },
            { refdes: "Q_ACTIVE", pin: "base" },
          ],
        },
        {
          name: "SAT_BASE",
          terminals: [
            { refdes: "RB_SAT", pin: "a" },
            { refdes: "Q_SAT", pin: "base" },
          ],
        },
        {
          name: "OFF_COLLECTOR",
          terminals: [
            { refdes: "Q_OFF", pin: "collector" },
            { refdes: "RC_OFF", pin: "a" },
          ],
        },
        {
          name: "ACTIVE_COLLECTOR",
          terminals: [
            { refdes: "Q_ACTIVE", pin: "collector" },
            { refdes: "RC_ACTIVE", pin: "a" },
          ],
        },
        {
          name: "SAT_COLLECTOR",
          terminals: [
            { refdes: "Q_SAT", pin: "collector" },
            { refdes: "RC_SAT", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "RC_OFF", pin: "b" },
            { refdes: "RC_ACTIVE", pin: "b" },
            { refdes: "RC_SAT", pin: "b" },
            { refdes: "RB_ACTIVE", pin: "b" },
            { refdes: "RB_SAT", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "OFF_COLLECTOR", "ACTIVE_COLLECTOR", "SAT_COLLECTOR"],
      netVoltages: [
        { name: "OFF_COLLECTOR", expected: approximate(0, 0.01) },
        { name: "ACTIVE_COLLECTOR", expected: approximate(0.04555, 0.002) },
        { name: "SAT_COLLECTOR", expected: approximate(4.97, 0.05) },
      ],
      componentMeasurements: [
        { refdes: "RC_OFF", metric: "current", expected: approximate(0, 1e-8) },
        { refdes: "RC_ACTIVE", metric: "current", expected: approximate(0.00004555, 0.000002) },
        { refdes: "RC_SAT", metric: "current", expected: approximate(0.00497, 0.00008) },
      ],
    }),
  },
  {
    id: "op-amp-non-inverting-transient",
    title: "Non-inverting op amp transient gain and phase",
    prompt:
      "Build an ideal non-inverting amplifier on +12 V and -12 V rails with output limits of -10 V and +10 V. Drive its non-inverting input with a 0.5 V-peak, 200 Hz sine, use 10 kOhm from the inverting input to GND and 50 kOhm feedback from output to the inverting input, and load VOUT with 20 kOhm. Preserve INPUT, FEEDBACK, and VOUT, simulate several cycles, and report the input, feedback, and output waveform ranges to show a non-inverted gain of six.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        {
          type: "sine-voltage-source",
          refdes: "VIN",
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
            { refdes: "VIN", pin: "positive" },
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
            { refdes: "VIN", pin: "negative" },
            { refdes: "RG", pin: "b" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(30, 0.02),
    },
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
          signalName: "V(FEEDBACK)",
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
  },
  {
    id: "pmos-active-low-transient",
    title: "PMOS active-low transient switching",
    prompt:
      "Create a -2 V-threshold P-channel MOSFET high-side switch from a 5 V supply to a 330 Ohm load to GND. Drive the gate with a 5 V-peak, 50 Hz sine referenced to GND so the same transient run enters both cutoff and conduction. Preserve GATE and OUTPUT, simulate four cycles, and report the gate range, output high and low levels, and load-current switching behavior.",
    smoke: false,
    graph: pmosHighSideSwitchGraph,
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
          metric: "minimum",
          startFraction: 0.5,
          expected: approximate(0, 0.03),
        },
        {
          signalName: "V(OUTPUT)",
          metric: "maximum",
          startFraction: 0.5,
          expected: approximate(4.962, 0.02),
        },
      ],
    }),
  },
  {
    id: "megaohm-divider",
    title: "Megaohm voltage divider SPICE scaling",
    prompt:
      "Create a 5 V source feeding two 10 MOhm resistors in series to GND. Preserve the midpoint VOUT, simulate, and report VOUT plus the sub-microamp chain current. This case must retain megaohm—not milliohm—SPICE scaling.",
    smoke: true,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 5 } },
        { type: "resistor", refdes: "R1", props: { resistanceOhms: 10_000_000 } },
        { type: "resistor", refdes: "R2", props: { resistanceOhms: 10_000_000 } },
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
            { refdes: "R2", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "V1", pin: "negative" },
            { refdes: "R2", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "VIN", "VOUT"],
      netVoltages: [
        { name: "VIN", expected: approximate(5, 0.001) },
        { name: "VOUT", expected: approximate(2.5, 0.001) },
      ],
      componentMeasurements: [
        { refdes: "R1", metric: "current", expected: approximate(0.00000025, 2e-9) },
        { refdes: "R2", metric: "power", expected: approximate(0.000000625, 1e-8) },
      ],
    }),
  },
  {
    id: "zener-forward-and-breakdown",
    title: "Zener forward conduction and reverse breakdown",
    prompt:
      "Create two independent branches from one 12 V supply. Feed a 5.1 V Zener in reverse through 680 Ohm with its cathode at ZENER_BREAKDOWN and anode at GND. Feed a second identical Zener forward through 1 kOhm with its anode at ZENER_FORWARD and cathode at GND. Simulate and compare the reverse-breakdown voltage, ordinary forward drop, and both branch currents.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 12 } },
        { type: "resistor", refdes: "RREV", props: { resistanceOhms: 680 } },
        { type: "resistor", refdes: "RFWD", props: { resistanceOhms: 1_000 } },
        { type: "zener-diode", refdes: "DZREV", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "zener-diode", refdes: "DZFWD", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "RREV", pin: "a" },
            { refdes: "RFWD", pin: "a" },
          ],
        },
        {
          name: "ZENER_BREAKDOWN",
          terminals: [
            { refdes: "RREV", pin: "b" },
            { refdes: "DZREV", pin: "cathode" },
          ],
        },
        {
          name: "ZENER_FORWARD",
          terminals: [
            { refdes: "RFWD", pin: "b" },
            { refdes: "DZFWD", pin: "anode" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "V1", pin: "negative" },
            { refdes: "DZREV", pin: "anode" },
            { refdes: "DZFWD", pin: "cathode" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "ZENER_BREAKDOWN", "ZENER_FORWARD"],
      netVoltages: [
        { name: "ZENER_BREAKDOWN", expected: approximate(5.25847, 0.005) },
        { name: "ZENER_FORWARD", expected: approximate(0.82925, 0.005) },
      ],
      componentMeasurements: [
        { refdes: "RREV", metric: "current", expected: approximate(0.00991401, 0.00001) },
        { refdes: "RFWD", metric: "current", expected: approximate(0.01117075, 0.00001) },
      ],
    }),
  },
  {
    id: "npn-beta-comparison",
    title: "NPN forward-active beta comparison",
    prompt:
      "Create two forward-active NPN branches from one 5 V collector supply. Drive each base from the same 1.2 V source through its own 200 kOhm resistor, ground both emitters, and use a 2 kOhm collector resistor per branch. Set Q50 beta to 50 and Q200 beta to 200. Preserve BETA50_COLLECTOR and BETA200_COLLECTOR, simulate, and compare base currents, collector currents, and collector voltage drops.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VDRIVE", props: { voltageVolts: 1.2 } },
        { type: "resistor", refdes: "RB50", props: { resistanceOhms: 200_000 } },
        { type: "resistor", refdes: "RB200", props: { resistanceOhms: 200_000 } },
        { type: "resistor", refdes: "RC50", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RC200", props: { resistanceOhms: 2_000 } },
        { type: "npn-transistor", refdes: "Q50", props: { beta: 50, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "Q200", props: { beta: 200, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "VCC", pin: "positive" },
            { refdes: "RC50", pin: "a" },
            { refdes: "RC200", pin: "a" },
          ],
        },
        {
          name: "DRIVE",
          terminals: [
            { refdes: "VDRIVE", pin: "positive" },
            { refdes: "RB50", pin: "a" },
            { refdes: "RB200", pin: "a" },
          ],
        },
        {
          name: "BETA50_BASE",
          terminals: [
            { refdes: "RB50", pin: "b" },
            { refdes: "Q50", pin: "base" },
          ],
        },
        {
          name: "BETA200_BASE",
          terminals: [
            { refdes: "RB200", pin: "b" },
            { refdes: "Q200", pin: "base" },
          ],
        },
        {
          name: "BETA50_COLLECTOR",
          terminals: [
            { refdes: "RC50", pin: "b" },
            { refdes: "Q50", pin: "collector" },
          ],
        },
        {
          name: "BETA200_COLLECTOR",
          terminals: [
            { refdes: "RC200", pin: "b" },
            { refdes: "Q200", pin: "collector" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "VDRIVE", pin: "negative" },
            { refdes: "Q50", pin: "emitter" },
            { refdes: "Q200", pin: "emitter" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "BETA50_COLLECTOR", "BETA200_COLLECTOR"],
      netVoltages: [
        { name: "BETA50_COLLECTOR", expected: approximate(4.7205, 0.01) },
        { name: "BETA200_COLLECTOR", expected: approximate(3.961, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RC50", metric: "current", expected: approximate(0.00013976, 0.000005) },
        { refdes: "RC200", metric: "current", expected: approximate(0.00051952, 0.000005) },
      ],
    }),
  },
  {
    id: "nmos-source-follower",
    title: "NMOS source-follower operating point",
    prompt:
      "Create a 2 V-threshold N-channel MOSFET source follower. Tie its drain to a 9 V supply, drive GATE from an ideal 5 V source, and connect SOURCE through 1 kOhm to GND. Simulate and report GATE, SOURCE, gate-to-source offset, and load current.",
    smoke: false,
    graph: {
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
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "GATE", "SOURCE"],
      netVoltages: [
        { name: "GATE", expected: approximate(5, 0.001) },
        { name: "SOURCE", expected: approximate(2.69085, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RLOAD", metric: "current", expected: approximate(0.00269085, 0.00001) },
      ],
    }),
  },
  {
    id: "pnp-emitter-follower",
    title: "PNP negative-rail emitter follower",
    prompt:
      "Create a beta-100 PNP emitter follower on a -9 V rail. Tie its collector to -9 V, drive BASE from an ideal -3 V source, and connect EMITTER through 1 kOhm to GND. Simulate and report BASE, EMITTER, the base-emitter offset polarity, and load current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -9 } },
        { type: "dc-voltage-source", refdes: "VB", props: { voltageVolts: -3 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
        { type: "pnp-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VNEG",
          terminals: [
            { refdes: "VNEG", pin: "positive" },
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
          name: "EMITTER",
          terminals: [
            { refdes: "Q1", pin: "emitter" },
            { refdes: "RLOAD", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VB", pin: "negative" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "BASE", "EMITTER"],
      netVoltages: [
        { name: "BASE", expected: approximate(-3, 0.001) },
        { name: "EMITTER", expected: approximate(-2.26592, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RLOAD", metric: "current", expected: approximate(-0.00226592, 0.00001) },
      ],
    }),
  },
  {
    id: "op-amp-comparator-polarity",
    title: "Ideal op amp comparator polarity",
    prompt:
      "Create two ideal comparators powered from 5 V and GND with gain 100000 and 0-to-5 V output limits. Apply a shared 2 V reference to both inverting inputs. Drive HIGH_INPUT at 3 V and LOW_INPUT at 1 V into their non-inverting inputs. Preserve HIGH_OUTPUT and LOW_OUTPUT, simulate, and report both output rails to demonstrate comparator polarity.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VREF", props: { voltageVolts: 2 } },
        { type: "dc-voltage-source", refdes: "VHI", props: { voltageVolts: 3 } },
        { type: "dc-voltage-source", refdes: "VLO", props: { voltageVolts: 1 } },
        {
          type: "ideal-op-amp-minus-top",
          refdes: "UHI",
          props: { gain: 100_000, minOutputVolts: 0, maxOutputVolts: 5 },
        },
        {
          type: "ideal-op-amp-minus-top",
          refdes: "ULO",
          props: { gain: 100_000, minOutputVolts: 0, maxOutputVolts: 5 },
        },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "VCC", pin: "positive" },
            { refdes: "UHI", pin: "vPlus" },
            { refdes: "ULO", pin: "vPlus" },
          ],
        },
        {
          name: "REFERENCE",
          terminals: [
            { refdes: "VREF", pin: "positive" },
            { refdes: "UHI", pin: "inverting" },
            { refdes: "ULO", pin: "inverting" },
          ],
        },
        {
          name: "HIGH_INPUT",
          terminals: [
            { refdes: "VHI", pin: "positive" },
            { refdes: "UHI", pin: "nonInverting" },
          ],
        },
        {
          name: "LOW_INPUT",
          terminals: [
            { refdes: "VLO", pin: "positive" },
            { refdes: "ULO", pin: "nonInverting" },
          ],
        },
        { name: "HIGH_OUTPUT", terminals: [{ refdes: "UHI", pin: "output" }] },
        { name: "LOW_OUTPUT", terminals: [{ refdes: "ULO", pin: "output" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "VREF", pin: "negative" },
            { refdes: "VHI", pin: "negative" },
            { refdes: "VLO", pin: "negative" },
            { refdes: "UHI", pin: "vMinus" },
            { refdes: "ULO", pin: "vMinus" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "REFERENCE", "HIGH_OUTPUT", "LOW_OUTPUT"],
      netVoltages: [
        { name: "REFERENCE", expected: approximate(2, 0.001) },
        { name: "HIGH_OUTPUT", expected: approximate(5, 0.001) },
        { name: "LOW_OUTPUT", expected: approximate(0, 0.001) },
      ],
    }),
  },
  {
    id: "rc-high-pass-response",
    title: "RC high-pass response at cutoff",
    prompt:
      "Create a first-order RC high-pass filter driven by a 1 V-peak, 159.154943 Hz sine source. Put a 1 uF capacitor in series from INPUT to OUTPUT and a 1 kOhm resistor from OUTPUT to GND. Simulate 100 ms and report the input and output ranges at cutoff.",
    smoke: false,
    graph: {
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
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "OUTPUT"],
      traceRanges: [
        { signalName: "V(INPUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(2, 0.01) },
        { signalName: "V(OUTPUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(1.41418, 0.005) },
      ],
    }),
  },
  {
    id: "bjt-voltage-divider-bias",
    title: "Emitter-degenerated BJT divider bias",
    prompt:
      "Bias a beta-100 NPN transistor from 12 V using 56 kOhm from VCC to BASE, 10 kOhm from BASE to GND, 2 kOhm from VCC to COLLECTOR, and 1 kOhm from EMITTER to GND. Simulate and report BASE, EMITTER, COLLECTOR, and collector current to show the loaded divider operating point.",
    smoke: false,
    graph: {
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
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "BASE", "EMITTER", "COLLECTOR"],
      netVoltages: [
        { name: "BASE", expected: approximate(1.73852, 0.01) },
        { name: "EMITTER", expected: approximate(1.02548, 0.01) },
        { name: "COLLECTOR", expected: approximate(9.96781, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RC", metric: "current", expected: approximate(0.00101609, 0.00001) },
      ],
    }),
  },
  {
    id: "zener-current-range-regulation",
    title: "Zener regulation across branch current",
    prompt:
      "Create two unloaded 5.1 V Zener shunt branches from one 12 V source. Feed HIGH_CURRENT_ZENER through 330 Ohm and LOW_CURRENT_ZENER through 2.2 kOhm, with both Zener anodes at GND. Simulate and compare both regulated voltages and series currents to show reverse-breakdown regulation across a wide current range.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 12 } },
        { type: "resistor", refdes: "RHIGH", props: { resistanceOhms: 330 } },
        { type: "resistor", refdes: "RLOW", props: { resistanceOhms: 2_200 } },
        { type: "zener-diode", refdes: "DZHIGH", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "zener-diode", refdes: "DZLOW", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "RHIGH", pin: "a" },
            { refdes: "RLOW", pin: "a" },
          ],
        },
        {
          name: "HIGH_CURRENT_ZENER",
          terminals: [
            { refdes: "RHIGH", pin: "b" },
            { refdes: "DZHIGH", pin: "cathode" },
          ],
        },
        {
          name: "LOW_CURRENT_ZENER",
          terminals: [
            { refdes: "RLOW", pin: "b" },
            { refdes: "DZLOW", pin: "cathode" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "V1", pin: "negative" },
            { refdes: "DZHIGH", pin: "anode" },
            { refdes: "DZLOW", pin: "anode" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "HIGH_CURRENT_ZENER", "LOW_CURRENT_ZENER"],
      netVoltages: [
        { name: "HIGH_CURRENT_ZENER", expected: approximate(5.37823, 0.005) },
        { name: "LOW_CURRENT_ZENER", expected: approximate(5.16043, 0.005) },
      ],
      componentMeasurements: [
        { refdes: "RHIGH", metric: "current", expected: approximate(0.02006597, 0.00001) },
        { refdes: "RLOW", metric: "current", expected: approximate(0.0031089, 0.00001) },
      ],
    }),
  },
  {
    id: "half-wave-rectifier-transient",
    title: "Half-wave rectifier transient",
    prompt:
      "Create a positive half-wave rectifier driven by an 8 V-peak, 50 Hz sine source. Connect one DDEFAULT diode from INPUT to OUTPUT and a 1 kOhm load from OUTPUT to GND. Simulate three cycles and report input range, output minimum and maximum, and output peak-to-peak range.",
    smoke: false,
    graph: {
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
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "OUTPUT"],
      traceRanges: [
        { signalName: "V(INPUT)", metric: "peakToPeak", startFraction: 0.25, expected: approximate(16, 0.005) },
        { signalName: "V(OUTPUT)", metric: "minimum", startFraction: 0.25, expected: approximate(0, 0.001) },
        { signalName: "V(OUTPUT)", metric: "maximum", startFraction: 0.25, expected: approximate(7.29349, 0.01) },
        { signalName: "V(OUTPUT)", metric: "peakToPeak", startFraction: 0.25, expected: approximate(7.29349, 0.01) },
      ],
    }),
  },
  {
    id: "back-to-back-zener-limiter",
    title: "Symmetric back-to-back Zener limiter",
    prompt:
      "Create a symmetric limiter driven by a 10 V-peak, 100 Hz sine source through 1 kOhm. Put two 5.1 V Zeners in series opposition from OUTPUT to GND with their cathodes joined at CLAMP_MID, and load OUTPUT with 10 kOhm. Simulate and report the positive and negative output limits and total output range.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        {
          type: "sine-voltage-source",
          refdes: "V1",
          props: { amplitudeVolts: 10, frequencyHertz: 100 },
        },
        { type: "resistor", refdes: "RS", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 10_000 } },
        { type: "zener-diode", refdes: "DZP", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "zener-diode", refdes: "DZN", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
      ],
      nets: [
        {
          name: "INPUT",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "RS", pin: "a" },
          ],
        },
        {
          name: "OUTPUT",
          terminals: [
            { refdes: "RS", pin: "b" },
            { refdes: "RLOAD", pin: "a" },
            { refdes: "DZP", pin: "anode" },
          ],
        },
        {
          name: "CLAMP_MID",
          terminals: [
            { refdes: "DZP", pin: "cathode" },
            { refdes: "DZN", pin: "cathode" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "V1", pin: "negative" },
            { refdes: "RLOAD", pin: "b" },
            { refdes: "DZN", pin: "anode" },
          ],
        },
      ],
      analysis: analysis(40, 0.02),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "OUTPUT", "CLAMP_MID"],
      traceRanges: [
        { signalName: "V(OUTPUT)", metric: "maximum", startFraction: 0.25, expected: approximate(5.89063, 0.01) },
        { signalName: "V(OUTPUT)", metric: "minimum", startFraction: 0.25, expected: approximate(-5.89063, 0.01) },
        { signalName: "V(OUTPUT)", metric: "peakToPeak", startFraction: 0.25, expected: approximate(11.78126, 0.02) },
      ],
    }),
  },
  {
    id: "pnp-beta-comparison",
    title: "PNP forward-active beta comparison",
    prompt:
      "Create two forward-active PNP branches referenced to GND. Tie both emitters to GND, drive each base from -1.2 V through 200 kOhm, and connect each collector through 2 kOhm to a -5 V rail. Set Q50 beta to 50 and Q200 beta to 200. Preserve BETA50_COLLECTOR and BETA200_COLLECTOR, simulate, and compare collector voltages and signed resistor currents.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VEE", props: { voltageVolts: -5 } },
        { type: "dc-voltage-source", refdes: "VDRIVE", props: { voltageVolts: -1.2 } },
        { type: "resistor", refdes: "RB50", props: { resistanceOhms: 200_000 } },
        { type: "resistor", refdes: "RB200", props: { resistanceOhms: 200_000 } },
        { type: "resistor", refdes: "RC50", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RC200", props: { resistanceOhms: 2_000 } },
        { type: "pnp-transistor", refdes: "Q50", props: { beta: 50, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "Q200", props: { beta: 200, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VEE",
          terminals: [
            { refdes: "VEE", pin: "positive" },
            { refdes: "RC50", pin: "a" },
            { refdes: "RC200", pin: "a" },
          ],
        },
        {
          name: "DRIVE",
          terminals: [
            { refdes: "VDRIVE", pin: "positive" },
            { refdes: "RB50", pin: "a" },
            { refdes: "RB200", pin: "a" },
          ],
        },
        {
          name: "BETA50_BASE",
          terminals: [
            { refdes: "RB50", pin: "b" },
            { refdes: "Q50", pin: "base" },
          ],
        },
        {
          name: "BETA200_BASE",
          terminals: [
            { refdes: "RB200", pin: "b" },
            { refdes: "Q200", pin: "base" },
          ],
        },
        {
          name: "BETA50_COLLECTOR",
          terminals: [
            { refdes: "RC50", pin: "b" },
            { refdes: "Q50", pin: "collector" },
          ],
        },
        {
          name: "BETA200_COLLECTOR",
          terminals: [
            { refdes: "RC200", pin: "b" },
            { refdes: "Q200", pin: "collector" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VEE", pin: "negative" },
            { refdes: "VDRIVE", pin: "negative" },
            { refdes: "Q50", pin: "emitter" },
            { refdes: "Q200", pin: "emitter" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "BETA50_COLLECTOR", "BETA200_COLLECTOR"],
      netVoltages: [
        { name: "BETA50_COLLECTOR", expected: approximate(-4.72047, 0.01) },
        { name: "BETA200_COLLECTOR", expected: approximate(-3.96097, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RC50", metric: "current", expected: approximate(-0.00013976, 0.000005) },
        { refdes: "RC200", metric: "current", expected: approximate(-0.00051952, 0.000005) },
      ],
    }),
  },
  {
    id: "rl-high-pass-response",
    title: "RL high-pass response at cutoff",
    prompt:
      "Create a first-order RL high-pass stage at cutoff. Drive a 100 Ohm resistor in series with a 100 mH inductor from a 1 V-peak, 159.154943 Hz sine source, take VOUT across the inductor, preserve VIN and VOUT, simulate several cycles, and report the input and output ranges plus representative samples showing the inductive phase lead.",
    smoke: false,
    graph: {
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
          props: { inductanceHenries: 0.1 },
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
            { refdes: "L1", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "V1", pin: "negative" },
            { refdes: "L1", pin: "b" },
          ],
        },
      ],
      analysis: analysis(50, 0.02),
    },
    expected: expected({
      requiredNetNames: ["GND", "VIN", "VOUT"],
      traces: [
        {
          signalName: "V(VOUT)",
          atSeconds: 0.025,
          expected: approximate(0.42939, 0.005),
        },
      ],
      traceRanges: [
        {
          signalName: "V(VIN)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(2, 0.01),
        },
        {
          signalName: "V(VOUT)",
          metric: "peakToPeak",
          startFraction: 0.5,
          expected: approximate(1.4142, 0.03),
        },
      ],
    }),
  },
  {
    id: "diode-positive-clamper",
    title: "Diode positive clamper transient",
    prompt:
      "Build a positive diode clamper from a 5 V-peak, 100 Hz sine source. AC-couple VIN through 10 uF to CLAMPED, connect a DDEFAULT diode with anode at GND and cathode at CLAMPED, and use a 100 kOhm discharge resistor from CLAMPED to GND. Simulate long enough to settle and report the clamped minimum, maximum, and peak-to-peak range.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        {
          type: "sine-voltage-source",
          refdes: "V1",
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
          name: "VIN",
          terminals: [
            { refdes: "V1", pin: "positive" },
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
            { refdes: "V1", pin: "negative" },
            { refdes: "D1", pin: "anode" },
            { refdes: "R1", pin: "b" },
          ],
        },
      ],
      analysis: analysis(120, 0.05),
    },
    expected: expected({
      requiredNetNames: ["GND", "VIN", "CLAMPED"],
      traceRanges: [
        {
          signalName: "V(CLAMPED)",
          metric: "minimum",
          startFraction: 0.75,
          expected: approximate(-0.66526, 0.01),
        },
        {
          signalName: "V(CLAMPED)",
          metric: "maximum",
          startFraction: 0.75,
          expected: approximate(9.33082, 0.02),
        },
        {
          signalName: "V(CLAMPED)",
          metric: "peakToPeak",
          startFraction: 0.75,
          expected: approximate(9.99609, 0.02),
        },
      ],
    }),
  },
  {
    id: "single-vs-darlington-follower",
    title: "Single-transistor versus Darlington followers",
    prompt:
      "Build two beta-100 NPN emitter-follower branches from one 9 V supply and one 4 V drive. Feed each first base through 10 kOhm. Use one NPN and a 1 kOhm load for SINGLE_OUT; use a two-NPN Darlington with both collectors at VCC and its own 1 kOhm load for DARLINGTON_OUT. Preserve SINGLE_BASE, DARLINGTON_BASE, DARLINGTON_MID, and both outputs, then compare their DC drops and load currents.",
    smoke: false,
    graph: {
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
          name: "DRIVE",
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
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: [
        "GND",
        "SINGLE_BASE",
        "SINGLE_OUT",
        "DARLINGTON_BASE",
        "DARLINGTON_MID",
        "DARLINGTON_OUT",
      ],
      netVoltages: [
        { name: "SINGLE_BASE", expected: approximate(3.71976, 0.01) },
        { name: "SINGLE_OUT", expected: approximate(2.97843, 0.01) },
        { name: "DARLINGTON_BASE", expected: approximate(3.99766, 0.01) },
        { name: "DARLINGTON_MID", expected: approximate(3.38014, 0.01) },
        { name: "DARLINGTON_OUT", expected: approximate(2.64199, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RLS", metric: "current", expected: approximate(0.00297843, 0.00001) },
        { refdes: "RLD", metric: "current", expected: approximate(0.00264199, 0.00001) },
      ],
    }),
  },
  {
    id: "diode-voltage-doubler",
    title: "Loaded diode-capacitor voltage doubler",
    prompt:
      "Build a half-wave voltage doubler from a 5 V-peak, 100 Hz sine source. AC-couple INPUT through 100 uF to PUMP, clamp PUMP with a DDEFAULT diode from GND to PUMP, rectify PUMP through a second DDEFAULT diode into VOUT, and place 100 uF plus a 10 kOhm load from VOUT to GND. Simulate 200 ms and report the settled PUMP range, VOUT average, and output ripple.",
    smoke: false,
    graph: {
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
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "PUMP", "VOUT"],
      traceRanges: [
        { signalName: "V(PUMP)", metric: "minimum", startFraction: 0.75, expected: approximate(-0.74163, 0.01) },
        { signalName: "V(PUMP)", metric: "maximum", startFraction: 0.75, expected: approximate(9.21492, 0.02) },
        { signalName: "V(VOUT)", metric: "average", startFraction: 0.75, expected: approximate(8.4663, 0.01) },
        { signalName: "V(VOUT)", metric: "peakToPeak", startFraction: 0.75, expected: approximate(0.07866, 0.005) },
      ],
    }),
  },
  {
    id: "pnp-current-mirror",
    title: "High-side PNP current mirror",
    prompt:
      "Build a beta-100 two-PNP high-side current mirror from 5 V. Tie both emitters to VCC and both bases to MIRROR_BASE, diode-connect QREF by joining its collector to MIRROR_BASE, and set its reference current with 2 kOhm to GND. Connect QOUT collector to OUTPUT with a 1 kOhm load to GND. Simulate and report MIRROR_BASE, OUTPUT, reference current, and mirrored load current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 5 } },
        { type: "resistor", refdes: "RREF", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
        { type: "pnp-transistor", refdes: "QREF", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "QOUT", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "VCC", pin: "positive" },
            { refdes: "QREF", pin: "emitter" },
            { refdes: "QOUT", pin: "emitter" },
          ],
        },
        {
          name: "MIRROR_BASE",
          terminals: [
            { refdes: "QREF", pin: "base" },
            { refdes: "QREF", pin: "collector" },
            { refdes: "QOUT", pin: "base" },
            { refdes: "RREF", pin: "a" },
          ],
        },
        {
          name: "OUTPUT",
          terminals: [
            { refdes: "QOUT", pin: "collector" },
            { refdes: "RLOAD", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "RREF", pin: "b" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "MIRROR_BASE", "OUTPUT"],
      netVoltages: [
        { name: "MIRROR_BASE", expected: approximate(4.26624, 0.01) },
        { name: "OUTPUT", expected: approximate(2.13585, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RREF", metric: "current", expected: approximate(0.00213312, 0.00001) },
        { refdes: "RLOAD", metric: "current", expected: approximate(0.00213585, 0.00001) },
      ],
    }),
  },
  {
    id: "nmos-source-degeneration-comparison",
    title: "NMOS source-degeneration comparison",
    prompt:
      "Build two 2 V-threshold NMOS common-source branches from 12 V with both gates held at 4 V and both drains returned to VDD through 1 kOhm. Ground MFIXED source directly; place 470 Ohm from MDEG source to GND. Preserve FIXED_DRAIN, DEGENERATED_DRAIN, and DEGENERATED_SOURCE, simulate, and compare drain voltages and currents to show source-resistor feedback.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VDD", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VGATE", props: { voltageVolts: 4 } },
        { type: "resistor", refdes: "RDF", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RDD", props: { resistanceOhms: 1_000 } },
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
          name: "GATE",
          terminals: [
            { refdes: "VGATE", pin: "positive" },
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
            { refdes: "VGATE", pin: "negative" },
            { refdes: "MFIXED", pin: "source" },
            { refdes: "RS", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "GATE", "FIXED_DRAIN", "DEGENERATED_DRAIN", "DEGENERATED_SOURCE"],
      netVoltages: [
        { name: "FIXED_DRAIN", expected: approximate(0.12222, 0.01) },
        { name: "DEGENERATED_DRAIN", expected: approximate(8.49216, 0.01) },
        { name: "DEGENERATED_SOURCE", expected: approximate(1.64869, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RDF", metric: "current", expected: approximate(0.0118778, 0.00001) },
        { refdes: "RDD", metric: "current", expected: approximate(0.00350784, 0.00001) },
      ],
    }),
  },
  {
    id: "op-amp-comparator-duty-cycle",
    title: "Comparator threshold duty cycle",
    prompt:
      "Build an ideal comparator powered from 5 V and GND with output limits 0 V and 5 V. Drive its non-inverting input with a 5 V-peak, 100 Hz sine and hold its inverting REFERENCE at 2.5 V. Load OUTPUT with 1 kOhm to GND, preserve INPUT, REFERENCE, and OUTPUT, simulate four cycles, and report the output levels plus its approximately one-third high interval.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VREF", props: { voltageVolts: 2.5 } },
        { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 5, frequencyHertz: 100 } },
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
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "REFERENCE", "OUTPUT"],
      traces: [
        { signalName: "V(OUTPUT)", atSeconds: 0.0025, expected: approximate(5, 0.01) },
        { signalName: "V(OUTPUT)", atSeconds: 0.0075, expected: approximate(0, 0.01) },
      ],
      traceRanges: [
        { signalName: "V(OUTPUT)", metric: "minimum", startFraction: 0.25, expected: approximate(0, 0.01) },
        { signalName: "V(OUTPUT)", metric: "maximum", startFraction: 0.25, expected: approximate(5, 0.01) },
        { signalName: "V(OUTPUT)", metric: "average", startFraction: 0.25, expected: approximate(1.66778, 0.01) },
      ],
    }),
  },
  {
    id: "diode-envelope-detector",
    title: "Loaded diode envelope detector",
    prompt:
      "Build a diode peak/envelope detector driven by a 5 V-peak, 1 kHz sine. Feed ENVELOPE through one DDEFAULT diode, place 1 uF and 10 kOhm in parallel from ENVELOPE to GND, preserve INPUT and ENVELOPE, simulate 30 ms with a fine step, and report the settled average, minimum, maximum, and ripple showing capacitor hold between peaks.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 5, frequencyHertz: 1_000 } },
        { type: "diode", refdes: "D1", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "capacitor", refdes: "C1", props: { capacitanceFarads: 0.000001 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 10_000 } },
      ],
      nets: [
        {
          name: "INPUT",
          terminals: [
            { refdes: "VIN", pin: "positive" },
            { refdes: "D1", pin: "anode" },
          ],
        },
        {
          name: "ENVELOPE",
          terminals: [
            { refdes: "D1", pin: "cathode" },
            { refdes: "C1", pin: "a" },
            { refdes: "RLOAD", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VIN", pin: "negative" },
            { refdes: "C1", pin: "b" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(30, 0.005),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "ENVELOPE"],
      traceRanges: [
        { signalName: "V(ENVELOPE)", metric: "average", startFraction: 0.5, expected: approximate(4.1509, 0.01) },
        { signalName: "V(ENVELOPE)", metric: "minimum", startFraction: 0.5, expected: approximate(3.95995, 0.01) },
        { signalName: "V(ENVELOPE)", metric: "maximum", startFraction: 0.5, expected: approximate(4.33719, 0.01) },
        { signalName: "V(ENVELOPE)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.37724, 0.01) },
      ],
    }),
  },
  {
    id: "pnp-single-vs-darlington-follower",
    title: "PNP single versus Darlington followers",
    prompt:
      "Build two beta-100 PNP sinking emitter-follower branches from one -9 V rail and one -4 V drive. Feed both first bases through 10 kOhm. Use one PNP with a 1 kOhm load from GND to SINGLE_OUT; use a two-PNP Darlington with both collectors at VEE and a separate 1 kOhm load from GND to DARLINGTON_OUT. Preserve both bases, DARLINGTON_MID, and both outputs, then compare signed DC levels and load currents.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VEE", props: { voltageVolts: -9 } },
        { type: "dc-voltage-source", refdes: "VIN", props: { voltageVolts: -4 } },
        { type: "resistor", refdes: "RBS", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RBD", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RLS", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RLD", props: { resistanceOhms: 1_000 } },
        { type: "pnp-transistor", refdes: "QS", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "QD1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "QD2", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VEE",
          terminals: [
            { refdes: "VEE", pin: "positive" },
            { refdes: "QS", pin: "collector" },
            { refdes: "QD1", pin: "collector" },
            { refdes: "QD2", pin: "collector" },
          ],
        },
        {
          name: "DRIVE",
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
            { refdes: "RLS", pin: "b" },
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
            { refdes: "RLD", pin: "b" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VEE", pin: "negative" },
            { refdes: "VIN", pin: "negative" },
            { refdes: "RLS", pin: "a" },
            { refdes: "RLD", pin: "a" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "SINGLE_BASE", "SINGLE_OUT", "DARLINGTON_BASE", "DARLINGTON_MID", "DARLINGTON_OUT"],
      netVoltages: [
        { name: "SINGLE_BASE", expected: approximate(-3.71976, 0.01) },
        { name: "SINGLE_OUT", expected: approximate(-2.97843, 0.01) },
        { name: "DARLINGTON_BASE", expected: approximate(-3.99766, 0.01) },
        { name: "DARLINGTON_MID", expected: approximate(-3.38014, 0.01) },
        { name: "DARLINGTON_OUT", expected: approximate(-2.64199, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RLS", metric: "current", expected: approximate(0.00297843, 0.00001) },
        { refdes: "RLD", metric: "current", expected: approximate(0.00264199, 0.00001) },
      ],
    }),
  },
  {
    id: "zener-npn-current-sink",
    title: "Zener-referenced NPN current sink",
    prompt:
      "Build a beta-100 NPN current sink from a 12 V rail. Feed a 5.1 V Zener reference through 1 kOhm, connect the Zener cathode to the transistor base, use 4.3 kOhm from emitter to GND, and pull the collector up through 3 kOhm. Preserve VREF, EMITTER, and COLLECTOR, simulate, and report the reference, base-emitter offset, collector headroom, and sink current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 12 } },
        { type: "resistor", refdes: "RZ", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RE", props: { resistanceOhms: 4_300 } },
        { type: "resistor", refdes: "RC", props: { resistanceOhms: 3_000 } },
        { type: "zener-diode", refdes: "DZ", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "npn-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VCC",
          terminals: [
            { refdes: "VCC", pin: "positive" },
            { refdes: "RZ", pin: "a" },
            { refdes: "RC", pin: "a" },
          ],
        },
        {
          name: "VREF",
          terminals: [
            { refdes: "RZ", pin: "b" },
            { refdes: "DZ", pin: "cathode" },
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
          name: "COLLECTOR",
          terminals: [
            { refdes: "RC", pin: "b" },
            { refdes: "Q1", pin: "collector" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VCC", pin: "negative" },
            { refdes: "DZ", pin: "anode" },
            { refdes: "RE", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "VREF", "EMITTER", "COLLECTOR"],
      netVoltages: [
        { name: "VREF", expected: approximate(5.21721, 0.02) },
        { name: "EMITTER", expected: approximate(4.50252, 0.02) },
        { name: "COLLECTOR", expected: approximate(8.88872, 0.03) },
      ],
      componentMeasurements: [
        { refdes: "RE", metric: "current", expected: approximate(0.0010471, 0.00001) },
        { refdes: "RC", metric: "current", expected: approximate(0.00103709, 0.00001) },
      ],
    }),
  },
  {
    id: "npn-differential-pair-balance",
    title: "Balanced NPN differential pair",
    prompt:
      "Build a beta-100 NPN differential pair on +5 V and -5 V rails. Ground both bases, use one 2 kOhm collector resistor per transistor, join the emitters at TAIL, and return TAIL to -5 V through 2 kOhm. Preserve both collector nets and TAIL, simulate, and show that equal inputs split the tail current into matched collector voltages and currents.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -5 } },
        { type: "resistor", refdes: "RC1", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RC2", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RTAIL", props: { resistanceOhms: 2_000 } },
        { type: "npn-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "Q2", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        {
          name: "VPLUS",
          terminals: [
            { refdes: "VPOS", pin: "positive" },
            { refdes: "RC1", pin: "a" },
            { refdes: "RC2", pin: "a" },
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
          name: "COLLECTOR_1",
          terminals: [
            { refdes: "RC1", pin: "b" },
            { refdes: "Q1", pin: "collector" },
          ],
        },
        {
          name: "COLLECTOR_2",
          terminals: [
            { refdes: "RC2", pin: "b" },
            { refdes: "Q2", pin: "collector" },
          ],
        },
        {
          name: "TAIL",
          terminals: [
            { refdes: "Q1", pin: "emitter" },
            { refdes: "Q2", pin: "emitter" },
            { refdes: "RTAIL", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "Q1", pin: "base" },
            { refdes: "Q2", pin: "base" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "COLLECTOR_1", "COLLECTOR_2", "TAIL"],
      netVoltages: [
        { name: "COLLECTOR_1", expected: approximate(2.87836, 0.01) },
        { name: "COLLECTOR_2", expected: approximate(2.87836, 0.01) },
        { name: "TAIL", expected: approximate(-0.71547, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RC1", metric: "current", expected: approximate(0.00106082, 0.00001) },
        { refdes: "RC2", metric: "current", expected: approximate(0.00106082, 0.00001) },
        { refdes: "RTAIL", metric: "current", expected: approximate(0.00214227, 0.00001) },
      ],
    }),
  },
  {
    id: "op-amp-leaky-integrator",
    title: "Leaky op amp integrator",
    prompt:
      "Build an inverting leaky integrator on +/-12 V supplies with output limits of +/-10 V. Drive a 1 V-peak, 100 Hz sine through 10 kOhm into SUM, connect 100 kOhm in parallel with 0.1 uF from VOUT back to SUM, ground the non-inverting input, and load VOUT with 20 kOhm. Preserve INPUT, SUM, and VOUT, simulate six cycles, and report virtual-ground error, steady output swing, and samples showing integration phase.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 1, frequencyHertz: 100 } },
        { type: "resistor", refdes: "RIN", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RF", props: { resistanceOhms: 100_000 } },
        { type: "capacitor", refdes: "CF", props: { capacitanceFarads: 0.0000001 } },
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
          name: "INPUT",
          terminals: [
            { refdes: "VIN", pin: "positive" },
            { refdes: "RIN", pin: "a" },
          ],
        },
        {
          name: "SUM",
          terminals: [
            { refdes: "RIN", pin: "b" },
            { refdes: "RF", pin: "a" },
            { refdes: "CF", pin: "a" },
            { refdes: "U1", pin: "inverting" },
          ],
        },
        {
          name: "VOUT",
          terminals: [
            { refdes: "RF", pin: "b" },
            { refdes: "CF", pin: "b" },
            { refdes: "RLOAD", pin: "a" },
            { refdes: "U1", pin: "output" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VIN", pin: "negative" },
            { refdes: "U1", pin: "nonInverting" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(60, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "SUM", "VOUT"],
      traces: [
        { signalName: "V(VOUT)", atSeconds: 0.04, expected: approximate(1.52324, 0.05) },
        { signalName: "V(VOUT)", atSeconds: 0.0425, expected: approximate(-0.26927, 0.05) },
        { signalName: "V(VOUT)", atSeconds: 0.045, expected: approximate(-1.56888, 0.05) },
      ],
      traceRanges: [
        { signalName: "V(SUM)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.00003186, 0.000002) },
        { signalName: "V(VOUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(3.18649, 0.03) },
      ],
    }),
  },
  {
    id: "op-amp-practical-differentiator",
    title: "Practical op amp differentiator",
    prompt:
      "Build an inverting practical differentiator on +/-12 V supplies with output limits of +/-10 V. Drive a 1 V-peak, 100 Hz sine through 0.1 uF in series with 1 kOhm into SUM, use 10 kOhm feedback from VOUT to SUM, ground the non-inverting input, and load VOUT with 20 kOhm. Preserve INPUT, COUPLED, SUM, and VOUT, simulate six cycles, and report virtual-ground error, output swing, and samples showing differentiation phase.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 1, frequencyHertz: 100 } },
        { type: "capacitor", refdes: "CIN", props: { capacitanceFarads: 0.0000001 } },
        { type: "resistor", refdes: "RIN", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RF", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 20_000 } },
        { type: "ideal-op-amp-minus-top", refdes: "U1", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "U1", pin: "vPlus" }] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "U1", pin: "vMinus" }] },
        { name: "INPUT", terminals: [{ refdes: "VIN", pin: "positive" }, { refdes: "CIN", pin: "a" }] },
        { name: "COUPLED", terminals: [{ refdes: "CIN", pin: "b" }, { refdes: "RIN", pin: "a" }] },
        { name: "SUM", terminals: [{ refdes: "RIN", pin: "b" }, { refdes: "RF", pin: "a" }, { refdes: "U1", pin: "inverting" }] },
        { name: "VOUT", terminals: [{ refdes: "RF", pin: "b" }, { refdes: "RLOAD", pin: "a" }, { refdes: "U1", pin: "output" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VIN", pin: "negative" },
            { refdes: "U1", pin: "nonInverting" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(60, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "COUPLED", "SUM", "VOUT"],
      traces: [
        { signalName: "V(VOUT)", atSeconds: 0.04, expected: approximate(-0.62564, 0.03) },
        { signalName: "V(VOUT)", atSeconds: 0.0425, expected: approximate(-0.04241, 0.03) },
        { signalName: "V(VOUT)", atSeconds: 0.045, expected: approximate(0.62564, 0.03) },
      ],
      traceRanges: [
        { signalName: "V(SUM)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.00001254, 0.000001) },
        { signalName: "V(VOUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(1.25415, 0.02) },
      ],
    }),
  },
  {
    id: "pnp-differential-pair-balance",
    title: "Balanced PNP differential pair",
    prompt:
      "Build a beta-100 PNP differential pair on +5 V and -5 V rails. Ground both bases, join both emitters at TAIL, feed TAIL from +5 V through 2 kOhm, and connect each collector through its own 2 kOhm resistor to -5 V. Preserve COLLECTOR_1, COLLECTOR_2, and TAIL, simulate, and show that equal inputs split the source current into matched negative collector voltages and branch currents.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -5 } },
        { type: "resistor", refdes: "RC1", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RC2", props: { resistanceOhms: 2_000 } },
        { type: "resistor", refdes: "RTAIL", props: { resistanceOhms: 2_000 } },
        { type: "pnp-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "Q2", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "RTAIL", pin: "a" }] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "RC1", pin: "b" }, { refdes: "RC2", pin: "b" }] },
        { name: "COLLECTOR_1", terminals: [{ refdes: "Q1", pin: "collector" }, { refdes: "RC1", pin: "a" }] },
        { name: "COLLECTOR_2", terminals: [{ refdes: "Q2", pin: "collector" }, { refdes: "RC2", pin: "a" }] },
        { name: "TAIL", terminals: [{ refdes: "RTAIL", pin: "b" }, { refdes: "Q1", pin: "emitter" }, { refdes: "Q2", pin: "emitter" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "Q1", pin: "base" },
            { refdes: "Q2", pin: "base" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "COLLECTOR_1", "COLLECTOR_2", "TAIL"],
      netVoltages: [
        { name: "COLLECTOR_1", expected: approximate(-2.87836, 0.01) },
        { name: "COLLECTOR_2", expected: approximate(-2.87836, 0.01) },
        { name: "TAIL", expected: approximate(0.71547, 0.01) },
      ],
      componentMeasurements: [
        { refdes: "RC1", metric: "current", expected: approximate(0.00106082, 0.00001) },
        { refdes: "RC2", metric: "current", expected: approximate(0.00106082, 0.00001) },
        { refdes: "RTAIL", metric: "current", expected: approximate(0.00214227, 0.00001) },
      ],
    }),
  },
  {
    id: "led-red-vs-blue-forward-drop",
    title: "Red versus blue LED forward drop",
    prompt:
      "Build two independent LED branches from one 5 V supply. Feed a red LED and a blue LED through separate 330 Ohm resistors to GND. Preserve RED_ANODE and BLUE_ANODE, simulate, and compare their forward voltages and branch currents to demonstrate color-dependent LED models.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 5 } },
        { type: "resistor", refdes: "RR", props: { resistanceOhms: 330 } },
        { type: "resistor", refdes: "RB", props: { resistanceOhms: 330 } },
        { type: "led", refdes: "LEDR", props: { color: "red" } },
        { type: "led", refdes: "LEDB", props: { color: "blue" } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RR", pin: "a" }, { refdes: "RB", pin: "a" }] },
        { name: "RED_ANODE", terminals: [{ refdes: "RR", pin: "b" }, { refdes: "LEDR", pin: "anode" }] },
        { name: "BLUE_ANODE", terminals: [{ refdes: "RB", pin: "b" }, { refdes: "LEDB", pin: "anode" }] },
        { name: "GND", terminals: [{ refdes: "VCC", pin: "negative" }, { refdes: "LEDR", pin: "cathode" }, { refdes: "LEDB", pin: "cathode" }] },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "RED_ANODE", "BLUE_ANODE"],
      netVoltages: [
        { name: "RED_ANODE", expected: approximate(1.90252, 0.02) },
        { name: "BLUE_ANODE", expected: approximate(3.06919, 0.03) },
      ],
      componentMeasurements: [
        { refdes: "RR", metric: "current", expected: approximate(0.0093863, 0.00005) },
        { refdes: "RB", metric: "current", expected: approximate(0.00585093, 0.00005) },
      ],
    }),
  },
  {
    id: "pnp-common-emitter-transient",
    title: "PNP common-emitter transient amplifier",
    prompt:
      "Build a beta-100 PNP common-emitter amplifier from a -9 V rail. Superimpose a 20 mV-peak, 100 Hz sine on a -1.5 V DC input bias, feed the base through 10 kOhm, use a 3.3 kOhm collector resistor to -9 V, and a 1 kOhm emitter resistor to GND. Preserve INPUT, BASE, EMITTER, and COLLECTOR, simulate six cycles, and report the negative DC operating point plus input and collector waveform ranges showing phase inversion.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -9 } },
        { type: "dc-voltage-source", refdes: "VBIAS", props: { voltageVolts: -1.5 } },
        { type: "sine-voltage-source", refdes: "VSIGNAL", props: { amplitudeVolts: 0.02, frequencyHertz: 100 } },
        { type: "resistor", refdes: "RB", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RC", props: { resistanceOhms: 3_300 } },
        { type: "resistor", refdes: "RE", props: { resistanceOhms: 1_000 } },
        { type: "pnp-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VNEG", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "RC", pin: "b" }] },
        { name: "BIAS", terminals: [{ refdes: "VBIAS", pin: "positive" }, { refdes: "VSIGNAL", pin: "negative" }] },
        { name: "INPUT", terminals: [{ refdes: "VSIGNAL", pin: "positive" }, { refdes: "RB", pin: "a" }] },
        { name: "BASE", terminals: [{ refdes: "RB", pin: "b" }, { refdes: "Q1", pin: "base" }] },
        { name: "COLLECTOR", terminals: [{ refdes: "RC", pin: "a" }, { refdes: "Q1", pin: "collector" }] },
        { name: "EMITTER", terminals: [{ refdes: "Q1", pin: "emitter" }, { refdes: "RE", pin: "b" }] },
        { name: "GND", terminals: [{ refdes: "VNEG", pin: "negative" }, { refdes: "VBIAS", pin: "negative" }, { refdes: "RE", pin: "a" }] },
      ],
      analysis: analysis(60, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "BASE", "EMITTER", "COLLECTOR"],
      traceRanges: [
        { signalName: "V(INPUT)", metric: "average", startFraction: 0.5, expected: approximate(-1.5, 0.002) },
        { signalName: "V(INPUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.04, 0.001) },
        { signalName: "V(COLLECTOR)", metric: "average", startFraction: 0.5, expected: approximate(-6.62445, 0.02) },
        { signalName: "V(COLLECTOR)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.11532, 0.005) },
      ],
    }),
  },
  {
    id: "zener-pnp-current-source",
    title: "Zener-referenced PNP current source",
    prompt:
      "Build a high-side beta-100 PNP current source from 12 V. Bias its base from a 5.1 V Zener shunt fed through 680 Ohm, connect its emitter to 12 V through 6.2 kOhm, and drive a 2 kOhm collector load to GND. Preserve VREF, EMITTER, and COLLECTOR, simulate, and report the Zener reference, complementary base-emitter offset, sourced load current, and collector-emitter headroom.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 12 } },
        { type: "resistor", refdes: "RZ", props: { resistanceOhms: 680 } },
        { type: "zener-diode", refdes: "DZ", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "resistor", refdes: "RE", props: { resistanceOhms: 6_200 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 2_000 } },
        { type: "pnp-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RZ", pin: "a" }, { refdes: "RE", pin: "a" }] },
        { name: "VREF", terminals: [{ refdes: "RZ", pin: "b" }, { refdes: "DZ", pin: "cathode" }, { refdes: "Q1", pin: "base" }] },
        { name: "EMITTER", terminals: [{ refdes: "RE", pin: "b" }, { refdes: "Q1", pin: "emitter" }] },
        { name: "COLLECTOR", terminals: [{ refdes: "Q1", pin: "collector" }, { refdes: "RLOAD", pin: "a" }] },
        { name: "GND", terminals: [{ refdes: "VCC", pin: "negative" }, { refdes: "DZ", pin: "anode" }, { refdes: "RLOAD", pin: "b" }] },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "VREF", "EMITTER", "COLLECTOR"],
      netVoltages: [
        { name: "VREF", expected: approximate(5.25859, 0.02) },
        { name: "EMITTER", expected: approximate(5.97144, 0.02) },
        { name: "COLLECTOR", expected: approximate(1.92606, 0.02) },
      ],
      componentMeasurements: [
        { refdes: "RE", metric: "current", expected: approximate(0.00097235, 0.00001) },
        { refdes: "RLOAD", metric: "current", expected: approximate(0.00096303, 0.00001) },
      ],
    }),
  },
  {
    id: "series-red-blue-led-string",
    title: "Series red and blue LED string",
    prompt:
      "Build a 9 V series string through 680 Ohm, then a blue LED, then a red LED to GND. Preserve STRING_TOP at the blue anode and STRING_MID between the two LEDs. Simulate and report each color-dependent forward drop, their combined drop, and the identical current through the resistor and both LEDs.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 9 } },
        { type: "resistor", refdes: "R1", props: { resistanceOhms: 680 } },
        { type: "led", refdes: "LEDB", props: { color: "blue" } },
        { type: "led", refdes: "LEDR", props: { color: "red" } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "R1", pin: "a" }] },
        { name: "STRING_TOP", terminals: [{ refdes: "R1", pin: "b" }, { refdes: "LEDB", pin: "anode" }] },
        { name: "STRING_MID", terminals: [{ refdes: "LEDB", pin: "cathode" }, { refdes: "LEDR", pin: "anode" }] },
        { name: "GND", terminals: [{ refdes: "VCC", pin: "negative" }, { refdes: "LEDR", pin: "cathode" }] },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "STRING_TOP", "STRING_MID"],
      netVoltages: [
        { name: "STRING_TOP", expected: approximate(4.94913, 0.02) },
        { name: "STRING_MID", expected: approximate(1.879, 0.02) },
      ],
      componentMeasurements: [
        { refdes: "R1", metric: "current", expected: approximate(0.00595717, 0.00002) },
        { refdes: "LEDB", metric: "voltage", expected: approximate(3.07013, 0.02) },
        { refdes: "LEDB", metric: "current", expected: approximate(0.00595717, 0.00002) },
        { refdes: "LEDR", metric: "voltage", expected: approximate(1.879, 0.02) },
        { refdes: "LEDR", metric: "current", expected: approximate(0.00595717, 0.00002) },
      ],
    }),
  },
  {
    id: "op-amp-precision-half-wave-rectifier",
    title: "Op amp precision half-wave rectifier",
    prompt:
      "Build a precision positive half-wave rectifier on +/-12 V supplies. Drive the non-inverting input of a gain-100000 ideal op amp with a 1 V-peak, 100 Hz sine, connect the op amp output through a DDEFAULT diode to VOUT, feed VOUT back to the inverting input, and load VOUT with 10 kOhm to GND. Limit the op amp to +/-10 V, preserve INPUT, DRIVE, and VOUT, simulate four cycles, and show that the positive output follows the input without a diode-drop loss while negative input drives VOUT to zero.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 1, frequencyHertz: 100 } },
        { type: "ideal-op-amp-minus-top", refdes: "U1", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
        { type: "diode", refdes: "D1", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 10_000 } },
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "U1", pin: "vPlus" }] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "U1", pin: "vMinus" }] },
        { name: "INPUT", terminals: [{ refdes: "VIN", pin: "positive" }, { refdes: "U1", pin: "nonInverting" }] },
        { name: "DRIVE", terminals: [{ refdes: "U1", pin: "output" }, { refdes: "D1", pin: "anode" }] },
        { name: "VOUT", terminals: [{ refdes: "D1", pin: "cathode" }, { refdes: "U1", pin: "inverting" }, { refdes: "RLOAD", pin: "a" }] },
        { name: "GND", terminals: [{ refdes: "VPOS", pin: "negative" }, { refdes: "VNEG", pin: "negative" }, { refdes: "VIN", pin: "negative" }, { refdes: "RLOAD", pin: "b" }] },
      ],
      analysis: analysis(40, 0.02),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "DRIVE", "VOUT"],
      traceRanges: [
        { signalName: "V(INPUT)", metric: "peakToPeak", startFraction: 0.25, expected: approximate(2, 0.002) },
        { signalName: "V(VOUT)", metric: "minimum", startFraction: 0.25, expected: approximate(0, 0.001) },
        { signalName: "V(VOUT)", metric: "maximum", startFraction: 0.25, expected: approximate(0.99998, 0.005) },
        { signalName: "V(VOUT)", metric: "average", startFraction: 0.25, expected: approximate(0.3183, 0.005) },
      ],
    }),
  },
  {
    id: "zener-clamp-load-dropout",
    title: "Zener clamp load-induced dropout",
    prompt:
      "Drive two parallel limiter branches from the same 10 V-peak, 100 Hz sine INPUT. Give each a 1 kOhm source resistor and a 5.1 V Zener from output cathode to GND. Load LIGHT_OUT with 10 kOhm and HEAVY_OUT with 500 Ohm. Simulate four cycles and compare positive peaks to show the light branch reaching Zener breakdown while the heavy divider cannot, along with both negative forward clamps.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 10, frequencyHertz: 100 } },
        { type: "resistor", refdes: "RSL", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RSH", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RLIGHT", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RHEAVY", props: { resistanceOhms: 500 } },
        { type: "zener-diode", refdes: "DZL", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "zener-diode", refdes: "DZH", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
      ],
      nets: [
        { name: "INPUT", terminals: [{ refdes: "VIN", pin: "positive" }, { refdes: "RSL", pin: "a" }, { refdes: "RSH", pin: "a" }] },
        { name: "LIGHT_OUT", terminals: [{ refdes: "RSL", pin: "b" }, { refdes: "RLIGHT", pin: "a" }, { refdes: "DZL", pin: "cathode" }] },
        { name: "HEAVY_OUT", terminals: [{ refdes: "RSH", pin: "b" }, { refdes: "RHEAVY", pin: "a" }, { refdes: "DZH", pin: "cathode" }] },
        { name: "GND", terminals: [{ refdes: "VIN", pin: "negative" }, { refdes: "RLIGHT", pin: "b" }, { refdes: "RHEAVY", pin: "b" }, { refdes: "DZL", pin: "anode" }, { refdes: "DZH", pin: "anode" }] },
      ],
      analysis: analysis(40, 0.02),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "LIGHT_OUT", "HEAVY_OUT"],
      traceRanges: [
        { signalName: "V(LIGHT_OUT)", metric: "maximum", startFraction: 0.25, expected: approximate(5.18075, 0.02) },
        { signalName: "V(HEAVY_OUT)", metric: "maximum", startFraction: 0.25, expected: approximate(3.33333, 0.02) },
        { signalName: "V(LIGHT_OUT)", metric: "minimum", startFraction: 0.25, expected: approximate(-0.80344, 0.02) },
        { signalName: "V(HEAVY_OUT)", metric: "minimum", startFraction: 0.25, expected: approximate(-0.78421, 0.02) },
      ],
    }),
  },
  {
    id: "class-ab-biased-emitter-follower",
    title: "Biased class-AB complementary emitter follower",
    prompt:
      "Build a beta-100 complementary emitter follower on +/-9 V rails with a 3 V-peak, 100 Hz DRIVE. Bias the NPN base 0.75 V above DRIVE and the PNP base 0.75 V below DRIVE using floating DC sources. Join each emitter to VOUT through its own 10 Ohm ballast resistor and load VOUT with 1 kOhm to GND. Preserve DRIVE, both bases, both emitters, and VOUT, simulate four cycles, and report close tracking through zero plus positive and negative peaks.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 9 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -9 } },
        { type: "sine-voltage-source", refdes: "VIN", props: { amplitudeVolts: 3, frequencyHertz: 100 } },
        { type: "dc-voltage-source", refdes: "VBN", props: { voltageVolts: 0.75 } },
        { type: "dc-voltage-source", refdes: "VBP", props: { voltageVolts: 0.75 } },
        { type: "resistor", refdes: "REN", props: { resistanceOhms: 10 } },
        { type: "resistor", refdes: "REP", props: { resistanceOhms: 10 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
        { type: "npn-transistor", refdes: "QN", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "QP", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "QN", pin: "collector" }] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "QP", pin: "collector" }] },
        { name: "DRIVE", terminals: [{ refdes: "VIN", pin: "positive" }, { refdes: "VBN", pin: "negative" }, { refdes: "VBP", pin: "positive" }] },
        { name: "N_BASE", terminals: [{ refdes: "VBN", pin: "positive" }, { refdes: "QN", pin: "base" }] },
        { name: "P_BASE", terminals: [{ refdes: "VBP", pin: "negative" }, { refdes: "QP", pin: "base" }] },
        { name: "N_EMITTER", terminals: [{ refdes: "QN", pin: "emitter" }, { refdes: "REN", pin: "a" }] },
        { name: "P_EMITTER", terminals: [{ refdes: "QP", pin: "emitter" }, { refdes: "REP", pin: "a" }] },
        { name: "VOUT", terminals: [{ refdes: "REN", pin: "b" }, { refdes: "REP", pin: "b" }, { refdes: "RLOAD", pin: "a" }] },
        { name: "GND", terminals: [{ refdes: "VPOS", pin: "negative" }, { refdes: "VNEG", pin: "negative" }, { refdes: "VIN", pin: "negative" }, { refdes: "RLOAD", pin: "b" }] },
      ],
      analysis: analysis(40, 0.05),
    },
    expected: expected({
      requiredNetNames: ["GND", "DRIVE", "N_BASE", "P_BASE", "N_EMITTER", "P_EMITTER", "VOUT"],
      traces: [
        { signalName: "V(VOUT)", atSeconds: 0.0025, expected: approximate(2.96466, 0.02) },
        { signalName: "V(VOUT)", atSeconds: 0.005, expected: approximate(0, 0.005) },
        { signalName: "V(VOUT)", atSeconds: 0.0075, expected: approximate(-2.96466, 0.02) },
      ],
      traceRanges: [
        { signalName: "V(VOUT)", metric: "maximum", startFraction: 0.5, expected: approximate(2.96466, 0.02) },
        { signalName: "V(VOUT)", metric: "minimum", startFraction: 0.5, expected: approximate(-2.96466, 0.02) },
      ],
    }),
  },
  {
    id: "op-amp-transimpedance-amplifier",
    title: "Op amp transimpedance amplifier",
    prompt:
      "Build a transimpedance amplifier on +/-12 V supplies with output limits of +/-10 V. Inject 0.5 mA from GND into the inverting SUM node, ground the non-inverting input, use 10 kOhm feedback from VOUT to SUM, and load VOUT with 20 kOhm to GND. Preserve SUM and VOUT, simulate, and report the virtual-ground error, the -5 V current-to-voltage conversion, and equal source and feedback currents.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "dc-current-source", refdes: "IIN", props: { currentAmps: 0.0005 } },
        { type: "resistor", refdes: "RF", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 20_000 } },
        { type: "ideal-op-amp-minus-top", refdes: "U1", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "U1", pin: "vPlus" }] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "U1", pin: "vMinus" }] },
        { name: "SUM", terminals: [{ refdes: "IIN", pin: "negative" }, { refdes: "RF", pin: "a" }, { refdes: "U1", pin: "inverting" }] },
        { name: "VOUT", terminals: [{ refdes: "RF", pin: "b" }, { refdes: "RLOAD", pin: "a" }, { refdes: "U1", pin: "output" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "IIN", pin: "positive" },
            { refdes: "U1", pin: "nonInverting" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "SUM", "VOUT"],
      netVoltages: [
        { name: "SUM", expected: approximate(0.00005, 0.000002) },
        { name: "VOUT", expected: approximate(-4.99995, 0.005) },
      ],
      componentMeasurements: [
        { refdes: "IIN", metric: "current", expected: approximate(0.0005, 0.000001) },
        { refdes: "RF", metric: "current", expected: approximate(0.0005, 0.000001) },
      ],
    }),
  },
  {
    id: "bjt-phase-splitter-transient",
    title: "BJT collector-emitter phase splitter",
    prompt:
      "Build a beta-100 NPN phase splitter from 9 V. Superimpose a 20 mV-peak, 100 Hz sine on a 1.5 V DC input bias, feed the base through 10 kOhm, use a 3.3 kOhm collector resistor to 9 V, and a 1 kOhm emitter resistor to GND. Preserve INPUT, BASE, COLLECTOR, and EMITTER, simulate six cycles, and report the inverted collector waveform, non-inverted emitter waveform, their DC operating points, and their unequal swings.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 9 } },
        { type: "dc-voltage-source", refdes: "VBIAS", props: { voltageVolts: 1.5 } },
        { type: "sine-voltage-source", refdes: "VSIGNAL", props: { amplitudeVolts: 0.02, frequencyHertz: 100 } },
        { type: "resistor", refdes: "RB", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RC", props: { resistanceOhms: 3_300 } },
        { type: "resistor", refdes: "RE", props: { resistanceOhms: 1_000 } },
        { type: "npn-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RC", pin: "a" }] },
        { name: "BIAS", terminals: [{ refdes: "VBIAS", pin: "positive" }, { refdes: "VSIGNAL", pin: "negative" }] },
        { name: "INPUT", terminals: [{ refdes: "VSIGNAL", pin: "positive" }, { refdes: "RB", pin: "a" }] },
        { name: "BASE", terminals: [{ refdes: "RB", pin: "b" }, { refdes: "Q1", pin: "base" }] },
        { name: "COLLECTOR", terminals: [{ refdes: "RC", pin: "b" }, { refdes: "Q1", pin: "collector" }] },
        { name: "EMITTER", terminals: [{ refdes: "Q1", pin: "emitter" }, { refdes: "RE", pin: "a" }] },
        { name: "GND", terminals: [{ refdes: "VCC", pin: "negative" }, { refdes: "VBIAS", pin: "negative" }, { refdes: "RE", pin: "b" }] },
      ],
      analysis: analysis(60, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "BASE", "COLLECTOR", "EMITTER"],
      traces: [
        { signalName: "V(INPUT)", atSeconds: 0.0525, expected: approximate(1.52, 0.001) },
        { signalName: "V(COLLECTOR)", atSeconds: 0.0525, expected: approximate(6.56678, 0.005) },
        { signalName: "V(EMITTER)", atSeconds: 0.0525, expected: approximate(0.74435, 0.003) },
        { signalName: "V(INPUT)", atSeconds: 0.0575, expected: approximate(1.48, 0.001) },
        { signalName: "V(COLLECTOR)", atSeconds: 0.0575, expected: approximate(6.6821, 0.005) },
        { signalName: "V(EMITTER)", atSeconds: 0.0575, expected: approximate(0.70907, 0.003) },
      ],
      traceRanges: [
        { signalName: "V(COLLECTOR)", metric: "average", startFraction: 0.5, expected: approximate(6.62445, 0.01) },
        { signalName: "V(COLLECTOR)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.11532, 0.003) },
        { signalName: "V(EMITTER)", metric: "average", startFraction: 0.5, expected: approximate(0.72671, 0.005) },
        { signalName: "V(EMITTER)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.03529, 0.002) },
      ],
    }),
  },
  {
    id: "stacked-zener-reference",
    title: "Stacked Zener voltage reference",
    prompt:
      "Build a stacked Zener reference from 15 V through 680 Ohm. Put two 5.1 V Zener diodes in series from STACK_TOP to GND, cathodes toward the supply, expose their junction as STACK_MID, and load STACK_TOP with 10 kOhm to GND. Simulate and report each diode's reverse voltage, their summed reference voltage, common series current, and remaining load current.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 15 } },
        { type: "resistor", refdes: "RS", props: { resistanceOhms: 680 } },
        { type: "zener-diode", refdes: "DZ1", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "zener-diode", refdes: "DZ2", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 10_000 } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RS", pin: "a" }] },
        { name: "STACK_TOP", terminals: [{ refdes: "RS", pin: "b" }, { refdes: "DZ1", pin: "cathode" }, { refdes: "RLOAD", pin: "a" }] },
        { name: "STACK_MID", terminals: [{ refdes: "DZ1", pin: "anode" }, { refdes: "DZ2", pin: "cathode" }] },
        { name: "GND", terminals: [{ refdes: "VCC", pin: "negative" }, { refdes: "DZ2", pin: "anode" }, { refdes: "RLOAD", pin: "b" }] },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "STACK_TOP", "STACK_MID"],
      netVoltages: [
        { name: "STACK_TOP", expected: approximate(10.40454, 0.02) },
        { name: "STACK_MID", expected: approximate(5.20227, 0.02) },
      ],
      componentMeasurements: [
        { refdes: "DZ1", metric: "voltage", expected: approximate(-5.20227, 0.02) },
        { refdes: "DZ1", metric: "current", expected: approximate(-0.00571757, 0.00002) },
        { refdes: "DZ2", metric: "voltage", expected: approximate(-5.20227, 0.02) },
        { refdes: "DZ2", metric: "current", expected: approximate(-0.00571757, 0.00002) },
        { refdes: "RS", metric: "current", expected: approximate(0.00675802, 0.00002) },
        { refdes: "RLOAD", metric: "current", expected: approximate(0.00104045, 0.00001) },
      ],
    }),
  },
  {
    id: "op-amp-instrumentation-amplifier",
    title: "Three-op-amp instrumentation amplifier",
    prompt:
      "Build a three-op-amp instrumentation amplifier on +/-12 V supplies with gain-100000 devices limited to +/-10 V. Drive INPUT_P at 2.05 V and INPUT_N at 1.95 V. Use 10 kOhm feedback resistors around the two input amplifiers and a 10 kOhm resistor between their inverting nodes for first-stage differential gain 3. Feed their outputs into a difference amplifier with 10 kOhm input resistors and 20 kOhm feedback/reference resistors for another gain of 2, then load INA_OUT with 20 kOhm. Preserve both inputs, first-stage outputs, and INA_OUT, simulate, and report rejection of the 2 V common-mode level plus the approximately 0.6 V differential output.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "dc-voltage-source", refdes: "VINP", props: { voltageVolts: 2.05 } },
        { type: "dc-voltage-source", refdes: "VINN", props: { voltageVolts: 1.95 } },
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
        { name: "INPUT_P", terminals: [{ refdes: "VINP", pin: "positive" }, { refdes: "UP", pin: "nonInverting" }] },
        { name: "INPUT_N", terminals: [{ refdes: "VINN", pin: "positive" }, { refdes: "UN", pin: "nonInverting" }] },
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
            { refdes: "VINP", pin: "negative" },
            { refdes: "VINN", pin: "negative" },
            { refdes: "RREF", pin: "b" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT_P", "INPUT_N", "FIRST_P", "FIRST_N", "INA_OUT"],
      netVoltages: [
        { name: "FIRST_P", expected: approximate(2.14998, 0.005) },
        { name: "FIRST_N", expected: approximate(1.84998, 0.005) },
        { name: "INA_OUT", expected: approximate(0.59996, 0.005) },
      ],
      componentMeasurements: [
        { refdes: "RGAIN", metric: "current", expected: approximate(0.00001, 0.000001) },
        { refdes: "RLOAD", metric: "current", expected: approximate(0.00003, 0.000001) },
      ],
    }),
  },
  {
    id: "bjt-emitter-bypass-transient",
    title: "Capacitor-bypassed BJT common-emitter amplifier",
    prompt:
      "Build a beta-100 NPN common-emitter amplifier from 9 V. Superimpose a 10 mV-peak, 100 Hz sine on a 1.5 V DC input bias through 10 kOhm, use 3.3 kOhm from 9 V to the collector and 1 kOhm from emitter to GND, then bypass the emitter resistor with 10 uF. Preserve INPUT, BASE, EMITTER, and COLLECTOR, simulate ten cycles, and report the settled DC bias, reduced emitter AC swing, increased inverted collector gain, and phase.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 9 } },
        { type: "dc-voltage-source", refdes: "VBIAS", props: { voltageVolts: 1.5 } },
        { type: "sine-voltage-source", refdes: "VSIGNAL", props: { amplitudeVolts: 0.01, frequencyHertz: 100 } },
        { type: "resistor", refdes: "RB", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RC", props: { resistanceOhms: 3_300 } },
        { type: "resistor", refdes: "RE", props: { resistanceOhms: 1_000 } },
        { type: "capacitor", refdes: "CE", props: { capacitanceFarads: 0.00001 } },
        { type: "npn-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RC", pin: "a" }] },
        { name: "BIAS", terminals: [{ refdes: "VBIAS", pin: "positive" }, { refdes: "VSIGNAL", pin: "negative" }] },
        { name: "INPUT", terminals: [{ refdes: "VSIGNAL", pin: "positive" }, { refdes: "RB", pin: "a" }] },
        { name: "BASE", terminals: [{ refdes: "RB", pin: "b" }, { refdes: "Q1", pin: "base" }] },
        { name: "COLLECTOR", terminals: [{ refdes: "RC", pin: "b" }, { refdes: "Q1", pin: "collector" }] },
        { name: "EMITTER", terminals: [{ refdes: "Q1", pin: "emitter" }, { refdes: "RE", pin: "a" }, { refdes: "CE", pin: "a" }] },
        { name: "GND", terminals: [{ refdes: "VCC", pin: "negative" }, { refdes: "VBIAS", pin: "negative" }, { refdes: "RE", pin: "b" }, { refdes: "CE", pin: "b" }] },
      ],
      analysis: analysis(100, 0.05),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "BASE", "EMITTER", "COLLECTOR"],
      traces: [
        { signalName: "V(COLLECTOR)", atSeconds: 0.0925, expected: approximate(6.51942, 0.01) },
        { signalName: "V(COLLECTOR)", atSeconds: 0.0975, expected: approximate(6.72981, 0.01) },
      ],
      traceRanges: [
        { signalName: "V(INPUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.02, 0.001) },
        { signalName: "V(EMITTER)", metric: "average", startFraction: 0.5, expected: approximate(0.72672, 0.005) },
        { signalName: "V(EMITTER)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.01421, 0.002) },
        { signalName: "V(COLLECTOR)", metric: "average", startFraction: 0.5, expected: approximate(6.6244, 0.01) },
        { signalName: "V(COLLECTOR)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.29548, 0.01) },
      ],
    }),
  },
  {
    id: "stacked-zener-midpoint-load",
    title: "Midpoint-loaded stacked Zener reference",
    prompt:
      "Build a 15 V reference through 330 Ohm into two series 5.1 V Zeners, cathodes toward the supply. Load STACK_TOP with 10 kOhm and the inter-diode STACK_MID node with 2 kOhm, both to GND. Preserve STACK_TOP and STACK_MID, simulate, and report the two breakdown drops, unequal upper and lower avalanche currents caused by the midpoint load, feed current, and both load currents.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 15 } },
        { type: "resistor", refdes: "RS", props: { resistanceOhms: 330 } },
        { type: "zener-diode", refdes: "DZ1", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "zener-diode", refdes: "DZ2", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "resistor", refdes: "RTOP", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RMID", props: { resistanceOhms: 2_000 } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RS", pin: "a" }] },
        { name: "STACK_TOP", terminals: [{ refdes: "RS", pin: "b" }, { refdes: "DZ1", pin: "cathode" }, { refdes: "RTOP", pin: "a" }] },
        { name: "STACK_MID", terminals: [{ refdes: "DZ1", pin: "anode" }, { refdes: "DZ2", pin: "cathode" }, { refdes: "RMID", pin: "a" }] },
        { name: "GND", terminals: [{ refdes: "VCC", pin: "negative" }, { refdes: "DZ2", pin: "anode" }, { refdes: "RTOP", pin: "b" }, { refdes: "RMID", pin: "b" }] },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "STACK_TOP", "STACK_MID"],
      netVoltages: [
        { name: "STACK_TOP", expected: approximate(10.54678, 0.02) },
        { name: "STACK_MID", expected: approximate(5.25718, 0.02) },
      ],
      componentMeasurements: [
        { refdes: "DZ1", metric: "voltage", expected: approximate(-5.2896, 0.02) },
        { refdes: "DZ1", metric: "current", expected: approximate(-0.01243993, 0.00003) },
        { refdes: "DZ2", metric: "voltage", expected: approximate(-5.25718, 0.02) },
        { refdes: "DZ2", metric: "current", expected: approximate(-0.00981134, 0.00003) },
        { refdes: "RS", metric: "current", expected: approximate(0.01349461, 0.00003) },
        { refdes: "RTOP", metric: "current", expected: approximate(0.00105468, 0.00001) },
        { refdes: "RMID", metric: "current", expected: approximate(0.00262859, 0.00002) },
      ],
    }),
  },
  {
    id: "op-amp-diode-logarithmic-amplifier",
    title: "Diode-feedback op amp logarithmic amplifier",
    prompt:
      "Build a diode-feedback logarithmic amplifier on +/-12 V supplies with a gain-100000 ideal op amp limited to +/-10 V. Drive INPUT from 1 V through 10 kOhm into the inverting SUM node, ground the non-inverting input, and place a DDEFAULT diode from SUM anode to LOG_OUT cathode so its forward voltage closes the feedback loop. Load LOG_OUT with 100 kOhm to GND. Preserve INPUT, SUM, and LOG_OUT, simulate, and report the approximately 100 uA input/diode current, virtual-ground error, forward diode drop, and negative logarithmic output.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "dc-voltage-source", refdes: "VIN", props: { voltageVolts: 1 } },
        { type: "resistor", refdes: "RIN", props: { resistanceOhms: 10_000 } },
        { type: "diode", refdes: "D1", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 100_000 } },
        { type: "ideal-op-amp-minus-top", refdes: "U1", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "U1", pin: "vPlus" }] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "U1", pin: "vMinus" }] },
        { name: "INPUT", terminals: [{ refdes: "VIN", pin: "positive" }, { refdes: "RIN", pin: "a" }] },
        { name: "SUM", terminals: [{ refdes: "RIN", pin: "b" }, { refdes: "D1", pin: "anode" }, { refdes: "U1", pin: "inverting" }] },
        { name: "LOG_OUT", terminals: [{ refdes: "D1", pin: "cathode" }, { refdes: "U1", pin: "output" }, { refdes: "RLOAD", pin: "a" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VIN", pin: "negative" },
            { refdes: "U1", pin: "nonInverting" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "SUM", "LOG_OUT"],
      netVoltages: [
        { name: "SUM", expected: approximate(0.000005956, 0.000001) },
        { name: "LOG_OUT", expected: approximate(-0.595556, 0.002) },
      ],
      componentMeasurements: [
        { refdes: "RIN", metric: "current", expected: approximate(0.0000999994, 0.0000001) },
        { refdes: "D1", metric: "current", expected: approximate(0.0000999994, 0.0000001) },
        { refdes: "D1", metric: "voltage", expected: approximate(0.595562, 0.002) },
      ],
    }),
  },
  {
    id: "bjt-partially-bypassed-emitter-transient",
    title: "Partially bypassed BJT emitter degeneration",
    prompt:
      "Build a beta-100 NPN common-emitter amplifier from 9 V. Superimpose a 10 mV-peak, 100 Hz sine on a 1.5 V DC input through 10 kOhm and use 3.3 kOhm from 9 V to the collector. Split the emitter path into 100 Ohm from EMITTER to EMITTER_TAP and 900 Ohm from EMITTER_TAP to GND, then place 10 uF only across the 900 Ohm resistor. Preserve INPUT, EMITTER, EMITTER_TAP, and COLLECTOR, simulate settled cycles, and report unchanged DC bias together with intermediate inverted gain: larger than full 1 kOhm degeneration but smaller than bypassing the entire emitter resistance.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 9 } },
        { type: "dc-voltage-source", refdes: "VBIAS", props: { voltageVolts: 1.5 } },
        { type: "sine-voltage-source", refdes: "VSIGNAL", props: { amplitudeVolts: 0.01, frequencyHertz: 100 } },
        { type: "resistor", refdes: "RB", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RC", props: { resistanceOhms: 3_300 } },
        { type: "resistor", refdes: "RE_FIXED", props: { resistanceOhms: 100 } },
        { type: "resistor", refdes: "RE_BYPASS", props: { resistanceOhms: 900 } },
        { type: "capacitor", refdes: "CE", props: { capacitanceFarads: 0.00001 } },
        { type: "npn-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RC", pin: "a" }] },
        { name: "BIAS", terminals: [{ refdes: "VBIAS", pin: "positive" }, { refdes: "VSIGNAL", pin: "negative" }] },
        { name: "INPUT", terminals: [{ refdes: "VSIGNAL", pin: "positive" }, { refdes: "RB", pin: "a" }] },
        { name: "BASE", terminals: [{ refdes: "RB", pin: "b" }, { refdes: "Q1", pin: "base" }] },
        { name: "COLLECTOR", terminals: [{ refdes: "RC", pin: "b" }, { refdes: "Q1", pin: "collector" }] },
        { name: "EMITTER", terminals: [{ refdes: "Q1", pin: "emitter" }, { refdes: "RE_FIXED", pin: "a" }] },
        { name: "EMITTER_TAP", terminals: [{ refdes: "RE_FIXED", pin: "b" }, { refdes: "RE_BYPASS", pin: "a" }, { refdes: "CE", pin: "a" }] },
        { name: "GND", terminals: [{ refdes: "VCC", pin: "negative" }, { refdes: "VBIAS", pin: "negative" }, { refdes: "RE_BYPASS", pin: "b" }, { refdes: "CE", pin: "b" }] },
      ],
      analysis: analysis(60, 0.1),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "EMITTER", "EMITTER_TAP", "COLLECTOR"],
      traces: [
        { signalName: "V(COLLECTOR)", atSeconds: 0.0525, expected: approximate(6.5315, 0.01) },
        { signalName: "V(COLLECTOR)", atSeconds: 0.0575, expected: approximate(6.7173, 0.01) },
      ],
      traceRanges: [
        { signalName: "V(INPUT)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.02, 0.001) },
        { signalName: "V(EMITTER)", metric: "average", startFraction: 0.5, expected: approximate(0.726715, 0.005) },
        { signalName: "V(EMITTER)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.01322, 0.002) },
        { signalName: "V(EMITTER_TAP)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.01036, 0.002) },
        { signalName: "V(COLLECTOR)", metric: "average", startFraction: 0.5, expected: approximate(6.62442, 0.01) },
        { signalName: "V(COLLECTOR)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.21596, 0.01) },
      ],
    }),
  },
  {
    id: "zener-capacitor-ripple-filter",
    title: "Capacitively filtered Zener ripple reference",
    prompt:
      "Build a 5.1 V Zener reference from a 9 V supply carrying a 1 V-peak, 1 kHz series ripple. Feed FILTERED_REF through 330 Ohm, load it with 2 kOhm to GND, and place 100 uF across the reverse-biased Zener and load. Preserve RIPPLE_SUPPLY and FILTERED_REF, simulate settled cycles, and report the DC reference, feed/load currents, and the capacitor-suppressed output ripple relative to the 2 V peak-to-peak supply ripple.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VDC", props: { voltageVolts: 9 } },
        { type: "sine-voltage-source", refdes: "VRIPPLE", props: { amplitudeVolts: 1, frequencyHertz: 1_000 } },
        { type: "resistor", refdes: "RS", props: { resistanceOhms: 330 } },
        { type: "zener-diode", refdes: "DZ1", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 2_000 } },
        { type: "capacitor", refdes: "CFILTER", props: { capacitanceFarads: 0.0001 } },
      ],
      nets: [
        { name: "DC_BIAS", terminals: [{ refdes: "VDC", pin: "positive" }, { refdes: "VRIPPLE", pin: "negative" }] },
        { name: "RIPPLE_SUPPLY", terminals: [{ refdes: "VRIPPLE", pin: "positive" }, { refdes: "RS", pin: "a" }] },
        { name: "FILTERED_REF", terminals: [{ refdes: "RS", pin: "b" }, { refdes: "DZ1", pin: "cathode" }, { refdes: "RLOAD", pin: "a" }, { refdes: "CFILTER", pin: "a" }] },
        { name: "GND", terminals: [{ refdes: "VDC", pin: "negative" }, { refdes: "DZ1", pin: "anode" }, { refdes: "RLOAD", pin: "b" }, { refdes: "CFILTER", pin: "b" }] },
      ],
      analysis: analysis(10, 0.01),
    },
    expected: expected({
      requiredNetNames: ["GND", "RIPPLE_SUPPLY", "FILTERED_REF"],
      componentMeasurements: [
        { refdes: "RS", metric: "current", expected: approximate(0.011397, 0.00005) },
        { refdes: "RLOAD", metric: "current", expected: approximate(0.00261949, 0.00002) },
        { refdes: "DZ1", metric: "current", expected: approximate(-0.00839559, 0.00005) },
      ],
      traceRanges: [
        { signalName: "V(RIPPLE_SUPPLY)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(2, 0.005) },
        { signalName: "V(FILTERED_REF)", metric: "average", startFraction: 0.5, expected: approximate(5.24375, 0.01) },
        { signalName: "V(FILTERED_REF)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.009619, 0.002) },
      ],
    }),
  },
  {
    id: "op-amp-diode-antilogarithmic-amplifier",
    title: "Diode-input op amp antilogarithmic amplifier",
    prompt:
      "Build a diode-input antilogarithmic amplifier on +/-12 V supplies with a gain-100000 ideal op amp limited to +/-10 V. Set INPUT to 0.59556 V, connect a DDEFAULT diode from INPUT anode to the inverting SUM cathode, ground the non-inverting input, and use 10 kOhm feedback from SUM to ANTILOG_OUT with a 100 kOhm output load. Preserve INPUT, SUM, and ANTILOG_OUT, simulate, and report the diode voltage/current, virtual-ground error, and approximately -1 V output produced by exponential junction current through the linear feedback resistor.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "dc-voltage-source", refdes: "VIN", props: { voltageVolts: 0.59556 } },
        { type: "diode", refdes: "D1", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "resistor", refdes: "RF", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 100_000 } },
        { type: "ideal-op-amp-minus-top", refdes: "U1", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "U1", pin: "vPlus" }] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "U1", pin: "vMinus" }] },
        { name: "INPUT", terminals: [{ refdes: "VIN", pin: "positive" }, { refdes: "D1", pin: "anode" }] },
        { name: "SUM", terminals: [{ refdes: "D1", pin: "cathode" }, { refdes: "RF", pin: "a" }, { refdes: "U1", pin: "inverting" }] },
        { name: "ANTILOG_OUT", terminals: [{ refdes: "RF", pin: "b" }, { refdes: "U1", pin: "output" }, { refdes: "RLOAD", pin: "a" }] },
        {
          name: "GND",
          terminals: [
            { refdes: "VPOS", pin: "negative" },
            { refdes: "VNEG", pin: "negative" },
            { refdes: "VIN", pin: "negative" },
            { refdes: "U1", pin: "nonInverting" },
            { refdes: "RLOAD", pin: "b" },
          ],
        },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "SUM", "ANTILOG_OUT"],
      netVoltages: [
        { name: "SUM", expected: approximate(0.0000101668, 0.000001) },
        { name: "ANTILOG_OUT", expected: approximate(-1.01668, 0.003) },
      ],
      componentMeasurements: [
        { refdes: "D1", metric: "voltage", expected: approximate(0.59599, 0.001) },
        { refdes: "D1", metric: "current", expected: approximate(0.000101669, 0.0000003) },
        { refdes: "RF", metric: "current", expected: approximate(0.000101669, 0.0000003) },
      ],
    }),
  },
  {
    id: "bjt-widlar-current-source",
    title: "Emitter-degenerated Widlar current source",
    prompt:
      "Build a beta-100 two-NPN Widlar current source from 9 V. Feed a diode-connected reference transistor through 4.7 kOhm, tie the output transistor base to the reference base, place 1 kOhm from the output transistor emitter to GND, and connect its collector to 9 V through a 1 kOhm load. Preserve MIRROR_BASE, WIDLAR_EMITTER, and WIDLAR_OUT, simulate, and report reference current, reduced output current, emitter voltage, base-emitter voltages, and forward-active headroom.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 9 } },
        { type: "resistor", refdes: "RREF", props: { resistanceOhms: 4_700 } },
        { type: "resistor", refdes: "RE", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 1_000 } },
        { type: "npn-transistor", refdes: "QREF", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "QOUT", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RREF", pin: "a" }, { refdes: "RLOAD", pin: "a" }] },
        { name: "MIRROR_BASE", terminals: [{ refdes: "RREF", pin: "b" }, { refdes: "QREF", pin: "base" }, { refdes: "QREF", pin: "collector" }, { refdes: "QOUT", pin: "base" }] },
        { name: "WIDLAR_OUT", terminals: [{ refdes: "RLOAD", pin: "b" }, { refdes: "QOUT", pin: "collector" }] },
        { name: "WIDLAR_EMITTER", terminals: [{ refdes: "QOUT", pin: "emitter" }, { refdes: "RE", pin: "a" }] },
        { name: "GND", terminals: [{ refdes: "VCC", pin: "negative" }, { refdes: "QREF", pin: "emitter" }, { refdes: "RE", pin: "b" }] },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "MIRROR_BASE", "WIDLAR_EMITTER", "WIDLAR_OUT"],
      netVoltages: [
        { name: "MIRROR_BASE", expected: approximate(0.729024, 0.005) },
        { name: "WIDLAR_EMITTER", expected: approximate(0.0814785, 0.002) },
        { name: "WIDLAR_OUT", expected: approximate(8.91927, 0.005) },
      ],
      componentMeasurements: [
        { refdes: "RREF", metric: "current", expected: approximate(0.00175978, 0.000005) },
        { refdes: "RLOAD", metric: "current", expected: approximate(0.0000807323, 0.000001) },
      ],
    }),
  },
  {
    id: "zener-dynamic-resistance-ripple",
    title: "High-dynamic-resistance Zener ripple response",
    prompt:
      "Build a 5.1 V Zener shunt reference from a 9 V supply carrying 1 V-peak, 1 kHz series ripple. Use a Zener dynamic resistance of 100 Ohm, feed SOFT_REF through 330 Ohm, and load it with 2 kOhm to GND. Preserve RIPPLE_SUPPLY and SOFT_REF, simulate settled cycles, and report its average reference level and ripple transfer, demonstrating that finite avalanche slope permits more output ripple than an otherwise stiff ideal reference.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VDC", props: { voltageVolts: 9 } },
        { type: "sine-voltage-source", refdes: "VRIPPLE", props: { amplitudeVolts: 1, frequencyHertz: 1_000 } },
        { type: "resistor", refdes: "RS", props: { resistanceOhms: 330 } },
        { type: "zener-diode", refdes: "DZ1", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 100 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 2_000 } },
      ],
      nets: [
        { name: "DC_BIAS", terminals: [{ refdes: "VDC", pin: "positive" }, { refdes: "VRIPPLE", pin: "negative" }] },
        { name: "RIPPLE_SUPPLY", terminals: [{ refdes: "VRIPPLE", pin: "positive" }, { refdes: "RS", pin: "a" }] },
        { name: "SOFT_REF", terminals: [{ refdes: "RS", pin: "b" }, { refdes: "DZ1", pin: "cathode" }, { refdes: "RLOAD", pin: "a" }] },
        { name: "GND", terminals: [{ refdes: "VDC", pin: "negative" }, { refdes: "DZ1", pin: "anode" }, { refdes: "RLOAD", pin: "b" }] },
      ],
      analysis: analysis(10, 0.01),
    },
    expected: expected({
      requiredNetNames: ["GND", "RIPPLE_SUPPLY", "SOFT_REF"],
      traceRanges: [
        { signalName: "V(RIPPLE_SUPPLY)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(2, 0.005) },
        { signalName: "V(SOFT_REF)", metric: "average", startFraction: 0.5, expected: approximate(5.82088, 0.01) },
        { signalName: "V(SOFT_REF)", metric: "peakToPeak", startFraction: 0.5, expected: approximate(0.461018, 0.005) },
      ],
    }),
  },
  {
    id: "bjt-early-effect-collector-voltage",
    title: "BJT Early-effect collector-voltage comparison",
    prompt:
      "Build two beta-100 NPN transistors with their emitters at GND and bases held together at 0.7 V. Bias QLOW's collector from 3 V through 10 Ohm and QHIGH's collector from 9 V through 10 Ohm. Preserve SHARED_BASE, LOW_COLLECTOR, and HIGH_COLLECTOR, simulate, and report both collector currents and collector voltages, demonstrating the finite-output-resistance Early effect: the higher-VCE device conducts measurably more current despite identical VBE.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VBASE", props: { voltageVolts: 0.7 } },
        { type: "dc-voltage-source", refdes: "VLOW", props: { voltageVolts: 3 } },
        { type: "dc-voltage-source", refdes: "VHIGH", props: { voltageVolts: 9 } },
        { type: "resistor", refdes: "RLOW", props: { resistanceOhms: 10 } },
        { type: "resistor", refdes: "RHIGH", props: { resistanceOhms: 10 } },
        { type: "npn-transistor", refdes: "QLOW", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "QHIGH", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "LOW_SUPPLY", terminals: [{ refdes: "VLOW", pin: "positive" }, { refdes: "RLOW", pin: "a" }] },
        { name: "HIGH_SUPPLY", terminals: [{ refdes: "VHIGH", pin: "positive" }, { refdes: "RHIGH", pin: "a" }] },
        { name: "SHARED_BASE", terminals: [{ refdes: "VBASE", pin: "positive" }, { refdes: "QLOW", pin: "base" }, { refdes: "QHIGH", pin: "base" }] },
        { name: "LOW_COLLECTOR", terminals: [{ refdes: "RLOW", pin: "b" }, { refdes: "QLOW", pin: "collector" }] },
        { name: "HIGH_COLLECTOR", terminals: [{ refdes: "RHIGH", pin: "b" }, { refdes: "QHIGH", pin: "collector" }] },
        { name: "GND", terminals: [{ refdes: "VBASE", pin: "negative" }, { refdes: "VLOW", pin: "negative" }, { refdes: "VHIGH", pin: "negative" }, { refdes: "QLOW", pin: "emitter" }, { refdes: "QHIGH", pin: "emitter" }] },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "SHARED_BASE", "LOW_COLLECTOR", "HIGH_COLLECTOR"],
      netVoltages: [
        { name: "LOW_COLLECTOR", expected: approximate(2.9942, 0.002) },
        { name: "HIGH_COLLECTOR", expected: approximate(8.99386, 0.002) },
      ],
      componentMeasurements: [
        { refdes: "RLOW", metric: "current", expected: approximate(0.000580044, 0.000001) },
        { refdes: "RHIGH", metric: "current", expected: approximate(0.000614064, 0.000001) },
      ],
    }),
  },
  {
    id: "zener-dynamic-resistance-load-line",
    title: "Zener dynamic-resistance load-line comparison",
    prompt:
      "Build two unloaded 5.1 V Zener shunt branches from the same 9 V supply. Give both Zeners 50 Ohm dynamic resistance, feed LOW_CURRENT_REF through 1 kOhm, and feed HIGH_CURRENT_REF through 330 Ohm. Preserve both reference nets, simulate, and report their feed currents and voltages, demonstrating that the incremental voltage rise divided by the incremental reverse current is approximately the modeled 50 Ohm avalanche slope.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 9 } },
        { type: "resistor", refdes: "RLOW", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RHIGH", props: { resistanceOhms: 330 } },
        { type: "zener-diode", refdes: "DZLOW", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 50 } },
        { type: "zener-diode", refdes: "DZHIGH", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 50 } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RLOW", pin: "a" }, { refdes: "RHIGH", pin: "a" }] },
        { name: "LOW_CURRENT_REF", terminals: [{ refdes: "RLOW", pin: "b" }, { refdes: "DZLOW", pin: "cathode" }] },
        { name: "HIGH_CURRENT_REF", terminals: [{ refdes: "RHIGH", pin: "b" }, { refdes: "DZHIGH", pin: "cathode" }] },
        { name: "GND", terminals: [{ refdes: "VCC", pin: "negative" }, { refdes: "DZLOW", pin: "anode" }, { refdes: "DZHIGH", pin: "anode" }] },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "LOW_CURRENT_REF", "HIGH_CURRENT_REF"],
      netVoltages: [
        { name: "LOW_CURRENT_REF", expected: approximate(5.31782, 0.002) },
        { name: "HIGH_CURRENT_REF", expected: approximate(5.66511, 0.002) },
      ],
      componentMeasurements: [
        { refdes: "RLOW", metric: "current", expected: approximate(0.00368218, 0.000002) },
        { refdes: "RHIGH", metric: "current", expected: approximate(0.0101057, 0.000002) },
      ],
    }),
  },
  {
    id: "op-amp-log-antilog-recovery-chain",
    title: "Matched log-antilog op amp recovery chain",
    prompt:
      "Build a three-op-amp nonlinear recovery chain on +/-12 V supplies using gain-100000 ideal op amps limited to +/-10 V and matched DDEFAULT diodes. First make a 10 kOhm-input diode-feedback logarithmic amplifier for a 1 V DC INPUT. Unity-invert its negative LOG_OUT with two 10 kOhm resistors, then drive a diode-input antilogarithmic amplifier with 10 kOhm feedback. Load RECOVERED with 100 kOhm to GND. Preserve INPUT, LOG_SUM, LOG_OUT, INVERT_SUM, EXP_INPUT, ANTILOG_SUM, and RECOVERED; simulate and report virtual-ground errors, the logarithmic intermediate voltage, and approximately -1 V recovered output.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VPOS", props: { voltageVolts: 12 } },
        { type: "dc-voltage-source", refdes: "VNEG", props: { voltageVolts: -12 } },
        { type: "dc-voltage-source", refdes: "VIN", props: { voltageVolts: 1 } },
        { type: "resistor", refdes: "RLOG_IN", props: { resistanceOhms: 10_000 } },
        { type: "diode", refdes: "DLOG", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "resistor", refdes: "RINV_IN", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RINV_FB", props: { resistanceOhms: 10_000 } },
        { type: "diode", refdes: "DEXP", props: { model: "DDEFAULT", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 } },
        { type: "resistor", refdes: "RANTI_FB", props: { resistanceOhms: 10_000 } },
        { type: "resistor", refdes: "RLOAD", props: { resistanceOhms: 100_000 } },
        { type: "ideal-op-amp-minus-top", refdes: "ULOG", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
        { type: "ideal-op-amp-minus-top", refdes: "UINV", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
        { type: "ideal-op-amp-minus-top", refdes: "UANTI", props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 } },
      ],
      nets: [
        { name: "VPLUS", terminals: [{ refdes: "VPOS", pin: "positive" }, { refdes: "ULOG", pin: "vPlus" }, { refdes: "UINV", pin: "vPlus" }, { refdes: "UANTI", pin: "vPlus" }] },
        { name: "VMINUS", terminals: [{ refdes: "VNEG", pin: "positive" }, { refdes: "ULOG", pin: "vMinus" }, { refdes: "UINV", pin: "vMinus" }, { refdes: "UANTI", pin: "vMinus" }] },
        { name: "INPUT", terminals: [{ refdes: "VIN", pin: "positive" }, { refdes: "RLOG_IN", pin: "a" }] },
        { name: "LOG_SUM", terminals: [{ refdes: "RLOG_IN", pin: "b" }, { refdes: "DLOG", pin: "anode" }, { refdes: "ULOG", pin: "inverting" }] },
        { name: "LOG_OUT", terminals: [{ refdes: "DLOG", pin: "cathode" }, { refdes: "ULOG", pin: "output" }, { refdes: "RINV_IN", pin: "a" }] },
        { name: "INVERT_SUM", terminals: [{ refdes: "RINV_IN", pin: "b" }, { refdes: "RINV_FB", pin: "a" }, { refdes: "UINV", pin: "inverting" }] },
        { name: "EXP_INPUT", terminals: [{ refdes: "RINV_FB", pin: "b" }, { refdes: "UINV", pin: "output" }, { refdes: "DEXP", pin: "anode" }] },
        { name: "ANTILOG_SUM", terminals: [{ refdes: "DEXP", pin: "cathode" }, { refdes: "RANTI_FB", pin: "a" }, { refdes: "UANTI", pin: "inverting" }] },
        { name: "RECOVERED", terminals: [{ refdes: "RANTI_FB", pin: "b" }, { refdes: "UANTI", pin: "output" }, { refdes: "RLOAD", pin: "a" }] },
        { name: "GND", terminals: [{ refdes: "VPOS", pin: "negative" }, { refdes: "VNEG", pin: "negative" }, { refdes: "VIN", pin: "negative" }, { refdes: "ULOG", pin: "nonInverting" }, { refdes: "UINV", pin: "nonInverting" }, { refdes: "UANTI", pin: "nonInverting" }, { refdes: "RLOAD", pin: "b" }] },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "INPUT", "LOG_SUM", "LOG_OUT", "INVERT_SUM", "EXP_INPUT", "ANTILOG_SUM", "RECOVERED"],
      netVoltages: [
        { name: "LOG_SUM", expected: approximate(0.000005956, 0.000001) },
        { name: "LOG_OUT", expected: approximate(-0.595556, 0.001) },
        { name: "INVERT_SUM", expected: approximate(-0.000005955, 0.000001) },
        { name: "EXP_INPUT", expected: approximate(0.595544, 0.001) },
        { name: "ANTILOG_SUM", expected: approximate(0.000009989, 0.000001) },
        { name: "RECOVERED", expected: approximate(-0.998908, 0.002) },
      ],
      componentMeasurements: [
        { refdes: "RLOG_IN", metric: "current", expected: approximate(0.0000999994, 0.0000002) },
        { refdes: "DLOG", metric: "current", expected: approximate(0.0000999994, 0.0000002) },
        { refdes: "DEXP", metric: "current", expected: approximate(0.0000998918, 0.0000002) },
        { refdes: "RANTI_FB", metric: "current", expected: approximate(0.0000998918, 0.0000002) },
      ],
    }),
  },
  {
    id: "bjt-early-voltage-output-resistance",
    title: "BJT Early-voltage output-resistance comparison",
    prompt:
      "Build four beta-100 NPN branches with their emitters at GND and bases held together at 0.7 V. Give Q50_LOW and Q50_HIGH an Early voltage of 50 V, and Q200_LOW and Q200_HIGH an Early voltage of 200 V. Feed the LOW collectors from 3 V through separate 10 Ohm resistors and the HIGH collectors from 9 V through separate 10 Ohm resistors. Preserve all four collector nets and SHARED_BASE, simulate, and demonstrate that the 200 V devices have substantially higher output resistance: their collector current changes less across the same 6 V collector-voltage step.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VBASE", props: { voltageVolts: 0.7 } },
        { type: "dc-voltage-source", refdes: "VLOW", props: { voltageVolts: 3 } },
        { type: "dc-voltage-source", refdes: "VHIGH", props: { voltageVolts: 9 } },
        { type: "resistor", refdes: "R50_LOW", props: { resistanceOhms: 10 } },
        { type: "resistor", refdes: "R50_HIGH", props: { resistanceOhms: 10 } },
        { type: "resistor", refdes: "R200_LOW", props: { resistanceOhms: 10 } },
        { type: "resistor", refdes: "R200_HIGH", props: { resistanceOhms: 10 } },
        { type: "npn-transistor", refdes: "Q50_LOW", props: { beta: 100, earlyVoltageVolts: 50, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "Q50_HIGH", props: { beta: 100, earlyVoltageVolts: 50, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "Q200_LOW", props: { beta: 100, earlyVoltageVolts: 200, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "Q200_HIGH", props: { beta: 100, earlyVoltageVolts: 200, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "LOW_SUPPLY", terminals: [{ refdes: "VLOW", pin: "positive" }, { refdes: "R50_LOW", pin: "a" }, { refdes: "R200_LOW", pin: "a" }] },
        { name: "HIGH_SUPPLY", terminals: [{ refdes: "VHIGH", pin: "positive" }, { refdes: "R50_HIGH", pin: "a" }, { refdes: "R200_HIGH", pin: "a" }] },
        { name: "SHARED_BASE", terminals: [{ refdes: "VBASE", pin: "positive" }, { refdes: "Q50_LOW", pin: "base" }, { refdes: "Q50_HIGH", pin: "base" }, { refdes: "Q200_LOW", pin: "base" }, { refdes: "Q200_HIGH", pin: "base" }] },
        { name: "VAF50_LOW", terminals: [{ refdes: "R50_LOW", pin: "b" }, { refdes: "Q50_LOW", pin: "collector" }] },
        { name: "VAF50_HIGH", terminals: [{ refdes: "R50_HIGH", pin: "b" }, { refdes: "Q50_HIGH", pin: "collector" }] },
        { name: "VAF200_LOW", terminals: [{ refdes: "R200_LOW", pin: "b" }, { refdes: "Q200_LOW", pin: "collector" }] },
        { name: "VAF200_HIGH", terminals: [{ refdes: "R200_HIGH", pin: "b" }, { refdes: "Q200_HIGH", pin: "collector" }] },
        { name: "GND", terminals: [{ refdes: "VBASE", pin: "negative" }, { refdes: "VLOW", pin: "negative" }, { refdes: "VHIGH", pin: "negative" }, { refdes: "Q50_LOW", pin: "emitter" }, { refdes: "Q50_HIGH", pin: "emitter" }, { refdes: "Q200_LOW", pin: "emitter" }, { refdes: "Q200_HIGH", pin: "emitter" }] },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "SHARED_BASE", "VAF50_LOW", "VAF50_HIGH", "VAF200_LOW", "VAF200_HIGH"],
      netVoltages: [
        { name: "VAF50_LOW", expected: approximate(2.994069, 0.002) },
        { name: "VAF50_HIGH", expected: approximate(8.993389, 0.002) },
        { name: "VAF200_LOW", expected: approximate(2.994265, 0.002) },
        { name: "VAF200_HIGH", expected: approximate(8.994095, 0.002) },
      ],
      componentMeasurements: [
        { refdes: "R50_LOW", metric: "current", expected: approximate(0.000593051, 0.000001) },
        { refdes: "R50_HIGH", metric: "current", expected: approximate(0.000661087, 0.000001) },
        { refdes: "R200_LOW", metric: "current", expected: approximate(0.000573539, 0.000001) },
        { refdes: "R200_HIGH", metric: "current", expected: approximate(0.00059055, 0.000001) },
      ],
    }),
  },
  {
    id: "bjt-base-emitter-exponential-current",
    title: "BJT base-emitter exponential current sweep",
    prompt:
      "Build three beta-100, 100 V-Early-voltage NPN branches from one 5 V collector supply, each through its own 100 Ohm sense resistor with the emitter at GND. Hold their bases at 0.64 V, 0.66 V, and 0.68 V using separate ideal sources. Preserve BASE_640, BASE_660, BASE_680 and COLLECTOR_640, COLLECTOR_660, COLLECTOR_680. Simulate and report every collector current, demonstrating that equal 20 mV VBE steps produce approximately equal multiplicative current ratios rather than equal current increments while all devices remain forward-active.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 5 } },
        { type: "dc-voltage-source", refdes: "VB640", props: { voltageVolts: 0.64 } },
        { type: "dc-voltage-source", refdes: "VB660", props: { voltageVolts: 0.66 } },
        { type: "dc-voltage-source", refdes: "VB680", props: { voltageVolts: 0.68 } },
        { type: "resistor", refdes: "R640", props: { resistanceOhms: 100 } },
        { type: "resistor", refdes: "R660", props: { resistanceOhms: 100 } },
        { type: "resistor", refdes: "R680", props: { resistanceOhms: 100 } },
        { type: "npn-transistor", refdes: "Q640", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "Q660", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "npn-transistor", refdes: "Q680", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "R640", pin: "a" }, { refdes: "R660", pin: "a" }, { refdes: "R680", pin: "a" }] },
        { name: "BASE_640", terminals: [{ refdes: "VB640", pin: "positive" }, { refdes: "Q640", pin: "base" }] },
        { name: "BASE_660", terminals: [{ refdes: "VB660", pin: "positive" }, { refdes: "Q660", pin: "base" }] },
        { name: "BASE_680", terminals: [{ refdes: "VB680", pin: "positive" }, { refdes: "Q680", pin: "base" }] },
        { name: "COLLECTOR_640", terminals: [{ refdes: "R640", pin: "b" }, { refdes: "Q640", pin: "collector" }] },
        { name: "COLLECTOR_660", terminals: [{ refdes: "R660", pin: "b" }, { refdes: "Q660", pin: "collector" }] },
        { name: "COLLECTOR_680", terminals: [{ refdes: "R680", pin: "b" }, { refdes: "Q680", pin: "collector" }] },
        { name: "GND", terminals: [{ refdes: "VCC", pin: "negative" }, { refdes: "VB640", pin: "negative" }, { refdes: "VB660", pin: "negative" }, { refdes: "VB680", pin: "negative" }, { refdes: "Q640", pin: "emitter" }, { refdes: "Q660", pin: "emitter" }, { refdes: "Q680", pin: "emitter" }] },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "VCC", "BASE_640", "BASE_660", "BASE_680", "COLLECTOR_640", "COLLECTOR_660", "COLLECTOR_680"],
      netVoltages: [
        { name: "COLLECTOR_640", expected: approximate(4.994183, 0.002) },
        { name: "COLLECTOR_660", expected: approximate(4.9874, 0.002) },
        { name: "COLLECTOR_680", expected: approximate(4.972707, 0.002) },
      ],
      componentMeasurements: [
        { refdes: "R640", metric: "current", expected: approximate(0.0000581657, 0.000001) },
        { refdes: "R660", metric: "current", expected: approximate(0.000126001, 0.000001) },
        { refdes: "R680", metric: "current", expected: approximate(0.000272927, 0.000002) },
      ],
    }),
  },
  {
    id: "zener-breakdown-dynamic-resistance-matrix",
    title: "Zener breakdown-voltage and dynamic-resistance matrix",
    prompt:
      "Build four independently current-biased Zener references. Drive 5 mA into each cathode with an ideal DC current source returning from GND, and ground every anode. Use nominal breakdown/dynamic-resistance pairs of 4.7 V with 10 Ohm, 4.7 V with 100 Ohm, 5.6 V with 10 Ohm, and 5.6 V with 100 Ohm. Preserve REF_4V7_R10, REF_4V7_R100, REF_5V6_R10, REF_5V6_R100, and GND. Simulate and report all four voltages, demonstrating independently modeled effects: changing breakdown voltage shifts both references by about 0.9 V, while changing dynamic resistance at equal current adds roughly 0.45 V.",
    smoke: false,
    graph: {
      groundNet: "GND",
      components: [
        { type: "dc-current-source", refdes: "I4V7_R10", props: { currentAmps: 0.005 } },
        { type: "dc-current-source", refdes: "I4V7_R100", props: { currentAmps: 0.005 } },
        { type: "dc-current-source", refdes: "I5V6_R10", props: { currentAmps: 0.005 } },
        { type: "dc-current-source", refdes: "I5V6_R100", props: { currentAmps: 0.005 } },
        { type: "zener-diode", refdes: "DZ4V7_R10", props: { breakdownVolts: 4.7, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "zener-diode", refdes: "DZ4V7_R100", props: { breakdownVolts: 4.7, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 100 } },
        { type: "zener-diode", refdes: "DZ5V6_R10", props: { breakdownVolts: 5.6, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "zener-diode", refdes: "DZ5V6_R100", props: { breakdownVolts: 5.6, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 100 } },
      ],
      nets: [
        { name: "REF_4V7_R10", terminals: [{ refdes: "I4V7_R10", pin: "negative" }, { refdes: "DZ4V7_R10", pin: "cathode" }] },
        { name: "REF_4V7_R100", terminals: [{ refdes: "I4V7_R100", pin: "negative" }, { refdes: "DZ4V7_R100", pin: "cathode" }] },
        { name: "REF_5V6_R10", terminals: [{ refdes: "I5V6_R10", pin: "negative" }, { refdes: "DZ5V6_R10", pin: "cathode" }] },
        { name: "REF_5V6_R100", terminals: [{ refdes: "I5V6_R100", pin: "negative" }, { refdes: "DZ5V6_R100", pin: "cathode" }] },
        { name: "GND", terminals: [{ refdes: "I4V7_R10", pin: "positive" }, { refdes: "I4V7_R100", pin: "positive" }, { refdes: "I5V6_R10", pin: "positive" }, { refdes: "I5V6_R100", pin: "positive" }, { refdes: "DZ4V7_R10", pin: "anode" }, { refdes: "DZ4V7_R100", pin: "anode" }, { refdes: "DZ5V6_R10", pin: "anode" }, { refdes: "DZ5V6_R100", pin: "anode" }] },
      ],
      analysis: analysis(),
    },
    expected: expected({
      requiredNetNames: ["GND", "REF_4V7_R10", "REF_4V7_R100", "REF_5V6_R10", "REF_5V6_R100"],
      netVoltages: [
        { name: "REF_4V7_R10", expected: approximate(4.791628, 0.002) },
        { name: "REF_4V7_R100", expected: approximate(5.241628, 0.002) },
        { name: "REF_5V6_R10", expected: approximate(5.691628, 0.002) },
        { name: "REF_5V6_R100", expected: approximate(6.141628, 0.002) },
      ],
      componentMeasurements: [
        { refdes: "I4V7_R10", metric: "current", expected: approximate(0.005, 0.000001) },
        { refdes: "I4V7_R100", metric: "current", expected: approximate(0.005, 0.000001) },
        { refdes: "I5V6_R10", metric: "current", expected: approximate(0.005, 0.000001) },
        { refdes: "I5V6_R100", metric: "current", expected: approximate(0.005, 0.000001) },
      ],
    }),
  },
  nmosChannelLengthModulationCase(),
  complementaryMosfetTransconductanceCase(),
  nmosSquareLawOverdriveCase(),
  diodeSaturationCurrentComparisonCase(),
  diodeEmissionCoefficientComparisonCase(),
  diodeSeriesResistanceCurrentMatrixCase(),
  bjtSaturationCurrentVbeShiftCase(),
  bjtForwardEmissionCoefficientVbeCase(),
  complementaryBjtJunctionSymmetryCase(),
  zenerBreakdownCurrentShiftCase(),
  zenerForwardSaturationCurrentCase(),
  zenerForwardEmissionCoefficientCase(),
  complementaryDarlingtonDiodeBiasCase(1),
  complementaryDarlingtonDiodeBiasCase(2),
  complementaryDarlingtonDiodeBiasCase(3),
  complementaryDarlingtonDiodeBiasCase(4),
  complementaryDarlingtonDiodeBiasCase(4, true),
  pulseVoltageSourceReleaseCase,
])
