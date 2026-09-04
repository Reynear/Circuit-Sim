import { createHash, randomUUID } from "node:crypto"
import { resolve } from "node:path"
import { Effect, Option, Schema } from "effect"
import { intentBenchmarkCases } from "./cases/intent-cases"
import {
  createClaudeCodeAdapter,
  createGeminiCliAdapter,
  createPiAdapter,
  normalizeProcessResult,
  type BenchmarkClientId,
  type HeadlessClientAdapter,
  type NormalizedProcessResult,
  type PreparedClientInvocation,
} from "./clients"
import {
  buildIntentJudgePrompt,
  intentBuilderAnswerText,
  intentJudgmentContractError,
  parseIntentJudgment,
} from "./intent-judge"
import {
  deriveIntentEvidence,
  intentDerivedSignalNames,
} from "./intent-evidence"
import {
  IntentCaseResultSchema,
  IntentSuiteResultSchema,
  type IntentCase,
  type IntentCaseResult,
  type IntentDerivedFact,
  type IntentSuiteResult,
  type JudgmentResult,
} from "./intent-schema"
import {
  ProjectInspectionPayloadSchema,
  ProjectListPayloadSchema,
  RunListPayloadSchema,
  SimulationEvidencePayloadSchema,
  TracePayloadSchema,
  type ProjectInspectionPayload,
  type SimulationEvidencePayload,
  type TracePayload,
} from "./mcp-payloads"
import {
  captureProcess,
  clientVersion,
  decode,
  fail,
  pass,
  prepareIsolatedInvocation,
  recordedCall,
} from "./model-runner"
import {
  BenchmarkArtifactUnavailable,
  BenchmarkMcp,
  BenchmarkMcpUnavailable,
  makeBenchmarkMcpLayer,
  makeDirectory,
  writeJson,
  writeText,
} from "./sdk-runner"
import type {
  BenchmarkCaseResult,
  BenchmarkCheck,
  BenchmarkToolCall,
} from "./schema"
import { mapSignalName, passed, scoreModelInspection } from "./scorer"
import {
  intentOracleBenchmark,
  scoreIntentInspection,
  scoreIntentSimulation,
} from "./intent-scorer"

const HttpUrlSchema = Schema.URLFromString.check(
  Schema.makeFilter((url) =>
    url.protocol === "http:" || url.protocol === "https:"
      ? undefined
      : "MCP endpoint must use http or https",
  ),
)

export const IntentBenchmarkOptionsSchema = Schema.Struct({
  client: Schema.Literals(["pi", "claude-code", "gemini-cli"]),
  endpoint: HttpUrlSchema,
  artifactRoot: Schema.NonEmptyString,
  builderModel: Schema.optionalKey(Schema.NonEmptyString),
  judgeModel: Schema.NonEmptyString,
  timeoutMs: Schema.Int.check(Schema.isGreaterThan(0)),
})
export type IntentBenchmarkOptions =
  typeof IntentBenchmarkOptionsSchema.Type

export function runIntentBenchmark(
  options: IntentBenchmarkOptions,
): Effect.Effect<
  { readonly result: IntentSuiteResult; readonly artifactDirectory: string },
  BenchmarkMcpUnavailable | BenchmarkArtifactUnavailable
