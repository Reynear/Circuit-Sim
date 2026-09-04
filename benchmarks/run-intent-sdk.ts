import { resolve } from "node:path"
import { Effect } from "effect"
import { intentBenchmarkCases } from "./cases/intent-cases"
import {
  deriveIntentEvidence,
  intentDerivedSignalNames,
} from "./intent-evidence"
import {
  intentOracleBenchmark,
  scoreIntentInspection,
  scoreIntentSimulation,
} from "./intent-scorer"
import { runSdkBenchmark } from "./sdk-runner"

const endpoint = new URL(
  process.env.CIRCUIT_SIM_MCP_URL ?? "http://127.0.0.1:3000/mcp",
)
const artifactRoot = resolve(
  process.env.CIRCUIT_SIM_BENCHMARK_ARTIFACTS ?? "artifacts/benchmarks",
)
const intentById = new Map(
  intentBenchmarkCases.map((benchmark) => [benchmark.id, benchmark]),
)
const intentFor = (id: string) => {
  const benchmark = intentById.get(id)
  if (benchmark === undefined) {
    throw new Error(`Unknown intent benchmark ${id}`)
  }
  return benchmark
}

await Effect.runPromise(
  runSdkBenchmark({
    endpoint,
    artifactRoot,
    cases: intentBenchmarkCases.map(intentOracleBenchmark),
    caseManifest: (benchmark) => intentFor(benchmark.id),
    scoreInspection: (benchmark, inspection) =>
      scoreIntentInspection(intentFor(benchmark.id), inspection),
    requiredTraceNames: (benchmark, inspection) =>
      intentDerivedSignalNames(intentFor(benchmark.id), inspection),
    scoreSimulation: (benchmark, inspection, simulation, traces) => {
      const intent = intentFor(benchmark.id)
      const derived = deriveIntentEvidence(intent, inspection, traces)
      return {
        checks: [
          ...scoreIntentSimulation(
            intent,
            inspection,
            simulation,
            traces,
          ),
          ...derived.checks,
        ],
        derivedEvidence: derived.facts,
      }
    },
  }).pipe(
    Effect.match({
      onFailure: (error) => {
        process.stderr.write(`${String(error)}\n`)
        process.exitCode = 1
      },
      onSuccess: ({ result, artifactDirectory }) => {
        process.stdout.write(
          `${JSON.stringify({
            suiteId: result.suiteId,
            artifactDirectory,
            ...result.summary,
          })}\n`,
        )
        if (!result.summary.conformancePassed || result.summary.failed > 0) {
          process.exitCode = 1
        }
      },
    }),
  ),
)
