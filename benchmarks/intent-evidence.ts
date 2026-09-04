import { Schema } from "effect"
import type { ProjectInspectionPayload, TracePayload } from "./mcp-payloads"
import type { BenchmarkCheck } from "./schema"
import {
  IntentDerivedFactSchema,
  type IntentCase,
  type IntentDerivedFact,
  type IntentDerivedObservation,
  type IntentSignalSelector,
} from "./intent-schema"
import { intentOracleBenchmark } from "./intent-scorer"
import {
  scoreModelInspection,
  type CircuitMatch,
} from "./scorer"
import { timeWeightedAverage } from "./trace-statistics"

export type IntentDerivedEvidence = {
  readonly facts: ReadonlyArray<IntentDerivedFact>
  readonly checks: ReadonlyArray<BenchmarkCheck>
}

/** Resolve evaluator-only semantic selectors through the matched circuit. */
export function intentDerivedSignalNames(
  intent: IntentCase,
  inspection: ProjectInspectionPayload,
): ReadonlyArray<string> {
  const match = intent.topologyMode === "exact"
    ? scoreModelInspection(intentOracleBenchmark(intent), inspection).match
    : undefined
  return [
    ...new Set(
      intent.derivedObservations.flatMap((observation) =>
        selectorsOf(observation).flatMap((selector) => {
          const resolved = resolveIntentSignal(selector, inspection, match)
          return resolved === undefined ? [] : [resolved]
        }),
      ),
    ),
  ]
}

export function deriveIntentEvidence(
  intent: IntentCase,
  inspection: ProjectInspectionPayload,
  traces: ReadonlyArray<TracePayload>,
): IntentDerivedEvidence {
  const match = intent.topologyMode === "exact"
    ? scoreModelInspection(intentOracleBenchmark(intent), inspection).match
    : undefined
  const facts = intent.derivedObservations.map((observation) =>
    deriveObservation(observation, inspection, traces, match),
  )
  return {
    facts,
    checks: facts.map((fact) => factCheck(fact)),
  }
}

