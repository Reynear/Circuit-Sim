import { ovalMarker } from "../../../lib/schematic/post-markers"
import type { ElectricalIssue } from "../../../lib/schematic/erc"
import type { Vec2 } from "../../../lib/schematic/types"

type BadConnectionLayerProps = {
  issues: ElectricalIssue[]
}

export function BadConnectionLayer({ issues }: BadConnectionLayerProps) {
  const markers = uniqueIssuePositions(
    issues.flatMap((issue) =>
      issue.positions?.map((position) => ({ issue, position })) ?? [],
    ),
  )

  if (markers.length === 0) {
    return null
  }

  return (
    <g className="bad-connection-layer" data-testid="bad-connection-layer">
      {markers.map(({ issue, position }) => (
        <BadConnectionDot
          issue={issue}
          key={`${issue.id}-${position.x}-${position.y}`}
          position={position}
        />
      ))}
    </g>
  )
}

function BadConnectionDot({
  issue,
  position,
}: {
  issue: ElectricalIssue
  position: Vec2
}) {
  const marker = ovalMarker(position)
  return (
    <ellipse
      className={`bad-connection-dot ${issue.severity}`}
      data-testid="bad-connection-dot"
      cx={marker.cx}
      cy={marker.cy}
      rx={marker.rx}
      ry={marker.ry}
    >
      <title>{issue.message}</title>
    </ellipse>
  )
}

function uniqueIssuePositions(
  markers: Array<{ issue: ElectricalIssue; position: Vec2 }>,
): Array<{ issue: ElectricalIssue; position: Vec2 }> {
  const seen = new Set<string>()
  const unique: Array<{ issue: ElectricalIssue; position: Vec2 }> = []
  for (const marker of markers) {
    const key = `${marker.position.x}:${marker.position.y}:${marker.issue.severity}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    unique.push(marker)
  }
  return unique
}
