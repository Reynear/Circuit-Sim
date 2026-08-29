import type { PointerEvent } from "react"
import { getNetVoltageColor, type VoltageColorOptions } from "@/browser/simulation/display"
import type { RunObservationReport } from "@circuit-sim/core/simulation/run-observations"
import type { WireObject } from "@circuit-sim/core/circuit/project"

type WireLayerProps = {
  wires: ReadonlyArray<WireObject>
  selectedIds: string[]
  netHighlightIds?: string[]
  activeWirePoints?: WireObject["points"] | undefined
  measurements: RunObservationReport | null
  showVoltage?: boolean
  voltageColors?: VoltageColorOptions | undefined
  onWirePointerDown: (wireId: string, event: PointerEvent<SVGPolylineElement>) => void
  onWirePointerEnter?: (wireId: string) => void
  onWirePointerLeave?: () => void
}

export function WireLayer({
  wires,
  selectedIds,
  netHighlightIds = [],
  activeWirePoints,
  measurements,
  showVoltage = true,
  voltageColors,
  onWirePointerDown,
  onWirePointerEnter,
  onWirePointerLeave,
}: WireLayerProps) {
  const netVoltageById = new Map(
    measurements?.netVoltages.map((net) => [net.netId, net.voltage]) ?? [],
  )

  return (
    <g className="wire-layer">
      {wires.map((wire) => {
        const netId = measurements?.netlist.objectToNetId.get(wire.id)
        const voltage = netId ? netVoltageById.get(netId) : undefined
        const points = wire.points.map((point) => `${point.x},${point.y}`).join(" ")
        const stroke =
          showVoltage &&
          voltage !== undefined &&
          !selectedIds.includes(wire.id)
            ? getNetVoltageColor(voltage, voltageColors)
            : undefined
        return (
          <g key={wire.id}>
            <polyline
              className={[
                "wire",
                selectedIds.includes(wire.id) ? "selected" : null,
                netHighlightIds.includes(wire.id) ? "net-highlight" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              points={points}
              style={stroke ? { stroke } : undefined}
              onPointerDown={(event) => onWirePointerDown(wire.id, event)}
              onPointerEnter={() => onWirePointerEnter?.(wire.id)}
              onPointerLeave={onWirePointerLeave}
            />
            <polyline
              className="wire-hit-area"
              data-testid="wire-hit-area"
              points={points}
              onPointerDown={(event) => onWirePointerDown(wire.id, event)}
              onPointerEnter={() => onWirePointerEnter?.(wire.id)}
              onPointerLeave={onWirePointerLeave}
            />
          </g>
        )
      })}
      {activeWirePoints && activeWirePoints.length > 0 ? (
        <polyline
          className="active-wire"
          points={activeWirePoints.map((point) => `${point.x},${point.y}`).join(" ")}
        />
      ) : null}
    </g>
  )
}
