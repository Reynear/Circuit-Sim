import type { PointerEvent } from "react"
import { getWirePostIndexes } from "../../../lib/schematic/post-endpoints"
import type { Vec2, WireObject } from "../../../lib/schematic/types"

type WireEditLayerProps = {
  pointMode?: "all" | "post-endpoints"
  wires: WireObject[]
  onPointPointerDown: (
    wireId: string,
    pointIndex: number,
    event: PointerEvent<SVGCircleElement>,
  ) => void
  onMidpointPointerDown: (
    wireId: string,
    segmentIndex: number,
    position: Vec2,
    event: PointerEvent<SVGRectElement>,
  ) => void
}

export function WireEditLayer({
  pointMode = "all",
  wires,
  onPointPointerDown,
  onMidpointPointerDown,
}: WireEditLayerProps) {
  if (wires.length === 0) {
    return null
  }

  return (
    <g
      className={[
        "wire-edit-layer",
        pointMode === "post-endpoints" ? "post-mode" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {wires.map((wire) => {
        const pointIndexes =
          pointMode === "post-endpoints"
            ? getWirePostIndexes(wire)
            : wire.points.map((_, index) => index)
        return (
          <g key={wire.id}>
            {pointMode === "all"
              ? wire.points.slice(0, -1).map((point, index) => {
                  const next = wire.points[index + 1]
                  if (!next) {
                    return null
                  }
                  const midpoint = {
                    x: (point.x + next.x) / 2,
                    y: (point.y + next.y) / 2,
                  }
                  return (
                    <rect
                      key={`${wire.id}-mid-${index}`}
                      className="wire-midpoint-handle"
                      data-testid="wire-midpoint-handle"
                      x={midpoint.x - 5}
                      y={midpoint.y - 5}
                      width={10}
                      height={10}
                      transform={`rotate(45 ${midpoint.x} ${midpoint.y})`}
                      onPointerDown={(event) =>
                        onMidpointPointerDown(wire.id, index, midpoint, event)
                      }
                    />
                  )
                })
              : null}
            {pointIndexes.map((pointIndex) => {
              const point = wire.points[pointIndex]
              if (!point) {
                return null
              }
              return (
                <circle
                  key={`${wire.id}-point-${pointIndex}`}
                  className="wire-point-handle"
                  data-testid="wire-point-handle"
                  cx={point.x}
                  cy={point.y}
                  r={6}
                  onPointerDown={(event) =>
                    onPointPointerDown(wire.id, pointIndex, event)
                  }
                />
              )
            })}
          </g>
        )
      })}
    </g>
  )
}
