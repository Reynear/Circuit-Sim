import { createId } from "../ids"
import { CircuitProjectSchema } from "../schematic/schemas"
import type { CircuitProject } from "../schematic/types"
import {
  db,
  type ProjectRecord,
  type ProjectSnapshotRecord,
  type SimulationRunRecord,
} from "./db"

export async function listProjects(): Promise<ProjectRecord[]> {
  return db.projects.orderBy("updatedAt").reverse().toArray()
}

export async function createProject(
  project: CircuitProject,
): Promise<ProjectRecord> {
  const snapshot = createSnapshotRecord(project, "initial")
  const record: ProjectRecord = {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    currentSnapshotId: snapshot.id,
  }

  await db.transaction("rw", db.projects, db.snapshots, async () => {
    await db.snapshots.put(snapshot)
    await db.projects.put(record)
  })

  return record
}

export async function saveProjectSnapshot(
  project: CircuitProject,
  reason: ProjectSnapshotRecord["reason"],
): Promise<ProjectSnapshotRecord> {
  const snapshot = createSnapshotRecord(project, reason)
  const existing = await db.projects.get(project.id)
  const record: ProjectRecord = {
    id: project.id,
    name: project.name,
    createdAt: existing?.createdAt ?? project.createdAt,
    updatedAt: project.updatedAt,
    currentSnapshotId: snapshot.id,
  }

  await db.transaction("rw", db.projects, db.snapshots, async () => {
    await db.snapshots.put(snapshot)
    await db.projects.put(record)
  })

  return snapshot
}

export async function loadLatestProjectDocument(
  projectId: string,
): Promise<CircuitProject | null> {
  const record = await db.projects.get(projectId)
  if (!record) {
    return null
  }

  const snapshot = record.currentSnapshotId
    ? await db.snapshots.get(record.currentSnapshotId)
    : await loadNewestSnapshot(projectId)
  if (!snapshot) {
    return null
  }

  const parsed = CircuitProjectSchema.safeParse(snapshot.document)
  return parsed.success ? (parsed.data as CircuitProject) : null
}

export async function deleteProject(projectId: string): Promise<void> {
  const snapshots = await db.snapshots
    .where("projectId")
    .equals(projectId)
    .toArray()
  const simulationRuns = await db.simulationRuns
    .where("projectId")
    .equals(projectId)
    .toArray()

  await db.transaction(
    "rw",
    db.projects,
    db.snapshots,
    db.simulationRuns,
    async () => {
      await db.snapshots.bulkDelete(snapshots.map((snapshot) => snapshot.id))
      await db.simulationRuns.bulkDelete(simulationRuns.map((run) => run.id))
      await db.projects.delete(projectId)
    },
  )
}

export async function recordSimulationRun(
  record: Omit<SimulationRunRecord, "id" | "createdAt"> & {
    id?: string
    createdAt?: string
  },
): Promise<SimulationRunRecord> {
  const runRecord: SimulationRunRecord = {
    ...record,
    id: record.id ?? createId("sim"),
    createdAt: record.createdAt ?? new Date().toISOString(),
  }
  await db.simulationRuns.put(runRecord)
  return runRecord
}

function createSnapshotRecord(
  project: CircuitProject,
  reason: ProjectSnapshotRecord["reason"],
): ProjectSnapshotRecord {
  return {
    id: createId("snap"),
    projectId: project.id,
    createdAt: new Date().toISOString(),
    reason,
    document: structuredClone(project),
  }
}

async function loadNewestSnapshot(
  projectId: string,
): Promise<ProjectSnapshotRecord | undefined> {
  const snapshots = await db.snapshots
    .where("projectId")
    .equals(projectId)
    .toArray()
  return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}
