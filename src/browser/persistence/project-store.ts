import { Data, DateTime, Effect, Option, Schema } from "effect"
import { newId } from "@circuit-sim/core/ids"
import type { CircuitProject } from "@circuit-sim/core/circuit/project"
import type { SimulationOutput } from "@circuit-sim/core/simulation/result"
import {
  ProjectSummarySchema,
  type EncodedProjectSummary,
  type ProjectSummary,
} from "./project-summary"
import {
  SimulationRunSchema,
  type SimulationRun,
} from "@circuit-sim/core/simulation/simulation-run"
import {
  db,
  ProjectSnapshotRecordSchema,
  type EncodedProjectSnapshotRecord,
  type SnapshotReason,
} from "./db"

export class InvalidProjectDocument extends Data.TaggedError(
  "InvalidProjectDocument",
)<{
  readonly projectId: string
  readonly snapshotId: string
  readonly details: string
}> {}

export class InvalidProjectSummary extends Data.TaggedError(
  "InvalidProjectSummary",
)<{
  readonly details: string
}> {}

export class MissingProjectSnapshot extends Data.TaggedError(
  "MissingProjectSnapshot",
)<{
  readonly projectId: string
  readonly snapshotId?: string
}> {}

export class InvalidSimulationRun extends Data.TaggedError(
  "InvalidSimulationRun",
)<{
  readonly runId: string
  readonly details: string
}> {}

export class ProjectPersistenceError extends Data.TaggedError(
  "ProjectPersistenceError",
)<{
  readonly operation: string
  readonly cause: unknown
}> {}

export type ProjectLoadError =
  | InvalidProjectDocument
  | InvalidProjectSummary
  | MissingProjectSnapshot
  | ProjectPersistenceError

export function listProjects(): Effect.Effect<
  ProjectSummary[],
  InvalidProjectSummary | ProjectPersistenceError
> {
  return Effect.gen(function*() {
    const records = yield* persistenceOperation("list projects", () =>
      db.projects.orderBy("updatedAt").reverse().toArray(),
    )
    return yield* Effect.forEach(records, decodeProjectSummary)
  })
}

export function createProject(
  project: CircuitProject,
): Effect.Effect<EncodedProjectSummary, ProjectPersistenceError> {
  return Effect.gen(function*() {
    const snapshot = createSnapshotRecord(project, "initial")
    const record = encodeProjectSummary(project, snapshot.id)

    yield* persistenceOperation("create project", () =>
      db.transaction("rw", db.projects, db.snapshots, async () => {
        await db.snapshots.put(snapshot)
        await db.projects.put(record)
      }),
    )

    return record
  })
}

export function saveProjectSnapshot(
  project: CircuitProject,
  reason: SnapshotReason,
): Effect.Effect<EncodedProjectSnapshotRecord, ProjectPersistenceError> {
  return Effect.gen(function*() {
    const snapshot = createSnapshotRecord(project, reason)
    const record = encodeProjectSummary(project, snapshot.id)

    yield* persistenceOperation("save project snapshot", () =>
      db.transaction("rw", db.projects, db.snapshots, async () => {
        await db.snapshots.put(snapshot)
        await db.projects.put(record)
      }),
    )

    return snapshot
  })
}

export function loadLatestProject(
  projectId: string,
): Effect.Effect<Option.Option<CircuitProject>, ProjectLoadError> {
  return Effect.gen(function*() {
    const record = yield* persistenceOperation("load project record", () =>
      db.projects.get(projectId),
    )
    if (!record) {
      return Option.none<CircuitProject>()
    }
    const summary = yield* decodeProjectSummary(record)

    const snapshot = yield* persistenceOperation(
      "load current project snapshot",
      () => db.snapshots.get(summary.currentSnapshotId),
    )
    if (!snapshot) {
      return yield* new MissingProjectSnapshot({
        projectId,
        snapshotId: summary.currentSnapshotId,
      })
    }

    const decodedSnapshot = yield* Schema.decodeUnknownEffect(
      ProjectSnapshotRecordSchema,
      { onExcessProperty: "error" },
    )(snapshot).pipe(
      Effect.mapError(
        (error) =>
          new InvalidProjectDocument({
            projectId,
            snapshotId: snapshot.id,
            details: String(error),
          }),
      ),
    )
    return Option.some(decodedSnapshot.document)
  })
}

