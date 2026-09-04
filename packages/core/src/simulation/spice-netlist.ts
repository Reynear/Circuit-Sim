import {
  isSpiceUnsupported,
  type ElectricalCircuit,
  type ElectricalComponent,
  type ElectricalNet,
  type ElectricalTerminal,
} from "../circuit/electrical-circuit"
import { diodeModelParameters } from "../circuit/components"
import type { TransientAnalysis } from "../circuit/project"
import { formatSiValue } from "../circuit/values"
import type { NodeNetName } from "./signals"

export type SpiceElementBinding = {
  refdes: string
  type: ElectricalComponent["type"]
  spiceName: string
  terminals: ReadonlyArray<{
    label: string
    node: string
    currentExpression?: string
    constantCurrent?: number
    negate: boolean
  }>
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
      timeStepSeconds,
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
    lines.push(".model DLED_GREEN D(Is=1e-24 N=2)")
    lines.push(".model DLED_BLUE D(Is=1e-30 N=2)")
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
  timeStepSeconds,
  elements,
  notes,
  diagnostics,
  modelLines,
}: {
  component: ElectricalComponent
  nodeNameByNetName: ReadonlyMap<string, string>
  durationSeconds: number
  timeStepSeconds: number
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

  if (behavior.kind === "bipolar-transistor") {
    return bipolarTransistorLine(
      component,
      nodeNameByNetName,
      behavior,
      elements,
      notes,
      diagnostics,
      modelLines,
    )
  }
  if (behavior.kind === "mosfet") {
    return mosfetLine(
      component,
      nodeNameByNetName,
      behavior,
      elements,
      notes,
      diagnostics,
      modelLines,
    )
  }
  if (behavior.kind === "ideal-op-amp") {
    return idealOpAmpLine(
      component,
      nodeNameByNetName,
      behavior,
      elements,
      notes,
      diagnostics,
    )
  }
  if (behavior.kind === "dc-power-rail") {
    return dcPowerRailLine(
      component,
      nodeNameByNetName,
      behavior.volts,
      elements,
      notes,
      diagnostics,
    )
  }
  if (
    behavior.kind === "logic-input" ||
    behavior.kind === "logic-output" ||
    behavior.kind === "logic-gate" ||
    behavior.kind === "inverter"
  ) {
    return logicLine(
      component,
      nodeNameByNetName,
      behavior,
      elements,
      notes,
      diagnostics,
    )
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
        formatSpiceValue(behavior.ohms),
        elements,
      )
    case "capacitor":
      return twoTerminalLine(
        "C",
        component,
        pins,
        formatSpiceValue(behavior.farads, "F"),
        elements,
      )
    case "inductor":
      return twoTerminalLine(
        "L",
        component,
        pins,
        formatSpiceValue(behavior.henries, "H"),
        elements,
      )
    case "diode": {
      const requestedModelName = sanitizeModelName(behavior.model)
      const canonicalModelName =
        requestedModelName === "D" ? "DDEFAULT" : requestedModelName
      const sharedModelNames = new Set([
        "DDEFAULT",
        "DLED",
        "DLED_GREEN",
        "DLED_BLUE",
      ])
      const defaultParameters = diodeModelParameters(canonicalModelName)
      const usesDefaultParameters =
        behavior.saturationCurrentAmps ===
          defaultParameters.saturationCurrentAmps &&
        behavior.emissionCoefficient ===
          defaultParameters.emissionCoefficient &&
        behavior.seriesResistanceOhms ===
          defaultParameters.seriesResistanceOhms
      const modelName =
        sharedModelNames.has(canonicalModelName) && usesDefaultParameters
          ? canonicalModelName
          : `${canonicalModelName}_${sanitizeModelName(component.refdes)}`
      if (modelName !== canonicalModelName || !sharedModelNames.has(modelName)) {
        modelLines.add(
          `.model ${modelName} D(Is=${formatSpiceNumber(behavior.saturationCurrentAmps)} N=${formatSpiceNumber(behavior.emissionCoefficient)} Rs=${formatSpiceNumber(behavior.seriesResistanceOhms)})`,
        )
      }
      return twoTerminalLine("D", component, pins, modelName, elements)
    }
    case "zener-diode": {
      const modelName = `ZMODEL_${sanitizeModelName(component.refdes)}`
      modelLines.add(
        `.model ${modelName} D(Is=${formatSpiceNumber(behavior.saturationCurrentAmps)} N=${formatSpiceNumber(behavior.emissionCoefficient)} Bv=${formatSpiceNumber(behavior.breakdownVolts)} Ibv=${formatSpiceNumber(behavior.breakdownCurrentAmps)} Rs=${formatSpiceNumber(behavior.dynamicResistanceOhms)})`,
      )
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
        timeStepSeconds,
        elements,
        notes,
      )
    case "pulse-voltage-source":
      return pulseSourceLine(component, pins, behavior, elements)
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
  const currentExpression = currentExpressionForElement(prefix, spiceName)
  elements.push({
    refdes: component.refdes,
    type: component.type,
    spiceName,
    terminals: [
      {
        label: pins.pin1Label,
        node: pins.pin1,
        currentExpression,
        negate: false,
      },
      {
        label: pins.pin2Label,
        node: pins.pin2,
        currentExpression,
        negate: true,
      },
    ],
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
    terminals: sourceTerminalBindings(pins, `I(${spiceName})`),
  })
  return `${spiceName} ${pins.pin1} ${pins.pin2} DC ${formatSpiceValue(voltage, "V")}`
}

