import { Context, Data, Effect, Schema } from "effect"
import {
  AgentElectricalGraphSchema,
  compileAgentElectricalGraph,
} from "./electrical-graph"
import {
  buildElectricalCircuit,
  circuitHashOf,
} from "../circuit/electrical-circuit"
import { runErc } from "../circuit/erc"
import {
  CircuitProjectSchema,
  ProjectNameSchema,
  newCircuitProject,
} from "../circuit/project"
import { IdSchema } from "../ids"

export const ProjectVersionSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1),
)
export type ProjectVersion = typeof ProjectVersionSchema.Type

export const AgentOwnerIdSchema = Schema.String.check(
  Schema.isMaxLength(128),
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/),
)
export type AgentOwnerId = typeof AgentOwnerIdSchema.Type

export const StoredAgentProjectSchema = Schema.Struct({
  ownerId: AgentOwnerIdSchema,
  version: ProjectVersionSchema,
  currentSnapshotId: IdSchema,
  project: CircuitProjectSchema,
})
export type StoredAgentProject = typeof StoredAgentProjectSchema.Type

export const AgentProjectSummarySchema = Schema.Struct({
  id: IdSchema,
  name: ProjectNameSchema,
  version: ProjectVersionSchema,
  currentSnapshotId: IdSchema,
  updatedAt: Schema.DateTimeUtcFromString,
})
export type AgentProjectSummary = typeof AgentProjectSummarySchema.Type

export const CreateAgentProjectInputSchema = Schema.Struct({
  name: ProjectNameSchema,
})
export type CreateAgentProjectInput =
  typeof CreateAgentProjectInputSchema.Type

export const ReplaceAgentProjectInputSchema = Schema.Struct({
  projectId: IdSchema,
  expectedVersion: ProjectVersionSchema,
  graph: AgentElectricalGraphSchema,
})
export type ReplaceAgentProjectInput =
  typeof ReplaceAgentProjectInputSchema.Type

export class AgentProjectNotFound extends Data.TaggedError(
  "AgentProjectNotFound",
)<{
  readonly projectId: string
}> {}

export class AgentProjectVersionConflict extends Data.TaggedError(
  "AgentProjectVersionConflict",
)<{
  readonly projectId: string
  readonly expectedVersion: number
  readonly currentVersion: number
}> {}

export class AgentProjectSnapshotNotFound extends Data.TaggedError(
  "AgentProjectSnapshotNotFound",
)<{
  readonly projectId: string
  readonly snapshotId: string
}> {}

export class AgentProjectRepositoryUnavailable extends Data.TaggedError(
  "AgentProjectRepositoryUnavailable",
)<{
  readonly operation: "create" | "list" | "get" | "get_snapshot" | "replace"
}> {}

export type AgentProjectRepositoryError =
  | AgentProjectNotFound
  | AgentProjectSnapshotNotFound
  | AgentProjectVersionConflict
  | AgentProjectRepositoryUnavailable

export interface AgentProjectRepositoryShape {
  readonly create: (
    ownerId: AgentOwnerId,
    project: typeof CircuitProjectSchema.Type,
  ) => Effect.Effect<StoredAgentProject, AgentProjectRepositoryUnavailable>
  readonly list: (
    ownerId: AgentOwnerId,
  ) => Effect.Effect<
    ReadonlyArray<AgentProjectSummary>,
    AgentProjectRepositoryUnavailable
  >
  readonly get: (
    ownerId: AgentOwnerId,
    projectId: string,
  ) => Effect.Effect<
    StoredAgentProject,
    AgentProjectNotFound | AgentProjectRepositoryUnavailable
  >
  readonly getSnapshot: (
    ownerId: AgentOwnerId,
    projectId: string,
    snapshotId: string,
  ) => Effect.Effect<
    StoredAgentProject,
    AgentProjectSnapshotNotFound | AgentProjectRepositoryUnavailable
  >
  /** Atomically replaces the project and appends its immutable snapshot. */
  readonly replaceAtVersion: (
    ownerId: AgentOwnerId,
    project: typeof CircuitProjectSchema.Type,
    expectedVersion: ProjectVersion,
  ) => Effect.Effect<StoredAgentProject, AgentProjectRepositoryError>
}

