import type { WaveformTrace } from "../../lib/simulation/types"

export function WaveformChart({ traces }: { traces: WaveformTrace[] }) {
  const finiteTraces = traces
    .map((trace) => ({
      ...trace,
      points: trace.points.filter(
        (point) => Number.isFinite(point.t) && Number.isFinite(point.v),
      ),
    }))
    .filter((trace) => trace.points.length > 0)

  if (finiteTraces.length === 0) {
    return <p className="muted">No waveform traces were produced.</p>
  }

  const points = finiteTraces.flatMap((trace) => trace.points)
  const maxT = Math.max(...points.map((point) => point.t), 0.001)
  const minY = Math.min(...points.map((point) => point.v), 0)
  const maxY = Math.max(...points.map((point) => point.v), 1)
  const ySpan = Math.max(maxY - minY, 0.001)
  const unit = finiteTraces.find((trace) => trace.unit)?.unit
  const width = 720
  const height = 220
  const padding = 28
  const colors = ["#16a34a", "#eab308", "#2563eb", "#dc2626"]

  function x(t: number) {
    return padding + (t / maxT) * (width - padding * 2)
  }

  function y(v: number) {
    return height - padding - ((v - minY) / ySpan) * (height - padding * 2)
  }

  return (
    <div className="waveform-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Waveform">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
        <text className="axis-label" x={padding + 4} y={padding - 8}>
          {unit ? `Value (${unit})` : "Value"}
        </text>
        <text className="axis-label" x={width - padding - 44} y={height - 8}>
          Time (s)
        </text>
        {finiteTraces.map((trace, index) => (
          <polyline
            key={trace.id}
            fill="none"
            stroke={colors[index % colors.length]}
            strokeWidth={2}
            points={trace.points.map((point) => `${x(point.t)},${y(point.v)}`).join(" ")}
          />
        ))}
      </svg>
      <div className="legend">
        {finiteTraces.map((trace, index) => (
          <span key={trace.id}>
            <i style={{ background: colors[index % colors.length] }} />
            {trace.name}
            {trace.unit ? ` (${trace.unit})` : ""}
          </span>
        ))}
      </div>
    </div>
  )
}
