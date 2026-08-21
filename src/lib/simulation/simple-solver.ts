import { createId } from "../ids"
import { extractNetlist, pinConnectionKey } from "../schematic/net-extraction"
import { parseSiValue } from "../schematic/values"
import type { CircuitProject, ProbeObject, SymbolObject } from "../schematic/types"
import type { SimulationResult, WaveformTrace } from "./types"

type TwoPinPart = {
  symbol: SymbolObject
  pin1Net: string | undefined
  pin2Net: string | undefined
  value: number
}

export function runSimpleDemoSimulation(
  project: CircuitProject,
): SimulationResult {
  const netlist = extractNetlist(project)
  const sheet = project.sheets[0]
  const simulation = project.simulations[0]
  const notes = [
    "This MVP uses a deterministic demo solver for simple voltage-divider and RC low-pass circuits, not full SPICE.",
  ]

  if (!sheet || !simulation) {
    return emptyResult(["No transient simulation is configured.", ...notes])
  }

  const symbols = sheet.objects.filter(
    (object): object is SymbolObject => object.kind === "symbol",
  )
  const probes = sheet.objects.filter(
    (object): object is ProbeObject => object.kind === "probe",
  )
  const groundNetId = netlist.nets.find((net) => net.name === "GND")?.id
  if (!groundNetId) {
    return emptyResult(["No GND net is available.", ...notes])
  }

  const source = symbols.find(
    (symbol) =>
      symbol.componentDefinitionId === "dc-voltage-source" ||
      symbol.componentDefinitionId === "sine-voltage-source",
  )
  if (!source) {
    return emptyResult(["No voltage source was recognized.", ...notes])
  }

  const sourceReference = getSourceReference(source, netlist.pinToNetId, groundNetId)
  if (!sourceReference) {
    return emptyResult([
      "The demo solver expects the source negative pin to be tied to GND.",
      ...notes,
    ])
  }

  const resistors = symbols
    .filter((symbol) => isResistorLike(symbol.componentDefinitionId))
    .map((symbol) => twoPinPart(symbol, netlist.pinToNetId))
    .filter((part): part is TwoPinPart => Boolean(part))
  const capacitors = symbols
    .filter((symbol) => isCapacitorLike(symbol.componentDefinitionId))
    .map((symbol) => twoPinPart(symbol, netlist.pinToNetId))
    .filter((part): part is TwoPinPart => Boolean(part))

  const sourceToGround = solveSourceToGround({
    sourceVoltage: sourceReference.voltage,
    sourcePositiveNet: sourceReference.outputNetId,
    symbols,
    probes,
    probeToNet: netlist.objectToNetId,
    durationMs: simulation.durationMs,
  })
  if (sourceToGround) {
    return {
      id: createId("sim"),
      createdAt: new Date().toISOString(),
      kind: "simple-demo-solver",
      traces: sourceToGround,
      notes: ["Recognized a voltage source tied directly to GND.", ...notes],
    }
  }

  const divider = solveVoltageDivider(
    sourceReference.voltage,
    sourceReference.outputNetId,
    groundNetId,
    resistors,
    probes,
    netlist.objectToNetId,
  )
  if (divider) {
    return {
      id: createId("sim"),
      createdAt: new Date().toISOString(),
      kind: "simple-demo-solver",
      traces: [divider],
      notes: ["Recognized a two-resistor voltage divider.", ...notes],
    }
  }

  const rc = solveRcLowPass({
    source,
    sourceVoltage: sourceReference.voltage,
    sourcePositiveNet: sourceReference.outputNetId,
    groundNetId,
    resistors,
    capacitors,
    probes,
    probeToNet: netlist.objectToNetId,
    durationMs: simulation.durationMs,
    timeStepMs: simulation.timeStepMs,
  })
  if (rc) {
    return {
      id: createId("sim"),
      createdAt: new Date().toISOString(),
      kind: "simple-demo-solver",
      traces: rc,
      notes: ["Recognized a first-order RC low-pass circuit.", ...notes],
    }
  }

  return emptyResult(["No supported demo topology was recognized.", ...notes])
}

function isResistorLike(componentDefinitionId: string): boolean {
  return componentDefinitionId === "resistor"
}

function isCapacitorLike(componentDefinitionId: string): boolean {
  return componentDefinitionId === "capacitor"
}

function twoPinPart(
  symbol: SymbolObject,
  pinToNetId: Record<string, string>,
): TwoPinPart | null {
  const value =
    parseSiValue(symbol.props.value) ??
    parseSiValue(symbol.props.resistance) ??
    parseSiValue(symbol.props.capacitance)
  if (value === null || value <= 0) {
    return null
  }
  return {
    symbol,
    pin1Net: pinToNetId[pinConnectionKey(symbol.id, "pin1")],
    pin2Net: pinToNetId[pinConnectionKey(symbol.id, "pin2")],
    value,
  }
}

function getSourceReference(
  source: SymbolObject,
  pinToNetId: Record<string, string>,
  groundNetId: string,
): { outputNetId: string; voltage: number } | null {
  const pin1Net = pinToNetId[pinConnectionKey(source.id, "pin1")]
  const pin2Net = pinToNetId[pinConnectionKey(source.id, "pin2")]
  const rawVoltage =
    parseSiValue(source.props.voltage) ??
    parseSiValue(source.props.amplitude) ??
    parseSiValue(source.props.maxVoltage) ??
    0

  if (!pin1Net || pin2Net !== groundNetId) {
    return null
  }
  return { outputNetId: pin1Net, voltage: rawVoltage }
}

