import type { MouseEvent, PointerEvent } from "react"
import type {
  BoxObject,
  GroundObject,
  JunctionObject,
  LineObject,
  NetLabelObject,
  ProbeObject,
  SchematicObject,
  SymbolObject,
  TextObject,
  WireObject,
} from "../../../lib/schematic/types"
import type {
  CircuitMeasurementReport,
  VoltageColorOptions,
} from "../../../lib/simulation/measurements"
import { JunctionLayer } from "./JunctionLayer"
import { SymbolLayer } from "./SymbolLayer"
import { WireLayer } from "./WireLayer"

type AnnotationObject =
  | JunctionObject
  | GroundObject
  | NetLabelObject
  | ProbeObject
  | TextObject
  | LineObject
  | BoxObject

type ElementLayerProps = {
  objects: SchematicObject[]
  selectedIds: string[]
  netHighlightIds?: string[]
  measurements: CircuitMeasurementReport | null
  europeanResistors?: boolean
  iecGates?: boolean
  showPower?: boolean
  showValues?: boolean
  showVoltage?: boolean
  voltageColors?: VoltageColorOptions | undefined
  onObjectPointerDown: (
    objectId: string,
    event: PointerEvent<SVGGElement>,
  ) => void
  onObjectDoubleClick: (
    objectId: string,
    event: MouseEvent<SVGGElement>,
  ) => void
  onSymbolPointerDown: (
    symbolId: string,
    event: PointerEvent<SVGGElement>,
  ) => void
  onWirePointerDown: (
    wireId: string,
    event: PointerEvent<SVGPolylineElement>,
  ) => void
  onPointerEnterObject: (objectId: string) => void
  onPointerLeaveObject: () => void
}

export function ElementLayer({
  objects,
  selectedIds,
  netHighlightIds = [],
  measurements,
  europeanResistors = false,
  iecGates = false,
  showPower = false,
  showValues = true,
  showVoltage = true,
  voltageColors,
  onObjectPointerDown,
  onObjectDoubleClick,
  onPointerEnterObject,
  onPointerLeaveObject,
  onSymbolPointerDown,
  onWirePointerDown,
}: ElementLayerProps) {
  return (
    <g className="element-layer">
      {objects.map((object) => {
        if (object.kind === "wire") {
          return (
            <WireLayer
              key={object.id}
              wires={[object as WireObject]}
              selectedIds={selectedIds}
              netHighlightIds={netHighlightIds}
              measurements={measurements}
              showVoltage={showVoltage}
              voltageColors={voltageColors}
              onWirePointerDown={onWirePointerDown}
              onWirePointerEnter={onPointerEnterObject}
              onWirePointerLeave={onPointerLeaveObject}
            />
          )
        }
        if (object.kind === "symbol") {
          return (
            <SymbolLayer
              key={object.id}
              symbols={[object as SymbolObject]}
              selectedIds={selectedIds}
              netHighlightIds={netHighlightIds}
              measurements={measurements}
              europeanResistors={europeanResistors}
              iecGates={iecGates}
              showPower={showPower}
              showValues={showValues}
              showVoltage={showVoltage}
              voltageColors={voltageColors}
              onSymbolPointerDown={onSymbolPointerDown}
              onSymbolDoubleClick={onObjectDoubleClick}
              onSymbolPointerEnter={onPointerEnterObject}
              onSymbolPointerLeave={onPointerLeaveObject}
            />
          )
        }
        if (isAnnotationObject(object)) {
          return (
            <JunctionLayer
              key={object.id}
              objects={[object]}
              selectedIds={selectedIds}
              netHighlightIds={netHighlightIds}
              onObjectPointerDown={onObjectPointerDown}
              onObjectDoubleClick={onObjectDoubleClick}
              onObjectPointerEnter={onPointerEnterObject}
              onObjectPointerLeave={onPointerLeaveObject}
            />
          )
        }
        return null
      })}
    </g>
  )
}

function isAnnotationObject(object: SchematicObject): object is AnnotationObject {
  return (
    object.kind === "junction" ||
    object.kind === "ground" ||
    object.kind === "net-label" ||
    object.kind === "probe" ||
    object.kind === "text" ||
    object.kind === "line" ||
    object.kind === "box"
  )
}
