import { resolve } from "node:path"
import { Effect } from "effect"
import { runSdkBenchmark } from "./sdk-runner"

const endpoint = new URL(
  process.env.CIRCUIT_SIM_MCP_URL ?? "http://127.0.0.1:3000/mcp",
)
const artifactRoot = resolve(
  process.env.CIRCUIT_SIM_BENCHMARK_ARTIFACTS ?? "artifacts/benchmarks",
)

await Effect.runPromise(
  runSdkBenchmark({ endpoint, artifactRoot }).pipe(
    Effect.match({
      onFailure: (error) => {
        process.stderr.write(`${JSON.stringify(error)}\n`)
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
