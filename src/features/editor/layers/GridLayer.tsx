import type { Vec2 } from "../../../lib/schematic/types"

type GridLayerProps = {
  bounds: { left: number; top: number; right: number; bottom: number }
  gridSize: number
}

export function GridLayer({ bounds, gridSize }: GridLayerProps) {
  const vertical: number[] = []
  const horizontal: number[] = []
  const dots: Vec2[] = []
  const startX = Math.floor(bounds.left / gridSize) * gridSize
  const endX = Math.ceil(bounds.right / gridSize) * gridSize
  const startY = Math.floor(bounds.top / gridSize) * gridSize
  const endY = Math.ceil(bounds.bottom / gridSize) * gridSize

  for (let x = startX; x <= endX; x += gridSize) {
    vertical.push(x)
  }
  for (let y = startY; y <= endY; y += gridSize) {
    horizontal.push(y)
  }
  for (const x of vertical) {
    for (const y of horizontal) {
      dots.push({ x, y })
    }
  }

  return (
    <g className="grid-layer">
      {dots.map((point) => (
        <circle
          className="grid-dot"
          cx={point.x}
          cy={point.y}
          key={`${point.x}:${point.y}`}
          r={0.8}
        />
      ))}
      <AxisLine a={{ x: startX, y: 0 }} b={{ x: endX, y: 0 }} />
      <AxisLine a={{ x: 0, y: startY }} b={{ x: 0, y: endY }} />
    </g>
  )
}

function AxisLine({ a, b }: { a: Vec2; b: Vec2 }) {
  return <line className="grid-axis" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
}
