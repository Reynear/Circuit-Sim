import { Schema } from "effect"
import { AgentElectricalGraphSchema } from "@circuit-sim/core/agent/electrical-graph"
import {
  ApproximateValueSchema,
  BenchmarkCaseResultSchema,
  BenchmarkExpectedSchema,
} from "./schema"

const IntentIdSchema = Schema.String.check(
  Schema.isMaxLength(80),
  Schema.isPattern(/^[a-z][a-z0-9-]*$/),
)

const NonEmptyStringArraySchema = Schema.Array(Schema.NonEmptyString)

const ClaimsHashSchema = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/),
)

const ReferenceUrlSchema = Schema.String.check(
  Schema.isPattern(/^https?:\/\/\S+$/),
)

const PercentageSchema = Schema.Number.check(
  Schema.isFinite(),
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(100),
)

const FractionSchema = Schema.Number.check(
  Schema.isFinite(),
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(1),
)

const StartFractionSchema = FractionSchema.check(Schema.isLessThan(1))

const PositiveFiniteSchema = Schema.Number.check(
  Schema.isFinite(),
  Schema.isGreaterThan(0),
)

export const FrozenReferenceSchema = Schema.Struct({
  id: IntentIdSchema,
  title: Schema.NonEmptyString,
  url: ReferenceUrlSchema,
  retrievedAt: Schema.NonEmptyString,
  claimsSha256: ClaimsHashSchema,
  claims: NonEmptyStringArraySchema,
})
export type FrozenReference = typeof FrozenReferenceSchema.Type

export const IntentQuestionSchema = Schema.Struct({
  id: IntentIdSchema,
  prompt: Schema.NonEmptyString,
  answerKind: Schema.Literals(["qualitative", "numeric", "comparison"]),
  requiredEvidenceRefs: NonEmptyStringArraySchema.check(Schema.isMinLength(1)),
})
export type IntentQuestion = typeof IntentQuestionSchema.Type

export const IntentSignalSelectorSchema = Schema.Union([
  Schema.TaggedStruct("NetVoltage", {
    netName: Schema.NonEmptyString,
  }),
  Schema.TaggedStruct("NetBranchCurrent", {
    fromNet: Schema.NonEmptyString,
    toNet: Schema.NonEmptyString,
    componentType: Schema.NonEmptyString,
  }),
  Schema.TaggedStruct("ComponentCurrent", {
    refdes: Schema.NonEmptyString,
    terminal: Schema.NonEmptyString,
  }),
  Schema.TaggedStruct("ComponentPower", {
    refdes: Schema.NonEmptyString,
  }),
])
export type IntentSignalSelector = typeof IntentSignalSelectorSchema.Type

const SignalMetricRangeObservationSchema = Schema.Struct({
  _tag: Schema.Literal("SignalMetricRange"),
  id: IntentIdSchema,
  signal: IntentSignalSelectorSchema,
  metric: Schema.Literals(["average", "minimum", "maximum", "peakToPeak"]),
  startFraction: StartFractionSchema,
  minimumExpected: Schema.Number.check(Schema.isFinite()),
  maximumExpected: Schema.Number.check(Schema.isFinite()),
}).check(
  Schema.makeFilter((observation) =>
    observation.minimumExpected <= observation.maximumExpected
      ? undefined
      : "Signal metric range minimum must not exceed its maximum",
  ),
)

const SignalMetricComparisonObservationSchema = Schema.Struct({
  _tag: Schema.Literal("SignalMetricComparison"),
  id: IntentIdSchema,
  left: IntentSignalSelectorSchema,
  right: IntentSignalSelectorSchema,
  metric: Schema.Literals(["average", "minimum", "maximum", "peakToPeak"]),
  startFraction: StartFractionSchema,
  relation: Schema.Literals(["greaterThan", "lessThan"]),
  minimumDifference: PositiveFiniteSchema,
})

const MeanDifferenceComparisonObservationSchema = Schema.Struct({
  _tag: Schema.Literal("MeanDifferenceComparison"),
  id: IntentIdSchema,
  leftMinuend: IntentSignalSelectorSchema,
  leftSubtrahend: IntentSignalSelectorSchema,
  rightMinuend: IntentSignalSelectorSchema,
  rightSubtrahend: IntentSignalSelectorSchema,
  startFraction: StartFractionSchema,
  relation: Schema.Literals(["greaterThan", "lessThan"]),
  minimumDifference: PositiveFiniteSchema,
})

