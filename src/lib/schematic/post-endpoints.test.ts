import {
  getNormalSymbolHandlePosts,
  getPrimarySymbolPosts,
  getTemporarySymbolHandlePositions,
  getVisiblePosts,
  getWirePostIndexes,
} from "./post-endpoints"
import {
  SYMBOL_HANDLE_END_COMPONENT_PIN_ID,
  SYMBOL_HANDLE_START_COMPONENT_PIN_ID,
} from "./symbol-geometry"
import type { SchematicObject, SymbolObject, WireObject } from "./types"

describe("post endpoints", () => {
  it("hides posts shared by exactly two objects and shows junction-like posts", () => {
    const objects: SchematicObject[] = [
      resistor("sym_1"),
      wire("wire_1", [
        { x: -40, y: 0 },
        { x: -80, y: 0 },
      ]),
      wire("wire_2", [
        { x: 40, y: 0 },
        { x: 80, y: 0 },
      ]),
      wire("wire_3", [
        { x: 80, y: 0 },
        { x: 80, y: 40 },
      ]),
      wire("wire_4", [
        { x: 80, y: 0 },
        { x: 120, y: 0 },
      ]),
    ]

    expect(getVisiblePosts(objects).map((post) => post.key)).toEqual([
      "-80:0",
      "80:0",
      "80:40",
      "120:0",
    ])
  })

  it("uses only wire endpoints as editable post indexes", () => {
    expect(
      getWirePostIndexes(
        wire("wire_1", [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 40 },
        ]),
      ),
    ).toEqual([0, 2])
  })

  it("uses Falstad-style virtual endpoints as multi-pin handles", () => {
    expect(
      getPrimarySymbolPosts(opAmp("sym_1")).map((post) => ({
        componentPinId: post.componentPinId,
        position: post.position,
      })),
    ).toEqual([
      {
        componentPinId: SYMBOL_HANDLE_START_COMPONENT_PIN_ID,
        position: { x: -48, y: 0 },
      },
      {
        componentPinId: SYMBOL_HANDLE_END_COMPONENT_PIN_ID,
        position: { x: 56, y: 0 },
      },
    ])
  })

  it("uses the same MVP handles for temporary and normal symbol overlays", () => {
    const symbol = opAmp("sym_1")
    expect(getTemporarySymbolHandlePositions(symbol)).toEqual([
      { x: -48, y: 0 },
      { x: 56, y: 0 },
    ])
    expect(getNormalSymbolHandlePosts(symbol).map((post) => post.position)).toEqual([
      { x: -48, y: 0 },
      { x: 56, y: 0 },
    ])
  })
})

function resistor(id: string): SymbolObject {
  return {
    kind: "symbol",
    id,
    componentDefinitionId: "resistor",
    symbolDefinitionId: "resistor",
    refdes: "R1",
    position: { x: 0, y: 0 },
    rotation: 0,
    props: { value: "1k" },
  }
}

function opAmp(id: string): SymbolObject {
  return {
    kind: "symbol",
    id,
    componentDefinitionId: "ideal-op-amp-minus-top",
    symbolDefinitionId: "ideal-op-amp-minus-top",
    refdes: "U1",
    position: { x: 0, y: 0 },
    rotation: 0,
    props: {},
  }
}

function wire(id: string, points: WireObject["points"]): WireObject {
  return { kind: "wire", id, points }
}
