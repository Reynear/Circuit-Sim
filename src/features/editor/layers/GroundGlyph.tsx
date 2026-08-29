import type { Point } from "@circuit-sim/core/circuit/project"

export function GroundBars({ leadVector }: { leadVector: Point }) {
  return (
    <>
      {groundBarSegments(leadVector).map((segment, index) => {
        return (
          <line
            key={index}
            className="symbol-stroke ground-bar"
            data-testid="ground-bar"
            x1={segment.start.x}
            y1={segment.start.y}
            x2={segment.end.x}
            y2={segment.end.y}
          />
        )
      })}
    </>
  )
}

function groundBarSegments(lead: Point) {
  const length = Math.hypot(lead.x, lead.y)
  const along = length === 0 ? { x: 0, y: 1 } : { x: lead.x / length, y: lead.y / length }
  const across = { x: -along.y, y: along.x }

  return [0, 1, 2].map((index) => {
    const center = { x: along.x * index * 5, y: along.y * index * 5 }
    const halfWidth = 10 - index * 4
    return {
      start: {
        x: center.x - across.x * halfWidth,
        y: center.y - across.y * halfWidth,
      },
      end: {
        x: center.x + across.x * halfWidth,
        y: center.y + across.y * halfWidth,
      },
    }
  })
}
