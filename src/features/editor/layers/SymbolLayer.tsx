import type { CSSProperties, MouseEvent, PointerEvent } from "react"
import {
  getRequiredSymbolDefinition,
  type SymbolDefinition,
} from "../../../lib/schematic/symbols"
import {
  getSymbolLocalBounds,
} from "../../../lib/schematic/symbol-geometry"
import { getSymbolPinLeadSegments } from "../../../lib/schematic/symbol-leads"
import type { SymbolObject } from "../../../lib/schematic/types"
import {
  getComponentPowerColor,
  getNetVoltageColor,
  type CircuitMeasurementReport,
  type VoltageColorOptions,
} from "../../../lib/simulation/measurements"

type SymbolLayerProps = {
  symbols: SymbolObject[]
  selectedIds: string[]
  netHighlightIds?: string[]
  measurements?: CircuitMeasurementReport | null
  europeanResistors?: boolean
  iecGates?: boolean
  showPower?: boolean
  showRefdes?: boolean
  showValues?: boolean
  showVoltage?: boolean
  voltageColors?: VoltageColorOptions | undefined
  onSymbolPointerDown: (
    symbolId: string,
    event: PointerEvent<SVGGElement>,
  ) => void
  onSymbolDoubleClick?: (
    symbolId: string,
    event: MouseEvent<SVGGElement>,
  ) => void
  onSymbolPointerEnter?: (symbolId: string) => void
  onSymbolPointerLeave?: () => void
}

