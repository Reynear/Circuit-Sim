import { Data, DateTime, Effect, Schema } from "effect"
import { compileAgentElectricalGraph } from "@circuit-sim/core/agent/electrical-graph"
import {
  buildElectricalCircuit,
  circuitHashOf,
} from "@circuit-sim/core/circuit/electrical-circuit"
import { runErc } from "@circuit-sim/core/circuit/erc"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"
import { newId } from "@circuit-sim/core/ids"
import { observeRun } from "@circuit-sim/core/simulation/run-observations"
import { simulationStatus } from "@circuit-sim/core/simulation/result"
import {
  SimulationRunSchema,
  type SimulationRun,
} from "@circuit-sim/core/simulation/simulation-run"
import { runServerSpiceSimulation } from "../src/server/simulation/run-simulation.server"
import {
  circuitBenchmarkCases,
  frontierBenchmarkCases,
} from "./cases"
import { intentBenchmarkCases } from "./cases/intent-cases"
import { deriveIntentEvidence } from "./intent-evidence"
import {
  scoreIntentInspection,
  scoreIntentSimulation,
} from "./intent-scorer"
import type {
  ProjectInspectionPayload,
  SimulationEvidencePayload,
  TracePayload,
} from "./mcp-payloads"
import type {
  ApproximateValue,
  BenchmarkCheck,
  CircuitBenchmarkCase,
} from "./schema"
import { passed, scoreInspection, scoreSimulation } from "./scorer"
import type { IntentCase, IntentDerivedFact } from "./intent-schema"
import { timeWeightedAverage } from "./trace-statistics"

type NativeCaseResult = {
  readonly id: string
  readonly suite: "release" | "frontier" | "intent"
  readonly passed: boolean
  readonly checks: ReadonlyArray<BenchmarkCheck>
  readonly signalCount: number
  readonly derivedFacts?: ReadonlyArray<IntentDerivedFact>
  readonly observations?: NativeExpectationObservations
}

type NativeObservedExpectation = {
  readonly id: string
  readonly expected: ApproximateValue
  readonly actual: number | undefined
}

type NativeExpectationObservations = {
  readonly netVoltages: ReadonlyArray<NativeObservedExpectation>
  readonly componentMeasurements: ReadonlyArray<NativeObservedExpectation>
  readonly traces: ReadonlyArray<NativeObservedExpectation>
  readonly traceRanges: ReadonlyArray<NativeObservedExpectation>
}

class NativeBenchmarkExecutionFailed extends Data.TaggedError(
  "NativeBenchmarkExecutionFailed",
)<{
  readonly message: string
}> {}

async function validateCircuitCase(
  benchmark: CircuitBenchmarkCase,
  suite: NativeCaseResult["suite"],
  includeDetails: boolean,
): Promise<NativeCaseResult> {
  const prepared = await prepareCase(
    benchmark.title,
    benchmark.graph,
  )
  const checks = [
    ...scoreInspection(benchmark, prepared.inspection),
    ...scoreSimulation(
      benchmark,
      prepared.inspection,
      prepared.evidence,
      prepared.traces,
    ),
  ]
  return {
    id: benchmark.id,
    suite,
    passed: passed(checks),
    checks,
    signalCount: prepared.traces[0]?.signals.length ?? 0,
    ...(includeDetails
      ? {
          observations: nativeExpectationObservations(
            benchmark,
            prepared.evidence,
            prepared.traces,
          ),
        }
      : {}),
  }
}

async function validateIntentCase(
  benchmark: IntentCase,
): Promise<NativeCaseResult> {
  const prepared = await prepareCase(
    benchmark.title,
    benchmark.oracleGraph,
  )
  const derived = deriveIntentEvidence(
    benchmark,
    prepared.inspection,
    prepared.traces,
  )
  const checks = [
    ...scoreIntentInspection(benchmark, prepared.inspection),
    ...scoreIntentSimulation(
      benchmark,
      prepared.inspection,
      prepared.evidence,
      prepared.traces,
    ),
    ...derived.checks,
  ]
  return {
    id: benchmark.id,
    suite: "intent",
    passed: passed(checks),
    checks,
    signalCount: prepared.traces[0]?.signals.length ?? 0,
    derivedFacts: derived.facts,
  }
}

