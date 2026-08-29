import type { MouseEvent, PointerEvent } from "react"
import type {
  BoxObject,
  GroundObject,
  LineObject,
  NetLabelObject,
  ProbeObject,
  SchematicObject,
  TextObject,
  WireObject,
} from "@circuit-sim/core/circuit/project"
import type { VoltageColorOptions } from "@/browser/simulation/display"
import type { RunObservationReport } from "@circuit-sim/core/simulation/run-observations"
import { JunctionLayer } from "./JunctionLayer"
import { ComponentLayer } from "./ComponentLayer"
import { WireLayer } from "./WireLayer"

type AnnotationObject =
  | GroundObject
  | NetLabelObject
  | ProbeObject
  | TextObject
  | LineObject
  | BoxObject

type ElementLayerProps = {
  objects: ReadonlyArray<SchematicObject>
  selectedIds: string[]
  netHighlightIds?: string[]
  measurements: RunObservationReport | null
  showPower?: boolean
  showValues?: boolean
  showVoltage?: boolean
  voltageColors?: VoltageColorOptions | undefined
  onObjectPointerDown: (objectId: string, event: PointerEvent<SVGGElement>) => void
  onObjectDoubleClick: (objectId: string, event: MouseEvent<SVGGElement>) => void
  onComponentPointerDown: (componentId: string, event: PointerEvent<SVGGElement>) => void
  onWirePointerDown: (wireId: string, event: PointerEvent<SVGPolylineElement>) => void
  onPointerEnterObject: (objectId: string) => void
  onPointerLeaveObject: () => void
}

export function ElementLayer({
  objects,
  selectedIds,
  netHighlightIds = [],
  measurements,
  showPower = false,
  showValues = true,
  showVoltage = true,
  voltageColors,
  onObjectPointerDown,
  onObjectDoubleClick,
  onPointerEnterObject,
  onPointerLeaveObject,
  onComponentPointerDown,
  onWirePointerDown,
}: ElementLayerProps) {
  const wires = objects.filter(
    (object): object is WireObject => object.kind === "wire",
  )
  const components = objects.filter((object) => object.kind === "component")
  const annotations = objects.filter(isAnnotationObject)

  return (
    <g className="element-layer">
      <WireLayer
        wires={wires}
        selectedIds={selectedIds}
        netHighlightIds={netHighlightIds}
        measurements={measurements}
        showVoltage={showVoltage}
        voltageColors={voltageColors}
        onWirePointerDown={onWirePointerDown}
        onWirePointerEnter={onPointerEnterObject}
        onWirePointerLeave={onPointerLeaveObject}
      />
      <ConnectionDots wires={wires} />
      <ComponentLayer
        components={components}
        selectedIds={selectedIds}
        netHighlightIds={netHighlightIds}
        measurements={measurements}
        showPower={showPower}
        showValues={showValues}
        showVoltage={showVoltage}
        voltageColors={voltageColors}
        onComponentPointerDown={onComponentPointerDown}
        onComponentDoubleClick={onObjectDoubleClick}
        onComponentPointerEnter={onPointerEnterObject}
        onComponentPointerLeave={onPointerLeaveObject}
      />
      <JunctionLayer
        objects={annotations}
        selectedIds={selectedIds}
        netHighlightIds={netHighlightIds}
        onObjectPointerDown={onObjectPointerDown}
        onObjectDoubleClick={onObjectDoubleClick}
        onObjectPointerEnter={onPointerEnterObject}
        onObjectPointerLeave={onPointerLeaveObject}
      />
    </g>
  )
}

function ConnectionDots({ wires }: { wires: ReadonlyArray<WireObject> }) {
  const counts = new Map<string, { point: WireObject["points"][number]; count: number }>()
  for (const wire of wires) {
    wire.points.forEach((point, index) => {
      const key = `${point.x},${point.y}`
      const current = counts.get(key)
      const degree = index === 0 || index === wire.points.length - 1 ? 1 : 2
      counts.set(key, { point, count: (current?.count ?? 0) + degree })
    })
  }
  const junctions = [...counts.values()].filter(({ count }) => count >= 3)
  return (
    <g className="connection-dots">
      {junctions.map(({ point }) => (
        <circle key={`${point.x},${point.y}`} className="junction-dot" cx={point.x} cy={point.y} r={4} />
      ))}
    </g>
  )
}

function isAnnotationObject(object: SchematicObject): object is AnnotationObject {
  return object.kind !== "component" && object.kind !== "wire"
}