export function SymbolLayer({
  symbols,
  selectedIds,
  netHighlightIds = [],
  measurements,
  showPower = false,
  showRefdes = true,
  showValues = true,
  showVoltage = true,
  voltageColors,
  onSymbolPointerDown,
  onSymbolDoubleClick,
  onSymbolPointerEnter,
  onSymbolPointerLeave,
}: SymbolLayerProps) {
  const measurementsById = new Map(
    measurements?.componentMeasurements.map((measurement) => [
      measurement.objectId,
      measurement,
    ]) ?? [],
  )

  return (
    <g className="symbol-layer">
      {symbols.map((symbol) => {
        const definition = getRequiredSymbolDefinition(symbol.symbolDefinitionId)
        const bounds = getSymbolLocalBounds(symbol)
        const measurement = measurementsById.get(symbol.id)
        const dynamicStroke = selectedIds.includes(symbol.id)
          ? undefined
          : showPower && measurement?.power !== undefined
            ? getComponentPowerColor(measurement.power)
            : showVoltage && measurement?.voltage !== undefined
              ? getNetVoltageColor(measurement.voltage, voltageColors)
              : undefined

        return (
          <g
            key={symbol.id}
            className={[
              "symbol",
              selectedIds.includes(symbol.id) ? "selected" : null,
              netHighlightIds.includes(symbol.id) ? "net-highlight" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            style={symbolDynamicStyle(dynamicStroke)}
            transform={`translate(${symbol.position.x} ${symbol.position.y}) rotate(${symbol.rotation})`}
            onPointerDown={(event) => onSymbolPointerDown(symbol.id, event)}
            onDoubleClick={(event) => onSymbolDoubleClick?.(symbol.id, event)}
            onPointerEnter={() => onSymbolPointerEnter?.(symbol.id)}
            onPointerLeave={onSymbolPointerLeave}
          >
            <g transform={symbol.mirrored ? "scale(-1 1)" : undefined}>
              <rect
                className="symbol-hit-area"
                x={bounds.x}
                y={bounds.y}
                width={bounds.width}
                height={bounds.height}
                rx={4}
              />
              <PinLeadLines symbol={symbol} />
              <SymbolShape
                kind={definition.renderKind}
                props={symbol.props}
              />
            </g>
            {showRefdes ? (
              <text className="refdes" x={0} y={bounds.y - 8} textAnchor="middle">
                {symbol.refdes}
              </text>
            ) : null}
            {showValues ? (
              <text className="value" x={0} y={bounds.y + bounds.height + 18} textAnchor="middle">
                {displayValueFor(symbol)}
              </text>
            ) : null}
          </g>
        )
      })}
    </g>
  )
}

function symbolDynamicStyle(
  stroke: string | undefined,
): (CSSProperties & Record<"--symbol-dynamic-stroke", string>) | undefined {
  return stroke ? { "--symbol-dynamic-stroke": stroke } : undefined
}

function PinLeadLines({ symbol }: { symbol: SymbolObject }) {
  return (
    <>
      {getSymbolPinLeadSegments(symbol).map((lead) => {
        return (
          <line
            key={lead.symbolPinId}
            className="pin-lead"
            x1={lead.start.x}
            y1={lead.start.y}
            x2={lead.end.x}
            y2={lead.end.y}
          />
        )
      })}
    </>
  )
}

function SymbolShape({
  kind,
  props,
}: {
  kind: SymbolDefinition["renderKind"]
  props: Record<string, unknown>
}) {
  switch (kind) {
    case "resistor":
      return <path className="symbol-body" d="M -22 0 l 7 -12 l 14 24 l 14 -24 l 14 24 l 7 -12" />
    case "capacitor":
      return (
        <>
          <line className="symbol-body" x1={-10} y1={-20} x2={-10} y2={20} />
          <line className="symbol-body" x1={10} y1={-20} x2={10} y2={20} />
        </>
      )
    case "inductor":
      return (
        <path
          className="symbol-body"
          d="M -24 0 c 0 -18 16 -18 16 0 c 0 -18 16 -18 16 0 c 0 -18 16 -18 16 0"
        />
      )
    case "switch":
      return <SwitchShape state={props.state} />
    case "potentiometer":
      return (
        <>
          <path className="symbol-body" d="M -22 0 l 7 -12 l 14 24 l 14 -24 l 14 24 l 7 -12" />
          <path className="symbol-body" d="M 0 -26 L 12 -8" />
          <path className="symbol-body" d="M 7 -8 L 12 -8 L 12 -13" />
        </>
      )
    case "dc-source":
      return <SourceShape label="DC" />
    case "sine-source":
      return <SourceShape label="~" />
    case "current-source":
      return <SourceShape label="I" />
    case "diode":
      return <DiodeShape led={false} />
    case "led":
      return <DiodeShape led />
    case "npn-transistor":
      return <TransistorShape pnp={false} />
    case "pnp-transistor":
      return <TransistorShape pnp />
    case "n-mosfet":
      return <MosfetShape pChannel={false} />
    case "p-mosfet":
      return <MosfetShape pChannel />
    case "ideal-op-amp-minus-top":
      return <OpAmpShape />
    case "logic-input":
      return <LogicLevelShape label={String(props.position ?? "0")} />
    case "logic-output":
      return <LogicLevelShape label="OUT" />
    case "and-gate":
      return <GateShape label="&" />
    case "or-gate":
      return <GateShape label=">=1" />
    case "inverter":
      return <InverterShape />
  }
}

function SwitchShape({ state }: { state: unknown }) {
  const closed = String(state ?? "open") === "closed"
  return (
    <>
      <circle className="pin-dot" cx={-22} cy={0} r={3} />
      <circle className="pin-dot" cx={22} cy={0} r={3} />
      <line
        className="symbol-body"
        x1={-22}
        y1={0}
        x2={22}
        y2={closed ? 0 : -14}
      />
    </>
  )
}

function SourceShape({ label }: { label: string }) {
  return (
    <>
      <circle className="symbol-body" cx={0} cy={0} r={24} />
      <text className="symbol-label small" x={0} y={5} textAnchor="middle">
        {label}
      </text>
      <text className="symbol-label small" x={-12} y={-9} textAnchor="middle">
        +
      </text>
      <text className="symbol-label small" x={12} y={14} textAnchor="middle">
        -
      </text>
    </>
  )
}

function DiodeShape({ led }: { led: boolean }) {
  return (
    <>
      <path className="symbol-body" d="M -18 -18 L -18 18 L 14 0 Z" />
      <line className="symbol-body" x1={16} y1={-18} x2={16} y2={18} />
      {led ? (
        <>
          <path className="symbol-body small-stroke" d="M 4 -28 l 12 -12" />
          <path className="symbol-body small-stroke" d="M 16 -28 l 12 -12" />
        </>
      ) : null}
    </>
  )
}

function TransistorShape({ pnp }: { pnp: boolean }) {
  return (
    <>
      <line className="symbol-body" x1={-18} y1={-24} x2={-18} y2={24} />
      <line className="symbol-body" x1={-18} y1={-14} x2={18} y2={-32} />
      <line className="symbol-body" x1={-18} y1={14} x2={18} y2={32} />
      <path
        className="symbol-body"
        d={pnp ? "M 2 24 l -10 -10 l 14 -2" : "M 4 18 l 10 10 l -14 2"}
      />
    </>
  )
}

function MosfetShape({ pChannel }: { pChannel: boolean }) {
  return (
    <>
      <line className="symbol-body" x1={-18} y1={-24} x2={-18} y2={24} />
      <line className="symbol-body" x1={-4} y1={-26} x2={-4} y2={26} />
      <line className="symbol-body" x1={-4} y1={-18} x2={22} y2={-32} />
      <line className="symbol-body" x1={-4} y1={18} x2={22} y2={32} />
      {pChannel ? <circle className="symbol-body" cx={-28} cy={0} r={5} /> : null}
    </>
  )
}

function OpAmpShape() {
  return (
    <>
      <path className="symbol-body" d="M -28 -32 L -28 32 L 42 0 Z" />
      <text className="symbol-label small" x={-18} y={-12} textAnchor="middle">
        -
      </text>
      <text className="symbol-label small" x={-18} y={18} textAnchor="middle">
        +
      </text>
    </>
  )
}

function LogicLevelShape({ label }: { label: string }) {
  return (
    <>
      <rect className="symbol-body" x={-24} y={-16} width={48} height={32} rx={3} />
      <text className="symbol-label small" x={0} y={5} textAnchor="middle">
        {label}
      </text>
    </>
  )
}

function GateShape({ label }: { label: string }) {
  return (
    <>
      <rect className="symbol-body" x={-24} y={-26} width={48} height={52} rx={12} />
      <text className="symbol-label small" x={0} y={5} textAnchor="middle">
        {label}
      </text>
    </>
  )
}

function InverterShape() {
  return (
    <>
      <path className="symbol-body" d="M -24 -22 L -24 22 L 18 0 Z" />
      <circle className="symbol-body" cx={24} cy={0} r={5} />
    </>
  )
}

function displayValueFor(symbol: SymbolObject): string {
  const value =
    symbol.props.value ??
    symbol.props.voltage ??
    symbol.props.amplitude ??
    symbol.props.current ??
    symbol.props.thresholdVoltage ??
    symbol.props.state ??
    symbol.props.position ??
    ""
  return String(value)
}