async function prepareCase(
  title: string,
  graph: Parameters<typeof compileAgentElectricalGraph>[1],
) {
  const project = compileAgentElectricalGraph(
    newCircuitProject(title),
    graph,
  )
  const snapshotId = newId()
  const circuit = buildElectricalCircuit(project)
  const output = await runServerSpiceSimulation({ project, engine: "ngspice" })
  const run: SimulationRun = {
    id: newId(),
    projectId: project.id,
    projectSnapshotId: snapshotId,
    createdAt: DateTime.nowUnsafe(),
    ...output,
  }
  const observation = observeRun(project, run)
  const encodedRun = Schema.encodeSync(SimulationRunSchema)(run)
  const inspection: ProjectInspectionPayload = {
    projectId: project.id,
    name: project.name,
    version: 2,
    currentSnapshotId: snapshotId,
    circuitHash: circuitHashOf(circuit),
    browserUrl: "native://benchmark",
    analysis: project.analysis,
    circuit,
    erc: runErc(project),
  }
  const evidence: SimulationEvidencePayload = {
    run: {
      id: encodedRun.id,
      projectId: encodedRun.projectId,
      projectSnapshotId: encodedRun.projectSnapshotId,
      createdAt: encodedRun.createdAt,
      engine: output.engine,
      status: simulationStatus(output),
      circuitHash: output.circuitHash,
      stale: observation.run.stale,
    },
    netlist: output.netlist,
    diagnostics: output.diagnostics,
    netVoltages: observation.netVoltages.map(({ voltage, ...measurement }) => ({
      ...measurement,
      ...(voltage === undefined ? {} : { voltage }),
    })),
    componentMeasurements: observation.componentMeasurements.map(
      ({ voltage, current, power, ...measurement }) => ({
        ...measurement,
        ...(voltage === undefined ? {} : { voltage }),
        ...(current === undefined ? {} : { current }),
        ...(power === undefined ? {} : { power }),
      }),
    ),
    probeMeasurements: observation.probeMeasurements,
    availableSignals: output.signals.map((signal) => ({
      name: signal.name,
      unit: signal.unit,
      sampleCount: signal.points.length,
    })),
    notes: observation.notes,
  }
  const traces: ReadonlyArray<TracePayload> = [
    {
      runId: run.id,
      offset: 0,
      limit: Math.max(1, ...output.signals.map((signal) => signal.points.length)),
      signals: output.signals.map((signal) => ({
        name: signal.name,
        unit: signal.unit,
        totalSamples: signal.points.length,
        points: signal.points,
      })),
      missingSignalNames: [],
    },
  ]
  return {
    inspection,
    evidence,
    traces,
  }
}

function nativeExpectationObservations(
  benchmark: CircuitBenchmarkCase,
  evidence: SimulationEvidencePayload,
  traces: ReadonlyArray<TracePayload>,
): NativeExpectationObservations {
  return {
    netVoltages: benchmark.expected.netVoltages.map((expectation) => ({
      id: expectation.name,
      expected: expectation.expected,
      actual: evidence.netVoltages.find(
        (measurement) => measurement.name === expectation.name,
      )?.voltage,
    })),
    componentMeasurements: benchmark.expected.componentMeasurements.map(
      (expectation) => ({
        id: `${expectation.refdes}.${expectation.metric}`,
        expected: expectation.expected,
        actual: evidence.componentMeasurements.find(
          (measurement) => measurement.refdes === expectation.refdes,
        )?.[expectation.metric],
      }),
    ),
    traces: benchmark.expected.traces.map((expectation) => ({
      id: `${expectation.signalName}@${expectation.atSeconds}`,
      expected: expectation.expected,
      actual: nearestSignalPoint(
        traces,
        expectation.signalName,
        expectation.atSeconds,
      )?.v,
    })),
    traceRanges: benchmark.expected.traceRanges.map((expectation) => ({
      id: `${expectation.signalName}.${expectation.metric}.${expectation.startFraction ?? 0}`,
      expected: expectation.expected,
      actual: nativeTraceMetric(
        signalPointsAfterFraction(
          traces,
          expectation.signalName,
          expectation.startFraction ?? 0,
        ),
        expectation.metric,
      ),
    })),
  }
}