> {
  const suiteId = intentSuiteIdentifier(options.client)
  const artifactDirectory = resolve(options.artifactRoot, suiteId)
  const startedAt = new Date().toISOString()
  const adapter = adapterFor(options)

  return Effect.gen(function* () {
    yield* makeDirectory(artifactDirectory)
    const version = yield* clientVersion(adapter, options.timeoutMs)
    const cases = yield* Effect.forEach(
      intentBenchmarkCases,
      (benchmark) =>
        runIntentCase({
          adapter,
          benchmark,
          suiteId,
          artifactDirectory,
          endpoint: options.endpoint,
          judgeModel: options.judgeModel,
          timeoutMs: options.timeoutMs,
        }),
      { concurrency: 1 },
    )
    const summary = summarizeIntentCases(cases)
    const result = Schema.decodeUnknownSync(IntentSuiteResultSchema)({
      suiteId,
      startedAt,
      completedAt: new Date().toISOString(),
      endpoint: options.endpoint.href,
      metadata: {
        client: {
          name: options.client,
          version,
          transport: "streamable-http",
          ...(options.builderModel === undefined
            ? {}
            : { model: options.builderModel }),
        },
        judge: {
          client: "pi",
          model: options.judgeModel,
          tools: "disabled",
          policy: "report-only-nondeterministic",
        },
      },
      cases,
      summary,
    })
    yield* writeJson(`${artifactDirectory}/summary.json`, result)
    return { result, artifactDirectory }
  }).pipe(Effect.provide(makeBenchmarkMcpLayer(options.endpoint)))
}

export function summarizeIntentCases(
  cases: ReadonlyArray<IntentCaseResult>,
) {
  const deterministicPassed = cases.filter(
    (result) => result.deterministicPassed,
  ).length
  const completedJudgments = cases.flatMap((result) =>
    result.judgment._tag === "JudgmentCompleted"
      ? [result.judgment.parsed]
      : [],
  )
  return {
    caseCount: cases.length,
    deterministicPassed,
    deterministicFailed: cases.length - deterministicPassed,
    deterministicPassRate:
      cases.length === 0 ? 0 : deterministicPassed / cases.length,
    judgedCases: completedJudgments.length,
    judgeFailures: cases.length - completedJudgments.length,
    averageJudgmentRating:
      completedJudgments.length === 0
        ? 0
        : completedJudgments.reduce(
            (sum, judgment) => sum + judgment.overallRating,
            0,
          ) / completedJudgments.length,
  }
}

function runIntentCase(input: {
  readonly adapter: HeadlessClientAdapter
  readonly benchmark: IntentCase
  readonly suiteId: string
  readonly artifactDirectory: string
  readonly endpoint: URL
  readonly judgeModel: string
  readonly timeoutMs: number
}): Effect.Effect<
  IntentCaseResult,
  BenchmarkArtifactUnavailable,
  BenchmarkMcp
