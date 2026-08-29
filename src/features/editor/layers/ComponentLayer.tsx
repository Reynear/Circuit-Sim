import type { CSSProperties, MouseEvent, PointerEvent, ReactNode } from "react"
import {
  getComponent,
  readComponentProperty,
} from "@circuit-sim/core/circuit/components"
import { getLocalPins } from "@circuit-sim/core/circuit/component-geometry"
import { getLocalBounds, getWorldBounds } from "@/browser/editor/component-geometry"
import type { Component } from "@circuit-sim/core/circuit/project"
import { formatSiValue } from "@/browser/editor/values"
import {
  getComponentPowerColor,
  getNetVoltageColor,
  type VoltageColorOptions,
} from "@/browser/simulation/display"
import type { RunObservationReport } from "@circuit-sim/core/simulation/run-observations"

type ComponentLayerProps = {
  components: ReadonlyArray<Component>
  selectedIds: string[]
  netHighlightIds?: string[]
  measurements?: RunObservationReport | null
  showPower?: boolean
  showRefdes?: boolean
  showValues?: boolean
  showVoltage?: boolean
  voltageColors?: VoltageColorOptions | undefined
  onComponentPointerDown: (id: string, event: PointerEvent<SVGGElement>) => void
  onComponentDoubleClick?: (id: string, event: MouseEvent<SVGGElement>) => void
  onComponentPointerEnter?: (id: string) => void
  onComponentPointerLeave?: () => void
}

export function ComponentLayer({
  components,
  selectedIds,
  netHighlightIds = [],
  measurements,
  showPower = false,
  showRefdes = true,
  showValues = true,
  showVoltage = true,
  voltageColors,
  onComponentPointerDown,
  onComponentDoubleClick,
  onComponentPointerEnter,
  onComponentPointerLeave,
}: ComponentLayerProps) {
  const measurementsById = new Map(
    measurements?.componentMeasurements.map((measurement) => [
      measurement.objectId,
      measurement,
    ]) ?? [],
  )

  return (
    <g className="component-layer">
      {components.map((component) => {
        const localBounds = getLocalBounds(component)
        const worldBounds = getWorldBounds(component)
        const measurement = measurementsById.get(component.id)
        const stroke = selectedIds.includes(component.id)
          ? undefined
          : showPower && measurement?.power !== undefined
            ? getComponentPowerColor(measurement.power)
            : showVoltage && measurement?.voltage !== undefined
              ? getNetVoltageColor(measurement.voltage, voltageColors)
              : undefined

        return (
          <g
            key={component.id}
            className={[
              "component",
              selectedIds.includes(component.id) ? "selected" : null,
              netHighlightIds.includes(component.id) ? "net-highlight" : null,
            ].filter(Boolean).join(" ")}
            style={dynamicStyle(stroke)}
            onPointerDown={(event) => onComponentPointerDown(component.id, event)}
            onDoubleClick={(event) => onComponentDoubleClick?.(component.id, event)}
            onPointerEnter={() => onComponentPointerEnter?.(component.id)}
            onPointerLeave={onComponentPointerLeave}
          >
            <g transform={componentTransform(component)}>
              <rect
                className="symbol-hit-area"
                x={localBounds.x}
                y={localBounds.y}
                width={localBounds.width}
                height={localBounds.height}
                rx={4}
              />
              {getLocalPins(component).map((pin) => {
                const end = leadEnd(pin.post)
                return (
                  <line
                    key={pin.key}
                    className="pin-lead"
                    x1={pin.post.x}
                    y1={pin.post.y}
                    x2={end.x}
                    y2={end.y}
                  />
                )
              })}
              <Glyph component={component} />
            </g>
            {showRefdes ? (
              <text className="refdes" x={component.position.x} y={worldBounds.y - 8} textAnchor="middle">
                {component.refdes}
              </text>
            ) : null}
            {showValues ? (
              <text
                className="value"
                x={component.position.x}
                y={worldBounds.y + worldBounds.height + 18}
                textAnchor="middle"
              >
                {displayValue(component)}
              </text>
            ) : null}
          </g>
        )
      })}
    </g>
  )
}

