import { parseNgspiceAsciiRawOutput } from "@/server/simulation/engines/ngspice-output"
import { buildNgspiceSignals } from "@/server/simulation/engines/ngspice.server"
import { createVoltageDividerExample } from "@/examples/circuit-projects"
import { buildElectricalCircuit } from "@circuit-sim/core/circuit/electrical-circuit"
import { generateSpiceNetlist } from "@circuit-sim/core/simulation/spice-netlist"
import { compileAgentElectricalGraph } from "@circuit-sim/core/agent/electrical-graph"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"
import { circuitBenchmarkCases } from "../../../../benchmarks/cases"

describe("ngspice raw output parser", () => {
  it("parses ASCII raw voltage and current traces with bindings", () => {
    const parsed = parseNgspiceAsciiRawOutput(
      `Title: demo
Plotname: Transient Analysis
Flags: real
No. Variables: 3
No. Points: 2
Variables:
  0 time time
  1 v(out) voltage
  2 i(@r1[i]) current
Values:
0 0
  1
  0.001
1 0.001
  2
  0.002
`)

    expect(parsed.errors).toEqual([])
    expect(parsed.series).toHaveLength(2)
    expect(parsed.series[0]?.expression).toBe("v(out)")
    expect(parsed.series[1]?.expression).toBe("i(@r1[i])")
    expect(parsed.series[1]?.points[1]).toEqual({ t: 0.001, v: 0.002 })
  })

  it("parses Fortran D exponent values from ngspice raw output", () => {
    const parsed = parseNgspiceAsciiRawOutput(`Title: demo
Plotname: Transient Analysis
Flags: real
No. Variables: 2
No. Points: 2
Variables:
  0 time time
  1 v(out) voltage
Values:
0 0
  1.5D+00
1 1.0D-03
  2.5D+00
`)

    expect(parsed.errors).toEqual([])
    expect(parsed.series[0]?.points).toEqual([
      { t: 0, v: 1.5 },
      { t: 0.001, v: 2.5 },
    ])
  })

  it("surfaces unsupported raw output formats instead of silently parsing nothing", () => {
    const binary = parseNgspiceAsciiRawOutput(`Title: demo
Flags: real binary
No. Variables: 2
No. Points: 1
`)
    const complex = parseNgspiceAsciiRawOutput(`Title: demo
Flags: complex
No. Variables: 2
No. Points: 1
`)

    expect(binary.errors.join("\n")).toContain("Binary ngspice raw output")
    expect(complex.errors.join("\n")).toContain("Complex ngspice raw output")
  })

  it("maps case-insensitive ngspice node names and wrapped passive currents", () => {
    const project = createVoltageDividerExample()
    const build = generateSpiceNetlist({
      circuit: buildElectricalCircuit(project),
      analysis: project.analysis,
      title: project.name,
    })
    const points = [
      { t: 0, v: 2.5 },
      { t: 0.001, v: 2.5 },
    ]
    const signals = buildNgspiceSignals(
      [
        { expression: "v(n001)", points: points.map((point) => ({ ...point, v: 5 })) },
        { expression: "v(vout)", points },
        {
          expression: "i(@r1[i])",
          points: points.map((point) => ({ ...point, v: 0.00025 })),
        },
        {
          expression: "i(@r2[i])",
          points: points.map((point) => ({ ...point, v: 0.00025 })),
        },
        {
          expression: "i(v1)",
          points: points.map((point) => ({ ...point, v: -0.00025 })),
        },
      ],
      build,
    )

    expect(signals.find((signal) => signal.name === "V(N001)")?.points[0]?.v).toBe(5)
    expect(signals.some((signal) => signal.name === "I(R1.1)")).toBe(true)
    expect(signals.some((signal) => signal.name === "P(R1)")).toBe(true)
  })

  it("maps independent BJT base, collector, and emitter currents", () => {
    const benchmark = circuitBenchmarkCases.find(
      (candidate) => candidate.id === "npn-current-gain",
    )!
    const project = compileAgentElectricalGraph(
      newCircuitProject(benchmark.title),
      benchmark.graph,
    )
    const build = generateSpiceNetlist({
      circuit: buildElectricalCircuit(project),
      analysis: project.analysis,
      title: project.name,
    })
    const points = [{ t: 0, v: 0 }, { t: 0.001, v: 0 }]
    const voltage = (netName: string) =>
      netName === "BASE" ? 0.697 : netName === "COLLECTOR" ? 9.45 : 10
    const series = [
      ...[...build.nodeNameByNetName].flatMap(([netName, nodeName]) =>
        nodeName === "0"
          ? []
          : [{
              expression: `v(${nodeName.toLowerCase()})`,
              points: points.map((point) => ({ ...point, v: voltage(netName) })),
            }],
      ),
      {
        expression: "i(@q1[ic])",
        points: points.map((point) => ({ ...point, v: 0.000547 })),
      },
      {
        expression: "i(@q1[ib])",
        points: points.map((point) => ({ ...point, v: 0.00000503 })),
      },
      {
        expression: "i(@q1[ie])",
        points: points.map((point) => ({ ...point, v: -0.00055203 })),
      },
    ]

    const signals = buildNgspiceSignals(series, build)

    expect(signals.find((signal) => signal.name === "I(Q1.B)")?.points[0]?.v)
      .toBe(0.00000503)
    expect(signals.find((signal) => signal.name === "I(Q1.C)")?.points[0]?.v)
      .toBe(0.000547)
    expect(signals.find((signal) => signal.name === "I(Q1.E)")?.points[0]?.v)
      .toBe(-0.00055203)
    expect(signals.some((signal) => signal.name === "P(Q1)")).toBe(true)
  })

  it("normalizes P-channel MOSFET currents into terminal-entering signs", () => {
    const benchmark = circuitBenchmarkCases.find(
      (candidate) => candidate.id === "pmos-high-side-regions",
    )!
    const project = compileAgentElectricalGraph(
      newCircuitProject(benchmark.title),
      benchmark.graph,
    )
    const build = generateSpiceNetlist({
      circuit: buildElectricalCircuit(project),
      analysis: project.analysis,
      title: project.name,
    })
    const points = [{ t: 0, v: 0 }, { t: 0.001, v: 0 }]
    const voltage = (netName: string) =>
      netName === "VDD" ? 5 : netName === "ON_OUT" ? 4.9 : 0
    const series = [
      ...[...build.nodeNameByNetName].flatMap(([netName, nodeName]) =>
        nodeName === "0"
          ? []
          : [{
              expression: `v(${nodeName.toLowerCase()})`,
              points: points.map((point) => ({ ...point, v: voltage(netName) })),
            }],
      ),
      {
        expression: "i(@m_on[id])",
        points: points.map((point) => ({ ...point, v: 0.0148 })),
      },
      {
        expression: "i(@m_on[ig])",
        points,
      },
      {
        expression: "i(@m_on[is])",
        points: points.map((point) => ({ ...point, v: -0.0148 })),
      },
    ]

    const signals = buildNgspiceSignals(series, build)

    expect(signals.find((signal) => signal.name === "I(M_ON.D)")?.points[0]?.v)
      .toBe(-0.0148)
    expect(signals.find((signal) => signal.name === "I(M_ON.S)")?.points[0]?.v)
      .toBe(0.0148)
    expect(signals.find((signal) => signal.name === "P(M_ON)")?.points[0]?.v)
      .toBeCloseTo(0.00148)
  })

  it("synthesizes configured logic-load currents absent from ngspice output", () => {
    const benchmark = circuitBenchmarkCases.find(
      (candidate) => candidate.id === "logic-gate-truth-regions",
    )!
    const project = compileAgentElectricalGraph(
      newCircuitProject(benchmark.title),
      benchmark.graph,
    )
    const build = generateSpiceNetlist({
      circuit: buildElectricalCircuit(project),
      analysis: project.analysis,
      title: project.name,
    })
    const points = [{ t: 0, v: 0 }, { t: 0.001, v: 0 }]
    const highNets = new Set(["HIGH", "AND_HIGH", "OR_HIGH", "INV_HIGH"])
    const series = [...build.nodeNameByNetName].flatMap(([netName, nodeName]) =>
      nodeName === "0"
        ? []
        : [{
            expression: `v(${nodeName.toLowerCase()})`,
            points: points.map((point) => ({
              ...point,
              v: highNets.has(netName) ? 5 : 0,
            })),
          }],
    )

    const signals = buildNgspiceSignals(series, build)

    expect(signals.find((signal) => signal.name === "I(OUT_AND_HIGH.IN)")?.points)
      .toEqual(points.map((point) => ({ ...point, v: 0.0001 })))
    expect(signals.find((signal) => signal.name === "I(OUT_AND_HIGH.REF)")?.points)
      .toEqual(points.map((point) => ({ ...point, v: -0.0001 })))
    expect(signals.find((signal) => signal.name === "P(OUT_AND_HIGH)")?.points[0]?.v)
      .toBeCloseTo(0.0005)
    expect(signals.find((signal) => signal.name === "P(OUT_AND_LOW)")?.points[0]?.v)
      .toBe(0)
  })
})
