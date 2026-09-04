import { Context, Effect, Layer, Schema } from "effect"
import { Pool, type PoolClient } from "pg"
import {
  AgentProjectNotFound,
  AgentProjectRepository,
  AgentProjectRepositoryUnavailable,
  AgentProjectSnapshotNotFound,
  AgentProjectVersionConflict,
  StoredAgentProjectSchema,
  type AgentOwnerId,
  type AgentProjectRepositoryShape,
  type ProjectVersion,
  type StoredAgentProject,
} from "@circuit-sim/core/agent/project-workflow"
import {
  AgentSimulationRepository,
  AgentSimulationRepositoryUnavailable,
  AgentSimulationRunNotFound,
  StoredAgentSimulationRunSchema,
  type AgentSimulationRepositoryShape,
  type StoredAgentSimulationRun,
} from "@circuit-sim/core/agent/simulation-workflow"
import {
  CircuitProjectSchema,
  type CircuitProject,
} from "@circuit-sim/core/circuit/project"
import { newId } from "@circuit-sim/core/ids"
import {
  SimulationRunSchema,
  type SimulationRun,
} from "@circuit-sim/core/simulation/simulation-run"

type AgentDatabaseShape = {
  readonly pool: Pool
  readonly initialized: Promise<void>
}

class AgentDatabase extends Context.Service<AgentDatabase, AgentDatabaseShape>()(
  "@circuit-sim/AgentDatabase",
) {}

export function makeAgentPersistenceLayer(databaseUrl: string) {
  const database = Layer.effect(
    AgentDatabase,
    Effect.acquireRelease(
      Effect.sync(() => {
        const pool = new Pool({ connectionString: databaseUrl })
        return {
          pool,
          initialized: pool.query(AGENT_SCHEMA_SQL).then(() => undefined),
        }
      }),
      ({ pool }) => Effect.promise(() => pool.end()),
    ),
  )
  const projects = Layer.effect(
    AgentProjectRepository,
    Effect.map(AgentDatabase, makeProjectRepository),
  )
  const simulations = Layer.effect(
    AgentSimulationRepository,
    Effect.map(AgentDatabase, makeSimulationRepository),
  )

  return Layer.mergeAll(projects, simulations).pipe(Layer.provide(database))
}

type ProjectRow = {
  readonly owner_id: unknown
  readonly version: unknown
  readonly current_snapshot_id: unknown
  readonly project_json: unknown
}

const ProjectRowSchema = Schema.Struct({
  owner_id: Schema.String,
  version: Schema.Int,
  current_snapshot_id: Schema.String,
  project_json: CircuitProjectSchema,
})

function makeProjectRepository(
  database: AgentDatabaseShape,
): AgentProjectRepositoryShape {
  return {
    create: (ownerId, project) =>
      repositoryEffect("create", async () => {
        await database.initialized
        const currentSnapshotId = newId()
        const projectJson = JSON.stringify(
          Schema.encodeSync(CircuitProjectSchema)(project),
        )
        return withTransaction(database.pool, async (client) => {
          await client.query(
            `INSERT INTO agent_projects
              (id, owner_id, version, current_snapshot_id, project_json)
             VALUES ($1, $2, 1, $3, $4::jsonb)`,
            [project.id, ownerId, currentSnapshotId, projectJson],
          )
          await client.query(
            `INSERT INTO agent_project_snapshots
              (id, project_id, owner_id, version, project_json)
             VALUES ($1, $2, $3, 1, $4::jsonb)`,
            [currentSnapshotId, project.id, ownerId, projectJson],
          )
          return decodeProjectRow({
            owner_id: ownerId,
            version: 1,
            current_snapshot_id: currentSnapshotId,
            project_json: Schema.encodeSync(CircuitProjectSchema)(project),
          })
        })
      }),
    list: (ownerId) =>
      repositoryEffect("list", async () => {
        await database.initialized
        const result = await database.pool.query<ProjectRow>(
          `SELECT owner_id, version, current_snapshot_id, project_json
           FROM agent_projects
           WHERE owner_id = $1
           ORDER BY updated_at DESC, id ASC`,
          [ownerId],
        )
        return result.rows.map(decodeProjectRow).map((record) => ({
          id: record.project.id,
          name: record.project.name,
          version: record.version,
          currentSnapshotId: record.currentSnapshotId,
          updatedAt: record.project.updatedAt,
        }))
      }),
    get: (ownerId, projectId) =>
      repositoryEffect("get", async () => {
        await database.initialized
        const result = await database.pool.query<ProjectRow>(
          `SELECT owner_id, version, current_snapshot_id, project_json
           FROM agent_projects
           WHERE owner_id = $1 AND id = $2`,
          [ownerId, projectId],
        )
        return result.rows[0] ? decodeProjectRow(result.rows[0]) : undefined
      }).pipe(
        Effect.flatMap((record) =>
          record
            ? Effect.succeed(record)
            : Effect.fail(new AgentProjectNotFound({ projectId })),
        ),
      ),
    getSnapshot: (ownerId, projectId, snapshotId) =>
      repositoryEffect("get_snapshot", async () => {
        await database.initialized
        const result = await database.pool.query<ProjectRow>(
          `SELECT owner_id, version, id AS current_snapshot_id, project_json
           FROM agent_project_snapshots
           WHERE owner_id = $1 AND project_id = $2 AND id = $3`,
          [ownerId, projectId, snapshotId],
        )
        return result.rows[0] ? decodeProjectRow(result.rows[0]) : undefined
      }).pipe(
        Effect.flatMap((record) =>
          record
            ? Effect.succeed(record)
            : Effect.fail(
                new AgentProjectSnapshotNotFound({ projectId, snapshotId }),
              ),
        ),
      ),
    replaceAtVersion: (ownerId, project, expectedVersion) =>
      replaceProject(database, ownerId, project, expectedVersion),
  }
}