const TrackingErrorComparisonObservationSchema = Schema.Struct({
  _tag: Schema.Literal("TrackingErrorComparison"),
  id: IntentIdSchema,
  reference: IntentSignalSelectorSchema,
  baseline: IntentSignalSelectorSchema,
  improved: IntentSignalSelectorSchema,
  startFraction: StartFractionSchema,
  minimumReductionRatio: PositiveFiniteSchema,
})

const HighLevelFractionObservationSchema = Schema.Struct({
  _tag: Schema.Literal("HighLevelFraction"),
  id: IntentIdSchema,
  signal: IntentSignalSelectorSchema,
  startFraction: StartFractionSchema,
  minimumHighFraction: FractionSchema,
  maximumHighFraction: FractionSchema,
}).check(
  Schema.makeFilter((observation) =>
    observation.minimumHighFraction <= observation.maximumHighFraction
      ? undefined
      : "High-level fraction minimum must not exceed its maximum",
  ),
)

export const IntentDerivedObservationSchema = Schema.Union([
  Schema.TaggedStruct("BjtIntrinsicEmitterResistance", {
    id: IntentIdSchema,
    emitterCurrent: IntentSignalSelectorSchema,
    startFraction: StartFractionSchema,
    thermalVoltageVolts: PositiveFiniteSchema,
    expectedOhms: ApproximateValueSchema,
  }),
  Schema.TaggedStruct("SignalMetric", {
    id: IntentIdSchema,
    signal: IntentSignalSelectorSchema,
    metric: Schema.Literals(["average", "minimum", "maximum", "peakToPeak"]),
    startFraction: StartFractionSchema,
    expected: ApproximateValueSchema,
  }),
  SignalMetricRangeObservationSchema,
  SignalMetricComparisonObservationSchema,
  MeanDifferenceComparisonObservationSchema,
  TrackingErrorComparisonObservationSchema,
  HighLevelFractionObservationSchema,
  Schema.TaggedStruct("MeanDifference", {
    id: IntentIdSchema,
    minuend: IntentSignalSelectorSchema,
    subtrahend: IntentSignalSelectorSchema,
    startFraction: StartFractionSchema,
    expected: ApproximateValueSchema,
  }),
  Schema.TaggedStruct("MagnitudeRatio", {
    id: IntentIdSchema,
    numerator: IntentSignalSelectorSchema,
    denominator: IntentSignalSelectorSchema,
    startFraction: StartFractionSchema,
    expectedRatio: ApproximateValueSchema,
  }),
  Schema.TaggedStruct("DifferenceRatio", {
    id: IntentIdSchema,
    numeratorMinuend: IntentSignalSelectorSchema,
    numeratorSubtrahend: IntentSignalSelectorSchema,
    denominatorMinuend: IntentSignalSelectorSchema,
    denominatorSubtrahend: IntentSignalSelectorSchema,
    startFraction: StartFractionSchema,
    expectedRatio: ApproximateValueSchema,
  }),
  Schema.TaggedStruct("Frequency", {
    id: IntentIdSchema,
    signal: IntentSignalSelectorSchema,
    startFraction: StartFractionSchema,
    expectedHertz: ApproximateValueSchema,
  }),
  Schema.TaggedStruct("Gain", {
    id: IntentIdSchema,
    input: IntentSignalSelectorSchema,
    output: IntentSignalSelectorSchema,
    startFraction: StartFractionSchema,
    expectedRatio: ApproximateValueSchema,
  }),
  Schema.TaggedStruct("PhaseDifference", {
    id: IntentIdSchema,
    reference: IntentSignalSelectorSchema,
    compared: IntentSignalSelectorSchema,
    frequencyHertz: PositiveFiniteSchema,
    startFraction: StartFractionSchema,
    expectedDegrees: ApproximateValueSchema,
  }),
  Schema.TaggedStruct("HysteresisWindow", {
    id: IntentIdSchema,
    input: IntentSignalSelectorSchema,
    output: IntentSignalSelectorSchema,
    startFraction: StartFractionSchema,
    minimumSeparationVolts: PositiveFiniteSchema,
  }),
  Schema.TaggedStruct("AlternatingConduction", {
    id: IntentIdSchema,
    first: IntentSignalSelectorSchema,
    second: IntentSignalSelectorSchema,
    startFraction: StartFractionSchema,
    minimumActiveFraction: FractionSchema,
    maximumOverlapFraction: FractionSchema,
  }),
  Schema.TaggedStruct("SumCancellation", {
    id: IntentIdSchema,
    left: IntentSignalSelectorSchema,
    right: IntentSignalSelectorSchema,
    startFraction: StartFractionSchema,
    maximumResidualRatio: FractionSchema,
  }),
])
export type IntentDerivedObservation =
  typeof IntentDerivedObservationSchema.Type

