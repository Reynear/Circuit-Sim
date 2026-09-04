import { renderToStaticMarkup } from "react-dom/server"
import { Data, Effect } from "effect"
import { getPinPosts, getLocalPins } from "@circuit-sim/core/circuit/component-geometry"
import { extractNetlist, pinConnectionKey } from "@circuit-sim/core/circuit/net-extraction"
import type {
  CircuitProject,
  Component,
  Point,
  SchematicObject,
  WireObject,
} from "@circuit-sim/core/circuit/project"
import {
  getComponentLabelPositions,
  getWorldBounds,
} from "@/browser/editor/component-geometry"
import { getTextSize, splitTextLines } from "@/browser/editor/text"
import { Glyph, displayValue, leadEnd } from "@/features/editor/layers/ComponentLayer"
import { GroundBars } from "@/features/editor/layers/GroundGlyph"
import { TextNote } from "@/features/editor/layers/TextNote"
import { netLabelFlagWidth } from "@/features/editor/layers/net-label-geometry"

export type SchematicFocus = {
  readonly objectIds?: readonly string[]
  readonly netIds?: readonly string[]
}

export type RenderSchematicOptions = {
  readonly focus?: SchematicFocus
}

export type SchematicRenderWarning =
  | "empty-project"
  | "large-canvas"
  | "many-objects"

export type RenderSchematicResult = {
  readonly svg: string
  readonly width: number
  readonly height: number
  readonly viewBox: readonly [number, number, number, number]
  readonly warnings: readonly SchematicRenderWarning[]
  readonly focusedObjectIds: readonly string[]
}

export type RenderSchematicErrorCode =
  | "too-many-objects"
  | "too-many-points"
  | "focus-object-not-found"
  | "focus-net-not-found"
  | "svg-too-large"
  | "canvas-too-large"

export class RenderSchematicRejected extends Data.TaggedError(
  "RenderSchematicRejected",
)<{
  readonly code: RenderSchematicErrorCode
  readonly message: string
}> {}

export class RenderSchematicFailed extends Data.TaggedError(
  "RenderSchematicFailed",
)<{
  readonly message: string
}> {}

export type RenderSchematicError =
  | RenderSchematicRejected
  | RenderSchematicFailed

/**
 * Render one validated CircuitProject snapshot as a deterministic, standalone
 * SVG. This is deliberately an interface-edge renderer: the project remains
 * the source of truth and the editor's Glyph definitions remain the source of
 * component symbol geometry.
 */
export function renderSchematic(
  project: CircuitProject,
  options: RenderSchematicOptions = {},
): Effect.Effect<RenderSchematicResult, RenderSchematicError> {
  return Effect.gen(function* () {
    const objectCount = project.objects.length
    const pointCount = project.objects.reduce(
      (count, object) => count + (object.kind === "wire" ? object.points.length : 1),
      0,
    )
    if (objectCount > LIMITS.maxObjects) {
      return yield* reject(
        "too-many-objects",
        `Schematic contains ${objectCount} objects; maximum is ${LIMITS.maxObjects}`,
      )
    }
    if (pointCount > LIMITS.maxPoints) {
      return yield* reject(
        "too-many-points",
        `Schematic contains ${pointCount} geometry points; maximum is ${LIMITS.maxPoints}`,
      )
    }

    const netlist = extractNetlist(project)
    const focusedObjectIds = yield* resolveFocus(project, netlist, options.focus)
    const bounds = schematicBounds(project)
    if (bounds.width > LIMITS.maxCanvas || bounds.height > LIMITS.maxCanvas) {
      return yield* reject(
        "canvas-too-large",
        `Schematic canvas ${bounds.width}×${bounds.height} exceeds ${LIMITS.maxCanvas}px`,
      )
    }

    const markup = yield* Effect.try({
      try: () => renderToStaticMarkup(
        <StaticSchematic
          project={project}
          bounds={bounds}
          focusedObjectIds={focusedObjectIds}
        />,
      ),
      catch: (cause) => new RenderSchematicFailed({
        message: cause instanceof Error ? cause.message : "React failed to render the schematic",
      }),
    })
    const svg = `<?xml version="1.0" encoding="UTF-8"?>${markup}`
    const byteLength = new TextEncoder().encode(svg).byteLength
    if (byteLength > LIMITS.maxSvgBytes) {
      return yield* reject(
        "svg-too-large",
        `Rendered schematic is ${byteLength} bytes; maximum is ${LIMITS.maxSvgBytes}`,
      )
    }

    const warnings: SchematicRenderWarning[] = []
    if (objectCount === 0) warnings.push("empty-project")
    if (objectCount > LIMITS.warningObjects) warnings.push("many-objects")
    if (bounds.width > LIMITS.warningCanvas || bounds.height > LIMITS.warningCanvas) {
      warnings.push("large-canvas")
    }
    return {
      svg,
      width: bounds.width,
      height: bounds.height,
      viewBox: [bounds.x, bounds.y, bounds.width, bounds.height],
      warnings,
      focusedObjectIds,
    }
  })
}

