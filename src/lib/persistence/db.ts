import Dexie, { type EntityTable } from "dexie"

export type ProjectRecord = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  currentSnapshotId?: string
}

export type ProjectSnapshotRecord = {
  id: string
  projectId: string
  createdAt: string
  reason: "autosave" | "manual" | "simulation" | "initial"
  document: unknown
}

export type SimulationRunRecord = {
  id: string
  projectId: string
  snapshotId?: string
  createdAt: string
  config: unknown
  result: unknown
}

class CircuitLabDb extends Dexie {
  projects!: EntityTable<ProjectRecord, "id">
  snapshots!: EntityTable<ProjectSnapshotRecord, "id">
  simulationRuns!: EntityTable<SimulationRunRecord, "id">

  constructor() {
    super("CircuitLabDb")

    this.version(1).stores({
      projects: "id, name, updatedAt, createdAt",
      snapshots: "id, projectId, createdAt, reason",
      simulationRuns: "id, projectId, snapshotId, createdAt",
    })
  }
}

export const db = new CircuitLabDb()
