import type { ElectricalBehavior } from "@circuit-sim/core/circuit/electrical-circuit"
import type { AgentElectricalComponent } from "@circuit-sim/core/agent/electrical-graph"
import {
  diodeModelParameters,
  ledModelForColor,
} from "@circuit-sim/core/circuit/components"
import type {
  BenchmarkCheck,
  CircuitBenchmarkCase,
  ApproximateValue,
} from "./schema"
import type {
  ProjectInspectionPayload,
  SimulationEvidencePayload,
  TracePayload,
} from "./mcp-payloads"
import { timeWeightedAverage } from "./trace-statistics"

export interface CircuitMatch {
  readonly netNames: Readonly<Record<string, string>>
  readonly refdes: Readonly<Record<string, string>>
  readonly orientation: Readonly<Record<string, 1 | -1>>
  readonly terminalKeys: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >
}

export function scoreInspection(
  benchmark: CircuitBenchmarkCase,
  inspection: ProjectInspectionPayload,
): BenchmarkCheck[] {
  const checks: BenchmarkCheck[] = []
  checks.push(
    exact(
      "analysis",
      benchmark.graph.analysis,
      inspection.analysis,
      "Saved transient analysis matches the command",
    ),
  )

  const expectedComponents = [...benchmark.graph.components]
    .map((component) => ({
      refdes: component.refdes,
      type: component.type,
      behavior: expectedBehavior(component),
      terminals: benchmark.graph.nets
        .flatMap((net) =>
          net.terminals
            .filter((terminal) => terminal.refdes === component.refdes)
            .map((terminal) => ({
              key: terminal.pin,
              net: canonicalBenchmarkNetName(benchmark, net.name),
            })),
        )
        .sort((a, b) => a.key.localeCompare(b.key)),
    }))
    .sort((a, b) => a.refdes.localeCompare(b.refdes))
  const actualComponents = inspection.circuit.components.map((component) => ({
    refdes: component.refdes,
    type: component.type,
    behavior: component.behavior,
    terminals: component.terminals
      .filter((terminal) => terminal.net !== null)
      .map((terminal) => ({ key: terminal.key, net: terminal.net }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  }))
  checks.push(
    exact(
      "topology.components",
      expectedComponents,
      actualComponents,
      "Canonical component behavior and terminal connectivity match",
    ),
  )

  const expectedNetNames = benchmark.graph.nets
    .map((net) => canonicalBenchmarkNetName(benchmark, net.name))
    .sort((a, b) => a.localeCompare(b))
  const actualNetNames = inspection.circuit.nets
    .map((net) => net.name)
    .sort((a, b) => a.localeCompare(b))
  checks.push(
    exact(
      "topology.nets",
      expectedNetNames,
      actualNetNames,
      "Canonical net names match",
    ),
  )
  checks.push(
    inspection.erc.length === 0
      ? pass("erc", "ERC returned no issues")
      : fail("erc", "ERC returned unexpected issues", [], inspection.erc),
  )
  return checks
}

/**
 * Model prompts specify electrical intent, not arbitrary internal names or
 * terminal orientation for symmetric two-terminal parts. Match the canonical
 * electrical graphs up to those harmless choices while preserving names that
 * the prompt explicitly required.
 */
export function scoreModelInspection(
  benchmark: CircuitBenchmarkCase,
  inspection: ProjectInspectionPayload,
): { readonly checks: BenchmarkCheck[]; readonly match?: CircuitMatch } {
  const electricalMatch = findCircuitMatch(benchmark, inspection, [])
  const requiredNameMatch = findCircuitMatch(
    benchmark,
    inspection,
    benchmark.expected.requiredNetNames,
  )
  const hasDynamicEvidence =
    benchmark.expected.traces.length > 0 ||
    benchmark.expected.traceRanges.length > 0
  const maximumTimeStepMs = modelMaximumTimeStepMs(benchmark)
  const analysisCompatible =
    !hasDynamicEvidence ||
    (inspection.analysis.durationMs >= benchmark.graph.analysis.durationMs &&
      inspection.analysis.timeStepMs <= maximumTimeStepMs)
  const checks: BenchmarkCheck[] = [
    analysisCompatible
      ? pass(
          "analysis",
          hasDynamicEvidence
            ? "Saved transient analysis is long and fine enough for the requested waveform"
            : "Saved transient analysis is valid for the static behavior",
        )
      : fail(
          "analysis",
          "Saved transient analysis is too short or coarse for the requested waveform",
          {
            minimumDurationMs: benchmark.graph.analysis.durationMs,
            maximumTimeStepMs,
          },
          inspection.analysis,
        ),
    electricalMatch
      ? pass(
          "topology.electrical",
          "Canonical electrical behavior and connectivity are equivalent",
        )
      : fail(
          "topology.electrical",
          "Canonical electrical behavior and connectivity are not equivalent",
          benchmark.graph,
          inspection.circuit,
        ),
    requiredNameMatch
      ? pass(
          "topology.required-nets",
          "Net names explicitly required by the prompt are preserved",
        )
      : fail(
          "topology.required-nets",
          "A net name explicitly required by the prompt is absent or misconnected",
          benchmark.expected.requiredNetNames,
          inspection.circuit.nets.map((net) => net.name),
        ),
    inspection.erc.length === 0
      ? pass("erc", "ERC returned no issues")
      : fail("erc", "ERC returned unexpected issues", [], inspection.erc),
  ]
  return {
    checks,
    ...(requiredNameMatch === undefined
      ? electricalMatch === undefined
        ? {}
        : { match: electricalMatch }
      : { match: requiredNameMatch }),
  }
}

export function modelMaximumTimeStepMs(benchmark: CircuitBenchmarkCase): number {
  const fastestSourceHertz = benchmark.graph.components.reduce(
    (fastest, component) =>
      component.type === "sine-voltage-source" ||
        component.type === "pulse-voltage-source"
        ? Math.max(fastest, component.props.frequencyHertz)
        : fastest,
    0,
  )
  return fastestSourceHertz === 0
    ? benchmark.graph.analysis.timeStepMs
    : 1_000 / (fastestSourceHertz * 32)
}

export function scoreSimulation(
  benchmark: CircuitBenchmarkCase,
  inspection: ProjectInspectionPayload,
  evidence: SimulationEvidencePayload,
  traces: ReadonlyArray<TracePayload>,
  match?: CircuitMatch,
): BenchmarkCheck[] {
  const checks: BenchmarkCheck[] = [
    includes(
      "simulation.status",
      benchmark.expected.statuses,
      evidence.run.status,
      "Simulation status is allowed",
    ),
    exact(
      "evidence.project",
      inspection.projectId,
      evidence.run.projectId,
      "Run belongs to the benchmark project",
    ),
    exact(
      "evidence.snapshot",
      inspection.currentSnapshotId,
      evidence.run.projectSnapshotId,
      "Run is linked to the exact project snapshot",
    ),
    exact(
      "evidence.hash",
      inspection.circuitHash,
      evidence.run.circuitHash,
      "Run and project circuit hashes match",
    ),
    evidence.run.stale
      ? fail("evidence.stale", "Fresh simulation evidence was marked stale", false, true)
      : pass("evidence.stale", "Simulation evidence is fresh"),
    evidence.netlist.trim().length > 0
      ? pass("evidence.netlist", "Simulation returned its generated netlist")
      : fail("evidence.netlist", "Simulation returned an empty netlist"),
    evidence.diagnostics.errors.length === 0
      ? pass("diagnostics.errors", "Simulation returned no errors")
      : fail(
          "diagnostics.errors",
          "Simulation returned errors",
          [],
          evidence.diagnostics.errors,
        ),
  ]

  for (const expectation of benchmark.expected.netVoltages) {
    const actualName = match?.netNames[expectation.name] ?? expectation.name
    const actual = evidence.netVoltages.find(
      (candidate) => candidate.name === actualName,
    )?.voltage
    checks.push(
      approximate(
        `net.${expectation.name}`,
        expectation.expected,
        actual,
        `Final voltage for ${expectation.name}`,
      ),
    )
  }

  for (const expectation of benchmark.expected.componentMeasurements) {
    const actualRefdes = match?.refdes[expectation.refdes] ?? expectation.refdes
    const measurement = evidence.componentMeasurements.find(
      (candidate) => candidate.refdes === actualRefdes,
    )
    const raw = measurement?.[expectation.metric]
    const actual =
      raw === undefined || expectation.metric === "power"
        ? raw
        : raw * (match?.orientation[expectation.refdes] ?? 1)
    checks.push(
      approximate(
        `component.${expectation.refdes}.${expectation.metric}`,
        expectation.expected,
        actual,
        `${expectation.metric} for ${expectation.refdes}`,
      ),
    )
  }

  const diagnosticText = [
    ...evidence.diagnostics.warnings,
    ...evidence.diagnostics.suggestions,
  ].join("\n")
  for (const expected of benchmark.expected.diagnosticIncludes) {
    checks.push(
      diagnosticText.includes(expected)
        ? pass(`diagnostic.${expected}`, `Diagnostic includes ${expected}`)
        : fail(
            `diagnostic.${expected}`,
            `Expected diagnostic fragment was absent: ${expected}`,
            expected,
            diagnosticText,
          ),
    )
  }

  for (const expectation of benchmark.expected.traces) {
    const signalName = mapSignalName(expectation.signalName, match)
    const point = signalPoints(traces, signalName).reduce<
      { readonly t: number; readonly v: number } | undefined
    >((nearest, candidate) =>
      nearest === undefined ||
      Math.abs(candidate.t - expectation.atSeconds) <
        Math.abs(nearest.t - expectation.atSeconds)
        ? candidate
        : nearest,
    undefined)
    checks.push(
      approximate(
        `trace.${expectation.signalName}@${expectation.atSeconds}`,
        expectation.expected,
        point?.v,
        `${expectation.signalName} near ${expectation.atSeconds}s`,
      ),
    )
  }
  for (const expectation of benchmark.expected.traceRanges) {
    const signalName = mapSignalName(expectation.signalName, match)
    const points = signalPoints(traces, signalName)
    const selectedPoints = pointsAfterFraction(
      points,
      expectation.startFraction ?? 0,
    )
    const actual = traceMetric(selectedPoints, expectation.metric)
    const rangeDescription =
      expectation.startFraction === undefined
        ? expectation.signalName
        : `${expectation.signalName} after ${expectation.startFraction * 100}% of the run`
    checks.push(
      approximate(
        `trace.${expectation.signalName}.${expectation.metric}.${expectation.startFraction ?? 0}`,
        expectation.expected,
        actual,
        `${expectation.metric} for ${rangeDescription}`,
      ),
    )
  }
  return checks
}

function findCircuitMatch(
  benchmark: CircuitBenchmarkCase,
  inspection: ProjectInspectionPayload,
  requiredNetNames: ReadonlyArray<string>,
): CircuitMatch | undefined {
  const expectedComponents = benchmark.graph.components.map((component) => ({
    refdes: component.refdes,
    type: component.type,
    behavior: expectedBehavior(component),
    terminals: benchmark.graph.nets.flatMap((net) =>
      net.terminals
        .filter((terminal) => terminal.refdes === component.refdes)
        .map((terminal) => ({
          key: terminal.pin,
          net: canonicalBenchmarkNetName(benchmark, net.name),
        })),
    ),
  }))
  const actualComponents = inspection.circuit.components.map((component) => ({
    refdes: component.refdes,
    type: component.type,
    behavior: component.behavior,
    terminals: component.terminals
      .filter(
        (terminal): terminal is typeof terminal & { readonly net: string } =>
          terminal.net !== null,
      )
      .map((terminal) => ({ key: terminal.key, net: terminal.net })),
  }))
  if (
    expectedComponents.length !== actualComponents.length ||
    benchmark.graph.nets.length !== inspection.circuit.nets.length
  ) {
    return undefined
  }

  const orderedExpected = [...expectedComponents].sort(
    (left, right) =>
      candidateCount(left, actualComponents) -
      candidateCount(right, actualComponents),
  )

  const search = (
    index: number,
    usedRefdes: ReadonlySet<string>,
    netNames: ReadonlyMap<string, string>,
    reverseNetNames: ReadonlyMap<string, string>,
    refdes: ReadonlyMap<string, string>,
    orientation: ReadonlyMap<string, 1 | -1>,
    terminalKeys: ReadonlyMap<string, Readonly<Record<string, string>>>,
  ): CircuitMatch | undefined => {
    if (index === orderedExpected.length) {
      if (
        netNames.size !== benchmark.graph.nets.length ||
        reverseNetNames.size !== inspection.circuit.nets.length ||
        requiredNetNames.some((name) => netNames.get(name) !== name)
      ) {
        return undefined
      }
      return {
        netNames: Object.fromEntries(netNames),
        refdes: Object.fromEntries(refdes),
        orientation: Object.fromEntries(orientation),
        terminalKeys: Object.fromEntries(terminalKeys),
      }
    }

    const expected = orderedExpected[index]
    if (expected === undefined) return undefined
    for (const actual of actualComponents) {
      if (
        usedRefdes.has(actual.refdes) ||
        expected.type !== actual.type ||
        expected.terminals.length !== actual.terminals.length
      ) {
        continue
      }
      for (const pinMapping of componentMappings(
        expected.type,
        expected.behavior,
        actual.behavior,
        expected.terminals,
      )) {
        const nextNetNames = new Map(netNames)
        const nextReverseNetNames = new Map(reverseNetNames)
        let compatible = true
        for (const terminal of expected.terminals) {
          const actualKey = pinMapping.keys[terminal.key]
          const actualTerminal = actual.terminals.find(
            (candidate) => candidate.key === actualKey,
          )
          if (actualTerminal === undefined) {
            compatible = false
            break
          }
          const mapped = nextNetNames.get(terminal.net)
          const reverseMapped = nextReverseNetNames.get(actualTerminal.net)
          if (
            (mapped !== undefined && mapped !== actualTerminal.net) ||
            (reverseMapped !== undefined && reverseMapped !== terminal.net)
          ) {
            compatible = false
            break
          }
          nextNetNames.set(terminal.net, actualTerminal.net)
          nextReverseNetNames.set(actualTerminal.net, terminal.net)
        }
        if (!compatible) continue
        const found = search(
          index + 1,
          new Set([...usedRefdes, actual.refdes]),
          nextNetNames,
          nextReverseNetNames,
          new Map([...refdes, [expected.refdes, actual.refdes]]),
          new Map([
            ...orientation,
            [expected.refdes, pinMapping.orientation] as const,
          ]),
          new Map([
            ...terminalKeys,
            [expected.refdes, pinMapping.keys] as const,
          ]),
        )
        if (found !== undefined) return found
      }
    }
    return undefined
  }

  return search(
    0,
    new Set(),
    new Map(),
    new Map(),
    new Map(),
    new Map(),
    new Map(),
  )
}

function canonicalBenchmarkNetName(
  benchmark: CircuitBenchmarkCase,
  netName: string,
): string {
  return netName === benchmark.graph.groundNet ? "GND" : netName
}

function candidateCount(
  expected: {
    readonly type: string
    readonly behavior: ElectricalBehavior
    readonly terminals: ReadonlyArray<{ readonly key: string }>
  },
  actualComponents: ReadonlyArray<{
    readonly type: string
    readonly behavior: ElectricalBehavior
    readonly terminals: ReadonlyArray<{ readonly key: string }>
  }>,
): number {
  return actualComponents.filter(
    (actual) =>
      expected.type === actual.type &&
      componentMappings(
        expected.type,
        expected.behavior,
        actual.behavior,
        expected.terminals,
      ).length > 0 &&
      expected.terminals.length === actual.terminals.length,
  ).length
}

function componentMappings(
  type: string,
  expectedBehavior: ElectricalBehavior,
  actualBehavior: ElectricalBehavior,
  terminals: ReadonlyArray<{ readonly key: string }>,
): ReadonlyArray<{
  readonly keys: Readonly<Record<string, string>>
  readonly orientation: 1 | -1
}> {
  const identity = Object.fromEntries(
    terminals.map((terminal) => [terminal.key, terminal.key]),
  )
  if (
    sourcePolarityInverted(expectedBehavior, actualBehavior) &&
    terminals.some((terminal) => terminal.key === "positive") &&
    terminals.some((terminal) => terminal.key === "negative")
  ) {
    return [
      {
        keys: { ...identity, positive: "negative", negative: "positive" },
        orientation: -1,
      },
    ]
  }
  if (!behaviorsEquivalent(expectedBehavior, actualBehavior)) return []
  const symmetric =
    type === "resistor" ||
    type === "capacitor" ||
    type === "inductor" ||
    type === "switch"
  return symmetric &&
    terminals.some((terminal) => terminal.key === "a") &&
    terminals.some((terminal) => terminal.key === "b")
    ? [
        { keys: identity, orientation: 1 },
        { keys: { ...identity, a: "b", b: "a" }, orientation: -1 },
      ]
    : [{ keys: identity, orientation: 1 }]
}

/**
 * Model-created values often come from formulas rather than copied literals.
 * Treat numerically indistinguishable values as the same electrical behavior,
 * while keeping categorical properties exact.
 */
export function behaviorsEquivalent(
  expected: ElectricalBehavior,
  actual: ElectricalBehavior,
): boolean {
  if (expected.kind !== actual.kind) return false
  switch (expected.kind) {
    case "resistor":
      return actual.kind === "resistor" && nearlyEqual(expected.ohms, actual.ohms)
    case "capacitor":
      return actual.kind === "capacitor" && nearlyEqual(expected.farads, actual.farads)
    case "inductor":
      return actual.kind === "inductor" && nearlyEqual(expected.henries, actual.henries)
    case "diode":
      return (
        actual.kind === "diode" &&
        canonicalDiodeModel(expected.model) ===
          canonicalDiodeModel(actual.model) &&
        nearlyEqual(
          expected.saturationCurrentAmps,
          actual.saturationCurrentAmps,
        ) &&
        nearlyEqual(
          expected.emissionCoefficient,
          actual.emissionCoefficient,
        ) &&
        nearlyEqual(
          expected.seriesResistanceOhms,
          actual.seriesResistanceOhms,
        )
      )
    case "zener-diode":
      return (
        actual.kind === "zener-diode" &&
        nearlyEqual(expected.breakdownVolts, actual.breakdownVolts) &&
        nearlyEqual(
          expected.breakdownCurrentAmps,
          actual.breakdownCurrentAmps,
        ) &&
        nearlyEqual(
          expected.saturationCurrentAmps,
          actual.saturationCurrentAmps,
        ) &&
        nearlyEqual(
          expected.emissionCoefficient,
          actual.emissionCoefficient,
        ) &&
        nearlyEqual(
          expected.dynamicResistanceOhms,
          actual.dynamicResistanceOhms,
        )
      )
    case "dc-voltage-source":
      return actual.kind === "dc-voltage-source" && nearlyEqual(expected.volts, actual.volts)
    case "dc-power-rail":
      return (
        actual.kind === "dc-power-rail" &&
        expected.referenceNet === actual.referenceNet &&
        nearlyEqual(expected.volts, actual.volts)
      )
    case "sine-voltage-source":
      return (
        actual.kind === "sine-voltage-source" &&
        nearlyEqual(expected.amplitudeVolts, actual.amplitudeVolts) &&
        nearlyEqual(expected.frequencyHertz, actual.frequencyHertz)
      )
    case "pulse-voltage-source":
      return (
        actual.kind === "pulse-voltage-source" &&
        nearlyEqual(expected.initialVolts, actual.initialVolts) &&
        nearlyEqual(expected.pulsedVolts, actual.pulsedVolts) &&
        nearlyEqual(expected.frequencyHertz, actual.frequencyHertz) &&
        nearlyEqual(expected.dutyCyclePercent, actual.dutyCyclePercent) &&
        nearlyEqual(expected.delaySeconds, actual.delaySeconds) &&
        nearlyEqual(expected.riseTimeSeconds, actual.riseTimeSeconds) &&
        nearlyEqual(expected.fallTimeSeconds, actual.fallTimeSeconds)
      )
    case "dc-current-source":
      return actual.kind === "dc-current-source" && nearlyEqual(expected.amps, actual.amps)
    case "switch":
      return actual.kind === "switch" && expected.state === actual.state
    case "bipolar-transistor":
      return (
        actual.kind === "bipolar-transistor" &&
        expected.polarity === actual.polarity &&
        nearlyEqual(expected.beta, actual.beta) &&
        nearlyEqual(expected.earlyVoltageVolts, actual.earlyVoltageVolts) &&
        nearlyEqual(
          expected.saturationCurrentAmps,
          actual.saturationCurrentAmps,
        ) &&
        nearlyEqual(
          expected.forwardEmissionCoefficient,
          actual.forwardEmissionCoefficient,
        )
      )
    case "mosfet":
      return (
        actual.kind === "mosfet" &&
        expected.polarity === actual.polarity &&
        nearlyEqual(expected.thresholdVolts, actual.thresholdVolts) &&
        nearlyEqual(
          expected.transconductanceAmpsPerVoltSquared,
          actual.transconductanceAmpsPerVoltSquared,
        ) &&
        nearlyEqual(
          expected.channelLengthModulationPerVolt,
          actual.channelLengthModulationPerVolt,
        )
      )
    case "ideal-op-amp":
      return (
        actual.kind === "ideal-op-amp" &&
        nearlyEqual(expected.gain, actual.gain) &&
        nearlyEqual(expected.minOutputVolts, actual.minOutputVolts) &&
        nearlyEqual(expected.maxOutputVolts, actual.maxOutputVolts)
      )
    case "logic-input":
      return (
        actual.kind === "logic-input" &&
        expected.position === actual.position &&
        nearlyEqual(expected.highVolts, actual.highVolts) &&
        nearlyEqual(expected.lowVolts, actual.lowVolts)
      )
    case "logic-output":
      return (
        actual.kind === "logic-output" &&
        nearlyEqual(expected.thresholdVolts, actual.thresholdVolts) &&
        nearlyEqual(expected.requiredAmps, actual.requiredAmps)
      )
    case "logic-gate":
      return (
        actual.kind === "logic-gate" &&
        expected.operation === actual.operation &&
        nearlyEqual(expected.inputCount, actual.inputCount) &&
        nearlyEqual(expected.highVolts, actual.highVolts)
      )
    case "inverter":
      return actual.kind === "inverter" && nearlyEqual(expected.highVolts, actual.highVolts)
  }
}

function sourcePolarityInverted(
  expected: ElectricalBehavior,
  actual: ElectricalBehavior,
): boolean {
  switch (expected.kind) {
    case "dc-voltage-source":
      return actual.kind === expected.kind && nearlyEqual(expected.volts, -actual.volts)
    case "sine-voltage-source":
      return (
        actual.kind === expected.kind &&
        nearlyEqual(expected.amplitudeVolts, -actual.amplitudeVolts) &&
        nearlyEqual(expected.frequencyHertz, actual.frequencyHertz)
      )
    case "pulse-voltage-source":
      return (
        actual.kind === expected.kind &&
        nearlyEqual(expected.initialVolts, -actual.initialVolts) &&
        nearlyEqual(expected.pulsedVolts, -actual.pulsedVolts) &&
        nearlyEqual(expected.frequencyHertz, actual.frequencyHertz) &&
        nearlyEqual(expected.dutyCyclePercent, actual.dutyCyclePercent) &&
        nearlyEqual(expected.delaySeconds, actual.delaySeconds) &&
        nearlyEqual(expected.riseTimeSeconds, actual.riseTimeSeconds) &&
        nearlyEqual(expected.fallTimeSeconds, actual.fallTimeSeconds)
      )
    case "dc-current-source":
      return actual.kind === expected.kind && nearlyEqual(expected.amps, -actual.amps)
    default:
      return false
  }
}

function canonicalDiodeModel(model: string): string {
  const canonical = model.toUpperCase()
  return canonical === "D" ? "DDEFAULT" : canonical
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(1e-12, Math.abs(left) * 1e-9)
}

export function mapSignalName(signalName: string, match?: CircuitMatch): string {
  if (match === undefined) return signalName
  const voltage = /^V\((.+)\)$/.exec(signalName)
  if (voltage?.[1] === undefined) return signalName
  return `V(${match.netNames[voltage[1]] ?? voltage[1]})`
}

function signalPoints(
  traces: ReadonlyArray<TracePayload>,
  signalName: string,
): ReadonlyArray<{ readonly t: number; readonly v: number }> {
  return traces.flatMap((trace) =>
    trace.signals
      .filter((signal) => signal.name === signalName)
      .flatMap((signal) => signal.points),
  )
}

function pointsAfterFraction(
  points: ReadonlyArray<{ readonly t: number; readonly v: number }>,
  fraction: number,
): ReadonlyArray<{ readonly t: number; readonly v: number }> {
  const first = points[0]
  const last = points[points.length - 1]
  if (first === undefined || last === undefined) return []
  const startTime = first.t + (last.t - first.t) * fraction
  return points.filter((point) => point.t >= startTime)
}

function traceMetric(
  points: ReadonlyArray<{ readonly t: number; readonly v: number }>,
  metric: "peakToPeak" | "minimum" | "maximum" | "average",
): number | undefined {
  let minimum: number | undefined
  let maximum: number | undefined
  for (const point of points) {
    minimum = minimum === undefined ? point.v : Math.min(minimum, point.v)
    maximum = maximum === undefined ? point.v : Math.max(maximum, point.v)
  }
  switch (metric) {
    case "peakToPeak":
      return minimum === undefined || maximum === undefined
        ? undefined
        : maximum - minimum
    case "minimum":
      return minimum
    case "maximum":
      return maximum
    case "average":
      return timeWeightedAverage(points)
  }
}

export function passed(checks: ReadonlyArray<BenchmarkCheck>): boolean {
  return checks.every((check) => check._tag === "Passed")
}

function expectedBehavior(component: AgentElectricalComponent): ElectricalBehavior {
  switch (component.type) {
    case "resistor":
      return { kind: "resistor", ohms: component.props.resistanceOhms }
    case "capacitor":
      return { kind: "capacitor", farads: component.props.capacitanceFarads }
    case "inductor":
      return { kind: "inductor", henries: component.props.inductanceHenries }
    case "switch":
      return { kind: "switch", state: component.props.state }
    case "dc-voltage-source":
      return { kind: "dc-voltage-source", volts: component.props.voltageVolts }
    case "dc-power-rail":
      return {
        kind: "dc-power-rail",
        volts: component.props.voltageVolts,
        referenceNet: "GND",
      }
    case "sine-voltage-source":
      return {
        kind: "sine-voltage-source",
        amplitudeVolts: component.props.amplitudeVolts,
        frequencyHertz: component.props.frequencyHertz,
      }
    case "pulse-voltage-source":
      return {
        kind: "pulse-voltage-source",
        initialVolts: component.props.initialVoltageVolts,
        pulsedVolts: component.props.pulsedVoltageVolts,
        frequencyHertz: component.props.frequencyHertz,
        dutyCyclePercent: component.props.dutyCyclePercent,
        delaySeconds: component.props.delaySeconds,
        riseTimeSeconds: component.props.riseTimeSeconds,
        fallTimeSeconds: component.props.fallTimeSeconds,
      }
    case "dc-current-source":
      return { kind: "dc-current-source", amps: component.props.currentAmps }
    case "diode":
      return {
        kind: "diode",
        model: component.props.model,
        saturationCurrentAmps: component.props.saturationCurrentAmps,
        emissionCoefficient: component.props.emissionCoefficient,
        seriesResistanceOhms: component.props.seriesResistanceOhms,
      }
    case "zener-diode":
      return {
        kind: "zener-diode",
        breakdownVolts: component.props.breakdownVolts,
        breakdownCurrentAmps: component.props.breakdownCurrentAmps,
        saturationCurrentAmps: component.props.saturationCurrentAmps,
        emissionCoefficient: component.props.emissionCoefficient,
        dynamicResistanceOhms: component.props.dynamicResistanceOhms,
      }
    case "led":
      {
        const model = ledModelForColor(component.props.color)
        return { kind: "diode", model, ...diodeModelParameters(model) }
      }
    case "npn-transistor":
    case "pnp-transistor":
      return {
        kind: "bipolar-transistor",
        polarity: component.type === "npn-transistor" ? "npn" : "pnp",
        beta: component.props.beta,
        earlyVoltageVolts: component.props.earlyVoltageVolts,
        saturationCurrentAmps: component.props.saturationCurrentAmps,
        forwardEmissionCoefficient:
          component.props.forwardEmissionCoefficient,
      }
    case "n-mosfet":
    case "p-mosfet":
      return {
        kind: "mosfet",
        polarity: component.type === "n-mosfet" ? "n" : "p",
        thresholdVolts: component.props.thresholdVolts,
        transconductanceAmpsPerVoltSquared:
          component.props.transconductanceAmpsPerVoltSquared,
        channelLengthModulationPerVolt:
          component.props.channelLengthModulationPerVolt,
      }
    case "ideal-op-amp-minus-top":
      return {
        kind: "ideal-op-amp",
        gain: component.props.gain,
        minOutputVolts: component.props.minOutputVolts,
        maxOutputVolts: component.props.maxOutputVolts,
      }
    case "logic-input":
      return {
        kind: "logic-input",
        position: component.props.position,
        highVolts: component.props.highLogicVoltageVolts,
        lowVolts: component.props.lowLogicVoltageVolts,
      }
    case "logic-output":
      return {
        kind: "logic-output",
        thresholdVolts: component.props.thresholdVolts,
        requiredAmps: component.props.currentRequiredAmps,
      }
    case "and-gate":
    case "or-gate":
      return {
        kind: "logic-gate",
        operation: component.type === "and-gate" ? "and" : "or",
        inputCount: component.props.inputCount,
        highVolts: component.props.highLogicVoltageVolts,
      }
    case "inverter":
      return {
        kind: "inverter",
        highVolts: component.props.highLogicVoltageVolts,
      }
  }
}

function approximate(
  id: string,
  expected: ApproximateValue,
  actual: number | undefined,
  label: string,
): BenchmarkCheck {
  return actual !== undefined &&
    Math.abs(actual - expected.value) <= expected.absoluteTolerance
    ? pass(id, `${label} is within tolerance`)
    : fail(id, `${label} is outside tolerance`, expected, actual)
}

function exact(
  id: string,
  expected: unknown,
  actual: unknown,
  message: string,
): BenchmarkCheck {
  return JSON.stringify(actual) === JSON.stringify(expected)
    ? pass(id, message)
    : fail(id, message, expected, actual)
}

function includes(
  id: string,
  expected: ReadonlyArray<string>,
  actual: string,
  message: string,
): BenchmarkCheck {
  return expected.includes(actual)
    ? pass(id, message)
    : fail(id, message, expected, actual)
}

function pass(id: string, message: string): BenchmarkCheck {
  return { _tag: "Passed", id, message }
}

function fail(
  id: string,
  message: string,
  expected?: unknown,
  actual?: unknown,
): BenchmarkCheck {
  return {
    _tag: "Failed",
    id,
    message,
    ...(expected === undefined ? {} : { expected }),
    ...(actual === undefined ? {} : { actual }),
  }
}
