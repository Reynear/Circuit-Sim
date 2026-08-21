import { getRequiredComponentDefinition } from "../../../lib/schematic/component-definitions"
import type { SymbolPlacement } from "../../../lib/schematic/placement"
import { squareMarker } from "../../../lib/schematic/post-markers"
import { DEFAULT_TEXT_SIZE } from "../../../lib/schematic/schematic-text"
import { getPrimarySymbolPosts } from "../../../lib/schematic/post-endpoints"
import { pointsEqual } from "../../../lib/schematic/geometry"
import type { SymbolObject, Vec2 } from "../../../lib/schematic/types"
import { TextNote } from "./TextNote"
import { GroundBars } from "./GroundGlyph"
import { SymbolLayer } from "./SymbolLayer"

export type AnnotationPreview = {
  kind: "ground" | "voltage-probe" | "current-probe" | "net-label" | "text"
  start: Vec2
  current: Vec2
}

type CreationPreviewLayerProps = {
  annotationPreview?: AnnotationPreview | null
  europeanResistors?: boolean
  iecGates?: boolean
  symbolPreview: {
    componentDefinitionId: string
    placement: SymbolPlacement
  } | null
}

export function CreationPreviewLayer({
  annotationPreview = null,
  europeanResistors = false,
  iecGates = false,
  symbolPreview,
}: CreationPreviewLayerProps) {
  if (!symbolPreview && !annotationPreview) {
    return null
  }

  return (
    <g className="creation-preview-layer" data-testid="creation-preview-layer">
      {symbolPreview ? (
        <SymbolCreationPreview
          europeanResistors={europeanResistors}
          iecGates={iecGates}
          symbolPreview={symbolPreview}
        />
      ) : null}
      {annotationPreview ? (
        <AnnotationCreationPreview preview={annotationPreview} />
      ) : null}
    </g>
  )
}

function SymbolCreationPreview({
  europeanResistors,
  iecGates,
  symbolPreview,
}: {
  europeanResistors: boolean
  iecGates: boolean
  symbolPreview: {
    componentDefinitionId: string
    placement: SymbolPlacement
  }
}) {
  const component = getRequiredComponentDefinition(
    symbolPreview.componentDefinitionId,
  )
  const previewSymbol: SymbolObject = {
    kind: "symbol",
    id: "symbol-create-preview",
    componentDefinitionId: symbolPreview.componentDefinitionId,
    symbolDefinitionId: component.defaultSymbolId,
    refdes: component.displayName,
    position: symbolPreview.placement.position,
    rotation: symbolPreview.placement.rotation,
    ...(symbolPreview.placement.pinSpacing
      ? { pinSpacing: symbolPreview.placement.pinSpacing }
      : {}),
    ...(symbolPreview.placement.pinSpread
      ? { pinSpread: symbolPreview.placement.pinSpread }
      : {}),
    props: { ...component.defaultProps },
  }
  const posts = getPrimarySymbolPosts(previewSymbol)

  return (
    <>
      <SymbolLayer
        symbols={[previewSymbol]}
        selectedIds={[]}
        europeanResistors={europeanResistors}
        iecGates={iecGates}
        onSymbolPointerDown={() => undefined}
        showRefdes={false}
      />
      {posts.map((post) => (
        <CreationPreviewHandle key={post.symbolPinId} position={post.position} />
      ))}
    </>
  )
}

function AnnotationCreationPreview({
  preview,
}: {
  preview: AnnotationPreview
}) {
  const shapePosition = preview.current
  const postPosition = preview.start
  const leadVector = {
    x: preview.current.x - preview.start.x,
    y: preview.current.y - preview.start.y,
  }
  const showDirection =
    preview.kind !== "text" && !pointsEqual(preview.start, preview.current)
  return (
    <g className="annotation-preview" data-testid="annotation-preview">
      {showDirection ? (
        <line
          className="symbol-stroke annotation-preview-direction"
          data-testid="annotation-preview-direction"
          x1={preview.start.x}
          y1={preview.start.y}
          x2={preview.current.x}
          y2={preview.current.y}
        />
      ) : null}
      <g
        data-testid="annotation-preview-shape"
        transform={`translate(${shapePosition.x} ${shapePosition.y})`}
      >
        <AnnotationPreviewShape kind={preview.kind} leadVector={leadVector} />
      </g>
      {preview.kind === "text" ? null : (
        <CreationPreviewHandle position={postPosition} />
      )}
    </g>
  )
}

export function CreationPreviewHandle({ position }: { position: Vec2 }) {
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
  leadVector,
}: {
  kind: AnnotationPreview["kind"]
  leadVector: Vec2
}) {
  if (kind === "ground") {
    return <GroundBars leadVector={leadVector} />
  }
  if (kind === "voltage-probe" || kind === "current-probe") {
    return (
      <>
        <circle className="probe" cx={0} cy={0} r={11} />
        <text className="probe-label" y={4} textAnchor="middle">
          {kind === "current-probe" ? "I" : "V"}
        </text>
      </>
    )
  }
  if (kind === "net-label") {
    return (
      <>
        <path className="label-flag" d="M 0 0 L 12 -7 L 54 -7 L 54 7 L 12 7 Z" />
        <text className="net-label-text" x={15} y={4}>
          NET
        </text>
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