const reject = (
  code: RenderSchematicErrorCode,
  message: string,
): Effect.Effect<never, RenderSchematicRejected> =>
  Effect.fail(new RenderSchematicRejected({ code, message }))

const LIMITS = {
  maxObjects: 500,
  maxPoints: 5_000,
  maxCanvas: 20_000,
  maxSvgBytes: 1_000_000,
  warningObjects: 200,
  warningCanvas: 4_000,
} as const

type SchematicBounds = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

function resolveFocus(
  project: CircuitProject,
  netlist: ReturnType<typeof extractNetlist>,
  focus: SchematicFocus | undefined,
): Effect.Effect<readonly string[], RenderSchematicRejected> {
  return Effect.gen(function* () {
    if (!focus) return []
    const objectsById = new Map(project.objects.map((object) => [object.id, object]))
    const selected = new Set<string>()
    for (const objectId of focus.objectIds ?? []) {
      if (!objectsById.has(objectId)) {
        return yield* reject(
          "focus-object-not-found",
          `Focus object ${objectId} does not exist in this project`,
        )
      }
      selected.add(objectId)
    }
    const knownNetIds = new Set(netlist.nets.map((net) => net.id))
    for (const netId of focus.netIds ?? []) {
      if (!knownNetIds.has(netId)) {
        return yield* reject(
          "focus-net-not-found",
          `Focus net ${netId} does not exist in this project`,
        )
      }
      for (const object of project.objects) {
        if (netObjectIds(object, netId, netlist)) selected.add(object.id)
      }
    }
    return [...selected].sort()
  })
}

function netObjectIds(
  object: SchematicObject,
  netId: string,
  netlist: ReturnType<typeof extractNetlist>,
): boolean {
  if (netlist.objectToNetId.get(object.id) === netId) return true
  return object.kind === "component" && getPinPosts(object).some(
    (pin) => netlist.pinToNetId.get(pinConnectionKey(object.id, pin.pin)) === netId,
  )
}

function schematicBounds(project: CircuitProject): SchematicBounds {
  if (project.objects.length === 0) {
    return { x: -120, y: -90, width: 240, height: 180 }
  }
  const points: Point[] = []
  const add = (x: number, y: number) => points.push({ x, y })
  const addBox = (x: number, y: number, width: number, height: number) => {
    add(x, y)
    add(x + width, y + height)
  }

  for (const object of project.objects) {
    if (object.kind === "component") {
      const bounds = getWorldBounds(object)
      const labels = getComponentLabelPositions(object)
      const addLabel = (
        label: typeof labels.refdes,
        text: string,
      ) => {
        const width = Math.max(1, text.length) * 7
        const x = label.textAnchor === "middle"
          ? label.x - width / 2
          : label.textAnchor === "end"
            ? label.x - width
            : label.x
        addBox(x, label.y - 14, width, 18)
      }
      addBox(bounds.x, bounds.y, bounds.width, bounds.height)
      addLabel(labels.refdes, object.refdes)
      addLabel(labels.value, displayValue(object))
      continue
    }
    if (object.kind === "wire") {
      for (const point of object.points) add(point.x, point.y)
      continue
    }
    if (object.kind === "ground") {
      addBox(object.position.x - 12, object.position.y, 24, 36)
      continue
    }
    if (object.kind === "net-label") {
      addBox(
        object.position.x,
        object.position.y - 12,
        17 + netLabelFlagWidth(object.text),
        24,
      )
      continue
    }
    if (object.kind === "probe") {
      addBox(object.position.x - 12, object.position.y - 14, 64, 52)
      continue
    }
    if (object.kind === "text") {
      const size = getTextSize(object)
      const lines = splitTextLines(object.text)
      const width = Math.max(1, ...lines.map((line) => line.length)) * size * 0.62
      addBox(object.position.x - 3, object.position.y - size, width + 6, Math.max(size, lines.length * (size + 3)) + 3)
      continue
    }
    if (object.kind === "line" || object.kind === "box") {
      add(object.start.x, object.start.y)
      add(object.end.x, object.end.y)
    }
  }

  const minX = Math.floor(Math.min(...points.map((point) => point.x)) - 32)
  const minY = Math.floor(Math.min(...points.map((point) => point.y)) - 32)
  const maxX = Math.ceil(Math.max(...points.map((point) => point.x)) + 32)
  const maxY = Math.ceil(Math.max(...points.map((point) => point.y)) + 32)
  const width = Math.max(240, maxX - minX)
  const height = Math.max(180, maxY - minY)
  return { x: minX, y: minY, width, height }
}

