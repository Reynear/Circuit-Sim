import type { AxisDragTarget } from "./editor-state"
import type { ComponentType, LogicInputPosition } from "@circuit-sim/core/circuit/components"
import { pointsEqual } from "@circuit-sim/core/circuit/geometry"
import {
  objectsMatchingSelectionRect,
  rectFromPoints,
  type SelectionRect,
} from "./selection-rect"
import type { Point, SchematicObject } from "@circuit-sim/core/circuit/project"
import type { WireRouteStyle } from "./wire-routing"

/**
 * Pure gesture state for the schematic canvas. The React layer owns DOM events,
 * coordinate transforms and store dispatch; this module owns gesture state and
 * the transitions between them.
 */

export type ShapePostEndpoint = "start" | "end"
export type AnnotationPlacementTool =
  | "place-ground"
  | "place-voltage-probe"
  | "place-current-probe"
  | "place-net-label"
  | "place-text"

export function isAnnotationPlacementToolType(
  toolType: string,
): toolType is AnnotationPlacementTool {
  return (
    toolType === "place-ground" ||
    toolType === "place-voltage-probe" ||
    toolType === "place-current-probe" ||
    toolType === "place-net-label" ||
    toolType === "place-text"
  )
}

export type MoveDragState = {
  type: "move"
  objectIds: string[]
  start: Point
  initialPositions: ReadonlyArray<{
    objectId: string
    position: Point
  }>
  snapToGrid: boolean
}

export type RoutedWireRerouteDragState = {
  type: "routed-wire-reroute"
  wireId: string
}

export type DragState =
  | MoveDragState
  | { type: "wire-point"; wireId: string; pointIndex: number }
  | RoutedWireRerouteDragState
  | {
      type: "pending-select-drag"
      pointerDownTime: number
      pendingDrag: MoveDragState | RoutedWireRerouteDragState
    }
  | { type: "shape-post"; objectId: string; endpoint: ShapePostEndpoint }
  | { type: "post-group"; position: Point }
  | {
      type: "held-logic-input"
      componentId: string
      releasePosition: LogicInputPosition
    }
  | { type: "pan"; startClient: Point; startPan: Point }
  | { type: "marquee"; start: Point; current: Point; additive: boolean }
  | {
      type: "axis"
      axis: "x" | "y"
      line: number
      targets: AxisDragTarget[]
    }
  | {
      type: "create-component"
      component: ComponentType
      start: Point
      current: Point
    }
  | {
      type: "create-wire"
      start: Point
      current: Point
      routeStyle: WireRouteStyle
    }
  | {
      type: "create-box"
      start: Point
      current: Point
    }
  | {
      type: "create-line"
      start: Point
      current: Point
    }
  | {
      type: "create-annotation"
      toolType: AnnotationPlacementTool
      start: Point
      current: Point
    }

export function modifierAdditive(modifiers: {
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}): boolean {
  return modifiers.shiftKey || modifiers.metaKey || modifiers.ctrlKey
}

/** Marquee selection: drag on empty canvas to select enclosed objects. */
export type MarqueeDrag = Extract<DragState, { type: "marquee" }>

export function beginMarquee(start: Point, additive: boolean): MarqueeDrag {
  return { type: "marquee", start, current: start, additive }
}

export function updateMarquee(drag: MarqueeDrag, current: Point): MarqueeDrag {
  return { ...drag, current }
}

export function marqueeRect(drag: MarqueeDrag): SelectionRect {
  return rectFromPoints(drag.start, drag.current)
}

export function marqueeSelectionIds(
  drag: MarqueeDrag,
  objects: ReadonlyArray<SchematicObject>,
): string[] {
  return objectsMatchingSelectionRect(objects, marqueeRect(drag))
}

/** Visual box / line creation: press, drag, release. */
export type ShapeCreationDrag = Extract<
  DragState,
  { type: "create-box" } | { type: "create-line" }
>

export function beginShapeCreation(
  kind: "create-box" | "create-line",
  start: Point,
): ShapeCreationDrag {
  if (kind === "create-box") {
    return { type: "create-box", start, current: start }
  }
  return { type: "create-line", start, current: start }
}

export function updateShapeCreation(
  drag: ShapeCreationDrag,
  current: Point,
): ShapeCreationDrag {
  return { ...drag, current }
}

export function shapeCreationHasSize(drag: ShapeCreationDrag): boolean {
  return !pointsEqual(drag.start, drag.current)
}

export function canCreateVisualLine(start: Point, end: Point): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) >= 16
}

export function canCreateVisualBox(start: Point, end: Point): boolean {
  return Math.abs(end.x - start.x) >= 32 && Math.abs(end.y - start.y) >= 32
}

export type CreationDrag = Extract<
  DragState,
  | { type: "create-component" }
  | { type: "create-annotation" }
  | { type: "create-box" }
  | { type: "create-wire" }
  | { type: "create-line" }
>

/** Updates creation gesture state without coupling the transition to React. */
export function updateCreationDrag(
  drag: CreationDrag,
  snapped: Point,
  unsnapped: Point,
  routeStyle: WireRouteStyle,
): CreationDrag {
  switch (drag.type) {
    case "create-component":
      return { ...drag, current: snapped }
    case "create-annotation":
      return {
        ...drag,
        current: drag.toolType === "place-text" ? unsnapped : snapped,
      }
    case "create-box":
    case "create-line":
      return { ...drag, current: unsnapped }
    case "create-wire":
      return { ...drag, current: snapped, routeStyle }
  }
}
