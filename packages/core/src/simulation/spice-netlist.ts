import {
  isSpiceUnsupported,
  type ElectricalCircuit,
  type ElectricalComponent,
  type ElectricalNet,
  type ElectricalTerminal,
} from "../circuit/electrical-circuit"
import type { TransientAnalysis } from "../circuit/project"
import { formatSiValue } from "../circuit/values"
import type { NodeNetName } from "./signals"

export type SpiceElementBinding = {
  refdes: string
  type: ElectricalComponent["type"]
  spiceName: string
  pin1Label: string
  pin2Label: string
  n1: string
  n2: string
  currentExpression?: string
}

export type SpiceSignalBinding = {
  expression: string
  signalName: string
  unit: "V" | "A"
  negate: boolean
}

export type SpiceNetlistBuild = {
  netlist: string
  elements: SpiceElementBinding[]
  nodeNameByNetName: ReadonlyMap<string, string>
  netNameByNodeName: ReadonlyArray<NodeNetName>
  signalBindings: SpiceSignalBinding[]
  notes: string[]
  diagnostics: {
    warnings: string[]
    errors: string[]
    suggestions: string[]
    unsupportedComponents: string[]
    floatingPins: string[]
  }
}

export function generateSpiceNetlist({
  circuit,
  analysis,
  title,
}: {
  circuit: ElectricalCircuit
  analysis: TransientAnalysis
  title: string
}): SpiceNetlistBuild {
  const durationSeconds = analysis.durationMs / 1000
  const timeStepSeconds = analysis.timeStepMs / 1000
  const nodeNameByNetName = buildNodeNames(circuit.nets)
  const notes: string[] = []
  const diagnostics: SpiceNetlistBuild["diagnostics"] = {
    warnings: [],
    errors: [],
    suggestions: [],
    unsupportedComponents: [],
    floatingPins: [],
  }
  const elements: SpiceElementBinding[] = []
  const lines = [
    "Transient SPICE export",
    `* Generated from ${title}`,
    ".option filetype=ascii",
  ]
  const modelLines = new Set<string>()
  let needsDefaultDiodeModels = false

  for (const component of circuit.components) {
    const line = spiceLineForComponent({
      component,
      nodeNameByNetName,
      durationSeconds,
      elements,
      notes,
      diagnostics,
      modelLines,
    })
    if (line) lines.push(line)
    if (component.behavior.kind === "diode") needsDefaultDiodeModels = true
  }

  if (needsDefaultDiodeModels) {
    lines.push(".model DDEFAULT D(Is=1e-14 N=1)")
    lines.push(".model DLED D(Is=1e-18 N=2)")
  }
  lines.push(...modelLines)
  lines.push(
    `.tran ${formatSpiceNumber(timeStepSeconds)} ${formatSpiceNumber(durationSeconds)}`,
  )

  const printNodes = [...nodeNameByNetName.values()].filter(
    (nodeName) => nodeName !== "0",
  )
  const signalBindings = signalBindingsForRun(
    printNodes,
    nodeNameByNetName,
    elements,
  )
  const saveExpressions = [
    ...new Set(signalBindings.map((binding) => binding.expression)),
  ]
  if (saveExpressions.length > 0) {
    lines.push(`.save ${saveExpressions.join(" ")}`)
  }
  if (printNodes.length > 0) {
    lines.push(
      `.print tran ${printNodes.map((nodeName) => `V(${nodeName})`).join(" ")}`,
    )
  }
  lines.push(".end")

  const netNameByNodeName: NodeNetName[] = [{ nodeName: "0", netName: "GND" }]
  for (const [netName, nodeName] of nodeNameByNetName) {
    if (nodeName !== "0") netNameByNodeName.push({ nodeName, netName })
  }

  return {
    netlist: `${lines.join("\n")}\n`,
    elements,
    nodeNameByNetName,
    netNameByNodeName,
    signalBindings,
    notes,
    diagnostics,
  }
}

