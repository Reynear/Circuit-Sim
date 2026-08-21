type SelectionLayerProps = {
  marquee?: { x: number; y: number; width: number; height: number } | null
}

export function SelectionLayer({ marquee }: SelectionLayerProps) {
  if (!marquee) {
    return null
  }

  return (
    <g className="selection-layer">
      <rect
        className="selection-marquee"
        data-testid="selection-marquee"
        x={marquee.x}
        y={marquee.y}
        width={marquee.width}
        height={marquee.height}
      />
    </g>
  )
}
