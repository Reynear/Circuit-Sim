import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { resolve } from "node:path"
import { Effect, Option, Schema } from "effect"
import { circuitBenchmarkCases, frontierBenchmarkCases } from "./cases"
import {
  createClaudeCodeAdapter,
  createGeminiCliAdapter,
  createPiAdapter,
  type BenchmarkClientId,
  type CapturedProcessResult,
  type HeadlessClientAdapter,
  type NormalizedProcessResult,
  type PreparedClientInvocation,
} from "./clients"
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
  BenchmarkMcp,
  BenchmarkArtifactUnavailable,
  BenchmarkMcpUnavailable,
  makeDirectory,
  makeBenchmarkMcpLayer,
  writeJson,
  writeText,
  type ToolOutcome,
} from "./sdk-runner"
import {
  ModelBenchmarkSuiteResultSchema,
  type BenchmarkCaseResult,
  type BenchmarkCheck,
  type BenchmarkToolCall,
  type CircuitBenchmarkCase,
  type ModelBenchmarkSuiteResult,
} from "./schema"
import {
  mapSignalName,
  passed,
  scoreModelInspection,
  scoreSimulation,
} from "./scorer"

const HttpUrlSchema = Schema.URLFromString.check(
  Schema.makeFilter((url) =>
    url.protocol === "http:" || url.protocol === "https:"
      ? undefined
      : "MCP endpoint must use http or https",
  ),
)

export const ModelBenchmarkOptionsSchema = Schema.Struct({
  client: Schema.Literals(["pi", "claude-code", "gemini-cli"]),
  profile: Schema.Literals(["smoke", "full", "frontier"]),
  endpoint: HttpUrlSchema,
  artifactRoot: Schema.NonEmptyString,
  model: Schema.optionalKey(Schema.NonEmptyString),
  timeoutMs: Schema.Int.check(Schema.isGreaterThan(0)),
})
export type ModelBenchmarkOptions = typeof ModelBenchmarkOptionsSchema.Type

export function runModelBenchmark(
  options: ModelBenchmarkOptions,
): Effect.Effect<{
  readonly result: ModelBenchmarkSuiteResult
  readonly artifactDirectory: string
}, BenchmarkMcpUnavailable | BenchmarkArtifactUnavailable> {
  const endpoint = options.endpoint
  const suiteId = modelSuiteIdentifier(options.client)
  const artifactDirectory = resolve(options.artifactRoot, suiteId)
  const startedAt = new Date().toISOString()
  const adapter = adapterFor(options)
  const selectedCases =
    options.profile === "frontier"
      ? frontierBenchmarkCases
      : circuitBenchmarkCases.filter(
          (benchmark) => options.profile === "full" || benchmark.smoke,
        )

  return Effect.gen(function* () {
    yield* makeDirectory(artifactDirectory)
    const version = yield* clientVersion(adapter, options.timeoutMs)
    const cases: BenchmarkCaseResult[] = []
    for (const benchmark of selectedCases) {
      const result = yield* runModelCase({
          adapter,
          benchmark,
          endpoint,
          suiteId,
          artifactDirectory,
        })
      cases.push(result)
      if (options.profile === "frontier" && !result.passed) break
    }
    const successful = cases.filter((result) => result.passed).length
    const firstFailure = cases.find((result) => !result.passed)
    const result = Schema.decodeUnknownSync(ModelBenchmarkSuiteResultSchema)({
      suiteId,
      startedAt,
      completedAt: new Date().toISOString(),
      endpoint: endpoint.href,
      profile: options.profile,
      client: {
        name: options.client,
        version,
        transport: "streamable-http",
        ...(options.model === undefined ? {} : { model: options.model }),
      },
      cases,
      termination:
        options.profile === "frontier" && firstFailure !== undefined
          ? {
              _tag: "FirstFailure",
              caseId: firstFailure.caseId,
              plannedCases: selectedCases.length,
            }
          : { _tag: "Completed", plannedCases: selectedCases.length },
      summary: {
        caseCount: cases.length,
        passed: successful,
        failed: cases.length - successful,
        modelPassRate: cases.length === 0 ? 0 : successful / cases.length,
        gating: "report-only",
      },
    })
    yield* writeJson(`${artifactDirectory}/summary.json`, result)
    return { result, artifactDirectory }
  }).pipe(Effect.provide(makeBenchmarkMcpLayer(endpoint)))
}