function deriveObservation(
  observation: IntentDerivedObservation,
  inspection: ProjectInspectionPayload,
  traces: ReadonlyArray<TracePayload>,
  match: CircuitMatch | undefined,
): IntentDerivedFact {
  const resolve = (selector: IntentSignalSelector) =>
    resolveIntentSignal(selector, inspection, match)
  switch (observation._tag) {
    case "BjtIntrinsicEmitterResistance": {
      const signalName = resolve(observation.emitterCurrent)
      if (signalName === undefined) {
        return unavailable(
          observation.id,
          "The BJT emitter-current signal could not be resolved",
        )
      }
      const averageCurrent = timeWeightedAverage(
        pointsAfterFraction(
          signalPoints(traces, signalName),
          observation.startFraction,
        ),
      )
      const emitterCurrentAmps = Math.abs(averageCurrent ?? 0)
      if (emitterCurrentAmps <= Number.EPSILON) {
        return unavailable(
          observation.id,
          "The BJT emitter current was zero or unavailable",
        )
      }
      const ohms = observation.thermalVoltageVolts / emitterCurrentAmps
      return decodeFact({
        _tag: "BjtIntrinsicEmitterResistance",
        id: observation.id,
        signalName,
        emitterCurrentAmps,
        thermalVoltageVolts: observation.thermalVoltageVolts,
        ohms,
        passed: withinApproximation(ohms, observation.expectedOhms),
      })
    }
    case "SignalMetric": {
      const signalName = resolve(observation.signal)
      if (signalName === undefined) {
        return unavailable(observation.id, "The metric signal could not be resolved")
      }
      const value = observedMetric(
        pointsAfterFraction(
          signalPoints(traces, signalName),
          observation.startFraction,
        ),
        observation.metric,
      )
      return value === undefined
        ? unavailable(observation.id, `The ${observation.metric} metric was unavailable for ${signalName}`)
        : decodeFact({
            _tag: "SignalMetric",
            id: observation.id,
            signalName,
            metric: observation.metric,
            value,
            passed: withinApproximation(value, observation.expected),
          })
    }
    case "SignalMetricRange": {
      const signalName = resolve(observation.signal)
      if (signalName === undefined) {
        return unavailable(observation.id, "The ranged metric signal could not be resolved")
      }
      const value = observedMetric(
        pointsAfterFraction(
          signalPoints(traces, signalName),
          observation.startFraction,
        ),
        observation.metric,
      )
      return value === undefined
        ? unavailable(observation.id, `The ${observation.metric} metric was unavailable for ${signalName}`)
        : decodeFact({
            _tag: "SignalMetric",
            id: observation.id,
            signalName,
            metric: observation.metric,
            value,
            passed:
              value >= observation.minimumExpected &&
              value <= observation.maximumExpected,
          })
    }
    case "SignalMetricComparison": {
      const leftSignalName = resolve(observation.left)
      const rightSignalName = resolve(observation.right)
      if (leftSignalName === undefined || rightSignalName === undefined) {
        return unavailable(
          observation.id,
          "A metric-comparison signal could not be resolved",
        )
      }
      const [leftPoints, rightPoints] = overlappingWindows(
        signalPoints(traces, leftSignalName),
        signalPoints(traces, rightSignalName),
        observation.startFraction,
      )
      const leftValue = observedMetric(leftPoints, observation.metric)
      const rightValue = observedMetric(rightPoints, observation.metric)
      if (leftValue === undefined || rightValue === undefined) {
        return unavailable(
          observation.id,
          `The ${observation.metric} comparison could not be derived from the supplied traces`,
        )
      }
      const difference = leftValue - rightValue
      return decodeFact({
        _tag: "SignalMetricComparison",
        id: observation.id,
        leftSignalName,
        rightSignalName,
        metric: observation.metric,
        leftValue,
        rightValue,
        difference,
        relation: observation.relation,
        minimumDifference: observation.minimumDifference,
        passed:
          observation.relation === "greaterThan"
            ? difference >= observation.minimumDifference
            : difference <= -observation.minimumDifference,
      })
    }
    case "MeanDifference": {
      const minuendSignalName = resolve(observation.minuend)
      const subtrahendSignalName = resolve(observation.subtrahend)
      if (minuendSignalName === undefined || subtrahendSignalName === undefined) {
        return unavailable(observation.id, "A difference signal could not be resolved")
      }
      const [minuend, subtrahend] = overlappingWindows(
        signalPoints(traces, minuendSignalName),
        signalPoints(traces, subtrahendSignalName),
        observation.startFraction,
      )
      const volts = meanDifference(minuend, subtrahend)
      return volts === undefined
        ? unavailable(observation.id, "The mean difference could not be derived from the supplied traces")
        : decodeFact({
            _tag: "MeanDifference",
            id: observation.id,
            minuendSignalName,
            subtrahendSignalName,
            volts,
            passed: withinApproximation(volts, observation.expected),
          })
    }
    case "MeanDifferenceComparison": {
      const leftMinuendSignalName = resolve(observation.leftMinuend)
      const leftSubtrahendSignalName = resolve(observation.leftSubtrahend)
      const rightMinuendSignalName = resolve(observation.rightMinuend)
      const rightSubtrahendSignalName = resolve(observation.rightSubtrahend)
      if (
        leftMinuendSignalName === undefined ||
        leftSubtrahendSignalName === undefined ||
        rightMinuendSignalName === undefined ||
        rightSubtrahendSignalName === undefined
      ) {
        return unavailable(
          observation.id,
          "A difference-comparison signal could not be resolved",
        )
      }
      const windows = overlappingSignalWindows(
        [
          signalPoints(traces, leftMinuendSignalName),
          signalPoints(traces, leftSubtrahendSignalName),
          signalPoints(traces, rightMinuendSignalName),
          signalPoints(traces, rightSubtrahendSignalName),
        ],
        observation.startFraction,
      )
      const leftVolts = meanDifference(windows[0] ?? [], windows[1] ?? [])
      const rightVolts = meanDifference(windows[2] ?? [], windows[3] ?? [])
      if (leftVolts === undefined || rightVolts === undefined) {
        return unavailable(
          observation.id,
          "The mean-difference comparison could not be derived from the supplied traces",
        )
      }
      const difference = leftVolts - rightVolts
      return decodeFact({
        _tag: "MeanDifferenceComparison",
        id: observation.id,
        leftMinuendSignalName,
        leftSubtrahendSignalName,
        rightMinuendSignalName,
        rightSubtrahendSignalName,
        leftVolts,
        rightVolts,
        difference,
        relation: observation.relation,
        minimumDifference: observation.minimumDifference,
        passed:
          observation.relation === "greaterThan"
            ? difference >= observation.minimumDifference
            : difference <= -observation.minimumDifference,
      })
    }
    case "TrackingErrorComparison": {
      const referenceSignalName = resolve(observation.reference)
      const baselineSignalName = resolve(observation.baseline)
      const improvedSignalName = resolve(observation.improved)
      if (
        referenceSignalName === undefined ||
        baselineSignalName === undefined ||
        improvedSignalName === undefined
      ) {
        return unavailable(
          observation.id,
          "A tracking-error signal could not be resolved",
        )
      }
      const windows = overlappingSignalWindows(
        [
          signalPoints(traces, referenceSignalName),
          signalPoints(traces, baselineSignalName),
          signalPoints(traces, improvedSignalName),
        ],
        observation.startFraction,
      )
      const reference = windows[0] ?? []
      const baselineErrorRatio = rmsTrackingErrorRatio(
        reference,
        windows[1] ?? [],
      )
      const improvedErrorRatio = rmsTrackingErrorRatio(
        reference,
        windows[2] ?? [],
      )
      if (
        baselineErrorRatio === undefined ||
        improvedErrorRatio === undefined
      ) {
        return unavailable(
          observation.id,
          "Tracking-error ratios could not be derived from the supplied traces",
        )
      }
      const reductionRatio = baselineErrorRatio - improvedErrorRatio
      return decodeFact({
        _tag: "TrackingErrorComparison",
        id: observation.id,
        referenceSignalName,
        baselineSignalName,
        improvedSignalName,
        baselineErrorRatio,
        improvedErrorRatio,
        reductionRatio,
        minimumReductionRatio: observation.minimumReductionRatio,
        passed: reductionRatio >= observation.minimumReductionRatio,
      })
    }
    case "MagnitudeRatio": {
      const numeratorSignalName = resolve(observation.numerator)
      const denominatorSignalName = resolve(observation.denominator)
      if (numeratorSignalName === undefined || denominatorSignalName === undefined) {
        return unavailable(observation.id, "A magnitude-ratio signal could not be resolved")
      }
      const [numerator, denominator] = overlappingWindows(
        signalPoints(traces, numeratorSignalName),
        signalPoints(traces, denominatorSignalName),
        observation.startFraction,
      )
      const ratio = rmsRatio(numerator, denominator)
      return ratio === undefined
        ? unavailable(observation.id, "The magnitude ratio could not be derived from the supplied traces")
        : decodeFact({
            _tag: "MagnitudeRatio",
            id: observation.id,
            numeratorSignalName,
            denominatorSignalName,
            ratio,
            passed: withinApproximation(ratio, observation.expectedRatio),
          })
    }
    case "DifferenceRatio": {
      const numeratorMinuendSignalName = resolve(observation.numeratorMinuend)
      const numeratorSubtrahendSignalName = resolve(observation.numeratorSubtrahend)
      const denominatorMinuendSignalName = resolve(observation.denominatorMinuend)
      const denominatorSubtrahendSignalName = resolve(observation.denominatorSubtrahend)
      if (
        numeratorMinuendSignalName === undefined ||
        numeratorSubtrahendSignalName === undefined ||
        denominatorMinuendSignalName === undefined ||
        denominatorSubtrahendSignalName === undefined
      ) {
        return unavailable(
          observation.id,
          "A difference-ratio signal could not be resolved",
        )
      }
      const windows = overlappingSignalWindows(
        [
          signalPoints(traces, numeratorMinuendSignalName),
          signalPoints(traces, numeratorSubtrahendSignalName),
          signalPoints(traces, denominatorMinuendSignalName),
          signalPoints(traces, denominatorSubtrahendSignalName),
        ],
        observation.startFraction,
      )
      const numeratorMinuend = timeWeightedAverage(windows[0] ?? [])
      const numeratorSubtrahend = timeWeightedAverage(windows[1] ?? [])
      const denominatorMinuend = timeWeightedAverage(windows[2] ?? [])
      const denominatorSubtrahend = timeWeightedAverage(windows[3] ?? [])
      if (
        numeratorMinuend === undefined ||
        numeratorSubtrahend === undefined ||
        denominatorMinuend === undefined ||
        denominatorSubtrahend === undefined
      ) {
        return unavailable(
          observation.id,
          "The difference ratio could not be derived from the supplied traces",
        )
      }
      const numeratorDifference = numeratorMinuend - numeratorSubtrahend
      const denominatorDifference = denominatorMinuend - denominatorSubtrahend
      if (Math.abs(denominatorDifference) <= Number.EPSILON) {
        return unavailable(
          observation.id,
          "The difference-ratio denominator was zero",
        )
      }
      const ratio = numeratorDifference / denominatorDifference
      return decodeFact({
        _tag: "DifferenceRatio",
        id: observation.id,
        numeratorMinuendSignalName,
        numeratorSubtrahendSignalName,
        denominatorMinuendSignalName,
        denominatorSubtrahendSignalName,
        numeratorDifference,
        denominatorDifference,
        ratio,
        passed: withinApproximation(ratio, observation.expectedRatio),
      })
    }
    case "Frequency": {
      const signalName = resolve(observation.signal)
      if (signalName === undefined) {
        return unavailable(observation.id, "The frequency signal could not be resolved")
      }
      const hertz = observedFrequency(
        pointsAfterFraction(
          signalPoints(traces, signalName),
          observation.startFraction,
        ),
      )
      return hertz === undefined
        ? unavailable(observation.id, `Frequency was unavailable for ${signalName}`)
        : decodeFact({
            _tag: "Frequency",
            id: observation.id,
            signalName,
            hertz,
            passed: withinApproximation(hertz, observation.expectedHertz),
          })
    }
    case "Gain": {
      const inputSignalName = resolve(observation.input)
      const outputSignalName = resolve(observation.output)
      if (inputSignalName === undefined || outputSignalName === undefined) {
        return unavailable(observation.id, "A gain signal could not be resolved")
      }
      const [input, output] = overlappingWindows(
        signalPoints(traces, inputSignalName),
        signalPoints(traces, outputSignalName),
        observation.startFraction,
      )
      const inputRange = peakToPeak(input)
      const outputRange = peakToPeak(output)
      const ratio =
        inputRange === undefined ||
        outputRange === undefined ||
        inputRange === 0
          ? undefined
          : outputRange / inputRange
      return ratio === undefined
        ? unavailable(observation.id, "Gain could not be derived from the supplied traces")
        : decodeFact({
            _tag: "Gain",
            id: observation.id,
            inputSignalName,
            outputSignalName,
            ratio,
            passed: withinApproximation(ratio, observation.expectedRatio),
          })
    }
    case "PhaseDifference": {
      const referenceSignalName = resolve(observation.reference)
      const comparedSignalName = resolve(observation.compared)
      if (
        referenceSignalName === undefined ||
        comparedSignalName === undefined
      ) {
        return unavailable(observation.id, "A phase signal could not be resolved")
      }
      const [reference, compared] = overlappingWindows(
        signalPoints(traces, referenceSignalName),
        signalPoints(traces, comparedSignalName),
        observation.startFraction,
      )
      const referencePhase = signalPhaseDegrees(
        reference,
        observation.frequencyHertz,
      )
      const comparedPhase = signalPhaseDegrees(
        compared,
        observation.frequencyHertz,
      )
      const degrees =
        referencePhase === undefined || comparedPhase === undefined
          ? undefined
          : normalizeDegrees(comparedPhase - referencePhase)
      return degrees === undefined
        ? unavailable(observation.id, "Phase could not be derived from the supplied traces")
        : decodeFact({
            _tag: "PhaseDifference",
            id: observation.id,
            referenceSignalName,
            comparedSignalName,
            degrees,
            passed:
              circularDistance(degrees, observation.expectedDegrees.value) <=
              observation.expectedDegrees.absoluteTolerance,
          })
    }
    case "HysteresisWindow": {
      const inputSignalName = resolve(observation.input)
      const outputSignalName = resolve(observation.output)
      if (inputSignalName === undefined || outputSignalName === undefined) {
        return unavailable(observation.id, "A hysteresis signal could not be resolved")
      }
      const [input, output] = overlappingWindows(
        signalPoints(traces, inputSignalName),
        signalPoints(traces, outputSignalName),
        observation.startFraction,
      )
      const window = hysteresisWindow(input, output)
      return window === undefined
        ? unavailable(
            observation.id,
            "Distinct rising and falling hysteresis transitions could not be derived",
          )
        : decodeFact({
            _tag: "HysteresisWindow",
            id: observation.id,
            inputSignalName,
            outputSignalName,
            ...window,
            passed:
              window.separationVolts >= observation.minimumSeparationVolts,
          })
    }
    case "HighLevelFraction": {
      const signalName = resolve(observation.signal)
      if (signalName === undefined) {
        return unavailable(observation.id, "The occupancy signal could not be resolved")
      }
      const occupancy = highLevelFraction(
        pointsAfterFraction(
          signalPoints(traces, signalName),
          observation.startFraction,
        ),
      )
      return occupancy === undefined
        ? unavailable(
            observation.id,
            "The high-level occupancy fraction could not be derived",
          )
        : decodeFact({
            _tag: "HighLevelFraction",
            id: observation.id,
            signalName,
            ...occupancy,
            passed:
              occupancy.highFraction >= observation.minimumHighFraction &&
              occupancy.highFraction <= observation.maximumHighFraction,
          })
    }
    case "AlternatingConduction": {
      const firstSignalName = resolve(observation.first)
      const secondSignalName = resolve(observation.second)
      if (firstSignalName === undefined || secondSignalName === undefined) {
        return unavailable(
          observation.id,
          "A conduction-path signal could not be resolved",
        )
      }
      const [first, second] = overlappingWindows(
        signalPoints(traces, firstSignalName),
        signalPoints(traces, secondSignalName),
        observation.startFraction,
      )
      const conduction = alternatingConduction(first, second)
      return conduction === undefined
        ? unavailable(
            observation.id,
            "Alternating conduction could not be derived from the supplied traces",
          )
        : decodeFact({
            _tag: "AlternatingConduction",
            id: observation.id,
            firstSignalName,
            secondSignalName,
            ...conduction,
            passed:
              conduction.firstActiveFraction >=
                observation.minimumActiveFraction &&
              conduction.secondActiveFraction >=
                observation.minimumActiveFraction &&
              conduction.overlapFraction <=
                observation.maximumOverlapFraction &&
              conduction.alternatingPeaks,
          })
    }
    case "SumCancellation": {
      const leftSignalName = resolve(observation.left)
      const rightSignalName = resolve(observation.right)
      if (leftSignalName === undefined || rightSignalName === undefined) {
        return unavailable(observation.id, "A cancellation signal could not be resolved")
      }
      const [left, right] = overlappingWindows(
        signalPoints(traces, leftSignalName),
        signalPoints(traces, rightSignalName),
        observation.startFraction,
      )
      const residualRatio = sumResidualRatio(left, right)
      return residualRatio === undefined
        ? unavailable(
            observation.id,
            "Cancellation could not be derived from the supplied traces",
          )
        : decodeFact({
            _tag: "SumCancellation",
            id: observation.id,
            leftSignalName,
            rightSignalName,
            residualRatio,
            passed: residualRatio <= observation.maximumResidualRatio,
          })
    }
  }
}

