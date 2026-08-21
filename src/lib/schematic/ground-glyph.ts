import type { Vec2 } from "./types"

export type Segment = {
  start: Vec2
  end: Vec2
}

export function groundBarSegmentsForLead(leadVector: Vec2): Segment[] {
  const length = Math.hypot(leadVector.x, leadVector.y)
  const ux = length === 0 ? 0 : leadVector.x / length
  const uy = length === 0 ? 1 : leadVector.y / length
  const px = -uy
  const py = ux

  return [0, 1, 2].map((index) => {
    const halfWidth = 10 - index * 4
    const leadOffset = index * 5
    const centerX = ux * leadOffset
    const centerY = uy * leadOffset
    return {
      start: {
        x: centerX - px * halfWidth,
        y: centerY - py * halfWidth,
      },
      end: {
        x: centerX + px * halfWidth,
        y: centerY + py * halfWidth,
      },
    }
  })
}

export function groundBarWorldSegments(position: Vec2, leadEnd: Vec2): Segment[] {
  const leadVector = {
    x: leadEnd.x - position.x,
    y: leadEnd.y - position.y,
  }
  return groundBarSegmentsForLead(leadVector).map((segment) => ({
    start: {
      x: leadEnd.x + segment.start.x,
      y: leadEnd.y + segment.start.y,
    },
    end: {
      x: leadEnd.x + segment.end.x,
      y: leadEnd.y + segment.end.y,
    },
  }))
}
