import { getSymbolPinWorldPositions } from "../schematic/transforms"
import { extractNetlist } from "../schematic/net-extraction"
import { getTextSize } from "../schematic/schematic-text"
import type {
  BoxObject,
  CircuitProject,
  GroundObject,
  LineObject,
  NetLabelObject,
  ProbeObject,
  SymbolObject,
  TextObject,
  Vec2,
  WireObject,
} from "../schematic/types"
import { parseSiValue } from "../schematic/values"

const COORDINATE_SCALE = 40
const POINT_TOLERANCE = 1e-6

export type CircuitJsonArtifactElement = Record<string, unknown>

type CircuitJsonComponentMapping = {
  circuitJsonValueProp?: string
  defaultValue?: number
  ftype:
    | "simple_capacitor"
    | "simple_current_source"
    | "simple_diode"
    | "simple_ground"
    | "simple_inductor"
    | "simple_led"
    | "simple_mosfet"
    | "simple_op_amp"
    | "simple_pinout"
    | "simple_resistor"
    | "simple_switch"
    | "simple_test_point"
    | "simple_transistor"
    | "simple_voltage_source"
  frequencyProp?: string
  mosfetChannelType?: "n" | "p"
  mosfetMode?: "enhancement" | "depletion"
  transistorType?: "npn" | "pnp"
  valueProp?: string
  waveShape?: "square" | "sinewave" | "triangle" | "sawtooth"
}

const componentMappings: Record<string, CircuitJsonComponentMapping> = {
  resistor: {
    ftype: "simple_resistor",
    valueProp: "value",
    circuitJsonValueProp: "resistance",
    defaultValue: 1000,
  },
  capacitor: {
    ftype: "simple_capacitor",
    valueProp: "value",
    circuitJsonValueProp: "capacitance",
    defaultValue: 1e-6,
  },
  inductor: {
    ftype: "simple_inductor",
    valueProp: "value",
    circuitJsonValueProp: "inductance",
    defaultValue: 0.001,
  },
  switch: {
    ftype: "simple_switch",
    valueProp: "state",
  },
  potentiometer: {
    ftype: "simple_pinout",
    valueProp: "value",
  },
  "dc-voltage-source": {
    ftype: "simple_voltage_source",
    valueProp: "voltage",
    circuitJsonValueProp: "voltage",
    defaultValue: 5,
  },
  "sine-voltage-source": {
    ftype: "simple_voltage_source",
    valueProp: "amplitude",
    circuitJsonValueProp: "voltage",
    defaultValue: 5,
    frequencyProp: "frequency",
    waveShape: "sinewave",
  },
  "dc-current-source": {
    ftype: "simple_current_source",
    valueProp: "current",
    circuitJsonValueProp: "current",
    defaultValue: 0.001,
  },
  diode: { ftype: "simple_diode" },
  led: { ftype: "simple_led" },
  "npn-transistor": {
    ftype: "simple_transistor",
    transistorType: "npn",
  },
  "pnp-transistor": {
    ftype: "simple_transistor",
    transistorType: "pnp",
  },
  "n-mosfet": {
    ftype: "simple_mosfet",
    mosfetChannelType: "n",
    mosfetMode: "enhancement",
  },
  "p-mosfet": {
    ftype: "simple_mosfet",
    mosfetChannelType: "p",
    mosfetMode: "enhancement",
  },
  "ideal-op-amp-minus-top": { ftype: "simple_op_amp" },
  "logic-input": { ftype: "simple_pinout", valueProp: "position" },
  "logic-output": { ftype: "simple_pinout" },
  "and-gate": { ftype: "simple_pinout" },
  "or-gate": { ftype: "simple_pinout" },
  inverter: { ftype: "simple_pinout" },
}

type SourcePortIndexEntry = {
  componentPinId: string
  objectId: string
  providesGround?: boolean
  position: Vec2
  schematicPortId: string
  sourcePortId: string
}

export function generateCircuitJson(project: CircuitProject): CircuitJsonArtifactElement[] {
  return generateCircuitJsonInput(project)
}

export function generateCircuitJsonString(project: CircuitProject): string {
  return `${JSON.stringify(generateCircuitJson(project), null, 2)}\n`
}

