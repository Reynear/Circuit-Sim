import { extractNetlist } from "../schematic/net-extraction"
import type {
  BoxObject,
  CircuitProject,
  LineObject,
  ProbeObject,
  SymbolObject,
  TextObject,
} from "../schematic/types"

const COORDINATE_SCALE = 40

type TscircuitComponentMapping = {
  elementName: string
  extraPropNames?: string[]
  fixedAttrs?: Record<string, string>
  valueProp?: string
  tscircuitValueProp?: string
  implicitGroundPinId?: string
}

const componentMappings: Record<string, TscircuitComponentMapping> = {
  resistor: {
    elementName: "resistor",
    valueProp: "value",
    tscircuitValueProp: "resistance",
  },
  capacitor: {
    elementName: "capacitor",
    valueProp: "value",
    tscircuitValueProp: "capacitance",
  },
  inductor: {
    elementName: "inductor",
    valueProp: "value",
    tscircuitValueProp: "inductance",
  },
  switch: {
    elementName: "switch",
    extraPropNames: ["state"],
  },
  potentiometer: {
    elementName: "potentiometer",
    extraPropNames: ["value", "wiper"],
  },
  "dc-voltage-source": {
    elementName: "voltagesource",
    valueProp: "voltage",
    tscircuitValueProp: "voltage",
  },
  "sine-voltage-source": {
    elementName: "voltagesource",
    valueProp: "amplitude",
    tscircuitValueProp: "voltage",
    extraPropNames: ["frequency"],
  },
  "dc-current-source": {
    elementName: "currentsource",
    valueProp: "current",
    tscircuitValueProp: "current",
  },
  diode: { elementName: "diode" },
  led: { elementName: "led" },
  "npn-transistor": {
    elementName: "transistor",
    fixedAttrs: { type: "npn" },
    extraPropNames: ["beta"],
  },
  "pnp-transistor": {
    elementName: "transistor",
    fixedAttrs: { type: "pnp" },
    extraPropNames: ["beta"],
  },
  "n-mosfet": {
    elementName: "mosfet",
    fixedAttrs: { channelType: "n", mosfetMode: "enhancement" },
    extraPropNames: ["thresholdVoltage"],
  },
  "p-mosfet": {
    elementName: "mosfet",
    fixedAttrs: { channelType: "p", mosfetMode: "enhancement" },
    extraPropNames: ["thresholdVoltage"],
  },
  "ideal-op-amp-minus-top": {
    elementName: "opamp",
    fixedAttrs: { inputOrder: "minus-top" },
    extraPropNames: ["maxOutput", "minOutput", "gain"],
  },
  "logic-input": {
    elementName: "logicinput",
    extraPropNames: ["position", "highLogicVoltage", "lowVoltage"],
  },
  "logic-output": {
    elementName: "logicoutput",
    extraPropNames: ["threshold", "currentRequired"],
  },
  "and-gate": {
    elementName: "andgate",
    extraPropNames: ["inputCount", "highLogicVoltage"],
  },
  "or-gate": {
    elementName: "orgate",
    extraPropNames: ["inputCount", "highLogicVoltage"],
  },
  inverter: {
    elementName: "inverter",
    extraPropNames: ["highLogicVoltage"],
  },
}

export function generateTscircuitTsx(project: CircuitProject): string {
  const sheet = project.sheets[0]
  if (!sheet) {
    return ""
  }

  const netlist = extractNetlist(project)
  const symbols = sheet.objects
    .filter((object): object is SymbolObject => object.kind === "symbol")
    .filter((symbol) => componentMappings[symbol.componentDefinitionId])
    .sort(
      (a, b) => a.refdes.localeCompare(b.refdes) || a.id.localeCompare(b.id),
    )
  const probes = sheet.objects
    .filter((object): object is ProbeObject => object.kind === "probe")
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const textNotes = sheet.objects
    .filter((object): object is TextObject => object.kind === "text")
    .sort((a, b) => a.text.localeCompare(b.text) || a.id.localeCompare(b.id))
  const visualLines = sheet.objects
    .filter((object): object is LineObject => object.kind === "line")
    .sort((a, b) => a.id.localeCompare(b.id))
  const visualBoxes = sheet.objects
    .filter((object): object is BoxObject => object.kind === "box")
    .sort((a, b) => a.id.localeCompare(b.id))

  const lines: string[] = ["circuit.add(", "  <board routingDisabled>"]

  for (const symbol of symbols) {
    lines.push(`    ${renderComponent(symbol)}`)
  }

  if (symbols.length > 0) {
    lines.push("")
  }

  for (const trace of [
    ...renderTraces(netlist, symbols),
    ...renderImplicitGroundTraces(symbols),
  ]) {
    lines.push(`    ${trace}`)
  }

  const probeLines = probes
    .map((probe) => renderProbe(probe, netlist))
    .filter((line): line is string => Boolean(line))
  if (probeLines.length > 0) {
    lines.push("")
    for (const probeLine of probeLines) {
      lines.push(`    ${probeLine}`)
    }
  }

  if (textNotes.length > 0) {
    lines.push("")
    for (const textNote of textNotes) {
      lines.push(`    ${renderTextNote(textNote)}`)
    }
  }

  if (visualLines.length > 0 || visualBoxes.length > 0) {
    lines.push("")
    for (const visualLine of visualLines) {
      lines.push(`    ${renderVisualLine(visualLine)}`)
    }
    for (const visualBox of visualBoxes) {
      lines.push(`    ${renderVisualBox(visualBox)}`)
    }
  }

  const simulation = project.simulations[0]
  if (simulation) {
    lines.push("")
    lines.push(
      `    <analogsimulation data-circuit-id="${escapeAttr(
        simulation.id,
      )}" duration="${simulation.durationMs}ms" timePerStep="${simulation.timeStepMs}ms" spiceEngine="spicey" />`,
    )
  }

  lines.push("  </board>", ")")
  return `${lines.join("\n")}\n`
}

