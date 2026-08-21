import { extractNetlist, pinConnectionKey } from "../schematic/net-extraction"
import { parseSiValue } from "../schematic/values"
import type { SimulationMetric } from "./types"
import type { CircuitProject, ProbeObject, SymbolObject } from "../schematic/types"

export type SpiceElementBinding = {
  objectId: string
  refdes: string
  componentDefinitionId: string
  spiceName: string
  n1: string
  n2: string
  currentExpression?: string
}

export type SpiceTraceBinding = {
  expression: string
  metric: SimulationMetric
  unit: string
  targetId: string
  targetName: string
}

export type SpiceNetlistBuild = {
  netlist: string
  elements: SpiceElementBinding[]
  nodeNameByNetId: Record<string, string>
  traceBindings: SpiceTraceBinding[]
  probeNodeNames: string[]
  notes: string[]
  diagnostics: {
    warnings: string[]
    errors: string[]
    unsupportedComponents: string[]
    floatingPins: string[]
  }
}

export function generateSpiceNetlist(project: CircuitProject): SpiceNetlistBuild {
  const sheet = project.sheets[0]
  const netlist = extractNetlist(project)
  const simulation = project.simulations[0]
  const durationSeconds = (simulation?.durationMs ?? 10) / 1000
  const timeStepSeconds = (simulation?.timeStepMs ?? 0.1) / 1000
  const nodeNameByNetId = buildNodeNames(netlist.nets)
  const notes: string[] = []
  const diagnostics: SpiceNetlistBuild["diagnostics"] = {
    warnings: [],
    errors: [],
    unsupportedComponents: [],
    floatingPins: [],
  }
  const elements: SpiceElementBinding[] = []
  const lines = [
    "Transient SPICE export",
    `* Generated from ${project.name}`,
    ".option filetype=ascii",
  ]

  if (!sheet) {
    return {
      netlist: `${lines.join("\n")}\n.end\n`,
      elements,
      nodeNameByNetId,
      traceBindings: [],
      probeNodeNames: [],
      notes: ["No schematic sheet is available."],
      diagnostics: {
        ...diagnostics,
        errors: ["No schematic sheet is available."],
      },
    }
  }

  const symbols = sheet.objects
    .filter((object): object is SymbolObject => object.kind === "symbol")
    .sort((a, b) => a.refdes.localeCompare(b.refdes) || a.id.localeCompare(b.id))
  const probes = sheet.objects.filter(
    (object): object is ProbeObject => object.kind === "probe",
  )

  let needsDefaultDiodeModel = false
  const modelLines = new Set<string>()

  for (const symbol of symbols) {
    const line = spiceLineForSymbol({
      symbol,
      pinToNetId: netlist.pinToNetId,
      nodeNameByNetId,
      durationSeconds,
      elements,
      notes,
      diagnostics,
      modelLines,
    })
    if (!line) {
      continue
    }
    if (symbol.componentDefinitionId === "diode" || symbol.componentDefinitionId === "led") {
      needsDefaultDiodeModel = true
    }
    lines.push(line)
  }

  if (needsDefaultDiodeModel) {
    lines.push(".model DDEFAULT D(Is=1e-14 N=1)")
    lines.push(".model DLED D(Is=1e-18 N=2)")
  }
  lines.push(...modelLines)

  const probeNodeNames = probes
    .map((probe) => {
      const netId = netlist.objectToNetId[probe.id]
      return netId ? nodeNameByNetId[netId] : undefined
    })
    .filter((nodeName): nodeName is string => Boolean(nodeName && nodeName !== "0"))

  lines.push(`.tran ${formatSpiceNumber(timeStepSeconds)} ${formatSpiceNumber(durationSeconds)}`)
  const printNodes =
    probeNodeNames.length > 0
      ? [...new Set(probeNodeNames)]
      : Object.values(nodeNameByNetId).filter((nodeName) => nodeName !== "0")
  const traceBindings = traceBindingsForRun(printNodes, elements)
  const saveExpressions = [...new Set(traceBindings.map((binding) => binding.expression))]
  if (saveExpressions.length > 0) {
    lines.push(`.save ${saveExpressions.join(" ")}`)
  }
  if (printNodes.length > 0) {
    lines.push(`.print tran ${printNodes.map((nodeName) => `V(${nodeName})`).join(" ")}`)
  }
  lines.push(".end")

  return {
    netlist: `${lines.join("\n")}\n`,
    elements,
    nodeNameByNetId,
    traceBindings,
    probeNodeNames,
    notes,
    diagnostics,
  }
}