export class AgentProjectRepository extends Context.Service<
  AgentProjectRepository,
  AgentProjectRepositoryShape
>()("@circuit-sim/AgentProjectRepository") {}

export interface AgentIdentityShape {
  readonly ownerId: AgentOwnerId
}

export class AgentIdentity extends Context.Service<
  AgentIdentity,
  AgentIdentityShape
>()("@circuit-sim/AgentIdentity") {}

export type AgentProjectInspection = ReturnType<typeof inspectStoredProject>

export function createAgentProject(
  input: CreateAgentProjectInput,
): Effect.Effect<
  AgentProjectInspection,
  AgentProjectRepositoryUnavailable,
  AgentIdentity | AgentProjectRepository
> {
  return Effect.gen(function* () {
    const identity = yield* AgentIdentity
    const repository = yield* AgentProjectRepository
    const stored = yield* repository.create(
      identity.ownerId,
      newCircuitProject(input.name),
    )
    return inspectStoredProject(stored)
  })
}

export function listAgentProjects(): Effect.Effect<
  ReadonlyArray<AgentProjectSummary>,
  AgentProjectRepositoryUnavailable,
  AgentIdentity | AgentProjectRepository
> {
  return Effect.gen(function* () {
    const identity = yield* AgentIdentity
    const repository = yield* AgentProjectRepository
    return yield* repository.list(identity.ownerId)
  })
}

export function getAgentProject(
  projectId: string,
): Effect.Effect<
  AgentProjectInspection,
  AgentProjectNotFound | AgentProjectRepositoryUnavailable,
  AgentIdentity | AgentProjectRepository
> {
  return Effect.gen(function* () {
    const identity = yield* AgentIdentity
    const repository = yield* AgentProjectRepository
    return inspectStoredProject(
      yield* repository.get(identity.ownerId, projectId),
    )
  })
}

export function getAgentProjectSnapshot(
  projectId: string,
  snapshotId: string,
): Effect.Effect<
  AgentProjectInspection,
  AgentProjectSnapshotNotFound | AgentProjectRepositoryUnavailable,
  AgentIdentity | AgentProjectRepository
> {
  return Effect.gen(function* () {
    const identity = yield* AgentIdentity
    const repository = yield* AgentProjectRepository
    return inspectStoredProject(
      yield* repository.getSnapshot(identity.ownerId, projectId, snapshotId),
    )
  })
}

export function replaceAgentProject(
  input: ReplaceAgentProjectInput,
): Effect.Effect<
  AgentProjectInspection,
  AgentProjectRepositoryError,
  AgentIdentity | AgentProjectRepository
> {
  return Effect.gen(function* () {
    const identity = yield* AgentIdentity
    const repository = yield* AgentProjectRepository
    const current = yield* repository.get(identity.ownerId, input.projectId)

    if (current.version !== input.expectedVersion) {
      return yield* Effect.fail(
        new AgentProjectVersionConflict({
          projectId: input.projectId,
          expectedVersion: input.expectedVersion,
          currentVersion: current.version,
        }),
      )
    }

    const replacement = compileAgentElectricalGraph(current.project, input.graph)
    return inspectStoredProject(
      yield* repository.replaceAtVersion(
        identity.ownerId,
        replacement,
        input.expectedVersion,
      ),
    )
  })
}

function inspectStoredProject(stored: StoredAgentProject) {
  const circuit = buildElectricalCircuit(stored.project)
  return {
    projectId: stored.project.id,
    name: stored.project.name,
    version: stored.version,
    currentSnapshotId: stored.currentSnapshotId,
    project: stored.project,
    circuit,
    circuitHash: circuitHashOf(circuit),
    erc: runErc(stored.project),
  }
}
