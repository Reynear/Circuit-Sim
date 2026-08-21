import { extractNetlist, pinConnectionKey } from "../schematic/net-extraction"
import { getSymbolPinWorldPositions } from "../schematic/transforms"
import { parseSiValue } from "../schematic/values"
import type {
  CircuitProject,
  ProbeObject,
  SymbolObject,
  Vec2,
  WireObject,
} from "../schematic/types"
import type { WaveformTrace } from "./types"

export type MeasurementTopology =
  | "source-to-ground"
  | "voltage-divider"
  | "rc-low-pass"
  | "unknown"

export type NetVoltageMeasurement = {
  netId: string
  name: string
  voltage: number | undefined
}

export type ComponentMeasurement = {
  objectId: string
  refdes: string
  componentDefinitionId: string
  voltage: number | undefined
  current: number | undefined
  power: number | undefined
  label: string
}

export type ProbeMeasurement = {
  objectId: string
  name: string
  probeType: "voltage" | "current"
  netId: string | undefined
  netName: string | undefined
  voltage: number | undefined
  current: number | undefined
}

export type CircuitMeasurementReport = {
  topology: MeasurementTopology
  netlist: ReturnType<typeof extractNetlist>
  netVoltages: NetVoltageMeasurement[]
  componentMeasurements: ComponentMeasurement[]
  probeMeasurements: ProbeMeasurement[]
  scopeTraces: WaveformTrace[]
  notes: string[]
}

type TwoPinPart = {
  symbol: SymbolObject
  pin1Net: string | undefined
  pin2Net: string | undefined
  value: number
}

type MeasurementContext = {
  project: CircuitProject
  netlist: ReturnType<typeof extractNetlist>
  symbols: SymbolObject[]
  wires: WireObject[]
  probes: ProbeObject[]
  notes: string[]
}

export function analyzeCircuitMeasurements(
  project: CircuitProject,
): CircuitMeasurementReport {
  const sheet = project.sheets[0]
  const netlist = extractNetlist(project)
  const context: MeasurementContext = {
    project,
    netlist,
    symbols:
      sheet?.objects.filter(
        (object): object is SymbolObject => object.kind === "symbol",
      ) ?? [],
    wires:
      sheet?.objects.filter(
        (object): object is WireObject => object.kind === "wire",
      ) ?? [],
    probes:
      sheet?.objects.filter(
        (object): object is ProbeObject => object.kind === "probe",
      ) ?? [],
    notes: [
      "Canvas measurements use a fast deterministic estimate; run the Simulation panel for transient SPICE traces.",
    ],
  }

  const groundNetId = netlist.nets.find((net) => net.name === "GND")?.id
  if (!sheet || !groundNetId) {
    return buildReport(context, "unknown", {}, [], [])
  }

  const source = context.symbols.find(
    (symbol) =>
      symbol.componentDefinitionId === "dc-voltage-source" ||
      symbol.componentDefinitionId === "sine-voltage-source",
  )
  if (!source) {
    context.notes.unshift("No voltage source was recognized.")
    return buildReport(context, "unknown", { [groundNetId]: 0 }, [], [])
  }

  const sourceReference = getSourceReference(source, netlist.pinToNetId, groundNetId)
  if (!sourceReference) {
    context.notes.unshift(
      "The measurement solver expects the source negative pin to be tied to GND.",
    )
    return buildReport(context, "unknown", { [groundNetId]: 0 }, [], [])
  }

  const sourceVoltage = sourceReference.voltage
  const resistors = context.symbols
    .filter((symbol) => isResistorLike(symbol.componentDefinitionId))
    .map((symbol) => twoPinPart(symbol, netlist.pinToNetId))
    .filter((part): part is TwoPinPart => Boolean(part))
  const capacitors = context.symbols
    .filter((symbol) => isCapacitorLike(symbol.componentDefinitionId))
    .map((symbol) => twoPinPart(symbol, netlist.pinToNetId))
    .filter((part): part is TwoPinPart => Boolean(part))

  const sourceToGround = analyzeSourceToGround({
    context,
    source,
    sourceVoltage,
    sourcePositiveNet: sourceReference.outputNetId,
    groundNetId,
  })
  if (sourceToGround) {
    return sourceToGround
  }

  const divider = analyzeVoltageDivider({
    context,
    source,
    sourceVoltage,
    sourcePositiveNet: sourceReference.outputNetId,
    groundNetId,
    resistors,
  })
  if (divider) {
    return divider
  }

  const rc = analyzeRcLowPass({
    context,
    source,
    sourceVoltage,
    sourcePositiveNet: sourceReference.outputNetId,
    groundNetId,
    resistors,
    capacitors,
  })
  if (rc) {
    return rc
  }

  context.notes.unshift("No supported measurement topology was recognized.")
  return buildReport(
    context,
    "unknown",
    { [groundNetId]: 0, [sourceReference.outputNetId]: sourceVoltage },
    [
      sourceMeasurement(
        source,
        sourceVoltage,
        undefined,
        context.netlist.pinToNetId,
      ),
    ],
    [],
  )
}