function resolveIntentSignal(
  selector: IntentSignalSelector,
  inspection: ProjectInspectionPayload,
  match: CircuitMatch | undefined,
): string | undefined {
  switch (selector._tag) {
    case "NetVoltage":
      return `V(${match?.netNames[selector.netName] ?? selector.netName})`
    case "NetBranchCurrent": {
      const fromNet = match?.netNames[selector.fromNet] ?? selector.fromNet
      const toNet = match?.netNames[selector.toNet] ?? selector.toNet
      const candidates = inspection.circuit.components.filter(
        (component) =>
          component.type === selector.componentType &&
          component.terminals.some((terminal) => terminal.net === fromNet) &&
          component.terminals.some((terminal) => terminal.net === toNet),
      )
      const component = candidates.length === 1 ? candidates[0] : undefined
      const label = component?.terminals.find(
        (terminal) => terminal.net === fromNet,
      )?.label
      return component === undefined || label === undefined
        ? undefined
        : `I(${component.refdes}.${label})`
    }
    case "ComponentPower": {
      const refdes = match?.refdes[selector.refdes] ?? selector.refdes
      return inspection.circuit.components.some(
        (component) => component.refdes === refdes,
      )
        ? `P(${refdes})`
        : undefined
    }
    case "ComponentCurrent": {
      const refdes = match?.refdes[selector.refdes] ?? selector.refdes
      const terminalKey =
        match?.terminalKeys[selector.refdes]?.[selector.terminal] ??
        selector.terminal
      const component = inspection.circuit.components.find(
        (candidate) => candidate.refdes === refdes,
      )
      const label = component?.terminals.find(
        (terminal) => terminal.key === terminalKey,
      )?.label
      return label === undefined ? undefined : `I(${refdes}.${label})`
    }
  }
}