function generateCircuitJsonInput(project: CircuitProject): CircuitJsonArtifactElement[] {
  const sheet = project.sheets[0]
  const elements: CircuitJsonArtifactElement[] = [
    {
      type: "source_project_metadata",
      name: project.name,
      software_used_string: "Circuit Sim",
      created_at: project.createdAt,
    },
  ]
  if (!sheet) {
    return elements
  }

  elements.push({
    type: "schematic_sheet",
    schematic_sheet_id: `schematic_sheet_${sheet.id}`,
    name: sheet.name,
  })

  const portIndex: SourcePortIndexEntry[] = []
  const symbols = sheet.objects.filter(
    (object): object is SymbolObject => object.kind === "symbol",
  )
  for (const symbol of symbols) {
    const mapping = componentMappings[symbol.componentDefinitionId]
    if (!mapping) {
      continue
    }

    const sourceComponentId = sourceComponentIdFor(symbol)
    const schematicComponentId = schematicComponentIdFor(symbol)
    const sourceComponent = sourceComponentFor(symbol, mapping, sourceComponentId)
    elements.push(sourceComponent)
    elements.push({
      type: "schematic_component",
      schematic_component_id: schematicComponentId,
      source_component_id: sourceComponentId,
      center: toCircuitJsonPoint(symbol.position),
      size: { width: 1.6, height: 0.6 },
      symbol_display_value: displayValueFor(symbol, mapping),
      symbol_name: symbol.componentDefinitionId,
      is_box_with_pins: false,
    })

    const pins = getSymbolPinWorldPositions(symbol)
    pins.forEach((pin, index) => {
      const sourcePortId = sourcePortIdFor(symbol.id, pin.componentPinId)
      const schematicPortId = schematicPortIdFor(symbol.id, pin.componentPinId)
      portIndex.push({
        componentPinId: pin.componentPinId,
        objectId: symbol.id,
        position: pin.position,
        sourcePortId,
        schematicPortId,
      })
      elements.push({
        type: "source_port",
        source_port_id: sourcePortId,
        source_component_id: sourceComponentId,
        name: pin.componentPinId,
        pin_number: index + 1,
        port_hints: [pin.componentPinId, pin.symbolPinId],
      })
      elements.push({
        type: "schematic_port",
        schematic_port_id: schematicPortId,
        schematic_component_id: schematicComponentId,
        source_port_id: sourcePortId,
        center: toCircuitJsonPoint(pin.position),
        pin_number: index + 1,
        display_pin_label: pin.componentPinId,
        is_connected: true,
      })
    })
  }

  const grounds = sheet.objects.filter(
    (object): object is GroundObject => object.kind === "ground",
  )
  for (const ground of grounds) {
    const sourceComponentId = `source_component_${ground.id}`
    const sourcePortId = sourcePortIdFor(ground.id, "pin1")
    portIndex.push({
      componentPinId: "pin1",
      objectId: ground.id,
      position: ground.position,
      providesGround: true,
      sourcePortId,
      schematicPortId: schematicPortIdFor(ground.id, "pin1"),
    })
    elements.push({
      type: "source_component",
      ftype: "simple_ground",
      source_component_id: sourceComponentId,
      name: ground.netName,
    })
    elements.push({
      type: "source_port",
      source_port_id: sourcePortId,
      source_component_id: sourceComponentId,
      name: "pin1",
      pin_number: 1,
      provides_ground: true,
    })
  }

  const wires = sheet.objects.filter(
    (object): object is WireObject => object.kind === "wire",
  )
  for (const wire of wires) {
    const endpoints = [wire.points[0], wire.points[wire.points.length - 1]].filter(
      (point): point is Vec2 => Boolean(point),
    )
    const connectedSourcePortIds = unique(
      endpoints
        .map((point) => findPortAtPoint(portIndex, point)?.sourcePortId)
        .filter((sourcePortId): sourcePortId is string => Boolean(sourcePortId)),
    )
    elements.push({
      type: "source_trace",
      source_trace_id: sourceTraceIdFor(wire),
      connected_source_port_ids: connectedSourcePortIds,
      connected_source_net_ids: [],
    })
    elements.push({
      type: "schematic_trace",
      schematic_trace_id: schematicTraceIdFor(wire),
      source_trace_id: sourceTraceIdFor(wire),
      junctions: wire.points.slice(1, -1).map(toCircuitJsonPoint),
      edges: wire.points.slice(0, -1).map((point, index) => ({
        from: toCircuitJsonPoint(point),
        to: toCircuitJsonPoint(wire.points[index + 1] ?? point),
        ...(index === 0
          ? {
              from_schematic_port_id: findPortAtPoint(portIndex, point)
                ?.schematicPortId,
            }
          : {}),
        ...(index === wire.points.length - 2
          ? {
              to_schematic_port_id: findPortAtPoint(
                portIndex,
                wire.points[index + 1] ?? point,
              )?.schematicPortId,
            }
          : {}),
      })),
    })
  }
  if (wires.length === 0) {
    elements.push(...netlistTraces(project, portIndex))
  }

  const netLabels = sheet.objects.filter(
    (object): object is NetLabelObject => object.kind === "net-label",
  )
  for (const label of netLabels) {
    const sourceNetId = `source_net_${label.id}`
    elements.push({
      type: "source_net",
      source_net_id: sourceNetId,
      name: label.text,
      member_source_group_ids: [],
      is_analog_signal: true,
    })
    elements.push({
      type: "schematic_net_label",
      schematic_net_label_id: `schematic_net_label_${label.id}`,
      source_net_id: sourceNetId,
      center: toCircuitJsonPoint(label.position),
      anchor_side: "right",
      text: label.text,
      is_movable: true,
    })
  }

  const probes = sheet.objects.filter(
    (object): object is ProbeObject => object.kind === "probe",
  )
  for (const probe of probes) {
    const sourceComponentId = `source_component_${probe.id}`
    elements.push({
      type: "source_component",
      ftype:
        probe.probeType === "voltage"
          ? "simple_voltage_probe"
          : "simple_test_point",
      source_component_id: sourceComponentId,
      name: probe.name,
      display_value: probe.probeType,
    })
    if (probe.probeType === "voltage") {
      const schematicTraceId = nearestSchematicTraceId(probe.position, wires)
      if (schematicTraceId) {
        elements.push({
          type: "schematic_voltage_probe",
          schematic_voltage_probe_id: `schematic_voltage_probe_${probe.id}`,
          source_component_id: sourceComponentId,
          name: probe.name,
          position: toCircuitJsonPoint(probe.position),
          schematic_trace_id: schematicTraceId,
        })
      }
    }
  }

  const textNotes = sheet.objects.filter(
    (object): object is TextObject => object.kind === "text",
  )
  for (const note of textNotes) {
    elements.push({
      type: "schematic_text",
      schematic_text_id: `schematic_text_${note.id}`,
      text: note.text,
      position: toCircuitJsonPoint(note.position),
      font_size: getTextSize(note) / 100,
      rotation: 0,
      anchor: "center_left",
      color: "#111827",
    })
  }

  const visualLines = sheet.objects.filter(
    (object): object is LineObject => object.kind === "line",
  )
  for (const line of visualLines) {
    elements.push({
      type: "schematic_line",
      schematic_line_id: `schematic_line_${line.id}`,
      x1: formatCoordinate(line.start.x / COORDINATE_SCALE),
      y1: formatCoordinate(line.start.y / COORDINATE_SCALE),
      x2: formatCoordinate(line.end.x / COORDINATE_SCALE),
      y2: formatCoordinate(line.end.y / COORDINATE_SCALE),
      stroke_width: 0.04,
      color: "#111827",
      is_dashed: false,
    })
  }

  const visualBoxes = sheet.objects.filter(
    (object): object is BoxObject => object.kind === "box",
  )
  for (const box of visualBoxes) {
    const x1 = Math.min(box.start.x, box.end.x) / COORDINATE_SCALE
    const y1 = Math.min(box.start.y, box.end.y) / COORDINATE_SCALE
    const x2 = Math.max(box.start.x, box.end.x) / COORDINATE_SCALE
    const y2 = Math.max(box.start.y, box.end.y) / COORDINATE_SCALE
    elements.push({
      type: "schematic_box",
      x: formatCoordinate(x1),
      y: formatCoordinate(y1),
      width: formatCoordinate(x2 - x1),
      height: formatCoordinate(y2 - y1),
      is_dashed: true,
    })
  }

  return elements
}

