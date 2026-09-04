import { Context, Data, DateTime, Effect, Schema } from "effect"
import {
  AgentIdentity,
  AgentProjectNotFound,
  AgentProjectRepository,
  AgentProjectRepositoryUnavailable,
  AgentProjectSnapshotNotFound,
  type AgentOwnerId,
} from "./project-workflow"
import { CircuitProjectSchema } from "../circuit/project"
import { IdSchema, newId } from "../ids"
import { observeRun } from "../simulation/run-observations"
import { SimulationOutputSchema } from "../simulation/result"
import {
  SimulationRunSchema,
  type SimulationRun,
} from "../simulation/simulation-run"

export const SimulateAgentProjectInputSchema = Schema.Struct({
  projectId: IdSchema,
})
export type SimulateAgentProjectInput =
  typeof SimulateAgentProjectInputSchema.Type

export const StoredAgentSimulationRunSchema = Schema.Struct({
  ownerId: Schema.String,
  run: SimulationRunSchema,
})
export type StoredAgentSimulationRun =
  typeof StoredAgentSimulationRunSchema.Type

export class AgentSimulatorUnavailable extends Data.TaggedError(
  "AgentSimulatorUnavailable",
)<{
  readonly message: string
}> {}

export class AgentSimulationRunNotFound extends Data.TaggedError(
  "AgentSimulationRunNotFound",
)<{
  readonly runId: string
}> {}

export class AgentSimulationRepositoryUnavailable extends Data.TaggedError(
  "AgentSimulationRepositoryUnavailable",
)<{
  readonly operation: "insert" | "get" | "list"
}> {}

export interface AgentSimulatorShape {
  readonly run: (
    project: typeof CircuitProjectSchema.Type,
  ) => Effect.Effect<
    typeof SimulationOutputSchema.Type,
    AgentSimulatorUnavailable
  >
}

export class AgentSimulator extends Context.Service<
  AgentSimulator,
  AgentSimulatorShape
>()("@circuit-sim/AgentSimulator") {}

export interface AgentSimulationRepositoryShape {
  readonly insert: (
    ownerId: AgentOwnerId,
    run: SimulationRun,
  ) => Effect.Effect<
    StoredAgentSimulationRun,
    AgentSimulationRepositoryUnavailable
  >
  readonly get: (
    ownerId: AgentOwnerId,
    runId: string,
  ) => Effect.Effect<
    StoredAgentSimulationRun,
    AgentSimulationRunNotFound | AgentSimulationRepositoryUnavailable
  >
  readonly listByProject: (
    ownerId: AgentOwnerId,
    projectId: string,
  ) => Effect.Effect<
    ReadonlyArray<StoredAgentSimulationRun>,
    AgentSimulationRepositoryUnavailable
  >
}

export class AgentSimulationRepository extends Context.Service<
  AgentSimulationRepository,
  AgentSimulationRepositoryShape
>()("@circuit-sim/AgentSimulationRepository") {}

export type AgentSimulationWorkflowError =
  | AgentProjectNotFound
  | AgentProjectRepositoryUnavailable
  | AgentSimulatorUnavailable
  | AgentSimulationRepositoryUnavailable

export type AgentSimulationEvidence = ReturnType<typeof simulationEvidence>

export function simulateAgentProject(
  input: SimulateAgentProjectInput,
): Effect.Effect<
  AgentSimulationEvidence,
  AgentSimulationWorkflowError,
  | AgentIdentity
  | AgentProjectRepository
  | AgentSimulator
  | AgentSimulationRepository
> {
  return Effect.gen(function* () {
    const identity = yield* AgentIdentity
    const projects = yield* AgentProjectRepository
    const simulator = yield* AgentSimulator
    const runs = yield* AgentSimulationRepository
    const storedProject = yield* projects.get(identity.ownerId, input.projectId)
    const output = yield* simulator.run(storedProject.project)
    const run: SimulationRun = {
      id: newId(),
      projectId: storedProject.project.id,
      projectSnapshotId: storedProject.currentSnapshotId,
      createdAt: DateTime.nowUnsafe(),
      ...output,
    }
    const storedRun = yield* runs.insert(identity.ownerId, run)
    return simulationEvidence(storedProject.project, storedRun.run)
  })
}

export function getAgentSimulationRun(
  runId: string,
): Effect.Effect<
  AgentSimulationEvidence,
  | AgentSimulationRunNotFound
  | AgentSimulationRepositoryUnavailable
  | AgentProjectSnapshotNotFound
  | AgentProjectRepositoryUnavailable,
  AgentIdentity | AgentProjectRepository | AgentSimulationRepository
> {
  return Effect.gen(function* () {
    const identity = yield* AgentIdentity
    const projects = yield* AgentProjectRepository
    const runs = yield* AgentSimulationRepository
    const storedRun = yield* runs.get(identity.ownerId, runId)
    const project = yield* projects.getSnapshot(
      identity.ownerId,
      storedRun.run.projectId,
      storedRun.run.projectSnapshotId,
    )
    return simulationEvidence(project.project, storedRun.run)
  })
}

export function listAgentSimulationRuns(
  projectId: string,
): Effect.Effect<
  ReadonlyArray<StoredAgentSimulationRun>,
  | AgentProjectNotFound
  | AgentProjectRepositoryUnavailable
  | AgentSimulationRepositoryUnavailable,
  AgentIdentity | AgentProjectRepository | AgentSimulationRepository
> {
  return Effect.gen(function* () {
    const identity = yield* AgentIdentity
    const projects = yield* AgentProjectRepository
    const runs = yield* AgentSimulationRepository
    yield* projects.get(identity.ownerId, projectId)
    return yield* runs.listByProject(identity.ownerId, projectId)
  })
}

function simulationEvidence(
  project: typeof CircuitProjectSchema.Type,
  run: SimulationRun,
) {
  return {
    run,
    observation: observeRun(project, run),
    diagnostics: run.diagnostics,
    netlist: run.netlist,
  }
}
