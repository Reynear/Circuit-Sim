import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import {
  Client,
  StreamableHTTPClientTransport,
  type CallToolResult,
} from "@modelcontextprotocol/client"
import { Context, Data, Effect, Layer, Option, Schema } from "effect"
import { circuitBenchmarkCases } from "./cases"
import {
  ProjectInspectionPayloadSchema,
  SimulationEvidencePayloadSchema,
  TracePayloadSchema,
  type ProjectInspectionPayload,
  type SimulationEvidencePayload,
  type TracePayload,
} from "./mcp-payloads"
import {
  BenchmarkSuiteResultSchema,
  type BenchmarkCaseResult,
  type BenchmarkCheck,
  type BenchmarkSuiteResult,
  type BenchmarkToolCall,
  type CircuitBenchmarkCase,
} from "./schema"
import { passed, scoreInspection, scoreSimulation } from "./scorer"

const EXPECTED_TOOLS = [
  "edit_circuit",
  "inspect_circuit",
  "render_schematic",
  "simulate_circuit",
] as const

export type ToolOutcome =
  | {
      readonly _tag: "ToolResult"
      readonly isError: boolean
      readonly payload: unknown
    }
  | { readonly _tag: "CallRejected"; readonly message: string }

export type ResourceOutcome =
  | {
      readonly _tag: "ResourceResult"
      readonly uri: string
      readonly mimeType: string
      readonly svg: string
    }
  | { readonly _tag: "CallRejected"; readonly message: string }

export interface BenchmarkMcpShape {
  readonly listTools: () => Effect.Effect<ReadonlyArray<string>, BenchmarkMcpUnavailable>
  readonly call: (
    tool: string,
    arguments_: Record<string, unknown>,
  ) => Effect.Effect<ToolOutcome>
  readonly readResource: (uri: string) => Effect.Effect<ResourceOutcome>
}

export class BenchmarkMcp extends Context.Service<BenchmarkMcp, BenchmarkMcpShape>()(
  "@circuit-sim/BenchmarkMcp",
) {}

export class BenchmarkMcpUnavailable extends Data.TaggedError(
  "BenchmarkMcpUnavailable",
)<{ readonly operation: "connect" | "list_tools"; readonly message: string }> {}

export class BenchmarkArtifactUnavailable extends Data.TaggedError(
  "BenchmarkArtifactUnavailable",
)<{ readonly path: string; readonly message: string }> {}

export type RunSdkBenchmarkOptions = {
  readonly endpoint: URL
  readonly artifactRoot: string
  readonly cases?: ReadonlyArray<CircuitBenchmarkCase>
  readonly caseManifest?: (benchmark: CircuitBenchmarkCase) => unknown
  readonly scoreInspection?: (
    benchmark: CircuitBenchmarkCase,
    inspection: ProjectInspectionPayload,
  ) => ReadonlyArray<BenchmarkCheck>
  readonly requiredTraceNames?: (
    benchmark: CircuitBenchmarkCase,
    inspection: ProjectInspectionPayload,
  ) => ReadonlyArray<string>
  readonly scoreSimulation?: (
    benchmark: CircuitBenchmarkCase,
    inspection: ProjectInspectionPayload,
    simulation: SimulationEvidencePayload,
    traces: ReadonlyArray<TracePayload>,
  ) => {
    readonly checks: ReadonlyArray<BenchmarkCheck>
    readonly derivedEvidence?: unknown
  }
}

export function runSdkBenchmark(
  options: RunSdkBenchmarkOptions,
): Effect.Effect<
  { readonly result: BenchmarkSuiteResult; readonly artifactDirectory: string },
  BenchmarkMcpUnavailable | BenchmarkArtifactUnavailable
> {
  const suiteId = suiteIdentifier()
  const artifactDirectory = resolve(options.artifactRoot, suiteId)
  const startedAt = new Date().toISOString()
  return Effect.gen(function* () {
    yield* makeDirectory(artifactDirectory)
    const conformance = yield* runConformance(options.endpoint)
    yield* makeDirectory(`${artifactDirectory}/conformance`)
    yield* writeJson(
      `${artifactDirectory}/conformance/result.json`,
      conformance.checks,
    )
    yield* writeJson(
      `${artifactDirectory}/conformance/tool-calls.json`,
      conformance.toolCalls,
    )
    const cases = yield* Effect.forEach(
      options.cases ?? circuitBenchmarkCases,
      (benchmark) =>
        runFunctionalCase(benchmark, suiteId, artifactDirectory, options),
      { concurrency: 1 },
    )
    const successful = cases.filter((result) => result.passed).length
    const result = Schema.decodeUnknownSync(BenchmarkSuiteResultSchema)({
      suiteId,
      startedAt,
      completedAt: new Date().toISOString(),
      endpoint: options.endpoint.href,
      client: {
        name: "official-mcp-client",
        version: "2.0.0",
        transport: "streamable-http",
      },
      conformance: conformance.checks,
      cases,
      summary: {
        caseCount: cases.length,
        passed: successful,
        failed: cases.length - successful,
        deterministicPassRate:
          cases.length === 0 ? 0 : successful / cases.length,
        conformancePassed: passed(conformance.checks),
      },
    })
    yield* writeJson(`${artifactDirectory}/summary.json`, result)
    return { result, artifactDirectory }
  }).pipe(Effect.provide(makeBenchmarkMcpLayer(options.endpoint)))
}

