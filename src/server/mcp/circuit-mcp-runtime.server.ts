import { Effect, Layer, ManagedRuntime, Schema } from "effect"
import {
  AgentIdentity,
  AgentOwnerIdSchema,
} from "@circuit-sim/core/agent/project-workflow"
import {
  AgentSimulator,
  AgentSimulatorUnavailable,
} from "@circuit-sim/core/agent/simulation-workflow"
import { SimulationOutputSchema } from "@circuit-sim/core/simulation/result"
import { makeAgentPersistenceLayer } from "@/server/agent/postgres-agent-repository.server"
import { runServerSpiceSimulation } from "@/server/simulation/run-simulation.server"
import type { CircuitMcpRuntime } from "./circuit-mcp.server"

const LOCAL_PILOT_OWNER = Schema.decodeUnknownSync(AgentOwnerIdSchema)(
  "local-pilot-user",
)

export function makeCircuitMcpRuntime(
  databaseUrl: string,
): CircuitMcpRuntime {
  const identity = Layer.succeed(AgentIdentity, {
    ownerId: LOCAL_PILOT_OWNER,
  })
  const simulator = Layer.succeed(AgentSimulator, {
    run: (project) =>
      Effect.tryPromise({
        try: async () => {
          const output = await runServerSpiceSimulation({
            project,
            engine: "ngspice",
          })
          return Schema.decodeUnknownSync(
            Schema.toType(SimulationOutputSchema),
          )(output)
        },
        catch: (error) =>
          new AgentSimulatorUnavailable({
            message:
              error instanceof Error
                ? error.message
                : "Native ngspice execution failed unexpectedly",
          }),
      }),
  })
  const layer = Layer.mergeAll(
    identity,
    simulator,
    makeAgentPersistenceLayer(databaseUrl),
  )

  return ManagedRuntime.make(layer)
}

export const circuitAgentRuntime = makeCircuitMcpRuntime(
  process.env.DATABASE_URL ??
    "postgres://circuit_sim:circuit_sim@127.0.0.1:5432/circuit_sim",
)
