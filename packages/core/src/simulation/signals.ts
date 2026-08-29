import { Data, Schema } from "effect"

export const SignalPointSchema = Schema.Struct({
  t: Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0)),
  v: Schema.Number.check(Schema.isFinite()),
})
export type SignalPoint = typeof SignalPointSchema.Type

export const SignalUnitSchema = Schema.Literals(["V", "A", "W"])
export type SignalUnit = typeof SignalUnitSchema.Type

export const SignalSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  unit: SignalUnitSchema,
  points: Schema.Array(SignalPointSchema),
})
export type Signal = typeof SignalSchema.Type

export const SignalsSchema = Schema.Array(SignalSchema).check(
  Schema.makeFilter((signals) => {
    const names = new Set(signals.map((signal) => signal.name))
    return names.size === signals.length ? undefined : "Signal names must be unique"
  }),
)
export type Signals = typeof SignalsSchema.Type

export const signalMetricOrder = ["voltage", "current", "power"] as const
export type SignalMetric = (typeof signalMetricOrder)[number]

export function parseSignalMetric(value: string): SignalMetric | null {
  switch (value) {
    case "voltage":
    case "current":
    case "power":
      return value
    default:
      return null
  }
}

export function signalMetric(name: string): SignalMetric | null {
  if (name.startsWith("V(")) return "voltage"
  if (name.startsWith("I(")) return "current"
  if (name.startsWith("P(")) return "power"
  return null
}

export function findSignal(signals: Signals, name: string): Signal | undefined {
  return signals.find((signal) => signal.name === name)
}

export function availableSignalMetrics(signals: Signals): SignalMetric[] {
  const present = new Set(
    signals
      .map((signal) => signalMetric(signal.name))
      .filter((metric): metric is SignalMetric => metric !== null),
  )
  return signalMetricOrder.filter((metric) => present.has(metric))
}

export function firstSignalMetric(signals: Signals): SignalMetric | null {
  for (const signal of signals) {
    const metric = signalMetric(signal.name)
    if (metric !== null) return metric
  }
  return null
}

export function signalTarget(name: string): string {
  const inner = name.slice(2, -1)
  const dot = inner.lastIndexOf(".")
  return dot === -1 ? inner : inner.slice(0, dot)
}

export function availableSignalTargets(
  signals: Signals,
  metric: SignalMetric,
): string[] {
  const targets = new Set<string>()
  for (const signal of signals) {
    if (signalMetric(signal.name) === metric) targets.add(signalTarget(signal.name))
  }
  return [...targets].sort((a, b) => a.localeCompare(b))
}

export function displaySignals(signals: Signals, metric: SignalMetric): Signal[] {
  return signals
    .filter((signal) => signalMetric(signal.name) === metric)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export type SignalElement = {
  refdes: string
  pin1Label: string
  pin2Label: string
  n1: string
  n2: string
}

export class InvalidSignalSeries extends Data.TaggedError(
  "InvalidSignalSeries",
)<{ readonly series: string; readonly reason: string }> {}

export type NodeVoltageSeries = {
  readonly nodeName: string
  readonly values: ReadonlyArray<number>
}

export type NodeNetName = {
  readonly nodeName: string
  readonly netName: string
}

export type TranSignalInput = {
  times: ReadonlyArray<number>
  nodeVoltages: ReadonlyArray<NodeVoltageSeries>
  nodeNetNames: ReadonlyArray<NodeNetName>
  elementCurrents: ReadonlyArray<{
    element: SignalElement
    current: ReadonlyArray<number>
  }>
}

export function buildTranSignals(input: TranSignalInput): Signals {
  validateTranSignalInput(input)
  const signals: Signal[] = []
  const pointCount = input.times.length
  const series = (values: ReadonlyArray<number>): SignalPoint[] =>
    input.times.map((t, index) => ({ t, v: values[index]! }))

  for (const { nodeName, netName } of input.nodeNetNames) {
    const values =
      nodeName === "0"
        ? new Array<number>(pointCount).fill(0)
        : voltageSeries(input.nodeVoltages, nodeName)
    if (values) {
      signals.push({ name: `V(${netName})`, unit: "V", points: series(values) })
    }
  }

  for (const { element, current } of input.elementCurrents) {
    const currentIntoPin1 = series(current)
    signals.push({
      name: `I(${element.refdes}.${element.pin1Label})`,
      unit: "A",
      points: currentIntoPin1,
    })
    signals.push({
      name: `I(${element.refdes}.${element.pin2Label})`,
      unit: "A",
      points: currentIntoPin1.map((point) => ({ t: point.t, v: -point.v })),
    })
    const v1 = nodeSeries(input.nodeVoltages, element.n1, pointCount)
    const v2 = nodeSeries(input.nodeVoltages, element.n2, pointCount)
    signals.push({
      name: `P(${element.refdes})`,
      unit: "W",
      points: input.times.map((t, index) => ({
        t,
        v: (v1[index]! - v2[index]!) * current[index]!,
      })),
    })
  }
  return signals
}

function voltageSeries(
  nodeVoltages: ReadonlyArray<NodeVoltageSeries>,
  nodeName: string,
): ReadonlyArray<number> | undefined {
  return nodeVoltages.find((series) => series.nodeName === nodeName)?.values
}

function nodeSeries(
  nodeVoltages: ReadonlyArray<NodeVoltageSeries>,
  nodeName: string,
  pointCount: number,
): ReadonlyArray<number> {
  return nodeName === "0"
    ? new Array<number>(pointCount).fill(0)
    : voltageSeries(nodeVoltages, nodeName)!
}

function validateTranSignalInput(input: TranSignalInput): void {
  const pointCount = input.times.length
  const validateSeries = (name: string, values: ReadonlyArray<number>) => {
    if (values.length !== pointCount) {
      throw new InvalidSignalSeries({
        series: name,
        reason: `has ${values.length} samples; expected ${pointCount}`,
      })
    }
    if (values.some((value) => !Number.isFinite(value))) {
      throw new InvalidSignalSeries({ series: name, reason: "contains a non-finite sample" })
    }
  }

  validateSeries("transient time", input.times)
  for (const { nodeName, netName } of input.nodeNetNames) {
    if (nodeName === "0") continue
    const values = voltageSeries(input.nodeVoltages, nodeName)
    if (!values) {
      throw new InvalidSignalSeries({
        series: `Voltage series for net ${netName}`,
        reason: "is missing",
      })
    }
    validateSeries(`Voltage series for net ${netName}`, values)
  }
  for (const { element, current } of input.elementCurrents) {
    validateSeries(`Current series for ${element.refdes}`, current)
    for (const nodeName of [element.n1, element.n2]) {
      if (nodeName !== "0" && !voltageSeries(input.nodeVoltages, nodeName)) {
        throw new InvalidSignalSeries({
          series: `Terminal voltage for ${element.refdes} node ${nodeName}`,
          reason: "is missing",
        })
      }
    }
  }
}
