import { beforeEach, describe, expect, it } from "vitest"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"
import {
  captureAxisDragTargets,
  useEditorState,
} from "@/browser/editor/editor-state"
import { DEFAULT_TEXT_SIZE } from "@/browser/editor/text"
import { getPinPosts } from "@circuit-sim/core/circuit/component-geometry"
import {
  isComponent,
  type SchematicObject,
  type Component,
  type WireObject,
} from "@circuit-sim/core/circuit/project"

describe("editor store", () => {
  beforeEach(() => {
    useEditorState.getState().setProject(newCircuitProject("Store Test"))
  })

  it("does not mark newer edits as saved when an older save completes", () => {
    const store = useEditorState.getState()
    const savedProject = store.project
    if (!savedProject) {
      throw new Error("Expected a loaded project")
    }

    store.placeText({ x: 20, y: 20 })
    const editedProject = useEditorState.getState().project
    if (!editedProject) {
      throw new Error("Expected an edited project")
    }

    store.markSaved(savedProject)
    expect(useEditorState.getState().dirty).toBe(true)

    store.markSaved(editedProject)
    expect(useEditorState.getState().dirty).toBe(false)
  })

  it("places MVP components with default props and sequential refdes", () => {
    const store = useEditorState.getState()

    store.placeComponent("resistor", { x: 100, y: 120 })
    store.placeComponent("resistor", { x: 200, y: 120 })
    store.placeComponent("dc-voltage-source", { x: 20, y: 120 })

    expect(components().map((component) => component.refdes)).toEqual(["R1", "R2", "V1"])
    expect(components()[0]).toMatchObject({
      type: "resistor",
      props: { resistanceOhms: 1_000 },
    })
    expect(components()[2]).toMatchObject({
      type: "dc-voltage-source",
      props: { voltageVolts: 5 },
    })
  })

  it("places annotation and drawing primitives with MVP defaults", () => {
    const store = useEditorState.getState()

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
    const store = useEditorState.getState()
    store.placeComponent("switch", { x: 0, y: 0 })
    store.placeComponent("logic-input", { x: 80, y: 0 })
    const switchComponent = requireComponent("switch")
    const logicInput = requireComponent("logic-input")

    store.toggleSwitchState(switchComponent.id)
    expect(requireComponent("switch").props.state).toBe("closed")
    store.toggleSwitchState(switchComponent.id)
    expect(requireComponent("switch").props.state).toBe("open")

    store.toggleLogicInputPosition(logicInput.id)
    expect(requireComponent("logic-input").props.position).toBe(1)
    store.setLogicInputPosition(logicInput.id, 0, { history: false })
    expect(requireComponent("logic-input").props.position).toBe(0)
  })

  it("supports undo, redo, copy, paste, and selected duplication", () => {
    const store = useEditorState.getState()
    store.placeComponent("resistor", { x: 100, y: 120 })
    const firstResistor = requireComponent("resistor")

    store.undo()
    expect(components()).toHaveLength(0)
    store.redo()
    expect(components()).toHaveLength(1)

    store.selectObject(firstResistor.id)
    store.copySelected()
    store.pasteClipboard({ x: 20, y: 20 })
    expect(components().map((component) => component.refdes)).toEqual(["R1", "R2"])
    expect(components()[1]!.position).toEqual({ x: 120, y: 140 })

    store.selectObject(components()[1]!.id)
    store.duplicateSelected({ x: 40, y: 0 })
    expect(components().map((component) => component.refdes)).toEqual(["R1", "R2", "R3"])
  })

  it("moves captured wire endpoints and selected component posts", () => {
    const store = useEditorState.getState()
    store.placeComponent("resistor", { x: 0, y: 0 })
    store.addWire([
      { x: -40, y: 0 },
      { x: -80, y: 0 },
      { x: -80, y: 40 },
    ])

    const targets = captureAxisDragTargets(objects(), "y", 0)
    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "component" }),
        expect.objectContaining({ type: "wire-point", pointIndex: 0 }),
      ]),
    )

    store.moveAxisDragTargets("y", targets, 20)
    const wire = objects().find((object): object is WireObject => object.kind === "wire")
    expect(wire?.points[0]).toEqual({ x: -40, y: 20 })
    expect(requireComponent("resistor").position.y).toBe(20)
  })

  it("stretches an attached wire when a fixed component moves", () => {
    const store = useEditorState.getState()
    store.placeComponent("dc-voltage-source", { x: 80, y: 80 })
    const source = requireComponent("dc-voltage-source")

    store.addWire([{ x: 40, y: 80 }, { x: 0, y: 80 }])
    store.moveObject(source.id, { x: 60, y: 80 })
    const afterPin1Move = requireComponent("dc-voltage-source")
    expect(getPinPosts(afterPin1Move).map((post) => post.position)).toEqual([
      { x: 20, y: 80 },
      { x: 100, y: 80 },
    ])
    expect(objects().find((object) => object.kind === "wire")?.points[0]).toEqual({
      x: 20,
      y: 80,
    })
  })

  it("commits snapped attachments as explicit wire vertices", () => {
    const store = useEditorState.getState()
    store.addWire([{ x: 0, y: 0 }, { x: 80, y: 0 }])
    store.addWire([{ x: 40, y: 0 }, { x: 40, y: 40 }])
    store.placeGround({ x: 20, y: 0 })

    const main = objects().find(
      (object): object is WireObject => object.kind === "wire" && object.points[0]?.x === 0,
    )
    expect(main?.points).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 40, y: 0 },
      { x: 80, y: 0 },
    ])
  })
})

function objects(): ReadonlyArray<SchematicObject> {
  return useEditorState.getState().project?.objects ?? []
}

function components(): Component[] {
  return objects().filter(
    (object): object is Component => object.kind === "component",
  )
}

function requireComponent<Type extends Component["type"]>(
  type: Type,
): Extract<Component, { readonly type: Type }> {
  const component = components().find(
    (candidate): candidate is Extract<Component, { readonly type: Type }> =>
      isComponent(candidate, type),
  )
  if (!component) {
    throw new Error(`Missing component ${type}`)
  }
  return component
}

function requireObject<T extends SchematicObject>(id: string): T {
  const object = objects().find((candidate) => candidate.id === id)
  if (!object) {
    throw new Error(`Missing object ${id}`)
  }
  return object as T
}
