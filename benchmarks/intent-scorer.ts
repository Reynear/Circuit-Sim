import type { ProjectInspectionPayload, SimulationEvidencePayload, TracePayload } from "./mcp-payloads"
import type { BenchmarkCheck, CircuitBenchmarkCase } from "./schema"
import type { IntentCase } from "./intent-schema"
import {
  modelMaximumTimeStepMs,
  scoreModelInspection,
  scoreSimulation,
} from "./scorer"

export function intentOracleBenchmark(intent: IntentCase): CircuitBenchmarkCase {
  return {
    id: intent.id,
    title: intent.title,
    prompt: intent.prompt,
    smoke: false,
    graph: intent.oracleGraph,
    expected: intent.expected,
  }
}

export function scoreIntentInspection(
  intent: IntentCase,
  inspection: ProjectInspectionPayload,
): ReadonlyArray<BenchmarkCheck> {
  const benchmark = intentOracleBenchmark(intent)
  const inspectionChecks = intent.topologyMode === "exact"
    ? scoreModelInspection(benchmark, inspection).checks.filter(
        (check) => check.id !== "analysis",
      )
    : behavioralInspectionChecks(intent, inspection)
  const maximumTimeStepMs = modelMaximumTimeStepMs(benchmark)
  const analysisCompatible =
    inspection.analysis.durationMs >= intent.minimumDurationMs &&
    inspection.analysis.timeStepMs <= maximumTimeStepMs
  const analysisCheck: BenchmarkCheck = analysisCompatible
    ? {
        _tag: "Passed",
        id: "analysis",
        message:
          "Saved transient analysis is long and fine enough to demonstrate the requested behavior",
      }
    : {
        _tag: "Failed",
        id: "analysis",
        message:
          "Saved transient analysis is too short or coarse to demonstrate the requested behavior",
        expected: {
          minimumDurationMs: intent.minimumDurationMs,
          maximumTimeStepMs,
        },
        actual: inspection.analysis,
      }
  return [...inspectionChecks, analysisCheck]
}

export function scoreIntentSimulation(
  intent: IntentCase,
  inspection: ProjectInspectionPayload,
  evidence: SimulationEvidencePayload,
  traces: ReadonlyArray<TracePayload>,
): ReadonlyArray<BenchmarkCheck> {
  const match = intent.topologyMode === "exact"
    ? scoreModelInspection(intentOracleBenchmark(intent), inspection).match
    : undefined
  return scoreSimulation(
    intentOracleBenchmark(intent),
    inspection,
    evidence,
    traces,
    match,
  )
}

function behavioralInspectionChecks(
  intent: IntentCase,
  inspection: ProjectInspectionPayload,
): ReadonlyArray<BenchmarkCheck> {
  const requiredCounts = componentTypeCounts(intent.requiredComponentTypes)
  const availableCounts = componentTypeCounts(
    inspection.circuit.components.map((component) => component.type),
  )
  const missingComponents = [...requiredCounts].flatMap(
    ([type, minimumCount]) => {
      const actualCount = availableCounts.get(type) ?? 0
      return actualCount >= minimumCount
        ? []
        : [{ type, minimumCount, actualCount }]
    },
  )
  const availableNets = new Set(
    inspection.circuit.nets.map((net) => net.name),
  )
  const missingNets = intent.expected.requiredNetNames.filter(
    (name) => !availableNets.has(name),
  )
  const ercErrors = inspection.erc.filter(
    (issue) =>
      typeof issue === "object" &&
      issue !== null &&
      "severity" in issue &&
      issue.severity === "error",
  )
  return [
    missingComponents.length === 0
      ? {
          _tag: "Passed",
          id: "behavior.required-components",
          message: "The circuit includes every device family and minimum count required by the behavioral contract",
        }
      : {
          _tag: "Failed",
          id: "behavior.required-components",
          message: "The circuit is missing devices required by the behavioral contract",
          expected: [...requiredCounts].map(([type, minimumCount]) => ({
            type,
            minimumCount,
          })),
          actual: [...availableCounts].map(([type, count]) => ({ type, count })),
        },
    missingNets.length === 0
      ? {
          _tag: "Passed",
          id: "behavior.required-nets",
          message: "The circuit preserves every named behavioral observation net",
        }
      : {
          _tag: "Failed",
          id: "behavior.required-nets",
          message: "The circuit is missing named behavioral observation nets",
          expected: intent.expected.requiredNetNames,
          actual: [...availableNets],
        },
    ercErrors.length === 0
      ? {
          _tag: "Passed",
          id: "erc",
          message: "ERC reports no errors",
        }
      : {
          _tag: "Failed",
          id: "erc",
          message: "ERC reports errors",
          expected: [],
          actual: ercErrors,
        },
  ]
}

function componentTypeCounts(types: ReadonlyArray<string>) {
  return types.reduce((counts, type) => {
    counts.set(type, (counts.get(type) ?? 0) + 1)
    return counts
  }, new Map<string, number>())
}