function netlistTraces(
  project: CircuitProject,
  portIndex: SourcePortIndexEntry[],
): CircuitJsonArtifactElement[] {
  const elements: CircuitJsonArtifactElement[] = []
  const netlist = extractNetlist(project)
  for (const net of netlist.nets) {
    const entries = uniqueEntriesBySourcePortId([
      ...net.pins
        .map((pin) => findPortForSymbolPin(portIndex, pin.symbolObjectId, pin.pinId))
        .filter((entry): entry is SourcePortIndexEntry => Boolean(entry)),
      ...(net.name === "GND"
        ? portIndex.filter((entry) => entry.providesGround)
        : []),
    ])
    if (entries.length < 2) {
      continue
    }

    const sourceTraceId = `source_trace_${sanitizeId(net.id)}`
    const schematicTraceId = `schematic_trace_${sanitizeId(net.id)}`
    elements.push({
      type: "source_trace",
      source_trace_id: sourceTraceId,
      connected_source_port_ids: entries.map((entry) => entry.sourcePortId),
      connected_source_net_ids: [],
    })
    const anchor = entries[0]
    if (!anchor) {
      continue
    }
    elements.push({
      type: "schematic_trace",
      schematic_trace_id: schematicTraceId,
      source_trace_id: sourceTraceId,
      junctions: [],
      edges: entries.slice(1).map((entry) => ({
        from: toCircuitJsonPoint(anchor.position),
        to: toCircuitJsonPoint(entry.position),
        from_schematic_port_id: anchor.schematicPortId,
        to_schematic_port_id: entry.schematicPortId,
      })),
    })
  }
  return elements
}

