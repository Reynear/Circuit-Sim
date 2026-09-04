import { describe, expect, it } from "vitest"
import {
  getPrimaryComponentPosts,
  getNormalComponentHandles,
  getVisiblePosts,
  getWirePostIndexes,
} from "@/browser/editor/post-endpoints"
import type { SchematicObject, Component, WireObject } from "@circuit-sim/core/circuit/project"

describe("schematic posts", () => {
  it("derives visible endpoints and explicit shared vertices", () => {
    const objects: SchematicObject[] = [
      resistor(),
      wire("left", [{ x: -40, y: 0 }, { x: -80, y: 0 }]),
      wire("right", [{ x: 40, y: 0 }, { x: 80, y: 0 }]),
      wire("branch", [{ x: 80, y: 0 }, { x: 80, y: 40 }]),
    ]
    expect(getVisiblePosts(objects).map((post) => post.key)).toEqual([
      "-80:0",
      "80:40",
    ])
  })

  it("uses wire endpoints as editing handles", () => {
    expect(getWirePostIndexes(wire("wire", [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
    ]))).toEqual([0, 2])
  })

  it("uses fixed component terminals as handles", () => {
    expect(getNormalComponentHandles(resistor()).map((post) => post.position)).toEqual([
      { x: -40, y: 0 },
      { x: 40, y: 0 },
    ])
  })

  it("does not duplicate the sole handle of a one-terminal power rail", () => {
    const rail: Component = {
      kind: "component",
      id: "vcc",
      type: "dc-power-rail",
      refdes: "VCC",
      position: { x: 0, y: 0 },
      rotation: 0,
      flipped: false,
      props: { voltageVolts: 5 },
    }

    expect(getPrimaryComponentPosts(rail)).toEqual([
      expect.objectContaining({ pin: "rail", position: { x: 0, y: 40 } }),
    ])
  })
})

function resistor(): Component {
  return {
    kind: "component",
    id: "resistor",
    type: "resistor",
    refdes: "R1",
    position: { x: 0, y: 0 },
    rotation: 0,
    flipped: false,
    props: { resistanceOhms: 1_000 },
  }
}

function wire(id: string, points: WireObject["points"]): WireObject {
  return { kind: "wire", id, points }
}
