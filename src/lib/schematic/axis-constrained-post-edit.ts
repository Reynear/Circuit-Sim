import type { Vec2 } from "./types"

const AXIS_TOLERANCE = 0.001

const axisConstrainedComponentIds = new Set([
  "and-gate",
  "ideal-op-amp-minus-top",
  "inverter",
  "n-mosfet",
  "npn-transistor",
  "or-gate",
  "p-mosfet",
  "pnp-transistor",
])

export function isAxisConstrainedComponent(
  componentDefinitionId: string,
): boolean {
  return axisConstrainedComponentIds.has(componentDefinitionId)
}

export function constrainAxisAlignedPostEdit({
  componentDefinitionId,
  currentEnd,
  currentStart,
  nextEnd,
  nextStart,
}: {
  componentDefinitionId: string
  currentEnd: Vec2
  currentStart: Vec2
  nextEnd: Vec2
  nextStart: Vec2
}): { start: Vec2; end: Vec2 } {
  if (!isAxisConstrainedComponent(componentDefinitionId)) {
    return { start: nextStart, end: nextEnd }
  }

  if (Math.abs(currentStart.x - currentEnd.x) <= AXIS_TOLERANCE) {
    return {
      start: { ...nextStart, x: currentStart.x },
      end: { ...nextEnd, x: currentEnd.x },
    }
  }

  return {
    start: { ...nextStart, y: currentStart.y },
    end: { ...nextEnd, y: currentEnd.y },
  }
}