export type VoltageColorOptions = {
  voltageRange: number
  positiveColor: string
  negativeColor: string
  neutralColor: string
}

export function getNetVoltageColor(
  voltage: number | undefined,
  options?: VoltageColorOptions,
): string {
  if (voltage === undefined || !Number.isFinite(voltage)) {
    return "#d7d7d7"
  }
  if (options) {
    return getScaledVoltageColor(voltage, options)
  }
  if (Math.abs(voltage) < 1e-9) {
    return "#9ca3af"
  }
  return voltage > 0 ? "#16a34a" : "#dc2626"
}

export function getComponentPowerColor(power: number | undefined): string {
  if (power === undefined || !Number.isFinite(power)) {
    return "#d7d7d7"
  }
  if (Math.abs(power) < 1e-12) {
    return "#9ca3af"
  }
  return power >= 0 ? "#f59e0b" : "#38bdf8"
}

export function formatMeasurement(
  value: number | undefined,
  unit: string,
): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "n/a"
  }
  if (Math.abs(value) < 1e-15) {
    return `0 ${unit}`
  }

  const abs = Math.abs(value)
  const prefixes = [
    { scale: 1e9, suffix: "G" },
    { scale: 1e6, suffix: "M" },
    { scale: 1e3, suffix: "k" },
    { scale: 1, suffix: "" },
    { scale: 1e-3, suffix: "m" },
    { scale: 1e-6, suffix: "u" },
    { scale: 1e-9, suffix: "n" },
    { scale: 1e-12, suffix: "p" },
  ]
  const prefix =
    prefixes.find((candidate) => abs >= candidate.scale) ??
    prefixes[prefixes.length - 1]!
  return `${formatNumber(value / prefix.scale)} ${prefix.suffix}${unit}`
}

function analyzeSourceToGround(params: {
  context: MeasurementContext
  source: SymbolObject
  sourceVoltage: number
  sourcePositiveNet: string
  groundNetId: string
}): CircuitMeasurementReport | null {
  if (
    params.context.symbols.some(
      (symbol) => symbol.id !== params.source.id,
    )
  ) {
    return null
  }

  const netVoltages = {
    [params.groundNetId]: 0,
    [params.sourcePositiveNet]: params.sourceVoltage,
  }
  const components = [
    sourceMeasurement(
      params.source,
      params.sourceVoltage,
      0,
      params.context.netlist.pinToNetId,
    ),
  ]
  const scopes = buildScopeTraces(params.context, netVoltages, components)
  params.context.notes.unshift("Recognized a voltage source tied directly to GND.")
  return buildReport(
    params.context,
    "source-to-ground",
    netVoltages,
    components,
    scopes,
  )
}

function analyzeVoltageDivider(params: {
  context: MeasurementContext
  source: SymbolObject
  sourceVoltage: number
  sourcePositiveNet: string
  groundNetId: string
  resistors: TwoPinPart[]
}): CircuitMeasurementReport | null {
  if (params.resistors.length !== 2) {
    return null
  }

  for (const top of params.resistors) {
    const midNet = otherNet(top, params.sourcePositiveNet)
    if (!midNet) {
      continue
    }
    const bottom = params.resistors.find(
      (candidate) =>
        candidate !== top &&
        connects(candidate, midNet) &&
        connects(candidate, params.groundNetId),
    )
    if (!bottom) {
      continue
    }

    const current = params.sourceVoltage / (top.value + bottom.value)
    const midVoltage = current * bottom.value
    const netVoltages = {
      [params.groundNetId]: 0,
      [params.sourcePositiveNet]: params.sourceVoltage,
      [midNet]: midVoltage,
    }
    const components = [
      sourceMeasurement(
        params.source,
        params.sourceVoltage,
        -current,
        params.context.netlist.pinToNetId,
      ),
      passiveMeasurement(top.symbol, netVoltages, params.context.netlist.pinToNetId, top.value),
      passiveMeasurement(
        bottom.symbol,
        netVoltages,
        params.context.netlist.pinToNetId,
        bottom.value,
      ),
    ]
    const scopes = buildScopeTraces(params.context, netVoltages, components)
    params.context.notes.unshift("Recognized a two-resistor voltage divider.")
    return buildReport(
      params.context,
      "voltage-divider",
      netVoltages,
      components,
      scopes,
    )
  }

  return null
}