function spiceLineForComponent({
  component,
  nodeNameByNetName,
  durationSeconds,
  elements,
  notes,
  diagnostics,
  modelLines,
}: {
  component: ElectricalComponent
  nodeNameByNetName: ReadonlyMap<string, string>
  durationSeconds: number
  elements: SpiceElementBinding[]
  notes: string[]
  diagnostics: SpiceNetlistBuild["diagnostics"]
  modelLines: Set<string>
}): string | null {
  const behavior = component.behavior
  if (behavior.kind === "switch") return null

  if (isSpiceUnsupported(behavior)) {
    const message = `${component.refdes} is not supported by the SPICE exporter yet.`
    diagnostics.unsupportedComponents.push(component.refdes)
    diagnostics.warnings.push(message)
    notes.push(message)
    return null
  }

  const [firstTerminal, secondTerminal] = component.terminals
  if (!firstTerminal || !secondTerminal) {
    diagnostics.errors.push(`${component.refdes} requires two SPICE terminals.`)
    return null
  }
  const pins = {
    pin1: nodeForTerminal(
      component,
      firstTerminal,
      nodeNameByNetName,
      notes,
      diagnostics,
    ),
    pin2: nodeForTerminal(
      component,
      secondTerminal,
      nodeNameByNetName,
      notes,
      diagnostics,
    ),
    pin1Label: firstTerminal.label,
    pin2Label: secondTerminal.label,
  }

  switch (behavior.kind) {
    case "resistor":
      return twoTerminalLine(
        "R",
        component,
        pins,
        formatSiValue(behavior.ohms),
        elements,
      )
    case "capacitor":
      return twoTerminalLine(
        "C",
        component,
        pins,
        formatSiValue(behavior.farads, "F"),
        elements,
      )
    case "inductor":
      return twoTerminalLine(
        "L",
        component,
        pins,
        formatSiValue(behavior.henries, "H"),
        elements,
      )
    case "diode": {
      const modelName = sanitizeModelName(behavior.model)
      if (modelName !== "DDEFAULT" && modelName !== "DLED") {
        modelLines.add(`.model ${modelName} D(Is=1e-14 N=1)`)
      }
      return twoTerminalLine("D", component, pins, modelName, elements)
    }
    case "dc-current-source":
      return currentSourceLine(component, pins, behavior.amps, elements)
    case "dc-voltage-source":
      return voltageSourceLine(component, pins, behavior.volts, elements)
    case "sine-voltage-source":
      return sineSourceLine(
        component,
        pins,
        behavior.amplitudeVolts,
        behavior.frequencyHertz,
        durationSeconds,
        elements,
      )
    case "bipolar-transistor":
    case "mosfet":
    case "ideal-op-amp":
    case "logic-input":
    case "logic-output":
    case "logic-gate":
    case "inverter":
      return null
  }
}

type ElementPins = {
  pin1: string
  pin2: string
  pin1Label: string
  pin2Label: string
}

function twoTerminalLine(
  prefix: string,
  component: ElectricalComponent,
  pins: ElementPins,
  value: string | number,
  elements: SpiceElementBinding[],
): string {
  const spiceName = spiceElementName(prefix, component.refdes)
  elements.push({
    refdes: component.refdes,
    type: component.type,
    spiceName,
    pin1Label: pins.pin1Label,
    pin2Label: pins.pin2Label,
    n1: pins.pin1,
    n2: pins.pin2,
    currentExpression: currentExpressionForElement(prefix, spiceName),
  })
  return `${spiceName} ${pins.pin1} ${pins.pin2} ${value}`
}

function voltageSourceLine(
  component: ElectricalComponent,
  pins: ElementPins,
  voltage: number,
  elements: SpiceElementBinding[],
): string {
  const spiceName = spiceElementName("V", component.refdes)
  elements.push({
    refdes: component.refdes,
    type: component.type,
    spiceName,
    pin1Label: pins.pin1Label,
    pin2Label: pins.pin2Label,
    n1: pins.pin1,
    n2: pins.pin2,
    currentExpression: `I(${spiceName})`,
  })
  return `${spiceName} ${pins.pin1} ${pins.pin2} DC ${formatSiValue(voltage, "V")}`
}

function currentSourceLine(
  component: ElectricalComponent,
  pins: ElementPins,
  current: number,
  elements: SpiceElementBinding[],
): string {
  const spiceName = spiceElementName("I", component.refdes)
  elements.push({
    refdes: component.refdes,
    type: component.type,
    spiceName,
    pin1Label: pins.pin1Label,
    pin2Label: pins.pin2Label,
    n1: pins.pin1,
    n2: pins.pin2,
    currentExpression: `I(${spiceName})`,
  })
  return `${spiceName} ${pins.pin1} ${pins.pin2} DC ${formatSiValue(current, "A")}`
}