function runFunctionalCase(
  benchmark: CircuitBenchmarkCase,
  suiteId: string,
  artifactDirectory: string,
  options: RunSdkBenchmarkOptions,
): Effect.Effect<BenchmarkCaseResult, BenchmarkArtifactUnavailable, BenchmarkMcp> {
  return Effect.gen(function* () {
    const mcp = yield* BenchmarkMcp
    const started = performance.now()
    const toolCalls: BenchmarkToolCall[] = []
    const caseDirectory = `${artifactDirectory}/cases/${benchmark.id}`
    yield* makeDirectory(caseDirectory)
    yield* writeJson(
      `${caseDirectory}/manifest.json`,
      options.caseManifest?.(benchmark) ?? benchmark,
    )

    const createdOutcome = yield* recordedCall(mcp, toolCalls, "edit_circuit", {
      _tag: "create",
      name: `Benchmark ${benchmark.id} ${suiteId.slice(-12)}`,
    })
    const created = decodeProject(createdOutcome)
    if (Option.isNone(created)) {
      return yield* finishFailedCase({
        benchmark,
        started,
        toolCalls,
        caseDirectory,
        id: "create",
        message: "Project creation did not return a valid inspection payload",
        actual: createdOutcome,
      })
    }

    const replacedOutcome = yield* recordedCall(mcp, toolCalls, "edit_circuit", {
      _tag: "replace",
      projectId: created.value.projectId,
      expectedVersion: created.value.version,
      graph: benchmark.graph,
    })
    const replaced = decodeProject(replacedOutcome)
    if (Option.isNone(replaced)) {
      return yield* finishFailedCase({
        benchmark,
        started,
        toolCalls,
        caseDirectory,
        projectId: created.value.projectId,
        id: "replace",
        message: "Project replacement did not return a valid inspection payload",
        actual: replacedOutcome,
      })
    }

    const inspectedOutcome = yield* recordedCall(
      mcp,
      toolCalls,
      "inspect_circuit",
      { _tag: "get_project", projectId: created.value.projectId },
    )
    const inspected = decodeProject(inspectedOutcome)
    if (Option.isNone(inspected)) {
      return yield* finishFailedCase({
        benchmark,
        started,
        toolCalls,
        caseDirectory,
        projectId: created.value.projectId,
        id: "inspect",
        message: "Project inspection did not return a valid payload",
        actual: inspectedOutcome,
      })
    }

    const checks = [
      exactCheck("version.create", 1, created.value.version),
      exactCheck("version.replace", 2, replaced.value.version),
      exactCheck(
        "inspection.hash",
        replaced.value.circuitHash,
        inspected.value.circuitHash,
      ),
      ...(options.scoreInspection?.(benchmark, inspected.value) ??
        scoreInspection(benchmark, inspected.value)),
    ]
    checks.push(yield* browserCheck(inspected.value.browserUrl))

    const renderedOutcome = yield* recordedCall(
      mcp,
      toolCalls,
      "render_schematic",
      { projectId: created.value.projectId },
    )
    const svgResourceUri = renderedResourceUri(renderedOutcome)
    let schematicSvg: string | undefined
    if (svgResourceUri === undefined) {
      checks.push(
        failedCheck(
          "schematic.render",
          "render_schematic did not return a pinned SVG resource identity",
          undefined,
          renderedOutcome,
        ),
      )
    } else {
      const resource = yield* recordedResource(
        mcp,
        toolCalls,
        svgResourceUri,
      )
      if (resource._tag === "ResourceResult") {
        schematicSvg = resource.svg
      }
      checks.push(
          resource._tag === "ResourceResult" &&
          resource.mimeType === "image/svg+xml" &&
          resource.svg.includes("<svg") &&
          benchmark.graph.components.every((component) =>
            resource.svg.includes(component.refdes),
          ) &&
          svgResourceUri.includes(inspected.value.currentSnapshotId) &&
          svgResourceUri.includes(inspected.value.circuitHash)
          ? passedCheck(
              "schematic.svg",
              "Pinned standalone SVG matches the immutable compiled snapshot",
            )
          : failedCheck(
              "schematic.svg",
              "Pinned standalone SVG was missing, malformed, stale, or incomplete",
              {
                mimeType: "image/svg+xml",
                snapshotId: inspected.value.currentSnapshotId,
                circuitHash: inspected.value.circuitHash,
                refdes: benchmark.graph.components.map((component) => component.refdes),
              },
              resource._tag === "ResourceResult"
                ? {
                    uri: resource.uri,
                    mimeType: resource.mimeType,
                    byteLength: new TextEncoder().encode(resource.svg).length,
                  }
                : resource,
            ),
      )
    }

    const simulatedOutcome = yield* recordedCall(
      mcp,
      toolCalls,
      "simulate_circuit",
      { projectId: created.value.projectId, includeNetlist: true },
    )
    const simulated = decodeSimulation(simulatedOutcome)
    if (Option.isNone(simulated)) {
      return yield* finishCase({
        benchmark,
        started,
        toolCalls,
        caseDirectory,
        projectId: created.value.projectId,
        circuitHash: inspected.value.circuitHash,
        checks: [
          ...checks,
          failedCheck(
            "simulate",
            "Simulation did not return a valid evidence payload",
            undefined,
            simulatedOutcome,
          ),
        ],
        inspection: inspected.value,
        ...(schematicSvg === undefined ? {} : { schematicSvg }),
      })
    }

    const fetchedRunOutcome = yield* recordedCall(
      mcp,
      toolCalls,
      "inspect_circuit",
      {
        _tag: "get_run",
        runId: simulated.value.run.id,
        includeNetlist: true,
      },
    )
    const fetchedRun = decodeSimulation(fetchedRunOutcome)
    checks.push(
      Option.isSome(fetchedRun)
        ? exactCheck("evidence.get_run", simulated.value, fetchedRun.value)
        : failedCheck(
            "evidence.get_run",
            "Stored run could not be read back",
            simulated.value,
            fetchedRunOutcome,
          ),
    )

    const traceNames = [
      ...new Set([
        ...benchmark.expected.traces.map((trace) => trace.signalName),
        ...benchmark.expected.traceRanges.map((trace) => trace.signalName),
        ...(options.requiredTraceNames?.(benchmark, inspected.value) ?? []),
      ]),
    ]
    const traces: TracePayload[] = []
    for (const signalNames of traceSignalNameChunks(traceNames)) {
      let offset = 0
      while (true) {
        const traceOutcome = yield* recordedCall(
          mcp,
          toolCalls,
          "inspect_circuit",
          {
            _tag: "trace",
            runId: simulated.value.run.id,
            signalNames,
            offset,
            limit: 500,
          },
        )
        const trace = decodeTrace(traceOutcome)
        if (Option.isNone(trace)) {
          checks.push(
            failedCheck(
              "trace",
              "Trace request did not return a valid payload",
              signalNames,
              traceOutcome,
            ),
          )
          break
        }
        traces.push(trace.value)
        if (trace.value.missingSignalNames.length > 0) {
          checks.push(
            failedCheck(
              "trace",
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
            failedCheck("trace", "Trace pagination made no forward progress"),
          )
          break
        }
        offset += trace.value.limit
      }
    }
    const scoredSimulation = options.scoreSimulation?.(
      benchmark,
      inspected.value,
      simulated.value,
      traces,
    ) ?? {
      checks: scoreSimulation(
        benchmark,
        inspected.value,
        simulated.value,
        traces,
      ),
    }
    checks.push(...scoredSimulation.checks)

    return yield* finishCase({
      benchmark,
      started,
      toolCalls,
      caseDirectory,
      projectId: created.value.projectId,
      runId: simulated.value.run.id,
      circuitHash: inspected.value.circuitHash,
      checks,
      inspection: inspected.value,
      simulation: simulated.value,
      traces,
      ...(scoredSimulation.derivedEvidence === undefined
        ? {}
        : { derivedEvidence: scoredSimulation.derivedEvidence }),
      ...(schematicSvg === undefined ? {} : { schematicSvg }),
    })
  })
}

export function traceSignalNameChunks(
  signalNames: ReadonlyArray<string>,
): ReadonlyArray<ReadonlyArray<string>> {
  const chunks: string[][] = []
  for (let offset = 0; offset < signalNames.length; offset += 8) {
    chunks.push(signalNames.slice(offset, offset + 8))
  }
  return chunks
}

function runConformance(
  endpoint: URL,
): Effect.Effect<
  {
    readonly checks: BenchmarkCheck[]
    readonly toolCalls: BenchmarkToolCall[]
  },
  never,
  BenchmarkMcp
> {
  return Effect.gen(function* () {
    const mcp = yield* BenchmarkMcp
    const calls: BenchmarkToolCall[] = []
    const checks: BenchmarkCheck[] = []
    const toolNames = yield* mcp.listTools().pipe(
      Effect.match({
        onFailure: () => [] as ReadonlyArray<string>,
        onSuccess: (names) => names,
      }),
    )
    checks.push(exactCheck("protocol.tools", [...EXPECTED_TOOLS], [...toolNames].sort()))

    const instructions = yield* recordedCall(
      mcp,
      calls,
      "inspect_circuit",
      { _tag: "instructions" },
    )
    checks.push(
      payloadTextIncludes(instructions, "simulate_circuit explicitly") &&
        payloadTextIncludes(instructions, "catalog")
        ? passedCheck("protocol.instructions", "Server advertises the required agent workflow")
        : failedCheck(
            "protocol.instructions",
            "Server instructions omit required workflow guidance",
            undefined,
            instructions,
          ),
    )

    const catalog = yield* recordedCall(mcp, calls, "inspect_circuit", {
      _tag: "catalog",
    })
    const expectedCatalog = [
      "and-gate",
      "capacitor",
      "dc-current-source",
      "dc-voltage-source",
      "diode",
      "ideal-op-amp-minus-top",
      "inductor",
      "inverter",
      "led",
      "logic-input",
      "logic-output",
      "n-mosfet",
      "npn-transistor",
      "or-gate",
      "p-mosfet",
      "pnp-transistor",
      "resistor",
      "sine-voltage-source",
      "switch",
      "zener-diode",
    ]
    const actualCatalog = catalogComponentNames(catalog)
    const currentDirection = catalogCurrentDirection(catalog)
    checks.push(
      JSON.stringify(actualCatalog) === JSON.stringify(expectedCatalog) &&
        currentDirection?.from === "positive" &&
        currentDirection.to === "negative"
        ? passedCheck(
            "protocol.catalog",
            "Catalog exposes every component and directional source semantics",
          )
        : failedCheck(
            "protocol.catalog",
            "Catalog component set or directional semantics are incomplete",
            expectedCatalog,
            catalog,
          ),
    )

    const created = decodeProject(
      yield* recordedCall(mcp, calls, "edit_circuit", {
        _tag: "create",
        name: `Benchmark conformance ${randomUUID().slice(0, 8)}`,
      }),
    )
    if (Option.isNone(created)) {
      checks.push(failedCheck("conformance.setup", "Could not create conformance project"))
      return { checks, toolCalls: calls }
    }

    const divider = circuitBenchmarkCases.find(
      (benchmark) => benchmark.id === "voltage-divider",
    )!
    const replaced = decodeProject(
      yield* recordedCall(mcp, calls, "edit_circuit", {
        _tag: "replace",
        projectId: created.value.projectId,
        expectedVersion: 1,
        graph: divider.graph,
      }),
    )
    if (Option.isNone(replaced)) {
      checks.push(failedCheck("conformance.setup", "Could not replace conformance project"))
      return { checks, toolCalls: calls }
    }

    const stale = yield* recordedCall(mcp, calls, "edit_circuit", {
      _tag: "replace",
      projectId: created.value.projectId,
      expectedVersion: 1,
      graph: divider.graph,
    })
    checks.push(
      outcomeErrorIs(stale, "AgentProjectVersionConflict")
        ? passedCheck("version.conflict", "Stale replacement returned a typed conflict")
        : failedCheck("version.conflict", "Stale replacement did not return the typed conflict", undefined, stale),
    )

    const invalidPinGraph = {
      ...divider.graph,
      nets: divider.graph.nets.map((net, netIndex) => ({
        ...net,
        terminals: net.terminals.map((terminal, terminalIndex) => ({
          ...terminal,
          pin:
            netIndex === 0 && terminalIndex === 0
              ? "invented"
              : terminal.pin,
        })),
      })),
    }
    const invalidPin = yield* recordedCall(mcp, calls, "edit_circuit", {
      _tag: "replace",
      projectId: created.value.projectId,
      expectedVersion: 2,
      graph: invalidPinGraph,
    })
    checks.push(
      outcomeFailed(invalidPin)
        ? passedCheck("validation.pin", "Unknown catalog pins are rejected")
        : failedCheck("validation.pin", "Unknown catalog pin was accepted"),
    )

    const invalidType = yield* recordedCall(mcp, calls, "edit_circuit", {
      _tag: "replace",
      projectId: created.value.projectId,
      expectedVersion: 2,
      graph: {
        components: [{ type: "solar-panel", refdes: "PV1", props: {} }],
        nets: [],
        groundNet: "GND",
        analysis: { durationMs: 10, timeStepMs: 0.1 },
      },
    })
    checks.push(
      outcomeFailed(invalidType)
        ? passedCheck("validation.type", "Unmodeled component types are rejected")
        : failedCheck("validation.type", "Unmodeled component type was accepted"),
    )

    const oversized = yield* recordedCall(mcp, calls, "edit_circuit", {
      _tag: "replace",
      projectId: created.value.projectId,
      expectedVersion: 2,
      graph: {
        components: Array.from({ length: 33 }, (_, index) => ({
          type: "resistor",
          refdes: `R${index + 1}`,
          props: { resistanceOhms: 1_000 },
        })),
        nets: [{ name: "GND", terminals: [{ refdes: "R1", pin: "a" }] }],
        groundNet: "GND",
        analysis: { durationMs: 10, timeStepMs: 0.1 },
      },
    })
    checks.push(
      outcomeFailed(oversized)
        ? passedCheck("validation.bounds", "Agent component bounds are enforced")
        : failedCheck("validation.bounds", "Oversized agent graph was accepted"),
    )

    const invalidName = yield* recordedCall(mcp, calls, "edit_circuit", {
      _tag: "create",
      name: "invalid\nname",
    })
    checks.push(
      outcomeFailed(invalidName)
        ? passedCheck("validation.project-name", "Control characters are rejected in project names")
        : failedCheck("validation.project-name", "Unsafe project name was accepted"),
    )

    const invalidTrace = yield* recordedCall(mcp, calls, "inspect_circuit", {
      _tag: "trace",
      runId: randomUUID(),
      limit: 501,
    })
    checks.push(
      outcomeFailed(invalidTrace)
        ? passedCheck("trace.limit", "Trace limits are enforced at the MCP boundary")
        : failedCheck("trace.limit", "Oversized trace request was accepted"),
    )

    const missingRun = yield* recordedCall(mcp, calls, "inspect_circuit", {
      _tag: "get_run",
      runId: randomUUID(),
    })
    checks.push(
      outcomeErrorIs(missingRun, "AgentSimulationRunNotFound")
        ? passedCheck("ownership.missing-run", "Unknown runs return a typed not-found result")
        : failedCheck("ownership.missing-run", "Unknown run did not return typed not-found", undefined, missingRun),
    )

    const orderedPeer = decodeProject(
      yield* recordedCall(mcp, calls, "edit_circuit", {
        _tag: "create",
        name: `Benchmark ordering ${randomUUID().slice(0, 8)}`,
      }),
    )
    const reversedGraph = {
      ...divider.graph,
      components: [...divider.graph.components].reverse(),
      nets: [...divider.graph.nets]
        .reverse()
        .map((net) => ({ ...net, terminals: [...net.terminals].reverse() })),
    }
    const reversed = Option.isSome(orderedPeer)
      ? decodeProject(
          yield* recordedCall(mcp, calls, "edit_circuit", {
            _tag: "replace",
            projectId: orderedPeer.value.projectId,
            expectedVersion: 1,
            graph: reversedGraph,
          }),
        )
      : Option.none<ProjectInspectionPayload>()
    checks.push(
      Option.isSome(reversed) && reversed.value.circuitHash === replaced.value.circuitHash
        ? passedCheck("compiler.ordering", "Graph ordering does not change electrical identity")
        : failedCheck(
            "compiler.ordering",
            "Equivalent reordered graph changed electrical identity",
            replaced.value.circuitHash,
            Option.isSome(reversed) ? reversed.value.circuitHash : undefined,
          ),
    )

    const missingProject = yield* recordedCall(
      mcp,
      calls,
      "simulate_circuit",
      { projectId: randomUUID() },
    )
    checks.push(
      outcomeErrorIs(missingProject, "AgentProjectNotFound")
        ? passedCheck("ownership.missing-project", "Unknown projects return a typed not-found result")
        : failedCheck("ownership.missing-project", "Unknown project did not return typed not-found", undefined, missingProject),
    )

    const simulation = decodeSimulation(
      yield* recordedCall(mcp, calls, "simulate_circuit", {
        projectId: created.value.projectId,
        includeNetlist: true,
      }),
    )
    if (Option.isSome(simulation)) {
      const listedRuns = yield* recordedCall(mcp, calls, "inspect_circuit", {
        _tag: "list_runs",
        projectId: created.value.projectId,
      })
      checks.push(
        payloadRunIds(listedRuns).includes(simulation.value.run.id)
          ? passedCheck("evidence.list-runs", "Persisted runs are discoverable through inspect_circuit")
          : failedCheck("evidence.list-runs", "Persisted run was absent from list_runs", simulation.value.run.id, listedRuns),
      )
      const source = circuitBenchmarkCases.find(
        (benchmark) => benchmark.id === "source-to-ground",
      )!
      const changed = decodeProject(
        yield* recordedCall(mcp, calls, "edit_circuit", {
          _tag: "replace",
          projectId: created.value.projectId,
          expectedVersion: 2,
          graph: source.graph,
        }),
      )
      const oldRun = decodeSimulation(
        yield* recordedCall(mcp, calls, "inspect_circuit", {
          _tag: "get_run",
          runId: simulation.value.run.id,
          includeNetlist: true,
        }),
      )
      checks.push(
        Option.isSome(changed) &&
          Option.isSome(oldRun) &&
          changed.value.currentSnapshotId !== simulation.value.run.projectSnapshotId &&
          JSON.stringify(oldRun.value) === JSON.stringify(simulation.value)
          ? passedCheck(
              "snapshot.immutable-run",
              "Stored run remains attached to its immutable source snapshot after edits",
            )
          : failedCheck(
              "snapshot.immutable-run",
              "Stored run changed or lost its source snapshot after editing",
              simulation.value,
              Option.getOrUndefined(oldRun),
            ),
      )

      const bounded = decodeTrace(
        yield* recordedCall(mcp, calls, "inspect_circuit", {
          _tag: "trace",
          runId: simulation.value.run.id,
          signalNames: ["V(VOUT)", "V(MISSING)"],
          offset: 1,
          limit: 1,
        }),
      )
      checks.push(
        Option.isSome(bounded) &&
          bounded.value.signals.every((signal) => signal.points.length <= 1) &&
          bounded.value.missingSignalNames.includes("V(MISSING)")
          ? passedCheck("trace.bounds", "Trace pagination and missing-signal reporting are deterministic")
          : failedCheck("trace.bounds", "Trace pagination or missing-signal reporting failed"),
      )
    } else {
      checks.push(failedCheck("snapshot.immutable-run", "Conformance simulation failed"))
    }

    checks.push(yield* rejectedOriginCheck(endpoint))
    return { checks, toolCalls: calls }
  })
}

export function makeBenchmarkMcpLayer(endpoint: URL) {
  return Layer.effect(
    BenchmarkMcp,
    Effect.acquireRelease(
      Effect.tryPromise({
        try: async () => {
          const client = new Client({
            name: "circuit-sim-benchmark",
            version: "0.1.0",
          })
          await client.connect(new StreamableHTTPClientTransport(endpoint))
          return client
        },
        catch: (error) =>
          new BenchmarkMcpUnavailable({
            operation: "connect",
            message: errorMessage(error),
          }),
      }).pipe(Effect.map(clientService)),
      (service) => Effect.promise(() => service.close()),
    ),
  )
}

function clientService(client: Client): BenchmarkMcpShape & { close: () => Promise<void> } {
  return {
    close: () => client.close(),
    listTools: () =>
      Effect.tryPromise({
        try: () => client.listTools(),
        catch: (error) =>
          new BenchmarkMcpUnavailable({
            operation: "list_tools",
            message: errorMessage(error),
          }),
      }).pipe(
        Effect.map((response) => response.tools.map((tool) => tool.name).sort()),
      ),
    call: (tool, arguments_) =>
      Effect.tryPromise({
        try: () => callWithPilotRateLimitRetry(
          () => client.callTool({ name: tool, arguments: arguments_ }),
        ),
        catch: (error) => errorMessage(error),
      }).pipe(
        Effect.match({
          onFailure: (message): ToolOutcome => ({
            _tag: "CallRejected",
            message,
          }),
          onSuccess: (result): ToolOutcome => toolOutcome(result),
        }),
      ),
    readResource: (uri) =>
      Effect.tryPromise({
        try: () => callWithPilotRateLimitRetry(() => client.readResource({ uri })),
        catch: (error) => errorMessage(error),
      }).pipe(
        Effect.match({
          onFailure: (message): ResourceOutcome => ({
            _tag: "CallRejected",
            message,
          }),
          onSuccess: (result): ResourceOutcome => {
            const content = result.contents[0]
            if (
              content === undefined ||
              !("blob" in content) ||
              typeof content.blob !== "string"
            ) {
              return {
                _tag: "CallRejected",
                message: "Pinned SVG resource did not contain blob data",
              }
            }
            return {
              _tag: "ResourceResult",
              uri: content.uri,
              mimeType: content.mimeType ?? "",
              svg: Buffer.from(content.blob, "base64").toString("utf8"),
            }
          },
        }),
      ),
  }
}

export async function callWithPilotRateLimitRetry<Result>(
  operation: () => Promise<Result>,
  sleep: (milliseconds: number) => Promise<void> = waitFor,
): Promise<Result> {
  const maximumRetries = 2
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      const delay = pilotRateLimitRetryMillis(error)
      if (delay === undefined || attempt >= maximumRetries) throw error
      await sleep(delay)
    }
  }
}

