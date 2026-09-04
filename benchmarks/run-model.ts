import { resolve } from "node:path"
import { Effect, Schema } from "effect"
import {
  ModelBenchmarkOptionsSchema,
  runModelBenchmark,
} from "./model-runner"

const arguments_ = parseArguments(process.argv.slice(2))
await Effect.runPromise(
  Schema.decodeUnknownEffect(ModelBenchmarkOptionsSchema)({
    client: arguments_.client ?? process.env.CIRCUIT_SIM_BENCHMARK_CLIENT ?? "pi",
    profile:
      arguments_.profile ?? process.env.CIRCUIT_SIM_BENCHMARK_PROFILE ?? "smoke",
    endpoint:
      process.env.CIRCUIT_SIM_MCP_URL ?? "http://127.0.0.1:3000/mcp",
    artifactRoot: resolve(
      process.env.CIRCUIT_SIM_BENCHMARK_ARTIFACTS ?? "artifacts/benchmarks",
    ),
    ...(arguments_.model ?? process.env.CIRCUIT_SIM_BENCHMARK_MODEL) === undefined
      ? {}
      : { model: arguments_.model ?? process.env.CIRCUIT_SIM_BENCHMARK_MODEL },
    timeoutMs: Number(process.env.CIRCUIT_SIM_BENCHMARK_TIMEOUT_MS ?? 300_000),
  }).pipe(
    Effect.flatMap(runModelBenchmark),
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
            client: result.client,
            profile: result.profile,
            termination: result.termination,
            ...result.summary,
          })}\n`,
        )
      },
    }),
  ),
)

function parseArguments(arguments_: ReadonlyArray<string>) {
  const values: { client?: string; profile?: string; model?: string } = {}
  for (let index = 0; index < arguments_.length; index += 1) {
    const key = arguments_[index]
    const value = arguments_[index + 1]
    if (key === "--client" && value) values.client = value
    if (key === "--profile" && value) values.profile = value
    if (key === "--model" && value) values.model = value
    if (key?.startsWith("--") && value) index += 1
  }
  return values
}
