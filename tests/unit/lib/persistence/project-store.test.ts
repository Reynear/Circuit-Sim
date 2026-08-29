import { DateTime, Effect, Option } from "effect"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"
import { runSpiceSimulation } from "@/server/simulation/engines/spicey"
import { db, type EncodedProjectSnapshotRecord } from "@/browser/persistence/db"
import type { EncodedSimulationRun } from "@circuit-sim/core/simulation/simulation-run"
import {
  createProject,
  listProjects,
  loadLatestProject,
  loadSimulationRun,
  recordSimulationRun,
} from "@/browser/persistence/project-store"

describe("project store", () => {
  beforeEach(async () => {
    await db.transaction(
      "rw",
      db.projects,
      db.snapshots,
      db.simulationRuns,
      async () => {
        await db.projects.clear()
        await db.snapshots.clear()
        await db.simulationRuns.clear()
      },
    )
  })

  it("reports project-list persistence failures", async () => {
    vi.spyOn(db.projects, "orderBy").mockImplementationOnce(() => {
      throw new Error("IndexedDB unavailable")
    })

    await expect(Effect.runPromise(listProjects())).rejects.toMatchObject({
      _tag: "ProjectPersistenceError",
      operation: "list projects",
    })
  })

  it("reports malformed project summaries as invalid data", async () => {
    await db.projects.put({
      id: "prj_invalid",
      name: "Invalid summary",
      createdAt: new Date().toISOString(),
      updatedAt: "not-a-date",
      currentSnapshotId: "snapshot_invalid",
    })

    await expect(Effect.runPromise(listProjects())).rejects.toMatchObject({
      _tag: "InvalidProjectSummary",
    })
    await expect(
      Effect.runPromise(loadLatestProject("prj_invalid")),
    ).rejects.toMatchObject({ _tag: "InvalidProjectSummary" })
  })

  it("wraps project write failures with their owning operation", async () => {
    vi.spyOn(db, "transaction").mockRejectedValueOnce(
      new Error("IndexedDB unavailable"),
    )

    await expect(
      Effect.runPromise(createProject(newCircuitProject("Failed write"))),
    ).rejects.toMatchObject({
      _tag: "ProjectPersistenceError",
      operation: "create project",
    })
  })

  it("encodes UTC dates for storage and decodes them into the project domain", async () => {
    const project = newCircuitProject("Stored project")
    await Effect.runPromise(createProject(project))

    const loaded = await Effect.runPromise(loadLatestProject(project.id))
    expect(Option.isSome(loaded)).toBe(true)
    if (Option.isNone(loaded)) {
      return
    }
    expect(DateTime.isDateTime(loaded.value.createdAt)).toBe(true)
    expect(DateTime.formatIso(loaded.value.createdAt)).toBe(
      DateTime.formatIso(project.createdAt),
    )

    const projects = await Effect.runPromise(listProjects())
    expect(DateTime.isDateTime(projects[0]?.updatedAt)).toBe(true)
  })

  it("rejects legacy project documents without migration", async () => {
    const project = newCircuitProject("Legacy storage")
    const summary = await Effect.runPromise(createProject(project))
    const snapshot = await db.snapshots.get(summary.currentSnapshotId!)
    if (!snapshot) {
      throw new Error("Expected an initial snapshot")
    }
    await db.snapshots.put({
      ...snapshot,
      document: {
        id: project.id,
        name: project.name,
        version: 3,
        sheets: [],
        simulations: [],
        createdAt: DateTime.formatIso(project.createdAt),
        updatedAt: DateTime.formatIso(project.updatedAt),
      },
    } as unknown as EncodedProjectSnapshotRecord)

    await expect(
      Effect.runPromise(loadLatestProject(project.id)),
    ).rejects.toMatchObject({ _tag: "InvalidProjectDocument" })
  })

  it("stores simulation runs with their exact source snapshot", async () => {
    const project = newCircuitProject("Simulation storage")
    const output = runSpiceSimulation(project)

    const record = await Effect.runPromise(
      recordSimulationRun({ project, output }),
    )

    expect(DateTime.isDateTime(record.createdAt)).toBe(true)
    expect(record.projectSnapshotId).toBeTruthy()
    expect(await db.snapshots.get(record.projectSnapshotId)).toBeDefined()
    const stored = await db.simulationRuns.get(record.id)
    expect(typeof stored?.createdAt).toBe("string")
    expect(stored).not.toHaveProperty("result")

    const loaded = await Effect.runPromise(loadSimulationRun(record.id))
    expect(Option.isSome(loaded)).toBe(true)
    if (Option.isSome(loaded)) {
      expect(DateTime.isDateTime(loaded.value.createdAt)).toBe(true)
      expect(loaded.value.circuitHash).toBe(output.circuitHash)
    }
  })

  it("distinguishes malformed simulation runs from missing runs", async () => {
    await db.simulationRuns.put({
      id: "sim_invalid",
      projectId: "prj_invalid",
      projectSnapshotId: "snapshot_invalid",
      createdAt: new Date().toISOString(),
      circuitHash: "invalid",
    } as unknown as EncodedSimulationRun)

    const missing = await Effect.runPromise(loadSimulationRun("sim_missing"))
    expect(Option.isNone(missing)).toBe(true)
    await expect(
      Effect.runPromise(loadSimulationRun("sim_invalid")),
    ).rejects.toMatchObject({ _tag: "InvalidSimulationRun" })
  })

  it("reports a dangling current snapshot as corruption rather than absence", async () => {
    const project = newCircuitProject("Missing snapshot")
    const record = await Effect.runPromise(createProject(project))
    await db.snapshots.delete(record.currentSnapshotId!)

    await expect(
      Effect.runPromise(loadLatestProject(project.id)),
    ).rejects.toMatchObject({
      _tag: "MissingProjectSnapshot",
      projectId: project.id,
      snapshotId: record.currentSnapshotId,
    })
  })

  it("reports an existing malformed snapshot as invalid rather than missing", async () => {
    const project = newCircuitProject("Invalid project")
    const record = await Effect.runPromise(createProject(project))
    const snapshot = await db.snapshots.get(record.currentSnapshotId!)
    if (!snapshot) {
      throw new Error("Expected an initial snapshot")
    }
    await db.snapshots.put({
      ...snapshot,
      document: { version: 2, id: project.id },
    } as unknown as EncodedProjectSnapshotRecord)

    await expect(
      Effect.runPromise(loadLatestProject(project.id)),
    ).rejects.toMatchObject({ _tag: "InvalidProjectDocument" })
  })
})
