import type { Vec2 } from "../../../lib/schematic/types"

type CursorGuideLayerProps = {
  bounds: { left: number; top: number; right: number; bottom: number }
  cursor: Vec2 | null
  showCrossHairs?: boolean
  snapPoint: Vec2 | null
}

export function CursorGuideLayer({
  bounds,
  cursor,
  showCrossHairs = false,
  snapPoint,
}: CursorGuideLayerProps) {
  if (!cursor || !snapPoint || !showCrossHairs) {
    return null
  }

  return (
    <g className="cursor-guide-layer">
      <line
        className="snap-crosshair"
        data-testid="cursor-crosshair"
        x1={bounds.left}
        y1={snapPoint.y}
        x2={bounds.right}
        y2={snapPoint.y}
      />
      <line
        className="snap-crosshair"
        data-testid="cursor-crosshair"
        x1={snapPoint.x}
        y1={bounds.top}
        x2={snapPoint.x}
        y2={bounds.bottom}
      />
    </g>
  )
}
