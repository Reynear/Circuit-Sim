import { pointsEqual } from "./geometry"
import type {
  GroundObject,
  NetLabelObject,
  ProbeObject,
  SchematicObject,
  Vec2,
} from "./types"

export type LeadAnnotationObject = GroundObject | NetLabelObject | ProbeObject

export function isLeadAnnotationObject(
  object: SchematicObject,
): object is LeadAnnotationObject {
  return (
    object.kind === "ground" ||
    object.kind === "net-label" ||
    object.kind === "probe"
  )
}

export function getAnnotationLeadEnd(object: LeadAnnotationObject): Vec2 {
  return object.leadEnd ?? getDefaultAnnotationLeadEnd(object)
}

export function hasAnnotationLead(object: LeadAnnotationObject): boolean {
  return !pointsEqual(object.position, getAnnotationLeadEnd(object))
}

export function getDefaultAnnotationLeadEnd(object: LeadAnnotationObject): Vec2 {
  if (object.kind === "ground") {
    return { x: object.position.x, y: object.position.y + 20 }
  }
  if (object.kind === "net-label") {
    return { x: object.position.x + 17, y: object.position.y }
  }
  return { x: object.position.x + 32, y: object.position.y }
}

export function translateAnnotationLead<T extends LeadAnnotationObject>(
  object: T,
  delta: Vec2,
): T {
  return {
    ...object,
    position: translatePoint(object.position, delta),
    ...(object.leadEnd
      ? { leadEnd: translatePoint(object.leadEnd, delta) }
      : {}),
  }
}

export function translatePoint(point: Vec2, delta: Vec2): Vec2 {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y,
  }
}
