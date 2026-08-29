import { Data, Effect, Result, Schema } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { recordSimulationRun, type ProjectPersistenceError } from "../persistence/project-store"
import {
  CircuitProjectSchema,
  type CircuitProject,
} from "@circuit-sim/core/circuit/project"
import {
  SimulationOutputSchema,
  type SpiceEnginePreference,
  type SimulationOutput,
} from "@circuit-sim/core/simulation/result"
import type { SimulationRun } from "@circuit-sim/core/simulation/simulation-run"

type EncodedCircuitProject = typeof CircuitProjectSchema.Encoded
type EncodedSimulationOutput = typeof SimulationOutputSchema.Encoded

export type ServerSimulationRunner = (request: {
  readonly data: {
    readonly project: EncodedCircuitProject
    readonly engine: SpiceEnginePreference
  }
}) => Promise<EncodedSimulationOutput>

export class SimulationRequestError extends Data.TaggedError(
  "SimulationRequestError",
)<{ readonly cause: unknown }> {}

export function simulationRequestErrorMessage(error: unknown): string {
  const cause =
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "SimulationRequestError" &&
    "cause" in error
      ? error.cause
      : error
  const detail = cause instanceof Error ? cause.message : String(cause)
  return `The simulation request failed before a simulator result was returned: ${detail}`
}

export type SimulationRunOutcome =
  | {
      readonly _tag: "Saved"
      readonly run: SimulationRun
    }
  | {
      readonly _tag: "PersistenceFailure"
      readonly output: SimulationOutput
      readonly error: ProjectPersistenceError
    }

export function makeSimulationRunAtom(runServerSimulation: ServerSimulationRunner) {
  return Atom.fn<{
    readonly project: CircuitProject
    readonly engine: SpiceEnginePreference
  }>()(({ project, engine }) =>
    Effect.gen(function*() {
      const output = yield* Effect.tryPromise({
        try: async () => {
          const encodedProject = await Schema.encodePromise(CircuitProjectSchema)(
            project,
          )
          const encodedOutput = await runServerSimulation({
            data: { project: encodedProject, engine },
          })
          return Schema.decodePromise(SimulationOutputSchema, {
            onExcessProperty: "error",
          })(encodedOutput)
        },
        catch: (cause) => new SimulationRequestError({ cause }),
      })

      const persisted = yield* Effect.result(
        recordSimulationRun({ project, output }),
      )
      return Result.match(persisted, {
        onFailure: (error): SimulationRunOutcome => ({
          _tag: "PersistenceFailure",
          output,
          error,
        }),
        onSuccess: (run): SimulationRunOutcome => ({ _tag: "Saved", run }),
      })
    }),
  )
}
