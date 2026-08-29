import { ovalMarker } from "@/browser/editor/post-markers"
import { getVisiblePosts } from "@/browser/editor/post-endpoints"
import { GRID_SIZE } from "@/browser/editor/interaction"
import type { ElectricalIssue } from "@circuit-sim/core/circuit/erc"
import type { Point, SchematicObject } from "@circuit-sim/core/circuit/project"

type Bounds = { left: number; top: number; right: number; bottom: number }

export function GridLayer({ bounds }: { bounds: Bounds }) {
  const vertical: number[] = []
  const horizontal: number[] = []
  const startX = Math.floor(bounds.left / GRID_SIZE) * GRID_SIZE
  const endX = Math.ceil(bounds.right / GRID_SIZE) * GRID_SIZE
  const startY = Math.floor(bounds.top / GRID_SIZE) * GRID_SIZE
  const endY = Math.ceil(bounds.bottom / GRID_SIZE) * GRID_SIZE

  for (let x = startX; x <= endX; x += GRID_SIZE) vertical.push(x)
  for (let y = startY; y <= endY; y += GRID_SIZE) horizontal.push(y)

  return (
    <g className="grid-layer">
      {vertical.flatMap((x) => horizontal.map((y) => (
        <circle className="grid-dot" cx={x} cy={y} key={`${x}:${y}`} r={0.8} />
      )))}
      <line className="grid-axis" x1={startX} y1={0} x2={endX} y2={0} />
      <line className="grid-axis" x1={0} y1={startY} x2={0} y2={endY} />
    </g>
  )
}

export function CursorGuideLayer({
  bounds,
  cursor,
  showCrossHairs = false,
  snapPoint,
}: {
  bounds: Bounds
  cursor: Point | null
  showCrossHairs?: boolean
  snapPoint: Point | null
}) {
  if (!cursor || !snapPoint || !showCrossHairs) return null
  return (
    <g className="cursor-guide-layer">
      <line className="snap-crosshair" data-testid="cursor-crosshair" x1={bounds.left} y1={snapPoint.y} x2={bounds.right} y2={snapPoint.y} />
      <line className="snap-crosshair" data-testid="cursor-crosshair" x1={snapPoint.x} y1={bounds.top} x2={snapPoint.x} y2={bounds.bottom} />
    </g>
  )
}

export function SelectionLayer({
  marquee,
}: {
  marquee?: { x: number; y: number; width: number; height: number } | null
}) {
  return marquee ? (
    <g className="selection-layer">
      <rect className="selection-marquee" data-testid="selection-marquee" {...marquee} />
    </g>
  ) : null
}

export function RoutedWireSnapLayer({ point }: { point: Point | null }) {
  if (!point) return null
  const marker = ovalMarker(point, 9)
  return (
    <g className="routed-wire-snap-layer" data-testid="routed-wire-snap-layer">
      <ellipse className="routed-wire-snap-point" data-testid="routed-wire-snap-point" {...marker} />
    </g>
  )
}

export function PostLayer({ objects }: { objects: ReadonlyArray<SchematicObject> }) {
  return (
    <g className="post-layer" data-testid="post-layer">
      {getVisiblePosts(objects).map((post) => (
        <ellipse
          key={post.key}
          className={post.kind === "annotation" ? "annotation-post" : "wire-post"}
          data-testid={post.kind === "annotation" ? "annotation-post" : "wire-post"}
          {...ovalMarker(post.position)}
        />
      ))}
    </g>
  )
}

export function BadConnectionLayer({ issues }: { issues: ElectricalIssue[] }) {
  const seen = new Set<string>()
  const markers = issues.flatMap((issue) =>
    (issue.positions ?? []).flatMap((position) => {
      const key = `${position.x}:${position.y}:${issue.severity}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{ issue, position }]
    }),
  )
  if (markers.length === 0) return null

  return (
    <g className="bad-connection-layer" data-testid="bad-connection-layer">
      {markers.map(({ issue, position }) => (
        <ellipse
          key={`${issue.id}-${position.x}-${position.y}`}
          className={`bad-connection-dot ${issue.severity}`}
          data-testid="bad-connection-dot"
          {...ovalMarker(position)}
        >
          <title>{issue.message}</title>
        </ellipse>
      ))}
    </g>
  )
}
