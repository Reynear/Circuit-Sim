import { Schema } from "effect"
import { IdSchema } from "@circuit-sim/core/ids"

export const ProjectSummarySchema = Schema.Struct({
  id: IdSchema,
  name: Schema.NonEmptyString,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
  currentSnapshotId: IdSchema,
})

export type ProjectSummary = typeof ProjectSummarySchema.Type
export type EncodedProjectSummary = typeof ProjectSummarySchema.Encoded