function selectorsOf(
  observation: IntentDerivedObservation,
): ReadonlyArray<IntentSignalSelector> {
  switch (observation._tag) {
    case "BjtIntrinsicEmitterResistance":
      return [observation.emitterCurrent]
    case "SignalMetric":
    case "SignalMetricRange":
      return [observation.signal]
    case "SignalMetricComparison":
      return [observation.left, observation.right]
    case "MeanDifference":
      return [observation.minuend, observation.subtrahend]
    case "MeanDifferenceComparison":
      return [
        observation.leftMinuend,
        observation.leftSubtrahend,
        observation.rightMinuend,
        observation.rightSubtrahend,
      ]
    case "TrackingErrorComparison":
      return [observation.reference, observation.baseline, observation.improved]
    case "MagnitudeRatio":
      return [observation.numerator, observation.denominator]
    case "DifferenceRatio":
      return [
        observation.numeratorMinuend,
        observation.numeratorSubtrahend,
        observation.denominatorMinuend,
        observation.denominatorSubtrahend,
      ]
    case "Frequency":
      return [observation.signal]
    case "Gain":
      return [observation.input, observation.output]
    case "PhaseDifference":
      return [observation.reference, observation.compared]
    case "HysteresisWindow":
      return [observation.input, observation.output]
    case "HighLevelFraction":
      return [observation.signal]
    case "AlternatingConduction":
      return [observation.first, observation.second]
    case "SumCancellation":
      return [observation.left, observation.right]
  }
}