const DerivedFactBase = {
  id: IntentIdSchema,
  passed: Schema.Boolean,
}

export const IntentDerivedFactSchema = Schema.Union([
  Schema.TaggedStruct("BjtIntrinsicEmitterResistance", {
    ...DerivedFactBase,
    signalName: Schema.NonEmptyString,
    emitterCurrentAmps: PositiveFiniteSchema,
    thermalVoltageVolts: PositiveFiniteSchema,
    ohms: PositiveFiniteSchema,
  }),
  Schema.TaggedStruct("SignalMetric", {
    ...DerivedFactBase,
    signalName: Schema.NonEmptyString,
    metric: Schema.Literals(["average", "minimum", "maximum", "peakToPeak"]),
    value: Schema.Number.check(Schema.isFinite()),
  }),
  Schema.TaggedStruct("SignalMetricComparison", {
    ...DerivedFactBase,
    leftSignalName: Schema.NonEmptyString,
    rightSignalName: Schema.NonEmptyString,
    metric: Schema.Literals(["average", "minimum", "maximum", "peakToPeak"]),
    leftValue: Schema.Number.check(Schema.isFinite()),
    rightValue: Schema.Number.check(Schema.isFinite()),
    difference: Schema.Number.check(Schema.isFinite()),
    relation: Schema.Literals(["greaterThan", "lessThan"]),
    minimumDifference: PositiveFiniteSchema,
  }),
  Schema.TaggedStruct("MeanDifference", {
    ...DerivedFactBase,
    minuendSignalName: Schema.NonEmptyString,
    subtrahendSignalName: Schema.NonEmptyString,
    volts: Schema.Number.check(Schema.isFinite()),
  }),
  Schema.TaggedStruct("MeanDifferenceComparison", {
    ...DerivedFactBase,
    leftMinuendSignalName: Schema.NonEmptyString,
    leftSubtrahendSignalName: Schema.NonEmptyString,
    rightMinuendSignalName: Schema.NonEmptyString,
    rightSubtrahendSignalName: Schema.NonEmptyString,
    leftVolts: Schema.Number.check(Schema.isFinite()),
    rightVolts: Schema.Number.check(Schema.isFinite()),
    difference: Schema.Number.check(Schema.isFinite()),
    relation: Schema.Literals(["greaterThan", "lessThan"]),
    minimumDifference: PositiveFiniteSchema,
  }),
  Schema.TaggedStruct("TrackingErrorComparison", {
    ...DerivedFactBase,
    referenceSignalName: Schema.NonEmptyString,
    baselineSignalName: Schema.NonEmptyString,
    improvedSignalName: Schema.NonEmptyString,
    baselineErrorRatio: Schema.Number.check(
      Schema.isFinite(),
      Schema.isGreaterThanOrEqualTo(0),
    ),
    improvedErrorRatio: Schema.Number.check(
      Schema.isFinite(),
      Schema.isGreaterThanOrEqualTo(0),
    ),
    reductionRatio: Schema.Number.check(Schema.isFinite()),
    minimumReductionRatio: PositiveFiniteSchema,
  }),
  Schema.TaggedStruct("MagnitudeRatio", {
    ...DerivedFactBase,
    numeratorSignalName: Schema.NonEmptyString,
    denominatorSignalName: Schema.NonEmptyString,
    ratio: Schema.Number.check(
      Schema.isFinite(),
      Schema.isGreaterThanOrEqualTo(0),
    ),
  }),
  Schema.TaggedStruct("DifferenceRatio", {
    ...DerivedFactBase,
    numeratorMinuendSignalName: Schema.NonEmptyString,
    numeratorSubtrahendSignalName: Schema.NonEmptyString,
    denominatorMinuendSignalName: Schema.NonEmptyString,
    denominatorSubtrahendSignalName: Schema.NonEmptyString,
    numeratorDifference: Schema.Number.check(Schema.isFinite()),
    denominatorDifference: Schema.Number.check(Schema.isFinite()),
    ratio: Schema.Number.check(Schema.isFinite()),
  }),
  Schema.TaggedStruct("Frequency", {
    ...DerivedFactBase,
    signalName: Schema.NonEmptyString,
    hertz: PositiveFiniteSchema,
  }),
  Schema.TaggedStruct("Gain", {
    ...DerivedFactBase,
    inputSignalName: Schema.NonEmptyString,
    outputSignalName: Schema.NonEmptyString,
    ratio: Schema.Number.check(Schema.isFinite()),
  }),
  Schema.TaggedStruct("PhaseDifference", {
    ...DerivedFactBase,
    referenceSignalName: Schema.NonEmptyString,
    comparedSignalName: Schema.NonEmptyString,
    degrees: Schema.Number.check(Schema.isFinite()),
  }),
  Schema.TaggedStruct("HysteresisWindow", {
    ...DerivedFactBase,
    inputSignalName: Schema.NonEmptyString,
    outputSignalName: Schema.NonEmptyString,
    risingOutputInputVolts: Schema.Number.check(Schema.isFinite()),
    fallingOutputInputVolts: Schema.Number.check(Schema.isFinite()),
    separationVolts: PositiveFiniteSchema,
    risingTransitionCount: Schema.Int.check(Schema.isGreaterThan(0)),
    fallingTransitionCount: Schema.Int.check(Schema.isGreaterThan(0)),
  }),
  Schema.TaggedStruct("HighLevelFraction", {
    ...DerivedFactBase,
    signalName: Schema.NonEmptyString,
    minimumLevel: Schema.Number.check(Schema.isFinite()),
    maximumLevel: Schema.Number.check(Schema.isFinite()),
    thresholdLevel: Schema.Number.check(Schema.isFinite()),
    highFraction: FractionSchema,
  }),
  Schema.TaggedStruct("AlternatingConduction", {
    ...DerivedFactBase,
    firstSignalName: Schema.NonEmptyString,
    secondSignalName: Schema.NonEmptyString,
    firstActiveFraction: FractionSchema,
    secondActiveFraction: FractionSchema,
    overlapFraction: FractionSchema,
    alternatingPeaks: Schema.Boolean,
  }),
  Schema.TaggedStruct("SumCancellation", {
    ...DerivedFactBase,
    leftSignalName: Schema.NonEmptyString,
    rightSignalName: Schema.NonEmptyString,
    residualRatio: Schema.Number.check(
      Schema.isFinite(),
      Schema.isGreaterThanOrEqualTo(0),
    ),
  }),
  Schema.TaggedStruct("Unavailable", {
    id: IntentIdSchema,
    reason: Schema.NonEmptyString,
  }),
])
export type IntentDerivedFact = typeof IntentDerivedFactSchema.Type

