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
  })
})