function analyzeRcLowPass(params: {
  context: MeasurementContext
  source: SymbolObject
  sourceVoltage: number
  sourcePositiveNet: string
  groundNetId: string
  resistors: TwoPinPart[]
  capacitors: TwoPinPart[]
}): CircuitMeasurementReport | null {
  if (params.resistors.length !== 1 || params.capacitors.length !== 1) {
    return null
  }
  const resistor = params.resistors[0]
  const capacitor = params.capacitors[0]
  if (!resistor || !capacitor) {
    return null
  }

  const midNet = otherNet(resistor, params.sourcePositiveNet)
  if (
    !midNet ||
    !connects(capacitor, midNet) ||
    !connects(capacitor, params.groundNetId)
  ) {
    return null
  }

  const durationSeconds = (params.context.project.simulations[0]?.durationMs ?? 10) / 1000
  const timeStepSeconds =
    (params.context.project.simulations[0]?.timeStepMs ?? 0.1) / 1000
  const waveform = computeRcWaveform({
    source: params.source,
    sourceVoltage: params.sourceVoltage,
    resistorValue: resistor.value,
    capacitorValue: capacitor.value,
    durationSeconds,
    timeStepSeconds,
  })
  const last = waveform[waveform.length - 1] ?? {
    t: 0,
    input: params.sourceVoltage,
    output: params.sourceVoltage,
    current: 0,
  }
  const netVoltages = {
    [params.groundNetId]: 0,
    [params.sourcePositiveNet]: last.input,
    [midNet]: last.output,
  }
  const components = [
    sourceMeasurement(
      params.source,
      last.input,
      -last.current,
      params.context.netlist.pinToNetId,
    ),
    passiveMeasurement(
      resistor.symbol,
      netVoltages,
      params.context.netlist.pinToNetId,
      resistor.value,
    ),
    {
      ...passiveMeasurement(
        capacitor.symbol,
        netVoltages,
        params.context.netlist.pinToNetId,
        capacitor.value,
      ),
      current: signedCurrentForPart(
        capacitor,
        midNet,
        params.groundNetId,
        last.current,
      ),
      power: Math.abs(last.output * last.current),
    },
  ]
  const scopes = buildRcScopeTraces(params.context, waveform, components, {
    sourceNet: params.sourcePositiveNet,
    outputNet: midNet,
  })
  params.context.notes.unshift("Recognized a first-order RC low-pass circuit.")
  return buildReport(
    params.context,
    "rc-low-pass",
    netVoltages,
    components,
    scopes,
  )
}

