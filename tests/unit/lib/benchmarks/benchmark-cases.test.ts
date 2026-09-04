import { buildElectricalCircuit } from "@circuit-sim/core/circuit/electrical-circuit"
import { runErc } from "@circuit-sim/core/circuit/erc"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"
import {
  agentComponentSpecs,
  compileAgentElectricalGraph,
} from "@circuit-sim/core/agent/electrical-graph"
import {
  circuitBenchmarkCases,
  frontierBenchmarkCases,
} from "../../../../benchmarks/cases"
import {
  scoreInspection,
  scoreModelInspection,
} from "../../../../benchmarks/scorer"
import { publicModelCase } from "../../../../benchmarks/model-runner"
import type { ProjectInspectionPayload } from "../../../../benchmarks/mcp-payloads"
import { generateSpiceNetlist } from "@circuit-sim/core/simulation/spice-netlist"

function inspectionFor(
  benchmark: (typeof circuitBenchmarkCases)[number],
): ProjectInspectionPayload {
  const project = compileAgentElectricalGraph(
    newCircuitProject(benchmark.title),
    benchmark.graph,
  )
  return {
    projectId: project.id,
    name: project.name,
    version: 2,
    currentSnapshotId: "snapshot",
    circuitHash: "hash",
    browserUrl: "http://127.0.0.1/project",
    analysis: project.analysis,
    circuit: buildElectricalCircuit(project),
    erc: runErc(project),
  }
}

