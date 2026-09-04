import { describe, expect, it } from "vitest"
import { components, getComponent } from "@circuit-sim/core/circuit/components"

describe("component catalog", () => {
  it("owns semantic electrical terminals for every component type", () => {
    expect(components.every((component) => component.terminals.length > 0)).toBe(true)
    expect(getComponent("dc-voltage-source").terminals.map((pin) => pin.key)).toEqual([
      "positive",
      "negative",
    ])
    expect(getComponent("npn-transistor").terminals.map((pin) => pin.key)).toEqual([
      "base",
      "collector",
      "emitter",
    ])
    expect(getComponent("pulse-voltage-source").terminals.map((pin) => pin.key))
      .toEqual(["positive", "negative"])
    expect(
      getComponent("pulse-voltage-source").electrical({
        initialVoltageVolts: 0,
        pulsedVoltageVolts: 5,
        frequencyHertz: 1_000,
        dutyCyclePercent: 25,
        delaySeconds: 0,
        riseTimeSeconds: 1e-8,
        fallTimeSeconds: 1e-8,
      }),
    ).toEqual({
      kind: "voltage-source",
      wave: "pulse",
      initialVolts: 0,
      pulsedVolts: 5,
      hertz: 1_000,
      dutyCyclePercent: 25,
      delaySeconds: 0,
      riseTimeSeconds: 1e-8,
      fallTimeSeconds: 1e-8,
    })
  })
})
