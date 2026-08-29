import { newId } from "@circuit-sim/core/ids"
import {
  getComponent,
  type ComponentType,
} from "@circuit-sim/core/circuit/components"
import { squareMarker } from "@/browser/editor/post-markers"
import { DEFAULT_TEXT_SIZE } from "@/browser/editor/text"
import { getPrimaryComponentPosts } from "@/browser/editor/post-endpoints"
import {
  makeComponent,
  type Component,
  type Point,
} from "@circuit-sim/core/circuit/project"
import { TextNote } from "./TextNote"
import { GroundBars } from "./GroundGlyph"
import { ComponentLayer } from "./ComponentLayer"

export type AnnotationPreview = {
  kind: "ground" | "voltage-probe" | "current-probe" | "net-label" | "text"
  start: Point
  current: Point
}

type CreationPreviewLayerProps = {
  annotationPreview?: AnnotationPreview | null
  componentPreview: {
    type: ComponentType
    start: Point
    end: Point
  } | null
}

export function CreationPreviewLayer({
  annotationPreview = null,
  componentPreview,
}: CreationPreviewLayerProps) {
  if (!componentPreview && !annotationPreview) {
    return null
  }

  return (
    <g className="creation-preview-layer" data-testid="creation-preview-layer">
      {componentPreview ? (
        <ComponentCreationPreview preview={componentPreview} />
      ) : null}
      {annotationPreview ? (
        <AnnotationCreationPreview preview={annotationPreview} />
      ) : null}
    </g>
  )
}

function ComponentCreationPreview({
  preview,
}: {
  preview: {
    type: ComponentType
    start: Point
    end: Point
  }
}) {
  const spec = getComponent(preview.type)
  const component: Component = makeComponent({
    kind: "component",
    id: newId(),
    type: preview.type,
    refdes: spec.name,
    position: midpoint(preview.start, preview.end),
    rotation: previewRotation(preview.start, preview.end),
    flipped: false,
    props: spec.defaults,
  })
  const posts = getPrimaryComponentPosts(component)

  return (
    <>
      <ComponentLayer
        components={[component]}
        selectedIds={[]}
        onComponentPointerDown={() => undefined}
        showRefdes={false}
      />
      {posts.map((post) => (
        <CreationPreviewHandle key={post.pin} position={post.position} />
      ))}
    </>
  )
}

function previewRotation(start: Point, end: Point): Component["rotation"] {
  const dx = end.x - start.x
  const dy = end.y - start.y
  return Math.abs(dx) >= Math.abs(dy)
    ? dx >= 0 ? 0 : 180
    : dy >= 0 ? 90 : 270
}

function midpoint(start: Point, end: Point): Point {
  return {
    x: Math.round((start.x + end.x) / 2),
    y: Math.round((start.y + end.y) / 2),
  }
}

function AnnotationCreationPreview({
  preview,
}: {
  preview: AnnotationPreview
}) {
  const position = preview.kind === "text" ? preview.current : preview.start
  return (
    <g className="annotation-preview" data-testid="annotation-preview">
      <g
        data-testid="annotation-preview-shape"
        transform={`translate(${position.x} ${position.y})`}
      >
        <AnnotationPreviewShape kind={preview.kind} />
      </g>
      {preview.kind === "text" ? null : (
        <CreationPreviewHandle position={position} />
      )}
    </g>
  )
}

export function CreationPreviewHandle({ position }: { position: Point }) {
  const marker = squareMarker(position)
  return (
    <rect
      className="creation-preview-post"
      data-testid="creation-preview-post"
      height={marker.height}
      width={marker.width}
      x={marker.x}
      y={marker.y}
    />
  )
}

function AnnotationPreviewShape({
  kind,
}: {
  kind: AnnotationPreview["kind"]
}) {
  if (kind === "ground") {
    return (
      <>
        <line className="symbol-stroke" x1={0} y1={0} x2={0} y2={20} />
        <g transform="translate(0 20)">
          <GroundBars leadVector={{ x: 0, y: 20 }} />
        </g>
      </>
    )
  }
  if (kind === "voltage-probe" || kind === "current-probe") {
    return (
      <>
        <line className="symbol-stroke" x1={0} y1={0} x2={32} y2={0} />
        <g transform="translate(32 0)">
          <circle className="probe" cx={0} cy={0} r={11} />
          <text className="probe-label" y={4} textAnchor="middle">
            {kind === "current-probe" ? "I" : "V"}
          </text>
        </g>
      </>
    )
  }
  if (kind === "net-label") {
    return (
      <>
        <line className="symbol-stroke" x1={0} y1={0} x2={17} y2={0} />
        <g transform="translate(17 0)">
          <path className="label-flag" d="M 0 0 L 12 -7 L 54 -7 L 54 7 L 12 7 Z" />
          <text className="net-label-text" x={15} y={4}>
            NET
          </text>
        </g>
      </>
    )
  }
  return (
    <TextNote
      text={{
        kind: "text",
        id: "text-preview",
        text: "hello",
        fontSize: DEFAULT_TEXT_SIZE,
        position: { x: 0, y: 0 },
      }}
    />
  )
}
