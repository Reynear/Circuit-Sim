import { describe, expect, it } from "vitest"
import { newId } from "@circuit-sim/core/ids"
import { getComponent } from "@circuit-sim/core/circuit/components"
import { getPinPosts } from "@circuit-sim/core/circuit/component-geometry"
import { makeComponent, type Component } from "@circuit-sim/core/circuit/project"

describe("fixed component geometry", () => {
  it("derives terminal positions from component type and placement", () => {
    expect(getPinPosts(component("resistor", 0)).map((pin) => pin.position)).toEqual([
      { x: 60, y: 80 },
      { x: 140, y: 80 },
    ])
  })

  it("rotates fixed terminals without changing symbol size", () => {
    expect(getPinPosts(component("resistor", 90)).map((pin) => pin.position)).toEqual([
      { x: 100, y: 40 },
      { x: 100, y: 120 },
    ])
  })

  it("supports multi-terminal fixed layouts", () => {
    expect(getPinPosts(component("npn-transistor", 0)).map((pin) => pin.position)).toEqual([
      { x: 60, y: 80 },
      { x: 132, y: 48 },
      { x: 132, y: 112 },
    ])
  })
})

function component(type: Component["type"], rotation: Component["rotation"]): Component {
  const spec = getComponent(type)
  return makeComponent({
    kind: "component",
    id: newId(),
    type,
    refdes: "U1",
    position: { x: 100, y: 80 },
    rotation,
    flipped: false,
    props: spec.defaults,
  })
}