export const IntentCaseSchema = Schema.Struct({
  id: IntentIdSchema,
  title: Schema.NonEmptyString,
  prompt: Schema.NonEmptyString,
  topologyMode: Schema.Literals(["exact", "behavioral"]),
  questions: Schema.Array(IntentQuestionSchema).check(Schema.isMinLength(1)),
  references: Schema.Array(FrozenReferenceSchema).check(Schema.isMinLength(1)),
  oracleGraph: AgentElectricalGraphSchema,
  expected: BenchmarkExpectedSchema,
  requiredComponentTypes: NonEmptyStringArraySchema,
  minimumDurationMs: PositiveFiniteSchema,
  derivedObservations: Schema.Array(IntentDerivedObservationSchema).check(
    Schema.isMinLength(1),
  ),
}).check(
  Schema.makeFilter((intent) => {
    const questionIds = intent.questions.map((question) => question.id)
    if (new Set(questionIds).size !== questionIds.length) {
      return "Intent question IDs must be unique"
    }
    const derivedIds = intent.derivedObservations.map(
      (observation) => observation.id,
    )
    if (new Set(derivedIds).size !== derivedIds.length) {
      return "Intent derived-observation IDs must be unique"
    }
    const knownDerivedIds = new Set(derivedIds)
    const unknownRequiredRef = intent.questions
      .flatMap((question) => question.requiredEvidenceRefs)
      .find(
        (reference) =>
          reference.startsWith("derived-") &&
          !knownDerivedIds.has(reference),
      )
    return unknownRequiredRef === undefined
      ? undefined
      : `Unknown required derived-evidence reference: ${unknownRequiredRef}`
  }),
)
export type IntentCase = typeof IntentCaseSchema.Type