function sourceComponentFor(
  symbol: SymbolObject,
  mapping: CircuitJsonComponentMapping,
  sourceComponentId: string,
): CircuitJsonArtifactElement {
  const element: Record<string, unknown> = {
    type: "source_component",
    ftype: mapping.ftype,
    source_component_id: sourceComponentId,
    name: symbol.refdes,
    display_value: displayValueFor(symbol, mapping),
  }
  if (mapping.valueProp && mapping.circuitJsonValueProp) {
    element[mapping.circuitJsonValueProp] = numericProp(
      symbol,
      mapping.valueProp,
      mapping.defaultValue ?? 0,
    )
  }
  if (mapping.transistorType) {
    element.transistor_type = mapping.transistorType
  }
  if (mapping.mosfetChannelType) {
    element.channel_type = mapping.mosfetChannelType
    element.mosfet_mode = mapping.mosfetMode ?? "enhancement"
  }
  if (mapping.waveShape) {
    element.wave_shape = mapping.waveShape
  }
  if (mapping.frequencyProp) {
    element.frequency = numericProp(symbol, mapping.frequencyProp, 1000)
  }
  return element
}

function displayValueFor(
  symbol: SymbolObject,
  mapping: CircuitJsonComponentMapping,
): string | undefined {
  if (!mapping.valueProp) {
    return undefined
  }
  const value = symbol.props[mapping.valueProp]
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined
}

function numericProp(
  symbol: SymbolObject,
  propName: string,
  fallback: number,
): number {
  return parseSiValue(symbol.props[propName]) ?? fallback
}

function findPortAtPoint(
  portIndex: SourcePortIndexEntry[],
  point: Vec2,
): SourcePortIndexEntry | null {
  return (
    portIndex.find(
      (entry) =>
        Math.abs(entry.position.x - point.x) <= POINT_TOLERANCE &&
        Math.abs(entry.position.y - point.y) <= POINT_TOLERANCE,
    ) ?? null
  )
}

function findPortForSymbolPin(
  portIndex: SourcePortIndexEntry[],
  objectId: string,
  componentPinId: string,
): SourcePortIndexEntry | null {
  return (
    portIndex.find(
      (entry) =>
        entry.objectId === objectId && entry.componentPinId === componentPinId,
    ) ?? null
  )
}

function nearestSchematicTraceId(
  point: Vec2,
  wires: WireObject[],
): string | null {
  let nearest: { distance: number; id: string } | null = null
  for (const wire of wires) {
    for (let index = 0; index < wire.points.length - 1; index += 1) {
      const start = wire.points[index]
      const end = wire.points[index + 1]
      if (!start || !end) {
        continue
      }
      const distance = distanceToSegment(point, start, end)
      if (!nearest || distance < nearest.distance) {
        nearest = { distance, id: schematicTraceIdFor(wire) }
      }
    }
  }
  return nearest && nearest.distance <= 8 ? nearest.id : null
}

function distanceToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  )
  const projected = { x: start.x + t * dx, y: start.y + t * dy }
  return Math.hypot(point.x - projected.x, point.y - projected.y)
}

function sourceComponentIdFor(symbol: SymbolObject): string {
  return `source_component_${symbol.id}`
}

function sourcePortIdFor(objectId: string, pinId: string): string {
  return `source_port_${objectId}_${pinId}`
}

function schematicComponentIdFor(symbol: SymbolObject): string {
  return `schematic_component_${symbol.id}`
}

function schematicPortIdFor(objectId: string, pinId: string): string {
  return `schematic_port_${objectId}_${pinId}`
}

function sourceTraceIdFor(wire: WireObject): string {
  return `source_trace_${wire.id}`
}

function schematicTraceIdFor(wire: WireObject): string {
  return `schematic_trace_${wire.id}`
}

function toCircuitJsonPoint(point: Vec2): Vec2 {
  return {
    x: formatCoordinate(point.x / COORDINATE_SCALE),
    y: formatCoordinate(point.y / COORDINATE_SCALE),
  }
}

function formatCoordinate(value: number): number {
  return Number(value.toFixed(6))
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function uniqueEntriesBySourcePortId(
  entries: SourcePortIndexEntry[],
): SourcePortIndexEntry[] {
  const seen = new Set<string>()
  const uniqueEntries: SourcePortIndexEntry[] = []
  for (const entry of entries) {
    if (seen.has(entry.sourcePortId)) {
      continue
    }
    seen.add(entry.sourcePortId)
    uniqueEntries.push(entry)
  }
  return uniqueEntries
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "_")
}
