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
    expect(output.diagnostics.unsupportedComponents).toEqual([])
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
})

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
          props: { model: "fast-diode" },
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
