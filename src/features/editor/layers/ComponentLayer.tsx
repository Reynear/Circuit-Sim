import type { CSSProperties, MouseEvent, PointerEvent, ReactNode } from "react"
import {
  getComponent,
  readComponentProperty,
} from "@circuit-sim/core/circuit/components"
import { getLocalPins } from "@circuit-sim/core/circuit/component-geometry"
import {
  getComponentLabelPositions,
  getLocalBounds,
} from "@/browser/editor/component-geometry"
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
        const labels = getComponentLabelPositions(component)
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
              <text className="refdes" {...labels.refdes}>
                {component.refdes}
              </text>
            ) : null}
            {showValues ? (
              <text className="value" {...labels.value}>
                {displayValue(component)}
              </text>
            ) : null}
          </g>
        )
      })}
    </g>
  )
}

/**
 * The canonical component glyphs are shared by the interactive editor and
 * interface-edge static renderers. Keeping the glyph in this module prevents
 * the MCP image from becoming a second visual interpretation of a component.
 */
export function Glyph({ component }: { component: Component }) {
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
      return <SourceGlyph text="DC" rotation={component.rotation} />
    case "dc-power-rail":
      return <PowerRailGlyph />
    case "sine-voltage-source":
      return <SourceGlyph text="~" rotation={component.rotation} />
    case "pulse-voltage-source":
      return <PulseSourceGlyph rotation={component.rotation} />
    case "dc-current-source":
      return <SourceGlyph text="I" rotation={component.rotation} />
    case "diode":
      return <DiodeGlyph />
    case "zener-diode":
      return <ZenerDiodeGlyph />
    case "led":
      return <><DiodeGlyph /><path className="symbol-body small-stroke" d="M 4 -28 l 12 -12 M 16 -28 l 12 -12" /></>
    case "npn-transistor":
    case "pnp-transistor":
      return <TransistorGlyph pnp={component.type === "pnp-transistor"} />
    case "n-mosfet":
    case "p-mosfet":
      return <MosfetGlyph pChannel={component.type === "p-mosfet"} />
    case "ideal-op-amp-minus-top":
      return <g className="ideal-op-amp-glyph"><path className="symbol-body" d="M -28 -32 L -28 32 L 42 0 Z" /><Label x={-18} y={-12}>-</Label><Label x={-18} y={18}>+</Label></g>
    case "logic-input":
      return <g className="logic-input-glyph"><LogicBox>{component.props.position}</LogicBox></g>
    case "logic-output":
      return <g className="logic-output-glyph"><LogicBox>OUT</LogicBox></g>
    case "and-gate":
      return <g className="logic-gate-glyph and"><LogicBox wide>&amp;</LogicBox></g>
    case "or-gate":
      return <g className="logic-gate-glyph or"><LogicBox wide>&gt;=1</LogicBox></g>
    case "inverter":
      return <g className="inverter-glyph"><path className="symbol-body" d="M -24 -22 L -24 22 L 18 0 Z" /><circle className="symbol-body" cx={24} cy={0} r={5} /></g>
  }
}

function SourceGlyph({ text, rotation }: { text: string; rotation: Component["rotation"] }) {
  return <><circle className="symbol-body" cx={0} cy={0} r={24} /><Label x={0} y={5} rotation={rotation}>{text}</Label><Label x={-12} y={-9} rotation={rotation}>+</Label><Label x={12} y={14} rotation={rotation}>-</Label></>
}

function PulseSourceGlyph({ rotation }: { rotation: Component["rotation"] }) {
  return <><circle className="symbol-body" cx={0} cy={0} r={24} /><path className="symbol-body pulse-source-waveform" d="M -13 6 H -6 V -7 H 6 V 6 H 13" /><Label x={-12} y={-9} rotation={rotation}>+</Label><Label x={12} y={14} rotation={rotation}>-</Label></>
}

function PowerRailGlyph() {
  return (
    <g className="dc-power-rail-glyph">
      <Line x1={0} y1={24} x2={0} y2={-4} />
      <path className="symbol-fill" d="M -10 4 L 0 -14 L 10 4 Z" />
    </g>
  )
}

function DiodeGlyph() {
  return <><path className="symbol-body" d="M -18 -18 L -18 18 L 14 0 Z" /><Line x1={16} y1={-18} x2={16} y2={18} /></>
}

function ZenerDiodeGlyph() {
  return <g className="zener-diode-glyph"><path className="symbol-body" d="M -18 -18 L -18 18 L 14 0 Z" /><path className="symbol-body" d="M 10 -22 L 16 -16 L 16 16 L 22 22" /></g>
}

function TransistorGlyph({ pnp }: { pnp: boolean }) {
  return (
    <g className={`bipolar-transistor-glyph ${pnp ? "pnp" : "npn"}`}>
      <circle className="symbol-body transistor-outline" cx={0} cy={0} r={30} />
      <path
        className="symbol-body transistor-body"
        d="M -24 0 H -12 M -12 -18 V 18 M -12 -12 L 24 -32 M -12 12 L 24 32"
      />
      <path
        className="symbol-fill transistor-arrow"
        d={pnp ? "M 15 21 L 2 20 L 10 30 Z" : "M 7 28 L 20 30 L 12 20 Z"}
      />
    </g>
  )
}

function MosfetGlyph({ pChannel }: { pChannel: boolean }) {
  return <g className={`mosfet-glyph ${pChannel ? "p-channel" : "n-channel"}`}><Line x1={-18} y1={-24} x2={-18} y2={24} /><Line x1={-4} y1={-26} x2={-4} y2={26} /><Line x1={-4} y1={-18} x2={22} y2={-32} /><Line x1={-4} y1={18} x2={22} y2={32} />{pChannel ? <circle className="symbol-body" cx={-28} cy={0} r={5} /> : null}</g>
}

function LogicBox({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <><rect className="symbol-body" x={-24} y={wide ? -26 : -16} width={48} height={wide ? 52 : 32} rx={wide ? 12 : 3} /><Label x={0} y={5}>{children}</Label></>
}

function Line(props: { x1: number; y1: number; x2: number; y2: number }) {
  return <line className="symbol-body" {...props} />
}

function Label({
  x,
  y,
  rotation = 0,
  children,
}: {
  x: number
  y: number
  rotation?: Component["rotation"]
  children: ReactNode
}) {
  return <text className="symbol-label small" x={x} y={y} textAnchor="middle" transform={rotation === 0 ? undefined : `rotate(${-rotation} ${x} ${y})`}>{children}</text>
}

export function leadEnd(position: { x: number; y: number }) {
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

export function displayValue(component: Component): string {
  if (component.type === "pulse-voltage-source") {
    return `${formatSiValue(component.props.initialVoltageVolts)}→${formatSiValue(component.props.pulsedVoltageVolts)} ${formatSiValue(component.props.frequencyHertz, "Hz")} ${component.props.dutyCyclePercent}%`
  }
  const property = getComponent(component.type).propertyList[0]
  if (!property) return ""
  const value = readComponentProperty(property, component.props)
  if (
    component.type === "diode" &&
    typeof value === "string" &&
    value.trim().toUpperCase() === "DDEFAULT"
  ) return ""
  return typeof value === "number" && property.input === "si"
    ? formatSiValue(value)
    : String(value)
}