function solveSourceToGround(params: {
  sourceVoltage: number
  sourcePositiveNet: string
  symbols: SymbolObject[]
  probes: ProbeObject[]
  probeToNet: Record<string, string>
  durationMs: number
}): WaveformTrace[] | null {
  if (params.symbols.length !== 1) {
    return null
  }
  const [source] = params.symbols
  if (
    !source ||
    (source.componentDefinitionId !== "dc-voltage-source" &&
      source.componentDefinitionId !== "sine-voltage-source")
  ) {
    return null
  }

  const sourceProbes = params.probes.filter(
    (probe) =>
      probe.probeType === "voltage" &&
      params.probeToNet[probe.id] === params.sourcePositiveNet,
  )
  const traceTargets =
    sourceProbes.length > 0
      ? sourceProbes.map((probe) => ({
          id: probe.id,
          name: probe.name,
        }))
      : [{ id: params.sourcePositiveNet, name: "VIN" }]
  const durationSeconds = params.durationMs / 1000

  return traceTargets.map((target) => ({
    id: createId("sim"),
    name: target.name,
    metric: "voltage",
    unit: "V",
    targetId: target.id,
    targetName: target.name,
    points: [
      { t: 0, v: params.sourceVoltage },
      { t: durationSeconds, v: params.sourceVoltage },
    ],
  }))
}

function solveVoltageDivider(
  vin: number,
  sourceNet: string,
  groundNet: string,
  resistors: TwoPinPart[],
  probes: ProbeObject[],
  probeToNet: Record<string, string>,
): WaveformTrace | null {
  if (resistors.length !== 2) {
    return null
  }

  for (const top of resistors) {
    const midNet = otherNet(top, sourceNet)
    if (!midNet) {
      continue
    }
    const bottom = resistors.find(
      (candidate) =>
        candidate !== top &&
        connects(candidate, midNet) &&
        connects(candidate, groundNet),
    )
    if (!bottom) {
      continue
    }
    const outputProbe = probes.find((probe) => probeToNet[probe.id] === midNet)
    const vout = vin * (bottom.value / (top.value + bottom.value))
    return {
      id: createId("sim"),
      name: outputProbe?.name ?? "VOUT",
      metric: "voltage",
      unit: "V",
      targetId: outputProbe?.id ?? midNet,
      targetName: outputProbe?.name ?? "VOUT",
      points: [
        { t: 0, v: vout },
        { t: 0.01, v: vout },
      ],
    }
  }

  return null
}

function solveRcLowPass(params: {
  source: SymbolObject
  sourceVoltage: number
  sourcePositiveNet: string
  groundNetId: string
  resistors: TwoPinPart[]
  capacitors: TwoPinPart[]
  probes: ProbeObject[]
  probeToNet: Record<string, string>
  durationMs: number
  timeStepMs: number
}): WaveformTrace[] | null {
  if (params.resistors.length !== 1 || params.capacitors.length !== 1) {
    return null
  }
  const resistor = params.resistors[0]
  const capacitor = params.capacitors[0]
  if (!resistor || !capacitor) {
    return null
  }

  const midNet = otherNet(resistor, params.sourcePositiveNet)
  if (!midNet || !connects(capacitor, midNet) || !connects(capacitor, params.groundNetId)) {
    return null
  }

  const outputProbe = params.probes.find(
    (probe) => params.probeToNet[probe.id] === midNet,
  )
  const inputProbe = params.probes.find(
    (probe) => params.probeToNet[probe.id] === params.sourcePositiveNet,
  )
  const tau = resistor.value * capacitor.value
  const durationSeconds = params.durationMs / 1000
  const stepSeconds = params.timeStepMs / 1000
  const points: Array<{ t: number; v: number }> = []
  const inputPoints: Array<{ t: number; v: number }> = []
  const frequency = parseSiValue(params.source.props.frequency) ?? 0
  let previous = 0

  for (let t = 0; t <= durationSeconds + 1e-12; t += stepSeconds) {
    const input =
      params.source.componentDefinitionId === "sine-voltage-source"
        ? params.sourceVoltage * Math.sin(2 * Math.PI * frequency * t)
        : params.sourceVoltage
    const alpha = tau > 0 ? stepSeconds / (tau + stepSeconds) : 1
    previous = previous + alpha * (input - previous)
    points.push({ t, v: previous })
    inputPoints.push({ t, v: input })
  }

  return [
    ...(inputProbe
      ? [
          {
            id: createId("sim"),
            name: inputProbe.name,
            metric: "voltage" as const,
            unit: "V",
            targetId: inputProbe.id,
            targetName: inputProbe.name,
            points: inputPoints,
          },
        ]
      : []),
    {
      id: createId("sim"),
      name: outputProbe?.name ?? "VOUT",
      metric: "voltage",
      unit: "V",
      targetId: outputProbe?.id ?? midNet,
      targetName: outputProbe?.name ?? "VOUT",
      points,
    },
  ]
}

function connects(part: TwoPinPart, netId: string): boolean {
  return part.pin1Net === netId || part.pin2Net === netId
}

function otherNet(part: TwoPinPart, netId: string): string | null {
  if (part.pin1Net === netId) {
    return part.pin2Net ?? null
  }
  if (part.pin2Net === netId) {
    return part.pin1Net ?? null
  }
  return null
}

function emptyResult(notes: string[]): SimulationResult {
  return {
    id: createId("sim"),
    createdAt: new Date().toISOString(),
    kind: "simple-demo-solver",
    traces: [],
    notes,
  }
}
