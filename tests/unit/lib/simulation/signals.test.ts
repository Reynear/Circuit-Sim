import { describe, expect, it } from "vitest"
import {
  availableSignalMetrics,
  availableSignalTargets,
  buildTranSignals,
} from "@circuit-sim/core/simulation/signals"

const validInput = {
  times: [0, 1],
  nodeVoltages: [{ nodeName: "n1", values: [5, 4] }],
  nodeNetNames: [
    { nodeName: "0", netName: "GND" },
    { nodeName: "n1", netName: "VCC" },
  ],
  elementCurrents: [
    {
      element: {
        refdes: "R1",
        pin1Label: "1",
        pin2Label: "2",
        n1: "n1",
        n2: "0",
      },
      current: [0.005, 0.004],
    },
  ],
} as const

describe("canonical simulation signals", () => {
  it("builds complete signals and centralizes display queries", () => {
    const signals = buildTranSignals(validInput)

    expect(availableSignalMetrics(signals)).toEqual([
      "voltage",
      "current",
      "power",
    ])
    expect(availableSignalTargets(signals, "voltage")).toEqual(["GND", "VCC"])
    expect(signals.find((signal) => signal.name === "P(R1)")?.points).toEqual([
      { t: 0, v: 0.025 },
      { t: 1, v: 0.016 },
    ])
  })

  it("rejects truncated series instead of silently dropping samples", () => {
    expect(() =>
      buildTranSignals({
        ...validInput,
        nodeVoltages: [{ nodeName: "n1", values: [5] }],
      }),
    ).toThrowError(
      expect.objectContaining({
        _tag: "InvalidSignalSeries",
        series: "Voltage series for net VCC",
        reason: "has 1 samples; expected 2",
      }),
    )
  })

  it("rejects missing terminal voltages instead of substituting zero", () => {
    expect(() =>
      buildTranSignals({
        ...validInput,
        nodeNetNames: [{ nodeName: "0", netName: "GND" }],
        nodeVoltages: [],
      }),
    ).toThrowError(
      expect.objectContaining({
        _tag: "InvalidSignalSeries",
        series: "Terminal voltage for R1 node n1",
        reason: "is missing",
      }),
    )
  })
})