function dcPowerRailLine(
  component: ElectricalComponent,
  nodeNameByNetName: ReadonlyMap<string, string>,
  voltage: number,
  elements: SpiceElementBinding[],
  notes: string[],
  diagnostics: SpiceNetlistBuild["diagnostics"],
): string | null {
  const rail = component.terminals.find((terminal) => terminal.key === "rail")
  if (!rail) {
    diagnostics.errors.push(`${component.refdes} requires a rail SPICE terminal.`)
    return null
  }
  const node = nodeForTerminal(
    component,
    rail,
    nodeNameByNetName,
    notes,
    diagnostics,
  )
  const spiceName = spiceElementName("V", component.refdes)
  elements.push({
    refdes: component.refdes,
    type: component.type,
    spiceName,
    terminals: [{
      label: rail.label,
      node,
      currentExpression: `I(${spiceName})`,
      negate: false,
    }],
  })
  return `${spiceName} ${node} 0 DC ${formatSpiceValue(voltage, "V")}`
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
    terminals: [
      {
        label: pins.pin1Label,
        node: pins.pin1,
        constantCurrent: current,
        negate: false,
      },
      {
        label: pins.pin2Label,
        node: pins.pin2,
        constantCurrent: current,
        negate: true,
      },
    ],
  })
  return `${spiceName} ${pins.pin1} ${pins.pin2} DC ${formatSpiceValue(current, "A")}`
}

function sineSourceLine(
  component: ElectricalComponent,
  pins: ElementPins,
  amplitude: number,
  frequency: number,
  durationSeconds: number,
  timeStepSeconds: number,
  elements: SpiceElementBinding[],
  notes: string[],
): string {
  const spiceName = spiceElementName("V", component.refdes)
  const points: string[] = []
  const minimumSegments = 64
  const maximumSegments = 4_096
  const segmentsForSolverStep = Math.ceil(durationSeconds / timeStepSeconds)
  const segmentsForWaveform = Math.ceil(durationSeconds * frequency * 32)
  const requestedSegments = Math.max(
    minimumSegments,
    segmentsForSolverStep,
    segmentsForWaveform,
  )
  const segments = Math.min(maximumSegments, requestedSegments)
  if (segments < requestedSegments) {
    notes.push(
      `${component.refdes} sine PWL approximation was capped at ${maximumSegments} segments.`,
    )
  }
  for (let index = 0; index <= segments; index += 1) {
    const time = (durationSeconds / segments) * index
    const voltage = amplitude * Math.sin(2 * Math.PI * frequency * time)
    points.push(formatSpiceNumber(time), formatSpiceNumber(voltage))
  }
  elements.push({
    refdes: component.refdes,
    type: component.type,
    spiceName,
    terminals: sourceTerminalBindings(pins, `I(${spiceName})`),
  })
  return `${spiceName} ${pins.pin1} ${pins.pin2} PWL(${points.join(" ")})`
}

function pulseSourceLine(
  component: ElectricalComponent,
  pins: ElementPins,
  behavior: Extract<ElectricalComponent["behavior"], { kind: "pulse-voltage-source" }>,
  elements: SpiceElementBinding[],
): string {
  const spiceName = spiceElementName("V", component.refdes)
  const periodSeconds = 1 / behavior.frequencyHertz
  const pulseWidthSeconds =
    periodSeconds * behavior.dutyCyclePercent / 100
  elements.push({
    refdes: component.refdes,
    type: component.type,
    spiceName,
    terminals: sourceTerminalBindings(pins, `I(${spiceName})`),
  })
  return `${spiceName} ${pins.pin1} ${pins.pin2} PULSE(${[
    behavior.initialVolts,
    behavior.pulsedVolts,
    behavior.delaySeconds,
    behavior.riseTimeSeconds,
    behavior.fallTimeSeconds,
    pulseWidthSeconds,
    periodSeconds,
  ].map(formatSpiceNumber).join(" ")})`
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
    element.terminals.flatMap((terminal) =>
      terminal.currentExpression
        ? [{
            expression: terminal.currentExpression,
            signalName: `I(${element.refdes}.${terminal.label})`,
            unit: "A" as const,
            negate: terminal.negate,
          }]
        : [],
    ),
  )
  return [...voltageBindings, ...currentBindings]
}