export function pilotRateLimitRetryMillis(error: unknown): number | undefined {
  const message = errorMessage(error)
  if (!message.includes('"code":-32029')) return undefined
  const seconds = Number(/retryAfterSeconds"?\s*:\s*(\d+)/.exec(message)?.[1])
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(60_000, seconds * 1_000 + 100)
    : undefined
}

function waitFor(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))
}

function toolOutcome(result: CallToolResult): ToolOutcome {
  return {
    _tag: "ToolResult",
    isError: result.isError === true,
    payload: result.structuredContent,
  }
}

function recordedCall(
  mcp: BenchmarkMcpShape,
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

function recordedResource(
  mcp: BenchmarkMcpShape,
  calls: BenchmarkToolCall[],
  uri: string,
): Effect.Effect<ResourceOutcome> {
  const started = performance.now()
  return mcp.readResource(uri).pipe(
    Effect.tap((outcome) =>
      Effect.sync(() => {
        calls.push({
          tool: "resources/read",
          arguments: { uri },
          result:
            outcome._tag === "ResourceResult"
              ? {
                  _tag: outcome._tag,
                  uri: outcome.uri,
                  mimeType: outcome.mimeType,
                  byteLength: new TextEncoder().encode(outcome.svg).length,
                }
              : outcome,
          durationMs: performance.now() - started,
        })
      }),
    ),
  )
}

function renderedResourceUri(outcome: ToolOutcome): string | undefined {
  if (
    outcome._tag !== "ToolResult" ||
    outcome.isError ||
    !isRecord(outcome.payload)
  ) {
    return undefined
  }
  if (typeof outcome.payload.svgResourceUri === "string") {
    return outcome.payload.svgResourceUri
  }
  if (!Array.isArray(outcome.payload.visuals)) return undefined
  const schematic = outcome.payload.visuals.find(
    (visual) => isRecord(visual) && visual.kind === "schematic",
  )
  return isRecord(schematic) && typeof schematic.uri === "string"
    ? schematic.uri
    : undefined
}

function decodeProject(
  outcome: ToolOutcome,
): Option.Option<ProjectInspectionPayload> {
  return outcome._tag === "ToolResult" && !outcome.isError
    ? Schema.decodeUnknownOption(ProjectInspectionPayloadSchema)(outcome.payload)
    : Option.none()
}

function decodeSimulation(
  outcome: ToolOutcome,
): Option.Option<SimulationEvidencePayload> {
  return outcome._tag === "ToolResult" && !outcome.isError
    ? Schema.decodeUnknownOption(SimulationEvidencePayloadSchema)(outcome.payload)
    : Option.none()
}

function decodeTrace(outcome: ToolOutcome): Option.Option<TracePayload> {
  return outcome._tag === "ToolResult" && !outcome.isError
    ? Schema.decodeUnknownOption(TracePayloadSchema)(outcome.payload)
    : Option.none()
}

function finishFailedCase(input: {
  readonly benchmark: CircuitBenchmarkCase
  readonly started: number
  readonly toolCalls: BenchmarkToolCall[]
  readonly caseDirectory: string
  readonly projectId?: string
  readonly id: string
  readonly message: string
  readonly actual?: unknown
}): Effect.Effect<BenchmarkCaseResult, BenchmarkArtifactUnavailable> {
  return finishCase({
    ...input,
    checks: [failedCheck(input.id, input.message, undefined, input.actual)],
  })
}

function finishCase(input: {
  readonly benchmark: CircuitBenchmarkCase
  readonly started: number
  readonly toolCalls: BenchmarkToolCall[]
  readonly caseDirectory: string
  readonly projectId?: string
  readonly runId?: string
  readonly circuitHash?: string
  readonly checks: BenchmarkCheck[]
  readonly inspection?: ProjectInspectionPayload
  readonly simulation?: SimulationEvidencePayload
  readonly traces?: ReadonlyArray<TracePayload>
  readonly schematicSvg?: string
  readonly derivedEvidence?: unknown
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
    toolCalls: input.toolCalls,
    passed: passed(input.checks),
  }
  return Effect.gen(function* () {
    yield* writeJson(`${input.caseDirectory}/result.json`, result)
    yield* writeJson(`${input.caseDirectory}/tool-calls.json`, input.toolCalls)
    if (input.inspection) {
      yield* writeJson(`${input.caseDirectory}/project.json`, input.inspection)
    }
    if (input.simulation) {
      yield* writeJson(`${input.caseDirectory}/simulation.json`, input.simulation)
      yield* writeText(`${input.caseDirectory}/netlist.cir`, input.simulation.netlist)
    }
    if (input.traces) {
      yield* writeJson(`${input.caseDirectory}/traces.json`, input.traces)
    }
    if (input.schematicSvg) {
      yield* writeText(`${input.caseDirectory}/schematic.svg`, input.schematicSvg)
    }
    if (input.derivedEvidence !== undefined) {
      yield* writeJson(
        `${input.caseDirectory}/derived-evidence.json`,
        input.derivedEvidence,
      )
    }
    return result
  })
}

function browserCheck(url: string): Effect.Effect<BenchmarkCheck> {
  return Effect.tryPromise({
    try: async () => {
      const response = await fetch(url)
      return {
        ok: response.ok,
        body: await response.text(),
        status: response.status,
      }
    },
    catch: errorMessage,
  }).pipe(
    Effect.match({
      onFailure: (message) =>
        failedCheck("browser", "Browser schematic request failed", undefined, message),
      onSuccess: ({ ok, body, status }) =>
        ok && !body.includes("Agent circuit unavailable")
          ? passedCheck("browser", "Browser schematic renders the stored project")
          : failedCheck("browser", "Browser schematic was unavailable", 200, status),
    }),
  )
}

function rejectedOriginCheck(endpoint: URL): Effect.Effect<BenchmarkCheck> {
  return Effect.tryPromise({
    try: () =>
      fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.invalid" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    catch: errorMessage,
  }).pipe(
    Effect.match({
      onFailure: (message) =>
        failedCheck("security.origin", "Origin rejection request failed", undefined, message),
      onSuccess: (response) =>
        response.status === 403
          ? passedCheck("security.origin", "Untrusted origins are rejected")
          : failedCheck("security.origin", "Untrusted origin was not rejected", 403, response.status),
    }),
  )
}

export function makeDirectory(path: string) {
  return Effect.tryPromise({
    try: () => mkdir(path, { recursive: true }),
    catch: (error) =>
      new BenchmarkArtifactUnavailable({ path, message: errorMessage(error) }),
  }).pipe(Effect.asVoid)
}

export function writeJson(path: string, value: unknown) {
  return writeText(path, `${JSON.stringify(value, null, 2)}\n`)
}

export function writeText(path: string, value: string) {
  return Effect.tryPromise({
    try: () => writeFile(path, value, "utf8"),
    catch: (error) =>
      new BenchmarkArtifactUnavailable({ path, message: errorMessage(error) }),
  }).pipe(Effect.asVoid)
}

function exactCheck(id: string, expected: unknown, actual: unknown): BenchmarkCheck {
  return JSON.stringify(expected) === JSON.stringify(actual)
    ? passedCheck(id, `${id} matches`)
    : failedCheck(id, `${id} does not match`, expected, actual)
}

function passedCheck(id: string, message: string): BenchmarkCheck {
  return { _tag: "Passed", id, message }
}

function failedCheck(
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

function outcomeFailed(outcome: ToolOutcome): boolean {
  return outcome._tag === "CallRejected" || outcome.isError
}

function outcomeErrorIs(outcome: ToolOutcome, tag: string): boolean {
  return (
    outcome._tag === "ToolResult" &&
    outcome.isError &&
    isRecord(outcome.payload) &&
    outcome.payload.error === tag
  )
}

function payloadTextIncludes(outcome: ToolOutcome, text: string): boolean {
  return (
    outcome._tag === "ToolResult" &&
    isRecord(outcome.payload) &&
    typeof outcome.payload.instructions === "string" &&
    outcome.payload.instructions.includes(text)
  )
}

function catalogComponentNames(outcome: ToolOutcome): string[] {
  if (
    outcome._tag !== "ToolResult" ||
    !isRecord(outcome.payload) ||
    !Array.isArray(outcome.payload.components)
  ) {
    return []
  }
  return outcome.payload.components
    .flatMap((component) =>
      isRecord(component) && typeof component.type === "string"
        ? [component.type]
        : [],
    )
    .sort()
}

function catalogCurrentDirection(
  outcome: ToolOutcome,
): { readonly from: string; readonly to: string } | undefined {
  if (
    outcome._tag !== "ToolResult" ||
    !isRecord(outcome.payload) ||
    !Array.isArray(outcome.payload.components)
  ) {
    return undefined
  }
  const currentSource = outcome.payload.components.find(
    (component) =>
      isRecord(component) && component.type === "dc-current-source",
  )
  if (
    !isRecord(currentSource) ||
    !isRecord(currentSource.semantics) ||
    typeof currentSource.semantics.currentFlowsFrom !== "string" ||
    typeof currentSource.semantics.currentFlowsTo !== "string"
  ) {
    return undefined
  }
  return {
    from: currentSource.semantics.currentFlowsFrom,
    to: currentSource.semantics.currentFlowsTo,
  }
}

function payloadRunIds(outcome: ToolOutcome): string[] {
  if (
    outcome._tag !== "ToolResult" ||
    !isRecord(outcome.payload) ||
    !Array.isArray(outcome.payload.runs)
  ) {
    return []
  }
  return outcome.payload.runs.flatMap((run) =>
    isRecord(run) && typeof run.id === "string" ? [run.id] : [],
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function suiteIdentifier(): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`
}
