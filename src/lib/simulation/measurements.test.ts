import { describe, expect, it } from "vitest"
import {
  analyzeCircuitMeasurements,
  formatMeasurement,
  getComponentPowerColor,
  getNetVoltageColor,
} from "./measurements"
import {
  createDemoRcLowPassProject,
  createDemoSourceToGroundProject,
  createDemoVoltageDividerProject,
} from "../schematic/create-default-project"
import { createId } from "../ids"
import { getSymbolPinWorldPosition } from "../schematic/transforms"

describe("measurements", () => {
  it("measures a single voltage source tied straight to ground", () => {
    const report = analyzeCircuitMeasurements(createDemoSourceToGroundProject())

    expect(report.topology).toBe("source-to-ground")
    expect(report.notes[0]).toContain("directly to GND")
    expect(report.netVoltages.find((net) => net.name === "VIN")?.voltage)
      .toBeCloseTo(5)
    expect(report.componentMeasurements.find((component) => component.refdes === "V1")?.current)
      .toBe(0)
    expect(report.scopeTraces.find((trace) => trace.name === "VP_VIN")?.points.at(-1)?.v)
      .toBeCloseTo(5)
  })

  it("computes voltage-divider node voltage and resistor current", () => {
    const report = analyzeCircuitMeasurements(createDemoVoltageDividerProject())

    expect(report.topology).toBe("voltage-divider")
    expect(report.notes[0]).toContain("voltage divider")
    expect(report.netVoltages.find((net) => net.name === "VOUT")?.voltage).toBeCloseTo(2.5)
    expect(
      report.componentMeasurements.find((component) => component.refdes === "R1")
        ?.current,
    ).toBeCloseTo(0.00025)
    expect(
      report.probeMeasurements.find((probe) => probe.name === "VP_OUT")?.voltage,
    ).toBeCloseTo(2.5)
  })

  it("reports current probes in amps", () => {
    const project = createDemoVoltageDividerProject()
    const r1 = project.sheets[0]!.objects.find(
      (object) => object.kind === "symbol" && object.refdes === "R1",
    )
    expect(r1?.kind).toBe("symbol")
    if (!r1 || r1.kind !== "symbol") {
      return
    }
    const pin = getSymbolPinWorldPosition(r1, "pin1")
    expect(pin).toBeTruthy()
    if (!pin) {
      return
    }
    project.sheets[0]!.objects.push({
      kind: "probe",
      id: createId("probe"),
      probeType: "current",
      name: "IP_R1",
      position: pin,
    })

    const report = analyzeCircuitMeasurements(project)
    const currentProbe = report.probeMeasurements.find((probe) => probe.name === "IP_R1")
    expect(currentProbe?.probeType).toBe("current")
    expect(currentProbe?.current).toBeCloseTo(0.00025)
    expect(report.scopeTraces.find((trace) => trace.name === "IP_R1")?.unit).toBe("A")
  })

  it("computes RC output and scope traces", () => {
    const report = analyzeCircuitMeasurements(createDemoRcLowPassProject())

    expect(report.topology).toBe("rc-low-pass")
    expect(report.scopeTraces.map((trace) => trace.name)).toEqual(["VP_IN", "VP_OUT"])
    expect(report.scopeTraces[1]?.points.at(-1)?.v).toBeGreaterThan(4.9)
    expect(report.probeMeasurements.find((probe) => probe.name === "VP_OUT")?.voltage)
      .toBeGreaterThan(4.9)
  })

  it("formats measurements using engineering prefixes", () => {
    expect(formatMeasurement(0.00025, "A")).toBe("250 uA")
    expect(formatMeasurement(2.5, "V")).toBe("2.50 V")
    expect(formatMeasurement(undefined, "W")).toBe("n/a")
  })

  it("maps component power to schematic-style display colors", () => {
    expect(getComponentPowerColor(0.001)).toBe("#f59e0b")
    expect(getComponentPowerColor(-0.001)).toBe("#38bdf8")
    expect(getComponentPowerColor(0)).toBe("#9ca3af")
    expect(getComponentPowerColor(undefined)).toBe("#d7d7d7")
  })

  it("maps net voltage using schematic color range and custom colors", () => {
    const colors = {
      voltageRange: 5,
      positiveColor: "#00ff00",
      negativeColor: "#ff0000",
      neutralColor: "#808080",
    }

    expect(getNetVoltageColor(5, colors)).toBe("#00ff00")
    expect(getNetVoltageColor(-5, colors)).toBe("#ff0000")
    expect(getNetVoltageColor(0, colors)).toBe("#808080")
    expect(getNetVoltageColor(2.5, colors)).toBe("#40c040")
  })
})
