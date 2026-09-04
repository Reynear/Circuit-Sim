import { newId } from "@circuit-sim/core/ids"
import {
  createRcLowPassExample,
  createSourceToGroundExample,
  createVoltageDividerExample,
} from "@/examples/circuit-projects"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"
import { generateSpiceNetlist } from "@circuit-sim/core/simulation/spice-netlist"
import { runSpiceSimulation } from "@/server/simulation/engines/spicey"
import { simulationStatus } from "@circuit-sim/core/simulation/result"
import { buildElectricalCircuit } from "@circuit-sim/core/circuit/electrical-circuit"
import { availableSignalMetrics } from "@circuit-sim/core/simulation/signals"
import type { CircuitProject } from "@circuit-sim/core/circuit/project"
import { compileAgentElectricalGraph } from "@circuit-sim/core/agent/electrical-graph"
import { circuitBenchmarkCases } from "../../../../benchmarks/cases"

describe("SPICE simulation", () => {
  it("exports the RC demo as a transient SPICE netlist", () => {
    const output = netlistFor(createRcLowPassExample())

    expect(output.netlist).toContain("R1")
    expect(output.netlist).toContain("C1")
    expect(output.netlist).toContain("V1")
    expect(output.netlist).toContain(".tran")
    expect(output.netlist).toContain(".print tran")
    expect(output.diagnostics.errors).toHaveLength(0)
  })

  it("exports a direct source-to-ground circuit without floating source pins", () => {
    const output = netlistFor(createSourceToGroundExample())

    expect(output.netlist).toContain("V1 VIN 0 DC 5V")
    expect(output.netlist).toContain(".print tran V(VIN)")
    expect(output.diagnostics.floatingPins).toEqual([])
  })

  it("exports one-pin power rails as ordinary GND-referenced NGSpice sources", () => {
    const output = benchmarkNetlist(
      "complementary-darlington-4-diode-bias-power-rails",
    )

    expect(output.netlist).toContain("VCC VCC 0 DC 15V")
    expect(output.netlist).toContain("VEE VEE 0 DC -15V")
    expect(output.elements.find(({ refdes }) => refdes === "VCC")?.terminals)
      .toEqual([
        expect.objectContaining({
          label: "RAIL",
          node: "VCC",
          currentExpression: "I(VCC)",
          negate: false,
        }),
      ])
    expect(output.diagnostics.errors).toEqual([])
    expect(output.diagnostics.floatingPins).toEqual([])
  })

  it("exports a canonical transient PWM source as NGSpice PULSE", () => {
    const output = benchmarkNetlist("pulse-voltage-source-duty-cycle")

    expect(output.netlist).toContain(
      "VPWM PWM_OUT 0 PULSE(0 5 0 1e-8 1e-8 0.00025 0.001)",
    )
    expect(output.elements.find(({ refdes }) => refdes === "VPWM")?.terminals)
      .toEqual([
        expect.objectContaining({ label: "+", node: "PWM_OUT", currentExpression: "I(VPWM)", negate: false }),
        expect.objectContaining({ label: "-", node: "0", currentExpression: "I(VPWM)", negate: true }),
      ])
    expect(output.diagnostics.errors).toEqual([])
  })

  it("runs SPICE and returns voltage, current, and power traces", () => {
    const result = runSpiceSimulation(createVoltageDividerExample())
    const metrics = new Set(availableSignalMetrics(result.signals))

    expect(result.engine).toBe("spicey")
    expect(simulationStatus(result)).toBe("success")
    expect(metrics.has("voltage")).toBe(true)
    expect(metrics.has("current")).toBe(true)
    expect(metrics.has("power")).toBe(true)
  })

  it("exports current sources and custom diode model metadata", () => {
    const output = netlistFor(createCurrentSourceAndDiodeProject())

    expect(output.netlist).toContain("I1")
    expect(output.netlist).toContain(" DC 1mA")
    expect(output.netlist).toContain("D1")
    expect(output.netlist).toContain(".model FAST_DIODE")
    expect(
      output.elements.find((element) => element.refdes === "I1")?.terminals,
    ).toEqual([
      expect.objectContaining({ label: "+", constantCurrent: 0.001, negate: false }),
      expect.objectContaining({ label: "-", constantCurrent: 0.001, negate: true }),
    ])
    expect(output.diagnostics.unsupportedComponents).toEqual([])
  })

  it("exports canonical ordinary-diode Is, N, and Rs parameters", () => {
    const saturationCurrent = benchmarkNetlist(
      "diode-saturation-current-forward-voltage",
    )
    const emission = benchmarkNetlist(
      "diode-emission-coefficient-forward-voltage",
    )
    const seriesResistance = benchmarkNetlist(
      "diode-series-resistance-current-matrix",
    )

    expect(saturationCurrent.netlist).toContain(
      ".model DDEFAULT_DIS12 D(Is=1e-12 N=1 Rs=0)",
    )
    expect(emission.netlist).toContain(
      ".model DDEFAULT_DN15 D(Is=1e-14 N=1.5 Rs=0)",
    )
    expect(seriesResistance.netlist).toContain(
      ".model DDEFAULT_DRS50_I10 D(Is=1e-14 N=1 Rs=50)",
    )
    expect(seriesResistance.netlist).toContain(
      "DRS0_I1 FORWARD_RS0_I1 0 DDEFAULT",
    )
  })

  it("uses switch state as topology and does not export switches as unsupported SPICE parts", () => {
    const openOutput = netlistFor(createSwitchOnlyProject("open"))
    const closedOutput = netlistFor(createSwitchOnlyProject("closed"))

    expect(openOutput.diagnostics.unsupportedComponents).toEqual([])
    expect(openOutput.diagnostics.floatingPins).toEqual([])
    expect(closedOutput.diagnostics.unsupportedComponents).toEqual([])
    expect(closedOutput.diagnostics.floatingPins).toEqual([])
    expect([...closedOutput.nodeNameByNetName]).toEqual([["N001", "N001"]])
  })

  it("exports Zener breakdown and three-terminal NPN/PNP models", () => {
    const zener = benchmarkNetlist("zener-shunt-regulator")
    const softZener = benchmarkNetlist("zener-dynamic-resistance-ripple")
    const npn = benchmarkNetlist("npn-current-gain")
    const earlyVoltage = benchmarkNetlist("bjt-early-voltage-output-resistance")
    const pnp = benchmarkNetlist("pnp-high-side-switch")
    const pnpRegions = benchmarkNetlist("pnp-operating-regions")
    const saturationCurrent = benchmarkNetlist("bjt-saturation-current-vbe-shift")
    const emissionCoefficient = benchmarkNetlist(
      "bjt-forward-emission-coefficient-vbe-scaling",
    )
    const complementaryJunctions = benchmarkNetlist(
      "complementary-bjt-junction-parameter-symmetry",
    )
    const zenerBreakdownCurrent = benchmarkNetlist(
      "zener-breakdown-current-reference-shift",
    )
    const zenerSaturationCurrent = benchmarkNetlist(
      "zener-forward-saturation-current-voltage-shift",
    )
    const zenerEmissionCoefficient = benchmarkNetlist(
      "zener-forward-emission-coefficient-voltage-scaling",
    )
    const megaohmDivider = benchmarkNetlist("megaohm-divider")

    expect(zener.netlist).toContain(
      ".model ZMODEL_DZ1 D(Is=1e-14 N=1 Bv=5.1 Ibv=0.001 Rs=10)",
    )
    expect(softZener.netlist).toContain(
      ".model ZMODEL_DZ1 D(Is=1e-14 N=1 Bv=5.1 Ibv=0.001 Rs=100)",
    )
    expect(zenerBreakdownCurrent.netlist).toContain(
      ".model ZMODEL_DZIBV01 D(Is=1e-14 N=1 Bv=5.1 Ibv=0.0001 Rs=1)",
    )
    expect(zenerBreakdownCurrent.netlist).toContain(
      ".model ZMODEL_DZIBV10 D(Is=1e-14 N=1 Bv=5.1 Ibv=0.01 Rs=1)",
    )
    expect(zenerSaturationCurrent.netlist).toContain(
      ".model ZMODEL_DZIS12 D(Is=1e-12 N=1 Bv=5.1 Ibv=0.001 Rs=0.001)",
    )
    expect(zenerEmissionCoefficient.netlist).toContain(
      ".model ZMODEL_DZN2 D(Is=1e-14 N=2 Bv=5.1 Ibv=0.001 Rs=0.001)",
    )
    expect(zener.netlist).toContain("DZ1 0 VREG ZMODEL_DZ1")
    expect(npn.netlist).toContain("Q1 COLLECTOR BASE 0 QMODEL_Q1")
    expect(npn.netlist).toContain(".model QMODEL_Q1 NPN(Is=1e-15 Nf=1 Bf=100 Vaf=100)")
    expect(earlyVoltage.netlist).toContain(
      ".model QMODEL_Q50_LOW NPN(Is=1e-15 Nf=1 Bf=100 Vaf=50)",
    )
    expect(earlyVoltage.netlist).toContain(
      ".model QMODEL_Q200_HIGH NPN(Is=1e-15 Nf=1 Bf=100 Vaf=200)",
    )
    expect(pnp.netlist).toContain("Q1 OUT BASE VCC QMODEL_Q1")
    expect(pnp.netlist).toContain(".model QMODEL_Q1 PNP(Is=1e-15 Nf=1 Bf=100 Vaf=100)")
    expect(saturationCurrent.netlist).toContain(
      ".model QMODEL_QIS13 NPN(Is=1e-13 Nf=1 Bf=100 Vaf=100)",
    )
    expect(emissionCoefficient.netlist).toContain(
      ".model QMODEL_QNF15 NPN(Is=1e-15 Nf=1.5 Bf=100 Vaf=100)",
    )
    expect(complementaryJunctions.netlist).toContain(
      ".model QMODEL_QP_NF14 PNP(Is=1e-15 Nf=1.4 Bf=100 Vaf=100)",
    )
    expect(pnpRegions.netlist).toContain("RB_ACTIVE ACTIVE_BASE 0 10Meg")
    expect(pnpRegions.netlist).not.toContain("RB_ACTIVE ACTIVE_BASE 0 10M\n")
    expect(megaohmDivider.netlist).toContain("R1 VIN VOUT 10Meg")
    expect(megaohmDivider.netlist).toContain("R2 VOUT 0 10Meg")
    expect(
      npn.signalBindings
        .filter((binding) => binding.signalName.startsWith("I(Q1."))
        .map((binding) => binding.signalName),
    ).toEqual(["I(Q1.C)", "I(Q1.B)", "I(Q1.E)"])
    expect(zener.diagnostics.unsupportedComponents).toEqual([])
    expect(npn.diagnostics.unsupportedComponents).toEqual([])
    expect(earlyVoltage.diagnostics.unsupportedComponents).toEqual([])
    expect(pnp.diagnostics.unsupportedComponents).toEqual([])
  })

  it("exports source-bulk-tied N-channel and P-channel MOSFET models", () => {
    const nmos = benchmarkNetlist("nmos-low-side-regions")
    const pmos = benchmarkNetlist("pmos-high-side-regions")

    expect(nmos.netlist).toContain(
      "M_ON ON_DRAIN GATE_HIGH 0 0 MMODEL_M_ON",
    )
    expect(nmos.netlist).toContain(
      ".model MMODEL_M_ON NMOS(Level=1 Vto=2 Kp=0.05 Lambda=0.02)",
    )
    expect(pmos.netlist).toContain(
      "M_ON ON_OUT 0 VDD VDD MMODEL_M_ON",
    )
    expect(pmos.netlist).toContain(
      ".model MMODEL_M_ON PMOS(Level=1 Vto=-2 Kp=0.05 Lambda=0.02)",
    )
    expect(
      pmos.signalBindings
        .filter((binding) => binding.signalName.startsWith("I(M_ON."))
        .map((binding) => ({ name: binding.signalName, negate: binding.negate })),
    ).toEqual([
      { name: "I(M_ON.D)", negate: true },
      { name: "I(M_ON.G)", negate: true },
      { name: "I(M_ON.S)", negate: true },
    ])
    expect(nmos.diagnostics.unsupportedComponents).toEqual([])
    expect(pmos.diagnostics.unsupportedComponents).toEqual([])
  })

  it("exports canonical MOSFET transconductance and channel-length modulation", () => {
    const outputResistance = benchmarkNetlist(
      "nmos-channel-length-modulation-output-resistance",
    )
    const complementary = benchmarkNetlist(
      "complementary-mosfet-transconductance-strength",
    )
    const squareLaw = benchmarkNetlist("nmos-square-law-overdrive-current")

    expect(outputResistance.netlist).toContain(
      ".model MMODEL_ML001_LOW NMOS(Level=1 Vto=2 Kp=0.01 Lambda=0.01)",
    )
    expect(outputResistance.netlist).toContain(
      ".model MMODEL_ML005_HIGH NMOS(Level=1 Vto=2 Kp=0.01 Lambda=0.05)",
    )
    expect(complementary.netlist).toContain(
      ".model MMODEL_MN_KP005 NMOS(Level=1 Vto=2 Kp=0.005 Lambda=0.02)",
    )
    expect(complementary.netlist).toContain(
      ".model MMODEL_MP_KP020 PMOS(Level=1 Vto=-2 Kp=0.02 Lambda=0.02)",
    )
    expect(squareLaw.netlist).toContain(
      ".model MMODEL_M_VOV20 NMOS(Level=1 Vto=2 Kp=0.01 Lambda=0)",
    )
  })

  it("exports a supply- and property-limited ideal op amp behavioral source", () => {
    const follower = benchmarkNetlist("op-amp-voltage-follower")

    expect(follower.netlist).toContain(
      "BU1 OUT 0 V=max(max(V(VMINUS),-10),min(min(V(VPLUS),10),100000*(V(INPUT)-V(OUT))))",
    )
    expect(
      follower.signalBindings.filter((binding) =>
        binding.signalName.startsWith("I(U1."),
      ),
    ).toEqual([
      {
        expression: "I(BU1)",
        signalName: "I(U1.OUT)",
        unit: "A",
        negate: false,
      },
    ])
    expect(follower.diagnostics.unsupportedComponents).toEqual([])
    expect(follower.diagnostics.errors).toEqual([])
  })

  it("exports explicitly referenced logic sources, loads, and behavioral gates", () => {
    const logic = benchmarkNetlist("logic-gate-truth-regions")

    expect(logic.netlist).toContain("VIN_HIGH HIGH 0 DC 5V")
    expect(logic.netlist).toContain("IOUT_AND_HIGH AND_HIGH 0 DC 100uA")
    expect(logic.netlist).toContain(
      "BU_AND_HIGH AND_HIGH 0 V=min(V(HIGH,0),V(HIGH,0)) > 2.5 ? 5 : 0",
    )
    expect(logic.netlist).toContain(
      "BU_OR_LOW OR_LOW 0 V=max(V(LOW,0),V(LOW,0)) > 2.5 ? 5 : 0",
    )
    expect(logic.netlist).toContain(
      "BU_INV_HIGH INV_HIGH 0 V=V(LOW,0) > 2.5 ? 0 : 5",
    )
    expect(
      logic.elements.find((element) => element.refdes === "OUT_AND_HIGH")
        ?.terminals,
    ).toEqual([
      expect.objectContaining({ label: "IN", constantCurrent: 0.0001, negate: false }),
      expect.objectContaining({ label: "REF", constantCurrent: 0.0001, negate: true }),
    ])
    expect(logic.diagnostics.unsupportedComponents).toEqual([])
    expect(logic.diagnostics.floatingPins).toEqual([])
    expect(logic.diagnostics.errors).toEqual([])
  })
})