> {
  return Effect.gen(function* () {
    const mcp = yield* BenchmarkMcp
    const started = performance.now()
    const calls: BenchmarkToolCall[] = []
    const checks: BenchmarkCheck[] = []
    const caseDirectory = `${input.artifactDirectory}/cases/${input.benchmark.id}`
    const projectName = `Intent ${input.adapter.id} ${input.benchmark.id} ${input.suiteId.slice(-8)}`
    const prompt = builderPrompt(input.benchmark, projectName)
    yield* makeDirectory(caseDirectory)
    yield* writeJson(`${caseDirectory}/request.json`, {
      case: publicCase(input.benchmark),
      projectName,
      prompt,
    })
    const invocation = input.adapter.prepare({
      prompt,
      mcpUrl: input.endpoint.href,
    })
    const isolatedInvocation = yield* prepareIsolatedInvocation(
      invocation,
      caseDirectory,
    )
    const captured = yield* captureProcess(isolatedInvocation)
    const normalized = input.adapter.normalize(captured)
    const builderAnswer = intentBuilderAnswerText(normalized)
    // Hidden truth is materialized only after the builder process exits. This
    // keeps it unavailable even if a client violates the MCP-only contract.
    yield* writeJson(`${caseDirectory}/oracle.json`, {
      references: input.benchmark.references,
      oracleGraph: input.benchmark.oracleGraph,
      expected: input.benchmark.expected,
      minimumDurationMs: input.benchmark.minimumDurationMs,
      derivedObservations: input.benchmark.derivedObservations,
    })
    yield* writeJson(`${caseDirectory}/builder-process.json`, normalized)
    checks.push(
      normalized.ok
        ? pass("model.process", "Builder completed its one allowed attempt")
        : fail(
            "model.process",
            "Builder did not complete successfully",
            "success",
            normalized.status,
          ),
    )

    const listed = decode(
      ProjectListPayloadSchema,
      yield* recordedCall(mcp, calls, "inspect_circuit", {
        _tag: "list_projects",
      }),
    )
    const matchingProjects = Option.isSome(listed)
      ? listed.value.projects.filter((project) => project.name === projectName)
      : []
    if (matchingProjects.length !== 1) {
      return yield* finishIntentCase({
        ...input,
        started,
        caseDirectory,
        calls,
        checks: [
          ...checks,
          fail(
            "model.project",
            "Builder did not create exactly one uniquely named project",
            projectName,
            matchingProjects,
          ),
        ],
        builderAnswer,
        normalized,
      })
    }
    const project = matchingProjects[0]
    if (project === undefined) {
      return yield* finishIntentCase({
        ...input,
        started,
        caseDirectory,
        calls,
        checks: [...checks, fail("model.project", "Project lookup failed")],
        builderAnswer,
        normalized,
      })
    }

    const inspection = decode(
      ProjectInspectionPayloadSchema,
      yield* recordedCall(mcp, calls, "inspect_circuit", {
        _tag: "get_project",
        projectId: project.id,
      }),
    )
    if (Option.isNone(inspection)) {
      return yield* finishIntentCase({
        ...input,
        started,
        caseDirectory,
        calls,
        projectId: project.id,
        checks: [
          ...checks,
          fail("model.inspect", "Created project could not be inspected"),
        ],
        builderAnswer,
        normalized,
      })
    }
    checks.push(...scoreIntentInspection(input.benchmark, inspection.value))

    const runList = decode(
      RunListPayloadSchema,
      yield* recordedCall(mcp, calls, "inspect_circuit", {
        _tag: "list_runs",
        projectId: project.id,
      }),
    )
    const runSummary = Option.isSome(runList)
      ? runList.value.runs.find(
          (run) =>
            run.projectSnapshotId === inspection.value.currentSnapshotId &&
            run.circuitHash === inspection.value.circuitHash,
        )
      : undefined
    if (runSummary === undefined) {
      return yield* finishIntentCase({
        ...input,
        started,
        caseDirectory,
        calls,
        projectId: project.id,
        circuitHash: inspection.value.circuitHash,
        checks: [
          ...checks,
          fail(
            "model.simulation",
            "Builder did not simulate the final project snapshot",
            inspection.value.currentSnapshotId,
            Option.getOrUndefined(runList),
          ),
        ],
        inspection: inspection.value,
        builderAnswer,
        normalized,
      })
    }

    const evidence = decode(
      SimulationEvidencePayloadSchema,
      yield* recordedCall(mcp, calls, "inspect_circuit", {
        _tag: "get_run",
        runId: runSummary.id,
        includeNetlist: true,
      }),
    )
    if (Option.isNone(evidence)) {
      return yield* finishIntentCase({
        ...input,
        started,
        caseDirectory,
        calls,
        projectId: project.id,
        runId: runSummary.id,
        circuitHash: inspection.value.circuitHash,
        checks: [
          ...checks,
          fail("model.evidence", "Simulation evidence could not be read"),
        ],
        inspection: inspection.value,
        builderAnswer,
        normalized,
      })
    }

    const traces = yield* readRequiredTraces(
      input.benchmark,
      inspection.value,
      runSummary.id,
      calls,
    )
    checks.push(...traces.checks)
    checks.push(
      ...scoreIntentSimulation(
        input.benchmark,
        inspection.value,
        evidence.value,
        traces.payloads,
      ),
    )
    const derivedEvidence = deriveIntentEvidence(
      input.benchmark,
      inspection.value,
      traces.payloads,
    )
    checks.push(...derivedEvidence.checks)

    return yield* finishIntentCase({
      ...input,
      started,
      caseDirectory,
      calls,
      projectId: project.id,
      runId: runSummary.id,
      circuitHash: inspection.value.circuitHash,
      checks,
      inspection: inspection.value,
      evidence: evidence.value,
      traces: traces.payloads,
      derivedFacts: derivedEvidence.facts,
      builderAnswer,
      normalized,
    })
  })
}

