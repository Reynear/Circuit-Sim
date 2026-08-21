import {
  getTextSize,
  splitTextLines,
  textLineY,
} from "../../../lib/schematic/schematic-text"
import type { TextObject } from "../../../lib/schematic/types"

type TextNoteProps = {
  text: TextObject
}

export function TextNote({ text }: TextNoteProps) {
  const fontSize = getTextSize(text)
  return (
    <text className="schematic-text-note" x={0} y={0} style={{ fontSize }}>
      {splitTextLines(text.text).map((line, index) => (
        <tspan key={`${index}-${line}`} x={0} y={textLineY(fontSize, index)}>
          {line}
        </tspan>
      ))}
    </text>
  )
}