function benchmarkNetlist(id: string) {
  const benchmark = circuitBenchmarkCases.find((candidate) => candidate.id === id)!
  return netlistFor(
    compileAgentElectricalGraph(
      newCircuitProject(benchmark.title),
      benchmark.graph,
    ),
  )
}

function createCurrentSourceAndDiodeProject(): CircuitProject {
  const project = newCircuitProject("Current source and diode")
  return {
    ...project,
    objects: [
        {
          kind: "component",
          id: newId(),
          type: "dc-current-source",
          refdes: "I1",
          position: { x: 0, y: 0 },
          rotation: 0,
          flipped: false,
          props: { currentAmps: 0.001 },
        },
        {
          kind: "component",
          id: newId(),
          type: "diode",
          refdes: "D1",
          position: { x: 120, y: 0 },
          rotation: 0,
          flipped: false,
          props: { model: "fast-diode", saturationCurrentAmps: 1e-14, emissionCoefficient: 1, seriesResistanceOhms: 0 },
        },
        {
          kind: "wire",
          id: newId(),
          points: [
            { x: 40, y: 0 },
            { x: 80, y: 0 },
          ],
        },
        {
          kind: "wire",
          id: newId(),
          points: [
            { x: 160, y: 0 },
            { x: 160, y: 80 },
            { x: -40, y: 80 },
            { x: -40, y: 0 },
          ],
        },
        {
          kind: "ground",
          id: newId(),
          position: { x: -40, y: 80 },
          netName: "GND",
        },
      ],
  }
}

function createSwitchOnlyProject(state: "open" | "closed"): CircuitProject {
  const project = newCircuitProject("Switch topology")
  return {
    ...project,
    objects: [
        {
          kind: "component",
          id: newId(),
          type: "switch",
          refdes: "S1",
          position: { x: 0, y: 0 },
          rotation: 0,
          flipped: false,
          props: { state },
        },
      ],
  }
}

function netlistFor(project: CircuitProject) {
  return generateSpiceNetlist({
    circuit: buildElectricalCircuit(project),
    analysis: project.analysis,
    title: project.name,
  })
}