function sourceTerminalBindings(
  pins: ElementPins,
  currentExpression: string,
): SpiceElementBinding["terminals"] {
  return [
    {
      label: pins.pin1Label,
      node: pins.pin1,
      currentExpression,
      negate: false,
    },
    {
      label: pins.pin2Label,
      node: pins.pin2,
      currentExpression,
      negate: true,
    },
  ]
}

function bipolarTransistorLine(
  component: ElectricalComponent,
  nodeNameByNetName: ReadonlyMap<string, string>,
  behavior: Extract<ElectricalComponent["behavior"], { kind: "bipolar-transistor" }>,
  elements: SpiceElementBinding[],
  notes: string[],
  diagnostics: SpiceNetlistBuild["diagnostics"],
  modelLines: Set<string>,
): string | null {
  const terminal = (key: "base" | "collector" | "emitter") =>
    component.terminals.find((candidate) => candidate.key === key)
  const base = terminal("base")
  const collector = terminal("collector")
  const emitter = terminal("emitter")
  if (!base || !collector || !emitter) {
    diagnostics.errors.push(
      `${component.refdes} requires base, collector, and emitter SPICE terminals.`,
    )
    return null
  }

  const spiceName = spiceElementName("Q", component.refdes)
  const modelName = `QMODEL_${sanitizeModelName(component.refdes)}`
  const nodes = {
    base: nodeForTerminal(component, base, nodeNameByNetName, notes, diagnostics),
    collector: nodeForTerminal(
      component,
      collector,
      nodeNameByNetName,
      notes,
      diagnostics,
    ),
    emitter: nodeForTerminal(
      component,
      emitter,
      nodeNameByNetName,
      notes,
      diagnostics,
    ),
  }
  modelLines.add(
    `.model ${modelName} ${behavior.polarity.toUpperCase()}(Is=${formatSpiceNumber(behavior.saturationCurrentAmps)} Nf=${formatSpiceNumber(behavior.forwardEmissionCoefficient)} Bf=${formatSpiceNumber(behavior.beta)} Vaf=${formatSpiceNumber(behavior.earlyVoltageVolts)})`,
  )
  elements.push({
    refdes: component.refdes,
    type: component.type,
    spiceName,
    terminals: [
      {
        label: collector.label,
        node: nodes.collector,
        currentExpression: `@${spiceName.toLowerCase()}[ic]`,
        negate: false,
      },
      {
        label: base.label,
        node: nodes.base,
        currentExpression: `@${spiceName.toLowerCase()}[ib]`,
        negate: false,
      },
      {
        label: emitter.label,
        node: nodes.emitter,
        currentExpression: `@${spiceName.toLowerCase()}[ie]`,
        negate: false,
      },
    ],
  })
  return `${spiceName} ${nodes.collector} ${nodes.base} ${nodes.emitter} ${modelName}`
}

function mosfetLine(
  component: ElectricalComponent,
  nodeNameByNetName: ReadonlyMap<string, string>,
  behavior: Extract<ElectricalComponent["behavior"], { kind: "mosfet" }>,
  elements: SpiceElementBinding[],
  notes: string[],
  diagnostics: SpiceNetlistBuild["diagnostics"],
  modelLines: Set<string>,
): string | null {
  const terminal = (key: "gate" | "drain" | "source") =>
    component.terminals.find((candidate) => candidate.key === key)
  const gate = terminal("gate")
  const drain = terminal("drain")
  const source = terminal("source")
  if (!gate || !drain || !source) {
    diagnostics.errors.push(
      `${component.refdes} requires gate, drain, and source SPICE terminals.`,
    )
    return null
  }

  const spiceName = spiceElementName("M", component.refdes)
  const modelName = `MMODEL_${sanitizeModelName(component.refdes)}`
  const nodes = {
    gate: nodeForTerminal(component, gate, nodeNameByNetName, notes, diagnostics),
    drain: nodeForTerminal(component, drain, nodeNameByNetName, notes, diagnostics),
    source: nodeForTerminal(component, source, nodeNameByNetName, notes, diagnostics),
  }
  modelLines.add(
    `.model ${modelName} ${behavior.polarity === "n" ? "NMOS" : "PMOS"}(Level=1 Vto=${formatSpiceNumber(behavior.thresholdVolts)} Kp=${formatSpiceNumber(behavior.transconductanceAmpsPerVoltSquared)} Lambda=${formatSpiceNumber(behavior.channelLengthModulationPerVolt)})`,
  )
  elements.push({
    refdes: component.refdes,
    type: component.type,
    spiceName,
    terminals: [
      {
        label: drain.label,
        node: nodes.drain,
        currentExpression: `@${spiceName.toLowerCase()}[id]`,
        negate: behavior.polarity === "p",
      },
      {
        label: gate.label,
        node: nodes.gate,
        currentExpression: `@${spiceName.toLowerCase()}[ig]`,
        negate: behavior.polarity === "p",
      },
      {
        label: source.label,
        node: nodes.source,
        currentExpression: `@${spiceName.toLowerCase()}[is]`,
        negate: behavior.polarity === "p",
      },
    ],
  })
  return `${spiceName} ${nodes.drain} ${nodes.gate} ${nodes.source} ${nodes.source} ${modelName}`
}