function readRequiredTraces(
  benchmark: IntentCase,
  inspection: ProjectInspectionPayload,
  runId: string,
  calls: BenchmarkToolCall[],
): Effect.Effect<
  {
    readonly payloads: ReadonlyArray<TracePayload>
    readonly checks: ReadonlyArray<BenchmarkCheck>
  },
  never,
  BenchmarkMcp
> {
  return Effect.gen(function* () {
    const mcp = yield* BenchmarkMcp
    const match = scoreModelInspection(
      intentOracleBenchmark(benchmark),
      inspection,
    ).match
    const scoredSignalNames = [
      ...new Set([
        ...benchmark.expected.traces.map((trace) =>
          mapSignalName(trace.signalName, match),
        ),
        ...benchmark.expected.traceRanges.map((trace) =>
          mapSignalName(trace.signalName, match),
        ),
      ]),
    ]
    const requiredSignalNames = [
      ...new Set([
        ...scoredSignalNames,
        ...intentDerivedSignalNames(benchmark, inspection),
      ]),
    ]
    const payloads: TracePayload[] = []
    const checks: BenchmarkCheck[] = []
    const fetch = (
      signalNames: ReadonlyArray<string>,
    ) =>
      Effect.gen(function* () {
        let offset = 0
        while (true) {
          const trace = decode(
            TracePayloadSchema,
            yield* recordedCall(mcp, calls, "inspect_circuit", {
              _tag: "trace",
              runId,
              signalNames,
              offset,
              limit: 500,
            }),
          )
          if (Option.isNone(trace)) {
            checks.push(fail("model.trace", "Required trace was unavailable"))
            return
          }
          payloads.push(trace.value)
          if (trace.value.missingSignalNames.length > 0) {
            checks.push(
              fail(
                "model.trace",
                "A required trace signal was unavailable",
                signalNames,
                trace.value.missingSignalNames,
              ),
            )
            return
          }
          const nextOffset = offset + trace.value.limit
          const targetOffset = trace.value.signals.reduce(
            (minimum, signal) => Math.min(minimum, signal.totalSamples),
            Infinity,
          )
          if (nextOffset >= targetOffset) return
          if (trace.value.limit <= 0) {
            checks.push(
              fail("model.trace", "Trace pagination made no forward progress"),
            )
            return
          }
          offset = nextOffset
        }
      })

    // Evaluator-only signals are paged in full. Applying a settling fraction
    // to a pre-trimmed sample-count tail makes the electrical time window
    // depend on adaptive simulator density and can analyze less than one
    // complete cycle. Full traces stay internal; the judge receives derived
    // facts and bounded summaries only.
    for (const signalNames of chunksOf(requiredSignalNames, 8)) {
      yield* fetch(signalNames)
    }
    return { payloads, checks }
  })
}

function chunksOf<T>(
  values: ReadonlyArray<T>,
  size: number,
): ReadonlyArray<ReadonlyArray<T>> {
  const chunks: T[][] = []
  for (let offset = 0; offset < values.length; offset += size) {
    chunks.push(values.slice(offset, offset + size))
  }
  return chunks
}

