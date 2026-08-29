import { Schema } from "effect"
import { IdSchema } from "../ids"
import { SimulationOutputSchema } from "./result"

/** One stored simulation, linked to the exact project snapshot that produced it. */
export const SimulationRunSchema = Schema.Struct({
  id: IdSchema,
  projectId: IdSchema,
  projectSnapshotId: IdSchema,
  createdAt: Schema.DateTimeUtcFromString,
  ...SimulationOutputSchema.fields,
})

export type SimulationRun = typeof SimulationRunSchema.Type
export type EncodedSimulationRun = typeof SimulationRunSchema.Encoded
