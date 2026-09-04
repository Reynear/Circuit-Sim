import { Schema } from "effect"
import { AgentElectricalGraphSchema } from "@circuit-sim/core/agent/electrical-graph"

const BenchmarkIdSchema = Schema.String.check(
  Schema.isMaxLength(80),
  Schema.isPattern(/^[a-z][a-z0-9-]*$/),
)

const FiniteNumberSchema = Schema.Number.check(Schema.isFinite())
const NonNegativeFiniteSchema = FiniteNumberSchema.check(
  Schema.isGreaterThanOrEqualTo(0),
)

export const ApproximateValueSchema = Schema.Struct({
  value: FiniteNumberSchema,
  absoluteTolerance: NonNegativeFiniteSchema,
})
export type ApproximateValue = typeof ApproximateValueSchema.Type

export const NetVoltageExpectationSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  expected: ApproximateValueSchema,
})

export const ComponentMeasurementExpectationSchema = Schema.Struct({
  refdes: Schema.NonEmptyString,
  metric: Schema.Literals(["voltage", "current", "power"]),
  expected: ApproximateValueSchema,
})

export const TraceExpectationSchema = Schema.Struct({
  signalName: Schema.NonEmptyString,
  atSeconds: NonNegativeFiniteSchema,
  expected: ApproximateValueSchema,
})

export const TraceRangeExpectationSchema = Schema.Struct({
  signalName: Schema.NonEmptyString,
  metric: Schema.Literals(["peakToPeak", "minimum", "maximum", "average"]),
  startFraction: Schema.optionalKey(
    FiniteNumberSchema.check(
      Schema.isGreaterThanOrEqualTo(0),
      Schema.isLessThan(1),
    ),
  ),
  expected: ApproximateValueSchema,
})

export const BenchmarkExpectedSchema = Schema.Struct({
  requiredNetNames: Schema.Array(Schema.NonEmptyString),
  statuses: Schema.Array(
    Schema.Literals(["success", "partial"]),
  ).check(Schema.isMinLength(1)),
  netVoltages: Schema.Array(NetVoltageExpectationSchema),
  componentMeasurements: Schema.Array(
    ComponentMeasurementExpectationSchema,
  ),
  traces: Schema.Array(TraceExpectationSchema),
  traceRanges: Schema.Array(TraceRangeExpectationSchema),
  diagnosticIncludes: Schema.Array(Schema.NonEmptyString),
})

export const CircuitBenchmarkCaseSchema = Schema.Struct({
  id: BenchmarkIdSchema,
  title: Schema.NonEmptyString,
  prompt: Schema.NonEmptyString,
  smoke: Schema.Boolean,
  graph: AgentElectricalGraphSchema,
  expected: BenchmarkExpectedSchema,
})
export type CircuitBenchmarkCase = typeof CircuitBenchmarkCaseSchema.Type

export const BenchmarkCheckSchema = Schema.Union([
  Schema.TaggedStruct("Passed", {
    id: Schema.NonEmptyString,
    message: Schema.NonEmptyString,
  }),
  Schema.TaggedStruct("Failed", {
    id: Schema.NonEmptyString,
    message: Schema.NonEmptyString,
    expected: Schema.optionalKey(Schema.Unknown),
    actual: Schema.optionalKey(Schema.Unknown),
  }),
])
export type BenchmarkCheck = typeof BenchmarkCheckSchema.Type

export const BenchmarkToolCallSchema = Schema.Struct({
  tool: Schema.NonEmptyString,
  arguments: Schema.Unknown,
  result: Schema.Unknown,
  durationMs: NonNegativeFiniteSchema,
})
export type BenchmarkToolCall = typeof BenchmarkToolCallSchema.Type

export const BenchmarkCaseResultSchema = Schema.Struct({
  caseId: BenchmarkIdSchema,
  projectId: Schema.optionalKey(Schema.String),
  runId: Schema.optionalKey(Schema.String),
  circuitHash: Schema.optionalKey(Schema.String),
  durationMs: NonNegativeFiniteSchema,
  checks: Schema.Array(BenchmarkCheckSchema),
  toolCalls: Schema.Array(BenchmarkToolCallSchema),
  passed: Schema.Boolean,
})
export type BenchmarkCaseResult = typeof BenchmarkCaseResultSchema.Type

export const BenchmarkSuiteResultSchema = Schema.Struct({
  suiteId: Schema.NonEmptyString,
  startedAt: Schema.NonEmptyString,
  completedAt: Schema.NonEmptyString,
  endpoint: Schema.NonEmptyString,
  conformance: Schema.Array(BenchmarkCheckSchema),
  client: Schema.Struct({
    name: Schema.NonEmptyString,
    version: Schema.NonEmptyString,
    transport: Schema.NonEmptyString,
    model: Schema.optionalKey(Schema.String),
    provider: Schema.optionalKey(Schema.String),
  }),
  cases: Schema.Array(BenchmarkCaseResultSchema),
  summary: Schema.Struct({
    caseCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    passed: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    failed: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    deterministicPassRate: Schema.Number.check(
      Schema.isFinite(),
      Schema.isGreaterThanOrEqualTo(0),
      Schema.isLessThanOrEqualTo(1),
    ),
    conformancePassed: Schema.Boolean,
  }),
})
export type BenchmarkSuiteResult = typeof BenchmarkSuiteResultSchema.Type

export const ModelBenchmarkSuiteResultSchema = Schema.Struct({
  suiteId: Schema.NonEmptyString,
  startedAt: Schema.NonEmptyString,
  completedAt: Schema.NonEmptyString,
  endpoint: Schema.NonEmptyString,
  profile: Schema.Literals(["smoke", "full", "frontier"]),
  client: Schema.Struct({
    name: Schema.Literals(["pi", "claude-code", "gemini-cli"]),
    version: Schema.NonEmptyString,
    transport: Schema.Literal("streamable-http"),
    model: Schema.optionalKey(Schema.String),
  }),
  cases: Schema.Array(BenchmarkCaseResultSchema),
  termination: Schema.Union([
    Schema.TaggedStruct("Completed", {
      plannedCases: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    }),
    Schema.TaggedStruct("FirstFailure", {
      caseId: BenchmarkIdSchema,
      plannedCases: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    }),
  ]),
  summary: Schema.Struct({
    caseCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    passed: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    failed: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    modelPassRate: Schema.Number.check(
      Schema.isFinite(),
      Schema.isGreaterThanOrEqualTo(0),
      Schema.isLessThanOrEqualTo(1),
    ),
    gating: Schema.Literal("report-only"),
  }),
})
export type ModelBenchmarkSuiteResult =
  typeof ModelBenchmarkSuiteResultSchema.Type
