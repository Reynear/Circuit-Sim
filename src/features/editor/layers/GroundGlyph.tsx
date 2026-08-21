import { groundBarSegmentsForLead } from "../../../lib/schematic/ground-glyph"
import type { Vec2 } from "../../../lib/schematic/types"

export function GroundBars({ leadVector }: { leadVector: Vec2 }) {
  return (
    <>
      {groundBarSegmentsForLead(leadVector).map((segment, index) => {
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
