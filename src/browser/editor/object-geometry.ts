import type { Point, SchematicObject } from "@circuit-sim/core/circuit/project"

/** Every validated schematic object has a stable anchor used for whole-object moves. */
export function objectMoveAnchor(object: SchematicObject): Point {
  switch (object.kind) {
    case "component":
      return object.position
    case "wire":
      return object.points[0]!
    case "line":
    case "box":
      return object.start
    case "net-label":
    case "ground":
    case "probe":
    case "text":
      return object.position
  }
}

export function isGraphicObject(object: SchematicObject): boolean {
  return object.kind === "box" || object.kind === "line" || object.kind === "text"
}
