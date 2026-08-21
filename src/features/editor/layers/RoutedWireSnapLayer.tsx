import { ovalMarker } from "../../../lib/schematic/post-markers"
import type { Vec2 } from "../../../lib/schematic/types"

type RoutedWireSnapLayerProps = {
  point: Vec2 | null
}

export function RoutedWireSnapLayer({
  point,
}: RoutedWireSnapLayerProps) {
  if (!point) {
    return null
  }
  const marker = ovalMarker(point, 9)

  return (
    <g className="routed-wire-snap-layer" data-testid="routed-wire-snap-layer">
      <ellipse
        className="routed-wire-snap-point"
        data-testid="routed-wire-snap-point"
        cx={marker.cx}
        cy={marker.cy}
        rx={marker.rx}
        ry={marker.ry}
      />
    </g>
  )
}