function runModelCase(input: {
  readonly adapter: HeadlessClientAdapter
  readonly benchmark: CircuitBenchmarkCase
  readonly endpoint: URL
  readonly suiteId: string
  readonly artifactDirectory: string
}): Effect.Effect<
  BenchmarkCaseResult,
  BenchmarkArtifactUnavailable,
  BenchmarkMcp
> {
  return Effect.gen(function* () {
    const mcp = yield* BenchmarkMcp
    const started = performance.now()
    const calls: BenchmarkToolCall[] = []
    const checks: BenchmarkCheck[] = []
    const caseDirectory = `${input.artifactDirectory}/cases/${input.benchmark.id}`
    const projectName = `Model ${input.adapter.id} ${input.benchmark.id} ${input.suiteId.slice(-8)}`
    const prompt = modelPrompt(input.benchmark, projectName)
    yield* makeDirectory(caseDirectory)
    yield* writeJson(`${caseDirectory}/request.json`, {
      case: publicModelCase(input.benchmark),
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
    // Materialize scoring truth only after the client exits. The case
    // directory is its working directory, so writing this earlier would let a
    // client with unexpected filesystem tools inspect the oracle.
    yield* writeJson(`${caseDirectory}/oracle.json`, {
      graph: input.benchmark.graph,
      expected: input.benchmark.expected,
    })
    yield* writeJson(`${caseDirectory}/client-process.json`, normalized)
    checks.push(
      normalized.ok
        ? pass("model.process", "Model client completed its one allowed attempt")
        : fail(
            "model.process",
            "Model client did not complete successfully",
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
    const summary = Option.isSome(listed)
      ? listed.value.projects.find((project) => project.name === projectName)
      : undefined
    if (!summary) {
      return yield* finishModelCase({
        benchmark: input.benchmark,
        started,
        caseDirectory,
        calls,
        checks: [
          ...checks,
          fail(
            "model.project",
            "Model did not create the required uniquely named project",
            projectName,
            Option.getOrUndefined(listed),
          ),
        ],
        normalized,
      })
    }

    const inspection = decode(
      ProjectInspectionPayloadSchema,
      yield* recordedCall(mcp, calls, "inspect_circuit", {
        _tag: "get_project",
        projectId: summary.id,
      }),
    )
    if (Option.isNone(inspection)) {
      return yield* finishModelCase({
        benchmark: input.benchmark,
        started,
        caseDirectory,
        calls,
        projectId: summary.id,
        checks: [
          ...checks,
          fail("model.inspect", "Created project could not be inspected"),
        ],
        normalized,
      })
    }
    const inspectionScore = scoreModelInspection(
      input.benchmark,
      inspection.value,
    )
    checks.push(...inspectionScore.checks)

    const runList = decode(
      RunListPayloadSchema,
      yield* recordedCall(mcp, calls, "inspect_circuit", {
        _tag: "list_runs",
        projectId: summary.id,
      }),
    )
    const runSummary = Option.isSome(runList)
      ? runList.value.runs.find(
          (run) =>
            run.projectSnapshotId === inspection.value.currentSnapshotId &&
            run.circuitHash === inspection.value.circuitHash,
        )
      : undefined
    if (!runSummary) {
      return yield* finishModelCase({
        benchmark: input.benchmark,
        started,
        caseDirectory,
        calls,
        projectId: summary.id,
        circuitHash: inspection.value.circuitHash,
        checks: [
          ...checks,
          fail(
            "model.simulation",
            "Model did not simulate the final project snapshot",
            inspection.value.currentSnapshotId,
            Option.getOrUndefined(runList),
          ),
        ],
        inspection: inspection.value,
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
      return yield* finishModelCase({
        benchmark: input.benchmark,
        started,
        caseDirectory,
        calls,
        projectId: summary.id,
        runId: runSummary.id,
        circuitHash: inspection.value.circuitHash,
        checks: [
          ...checks,
          fail("model.evidence", "Model simulation evidence could not be read"),
        ],
        inspection: inspection.value,
        normalized,
      })
    }

    const signalNames = [
      ...new Set([
        ...input.benchmark.expected.traces.map((trace) =>
          mapSignalName(trace.signalName, inspectionScore.match),
        ),
        ...input.benchmark.expected.traceRanges.map((trace) =>
          mapSignalName(trace.signalName, inspectionScore.match),
        ),
      ]),
    ]
    const traces: TracePayload[] = []
    if (signalNames.length > 0) {
      let offset = 0
      while (true) {
        const trace = decode(
          TracePayloadSchema,
          yield* recordedCall(mcp, calls, "inspect_circuit", {
            _tag: "trace",
            runId: runSummary.id,
            signalNames,
            offset,
            limit: 500,
          }),
        )
        if (Option.isNone(trace)) {
          checks.push(
            fail("model.trace", "Required simulation trace was unavailable"),
          )
          break
        }
        traces.push(trace.value)
        if (trace.value.missingSignalNames.length > 0) {
          checks.push(
            fail(
              "model.trace",
              "A required simulation signal was unavailable",
              signalNames,
              trace.value.missingSignalNames,
            ),
          )
          break
        }
        const incomplete = trace.value.signals.some(
          (signal) => offset + signal.points.length < signal.totalSamples,
        )
        if (!incomplete) break
        if (trace.value.limit <= 0) {
          checks.push(
            fail("model.trace", "Trace pagination made no forward progress"),
          )
          break
        }
        offset += trace.value.limit
      }
    }
    checks.push(
      ...scoreSimulation(
        input.benchmark,
        inspection.value,
        evidence.value,
        traces,
        inspectionScore.match,
      ),
    )

    return yield* finishModelCase({
      benchmark: input.benchmark,
      started,
      caseDirectory,
      calls,
      projectId: summary.id,
      runId: runSummary.id,
      circuitHash: inspection.value.circuitHash,
      checks,
      inspection: inspection.value,
      evidence: evidence.value,
      traces,
      normalized,
    })
  })
}

function adapterFor(options: ModelBenchmarkOptions): HeadlessClientAdapter {
  const common = {
    timeoutMs: options.timeoutMs,
    ...(options.model === undefined ? {} : { model: options.model }),
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

function modelPrompt(benchmark: CircuitBenchmarkCase, projectName: string): string {
  return `Use only the Circuit Sim MCP tools for circuit work. Inspect the server instructions and catalog first. Create exactly one new project named "${projectName}". ${benchmark.prompt} Inspect the saved project, explicitly simulate its final snapshot, and base your answer on returned evidence. Do not use shell, filesystem, browser, or coding tools. Do not claim physical safety or real-world component behavior.`
}

export function publicModelCase(benchmark: CircuitBenchmarkCase) {
  return {
    id: benchmark.id,
    title: benchmark.title,
    prompt: benchmark.prompt,
  }
}

export function prepareIsolatedInvocation(
  invocation: PreparedClientInvocation,
  caseDirectory: string,
): Effect.Effect<PreparedClientInvocation, BenchmarkArtifactUnavailable> {
  return Effect.gen(function* () {
    let args = invocation.args
    if (invocation.requiredMcpConfig !== undefined) {
      yield* makeDirectory(`${caseDirectory}/.gemini`)
      yield* writeJson(
        `${caseDirectory}/.gemini/settings.json`,
        invocation.requiredMcpConfig,
      )
    }
    if (invocation.requiredToolPolicy !== undefined) {
      const policyPath = `${caseDirectory}/.gemini/${invocation.requiredToolPolicy.filename}`
      yield* makeDirectory(`${caseDirectory}/.gemini`)
      yield* writeText(policyPath, invocation.requiredToolPolicy.content)
      args = [...args, "--admin-policy", policyPath]
    }
    return { ...invocation, args, cwd: caseDirectory }
  })
}

export function captureProcess(
  invocation: PreparedClientInvocation,
): Effect.Effect<CapturedProcessResult> {
  return Effect.promise(
    () =>
      new Promise((resolveResult) => {
        const started = performance.now()
        let stdout = ""
        let stderr = ""
        let timedOut = false
        let settled = false
        let forceTimer: NodeJS.Timeout | undefined
        let timer: NodeJS.Timeout | undefined
        const settle = (result: Omit<CapturedProcessResult, "durationMs">) => {
          if (settled) return
          settled = true
          if (timer) clearTimeout(timer)
          if (forceTimer) clearTimeout(forceTimer)
          resolveResult({ ...result, durationMs: performance.now() - started })
        }
        const append = (current: string, chunk: Buffer) =>
          `${current}${chunk.toString("utf8")}`.slice(-10_000_000)
        let child
        try {
          child = spawn(invocation.command, invocation.args, {
            cwd: invocation.cwd,
            env: process.env,
            shell: false,
            stdio: [
              invocation.stdin === undefined ? "ignore" : "pipe",
              "pipe",
              "pipe",
            ],
          })
        } catch (error) {
          settle({
            stdout,
            stderr: error instanceof Error ? error.message : String(error),
            exitCode: null,
            timedOut,
          })
          return
        }
        child.stdout?.on("data", (chunk: Buffer) => {
          stdout = append(stdout, chunk)
        })
        child.stderr?.on("data", (chunk: Buffer) => {
          stderr = append(stderr, chunk)
        })
        child.once("error", (error) =>
          settle({
            stdout,
            stderr: `${stderr}\n${error.message}`.trim(),
            exitCode: null,
            timedOut,
          }),
        )
        child.once("close", (exitCode, signal) =>
          settle({ stdout, stderr, exitCode, signal, timedOut }),
        )
        if (invocation.stdin !== undefined && child.stdin !== null) {
          child.stdin.on("error", () => {
            // A process may exit before consuming stdin; its exit result owns
            // the failure rather than an unhandled EPIPE event.
          })
          child.stdin.end(invocation.stdin)
        }
        timer = setTimeout(() => {
          timedOut = true
          child.kill("SIGTERM")
          forceTimer = setTimeout(() => child.kill("SIGKILL"), 2_000)
        }, invocation.timeoutMs)
      }),
  )
}

export function clientVersion(
  adapter: HeadlessClientAdapter,
  timeoutMs: number,
): Effect.Effect<string> {
  const command =
    adapter.id === "pi"
      ? "pi"
      : adapter.id === "claude-code"
        ? "claude"
        : "gemini"
  const invocation: PreparedClientInvocation = {
    client: adapter.id,
    command,
    args: ["--version"],
    cwd: undefined,
    timeoutMs: Math.min(timeoutMs, 10_000),
    maxAttempts: 1,
    outputFormat: "json",
    mcpServer: { name: "circuit-sim", url: "http://127.0.0.1/mcp" },
    inlineMcpConfig: undefined,
    requiredMcpConfig: undefined,
  }
  return captureProcess(invocation).pipe(
    Effect.map((result) =>
      result.exitCode === 0
        ? (result.stdout.trim().split(/\s+/)[0] ?? "unknown")
        : "unavailable",
    ),
  )
}

export function recordedCall(
  mcp: { readonly call: BenchmarkMcp["Service"]["call"] },
  calls: BenchmarkToolCall[],
  tool: string,
  arguments_: Record<string, unknown>,
): Effect.Effect<ToolOutcome> {
  const started = performance.now()
  return mcp.call(tool, arguments_).pipe(
    Effect.tap((outcome) =>
      Effect.sync(() => {
        calls.push({
          tool,
          arguments: arguments_,
          result: outcome,
          durationMs: performance.now() - started,
        })
      }),
    ),
  )
}

export function decode<A, I>(
  schema: Schema.Codec<A, I, never, never>,
  outcome: ToolOutcome,
): Option.Option<A> {
  return outcome._tag === "ToolResult" && !outcome.isError
    ? Schema.decodeUnknownOption(schema)(outcome.payload)
    : Option.none()
}

function finishModelCase(input: {
  readonly benchmark: CircuitBenchmarkCase
  readonly started: number
  readonly caseDirectory: string
  readonly calls: BenchmarkToolCall[]
  readonly checks: BenchmarkCheck[]
  readonly normalized: NormalizedProcessResult
  readonly projectId?: string
  readonly runId?: string
  readonly circuitHash?: string
  readonly inspection?: ProjectInspectionPayload
  readonly evidence?: SimulationEvidencePayload
  readonly traces?: ReadonlyArray<TracePayload>
}): Effect.Effect<BenchmarkCaseResult, BenchmarkArtifactUnavailable> {
  const result: BenchmarkCaseResult = {
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
  return Effect.gen(function* () {
    yield* writeJson(`${input.caseDirectory}/result.json`, result)
    yield* writeJson(`${input.caseDirectory}/scoring-tool-calls.json`, input.calls)
    if (input.inspection) {
      yield* writeJson(`${input.caseDirectory}/project.json`, input.inspection)
    }
    if (input.evidence) {
      yield* writeJson(`${input.caseDirectory}/simulation.json`, input.evidence)
      yield* writeText(`${input.caseDirectory}/netlist.cir`, input.evidence.netlist)
    }
    if (input.traces) {
      yield* writeJson(`${input.caseDirectory}/traces.json`, input.traces)
    }
    return result
  })
}

export function pass(id: string, message: string): BenchmarkCheck {
  return { _tag: "Passed", id, message }
}

export function fail(
  id: string,
  message: string,
  expected?: unknown,
  actual?: unknown,
): BenchmarkCheck {
  return {
    _tag: "Failed",
    id,
    message,
    ...(expected === undefined ? {} : { expected }),
    ...(actual === undefined ? {} : { actual }),
  }
}

export function modelSuiteIdentifier(client: BenchmarkClientId): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${client}-${randomUUID().slice(0, 8)}`
}