function signalPoints(
  traces: ReadonlyArray<TracePayload>,
  signalName: string,
) {
  const byTime = new Map<number, number>()
  for (const trace of traces) {
    for (const signal of trace.signals) {
      if (signal.name !== signalName) continue
      for (const point of signal.points) byTime.set(point.t, point.v)
    }
  }
  return [...byTime.entries()]
    .sort(([left], [right]) => left - right)
    .map(([t, v]) => ({ t, v }))
}

function pointsAfterFraction(
  points: ReadonlyArray<{ readonly t: number; readonly v: number }>,
  fraction: number,
) {
  const first = points[0]
  const last = points[points.length - 1]
  if (first === undefined || last === undefined) return []
  const start = first.t + (last.t - first.t) * fraction
  return points.filter((point) => point.t >= start)
}

function overlappingWindows(
  left: ReadonlyArray<{ readonly t: number; readonly v: number }>,
  right: ReadonlyArray<{ readonly t: number; readonly v: number }>,
  startFraction: number,
) {
  const first = Math.max(left[0]?.t ?? Infinity, right[0]?.t ?? Infinity)
  const last = Math.min(
    left[left.length - 1]?.t ?? -Infinity,
    right[right.length - 1]?.t ?? -Infinity,
  )
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) {
    return [[], []] as const
  }
  const start = first + (last - first) * startFraction
  return [
    left.filter((point) => point.t >= start && point.t <= last),
    right.filter((point) => point.t >= start && point.t <= last),
  ] as const
}

