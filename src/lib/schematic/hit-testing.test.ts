import {
  MOUSE_HIT_TOLERANCE,
  hitTestLine,
  hitTestObjects,
} from "./hit-testing"
import type {
  BoxObject,
  GroundObject,
  LineObject,
  NetLabelObject,
  ProbeObject,
  SchematicObject,
  SymbolObject,
} from "./types"

describe("hitTestObjects", () => {
  it("returns the topmost overlapping symbol pin", () => {
    const lower = testResistor("sym_lower", "R1")
    const upper = testResistor("sym_upper", "R2")
    const objects: SchematicObject[] = [lower, upper]

    expect(hitTestObjects({ x: -40, y: 0 }, objects, 6)).toEqual({
      type: "pin",
      objectId: upper.id,
      componentPinId: "pin1",
    })
  })

  it("chooses the closest overlapping object like CircuitJS mouseSelect", () => {
    const line: LineObject = {
      kind: "line",
      id: "line_closer",
      start: { x: 0, y: 100 },
      end: { x: 200, y: 100 },
    }
    const box: BoxObject = {
      kind: "box",
      id: "box_later",
      start: { x: 0, y: 106 },
      end: { x: 200, y: 160 },
    }

    expect(hitTestObjects({ x: 100, y: 102 }, [line, box], 6)).toEqual({
      type: "object",
      objectId: line.id,
    })
  })

  it("uses CircuitJS's 10px mouse distance threshold for visual lines", () => {
    const line: LineObject = {
      kind: "line",
      id: "line_threshold",
      start: { x: 0, y: 100 },
      end: { x: 200, y: 100 },
    }

    expect(
      hitTestLine({ x: 100, y: 109 }, line, MOUSE_HIT_TOLERANCE),
    ).toBe(true)
    expect(
      hitTestLine({ x: 100, y: 111 }, line, MOUSE_HIT_TOLERANCE),
    ).toBe(false)
  })

  it("hits the dragged body endpoint of one-post annotations", () => {
    const ground: GroundObject = {
      kind: "ground",
      id: "junc_1",
      position: { x: 0, y: 0 },
      leadEnd: { x: 40, y: 0 },
      netName: "GND",
    }

    expect(hitTestObjects({ x: 40, y: 0 }, [ground], 6)).toEqual({
      type: "object",
      objectId: ground.id,
    })
    expect(hitTestObjects({ x: 20, y: 0 }, [ground], 6)).toEqual({
      type: "object",
      objectId: ground.id,
    })
  })

  it("hits oriented schematic ground body bars", () => {
    const ground: GroundObject = {
      kind: "ground",
      id: "junc_horizontal_ground",
      position: { x: 0, y: 0 },
      leadEnd: { x: 40, y: 0 },
      netName: "GND",
    }

    expect(hitTestObjects({ x: 40, y: 9 }, [ground], 2)).toEqual({
      type: "object",
      objectId: ground.id,
    })
    expect(hitTestObjects({ x: 40, y: 14 }, [ground], 2)).toBeNull()
  })

  it("hits the schematic default body endpoint for one-post annotations", () => {
    const ground: GroundObject = {
      kind: "ground",
      id: "junc_default",
      position: { x: 0, y: 0 },
      netName: "GND",
    }

    expect(hitTestObjects({ x: 0, y: 20 }, [ground], 6)).toEqual({
      type: "object",
      objectId: ground.id,
    })
    expect(hitTestObjects({ x: 0, y: 10 }, [ground], 6)).toEqual({
      type: "object",
      objectId: ground.id,
    })
  })

  it("hits the schematic default ground bars", () => {
    const ground: GroundObject = {
      kind: "ground",
      id: "junc_default_ground",
      position: { x: 0, y: 0 },
      netName: "GND",
    }

    expect(hitTestObjects({ x: 9, y: 20 }, [ground], 2)).toEqual({
      type: "object",
      objectId: ground.id,
    })
    expect(hitTestObjects({ x: 14, y: 20 }, [ground], 2)).toBeNull()
  })

  it("hits dragged net label and probe bodies", () => {
    const label: NetLabelObject = {
      kind: "net-label",
      id: "label_body",
      text: "CLK",
      position: { x: 0, y: 0 },
      leadEnd: { x: 20, y: 0 },
    }
    const probe: ProbeObject = {
      kind: "probe",
      id: "probe_body",
      probeType: "voltage",
      name: "VP1",
      position: { x: 0, y: 40 },
      leadEnd: { x: 30, y: 40 },
    }

    expect(hitTestObjects({ x: 70, y: 0 }, [label], 2)).toEqual({
      type: "object",
      objectId: label.id,
    })
    expect(hitTestObjects({ x: 70, y: 12 }, [label], 2)).toBeNull()
    expect(hitTestObjects({ x: 30, y: 51 }, [probe], 2)).toEqual({
      type: "object",
      objectId: probe.id,
    })
    expect(hitTestObjects({ x: 54, y: 64 }, [probe], 2)).toEqual({
      type: "object",
      objectId: probe.id,
    })
  })
})

function testResistor(id: string, refdes: string): SymbolObject {
  return {
    kind: "symbol",
    id,
    componentDefinitionId: "resistor",
    symbolDefinitionId: "resistor",
    refdes,
    position: { x: 0, y: 0 },
    rotation: 0,
    props: { resistance: "1k" },
  }
}