function spiceLineForSymbol({
  symbol,
  pinToNetId,
  nodeNameByNetId,
  durationSeconds,
  elements,
  notes,
  diagnostics,
  modelLines,
}: {
  symbol: SymbolObject
  pinToNetId: Record<string, string>
  nodeNameByNetId: Record<string, string>
  durationSeconds: number
  elements: SpiceElementBinding[]
  notes: string[]
  diagnostics: SpiceNetlistBuild["diagnostics"]
  modelLines: Set<string>
}): string | null {
  if (isSpiceConnectivityOnlySwitch(symbol.componentDefinitionId)) {
    return null
  }

  const pin1 = nodeForPin(symbol, "pin1", pinToNetId, nodeNameByNetId, notes, diagnostics)
  const pin2 = nodeForPin(symbol, "pin2", pinToNetId, nodeNameByNetId, notes, diagnostics)

  switch (symbol.componentDefinitionId) {
    case "resistor":
      return twoTerminalLine("R", symbol, pin1, pin2, propValue(symbol, "value", "1k"), elements)
    case "capacitor":
      return twoTerminalLine("C", symbol, pin1, pin2, propValue(symbol, "value", "1uF"), elements)
    case "inductor":
      return twoTerminalLine("L", symbol, pin1, pin2, propValue(symbol, "value", "10mH"), elements)
    case "diode":
      return diodeLine(symbol, pin1, pin2, "DDEFAULT", elements, modelLines)
    case "led":
      return diodeLine(symbol, pin1, pin2, "DLED", elements, modelLines)
    case "dc-current-source":
      return currentSourceLine(symbol, pin1, pin2, propValue(symbol, "current", "1mA"), elements)
    case "dc-voltage-source":
      return voltageSourceLine(symbol, pin1, pin2, propValue(symbol, "voltage", "5V"), elements)
    case "sine-voltage-source":
      return sineSourceLine(symbol, pin1, pin2, durationSeconds, elements)
    default:
      diagnostics.unsupportedComponents.push(symbol.refdes)
      diagnostics.warnings.push(`${symbol.refdes} is not supported by the SPICE exporter yet.`)
      notes.push(`${symbol.refdes} is not supported by the SPICE exporter yet.`)
      return null
  }
}

function isSpiceConnectivityOnlySwitch(componentDefinitionId: string): boolean {
  return componentDefinitionId === "switch"
}

function diodeLine(
  symbol: SymbolObject,
  pin1: string,
  pin2: string,
  fallbackModel: string,
  elements: SpiceElementBinding[],
  modelLines: Set<string>,
): string {
  const modelProp =
    typeof symbol.props.spiceModel === "string"
      ? symbol.props.spiceModel
      : typeof symbol.props.model === "string"
        ? symbol.props.model
        : fallbackModel
  const modelName = sanitizeModelName(modelProp)
  if (modelName !== "DDEFAULT" && modelName !== "DLED") {
    modelLines.add(`.model ${modelName} D(Is=1e-14 N=1)`)
  }
  return twoTerminalLine("D", symbol, pin1, pin2, modelName, elements)
}

function twoTerminalLine(
  prefix: string,
  symbol: SymbolObject,
  pin1: string,
  pin2: string,
  value: string,
  elements: SpiceElementBinding[],
): string {
  const spiceName = spiceElementName(prefix, symbol.refdes)
  elements.push({
    objectId: symbol.id,
    refdes: symbol.refdes,
    componentDefinitionId: symbol.componentDefinitionId,
    spiceName,
    n1: pin1,
    n2: pin2,
    currentExpression: currentExpressionForElement(prefix, spiceName),
  })
  return `${spiceName} ${pin1} ${pin2} ${value}`
}

function voltageSourceLine(
  symbol: SymbolObject,
  pin1: string,
  pin2: string,
  voltage: string,
  elements: SpiceElementBinding[],
): string {
  const spiceName = spiceElementName("V", symbol.refdes)
  elements.push({
    objectId: symbol.id,
    refdes: symbol.refdes,
    componentDefinitionId: symbol.componentDefinitionId,
    spiceName,
    n1: pin1,
    n2: pin2,
    currentExpression: `I(${spiceName})`,
  })
  return `${spiceName} ${pin1} ${pin2} DC ${voltage}`
}

function currentSourceLine(
  symbol: SymbolObject,
  pin1: string,
  pin2: string,
  current: string,
  elements: SpiceElementBinding[],
): string {
  const spiceName = spiceElementName("I", symbol.refdes)
  elements.push({
    objectId: symbol.id,
    refdes: symbol.refdes,
    componentDefinitionId: symbol.componentDefinitionId,
    spiceName,
    n1: pin1,
    n2: pin2,
    currentExpression: `I(${spiceName})`,
  })
  return `${spiceName} ${pin1} ${pin2} DC ${current}`
}