function StaticSchematic({
  project,
  bounds,
  focusedObjectIds,
}: {
  readonly project: CircuitProject
  readonly bounds: SchematicBounds
  readonly focusedObjectIds: readonly string[]
}) {
  const focused = new Set(focusedObjectIds)
  const wires = project.objects.filter((object): object is WireObject => object.kind === "wire")
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={bounds.width}
      height={bounds.height}
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      version="1.1"
      className="static-schematic"
    >
      <style>{STATIC_STYLE}</style>
      <rect className="canvas-background" x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} />
      <g>
        {wires.map((wire) => (
          <StaticWire key={wire.id} wire={wire} focused={focused.has(wire.id)} hasFocus={focused.size > 0} />
        ))}
        <StaticJunctionDots wires={wires} focused={focused} hasFocus={focused.size > 0} />
        {project.objects.map((object) => (
          <StaticObject key={object.id} object={object} focused={focused.has(object.id)} hasFocus={focused.size > 0} />
        ))}
      </g>
    </svg>
  )
}

function StaticWire({ wire, focused, hasFocus }: { wire: WireObject; focused: boolean; hasFocus: boolean }) {
  return (
    <polyline
      className={staticClass("wire", focused, hasFocus)}
      points={wire.points.map((point) => `${point.x},${point.y}`).join(" ")}
    />
  )
}

function StaticJunctionDots({
  wires,
  focused,
  hasFocus,
}: {
  readonly wires: readonly WireObject[]
  readonly focused: ReadonlySet<string>
  readonly hasFocus: boolean
}) {
  const counts = new Map<string, { point: Point; count: number; focused: boolean }>()
  for (const wire of wires) {
    wire.points.forEach((point, index) => {
      const key = `${point.x},${point.y}`
      const current = counts.get(key)
      const degree = index === 0 || index === wire.points.length - 1 ? 1 : 2
      counts.set(key, {
        point,
        count: (current?.count ?? 0) + degree,
        focused: Boolean(current?.focused || focused.has(wire.id)),
      })
    })
  }
  return (
    <g className="connection-dots">
      {[...counts.values()].filter(({ count }) => count >= 3).map(({ point, focused: isFocused }) => (
        <circle
          key={`${point.x},${point.y}`}
          className={staticClass("junction-dot", isFocused, hasFocus)}
          cx={point.x}
          cy={point.y}
          r={4}
        />
      ))}
    </g>
  )
}

