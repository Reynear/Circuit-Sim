import {
  getAnnotationLeadEnd,
  type LeadAnnotationObject,
} from "./annotations"
import {
  groundBarWorldSegments,
  type Segment,
} from "./ground-glyph"
import type { Vec2 } from "./types"

export type Rect = {
  x: number
  y: number
  width: number
  height: number
}

export function leadAnnotationBodyRects(
  object: LeadAnnotationObject,
): Rect[] {
  const leadEnd = getAnnotationLeadEnd(object)
  if (object.kind === "net-label") {
    return [{ x: leadEnd.x, y: leadEnd.y - 7, width: 54, height: 14 }]
  }
  if (object.kind === "probe") {
    return [
      { x: leadEnd.x - 11, y: leadEnd.y - 11, width: 22, height: 22 },
      { x: leadEnd.x - 24, y: leadEnd.y + 16, width: 48, height: 16 },
    ]
  }
  return []
}

export function leadAnnotationBodySegments(
  object: LeadAnnotationObject,
): Segment[] {
  if (object.kind !== "ground") {
    return []
  }
  return groundBarWorldSegments(object.position, getAnnotationLeadEnd(object))
}

export function leadAnnotationBounds(
  object: LeadAnnotationObject,
  padding = 0,
): Rect {
  const leadEnd = getAnnotationLeadEnd(object)
  return unionRects(
    [
      pointRect(object.position),
      pointRect(leadEnd),
      segmentRect({ start: object.position, end: leadEnd }),
      ...leadAnnotationBodyRects(object),
      ...leadAnnotationBodySegments(object).map(segmentRect),
    ],
    padding,
  )
}

export function pointInRect(
  point: Vec2,
  rect: Rect,
  tolerance = 0,
): boolean {
  return (
    point.x >= rect.x - tolerance &&
    point.x <= rect.x + rect.width + tolerance &&
    point.y >= rect.y - tolerance &&
    point.y <= rect.y + rect.height + tolerance
  )
}

function pointRect(point: Vec2): Rect {
  return { x: point.x, y: point.y, width: 0, height: 0 }
}

function segmentRect(segment: Segment): Rect {
  const x = Math.min(segment.start.x, segment.end.x)
  const y = Math.min(segment.start.y, segment.end.y)
  return {
    x,
    y,
    width: Math.abs(segment.end.x - segment.start.x),
    height: Math.abs(segment.end.y - segment.start.y),
  }
}

function unionRects(rects: Rect[], padding: number): Rect {
  const minX = Math.min(...rects.map((rect) => rect.x))
  const minY = Math.min(...rects.map((rect) => rect.y))
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width))
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height))
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  }
}