function overlappingSignalWindows(
  signals: ReadonlyArray<
    ReadonlyArray<{ readonly t: number; readonly v: number }>
  >,
  startFraction: number,
) {
  const first = Math.max(...signals.map((points) => points[0]?.t ?? Infinity))
  const last = Math.min(
    ...signals.map((points) => points[points.length - 1]?.t ?? -Infinity),
  )
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) {
    return signals.map(() => [])
  }
  const start = first + (last - first) * startFraction
  return signals.map((points) =>
    points.filter((point) => point.t >= start && point.t <= last),
  )
}

function observedFrequency(
  points: ReadonlyArray<{ readonly t: number; readonly v: number }>,
): number | undefined {
  const peaks = positivePeakTimes(points)
  const periods = peaks
    .slice(1)
    .map((time, index) => time - peaks[index]!)
    .filter((period) => period > 0)
    .sort((left, right) => left - right)
  const period = periods[Math.floor(periods.length / 2)]
  return period === undefined || period === 0 ? undefined : 1 / period
}

function positivePeakTimes(
  points: ReadonlyArray<{ readonly t: number; readonly v: number }>,
) {
  let minimum: number | undefined
  let maximum: number | undefined
  for (const point of points) {
    minimum = minimum === undefined ? point.v : Math.min(minimum, point.v)
    maximum = maximum === undefined ? point.v : Math.max(maximum, point.v)
  }
  if (minimum === undefined || maximum === undefined || maximum <= minimum) {
    return []
  }
  const threshold = minimum + (maximum - minimum) * 0.8
  const peaks: number[] = []
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!
    const current = points[index]!
    const next = points[index + 1]!
    if (
      current.v >= threshold &&
      current.v >= previous.v &&
      current.v > next.v
    ) {
      peaks.push(current.t)
    }
  }
  return peaks
}

function peakToPeak(
  points: ReadonlyArray<{ readonly v: number }>,
): number | undefined {
  let minimum: number | undefined
  let maximum: number | undefined
  for (const point of points) {
    minimum = minimum === undefined ? point.v : Math.min(minimum, point.v)
    maximum = maximum === undefined ? point.v : Math.max(maximum, point.v)
  }
  return minimum === undefined || maximum === undefined
    ? undefined
    : maximum - minimum
}

function observedMetric(
  points: ReadonlyArray<{ readonly t: number; readonly v: number }>,
  metric: "average" | "minimum" | "maximum" | "peakToPeak",
): number | undefined {
  if (points.length === 0) return undefined
  switch (metric) {
    case "average":
      return timeWeightedAverage(points)
    case "minimum":
      return Math.min(...points.map((point) => point.v))
    case "maximum":
      return Math.max(...points.map((point) => point.v))
    case "peakToPeak":
      return peakToPeak(points)
  }
}

function meanDifference(
  minuend: ReadonlyArray<{ readonly t: number; readonly v: number }>,
  subtrahend: ReadonlyArray<{ readonly t: number; readonly v: number }>,
): number | undefined {
  const pairs = alignedPairs(minuend, subtrahend)
  return timeWeightedAverage(
    pairs.map((pair) => ({
      t: pair.t,
      v: pair.left - pair.right,
    })),
  )
}

function rmsRatio(
  numerator: ReadonlyArray<{ readonly t: number; readonly v: number }>,
  denominator: ReadonlyArray<{ readonly t: number; readonly v: number }>,
): number | undefined {
  const pairs = alignedPairs(numerator, denominator)
  if (pairs.length === 0) return undefined
  const numeratorMeanSquare =
    pairs.reduce((sum, pair) => sum + pair.left ** 2, 0) / pairs.length
  const denominatorMeanSquare =
    pairs.reduce((sum, pair) => sum + pair.right ** 2, 0) / pairs.length
  return denominatorMeanSquare === 0
    ? undefined
    : Math.sqrt(numeratorMeanSquare / denominatorMeanSquare)
}