function buildReport(
  context: MeasurementContext,
  topology: MeasurementTopology,
  voltageByNetId: Record<string, number>,
  componentMeasurements: ComponentMeasurement[],
  scopeTraces: WaveformTrace[],
): CircuitMeasurementReport {
  const probeMeasurements = context.probes
    .map((probe) => {
      const netId = context.netlist.objectToNetId[probe.id]
      const net = context.netlist.nets.find((candidate) => candidate.id === netId)
      return {
        objectId: probe.id,
        name: probe.name,
        probeType: probe.probeType,
        netId,
        netName: net?.name,
        voltage: netId ? voltageByNetId[netId] : undefined,
        current: currentForProbe(probe, context.symbols, componentMeasurements),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.objectId.localeCompare(b.objectId))

  const measuredIds = new Set(componentMeasurements.map((measurement) => measurement.objectId))
  const unsupported = context.symbols.filter((symbol) => !measuredIds.has(symbol.id))
  const unsupportedMeasurements = unsupported.map((symbol) => ({
    objectId: symbol.id,
    refdes: symbol.refdes,
    componentDefinitionId: symbol.componentDefinitionId,
    voltage: undefined,
    current: undefined,
    power: undefined,
    label: "No measurement for this component in the current demo topology.",
  }))

  return {
    topology,
    netlist: context.netlist,
    netVoltages: context.netlist.nets
      .map((net) => ({
        netId: net.id,
        name: net.name,
        voltage: voltageByNetId[net.id],
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    componentMeasurements: [...componentMeasurements, ...unsupportedMeasurements].sort(
      (a, b) => a.refdes.localeCompare(b.refdes) || a.objectId.localeCompare(b.objectId),
    ),
    probeMeasurements,
    scopeTraces,
    notes: context.notes,
  }
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

function sourceMeasurement(
  source: SymbolObject,
  voltage: number,
  current: number | undefined,
  pinToNetId: Record<string, string>,
): ComponentMeasurement {
  const pin1Net = pinToNetId[pinConnectionKey(source.id, "pin1")]
  const pin2Net = pinToNetId[pinConnectionKey(source.id, "pin2")]
  const label =
    pin1Net && pin2Net
      ? `${source.refdes}: ${formatMeasurement(voltage, "V")}`
      : `${source.refdes}: unconnected source`
  return {
    objectId: source.id,
    refdes: source.refdes,
    componentDefinitionId: source.componentDefinitionId,
    voltage,
    current,
    power: current === undefined ? undefined : voltage * current,
    label,
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

function passiveMeasurement(
  symbol: SymbolObject,
  voltageByNetId: Record<string, number>,
  pinToNetId: Record<string, string>,
  value: number,
): ComponentMeasurement {
  const pin1Net = pinToNetId[pinConnectionKey(symbol.id, "pin1")]
  const pin2Net = pinToNetId[pinConnectionKey(symbol.id, "pin2")]
  const pin1Voltage = pin1Net ? voltageByNetId[pin1Net] : undefined
  const pin2Voltage = pin2Net ? voltageByNetId[pin2Net] : undefined
  const voltage =
    pin1Voltage === undefined || pin2Voltage === undefined
      ? undefined
      : pin1Voltage - pin2Voltage
  const current =
    voltage === undefined || isCapacitorLike(symbol.componentDefinitionId)
      ? undefined
      : voltage / value
  return {
    objectId: symbol.id,
    refdes: symbol.refdes,
    componentDefinitionId: symbol.componentDefinitionId,
    voltage,
    current,
    power:
      voltage === undefined || current === undefined
        ? undefined
        : Math.abs(voltage * current),
    label: `${symbol.refdes}: ${formatMeasurement(voltage, "V")}`,
  }
}

function isResistorLike(componentDefinitionId: string): boolean {
  return componentDefinitionId === "resistor"
}

function isCapacitorLike(componentDefinitionId: string): boolean {
  return componentDefinitionId === "capacitor"
}

function computeRcWaveform(params: {
  source: SymbolObject
  sourceVoltage: number
  resistorValue: number
  capacitorValue: number
  durationSeconds: number
  timeStepSeconds: number
}): Array<{ t: number; input: number; output: number; current: number }> {
  const tau = params.resistorValue * params.capacitorValue
  const step = Math.max(params.timeStepSeconds, 1e-6)
  const frequency = parseSiValue(params.source.props.frequency) ?? 0
  const points: Array<{ t: number; input: number; output: number; current: number }> = []
  let output = 0
  for (let t = 0; t <= params.durationSeconds + 1e-12; t += step) {
    const input =
      params.source.componentDefinitionId === "sine-voltage-source"
        ? params.sourceVoltage * Math.sin(2 * Math.PI * frequency * t)
        : params.sourceVoltage
    const alpha = tau > 0 ? step / (tau + step) : 1
    output = output + alpha * (input - output)
    points.push({
      t,
      input,
      output,
      current: (input - output) / params.resistorValue,
    })
  }
  return points
}

function buildScopeTraces(
  context: MeasurementContext,
  voltageByNetId: Record<string, number>,
  componentMeasurements: ComponentMeasurement[],
): WaveformTrace[] {
  const durationSeconds = (context.project.simulations[0]?.durationMs ?? 10) / 1000
  return context.probes
    .map((probe) => {
      const netId = context.netlist.objectToNetId[probe.id]
      if (probe.probeType === "current") {
        const current = currentForProbe(probe, context.symbols, componentMeasurements)
        if (current === undefined) {
          return null
        }
        return {
          id: `scope_${probe.id}`,
          name: probe.name,
          metric: "current" as const,
          unit: "A",
          targetId: probe.id,
          targetName: probe.name,
          points: [
            { t: 0, v: current },
            { t: durationSeconds, v: current },
          ],
        }
      }
      const voltage = netId ? voltageByNetId[netId] : undefined
      if (voltage === undefined) {
        return null
      }
      return {
        id: `scope_${probe.id}`,
        name: probe.name,
        metric: "voltage" as const,
        unit: "V",
        targetId: probe.id,
        targetName: probe.name,
        points: [
          { t: 0, v: voltage },
          { t: durationSeconds, v: voltage },
        ],
      }
    })
    .filter((trace): trace is NonNullable<typeof trace> => Boolean(trace))
}

function buildRcScopeTraces(
  context: MeasurementContext,
  waveform: Array<{ t: number; input: number; output: number; current: number }>,
  componentMeasurements: ComponentMeasurement[],
  nets: { sourceNet: string; outputNet: string },
): WaveformTrace[] {
  return context.probes
    .map((probe) => {
      const netId = context.netlist.objectToNetId[probe.id]
      if (probe.probeType === "current") {
        const current = currentForProbe(probe, context.symbols, componentMeasurements)
        if (current === undefined) {
          return null
        }
        return {
          id: `scope_${probe.id}`,
          name: probe.name,
          metric: "current" as const,
          unit: "A",
          targetId: probe.id,
          targetName: probe.name,
          points: waveform.map((point) => ({ t: point.t, v: point.current })),
        }
      }
      if (netId === nets.sourceNet) {
        return {
          id: `scope_${probe.id}`,
          name: probe.name,
          metric: "voltage" as const,
          unit: "V",
          targetId: probe.id,
          targetName: probe.name,
          points: waveform.map((point) => ({ t: point.t, v: point.input })),
        }
      }
      if (netId === nets.outputNet) {
        return {
          id: `scope_${probe.id}`,
          name: probe.name,
          metric: "voltage" as const,
          unit: "V",
          targetId: probe.id,
          targetName: probe.name,
          points: waveform.map((point) => ({ t: point.t, v: point.output })),
        }
      }
      return null
    })
    .filter((trace): trace is NonNullable<typeof trace> => Boolean(trace))
}

function currentForProbe(
  probe: ProbeObject,
  symbols: SymbolObject[],
  componentMeasurements: ComponentMeasurement[],
): number | undefined {
  if (probe.probeType !== "current") {
    return undefined
  }
  for (const symbol of symbols) {
    const measurement = componentMeasurements.find(
      (candidate) => candidate.objectId === symbol.id,
    )
    if (measurement?.current === undefined) {
      continue
    }
    for (const pin of getSymbolPinWorldPositions(symbol)) {
      if (!samePoint(probe.position, pin.position)) {
        continue
      }
      return pin.componentPinId === "pin2" ? -measurement.current : measurement.current
    }
  }
  return undefined
}

function samePoint(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) <= 4 && Math.abs(a.y - b.y) <= 4
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

function signedCurrentForPart(
  part: TwoPinPart,
  fromNet: string,
  toNet: string,
  current: number,
): number | undefined {
  if (part.pin1Net === fromNet && part.pin2Net === toNet) {
    return current
  }
  if (part.pin1Net === toNet && part.pin2Net === fromNet) {
    return -current
  }
  return undefined
}

function formatNumber(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 100) {
    return value.toFixed(0)
  }
  if (abs >= 10) {
    return value.toFixed(1)
  }
  return value.toFixed(2)
}

type RgbColor = { r: number; g: number; b: number }

function getScaledVoltageColor(
  voltage: number,
  options: VoltageColorOptions,
): string {
  const voltageRange =
    Number.isFinite(options.voltageRange) && options.voltageRange > 0
      ? options.voltageRange
      : 5
  const neutral = parseHexColor(options.neutralColor, { r: 128, g: 128, b: 128 })
  const target =
    voltage >= 0
      ? parseHexColor(options.positiveColor, { r: 0, g: 255, b: 0 })
      : parseHexColor(options.negativeColor, { r: 255, g: 0, b: 0 })
  const ratio = Math.min(1, Math.abs(voltage) / voltageRange)
  return rgbToHex({
    r: blendChannel(neutral.r, target.r, ratio),
    g: blendChannel(neutral.g, target.g, ratio),
    b: blendChannel(neutral.b, target.b, ratio),
  })
}

function parseHexColor(value: string, fallback: RgbColor): RgbColor {
  const match = value.trim().match(/^#?([0-9a-f]{6})$/i)
  if (!match) {
    return fallback
  }
  const hex = match[1]!
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  }
}

function blendChannel(start: number, end: number, ratio: number): number {
  return Math.round(start + (end - start) * ratio)
}

function rgbToHex(color: RgbColor): string {
  return `#${hexChannel(color.r)}${hexChannel(color.g)}${hexChannel(color.b)}`
}

function hexChannel(value: number): string {
  return Math.min(255, Math.max(0, value)).toString(16).padStart(2, "0")
}