function renderComponent(symbol: SymbolObject): string {
  const mapping = componentMappings[symbol.componentDefinitionId]
  if (!mapping) {
    return ""
  }
  const attrs = [
    `data-circuit-id="${escapeAttr(symbol.id)}"`,
    `name="${escapeAttr(symbol.refdes)}"`,
    renderValueAttribute(symbol, mapping),
    ...renderFixedAttributes(mapping),
    ...renderExtraAttributes(symbol, mapping),
    `schX={${formatCoordinate(symbol.position.x)}}`,
    `schY={${formatCoordinate(symbol.position.y)}}`,
    renderRotationAttribute(symbol),
  ].filter((attr): attr is string => Boolean(attr))

  return `<${mapping.elementName} ${attrs.join(" ")} />`
}

function renderRotationAttribute(symbol: SymbolObject): string | null {
  return symbol.rotation === 0
    ? null
    : `schRotation={${formatRotation(symbol.rotation)}}`
}

function renderValueAttribute(
  symbol: SymbolObject,
  mapping: TscircuitComponentMapping,
): string | null {
  if (!mapping.valueProp || !mapping.tscircuitValueProp) {
    return null
  }
  const value = symbol.props[mapping.valueProp]
  if (typeof value !== "string" && typeof value !== "number") {
    return null
  }
  return `${mapping.tscircuitValueProp}="${escapeAttr(String(value))}"`
}

function renderFixedAttributes(mapping: TscircuitComponentMapping): string[] {
  return Object.entries(mapping.fixedAttrs ?? {}).map(
    ([name, value]) => `${name}="${escapeAttr(value)}"`,
  )
}

function renderExtraAttributes(
  symbol: SymbolObject,
  mapping: TscircuitComponentMapping,
): string[] {
  return (mapping.extraPropNames ?? [])
    .map((propName) => {
      const value = symbol.props[propName]
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        return null
      }
      return `${propName}="${escapeAttr(String(value))}"`
    })
    .filter((attr): attr is string => Boolean(attr))
}

function renderTextNote(note: TextObject): string {
  return `<textnote data-circuit-id="${escapeAttr(note.id)}" text="${escapeAttr(
    note.text,
  )}" schX={${formatCoordinate(note.position.x)}} schY={${formatCoordinate(note.position.y)}} />`
}

function renderVisualLine(line: LineObject): string {
  return `<visualline data-circuit-id="${escapeAttr(line.id)}" startX={${formatCoordinate(
    line.start.x,
  )}} startY={${formatCoordinate(line.start.y)}} endX={${formatCoordinate(
    line.end.x,
  )}} endY={${formatCoordinate(line.end.y)}} />`
}

function renderVisualBox(box: BoxObject): string {
  return `<visualbox data-circuit-id="${escapeAttr(box.id)}" startX={${formatCoordinate(
    box.start.x,
  )}} startY={${formatCoordinate(box.start.y)}} endX={${formatCoordinate(
    box.end.x,
  )}} endY={${formatCoordinate(box.end.y)}} />`
}

function renderTraces(
  netlist: ReturnType<typeof extractNetlist>,
  symbols: SymbolObject[],
): string[] {
  const traces: string[] = []
  const renderedSymbolIds = new Set(symbols.map((symbol) => symbol.id))
  for (const net of [...netlist.nets].sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const selectors = net.pins
      .filter((pin) => renderedSymbolIds.has(pin.symbolObjectId))
      .map((pin) => pinSelector(pin.refdes, pin.pinId))
    const anchor = net.name === "GND" ? "net.GND" : selectors[0]
    if (!anchor) {
      continue
    }

    for (const selector of selectors) {
      if (selector !== anchor) {
        traces.push(
          `<trace from="${escapeAttr(anchor)}" to="${escapeAttr(selector)}" />`,
        )
      }
    }
  }
  return traces
}

function renderImplicitGroundTraces(symbols: SymbolObject[]): string[] {
  return symbols
    .map((symbol) => {
      const mapping = componentMappings[symbol.componentDefinitionId]
      if (!mapping?.implicitGroundPinId) {
        return null
      }
      return `<trace from="${escapeAttr(
        pinSelector(symbol.refdes, mapping.implicitGroundPinId),
      )}" to="net.GND" />`
    })
    .filter((trace): trace is string => Boolean(trace))
}

function renderProbe(
  probe: ProbeObject,
  netlist: ReturnType<typeof extractNetlist>,
): string | null {
  const netId = netlist.objectToNetId[probe.id]
  const net = netlist.nets.find((candidate) => candidate.id === netId)
  if (!net) {
    return null
  }
  const target =
    net.pins[0] ? pinSelector(net.pins[0].refdes, net.pins[0].pinId) : `net.${net.name}`
  const elementName = probe.probeType === "current" ? "currentprobe" : "voltageprobe"
  return `<${elementName} data-circuit-id="${escapeAttr(probe.id)}" name="${escapeAttr(
    probe.name,
  )}" connectsTo="${escapeAttr(target)}" />`
}

function pinSelector(refdes: string, pinId: string): string {
  // TODO: Confirm selector naming against each tscircuit primitive as the preview integration matures.
  return `.${refdes} > .${pinId}`
}

function formatCoordinate(value: number): number {
  return Number((value / COORDINATE_SCALE).toFixed(3))
}

function formatRotation(value: number): number {
  return Number(value.toFixed(6))
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
}