function StaticObject({ object, focused, hasFocus }: { object: SchematicObject; focused: boolean; hasFocus: boolean }) {
  if (object.kind === "wire" || object.kind === "component") {
    return object.kind === "component" ? <StaticComponent component={object} focused={focused} hasFocus={hasFocus} /> : null
  }
  const className = staticClass("junction", focused, hasFocus)
  if (object.kind === "ground") {
    return <g className={className} transform={`translate(${object.position.x} ${object.position.y})`}><line className="annotation-lead" x1={0} y1={0} x2={0} y2={20} /><g transform="translate(0 20)"><GroundBars leadVector={{ x: 0, y: 20 }} includeTestId={false} /></g><text className="ground-label" x={16} y={30}>GND</text></g>
  }
  if (object.kind === "net-label") {
    const right = 17 + netLabelFlagWidth(object.text)
    return <g className={className} transform={`translate(${object.position.x} ${object.position.y})`}><line className="annotation-lead" x1={0} y1={0} x2={17} y2={0} /><path className="label-flag" d={`M 17 0 L 29 -7 L ${right} -7 L ${right} 7 L 29 7 Z`} /><text x={32} y={4}>{object.text}</text></g>
  }
  if (object.kind === "probe") {
    return <g className={className} transform={`translate(${object.position.x} ${object.position.y})`}><line className="annotation-lead" x1={0} y1={0} x2={32} y2={0} /><g transform="translate(32 0)"><circle className="probe" cx={0} cy={0} r={11} /><text y={4} textAnchor="middle">{object.probeType === "current" ? "I" : "V"}</text><text className="refdes" x={0} y={28} textAnchor="middle">{object.name}</text></g></g>
  }
  if (object.kind === "text") {
    return <g className={className} transform={`translate(${object.position.x} ${object.position.y})`}><TextNote text={object} /></g>
  }
  if (object.kind === "line") {
    return <g className={className}><line className="schematic-line" x1={object.start.x} y1={object.start.y} x2={object.end.x} y2={object.end.y} /></g>
  }
  const x = Math.min(object.start.x, object.end.x)
  const y = Math.min(object.start.y, object.end.y)
  return <g className={className}><rect className="schematic-box" x={x} y={y} width={Math.abs(object.end.x - object.start.x)} height={Math.abs(object.end.y - object.start.y)} /></g>
}

function StaticComponent({ component, focused, hasFocus }: { component: Component; focused: boolean; hasFocus: boolean }) {
  const labels = getComponentLabelPositions(component)
  return (
    <g className={staticClass("component", focused, hasFocus)}>
      <g transform={componentTransform(component)}>
        {getLocalPins(component).map((pin) => {
          const end = leadEnd(pin.post)
          return <line key={pin.key} className="pin-lead" x1={pin.post.x} y1={pin.post.y} x2={end.x} y2={end.y} />
        })}
        <Glyph component={component} />
      </g>
      <text className="refdes" {...labels.refdes}>{component.refdes}</text>
      <text className="value" {...labels.value}>{displayValue(component)}</text>
    </g>
  )
}

function componentTransform(component: Component): string {
  const flip = component.flipped ? " scale(1 -1)" : ""
  return `translate(${component.position.x} ${component.position.y}) rotate(${component.rotation})${flip}`
}

function staticClass(base: string, focused: boolean, hasFocus: boolean): string {
  return [base, focused ? "focus" : null, hasFocus && !focused ? "dim" : null].filter(Boolean).join(" ")
}

const STATIC_STYLE = `
.static-schematic { font-family: "DejaVu Sans", Verdana, Geneva, sans-serif; shape-rendering: geometricPrecision; }
.canvas-background { fill: #ffffff; }
.wire { fill: none; stroke: #26384a; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.component line, .component .symbol-body, .symbol-stroke { fill: none; stroke: #26384a; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.component .symbol-fill { fill: #26384a; stroke: #26384a; stroke-width: 1; stroke-linejoin: round; }
.component .symbol-body.small-stroke { stroke-width: 1.6; }
.component .pin-dot { fill: #ffffff; stroke: #26384a; stroke-width: 2; }
.component .symbol-label { fill: #26384a; font-size: 13px; font-weight: 700; }
.refdes { font-size: 12px; font-weight: 700; fill: #162536; }
.value { font-size: 11px; fill: #536579; }
.junction-dot { fill: #26384a; }
.ground-label { fill: #536579; font-size: 11px; font-weight: 700; }
.annotation-lead, .schematic-line, .schematic-box { fill: none; stroke: #536579; stroke-width: 2; stroke-linecap: round; }
.schematic-box { stroke-dasharray: 16 6; }
.label-flag { fill: #ffffff; stroke: #536579; stroke-width: 1.5; }
.junction text { fill: #26384a; font-size: 12px; font-weight: 700; }
.probe { fill: #ffffff; stroke: #26384a; stroke-width: 2; }
.schematic-text-note { fill: #26384a; font-size: 24px; font-weight: 400; }
.focus { opacity: 1; }
.focus .wire, .wire.focus { stroke: #d9480f; stroke-width: 4; }
.focus .symbol-body, .focus line, .focus .label-flag, .focus .probe, .focus .schematic-line, .focus .schematic-box, .focus .symbol-stroke, .focus .symbol-fill { stroke: #d9480f; }
.focus .symbol-fill { fill: #d9480f; }
.focus text, .focus .junction-dot { fill: #d9480f; }
.dim { opacity: .24; }
`