function rmsTrackingErrorRatio(
  reference: ReadonlyArray<{ readonly t: number; readonly v: number }>,
  compared: ReadonlyArray<{ readonly t: number; readonly v: number }>,
): number | undefined {
  const pairs = alignedPairs(reference, compared)
  const referenceMeanSquare = timeWeightedAverage(
    pairs.map((pair) => ({ t: pair.t, v: pair.left ** 2 })),
  )
  const errorMeanSquare = timeWeightedAverage(
    pairs.map((pair) => ({
      t: pair.t,
      v: (pair.right - pair.left) ** 2,
    })),
  )
  return referenceMeanSquare === undefined ||
    errorMeanSquare === undefined ||
    referenceMeanSquare === 0
    ? undefined
    : Math.sqrt(errorMeanSquare / referenceMeanSquare)
}

function signalPhaseDegrees(
  points: ReadonlyArray<{ readonly t: number; readonly v: number }>,
  frequencyHertz: number,
): number | undefined {
  const first = points[0]
  const last = points[points.length - 1]
  if (first === undefined || last === undefined || last.t <= first.t) {
    return undefined
  }
  let area = 0
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!
    const current = points[index]!
    area += ((previous.v + current.v) / 2) * (current.t - previous.t)
  }
  const mean = area / (last.t - first.t)
  const omega = 2 * Math.PI * frequencyHertz
  let sine = 0
  let cosine = 0
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!
    const current = points[index]!
    const duration = current.t - previous.t
    const time = (previous.t + current.t) / 2
    const value = (previous.v + current.v) / 2 - mean
    sine += value * Math.sin(omega * time) * duration
    cosine += value * Math.cos(omega * time) * duration
  }
  return sine === 0 && cosine === 0
    ? undefined
    : (Math.atan2(cosine, sine) * 180) / Math.PI
}

function hysteresisWindow(
  input: ReadonlyArray<{ readonly t: number; readonly v: number }>,
  output: ReadonlyArray<{ readonly t: number; readonly v: number }>,
) {
  const pairs = alignedPairs(input, output)
  if (pairs.length < 2) return undefined
  const outputValues = pairs.map((pair) => pair.right)
  const outputMinimum = Math.min(...outputValues)
  const outputMaximum = Math.max(...outputValues)
  if (outputMaximum <= outputMinimum) return undefined
  const midpoint = (outputMinimum + outputMaximum) / 2
  const risingInputs: number[] = []
  const fallingInputs: number[] = []
  for (let index = 1; index < pairs.length; index += 1) {
    const previous = pairs[index - 1]!
    const current = pairs[index]!
    if (previous.right < midpoint && current.right >= midpoint) {
      risingInputs.push(
        crossingInput(previous, current, midpoint),
      )
    } else if (previous.right > midpoint && current.right <= midpoint) {
      fallingInputs.push(
        crossingInput(previous, current, midpoint),
      )
    }
  }
  if (risingInputs.length === 0 || fallingInputs.length === 0) return undefined
  const risingOutputInputVolts = mean(risingInputs)
  const fallingOutputInputVolts = mean(fallingInputs)
  const separationVolts = Math.abs(
    risingOutputInputVolts - fallingOutputInputVolts,
  )
  return separationVolts === 0
    ? undefined
    : {
        risingOutputInputVolts,
        fallingOutputInputVolts,
        separationVolts,
        risingTransitionCount: risingInputs.length,
        fallingTransitionCount: fallingInputs.length,
      }
}

function highLevelFraction(
  points: ReadonlyArray<{ readonly t: number; readonly v: number }>,
) {
  if (points.length < 2) return undefined
  const values = points.map((point) => point.v)
  const minimumLevel = Math.min(...values)
  const maximumLevel = Math.max(...values)
  if (maximumLevel <= minimumLevel) return undefined
  const thresholdLevel = (minimumLevel + maximumLevel) / 2
  let duration = 0
  let highDuration = 0
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!
    const current = points[index]!
    const interval = current.t - previous.t
    if (interval <= 0) continue
    duration += interval
    if ((previous.v + current.v) / 2 > thresholdLevel) {
      highDuration += interval
    }
  }
  return duration === 0
    ? undefined
    : {
        minimumLevel,
        maximumLevel,
        thresholdLevel,
        highFraction: highDuration / duration,
      }
}