function idealOpAmpLine(
  component: ElectricalComponent,
  nodeNameByNetName: ReadonlyMap<string, string>,
  behavior: Extract<ElectricalComponent["behavior"], { kind: "ideal-op-amp" }>,
  elements: SpiceElementBinding[],
  notes: string[],
  diagnostics: SpiceNetlistBuild["diagnostics"],
): string | null {
  const terminal = (
    key: "inverting" | "nonInverting" | "output" | "vPlus" | "vMinus",
  ) => component.terminals.find((candidate) => candidate.key === key)
  const inverting = terminal("inverting")
  const nonInverting = terminal("nonInverting")
  const output = terminal("output")
  const vPlus = terminal("vPlus")
  const vMinus = terminal("vMinus")
  if (!inverting || !nonInverting || !output || !vPlus || !vMinus) {
    diagnostics.errors.push(
      `${component.refdes} requires two inputs, an output, and two supply terminals.`,
    )
    return null
  }

  const node = (value: ElectricalTerminal) =>
    nodeForTerminal(component, value, nodeNameByNetName, notes, diagnostics)
  const nodes = {
    inverting: node(inverting),
    nonInverting: node(nonInverting),
    output: node(output),
    vPlus: node(vPlus),
    vMinus: node(vMinus),
  }
  const spiceName = spiceElementName("B", component.refdes)
  elements.push({
    refdes: component.refdes,
    type: component.type,
    spiceName,
    terminals: [{
      label: output.label,
      node: nodes.output,
      currentExpression: `I(${spiceName})`,
      negate: false,
    }],
  })
  const rawOutput = `${formatSpiceNumber(behavior.gain)}*(V(${nodes.nonInverting})-V(${nodes.inverting}))`
  const lowerLimit = `max(V(${nodes.vMinus}),${formatSpiceNumber(behavior.minOutputVolts)})`
  const upperLimit = `min(V(${nodes.vPlus}),${formatSpiceNumber(behavior.maxOutputVolts)})`
  return `${spiceName} ${nodes.output} 0 V=max(${lowerLimit},min(${upperLimit},${rawOutput}))`
}

