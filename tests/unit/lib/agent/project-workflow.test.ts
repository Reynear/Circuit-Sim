import { Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { newId } from "@circuit-sim/core/ids"
import {
  AgentIdentity,
  AgentOwnerIdSchema,
  AgentProjectNotFound,
  AgentProjectRepository,
  AgentProjectSnapshotNotFound,
  AgentProjectVersionConflict,
  ReplaceAgentProjectInputSchema,
  createAgentProject,
  getAgentProject,
  getAgentProjectSnapshot,
  listAgentProjects,
  replaceAgentProject,
  type AgentIdentityShape,
  type AgentProjectRepositoryShape,
  type StoredAgentProject,
} from "@circuit-sim/core/agent/project-workflow"

describe("agent project workflow", () => {
  it("creates, owns, lists, and atomically replaces a project", async () => {
    const memory = memoryRepository()
    const identity = localIdentity("local-pilot")
    const provide = <A, E>(effect: Effect.Effect<A, E, AgentIdentity | AgentProjectRepository>) =>
      effect.pipe(
        Effect.provideService(AgentIdentity, identity),
        Effect.provideService(AgentProjectRepository, memory.service),
      )

    const created = await Effect.runPromise(
      provide(createAgentProject({ name: "Agent divider" })),
    )

    expect(created.version).toBe(1)
    expect(created.circuit.components).toEqual([])
    expect(await Effect.runPromise(provide(listAgentProjects()))).toMatchObject([
      { id: created.projectId, name: "Agent divider", version: 1 },
    ])

    const replacement = Schema.decodeUnknownSync(ReplaceAgentProjectInputSchema)({
      projectId: created.projectId,
      expectedVersion: 1,
      graph: voltageDividerGraph(),
    })
    const updated = await Effect.runPromise(
      provide(replaceAgentProject(replacement)),
    )

    expect(updated.version).toBe(2)
    expect(updated.currentSnapshotId).not.toBe(created.currentSnapshotId)
    expect(updated.circuit.components).toHaveLength(3)
    expect(updated.erc).toEqual([])
    expect(memory.snapshots).toHaveLength(2)

    const readBack = await Effect.runPromise(
      provide(getAgentProject(created.projectId)),
    )
    expect(readBack.circuitHash).toBe(updated.circuitHash)

    const historical = await Effect.runPromise(
      provide(
        getAgentProjectSnapshot(
          created.projectId,
          created.currentSnapshotId,
        ),
      ),
    )
    expect(historical.version).toBe(1)
    expect(historical.currentSnapshotId).toBe(created.currentSnapshotId)
    expect(historical.circuit.components).toEqual([])

    const missingSnapshot = newId()
    expect(
      await Effect.runPromise(
        Effect.flip(
          provide(
            getAgentProjectSnapshot(created.projectId, missingSnapshot),
          ),
        ),
      ),
    ).toEqual(
      new AgentProjectSnapshotNotFound({
        projectId: created.projectId,
        snapshotId: missingSnapshot,
      }),
    )

    const conflict = await Effect.runPromise(
      Effect.flip(provide(replaceAgentProject(replacement))),
    )
    expect(conflict).toEqual(
      new AgentProjectVersionConflict({
        projectId: created.projectId,
        expectedVersion: 1,
        currentVersion: 2,
      }),
    )
  })

  it("does not expose projects across owners", async () => {
    const memory = memoryRepository()
    const created = await Effect.runPromise(
      createAgentProject({ name: "Private" }).pipe(
        Effect.provideService(AgentIdentity, localIdentity("owner-a")),
        Effect.provideService(AgentProjectRepository, memory.service),
      ),
    )

    const missing = await Effect.runPromise(
      Effect.flip(
        getAgentProject(created.projectId).pipe(
          Effect.provideService(AgentIdentity, localIdentity("owner-b")),
          Effect.provideService(AgentProjectRepository, memory.service),
        ),
      ),
    )
    expect(missing).toEqual(
      new AgentProjectNotFound({ projectId: created.projectId }),
    )
  })
})

function localIdentity(ownerId: string): AgentIdentityShape {
  return { ownerId: Schema.decodeUnknownSync(AgentOwnerIdSchema)(ownerId) }
}

function memoryRepository(): {
  readonly service: AgentProjectRepositoryShape
  readonly snapshots: StoredAgentProject[]
} {
  const records = new Map<string, StoredAgentProject>()
  const snapshots: StoredAgentProject[] = []

  const service: AgentProjectRepositoryShape = {
    create: (ownerId, project) =>
      Effect.sync(() => {
        const record: StoredAgentProject = {
          ownerId,
          project,
          version: 1,
          currentSnapshotId: newId(),
        }
        records.set(project.id, record)
        snapshots.push(record)
        return record
      }),
    list: (ownerId) =>
      Effect.sync(() =>
        [...records.values()]
          .filter((record) => record.ownerId === ownerId)
          .map((record) => ({
            id: record.project.id,
            name: record.project.name,
            version: record.version,
            currentSnapshotId: record.currentSnapshotId,
            updatedAt: record.project.updatedAt,
          })),
      ),
    get: (ownerId, projectId) =>
      Effect.suspend(() => {
        const record = records.get(projectId)
        return record?.ownerId === ownerId
          ? Effect.succeed(record)
          : Effect.fail(new AgentProjectNotFound({ projectId }))
      }),
    getSnapshot: (ownerId, projectId, snapshotId) =>
      Effect.suspend(() => {
        const record = snapshots.find(
          (candidate) =>
            candidate.ownerId === ownerId &&
            candidate.project.id === projectId &&
            candidate.currentSnapshotId === snapshotId,
        )
        return record
          ? Effect.succeed(record)
          : Effect.fail(
              new AgentProjectSnapshotNotFound({ projectId, snapshotId }),
            )
      }),
    replaceAtVersion: (ownerId, project, expectedVersion) =>
      Effect.suspend<
        StoredAgentProject,
        AgentProjectNotFound | AgentProjectVersionConflict,
        never
      >(() => {
        const current = records.get(project.id)
        if (!current || current.ownerId !== ownerId) {
          return Effect.fail(new AgentProjectNotFound({ projectId: project.id }))
        }
        if (current.version !== expectedVersion) {
          return Effect.fail(
            new AgentProjectVersionConflict({
              projectId: project.id,
              expectedVersion,
              currentVersion: current.version,
            }),
          )
        }
        const next: StoredAgentProject = {
          ownerId,
          project,
          version: current.version + 1,
          currentSnapshotId: newId(),
        }
        records.set(project.id, next)
        snapshots.push(next)
        return Effect.succeed(next)
      }),
  }

  return { service, snapshots }
}

function voltageDividerGraph() {
  return {
    components: [
      {
        type: "dc-voltage-source",
        refdes: "V1",
        props: { voltageVolts: 5 },
      },
      { type: "resistor", refdes: "R1", props: { resistanceOhms: 10_000 } },
      { type: "resistor", refdes: "R2", props: { resistanceOhms: 10_000 } },
    ],
    nets: [
      {
        name: "VIN",
        terminals: [
          { refdes: "V1", pin: "positive" },
          { refdes: "R1", pin: "a" },
        ],
      },
      {
        name: "VOUT",
        terminals: [
          { refdes: "R1", pin: "b" },
          { refdes: "R2", pin: "a" },
        ],
      },
      {
        name: "GND",
        terminals: [
          { refdes: "R2", pin: "b" },
          { refdes: "V1", pin: "negative" },
        ],
      },
    ],
    groundNet: "GND",
    analysis: { durationMs: 10, timeStepMs: 0.1 },
  }
}
