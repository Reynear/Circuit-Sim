import { resolve } from "node:path"
import { Effect, Schema } from "effect"
import {
  IntentBenchmarkOptionsSchema,
  runIntentBenchmark,
} from "./intent-runner"

const arguments_ = parseArguments(process.argv.slice(2))
await Effect.runPromise(
  Schema.decodeUnknownEffect(IntentBenchmarkOptionsSchema)({
    client:
      arguments_.client ?? process.env.CIRCUIT_SIM_BENCHMARK_CLIENT ?? "pi",
    endpoint:
      process.env.CIRCUIT_SIM_MCP_URL ?? "http://127.0.0.1:3000/mcp",
    artifactRoot: resolve(
      process.env.CIRCUIT_SIM_BENCHMARK_ARTIFACTS ?? "artifacts/benchmarks",
    ),
    ...(arguments_.model ?? process.env.CIRCUIT_SIM_BENCHMARK_MODEL) ===
    undefined
      ? {}
      : {
          builderModel:
            arguments_.model ?? process.env.CIRCUIT_SIM_BENCHMARK_MODEL,
        },
    judgeModel:
      arguments_.judgeModel ??
      process.env.CIRCUIT_SIM_INTENT_JUDGE_MODEL ??
      "openai-codex/gpt-5.6-sol",
    timeoutMs: Number(
      process.env.CIRCUIT_SIM_BENCHMARK_TIMEOUT_MS ?? 300_000,
    ),
  }).pipe(
    Effect.flatMap(runIntentBenchmark),
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
            metadata: result.metadata,
            ...result.summary,
          })}\n`,
        )
      },
    }),
  ),
)

function parseArguments(arguments_: ReadonlyArray<string>) {
  const values: {
    client?: string
    model?: string
    judgeModel?: string
  } = {}
  for (let index = 0; index < arguments_.length; index += 1) {
    const key = arguments_[index]
    const value = arguments_[index + 1]
    if (key === "--client" && value) values.client = value
    if (key === "--model" && value) values.model = value
    if (key === "--judge-model" && value) values.judgeModel = value
    if (key?.startsWith("--") && value) index += 1
  }
  return values
}
