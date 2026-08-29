import { describe, expect, it } from "vitest"
import {
  MOUSE_HIT_TOLERANCE,
  hitTestObjects,
} from "@/browser/editor/hit-testing"
import type { LineObject, SchematicObject, Component } from "@circuit-sim/core/circuit/project"

describe("hit testing", () => {
  it("returns the topmost overlapping fixed component pin", () => {
    const lower = resistor("lower", "R1")
    const upper = resistor("upper", "R2")
    expect(hitTestObjects({ x: -40, y: 0 }, [lower, upper], 6)).toEqual({
      type: "pin",
      objectId: upper.id,
      pin: "a",
    })
  })

  it("uses the schematic line hit threshold", () => {
    const line: LineObject = {
      kind: "line",
      id: "line",
      start: { x: 0, y: 100 },
      end: { x: 200, y: 100 },
    }
    expect(hitTestObjects({ x: 100, y: 109 }, [line], MOUSE_HIT_TOLERANCE))
      .toEqual({ type: "object", objectId: line.id })
    expect(hitTestObjects({ x: 100, y: 111 }, [line], MOUSE_HIT_TOLERANCE))
      .toBeNull()
  })

  it("hits annotation attachment points without owning browser glyph geometry", () => {
    const objects: SchematicObject[] = [
      { kind: "ground", id: "ground", position: { x: 0, y: 0 }, netName: "GND" },
      { kind: "net-label", id: "label", position: { x: 100, y: 0 }, text: "CLK" },
      { kind: "probe", id: "probe", position: { x: 200, y: 0 }, probeType: "voltage", name: "VP1" },
    ]
    expect(hitTestObjects({ x: 0, y: 0 }, objects, 6)?.objectId).toBe("ground")
    expect(hitTestObjects({ x: 100, y: 0 }, objects, 6)?.objectId).toBe("label")
    expect(hitTestObjects({ x: 200, y: 0 }, objects, 6)?.objectId).toBe("probe")
  })
})

function resistor(id: string, refdes: string): Component {
  return {
    kind: "component",
    id,
    type: "resistor",
    refdes,
    position: { x: 0, y: 0 },
    rotation: 0,
    flipped: false,
    props: { resistanceOhms: 1_000 },
  }
}