function sineSourceLine(
  symbol: SymbolObject,
  pin1: string,
  pin2: string,
  durationSeconds: number,
  elements: SpiceElementBinding[],
): string {
  const spiceName = spiceElementName("V", symbol.refdes)
  const amplitude = parseSiValue(symbol.props.amplitude) ?? 1
  const frequency = parseSiValue(symbol.props.frequency) ?? 1000
  const samples = 64
  const points: string[] = []
  for (let index = 0; index <= samples; index += 1) {
    const t = (durationSeconds / samples) * index
    const v = amplitude * Math.sin(2 * Math.PI * frequency * t)
    points.push(formatSpiceNumber(t), formatSpiceNumber(v))
  }
  elements.push({
    objectId: symbol.id,
    refdes: symbol.refdes,
    componentDefinitionId: symbol.componentDefinitionId,
    spiceName,
    n1: pin1,
    n2: pin2,
    currentExpression: `I(${spiceName})`,
  })
  return `${spiceName} ${pin1} ${pin2} PWL(${points.join(" ")})`
}

function traceBindingsForRun(
  printNodes: string[],
  elements: SpiceElementBinding[],
): SpiceTraceBinding[] {
  const voltageBindings = printNodes.map((nodeName) => ({
    expression: `V(${nodeName})`,
    metric: "voltage" as const,
    unit: "V",
    targetId: nodeName,
    targetName: `V(${nodeName})`,
  }))
  const currentBindings = elements.flatMap((element) =>
    element.currentExpression
      ? [
          {
            expression: element.currentExpression,
            metric: "current" as const,
            unit: "A",
            targetId: element.objectId,
            targetName: element.refdes,
          },
        ]
      : [],
  )
  return [...voltageBindings, ...currentBindings]
}

function currentExpressionForElement(prefix: string, spiceName: string): string {
  const lowerName = spiceName.toLowerCase()
  if (prefix.toUpperCase() === "D") {
    return `@${lowerName}[id]`
  }
  return `@${lowerName}[i]`
}

function nodeForPin(
  symbol: SymbolObject,
  pinId: string,
  pinToNetId: Record<string, string>,
  nodeNameByNetId: Record<string, string>,
  notes: string[],
  diagnostics: SpiceNetlistBuild["diagnostics"],
): string {
  const netId = pinToNetId[pinConnectionKey(symbol.id, pinId)]
  if (!netId) {
    const floatingNode = `NC_${sanitizeNodeName(symbol.refdes)}_${pinId.toUpperCase()}`
    const message = `${symbol.refdes}.${pinId} is floating in the SPICE export.`
    diagnostics.floatingPins.push(`${symbol.refdes}.${pinId}`)
    diagnostics.warnings.push(message)
    notes.push(message)
    return floatingNode
  }
  return nodeNameByNetId[netId] ?? sanitizeNodeName(netId)
}

function buildNodeNames(
  nets: ReturnType<typeof extractNetlist>["nets"],
): Record<string, string> {
  const used = new Set(["0"])
  const names: Record<string, string> = {}
  for (const net of nets) {
    if (net.name === "GND") {
      names[net.id] = "0"
      continue
    }
    const base = sanitizeNodeName(net.name)
    let candidate = base
    let index = 2
    while (used.has(candidate.toUpperCase())) {
      candidate = `${base}_${index}`
      index += 1
    }
    used.add(candidate.toUpperCase())
    names[net.id] = candidate
  }
  return names
}

function propValue(
  symbol: SymbolObject,
  key: string,
  fallback: string,
): string {
  const value = symbol.props[key]
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback
}

function spiceElementName(prefix: string, refdes: string): string {
  const safe = refdes.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase()
  return safe.startsWith(prefix.toUpperCase()) ? safe : `${prefix}${safe}`
}

function sanitizeNodeName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase()
  if (!sanitized || sanitized === "0") {
    return "N_UNNAMED"
  }
  return /^[A-Z_]/.test(sanitized) ? sanitized : `N_${sanitized}`
}

function sanitizeModelName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase()
  if (!sanitized) {
    return "DDEFAULT"
  }
  return /^[A-Z_]/.test(sanitized) ? sanitized : `M_${sanitized}`
}

function formatSpiceNumber(value: number): string {
  if (Math.abs(value) < 1e-15) {
    return "0"
  }
  return Number(value.toPrecision(8)).toString()
}