function crossingInput(
  previous: { readonly left: number; readonly right: number },
  current: { readonly left: number; readonly right: number },
  outputMidpoint: number,
) {
  const outputChange = current.right - previous.right
  if (outputChange === 0) return (previous.left + current.left) / 2
  const fraction = (outputMidpoint - previous.right) / outputChange
  return previous.left + (current.left - previous.left) * fraction
}

function mean(values: ReadonlyArray<number>) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function alternatingConduction(
  first: ReadonlyArray<{ readonly t: number; readonly v: number }>,
  second: ReadonlyArray<{ readonly t: number; readonly v: number }>,
) {
  const pairs = alignedPairs(first, second)
  if (pairs.length < 3) return undefined
  let firstPeak = 0
  let secondPeak = 0
  for (const pair of pairs) {
    firstPeak = Math.max(firstPeak, Math.abs(pair.left))
    secondPeak = Math.max(secondPeak, Math.abs(pair.right))
  }
  const firstThreshold = firstPeak * 0.05
  const secondThreshold = secondPeak * 0.05
  let duration = 0
  let firstActive = 0
  let secondActive = 0
  let overlap = 0
  for (let index = 1; index < pairs.length; index += 1) {
    const previous = pairs[index - 1]!
    const current = pairs[index]!
    const interval = current.t - previous.t
    const firstOn = (previous.left + current.left) / 2 > firstThreshold
    const secondOn = (previous.right + current.right) / 2 > secondThreshold
    duration += interval
    if (firstOn) firstActive += interval
    if (secondOn) secondActive += interval
    if (firstOn && secondOn) overlap += interval
  }
  if (duration <= 0) return undefined
  const labeledPeaks = [
    ...positivePeakTimes(first).map((t) => ({ t, path: "first" as const })),
    ...positivePeakTimes(second).map((t) => ({ t, path: "second" as const })),
  ].sort((left, right) => left.t - right.t)
  const alternatingPeaks =
    labeledPeaks.some((peak) => peak.path === "first") &&
    labeledPeaks.some((peak) => peak.path === "second") &&
    labeledPeaks.slice(1).every(
      (peak, index) => peak.path !== labeledPeaks[index]!.path,
    )
  return {
    firstActiveFraction: firstActive / duration,
    secondActiveFraction: secondActive / duration,
    overlapFraction: overlap / duration,
    alternatingPeaks,
  }
}

function sumResidualRatio(
  left: ReadonlyArray<{ readonly t: number; readonly v: number }>,
  right: ReadonlyArray<{ readonly t: number; readonly v: number }>,
): number | undefined {
  const pairs = alignedPairs(left, right)
  if (pairs.length === 0) return undefined
  let leftSquares = 0
  let rightSquares = 0
  let sumSquares = 0
  for (const pair of pairs) {
    leftSquares += pair.left ** 2
    rightSquares += pair.right ** 2
    sumSquares += (pair.left + pair.right) ** 2
  }
  const denominator = Math.max(leftSquares, rightSquares)
  return denominator === 0 ? undefined : Math.sqrt(sumSquares / denominator)
}

function alignedPairs(
  left: ReadonlyArray<{ readonly t: number; readonly v: number }>,
  right: ReadonlyArray<{ readonly t: number; readonly v: number }>,
) {
  const rightByTime = new Map(right.map((point) => [point.t, point.v]))
  return left.flatMap((point) => {
    const rightValue = rightByTime.get(point.t)
    return rightValue === undefined
      ? []
      : [{ t: point.t, left: point.v, right: rightValue }]
  })
}

function withinApproximation(
  actual: number,
  expected: { readonly value: number; readonly absoluteTolerance: number },
) {
  return Math.abs(actual - expected.value) <= expected.absoluteTolerance
}

function normalizeDegrees(degrees: number) {
  const normalized = ((degrees + 180) % 360 + 360) % 360 - 180
  return normalized === -180 ? 180 : normalized
}

function circularDistance(left: number, right: number) {
  return Math.abs(normalizeDegrees(left - right))
}

function unavailable(id: string, reason: string): IntentDerivedFact {
  return decodeFact({ _tag: "Unavailable", id, reason })
}

function decodeFact(value: unknown): IntentDerivedFact {
  return Schema.decodeUnknownSync(IntentDerivedFactSchema)(value)
}

function factCheck(fact: IntentDerivedFact): BenchmarkCheck {
  return fact._tag === "Unavailable"
    ? {
        _tag: "Failed",
        id: `derived.${fact.id}`,
        message: fact.reason,
      }
    : fact.passed
      ? {
          _tag: "Passed",
          id: `derived.${fact.id}`,
          message: `${fact.id} matches the deterministic evidence contract`,
        }
      : {
          _tag: "Failed",
          id: `derived.${fact.id}`,
          message: `${fact.id} does not match the deterministic evidence contract`,
          actual: fact,
        }
}
