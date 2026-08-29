import { Schema } from "effect"
import { IdSchema } from "../ids"
import { getPinPosts } from "./component-geometry"
import { pointsEqual } from "./geometry"
import {
  SchematicObjectSchema,
  type CircuitProject,
  type SchematicObject,
} from "./project"

export const CircuitEditSchema = Schema.Union([
  Schema.TaggedStruct("PutObject", { object: SchematicObjectSchema }),
  Schema.TaggedStruct("RemoveObjects", { ids: Schema.Array(IdSchema) }),
])
export type CircuitEdit = typeof CircuitEditSchema.Type

/** Applies validated edits in order to the canonical project. */
export function applyCircuitEdits(
  project: CircuitProject,
  edits: ReadonlyArray<CircuitEdit>,
): CircuitProject {
  return edits.reduce(applyCircuitEdit, project)
}

export function applyCircuitEdit(project: CircuitProject, edit: CircuitEdit): CircuitProject {
  switch (edit._tag) {
    case "PutObject":
      return putObject(project, edit.object)
    case "RemoveObjects": {
      const removed = new Set(edit.ids)
      return { ...project, objects: project.objects.filter((object) => !removed.has(object.id)) }
    }
  }
}

/** Replacing a component also stretches wire endpoints attached to its terminals. */
function putObject(project: CircuitProject, next: SchematicObject): CircuitProject {
  const current = project.objects.find((object) => object.id === next.id)
  const objects = project.objects.some((object) => object.id === next.id)
    ? project.objects.map((object) => object.id === next.id ? next : object)
    : [...project.objects, next]

  if (current?.kind !== "component" || next.kind !== "component") {
    return { ...project, objects }
  }

  const movedPins = new Map(
    getPinPosts(current).flatMap((pin) => {
      const replacement = getPinPosts(next).find((candidate) => candidate.pin === pin.pin)
      return replacement ? [[pointKey(pin.position), replacement.position] as const] : []
    }),
  )
  return {
    ...project,
    objects: objects.map((object) => {
      if (object.kind !== "wire") return object
      const last = object.points.length - 1
      return {
        ...object,
        points: object.points.map((point, index) => {
          if (index !== 0 && index !== last) return point
          const replacement = movedPins.get(pointKey(point))
          return replacement && !pointsEqual(replacement, point) ? replacement : point
        }),
      }
    }),
  }
}

function pointKey(point: { readonly x: number; readonly y: number }): string {
  return `${point.x},${point.y}`
}