function finishIntentCase(input: {
  readonly benchmark: IntentCase
  readonly judgeModel: string
  readonly timeoutMs: number
  readonly started: number
  readonly caseDirectory: string
  readonly calls: BenchmarkToolCall[]
  readonly checks: BenchmarkCheck[]
  readonly builderAnswer: string
  readonly normalized: NormalizedProcessResult
  readonly projectId?: string
  readonly runId?: string
  readonly circuitHash?: string
  readonly inspection?: ProjectInspectionPayload
  readonly evidence?: SimulationEvidencePayload
  readonly traces?: ReadonlyArray<TracePayload>
  readonly derivedFacts?: ReadonlyArray<IntentDerivedFact>
}): Effect.Effect<IntentCaseResult, BenchmarkArtifactUnavailable> {
  return Effect.gen(function* () {
    const builder: BenchmarkCaseResult = {
      caseId: input.benchmark.id,
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      ...(input.runId === undefined ? {} : { runId: input.runId }),
      ...(input.circuitHash === undefined
        ? {}
        : { circuitHash: input.circuitHash }),
      durationMs: performance.now() - input.started,
      checks: input.checks,
      toolCalls: input.calls,
      passed: passed(input.checks),
    }
    yield* writeJson(`${input.caseDirectory}/builder-result.json`, builder)
    yield* writeJson(`${input.caseDirectory}/scoring-tool-calls.json`, input.calls)
    yield* writeText(`${input.caseDirectory}/builder-answer.md`, input.builderAnswer)
    if (input.inspection !== undefined) {
      yield* writeJson(`${input.caseDirectory}/project.json`, input.inspection)
    }
    if (input.evidence !== undefined) {
      yield* writeJson(`${input.caseDirectory}/simulation.json`, input.evidence)
      yield* writeText(`${input.caseDirectory}/netlist.cir`, input.evidence.netlist)
    }
    if (input.traces !== undefined) {
      yield* writeJson(`${input.caseDirectory}/traces.json`, input.traces)
    }
    if (input.derivedFacts !== undefined) {
      yield* writeJson(
        `${input.caseDirectory}/derived-evidence.json`,
        input.derivedFacts,
      )
    }

    const judgment =
      input.inspection === undefined || input.evidence === undefined
        ? judgmentFailed(
            input.judgeModel,
            "Deterministic project or simulation evidence was unavailable",
          )
        : yield* runJudge({
            benchmark: input.benchmark,
            builderAnswer: input.builderAnswer,
            inspection: input.inspection,
            evidence: input.evidence,
            traces: input.traces ?? [],
            derivedFacts: input.derivedFacts ?? [],
            model: input.judgeModel,
            timeoutMs: input.timeoutMs,
            caseDirectory: input.caseDirectory,
          })
    const result = Schema.decodeUnknownSync(IntentCaseResultSchema)({
      builder,
      builderAnswer: input.builderAnswer,
      deterministicPassed: builder.passed,
      judgmentPolicy: "report-only-nondeterministic",
      judgment,
    })
    yield* writeJson(`${input.caseDirectory}/result.json`, result)
    return result
  })
}

function runJudge(input: {
  readonly benchmark: IntentCase
  readonly builderAnswer: string
  readonly inspection: ProjectInspectionPayload
  readonly evidence: SimulationEvidencePayload
  readonly traces: ReadonlyArray<TracePayload>
  readonly derivedFacts: ReadonlyArray<IntentDerivedFact>
  readonly model: string
  readonly timeoutMs: number
  readonly caseDirectory: string
}): Effect.Effect<JudgmentResult, BenchmarkArtifactUnavailable> {
  return Effect.gen(function* () {
    const prompt = buildIntentJudgePrompt(
      input.benchmark,
      input.builderAnswer,
      input.inspection,
      input.evidence,
      input.traces,
      input.derivedFacts,
    )
    const promptSha256 = sha256(prompt)
    const truthSha256 = sha256(
      JSON.stringify({
        questions: input.benchmark.questions,
        topologyMode: input.benchmark.topologyMode,
        requiredComponentTypes: input.benchmark.requiredComponentTypes,
        minimumDurationMs: input.benchmark.minimumDurationMs,
        derivedObservations: input.benchmark.derivedObservations,
        references: input.benchmark.references,
        expected: input.benchmark.expected,
      }),
    )
    yield* writeText(`${input.caseDirectory}/judge-request.txt`, prompt)
    const captured = yield* captureProcess(
      prepareIntentJudgeInvocation(
        prompt,
        input.model,
        input.timeoutMs,
        input.caseDirectory,
      ),
    )
    const normalized = normalizeProcessResult(captured, "json")
    yield* writeJson(`${input.caseDirectory}/judge-process.json`, normalized)
    const rawText = intentBuilderAnswerText(normalized)
    if (!normalized.ok) {
      return judgmentFailed(
        input.model,
        `Judge process ${normalized.status}`,
        rawText,
        promptSha256,
        truthSha256,
      )
    }
    const parsed = parseIntentJudgment(rawText)
    if (Option.isNone(parsed)) {
      return judgmentFailed(
        input.model,
        "Judge response did not match the strict JSON schema",
        rawText,
        promptSha256,
        truthSha256,
      )
    }
    const contractError = intentJudgmentContractError(
      input.benchmark,
      parsed.value,
      input.traces,
      input.derivedFacts,
    )
    return contractError === undefined
      ? {
          _tag: "JudgmentCompleted",
          model: input.model,
          promptSha256,
          truthSha256,
          rawText,
          parsed: parsed.value,
        }
      : judgmentFailed(
          input.model,
          contractError,
          rawText,
          promptSha256,
          truthSha256,
        )
  })
}

