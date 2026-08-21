import { beforeEach, describe, expect, it } from "vitest"
import { createEmptyProject } from "./create-default-project"
import {
  captureAxisDragTargets,
  useEditorStore,
} from "./editor-store"
import { getPrimarySymbolPosts } from "./post-endpoints"
import { DEFAULT_TEXT_SIZE } from "./schematic-text"
import {
  SYMBOL_HANDLE_END_COMPONENT_PIN_ID,
  SYMBOL_HANDLE_START_COMPONENT_PIN_ID,
} from "./symbol-geometry"
import { getSymbolPinWorldPosition } from "./transforms"
import type { SchematicObject, SymbolObject, WireObject } from "./types"

describe("editor store", () => {
  beforeEach(() => {
    useEditorStore.getState().setProject(createEmptyProject("Store Test"))
  })

  it("places MVP symbols with default props and sequential refdes", () => {
    const store = useEditorStore.getState()

    store.placeSymbol("resistor", { x: 100, y: 120 })
    store.placeSymbol("resistor", { x: 200, y: 120 })
    store.placeSymbol("dc-voltage-source", { x: 20, y: 120 })

    expect(symbols().map((symbol) => symbol.refdes)).toEqual(["R1", "R2", "V1"])
    expect(symbols()[0]).toMatchObject({
      componentDefinitionId: "resistor",
      symbolDefinitionId: "resistor",
      props: { value: "1k" },
    })
    expect(symbols()[2]).toMatchObject({
      componentDefinitionId: "dc-voltage-source",
      symbolDefinitionId: "dc-source",
      props: { voltage: "5V" },
    })
    expect(useEditorStore.getState().generatedTsx).toContain("<resistor")
  })

  it("places annotation and drawing primitives with MVP defaults", () => {
    const store = useEditorStore.getState()

    store.placeGround({ x: 0, y: 80 })
    store.placeVoltageProbe({ x: 40, y: 80 })
    store.placeCurrentProbe({ x: 80, y: 80 })
    store.placeNetLabel({ x: 120, y: 80 })
    store.placeText({ x: 160, y: 80 })
    store.placeLine({ x: 0, y: 0 }, { x: 20, y: 0 })
    store.placeBox({ x: 0, y: 0 }, { x: 40, y: 40 })
    store.placeLine({ x: 0, y: 0 }, { x: 4, y: 0 })
    store.placeBox({ x: 0, y: 0 }, { x: 8, y: 8 })

    expect(objects().map((object) => object.kind)).toEqual([
      "ground",
      "probe",
      "probe",
      "net-label",
      "text",
      "line",
      "box",
    ])
    expect(objects().find((object) => object.kind === "probe")).toMatchObject({
      name: "VP1",
      probeType: "voltage",
    })
    expect(objects().find((object) => object.kind === "text")).toMatchObject({
      text: "hello",
      fontSize: DEFAULT_TEXT_SIZE,
    })
  })

  it("toggles switch and logic input state in the CircuitProject", () => {
    const store = useEditorStore.getState()
    store.placeSymbol("switch", { x: 0, y: 0 })
    store.placeSymbol("logic-input", { x: 80, y: 0 })
    const switchSymbol = requireSymbol("switch")
    const logicInput = requireSymbol("logic-input")

    store.toggleSwitchState(switchSymbol.id)
    expect(requireObject<SymbolObject>(switchSymbol.id).props.state).toBe("closed")
    store.toggleSwitchState(switchSymbol.id)
    expect(requireObject<SymbolObject>(switchSymbol.id).props.state).toBe("open")

    store.toggleLogicInputPosition(logicInput.id)
    expect(requireObject<SymbolObject>(logicInput.id).props.position).toBe("1")
    store.setLogicInputPosition(logicInput.id, "0", { history: false })
    expect(requireObject<SymbolObject>(logicInput.id).props.position).toBe("0")
  })

  it("supports undo, redo, copy, paste, and selected duplication", () => {
    const store = useEditorStore.getState()
    store.placeSymbol("resistor", { x: 100, y: 120 })
    const firstResistor = requireSymbol("resistor")

    store.undo()
    expect(symbols()).toHaveLength(0)
    store.redo()
    expect(symbols()).toHaveLength(1)

    store.selectObject(firstResistor.id)
    store.copySelected()
    store.pasteClipboard({ x: 20, y: 20 })
    expect(symbols().map((symbol) => symbol.refdes)).toEqual(["R1", "R2"])
    expect(symbols()[1]?.position).toEqual({ x: 120, y: 140 })

    store.selectObject(symbols()[1]!.id)
    store.duplicateSelected({ x: 40, y: 0 })
    expect(symbols().map((symbol) => symbol.refdes)).toEqual(["R1", "R2", "R3"])
  })

  it("moves captured wire endpoints and selected symbol posts", () => {
    const store = useEditorStore.getState()
    store.placeSymbol("resistor", { x: 0, y: 0 })
    store.addWire([
      { x: -40, y: 0 },
      { x: -80, y: 0 },
      { x: -80, y: 40 },
    ])

    const targets = captureAxisDragTargets(objects(), "y", 0)
    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "symbol-pin" }),
        expect.objectContaining({ type: "wire-point", pointIndex: 0 }),
      ]),
    )

    store.moveAxisDragTargets("y", targets, 20)
    const wire = objects().find((object): object is WireObject => object.kind === "wire")
    expect(wire?.points[0]).toEqual({ x: -40, y: 20 })
    expect(requireSymbol("resistor").position.y).toBe(20)
  })

  it("keeps source drag-post handles attached to the correct pins", () => {
    const store = useEditorStore.getState()
    store.placeSymbol("dc-voltage-source", { x: 80, y: 80 })
    const source = requireSymbol("dc-voltage-source")

    store.moveSymbolPin(source.id, "pin1", { x: 20, y: 80 })
    const afterPin1Move = requireSymbol("dc-voltage-source")
    expect(getSymbolPinWorldPosition(afterPin1Move, "pin1")).toEqual({
      x: 20,
      y: 80,
    })
    expect(getSymbolPinWorldPosition(afterPin1Move, "pin2")).toEqual({
      x: 120,
      y: 80,
    })

    store.moveSymbolPin(source.id, "pin2", { x: 180, y: 80 })
    const afterPin2Move = requireSymbol("dc-voltage-source")
    expect(getSymbolPinWorldPosition(afterPin2Move, "pin1")).toEqual({
      x: 20,
      y: 80,
    })
    expect(getSymbolPinWorldPosition(afterPin2Move, "pin2")).toEqual({
      x: 180,
      y: 80,
    })
  })

  it("uses Falstad-style virtual handles for multi-pin drag-post edits", () => {
    const store = useEditorStore.getState()
    store.placeSymbol("npn-transistor", { x: 0, y: 0 })
    const transistor = requireSymbol("npn-transistor")

    expect(
      getPrimarySymbolPosts(transistor).map((post) => ({
        componentPinId: post.componentPinId,
        position: post.position,
      })),
    ).toEqual([
      {
        componentPinId: SYMBOL_HANDLE_START_COMPONENT_PIN_ID,
        position: { x: -40, y: 0 },
      },
      {
        componentPinId: SYMBOL_HANDLE_END_COMPONENT_PIN_ID,
        position: { x: 32, y: 0 },
      },
    ])

    store.moveSymbolPin(transistor.id, SYMBOL_HANDLE_END_COMPONENT_PIN_ID, {
      x: 72,
      y: 0,
    })
    const moved = requireSymbol("npn-transistor")
    expect(getSymbolPinWorldPosition(moved, "pin1")).toEqual({ x: -40, y: 0 })
    expect(getSymbolPinWorldPosition(moved, "pin2")).toEqual({ x: 72, y: -32 })
    expect(getSymbolPinWorldPosition(moved, "pin3")).toEqual({ x: 72, y: 32 })
  })
})

function objects(): SchematicObject[] {
  return useEditorStore.getState().project?.sheets[0]?.objects ?? []
}

function symbols(): SymbolObject[] {
  return objects().filter(
    (object): object is SymbolObject => object.kind === "symbol",
  )
}

function requireSymbol(componentDefinitionId: string): SymbolObject {
  const symbol = symbols().find(
    (candidate) => candidate.componentDefinitionId === componentDefinitionId,
  )
  if (!symbol) {
    throw new Error(`Missing symbol ${componentDefinitionId}`)
  }
  return symbol
}

function requireObject<T extends SchematicObject>(id: string): T {
  const object = objects().find((candidate) => candidate.id === id)
  if (!object) {
    throw new Error(`Missing object ${id}`)
  }
  return object as T
}
