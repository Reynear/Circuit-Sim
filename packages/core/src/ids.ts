import { Schema } from "effect"

export const IdSchema = Schema.String.check(Schema.isUUID(4))
export type Id = typeof IdSchema.Type

export function newId(): Id {
  return crypto.randomUUID()
}
