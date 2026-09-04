import type { SimulationRun } from "./simulation-run"
import { getComponent } from "../circuit/components"
import { getPinPosts } from "../circuit/component-geometry"
import {
  buildElectricalCircuit,
  circuitHashOf,
  type ElectricalComponent,
  type ElectricalCircuit,
} from "../circuit/electrical-circuit"
import { extractNetlist } from "../circuit/net-extraction"
import type {
  CircuitProject,
  Component,
  Point,
  ProbeObject,
} from "../circuit/project"
import { simulationStatus, type SimulationStatus } from "./result"
import { findSignal, type Signal, type Signals } from "./signals"

export type NetVoltageObservation = {
  netId: string
  name: string
  voltage: number | undefined
}

export type ComponentObservation = {
  objectId: string
  refdes: string
  type: Component["type"]
  voltage: number | undefined
  current: number | undefined
  power: number | undefined
}

export type ProbeObservation = {
  objectId: string
  name: string
  probeType: "voltage" | "current"
  netId: string | undefined
  netName: string | undefined
  voltage: number | undefined
  current: number | undefined
}

export type RunObservationReport = {
  run: {
    id: string
    engine: SimulationRun["engine"]
    status: SimulationStatus
    circuitHash: string
    stale: boolean
  }
  circuit: ElectricalCircuit
  netlist: ReturnType<typeof extractNetlist>
  netVoltages: NetVoltageObservation[]
  componentMeasurements: ComponentObservation[]
  probeMeasurements: ProbeObservation[]
  signals: Signals
  notes: string[]
}

/** Derives current UI measurements from one stored run and the current project. */
export function observeRun(
  project: CircuitProject,
  run: SimulationRun,
): RunObservationReport {
  const circuit = buildElectricalCircuit(project)
  const netlist = extractNetlist(project)
  const components = project.objects.filter(
    (object): object is Component => object.kind === "component",
  )
  const probes = project.objects.filter(
    (object): object is ProbeObject => object.kind === "probe",
  )
  const stale = run.circuitHash !== circuitHashOf(circuit)
  const netVoltage = (netName: string): number | undefined =>
    finalValue(findSignal(run.signals, `V(${netName})`))

  const componentMeasurements = components
    .map((component): ComponentObservation => {
      const electricalComponent = circuit.components.find(
        (candidate) => candidate.refdes === component.refdes,
      )
      const firstTerminal = electricalComponent?.terminals[0]
      return {
        objectId: component.id,
        refdes: component.refdes,
        type: component.type,
        voltage: terminalVoltage(electricalComponent, netVoltage),
        current: firstTerminal
          ? finalValue(
              findSignal(run.signals, `I(${component.refdes}.${firstTerminal.label})`),
            )
          : undefined,
        power: finalValue(findSignal(run.signals, `P(${component.refdes})`)),
      }
    })
    .sort(
      (a, b) =>
        a.refdes.localeCompare(b.refdes) || a.objectId.localeCompare(b.objectId),
    )

  const probeMeasurements = probes
    .map((probe): ProbeObservation => {
      const netId = netlist.objectToNetId.get(probe.id)
      const netName = netlist.nets.find((net) => net.id === netId)?.name
      return {
        objectId: probe.id,
        name: probe.name,
        probeType: probe.probeType,
        netId,
        netName,
        voltage: netName ? netVoltage(netName) : undefined,
        current: currentForProbe(probe, components, run.signals),
      }
    })
    .sort(
      (a, b) => a.name.localeCompare(b.name) || a.objectId.localeCompare(b.objectId),
    )

  return {
    run: {
      id: run.id,
      engine: run.engine,
      status: simulationStatus(run),
      circuitHash: run.circuitHash,
      stale,
    },
    circuit,
    netlist,
    netVoltages: netlist.nets.map((net) => ({
      netId: net.id,
      name: net.name,
      voltage: netVoltage(net.name),
    })),
    componentMeasurements,
    probeMeasurements,
    signals: run.signals,
    notes: [
      "Values are from the last simulation run and do not update as the circuit is edited.",
      ...(stale
        ? [
            "The circuit has changed since this run; these values do not describe the current circuit.",
          ]
        : []),
      ...run.notes,
    ],
  }
}

function finalValue(signal: Signal | undefined): number | undefined {
  const last = signal?.points[signal.points.length - 1]
  return last?.v
}

function terminalVoltage(
  component: ElectricalComponent | undefined,
  voltageOf: (netName: string) => number | undefined,
): number | undefined {
  if (component?.behavior.kind === "dc-power-rail") {
    const railNet = component.terminals.find(
      (terminal) => terminal.key === "rail",
    )?.net
    return railNet ? voltageOf(railNet) : undefined
  }
  if (component?.terminals.length !== 2) return undefined
  const firstNet = component?.terminals[0]?.net
  const secondNet = component?.terminals[1]?.net
  if (!firstNet || !secondNet) return undefined
  const firstVoltage = voltageOf(firstNet)
  const secondVoltage = voltageOf(secondNet)
  return firstVoltage === undefined || secondVoltage === undefined
    ? undefined
    : firstVoltage - secondVoltage
}

function currentForProbe(
  probe: ProbeObject,
  components: ReadonlyArray<Component>,
  signals: Signals,
): number | undefined {
  if (probe.probeType !== "current") return undefined
  for (const component of components) {
    for (const pin of getPinPosts(component)) {
      if (!samePoint(probe.position, pin.position)) continue
      const label = getComponent(component.type).terminals.find(
        (candidate) => candidate.key === pin.pin,
      )?.label
      return label
        ? finalValue(findSignal(signals, `I(${component.refdes}.${label})`))
        : undefined
    }
  }
  return undefined
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) <= 4 && Math.abs(a.y - b.y) <= 4
}