function judgmentFailed(
  model: string,
  reason: string,
  rawText = "",
  promptSha256?: string,
  truthSha256?: string,
): JudgmentResult {
  return {
    _tag: "JudgmentFailed",
    model,
    reason,
    rawText,
    ...(promptSha256 === undefined ? {} : { promptSha256 }),
    ...(truthSha256 === undefined ? {} : { truthSha256 }),
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function prepareIntentJudgeInvocation(
  prompt: string,
  model: string,
  timeoutMs: number,
  cwd: string,
): PreparedClientInvocation {
  return {
    client: "pi",
    command: "pi",
    args: [
      "--print",
      "--mode",
      "json",
      "--no-session",
      "--no-builtin-tools",
      "--no-extensions",
      "--no-skills",
      "--no-context-files",
      "--no-approve",
      "--model",
      model,
    ],
    stdin: prompt,
    cwd,
    timeoutMs,
    maxAttempts: 1,
    outputFormat: "json",
    mcpServer: { name: "none", url: "http://127.0.0.1/unused" },
    inlineMcpConfig: undefined,
    requiredMcpConfig: undefined,
  }
}

function builderPrompt(benchmark: IntentCase, projectName: string): string {
  const questions = benchmark.questions
    .map((question) => `${question.id}: ${question.prompt}`)
    .join("\n")
  return `Use only the Circuit Sim MCP tools for circuit work. Inspect the server instructions and catalog first. Create exactly one new project named "${projectName}". Work from the requested input/output behavior and make the smallest reasonable circuit without asking for a wiring recipe. ${benchmark.prompt}\n\nAnswer these questions explicitly by ID:\n${questions}\n\nInspect the saved project, explicitly simulate its final snapshot, and base every answer on returned evidence. Do not use shell, filesystem, browser, coding, or web tools. Do not claim physical safety or real-world component behavior.`
}

function publicCase(benchmark: IntentCase) {
  return {
    id: benchmark.id,
    title: benchmark.title,
    prompt: benchmark.prompt,
    questions: benchmark.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      answerKind: question.answerKind,
    })),
  }
}

function adapterFor(options: IntentBenchmarkOptions): HeadlessClientAdapter {
  const common = {
    timeoutMs: options.timeoutMs,
    ...(options.builderModel === undefined
      ? {}
      : { model: options.builderModel }),
  }
  switch (options.client) {
    case "pi":
      return createPiAdapter(common)
    case "claude-code":
      return createClaudeCodeAdapter(common)
    case "gemini-cli":
      return createGeminiCliAdapter(common)
  }
}

function intentSuiteIdentifier(client: BenchmarkClientId): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${client}-intent-${randomUUID().slice(0, 8)}`
}