function Glyph({ component }: { component: Component }) {
  switch (component.type) {
    case "resistor":
      return <path className="symbol-body" d="M -24 0 l 8 -12 l 16 24 l 16 -24 l 8 12" />
    case "capacitor":
      return <><Line x1={-10} y1={-20} x2={-10} y2={20} /><Line x1={10} y1={-20} x2={10} y2={20} /></>
    case "inductor":
      return <path className="symbol-body" d="M -24 0 c 0 -18 16 -18 16 0 c 0 -18 16 -18 16 0 c 0 -18 16 -18 16 0" />
    case "switch":
      return <><circle className="pin-dot" cx={-22} cy={0} r={3} /><circle className="pin-dot" cx={22} cy={0} r={3} /><Line x1={-22} y1={0} x2={22} y2={component.props.state === "open" ? -14 : 0} /></>
    case "dc-voltage-source":
      return <SourceGlyph text="DC" />
    case "sine-voltage-source":
      return <SourceGlyph text="~" />
    case "dc-current-source":
      return <SourceGlyph text="I" />
    case "diode":
      return <DiodeGlyph />
    case "led":
      return <><DiodeGlyph /><path className="symbol-body small-stroke" d="M 4 -28 l 12 -12 M 16 -28 l 12 -12" /></>
    case "npn-transistor":
    case "pnp-transistor":
      return <TransistorGlyph pnp={component.type === "pnp-transistor"} />
    case "n-mosfet":
    case "p-mosfet":
      return <MosfetGlyph pChannel={component.type === "p-mosfet"} />
    case "ideal-op-amp-minus-top":
      return <><path className="symbol-body" d="M -28 -32 L -28 32 L 42 0 Z" /><Label x={-18} y={-12}>-</Label><Label x={-18} y={18}>+</Label></>
    case "logic-input":
      return <LogicBox>{component.props.position}</LogicBox>
    case "logic-output":
      return <LogicBox>OUT</LogicBox>
    case "and-gate":
      return <LogicBox wide>&amp;</LogicBox>
    case "or-gate":
      return <LogicBox wide>&gt;=1</LogicBox>
    case "inverter":
      return <><path className="symbol-body" d="M -24 -22 L -24 22 L 18 0 Z" /><circle className="symbol-body" cx={24} cy={0} r={5} /></>
  }
}

function SourceGlyph({ text }: { text: string }) {
  return <><circle className="symbol-body" cx={0} cy={0} r={24} /><Label x={0} y={5}>{text}</Label><Label x={-12} y={-9}>+</Label><Label x={12} y={14}>-</Label></>
}

function DiodeGlyph() {
  return <><path className="symbol-body" d="M -18 -18 L -18 18 L 14 0 Z" /><Line x1={16} y1={-18} x2={16} y2={18} /></>
}

function TransistorGlyph({ pnp }: { pnp: boolean }) {
  return <><Line x1={-18} y1={-24} x2={-18} y2={24} /><Line x1={-18} y1={-14} x2={18} y2={-32} /><Line x1={-18} y1={14} x2={18} y2={32} /><path className="symbol-body" d={pnp ? "M 2 24 l -10 -10 l 14 -2" : "M 4 18 l 10 10 l -14 2"} /></>
}

function MosfetGlyph({ pChannel }: { pChannel: boolean }) {
  return <><Line x1={-18} y1={-24} x2={-18} y2={24} /><Line x1={-4} y1={-26} x2={-4} y2={26} /><Line x1={-4} y1={-18} x2={22} y2={-32} /><Line x1={-4} y1={18} x2={22} y2={32} />{pChannel ? <circle className="symbol-body" cx={-28} cy={0} r={5} /> : null}</>
}

function LogicBox({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <><rect className="symbol-body" x={-24} y={wide ? -26 : -16} width={48} height={wide ? 52 : 32} rx={wide ? 12 : 3} /><Label x={0} y={5}>{children}</Label></>
}

function Line(props: { x1: number; y1: number; x2: number; y2: number }) {
  return <line className="symbol-body" {...props} />
}

function Label({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return <text className="symbol-label small" x={x} y={y} textAnchor="middle">{children}</text>
}

function leadEnd(position: { x: number; y: number }) {
  if (Math.abs(position.x) >= Math.abs(position.y)) {
    return { x: Math.sign(position.x) * Math.min(Math.abs(position.x), 24), y: position.y }
  }
  return { x: position.x, y: Math.sign(position.y) * Math.min(Math.abs(position.y), 24) }
}

function componentTransform(component: Component): string {
  const flip = component.flipped ? " scale(1 -1)" : ""
  return `translate(${component.position.x} ${component.position.y}) rotate(${component.rotation})${flip}`
}

type DynamicSymbolStyle = CSSProperties & { "--symbol-dynamic-stroke": string }

function dynamicStyle(stroke: string | undefined): DynamicSymbolStyle | undefined {
  return stroke ? { "--symbol-dynamic-stroke": stroke } : undefined
}

function displayValue(component: Component): string {
  const property = getComponent(component.type).propertyList[0]
  if (!property) return ""
  const value = readComponentProperty(property, component.props)
  return typeof value === "number" && property.input === "si"
    ? formatSiValue(value)
    : String(value)
}