export const IntentQuestionVerdictSchema = Schema.Literals([
  "correct",
  "partial",
  "incorrect",
  "unanswered",
  "unscorable",
])

export const IntentQuestionScoreSchema = Schema.Struct({
  questionId: IntentIdSchema,
  verdict: IntentQuestionVerdictSchema,
  rationale: Schema.NonEmptyString,
  evidenceRefs: NonEmptyStringArraySchema,
})
export type IntentQuestionScore = typeof IntentQuestionScoreSchema.Type

export const IntentJudgmentSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  caseId: IntentIdSchema,
  questionScores: Schema.Array(IntentQuestionScoreSchema),
  unsupportedClaims: NonEmptyStringArraySchema,
  overallRating: PercentageSchema,
})
export type IntentJudgment = typeof IntentJudgmentSchema.Type

export const JudgmentCompletedSchema = Schema.TaggedStruct(
  "JudgmentCompleted",
  {
    model: Schema.NonEmptyString,
    promptSha256: ClaimsHashSchema,
    truthSha256: ClaimsHashSchema,
    rawText: Schema.String,
    parsed: IntentJudgmentSchema,
  },
)
export type JudgmentCompleted = typeof JudgmentCompletedSchema.Type

export const JudgmentFailedSchema = Schema.TaggedStruct("JudgmentFailed", {
  model: Schema.NonEmptyString,
  reason: Schema.NonEmptyString,
  rawText: Schema.String,
  promptSha256: Schema.optionalKey(ClaimsHashSchema),
  truthSha256: Schema.optionalKey(ClaimsHashSchema),
})
export type JudgmentFailed = typeof JudgmentFailedSchema.Type

export const JudgmentResultSchema = Schema.Union([
  JudgmentCompletedSchema,
  JudgmentFailedSchema,
])
export type JudgmentResult = typeof JudgmentResultSchema.Type

export const IntentCaseResultSchema = Schema.Struct({
  builder: BenchmarkCaseResultSchema,
  builderAnswer: Schema.String,
  deterministicPassed: Schema.Boolean,
  judgmentPolicy: Schema.Literal("report-only-nondeterministic"),
  judgment: JudgmentResultSchema,
})
export type IntentCaseResult = typeof IntentCaseResultSchema.Type

const ClientMetadataSchema = Schema.Struct({
  name: Schema.Literals(["pi", "claude-code", "gemini-cli"]),
  version: Schema.NonEmptyString,
  transport: Schema.Literal("streamable-http"),
  model: Schema.optionalKey(Schema.NonEmptyString),
})

const JudgeMetadataSchema = Schema.Struct({
  client: Schema.Literal("pi"),
  model: Schema.NonEmptyString,
  tools: Schema.Literal("disabled"),
  policy: Schema.Literal("report-only-nondeterministic"),
})

export const IntentSuiteResultSchema = Schema.Struct({
  suiteId: Schema.NonEmptyString,
  startedAt: Schema.NonEmptyString,
  completedAt: Schema.NonEmptyString,
  endpoint: Schema.NonEmptyString,
  metadata: Schema.Struct({
    client: ClientMetadataSchema,
    judge: JudgeMetadataSchema,
  }),
  cases: Schema.Array(IntentCaseResultSchema),
  summary: Schema.Struct({
    caseCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    deterministicPassed: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    deterministicFailed: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    deterministicPassRate: Schema.Number.check(
      Schema.isFinite(),
      Schema.isGreaterThanOrEqualTo(0),
      Schema.isLessThanOrEqualTo(1),
    ),
    judgedCases: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    judgeFailures: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    averageJudgmentRating: PercentageSchema,
  }),
})
export type IntentSuiteResult = typeof IntentSuiteResultSchema.Type