type ReplaceResult =
  | { readonly kind: "success"; readonly record: StoredAgentProject }
  | { readonly kind: "not-found" }
  | { readonly kind: "conflict"; readonly currentVersion: number }

function replaceProject(
  database: AgentDatabaseShape,
  ownerId: AgentOwnerId,
  project: CircuitProject,
  expectedVersion: ProjectVersion,
): Effect.Effect<
  StoredAgentProject,
  | AgentProjectNotFound
  | AgentProjectVersionConflict
  | AgentProjectRepositoryUnavailable
> {
  return repositoryEffect("replace", async (): Promise<ReplaceResult> => {
    await database.initialized
    return withTransaction(database.pool, async (client) => {
      const selected = await client.query<{ version: number }>(
        `SELECT version
         FROM agent_projects
         WHERE owner_id = $1 AND id = $2
         FOR UPDATE`,
        [ownerId, project.id],
      )
      const current = selected.rows[0]
      if (!current) return { kind: "not-found" }
      if (current.version !== expectedVersion) {
        return { kind: "conflict", currentVersion: current.version }
      }

      const version = current.version + 1
      const currentSnapshotId = newId()
      const encodedProject = Schema.encodeSync(CircuitProjectSchema)(project)
      const projectJson = JSON.stringify(encodedProject)
      await client.query(
        `INSERT INTO agent_project_snapshots
          (id, project_id, owner_id, version, project_json)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [currentSnapshotId, project.id, ownerId, version, projectJson],
      )
      await client.query(
        `UPDATE agent_projects
         SET version = $3,
             current_snapshot_id = $4,
             project_json = $5::jsonb,
             updated_at = now()
         WHERE owner_id = $1 AND id = $2`,
        [ownerId, project.id, version, currentSnapshotId, projectJson],
      )
      return {
        kind: "success",
        record: decodeProjectRow({
          owner_id: ownerId,
          version,
          current_snapshot_id: currentSnapshotId,
          project_json: encodedProject,
        }),
      }
    })
  }).pipe(
    Effect.flatMap((result) =>
      resolveReplaceResult(result, project.id, expectedVersion),
    ),
  )
}

function resolveReplaceResult(
  result: ReplaceResult,
  projectId: string,
  expectedVersion: ProjectVersion,
): Effect.Effect<
  StoredAgentProject,
  AgentProjectNotFound | AgentProjectVersionConflict
> {
  switch (result.kind) {
    case "success":
      return Effect.succeed(result.record)
    case "not-found":
      return Effect.fail(new AgentProjectNotFound({ projectId }))
    case "conflict":
      return Effect.fail(
        new AgentProjectVersionConflict({
          projectId,
          expectedVersion,
          currentVersion: result.currentVersion,
        }),
      )
  }
}

type RunRow = {
  readonly owner_id: unknown
  readonly run_json: unknown
}

const RunRowSchema = Schema.Struct({
  owner_id: Schema.String,
  run_json: SimulationRunSchema,
})

function makeSimulationRepository(
  database: AgentDatabaseShape,
): AgentSimulationRepositoryShape {
  return {
    insert: (ownerId, run) =>
      simulationRepositoryEffect("insert", async () => {
        await database.initialized
        const runJson = JSON.stringify(Schema.encodeSync(SimulationRunSchema)(run))
        const result = await database.pool.query(
          `INSERT INTO agent_simulation_runs
            (id, owner_id, project_id, project_snapshot_id, run_json)
           SELECT $1, $2, $3, $4, $5::jsonb
           WHERE EXISTS (
             SELECT 1
             FROM agent_project_snapshots
             WHERE id = $4 AND project_id = $3 AND owner_id = $2
           )`,
          [run.id, ownerId, run.projectId, run.projectSnapshotId, runJson],
        )
        if (result.rowCount !== 1) {
          throw new Error("Simulation snapshot ownership check failed")
        }
        return decodeRunRow({
          owner_id: ownerId,
          run_json: Schema.encodeSync(SimulationRunSchema)(run),
        })
      }),
    get: (ownerId, runId) =>
      simulationRepositoryEffect("get", async () => {
        await database.initialized
        const result = await database.pool.query<RunRow>(
          `SELECT owner_id, run_json
           FROM agent_simulation_runs
           WHERE owner_id = $1 AND id = $2`,
          [ownerId, runId],
        )
        return result.rows[0] ? decodeRunRow(result.rows[0]) : undefined
      }).pipe(
        Effect.flatMap((record) =>
          record
            ? Effect.succeed(record)
            : Effect.fail(new AgentSimulationRunNotFound({ runId })),
        ),
      ),
    listByProject: (ownerId, projectId) =>
      simulationRepositoryEffect("list", async () => {
        await database.initialized
        const result = await database.pool.query<RunRow>(
          `SELECT owner_id, run_json
           FROM agent_simulation_runs
           WHERE owner_id = $1 AND project_id = $2
           ORDER BY created_at DESC, id ASC`,
          [ownerId, projectId],
        )
        return result.rows.map(decodeRunRow)
      }),
  }
}

function decodeProjectRow(row: ProjectRow): StoredAgentProject {
  const decoded = Schema.decodeUnknownSync(ProjectRowSchema)(row)
  return Schema.decodeUnknownSync(Schema.toType(StoredAgentProjectSchema))({
    ownerId: decoded.owner_id,
    version: decoded.version,
    currentSnapshotId: decoded.current_snapshot_id,
    project: decoded.project_json,
  })
}

function decodeRunRow(row: RunRow): StoredAgentSimulationRun {
  const decoded = Schema.decodeUnknownSync(RunRowSchema)(row)
  return Schema.decodeUnknownSync(
    Schema.toType(StoredAgentSimulationRunSchema),
  )({ ownerId: decoded.owner_id, run: decoded.run_json })
}

function repositoryEffect<A>(
  operation: AgentProjectRepositoryUnavailable["operation"],
  run: () => Promise<A>,
) {
  return Effect.tryPromise({
    try: run,
    catch: () => new AgentProjectRepositoryUnavailable({ operation }),
  })
}

function simulationRepositoryEffect<A>(
  operation: AgentSimulationRepositoryUnavailable["operation"],
  run: () => Promise<A>,
) {
  return Effect.tryPromise({
    try: run,
    catch: () => new AgentSimulationRepositoryUnavailable({ operation }),
  })
}

async function withTransaction<A>(
  pool: Pool,
  use: (client: PoolClient) => Promise<A>,
): Promise<A> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const value = await use(client)
    await client.query("COMMIT")
    return value
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

const AGENT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agent_projects (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  current_snapshot_id uuid NOT NULL,
  project_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id)
);

CREATE TABLE IF NOT EXISTS agent_project_snapshots (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES agent_projects(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  project_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

CREATE INDEX IF NOT EXISTS agent_projects_owner_updated_idx
  ON agent_projects (owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_simulation_runs (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  project_id uuid NOT NULL REFERENCES agent_projects(id) ON DELETE CASCADE,
  project_snapshot_id uuid NOT NULL REFERENCES agent_project_snapshots(id) ON DELETE CASCADE,
  run_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_simulation_runs_owner_project_idx
  ON agent_simulation_runs (owner_id, project_id, created_at DESC);
`
