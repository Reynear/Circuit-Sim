import { Schema } from "effect"
import Dexie, { type EntityTable } from "dexie"
import { IdSchema } from "@circuit-sim/core/ids"
import { CircuitProjectSchema } from "@circuit-sim/core/circuit/project"
import type { EncodedProjectSummary } from "./project-summary"
import type { EncodedSimulationRun } from "@circuit-sim/core/simulation/simulation-run"

export type ProjectRecord = EncodedProjectSummary

export const SnapshotReasonSchema = Schema.Literals([
  "autosave",
  "manual",
  "simulation",
  "initial",
])
export type SnapshotReason = typeof SnapshotReasonSchema.Type

export const ProjectSnapshotRecordSchema = Schema.Struct({
  id: IdSchema,
  projectId: IdSchema,
  createdAt: Schema.DateTimeUtcFromString,
  reason: SnapshotReasonSchema,
  document: CircuitProjectSchema,
})

export type ProjectSnapshotRecord = typeof ProjectSnapshotRecordSchema.Type
export type EncodedProjectSnapshotRecord =
  typeof ProjectSnapshotRecordSchema.Encoded

class CircuitSimDb extends Dexie {
  projects!: EntityTable<ProjectRecord, "id">
  snapshots!: EntityTable<EncodedProjectSnapshotRecord, "id">
  simulationRuns!: EntityTable<EncodedSimulationRun, "id">

  constructor() {
    // Pre-release storage intentionally starts fresh when the canonical model changes.
    super("CircuitSimCurrent")

    const stores = {
      projects: "id, name, updatedAt, createdAt",
      snapshots: "id, projectId, createdAt, reason",
      simulationRuns: "id, projectId, projectSnapshotId, createdAt",
    }
    this.version(1).stores(stores)
  }
}

export const db = new CircuitSimDb()