function logicLine(
  component: ElectricalComponent,
  nodeNameByNetName: ReadonlyMap<string, string>,
  behavior: Extract<
    ElectricalComponent["behavior"],
    { kind: "logic-input" | "logic-output" | "logic-gate" | "inverter" }
  >,
  elements: SpiceElementBinding[],
  notes: string[],
  diagnostics: SpiceNetlistBuild["diagnostics"],
): string | null {
  const terminal = (key: string) =>
    component.terminals.find((candidate) => candidate.key === key)
  const resolvedTerminal = (key: string) => {
    const value = terminal(key)
    if (!value) {
      diagnostics.errors.push(`${component.refdes} requires a ${key} logic terminal.`)
      return null
    }
    return {
      terminal: value,
      node: nodeForTerminal(
        component,
        value,
        nodeNameByNetName,
        notes,
        diagnostics,
      ),
    }
  }

  switch (behavior.kind) {
    case "logic-input": {
      const output = resolvedTerminal("output")
      const reference = resolvedTerminal("reference")
      if (!output || !reference) return null
      const volts =
        behavior.position === 0
          ? behavior.lowVolts
          : behavior.position === 1
            ? behavior.highVolts
            : (behavior.lowVolts + behavior.highVolts) / 2
      return referencedSourceLine({
        prefix: "V",
        component,
        positive: output,
        negative: reference,
        value: `DC ${formatSpiceValue(volts, "V")}`,
        elements,
      })
    }
    case "logic-output": {
      const input = resolvedTerminal("input")
      const reference = resolvedTerminal("reference")
      if (!input || !reference) return null
      notes.push(
        `${component.refdes} logic load draws ${formatSiValue(behavior.requiredAmps, "A")} from its input net.`,
      )
      return referencedSourceLine({
        prefix: "I",
        component,
        positive: input,
        negative: reference,
        value: `DC ${formatSpiceValue(behavior.requiredAmps, "A")}`,
        constantCurrent: behavior.requiredAmps,
        elements,
      })
    }
    case "logic-gate": {
      const a = resolvedTerminal("a")
      const b = resolvedTerminal("b")
      const output = resolvedTerminal("output")
      const reference = resolvedTerminal("reference")
      if (!a || !b || !output || !reference) return null
      const inputLevel = behavior.operation === "and"
        ? `min(V(${a.node},${reference.node}),V(${b.node},${reference.node}))`
        : `max(V(${a.node},${reference.node}),V(${b.node},${reference.node}))`
      notes.push(
        `${component.refdes} uses an ideal zero-delay ${behavior.operation.toUpperCase()} threshold at ${formatSiValue(behavior.highVolts / 2, "V")}.`,
      )
      return behavioralOutputLine(
        component,
        output,
        reference,
        `${inputLevel} > ${formatSpiceNumber(behavior.highVolts / 2)} ? ${formatSpiceNumber(behavior.highVolts)} : 0`,
        elements,
      )
    }
    case "inverter": {
      const input = resolvedTerminal("input")
      const output = resolvedTerminal("output")
      const reference = resolvedTerminal("reference")
      if (!input || !output || !reference) return null
      notes.push(
        `${component.refdes} uses an ideal zero-delay inverter threshold at ${formatSiValue(behavior.highVolts / 2, "V")}.`,
      )
      return behavioralOutputLine(
        component,
        output,
        reference,
        `V(${input.node},${reference.node}) > ${formatSpiceNumber(behavior.highVolts / 2)} ? 0 : ${formatSpiceNumber(behavior.highVolts)}`,
        elements,
      )
    }
  }
}

type ResolvedLogicTerminal = {
  terminal: ElectricalTerminal
  node: string
}

function referencedSourceLine({
  prefix,
  component,
  positive,
  negative,
  value,
  constantCurrent,
  elements,
}: {
  prefix: "V" | "I"
  component: ElectricalComponent
  positive: ResolvedLogicTerminal
  negative: ResolvedLogicTerminal
  value: string
  constantCurrent?: number
  elements: SpiceElementBinding[]
}): string {
  const spiceName = spiceElementName(prefix, component.refdes)
  elements.push({
    refdes: component.refdes,
    type: component.type,
    spiceName,
    terminals: [
      {
        label: positive.terminal.label,
        node: positive.node,
        ...(constantCurrent === undefined
          ? { currentExpression: `I(${spiceName})` }
          : { constantCurrent }),
        negate: false,
      },
      {
        label: negative.terminal.label,
        node: negative.node,
        ...(constantCurrent === undefined
          ? { currentExpression: `I(${spiceName})` }
          : { constantCurrent }),
        negate: true,
      },
    ],
  })
  return `${spiceName} ${positive.node} ${negative.node} ${value}`
}

function behavioralOutputLine(
  component: ElectricalComponent,
  output: ResolvedLogicTerminal,
  reference: ResolvedLogicTerminal,
  expression: string,
  elements: SpiceElementBinding[],
): string {
  const spiceName = spiceElementName("B", component.refdes)
  elements.push({
    refdes: component.refdes,
    type: component.type,
    spiceName,
    terminals: [
      {
        label: output.terminal.label,
        node: output.node,
        currentExpression: `I(${spiceName})`,
        negate: false,
      },
      {
        label: reference.terminal.label,
        node: reference.node,
        currentExpression: `I(${spiceName})`,
        negate: true,
      },
    ],
  })
  return `${spiceName} ${output.node} ${reference.node} V=${expression}`
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

/** ngspice treats a bare `M` suffix as milli; mega must be written `Meg`. */
function formatSpiceValue(value: number, unit = ""): string {
  const rendered = formatSiValue(value, unit)
  const absolute = Math.abs(value)
  return absolute >= 1e6 && absolute < 1e9
    ? rendered.replace(`M${unit}`, `Meg${unit}`)
    : rendered
}

function formatSpiceNumber(value: number): string {
  return Math.abs(value) < 1e-15 ? "0" : Number(value.toPrecision(8)).toString()
}
