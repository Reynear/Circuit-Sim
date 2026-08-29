import type { MouseEvent, PointerEvent } from "react"
import type {
  BoxObject,
  GroundObject,
  LineObject,
  NetLabelObject,
  ProbeObject,
  TextObject,
} from "@circuit-sim/core/circuit/project"
import { TextNote } from "./TextNote"
import { GroundBars } from "./GroundGlyph"

type RenderableObject =
  | GroundObject
  | NetLabelObject
  | ProbeObject
  | TextObject
  | LineObject
  | BoxObject

type JunctionLayerProps = {
  objects: RenderableObject[]
  selectedIds: string[]
  netHighlightIds?: string[]
  onObjectPointerDown: (
    objectId: string,
    event: PointerEvent<SVGGElement>,
  ) => void
  onObjectDoubleClick?: (
    objectId: string,
    event: MouseEvent<SVGGElement>,
  ) => void
  onObjectPointerEnter?: (objectId: string) => void
  onObjectPointerLeave?: () => void
}

export function JunctionLayer({
  objects,
  selectedIds,
  netHighlightIds = [],
  onObjectPointerDown,
  onObjectDoubleClick,
  onObjectPointerEnter,
  onObjectPointerLeave,
}: JunctionLayerProps) {
  return (
    <g className="junction-layer">
      {objects.map((object) => {
        const className = [
          "junction",
          object.kind === "line" || object.kind === "box" ? "shape-object" : null,
          selectedIds.includes(object.id) ? "selected" : null,
          netHighlightIds.includes(object.id) ? "net-highlight" : null,
        ]
          .filter(Boolean)
          .join(" ")
        return (
          <g
            key={object.id}
            className={className}
            transform={
              object.kind === "line" || object.kind === "box"
                ? undefined
                : `translate(${object.position.x} ${object.position.y})`
            }
            onPointerDown={(event) => onObjectPointerDown(object.id, event)}
            onDoubleClick={(event) => onObjectDoubleClick?.(object.id, event)}
            onPointerEnter={() => onObjectPointerEnter?.(object.id)}
            onPointerLeave={onObjectPointerLeave}
          >
            <RenderableObjectShape object={object} />
          </g>
        )
      })}
    </g>
  )
}

function RenderableObjectShape({ object }: { object: RenderableObject }) {
  if (object.kind === "ground") {
    return <GroundShape />
  }
  if (object.kind === "probe") {
    return (
      <>
        <AnnotationLead x={32} />
        <g transform="translate(32 0)">
          <circle className="probe" cx={0} cy={0} r={11} />
          <text y={4} textAnchor="middle">
            {object.probeType === "current" ? "I" : "V"}
          </text>
          <text className="refdes" x={0} y={28} textAnchor="middle">
            {object.name}
          </text>
        </g>
      </>
    )
  }
  if (object.kind === "net-label") {
    return (
      <>
        <AnnotationLead x={17} />
        <g transform="translate(17 0)">
          <path className="label-flag" d="M 0 0 L 12 -7 L 54 -7 L 54 7 L 12 7 Z" />
          <text x={15} y={4}>
            {object.text}
          </text>
        </g>
      </>
    )
  }
  if (object.kind === "text") {
    return <TextNote text={object} />
  }
  if (object.kind === "line") {
    return (
      <>
        <line
          className="schematic-line-hit"
          x1={object.start.x}
          y1={object.start.y}
          x2={object.end.x}
          y2={object.end.y}
        />
        <line
          className="schematic-line"
          data-testid="schematic-line"
          x1={object.start.x}
          y1={object.start.y}
          x2={object.end.x}
          y2={object.end.y}
        />
      </>
    )
  }
  if (object.kind === "box") {
    const x = Math.min(object.start.x, object.end.x)
    const y = Math.min(object.start.y, object.end.y)
    const width = Math.abs(object.end.x - object.start.x)
    const height = Math.abs(object.end.y - object.start.y)
    return (
      <>
        <rect
          className="schematic-box-hit"
          x={x}
          y={y}
          width={width}
          height={height}
        />
        <rect
          className="schematic-box"
          data-testid="schematic-box"
          x={x}
          y={y}
          width={width}
          height={height}
        />
      </>
    )
  }
  return null
}

function AnnotationLead({ x, y = 0 }: { x: number; y?: number }) {
  return (
    <>
      <line
        className="annotation-hit-area"
        x1={0}
        y1={0}
        x2={x}
        y2={y}
      />
      <line className="symbol-stroke annotation-lead" x1={0} y1={0} x2={x} y2={y} />
    </>
  )
}

function GroundShape() {
  return (
    <>
      <AnnotationLead x={0} y={20} />
      <g transform="translate(0 20)">
        <GroundBars leadVector={{ x: 0, y: 20 }} />
      </g>
    </>
  )
}