function sineSourceLine(
  component: ElectricalComponent,
  pins: ElementPins,
  amplitude: number,
  frequency: number,
  durationSeconds: number,
  elements: SpiceElementBinding[],
): string {
  const spiceName = spiceElementName("V", component.refdes)
  const points: string[] = []
  for (let index = 0; index <= 64; index += 1) {
    const time = (durationSeconds / 64) * index
    const voltage = amplitude * Math.sin(2 * Math.PI * frequency * time)
    points.push(formatSpiceNumber(time), formatSpiceNumber(voltage))
  }
  elements.push({
    refdes: component.refdes,
    type: component.type,
    spiceName,
    pin1Label: pins.pin1Label,
    pin2Label: pins.pin2Label,
    n1: pins.pin1,
    n2: pins.pin2,
    currentExpression: `I(${spiceName})`,
  })
  return `${spiceName} ${pins.pin1} ${pins.pin2} PWL(${points.join(" ")})`
}

function signalBindingsForRun(
  printNodes: string[],
  nodeNameByNetName: ReadonlyMap<string, string>,
  elements: SpiceElementBinding[],
): SpiceSignalBinding[] {
  const voltageBindings = printNodes.flatMap((nodeName) => {
    const netName = [...nodeNameByNetName].find(
      ([, candidate]) => candidate === nodeName,
    )?.[0]
    return netName
      ? [{
          expression: `V(${nodeName})`,
          signalName: `V(${netName})`,
          unit: "V" as const,
          negate: false,
        }]
      : []
  })
  const currentBindings = elements.flatMap((element) =>
    element.currentExpression
      ? [
          {
            expression: element.currentExpression,
            signalName: `I(${element.refdes}.${element.pin1Label})`,
            unit: "A" as const,
            negate: false,
          },
          {
            expression: element.currentExpression,
            signalName: `I(${element.refdes}.${element.pin2Label})`,
            unit: "A" as const,
            negate: true,
          },
        ]
      : [],
  )
  return [...voltageBindings, ...currentBindings]
}

function currentExpressionForElement(prefix: string, spiceName: string): string {
  return prefix.toUpperCase() === "D"
    ? `@${spiceName.toLowerCase()}[id]`
    : `@${spiceName.toLowerCase()}[i]`
}

function nodeForTerminal(
  component: ElectricalComponent,
  terminal: ElectricalTerminal,
  nodeNameByNetName: ReadonlyMap<string, string>,
  notes: string[],
  diagnostics: SpiceNetlistBuild["diagnostics"],
): string {
  if (terminal.net !== null) {
    return nodeNameByNetName.get(terminal.net) ?? sanitizeNodeName(terminal.net)
  }
  const floatingNode = `NC_${sanitizeNodeName(component.refdes)}_${terminal.key.toUpperCase()}`
  const pin = `${component.refdes}.${terminal.label}`
  const message = `${pin} is floating in the SPICE export.`
  diagnostics.floatingPins.push(pin)
  diagnostics.warnings.push(message)
  notes.push(message)
  return floatingNode
}

function buildNodeNames(nets: ReadonlyArray<ElectricalNet>): ReadonlyMap<string, string> {
  const used = new Set(["0"])
  const names = new Map<string, string>()
  for (const net of nets) {
    if (net.name === "GND") {
      names.set(net.name, "0")
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
    names.set(net.name, candidate)
  }
  return names
}

function spiceElementName(prefix: string, refdes: string): string {
  const safe = refdes.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase()
  return safe.startsWith(prefix.toUpperCase()) ? safe : `${prefix}${safe}`
}

function sanitizeNodeName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase()
  if (!sanitized || sanitized === "0") return "N_UNNAMED"
  return /^[A-Z_]/.test(sanitized) ? sanitized : `N_${sanitized}`
}

function sanitizeModelName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase()
  if (!sanitized) return "DDEFAULT"
  return /^[A-Z_]/.test(sanitized) ? sanitized : `M_${sanitized}`
}

function formatSpiceNumber(value: number): string {
  return Math.abs(value) < 1e-15 ? "0" : Number(value.toPrecision(8)).toString()
}
