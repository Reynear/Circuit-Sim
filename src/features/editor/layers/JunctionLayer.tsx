import type { MouseEvent, PointerEvent, ReactNode } from "react"
import {
  getAnnotationLeadEnd,
  hasAnnotationLead,
} from "../../../lib/schematic/annotations"
import type {
  BoxObject,
  GroundObject,
  JunctionObject,
  LineObject,
  NetLabelObject,
  ProbeObject,
  TextObject,
} from "../../../lib/schematic/types"
import {
  leadAnnotationBodyRects,
  leadAnnotationBodySegments,
} from "../../../lib/schematic/lead-annotation-geometry"
import { TextNote } from "./TextNote"
import { GroundBars } from "./GroundGlyph"

type RenderableObject =
  | JunctionObject
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
    return (
      <>
        <LeadAnnotationHitTargets object={object} />
        <GroundAnnotationShape object={object} />
      </>
    )
  }
  if (object.kind === "probe") {
    return (
      <>
        <LeadAnnotationHitTargets object={object} />
        <LeadAnnotationBody object={object}>
          <circle className="probe" cx={0} cy={0} r={11} />
          <text y={4} textAnchor="middle">
            {object.probeType === "current" ? "I" : "V"}
          </text>
          <text className="refdes" x={0} y={28} textAnchor="middle">
            {object.name}
          </text>
        </LeadAnnotationBody>
      </>
    )
  }
  if (object.kind === "net-label") {
    return (
      <>
        <LeadAnnotationHitTargets object={object} />
        <LeadAnnotationBody object={object}>
          <path className="label-flag" d="M 0 0 L 12 -7 L 54 -7 L 54 7 L 12 7 Z" />
          <text x={15} y={4}>
            {object.text}
          </text>
        </LeadAnnotationBody>
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
  return <circle className="junction-dot" cx={0} cy={0} r={4} />
}

function LeadAnnotationHitTargets({
  object,
}: {
  object: GroundObject | NetLabelObject | ProbeObject
}) {
  if (!hasAnnotationLead(object)) {
    return null
  }
  const leadEnd = getAnnotationLeadEnd(object)
  const dx = leadEnd.x - object.position.x
  const dy = leadEnd.y - object.position.y
  const rects = leadAnnotationBodyRects(object)
  const segments = leadAnnotationBodySegments(object)

  return (
    <g className="annotation-hit-targets">
      <line
        className="annotation-hit-area"
        x1={0}
        y1={0}
        x2={dx}
        y2={dy}
      />
      {rects.map((rect, index) => (
        <rect
          key={`rect-${index}`}
          className="annotation-hit-area"
          x={rect.x - object.position.x}
          y={rect.y - object.position.y}
          width={rect.width}
          height={rect.height}
        />
      ))}
      {segments.map((segment, index) => (
        <line
          key={`segment-${index}`}
          className="annotation-hit-area"
          x1={segment.start.x - object.position.x}
          y1={segment.start.y - object.position.y}
          x2={segment.end.x - object.position.x}
          y2={segment.end.y - object.position.y}
        />
      ))}
    </g>
  )
}

function GroundAnnotationShape({ object }: { object: GroundObject }) {
  if (!hasAnnotationLead(object)) {
    return <GroundShape />
  }
  const leadEnd = getAnnotationLeadEnd(object)
  const dx = leadEnd.x - object.position.x
  const dy = leadEnd.y - object.position.y
  return (
    <>
      <line className="symbol-stroke annotation-lead" x1={0} y1={0} x2={dx} y2={dy} />
      <g data-testid="annotation-lead-body" transform={`translate(${dx} ${dy})`}>
        <GroundBars leadVector={{ x: dx, y: dy }} />
      </g>
    </>
  )
}

function LeadAnnotationBody({
  children,
  object,
}: {
  children: ReactNode
  object: GroundObject | NetLabelObject | ProbeObject
}) {
  if (!hasAnnotationLead(object)) {
    return <>{children}</>
  }
  const leadEnd = getAnnotationLeadEnd(object)
  const dx = leadEnd.x - object.position.x
  const dy = leadEnd.y - object.position.y
  return (
    <>
      <line className="symbol-stroke annotation-lead" x1={0} y1={0} x2={dx} y2={dy} />
      <g data-testid="annotation-lead-body" transform={`translate(${dx} ${dy})`}>
        {children}
      </g>
    </>
  )
}

function GroundShape() {
  return (
    <>
      <line className="symbol-stroke" x1={0} y1={0} x2={0} y2={20} />
      <g transform="translate(0 20)">
        <GroundBars leadVector={{ x: 0, y: 20 }} />
      </g>
    </>
  )
}
