import type { PointerEvent } from "react"
import {
  getNormalSymbolHandlePosts,
  getTemporarySymbolHandlePositions,
  getWirePostIndexes,
} from "../../../lib/schematic/post-endpoints"
import {
  GRABBED_HANDLE_SIZE,
  POST_HANDLE_SIZE,
  ovalMarker,
  squareMarker,
} from "../../../lib/schematic/post-markers"
import {
  getAnnotationLeadEnd,
  hasAnnotationLead,
  isLeadAnnotationObject,
} from "../../../lib/schematic/annotations"
import type {
  BoxObject,
  GroundObject,
  JunctionObject,
  LineObject,
  NetLabelObject,
  ProbeObject,
  SchematicObject,
  SymbolObject,
  TextObject,
  Vec2,
  WireObject,
} from "../../../lib/schematic/types"

export type GrabbedPostHandle = {
  objectId: string
  postIndex: number
}

type PostHandleLayerProps = {
  activeDragPostObjectId?: string | null
  grabbedPost?: GrabbedPostHandle | null
  hoverObjectId: string | null
  objects: SchematicObject[]
  onPostPointerDown?: (
    objectId: string,
    postIndex: number,
    event: PointerEvent<SVGElement>,
  ) => void
  selectedIds: string[]
  showAllPosts?: boolean
}

type HandledObject =
  | SymbolObject
  | JunctionObject
  | GroundObject
  | NetLabelObject
  | ProbeObject
  | TextObject
  | WireObject
  | LineObject
  | BoxObject

export function PostHandleLayer({
  activeDragPostObjectId = null,
  grabbedPost = null,
  hoverObjectId,
  onPostPointerDown,
  objects,
  selectedIds,
  showAllPosts = false,
}: PostHandleLayerProps) {
  const handledIds = new Set([
    ...selectedIds,
    ...(hoverObjectId ? [hoverObjectId] : []),
  ])
  const handles = objects
    .filter((object): object is HandledObject =>
      (showAllPosts || handledIds.has(object.id)) && hasPostHandles(object),
    )
    .flatMap((object) => {
      const objectPositions = postPositionsForObject(object, showAllPosts)
      const positions = drawnHandlePositions({
        activeDragPostObjectId,
        grabbedPost,
        object,
        positions: objectPositions,
        showAllPosts,
      })
      return positions.map(({ position, index }) => ({
        active: handledIds.has(object.id),
        activeDragPost: activeDragPostObjectId === object.id,
        object,
        position,
        index,
      }))
    })

  if (handles.length === 0) {
    return null
  }

  return (
    <g className="post-handle-layer" data-testid="post-handle-layer">
      {handles.map(({ active, activeDragPost, object, position, index }) => {
        const grabbed =
          grabbedPost?.objectId === object.id && grabbedPost.postIndex === index
        const activeHandle =
          grabbed ||
          (!showAllPosts && active && grabbedPost?.objectId !== object.id) ||
          (showAllPosts && activeDragPost)
        const interactive = Boolean(
          onPostPointerDown && hasDirectPostDragHandles(object),
        )
        const className = [
          activeHandle
            ? "post-handle active"
            : "post-handle drag-mode",
          grabbed ? "grabbed" : null,
          interactive ? "interactive" : null,
        ]
          .filter(Boolean)
          .join(" ")
        const onPointerDown = interactive
          ? (event: PointerEvent<SVGElement>) =>
              onPostPointerDown?.(object.id, index, event)
          : undefined
        if (activeHandle) {
          const marker = squareMarker(
            position,
            grabbed ? GRABBED_HANDLE_SIZE : POST_HANDLE_SIZE,
          )
          return (
            <rect
              key={`${object.id}-${index}`}
              className={className}
              data-testid="post-handle"
              height={marker.height}
              width={marker.width}
              x={marker.x}
              y={marker.y}
              onPointerDown={onPointerDown}
            />
          )
        }
        const marker = ovalMarker(position)
        return (
          <ellipse
            key={`${object.id}-${index}`}
            className={className}
            data-testid="post-handle"
            cx={marker.cx}
            cy={marker.cy}
            rx={marker.rx}
            ry={marker.ry}
            onPointerDown={onPointerDown}
          />
        )
      })}
    </g>
  )
}

function drawnHandlePositions({
  activeDragPostObjectId,
  grabbedPost,
  object,
  positions,
  showAllPosts,
}: {
  activeDragPostObjectId: string | null
  grabbedPost: GrabbedPostHandle | null
  object: HandledObject
  positions: Vec2[]
  showAllPosts: boolean
}): Array<{ position: Vec2; index: number }> {
  const indexedPositions = positions.map((position, index) => ({
    position,
    index,
  }))
  if (!showAllPosts || activeDragPostObjectId !== object.id) {
    return indexedPositions
  }
  if (object.kind === "line" || object.kind === "box" || object.kind === "text") {
    return []
  }
  if (grabbedPost?.objectId === object.id) {
    return indexedPositions.filter(({ index }) => index === grabbedPost.postIndex)
  }
  if (object.kind === "symbol") {
    return getNormalSymbolHandlePosts(object).map((post, index) => ({
      position: post.position,
      index,
    }))
  }
  if (isLeadAnnotationObject(object)) {
    return indexedPositions.slice(0, 1)
  }
  return indexedPositions
}

function hasPostHandles(object: SchematicObject): object is HandledObject {
  return (
    object.kind === "symbol" ||
    object.kind === "junction" ||
    object.kind === "ground" ||
    object.kind === "net-label" ||
    object.kind === "probe" ||
    object.kind === "text" ||
    object.kind === "wire" ||
    object.kind === "line" ||
    object.kind === "box"
  )
}

function postPositionsForObject(
  object: HandledObject,
  showAllPosts: boolean,
): Vec2[] {
  if (object.kind === "symbol") {
    if (showAllPosts) {
      return getTemporarySymbolHandlePositions(object)
    }
    return getNormalSymbolHandlePosts(object).map((pin) => pin.position)
  }
  if (object.kind === "wire") {
    return getWirePostIndexes(object).flatMap((index) => {
      const point = object.points[index]
      return point ? [point] : []
    })
  }
  if (object.kind === "line") {
    return showAllPosts ? [object.start, object.end] : []
  }
  if (object.kind === "box") {
    return showAllPosts ? [object.start, object.end] : []
  }
  if (object.kind === "text") {
    return showAllPosts ? [object.position, textDragEndpoint(object)] : []
  }
  if (isLeadAnnotationObject(object) && showAllPosts && hasAnnotationLead(object)) {
    return [object.position, getAnnotationLeadEnd(object)]
  }
  return [object.position]
}

function textDragEndpoint(object: TextObject): Vec2 {
  return {
    x: object.position.x + 16,
    y: object.position.y,
  }
}

function hasDirectPostDragHandles(
  object: HandledObject,
): object is LineObject | BoxObject | GroundObject | NetLabelObject | ProbeObject {
  return (
    object.kind === "line" ||
    object.kind === "box" ||
    object.kind === "ground" ||
    object.kind === "net-label" ||
    object.kind === "probe"
  )
}