function signalPoints(
  traces: ReadonlyArray<TracePayload>,
  signalName: string,
) {
  return traces.flatMap((trace) =>
    trace.signals
      .filter((signal) => signal.name === signalName)
      .flatMap((signal) => signal.points),
  )
}

function nearestSignalPoint(
  traces: ReadonlyArray<TracePayload>,
  signalName: string,
  atSeconds: number,
) {
  return signalPoints(traces, signalName).reduce<
    { readonly t: number; readonly v: number } | undefined
  >(
    (nearest, candidate) =>
      nearest === undefined ||
      Math.abs(candidate.t - atSeconds) < Math.abs(nearest.t - atSeconds)
        ? candidate
        : nearest,
    undefined,
  )
}

function signalPointsAfterFraction(
  traces: ReadonlyArray<TracePayload>,
  signalName: string,
  fraction: number,
) {
  const points = signalPoints(traces, signalName)
  const first = points[0]
  const last = points[points.length - 1]
  if (first === undefined || last === undefined) return []
  const startTime = first.t + (last.t - first.t) * fraction
  return points.filter((point) => point.t >= startTime)
}

function nativeTraceMetric(
  points: ReadonlyArray<{ readonly t: number; readonly v: number }>,
  metric: "peakToPeak" | "minimum" | "maximum" | "average",
) {
  const values = points.map((point) => point.v)
  if (values.length === 0) return undefined
  switch (metric) {
    case "peakToPeak":
      return Math.max(...values) - Math.min(...values)
    case "minimum":
      return Math.min(...values)
    case "maximum":
      return Math.max(...values)
    case "average":
      return timeWeightedAverage(points)
  }
}

function argumentValue(name: string) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

async function main() {
  const requestedCaseId = argumentValue("--case")
  const requestedCaseIds = [
    ...(requestedCaseId === undefined ? [] : [requestedCaseId]),
    ...(argumentValue("--cases")?.split(",").filter(Boolean) ?? []),
  ]
  const requested = new Set(requestedCaseIds)
  const includeDetails = process.argv.includes("--details")
  const selected = <Case extends { readonly id: string }>(
    cases: ReadonlyArray<Case>,
  ) =>
    requested.size === 0
      ? cases
      : cases.filter((benchmark) => requested.has(benchmark.id))
  const results: NativeCaseResult[] = []
  for (const benchmark of selected(circuitBenchmarkCases)) {
    results.push(await validateCircuitCase(benchmark, "release", includeDetails))
  }
  for (const benchmark of selected(frontierBenchmarkCases)) {
    results.push(await validateCircuitCase(benchmark, "frontier", includeDetails))
  }
  for (const benchmark of selected(intentBenchmarkCases)) {
    results.push(await validateIntentCase(benchmark))
  }
  const found = new Set(results.map(({ id }) => id))
  const missing = requestedCaseIds.filter((id) => !found.has(id))
  if (missing.length > 0) {
    throw new Error(`Unknown benchmark case${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`)
  }
  const failed = results.filter((result) => !result.passed)
  process.stdout.write(
    `${JSON.stringify(
      {
        engine: "ngspice",
        caseCount: results.length,
        passed: results.length - failed.length,
        failed: failed.length,
        suites: Object.fromEntries(
          (["release", "frontier", "intent"] as const).map((suite) => {
            const cases = results.filter((result) => result.suite === suite)
            return [
              suite,
              {
                caseCount: cases.length,
                passed: cases.filter((result) => result.passed).length,
              },
            ]
          }),
        ),
        failures: failed.map((result) => ({
          id: result.id,
          suite: result.suite,
          checks: result.checks.filter((check) => check._tag === "Failed"),
        })),
        cases: results.map(({ checks: _checks, ...result }) => result),
      },
      null,
      2,
    )}\n`,
  )
  if (failed.length > 0) process.exitCode = 1
}

await Effect.runPromise(
  Effect.tryPromise({
    try: main,
    catch: (error) =>
      new NativeBenchmarkExecutionFailed({
        message: error instanceof Error ? error.message : String(error),
      }),
  }).pipe(
    Effect.match({
      onFailure: (error) => {
        process.stderr.write(`${JSON.stringify(error)}\n`)
        process.exitCode = 1
      },
      onSuccess: () => undefined,
    }),
  ),
)