export function deleteProject(
  projectId: string,
): Effect.Effect<void, ProjectPersistenceError> {
  return persistenceOperation("delete project", () =>
    db.transaction(
      "rw",
      db.projects,
      db.snapshots,
      db.simulationRuns,
      async () => {
        const snapshots = await db.snapshots
          .where("projectId")
          .equals(projectId)
          .toArray()
        const simulationRuns = await db.simulationRuns
          .where("projectId")
          .equals(projectId)
          .toArray()
        await db.snapshots.bulkDelete(snapshots.map((snapshot) => snapshot.id))
        await db.simulationRuns.bulkDelete(simulationRuns.map((run) => run.id))
        await db.projects.delete(projectId)
      },
    ),
  )
}

/** Stores a simulation result together with the exact project document it used. */
export function recordSimulationRun(record: {
  readonly project: CircuitProject
  readonly output: SimulationOutput
}): Effect.Effect<SimulationRun, ProjectPersistenceError> {
  return Effect.gen(function*() {
    const snapshot = createSnapshotRecord(record.project, "simulation")
    const summary = encodeProjectSummary(record.project, snapshot.id)
    const run: SimulationRun = {
      id: newId(),
      projectId: record.project.id,
      projectSnapshotId: snapshot.id,
      createdAt: DateTime.nowUnsafe(),
      ...record.output,
    }
    const encodedRun = Schema.encodeSync(SimulationRunSchema)(run)

    yield* persistenceOperation("record simulation run", () =>
      db.transaction(
        "rw",
        db.projects,
        db.snapshots,
        db.simulationRuns,
        async () => {
          await db.snapshots.put(snapshot)
          await db.projects.put(summary)
          await db.simulationRuns.put(encodedRun)
        },
      ),
    )

    return run
  })
}

export function loadSimulationRun(
  runId: string,
): Effect.Effect<
  Option.Option<SimulationRun>,
  InvalidSimulationRun | ProjectPersistenceError
> {
  return Effect.gen(function*() {
    const record = yield* persistenceOperation("load simulation run", () =>
      db.simulationRuns.get(runId),
    )
    if (!record) {
      return Option.none<SimulationRun>()
    }
    const run = yield* Schema.decodeUnknownEffect(SimulationRunSchema, {
      onExcessProperty: "error",
    })(record).pipe(
      Effect.mapError(
        (error) =>
          new InvalidSimulationRun({
            runId,
            details: String(error),
          }),
      ),
    )
    return Option.some(run)
  })
}

function encodeProjectSummary(
  project: CircuitProject,
  currentSnapshotId: string,
): EncodedProjectSummary {
  const summary: ProjectSummary = {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    currentSnapshotId,
  }
  return Schema.encodeSync(ProjectSummarySchema)(summary)
}

function decodeProjectSummary(
  record: unknown,
): Effect.Effect<ProjectSummary, InvalidProjectSummary> {
  return Schema.decodeUnknownEffect(ProjectSummarySchema, {
    onExcessProperty: "error",
  })(record).pipe(
    Effect.mapError(
      (error) =>
        new InvalidProjectSummary({
          details: String(error),
        }),
    ),
  )
}

function createSnapshotRecord(
  project: CircuitProject,
  reason: SnapshotReason,
): EncodedProjectSnapshotRecord {
  return Schema.encodeSync(ProjectSnapshotRecordSchema)({
    id: newId(),
    projectId: project.id,
    createdAt: DateTime.nowUnsafe(),
    reason,
    document: project,
  })
}

function persistenceOperation<A>(
  operation: string,
  evaluate: () => PromiseLike<A>,
): Effect.Effect<A, ProjectPersistenceError> {
  return Effect.tryPromise({
    try: evaluate,
    catch: (cause) => new ProjectPersistenceError({ operation, cause }),
  })
}