describe("circuit MCP benchmark manifest", () => {
  it("contains ninety-four cases, nine model-smoke cases, and every modeled component", () => {
    expect(circuitBenchmarkCases).toHaveLength(94)
    expect(circuitBenchmarkCases.filter((benchmark) => benchmark.smoke)).toHaveLength(9)

    const covered = new Set(
      circuitBenchmarkCases.flatMap((benchmark) =>
        benchmark.graph.components.map((component) => component.type),
      ),
    )
    expect([...covered].sort()).toEqual(
      agentComponentSpecs.map((component) => component.type).sort(),
    )
  })

  it("compares one through four bias diodes in the textbook complementary Darlington stage", () => {
    const cases = [1, 2, 3, 4].map((diodeCount) =>
      circuitBenchmarkCases.find((benchmark) =>
        benchmark.id === `complementary-darlington-${diodeCount}-diode-bias`,
      )!,
    )

    expect(cases.every(Boolean)).toBe(true)
    expect(cases.map(({ graph }) =>
      graph.components.filter(({ type }) => type === "diode").length,
    )).toEqual([1, 2, 3, 4])
    for (const benchmark of cases) {
      expect(
        benchmark.graph.components.filter(({ type }) =>
          type === "npn-transistor" || type === "pnp-transistor",
        ),
      ).toHaveLength(4)
      expect(benchmark.graph.components.find(({ refdes }) => refdes === "R1")?.props)
        .toMatchObject({ resistanceOhms: 5_100 })
      expect(benchmark.graph.components.find(({ refdes }) => refdes === "R2")?.props)
        .toMatchObject({ resistanceOhms: 5_100 })
      expect(benchmark.graph.components.find(({ refdes }) => refdes === "RL")?.props)
        .toMatchObject({ resistanceOhms: 30 })
      expect(benchmark.graph.components.find(({ refdes }) => refdes === "VPOS")?.props)
        .toMatchObject({ voltageVolts: 15 })
      expect(benchmark.graph.components.find(({ refdes }) => refdes === "VNEG")?.props)
        .toMatchObject({ voltageVolts: 15 })
      expect(benchmark.graph.nets.find(({ name }) => name === "GND")?.terminals)
        .toEqual(expect.arrayContaining([
          { refdes: "VPOS", pin: "negative" },
          { refdes: "VNEG", pin: "positive" },
          { refdes: "VIN", pin: "negative" },
          { refdes: "RL", pin: "b" },
        ]))
      expect(benchmark.expected.traceRanges.map(({ signalName, metric }) =>
        `${signalName}.${metric}`,
      )).toEqual([
        "V(VOUT).minimum",
        "V(VOUT).maximum",
        "V(VOUT).peakToPeak",
      ])
    }

    expect(cases.map(({ expected }) =>
      expected.traceRanges.find(({ metric }) => metric === "peakToPeak")?.expected.value,
    )).toEqual([7.56645, 8.2275, 8.88601, 9.54449])
  })

  it("drives the Darlington split rails through one-pin GND-referenced gates", () => {
    const benchmark = circuitBenchmarkCases.find(
      ({ id }) => id === "complementary-darlington-4-diode-bias-power-rails",
    )
    expect(benchmark).toBeDefined()
    if (!benchmark) return

    const project = compileAgentElectricalGraph(
      newCircuitProject(benchmark.title),
      benchmark.graph,
    )
    const circuit = buildElectricalCircuit(project)
    const netlist = generateSpiceNetlist({
      circuit,
      analysis: project.analysis,
      title: project.name,
    })

    expect(circuit.components.find(({ refdes }) => refdes === "VCC"))
      .toMatchObject({
        type: "dc-power-rail",
        behavior: { kind: "dc-power-rail", volts: 15, referenceNet: "GND" },
        terminals: [{ key: "rail", label: "RAIL", net: "VCC" }],
      })
    expect(circuit.components.find(({ refdes }) => refdes === "VEE"))
      .toMatchObject({
        type: "dc-power-rail",
        behavior: { kind: "dc-power-rail", volts: -15, referenceNet: "GND" },
        terminals: [{ key: "rail", label: "RAIL", net: "VEE" }],
      })
    expect(netlist.netlist).toContain("VCC VCC 0 DC 15V")
    expect(netlist.netlist).toContain("VEE VEE 0 DC -15V")
    expect(netlist.diagnostics.errors).toEqual([])
    expect(runErc(project)).toEqual([])
  })

  it("covers the photographed amplifier assignment and selected R5 setting", () => {
    const assignmentIds = [
      "frontier-image1-class-a-ce-amplifier",
      "frontier-image2-class-b-push-pull",
      "frontier-image2-class-ab-push-pull",
      "frontier-derived-class-c-tuned-amplifier",
      "frontier-derived-class-d-pwm-stage",
      "frontier-image3-r5-zero-offset",
    ]
    expect(
      frontierBenchmarkCases
        .filter(({ id }) => assignmentIds.includes(id))
        .map(({ id }) => id),
    ).toEqual(assignmentIds)

    const classD = frontierBenchmarkCases.find(
      ({ id }) => id === "frontier-derived-class-d-pwm-stage",
    )!
    expect(classD.graph.components.map(({ type }) => type)).toEqual(
      expect.arrayContaining([
        "pulse-voltage-source",
        "p-mosfet",
        "n-mosfet",
        "inductor",
        "capacitor",
      ]),
    )

    const r5 = frontierBenchmarkCases.find(
      ({ id }) => id === "frontier-image3-r5-zero-offset",
    )!
    expect(r5.graph.components.find(({ refdes }) => refdes === "R5")?.props)
      .toEqual({ resistanceOhms: 4_020 })
    expect(
      r5.expected.traceRanges.find(
        ({ signalName, metric }) =>
          signalName === "V(OUTPUT)" && metric === "average",
      )?.expected,
    ).toEqual({ value: 0, absoluteTolerance: 0.002 })

    const compiledPositions = (id: string) => {
      const benchmark = frontierBenchmarkCases.find((candidate) => candidate.id === id)!
      const project = compileAgentElectricalGraph(
        newCircuitProject(benchmark.title),
        benchmark.graph,
      )
      expect(runErc(project)).toEqual([])
      return new Map(
        project.objects
          .filter((object) => object.kind === "component")
          .map((component) => [component.refdes, component.position]),
      )
    }
    const classAPositions = compiledPositions(
      "frontier-image1-class-a-ce-amplifier",
    )
    expect(classAPositions.get("R1")?.x).toBe(classAPositions.get("R2")?.x)
    expect(classAPositions.get("RC")?.x).toBe(classAPositions.get("RE")?.x)
    expect([
      "VIN",
      "CIN",
      "R1",
      "QA",
      "COUT",
      "RL",
    ].map((refdes) => classAPositions.get(refdes)?.x)).toEqual([
      160,
      320,
      480,
      720,
      880,
      1_060,
    ])

    const r5Positions = compiledPositions("frontier-image3-r5-zero-offset")
    expect(["R1", "D1", "D2"].map((refdes) => r5Positions.get(refdes)?.x))
      .toEqual([520, 520, 520])
    expect(["R2", "R5", "R3"].map((refdes) => r5Positions.get(refdes)?.x))
      .toEqual([440, 440, 440])
    expect(r5Positions.get("QDRIVER")?.x)
      .toBeLessThan(r5Positions.get("QUP")!.x)
    expect(r5Positions.get("QUP")?.x).toBeLessThan(r5Positions.get("RL")!.x)

    const classCPositions = compiledPositions(
      "frontier-derived-class-c-tuned-amplifier",
    )
    expect(["CTANK", "LTANK", "RTANK"].map(
      (refdes) => classCPositions.get(refdes)?.y,
    )).toEqual([240, 240, 240])
    expect(classCPositions.get("VIN")?.x).toBe(classCPositions.get("VBIAS")?.x)
    expect(classCPositions.get("RBC")?.x)
      .toBeLessThan(classCPositions.get("QC")!.x)
  })

  it("keeps model scoring truth out of the client-visible case artifact", () => {
    const publicCase = publicModelCase(circuitBenchmarkCases[0]!)

    expect(publicCase).toEqual({
      id: circuitBenchmarkCases[0]!.id,
      title: circuitBenchmarkCases[0]!.title,
      prompt: circuitBenchmarkCases[0]!.prompt,
    })
    expect(JSON.stringify(publicCase)).not.toContain("graph")
    expect(JSON.stringify(publicCase)).not.toContain("expected")
  })

  it("keeps the ordered complexity frontier separate from the release cases", () => {
    expect(frontierBenchmarkCases.map((benchmark) => benchmark.id)).toEqual([
      "frontier-three-tap-ladder",
      "frontier-branched-divider",
      "frontier-parallel-nonlinear-loads",
      "frontier-diode-or",
      "frontier-full-wave-bridge",
      "frontier-filtered-bridge-led",
      "frontier-eight-section-loaded-ladder",
      "frontier-fifteen-section-loaded-ladder",
      "frontier-four-by-five-resistor-mesh",
      "frontier-split-rail-reference",
      "frontier-series-rlc-filter",
      "frontier-current-fed-led",
      "frontier-dual-frequency-mixer",
      "frontier-biased-dual-diode-limiter",
      "frontier-dual-rail-bridge-supply",
      "frontier-parallel-resonant-tank",
      "frontier-ac-coupled-led-clamper",
      "frontier-center-tapped-rectifier",
      "frontier-two-frequency-split-rail-limiter",
      "frontier-reactive-two-frequency-mixer",
      "frontier-asymmetric-dual-rail-bridge",
      "frontier-zener-sine-limiter",
      "frontier-bjt-current-mirror",
      "frontier-complementary-mosfet-regions",
      "frontier-op-amp-output-limits",
      "frontier-cascaded-logic",
      "frontier-zener-bjt-series-regulator",
      "frontier-cascaded-nmos-inverters",
      "frontier-darlington-emitter-follower",
      "frontier-biased-common-emitter-amplifier",
      "frontier-zener-op-amp-buffered-reference",
      "frontier-comparator-bjt-switch",
      "frontier-bjt-differential-pair",
      "frontier-op-amp-weighted-summer",
      "frontier-bridge-load-ripple-comparison",
      "frontier-bjt-current-mirror-compliance",
      "frontier-complementary-emitter-follower",
      "frontier-op-amp-difference-amplifier",
      "frontier-cmos-inverter-transient",
      "frontier-zener-nmos-series-regulator",
      "frontier-bjt-emitter-degeneration-comparison",
      "frontier-op-amp-window-comparator",
      "frontier-buffered-reference-load-comparison",
      "frontier-clipped-common-emitter-transient",
      "frontier-bridge-zener-post-regulator",
      "frontier-op-amp-schmitt-trigger",
      "frontier-bjt-cascode-bias",
      "frontier-voltage-doubler-zener-regulator",
      "frontier-pnp-current-mirror-compliance",
      "frontier-nmos-source-degeneration-transient",
      "frontier-comparator-duty-nmos-switch",
      "frontier-envelope-load-comparison",
      "frontier-comparator-window-logic-pulse",
      "frontier-zener-bjt-current-sink-compliance",
      "frontier-bjt-differential-vs-common-mode",
      "frontier-dual-frequency-op-amp-integrators",
      "frontier-dual-frequency-op-amp-differentiators",
      "frontier-pnp-differential-vs-common-mode",
      "frontier-zener-regulated-led-colors",
      "frontier-complementary-common-emitter-transients",
      "frontier-zener-pnp-current-source-compliance",
      "frontier-zener-series-led-headroom",
      "frontier-ordinary-vs-precision-rectifier",
      "frontier-zener-clamp-load-sweep",
      "frontier-class-b-vs-class-ab-crossover",
      "frontier-dual-gain-transimpedance-amplifiers",
      "frontier-complementary-bjt-phase-splitters",
      "frontier-single-vs-stacked-zener-references",
      "frontier-instrumentation-common-mode-rejection",
      "frontier-bjt-emitter-bypass-comparison",
      "frontier-stacked-zener-midpoint-load-sweep",
      "frontier-logarithmic-amplifier-current-decades",
      "frontier-bjt-partial-emitter-bypass-progression",
      "frontier-zener-ripple-capacitance-sweep",
      "frontier-antilogarithmic-amplifier-input-steps",
      "frontier-ordinary-vs-widlar-current-source",
      "frontier-zener-dynamic-resistance-sweep",
      "frontier-bjt-early-effect-collector-sweep",
      "frontier-zener-dynamic-resistance-load-line-sweep",
      "frontier-log-antilog-recovery-sweep",
      "frontier-pnp-early-voltage-output-resistance-sweep",
      "frontier-bjt-vbe-vce-current-surface",
      "frontier-zener-breakdown-resistance-current-matrix",
      "frontier-pmos-channel-length-modulation-sweep",
      "frontier-nmos-transconductance-overdrive-surface",
      "frontier-nmos-triode-saturation-region-surface",
      "frontier-diode-is-n-current-matrix",
      "frontier-diode-series-resistance-current-sweep",
      "frontier-diode-emission-current-decade-surface",
      "frontier-bjt-is-nf-current-matrix",
      "frontier-complementary-bjt-junction-current-sweep",
      "frontier-bjt-nf-vbe-current-surface",
      "frontier-zener-ibv-current-matrix",
      "frontier-zener-forward-is-n-current-matrix",
      "frontier-zener-bidirectional-parameter-orthogonality",
      "frontier-image1-class-a-ce-amplifier",
      "frontier-image2-class-b-push-pull",
      "frontier-image2-class-ab-push-pull",
      "frontier-derived-class-c-tuned-amplifier",
      "frontier-derived-class-d-pwm-stage",
      "frontier-image3-r5-zero-offset",
    ])
    expect(
      frontierBenchmarkCases.every((benchmark) =>
        benchmark.id.startsWith("frontier-"),
      ),
    ).toBe(true)
    expect(
      frontierBenchmarkCases.some((benchmark) =>
        circuitBenchmarkCases.some((release) => release.id === benchmark.id),
      ),
    ).toBe(false)
    expect(
      frontierBenchmarkCases.find(
        (benchmark) => benchmark.id === "frontier-four-by-five-resistor-mesh",
      )?.graph.components,
    ).toHaveLength(32)
  })

  it("uses the explicit N45 ground selection in the mesh fixture", () => {
    const mesh = frontierBenchmarkCases.find(
      (benchmark) => benchmark.id === "frontier-four-by-five-resistor-mesh",
    )
    expect(mesh?.graph.groundNet).toBe("N45")
    expect(mesh?.graph.nets.map((net) => net.name)).toContain("N45")
    expect(mesh?.graph.nets.map((net) => net.name)).not.toContain("GND")

    const inspection = inspectionFor(mesh!)
    expect(inspection.circuit.nets.map((net) => net.name)).toContain("GND")
    expect(inspection.circuit.nets.map((net) => net.name)).not.toContain("N45")
  })

  it.each(frontierBenchmarkCases.map((benchmark) => [benchmark.id, benchmark] as const))(
    "%s compiles to an exact valid frontier projection",
    (_id, benchmark) => {
      const inspection = inspectionFor(benchmark)
      const checks = scoreInspection(benchmark, inspection)

      expect(checks.every((check) => check._tag === "Passed")).toBe(true)
    },
  )

  it.each(circuitBenchmarkCases.map((benchmark) => [benchmark.id, benchmark] as const))(
    "%s compiles to the exact canonical electrical projection",
    (_id, benchmark) => {
      const inspection = inspectionFor(benchmark)
      const checks = scoreInspection(benchmark, inspection)

      expect(checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ _tag: "Passed", id: "topology.components" }),
          expect.objectContaining({ _tag: "Passed", id: "topology.nets" }),
          expect.objectContaining({ _tag: "Passed", id: "erc" }),
        ]),
      )
      expect(checks.every((check) => check._tag === "Passed")).toBe(true)
    },
  )

  it("scores model circuits by electrical equivalence instead of hidden names", () => {
    const benchmark = circuitBenchmarkCases.find(
      (candidate) => candidate.id === "voltage-divider",
    )
    expect(benchmark).toBeDefined()
    if (benchmark === undefined) return
    const canonical = inspectionFor(benchmark)
    const refdes = { V1: "VSUPPLY", R1: "RA", R2: "RB" } as const
    const netName = (name: string | null) =>
      name === "VIN" ? "VCC" : name
    const inspection: ProjectInspectionPayload = {
      ...canonical,
      analysis: { durationMs: 25, timeStepMs: 0.05 },
      circuit: {
        components: canonical.circuit.components.map((component) => ({
          ...component,
          refdes: refdes[component.refdes as keyof typeof refdes],
          terminals: component.terminals.map((terminal) => ({
            ...terminal,
            net:
              component.refdes === "R1"
                ? terminal.key === "a"
                  ? "VOUT"
                  : "VCC"
                : netName(terminal.net),
          })),
        })),
        nets: canonical.circuit.nets.map((net) => ({
          ...net,
          name: netName(net.name) ?? net.name,
          terminals: net.terminals.map((terminal) => ({
            ...terminal,
            refdes: refdes[terminal.refdes as keyof typeof refdes],
            pin:
              terminal.refdes === "R1"
                ? terminal.pin === "1"
                  ? "2"
                  : "1"
                : terminal.pin,
          })),
        })),
      },
    }

    const score = scoreModelInspection(benchmark, inspection)

    expect(score.checks.every((check) => check._tag === "Passed")).toBe(true)
    expect(score.match?.netNames).toMatchObject({ VIN: "VCC", VOUT: "VOUT" })
    expect(score.match?.refdes).toMatchObject({
      V1: "VSUPPLY",
      R1: "RA",
      R2: "RB",
    })
    expect(score.match?.orientation).toMatchObject({ R1: -1, R2: 1 })
  })

  it("treats BJT Early voltage as electrical behavior during model scoring", () => {
    const benchmark = circuitBenchmarkCases.find(
      (candidate) => candidate.id === "bjt-early-voltage-output-resistance",
    )
    expect(benchmark).toBeDefined()
    if (benchmark === undefined) return
    const canonical = inspectionFor(benchmark)
    const inspection: ProjectInspectionPayload = {
      ...canonical,
      circuit: {
        ...canonical.circuit,
        components: canonical.circuit.components.map((component) =>
          component.behavior.kind === "bipolar-transistor"
            ? {
                ...component,
                behavior: { ...component.behavior, earlyVoltageVolts: 100 },
              }
            : component,
        ),
      },
    }

    expect(scoreModelInspection(benchmark, inspection).checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _tag: "Failed",
          id: "topology.electrical",
        }),
      ]),
    )
  })

  it("treats BJT Is and Nf as electrical behavior during model scoring", () => {
    const benchmark = circuitBenchmarkCases.find(
      (candidate) =>
        candidate.id === "bjt-forward-emission-coefficient-vbe-scaling",
    )
    expect(benchmark).toBeDefined()
    if (benchmark === undefined) return
    const canonical = inspectionFor(benchmark)
    const inspection: ProjectInspectionPayload = {
      ...canonical,
      circuit: {
        ...canonical.circuit,
        components: canonical.circuit.components.map((component) =>
          component.behavior.kind === "bipolar-transistor"
            ? {
                ...component,
                behavior: {
                  ...component.behavior,
                  saturationCurrentAmps: 1e-15,
                  forwardEmissionCoefficient: 1,
                },
              }
            : component,
        ),
      },
    }

    expect(scoreModelInspection(benchmark, inspection).checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _tag: "Failed",
          id: "topology.electrical",
        }),
      ]),
    )
  })

  it("treats MOSFET Kp and Lambda as electrical behavior during model scoring", () => {
    const benchmark = circuitBenchmarkCases.find(
      (candidate) =>
        candidate.id === "nmos-channel-length-modulation-output-resistance",
    )
    expect(benchmark).toBeDefined()
    if (benchmark === undefined) return
    const canonical = inspectionFor(benchmark)
    const inspection: ProjectInspectionPayload = {
      ...canonical,
      circuit: {
        ...canonical.circuit,
        components: canonical.circuit.components.map((component) =>
          component.behavior.kind === "mosfet"
            ? {
                ...component,
                behavior: {
                  ...component.behavior,
                  transconductanceAmpsPerVoltSquared: 0.05,
                  channelLengthModulationPerVolt: 0.02,
                },
              }
            : component,
        ),
      },
    }

    expect(scoreModelInspection(benchmark, inspection).checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _tag: "Failed",
          id: "topology.electrical",
        }),
      ]),
    )
  })

  it("treats ordinary-diode Is, N, and Rs as electrical behavior during model scoring", () => {
    const benchmark = circuitBenchmarkCases.find(
      (candidate) => candidate.id === "diode-series-resistance-current-matrix",
    )
    expect(benchmark).toBeDefined()
    if (benchmark === undefined) return
    const canonical = inspectionFor(benchmark)
    const inspection: ProjectInspectionPayload = {
      ...canonical,
      circuit: {
        ...canonical.circuit,
        components: canonical.circuit.components.map((component) =>
          component.behavior.kind === "diode"
            ? {
                ...component,
                behavior: {
                  ...component.behavior,
                  saturationCurrentAmps: 1e-14,
                  emissionCoefficient: 1,
                  seriesResistanceOhms: 0,
                },
              }
            : component,
        ),
      },
    }

    expect(scoreModelInspection(benchmark, inspection).checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _tag: "Failed",
          id: "topology.electrical",
        }),
      ]),
    )
  })

  it("treats Zener IBV, Is, N, and Rs as electrical behavior during model scoring", () => {
    const benchmark = circuitBenchmarkCases.find(
      (candidate) => candidate.id === "zener-breakdown-dynamic-resistance-matrix",
    )
    expect(benchmark).toBeDefined()
    if (benchmark === undefined) return
    const canonical = inspectionFor(benchmark)
    const inspection: ProjectInspectionPayload = {
      ...canonical,
      circuit: {
        ...canonical.circuit,
        components: canonical.circuit.components.map((component) =>
          component.behavior.kind === "zener-diode"
            ? {
                ...component,
                behavior: {
                  ...component.behavior,
                  breakdownCurrentAmps: 0.002,
                  saturationCurrentAmps: 1e-12,
                  emissionCoefficient: 2,
                  dynamicResistanceOhms: 25,
                },
              }
            : component,
        ),
      },
    }

    expect(scoreModelInspection(benchmark, inspection).checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _tag: "Failed",
          id: "topology.electrical",
        }),
      ]),
    )
  })

  it("still enforces net labels explicitly requested in model prompts", () => {
    const benchmark = circuitBenchmarkCases.find(
      (candidate) => candidate.id === "voltage-divider",
    )
    expect(benchmark).toBeDefined()
    if (benchmark === undefined) return
    const canonical = inspectionFor(benchmark)
    const inspection: ProjectInspectionPayload = {
      ...canonical,
      circuit: {
        components: canonical.circuit.components.map((component) => ({
          ...component,
          terminals: component.terminals.map((terminal) => ({
            ...terminal,
            net: terminal.net === "VOUT" ? "MID" : terminal.net,
          })),
        })),
        nets: canonical.circuit.nets.map((net) => ({
          ...net,
          name: net.name === "VOUT" ? "MID" : net.name,
        })),
      },
    }

    const score = scoreModelInspection(benchmark, inspection)

    expect(score.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ _tag: "Passed", id: "topology.electrical" }),
        expect.objectContaining({
          _tag: "Failed",
          id: "topology.required-nets",
        }),
      ]),
    )
  })

  it("accepts model transient steps with at least 32 samples per source cycle", () => {
    const benchmark = frontierBenchmarkCases.find(
      (candidate) => candidate.id === "frontier-full-wave-bridge",
    )
    expect(benchmark).toBeDefined()
    if (benchmark === undefined) return
    const canonical = inspectionFor(benchmark)
    const sufficientlyFine = scoreModelInspection(benchmark, {
      ...canonical,
      analysis: { durationMs: 40, timeStepMs: 0.1 },
    })
    const tooCoarse = scoreModelInspection(benchmark, {
      ...canonical,
      analysis: { durationMs: 40, timeStepMs: 0.7 },
    })

    expect(sufficientlyFine.checks).toContainEqual(
      expect.objectContaining({ _tag: "Passed", id: "analysis" }),
    )
    expect(tooCoarse.checks).toContainEqual(
      expect.objectContaining({ _tag: "Failed", id: "analysis" }),
    )
  })

  it("samples sine sources at the transient resolution instead of a fixed 64 points", () => {
    const benchmark = circuitBenchmarkCases.find(
      (candidate) => candidate.id === "rc-filter",
    )
    expect(benchmark).toBeDefined()
    if (benchmark === undefined) return
    const project = compileAgentElectricalGraph(
      newCircuitProject(benchmark.title),
      {
        ...benchmark.graph,
        analysis: { durationMs: 100, timeStepMs: 0.1 },
      },
    )
    const build = generateSpiceNetlist({
      circuit: buildElectricalCircuit(project),
      analysis: project.analysis,
      title: project.name,
    })
    const sourceLine = build.netlist
      .split("\n")
      .find((line) => line.startsWith("V1 "))
    const values = /PWL\((.*)\)/.exec(sourceLine ?? "")?.[1]?.split(" ")

    expect(values).toHaveLength(2_002)
    expect(sourceLine).toContain("0.0025 1")
  })
})
