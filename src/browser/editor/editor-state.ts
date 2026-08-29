import { DateTime } from "effect"
import { createElement, type ReactNode } from "react"
import { RegistryContext, RegistryProvider, useAtomValue } from "@effect/atom-react"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { newId } from "@circuit-sim/core/ids"
import {
  getNextRefdes,
  getComponent,
  type ComponentPropertyEdit,
  type ComponentType,
  type LogicInputPosition,
} from "@circuit-sim/core/circuit/components"
import {
  applyCircuitEdit,
  applyCircuitEdits,
  type CircuitEdit,
} from "@circuit-sim/core/circuit/edit"
import { runErc, type ElectricalIssue } from "@circuit-sim/core/circuit/erc"
import {
  observeRun,
  type RunObservationReport,
} from "@circuit-sim/core/simulation/run-observations"
import type { SimulationRun } from "@circuit-sim/core/simulation/simulation-run"
import {
  canCreateVisualBox,
  canCreateVisualLine,
} from "./canvas-gestures"
import {
  getPrimaryComponentPosts,
  getWirePostIndexes,
} from "./post-endpoints"
import { nextLogicInputPosition } from "./interaction"
import { DEFAULT_TEXT_SIZE } from "./text"
import { getPinPosts } from "@circuit-sim/core/circuit/component-geometry"
import { pointsEqual } from "@circuit-sim/core/circuit/geometry"
import { objectMoveAnchor } from "./object-geometry"
import {
  convertWireToRoutedWire,
  hasConvertibleWires,
  rerouteWireVia as rerouteWireThroughVia,
  splitWireAtPoint,
} from "./wire-routing"
import {
  makeComponent,
  type CircuitProject,
  type SchematicObject,
  type Component,
  type Point,
  type WireObject,
} from "@circuit-sim/core/circuit/project"

const HISTORY_LIMIT = 100

export type FlipAxis = "x" | "y" | "xy"

export type AxisDragTarget =
  | { type: "wire-point"; objectId: string; pointIndex: number }
  | { type: "shape-post"; objectId: string; endpoint: "start" | "end" }
  | { type: "component"; objectId: string }
  | { type: "position"; objectId: string }

export type EditorTool =
  | { type: "select" }
  | {
      type: "place-component"
      component: ComponentType
    }
  | { type: "draw-wire"; routeMode?: "straight" | "routed" }
  | { type: "drag-all" }
  | { type: "drag-row" }
  | { type: "drag-column" }
  | { type: "drag-selected" }
  | { type: "drag-post" }
  | { type: "place-ground" }
  | { type: "place-voltage-probe" }
  | { type: "place-current-probe" }
  | { type: "place-net-label" }
  | { type: "place-text" }
  | { type: "place-box" }
  | { type: "place-line" }

export type EditorState = {
  project: CircuitProject | null
  selectedObjectIds: string[]
  historyPast: CircuitProject[]
  historyFuture: CircuitProject[]
  clipboardObjects: SchematicObject[]
  tool: EditorTool
  dirty: boolean
  ercIssues: ElectricalIssue[]
  latestRun: SimulationRun | null
  observations: RunObservationReport | null

  setProject(project: CircuitProject, options?: { dirty?: boolean }): void
  clearProject(): void
  setTool(tool: EditorTool): void
  selectObject(id: string | null, options?: { toggle?: boolean }): void
  selectObjects(ids: string[], options?: { additive?: boolean }): void
  checkpointHistory(): void
  undo(): void
  redo(): void
  copySelected(): void
  pasteClipboard(offset?: Point): void
  placeComponent(
    type: ComponentType,
    start: Point,
    end?: Point,
  ): void
  placeGround(position: Point): void
  placeVoltageProbe(position: Point): void
  placeCurrentProbe(position: Point): void
  placeNetLabel(position: Point, text?: string): void
  placeText(position: Point, text?: string): void
  placeBox(start: Point, end: Point): void
  placeLine(start: Point, end: Point): void
  moveObject(id: string, position: Point): void
  moveObjects(
    positions: ReadonlyArray<{ objectId: string; position: Point }>,
  ): void
  moveObjectsOnAxis(axis: "x" | "y", line: number, delta: number): void
  moveAxisDragTargets(
    axis: "x" | "y",
    targets: AxisDragTarget[],
    delta: number,
  ): void
  moveObjectsAtPost(position: Point, delta: Point): void
  updateShapePost(id: string, endpoint: "start" | "end", position: Point): void
  nudgeSelected(delta: Point): void
  rotateObject(id: string): void
  flipObject(id: string, axis: FlipAxis): void
  swapObjectTerminals(id: string): void
  rotateSelected(): void
  duplicateSelected(offset?: Point): void
  alignSelected(axis: "x" | "y"): void
  distributeSelected(axis: "x" | "y"): void
  deleteSelected(): void
  addWire(points: ReadonlyArray<Point>): void
  convertWiresToRoutedWires(): void
  rerouteWireVia(id: string, via: Point): void
  updateWirePoint(id: string, pointIndex: number, position: Point): void
  insertWirePoint(id: string, afterPointIndex: number, position: Point): void
  toggleSwitchState(id: string): void
  setLogicInputPosition(
    id: string,
    position: LogicInputPosition,
    options?: { history?: boolean },
  ): void
  toggleLogicInputPosition(id: string): void
  updateComponentProperty(id: string, edit: ComponentPropertyEdit): void
  updateObjectText(id: string, text: string): void
  setLatestRun(run: SimulationRun): void
  recompute(): void
  markSaved(savedProject: CircuitProject): void
}

type DerivedState = Pick<EditorState, "ercIssues" | "observations">

function derive(
  project: CircuitProject | null,
  latestRun: SimulationRun | null,
): DerivedState {
  if (!project) {
    return { ercIssues: [], observations: null }
  }
  return {
    ercIssues: runErc(project),
    observations: latestRun ? observeRun(project, latestRun) : null,
  }
}

type StoreSet = (
  update:
    | Partial<EditorState>
    | ((state: EditorState) => Partial<EditorState>),
) => void
type StoreGet = () => EditorState

function createEditorActions(set: StoreSet, get: StoreGet): EditorActions {
  return {
    setProject(project, options = {}) {
      set({
        project,
        selectedObjectIds: [],
        historyPast: [],
        historyFuture: [],
        dirty: options.dirty ?? false,
        latestRun: null,
      })
    },

    clearProject() {
      set({
        project: null,
        selectedObjectIds: [],
        historyPast: [],
        historyFuture: [],
        clipboardObjects: [],
        dirty: false,
        latestRun: null,
      })
    },

    setTool(tool) {
      set({ tool })
    },

    selectObject(id, options = {}) {
      if (!id) {
        set({ selectedObjectIds: [] })
        return
      }
      if (!options.toggle) {
        set({ selectedObjectIds: [id] })
        return
      }
      set((state) => {
        const selected = new Set(state.selectedObjectIds)
        if (selected.has(id)) {
          selected.delete(id)
        } else {
          selected.add(id)
        }
        return { selectedObjectIds: [...selected] }
      })
    },

    selectObjects(ids, options = {}) {
      const uniqueIds = [...new Set(ids)]
      if (!options.additive) {
        set({ selectedObjectIds: uniqueIds })
        return
      }
      set((state) => ({
        selectedObjectIds: [...new Set([...state.selectedObjectIds, ...uniqueIds])],
      }))
    },

    checkpointHistory() {
      const project = get().project
      if (!project) {
        return
      }
      pushHistory(set, project)
    },

    undo() {
      const state = get()
      const previous = state.historyPast.at(-1)
      if (!state.project || !previous) {
        return
      }
      const nextPast = state.historyPast.slice(0, -1)
      const nextProject = previous
      set({
        project: nextProject,
        historyPast: nextPast,
        historyFuture: [state.project, ...state.historyFuture].slice(0, HISTORY_LIMIT),
        selectedObjectIds: [],
        dirty: true,
      })
    },

    redo() {
      const state = get()
      const next = state.historyFuture[0]
      if (!state.project || !next) {
        return
      }
      const nextProject = next
      set({
        project: nextProject,
        historyPast: [...state.historyPast, state.project].slice(-HISTORY_LIMIT),
        historyFuture: state.historyFuture.slice(1),
        selectedObjectIds: [],
        dirty: true,
      })
    },

    copySelected() {
      const state = get()
      const selected = new Set(state.selectedObjectIds)
      const objects = state.project
        ? state.project.objects.filter((object) => selected.has(object.id))
        : []
      set({ clipboardObjects: structuredClone(objects) })
    },

    pasteClipboard(offset = { x: 40, y: 40 }) {
      const clipboard = get().clipboardObjects
      if (clipboard.length === 0) {
        return
      }
      let nextSelectedIds: string[] = []
      mutateProject(set, get, (project) => {
        const nextObjects: SchematicObject[] = []
        for (const object of clipboard) {
          nextObjects.push(
            duplicateObject(object, [...project.objects, ...nextObjects], offset),
          )
        }
        nextSelectedIds = nextObjects.map((object) => object.id)
        return applyObjectChanges(project, (objects) => [
          ...objects,
          ...nextObjects,
        ])
      })
      if (nextSelectedIds.length > 0) {
        set({ selectedObjectIds: nextSelectedIds })
      }
    },

    placeComponent(type, start, end) {
      mutateProject(set, get, (project) => {
        const spec = getComponent(type)
        return applyObjectChanges(project, (objects) => [
          ...objects,
          makeComponent({
            kind: "component",
            id: newId(),
            type,
            refdes: getNextRefdes(objects, type),
            position: end ? midpoint(start, end) : start,
            rotation: end ? rotationToward(start, end) : 0,
            flipped: false,
            props: spec.defaults,
          }),
        ])
      })
    },

    placeGround(position) {
      mutateProject(set, get, (project) =>
        applyObjectChanges(project, (objects) => [
          ...objects,
          {
            kind: "ground",
            id: newId(),
            position,
            netName: "GND",
          },
        ]),
      )
    },

    placeVoltageProbe(position) {
      mutateProject(set, get, (project) =>
        applyObjectChanges(project, (objects) => {
          const nextIndex =
            objects.filter(
              (object) => object.kind === "probe" && object.probeType === "voltage",
            ).length + 1
          return [
            ...objects,
            {
              kind: "probe",
              id: newId(),
              probeType: "voltage",
              name: `VP${nextIndex}`,
              position,
            },
          ]
        }),
      )
    },

    placeCurrentProbe(position) {
      mutateProject(set, get, (project) =>
        applyObjectChanges(project, (objects) => {
          const nextIndex =
            objects.filter(
              (object) => object.kind === "probe" && object.probeType === "current",
            ).length + 1
          return [
            ...objects,
            {
              kind: "probe",
              id: newId(),
              probeType: "current",
              name: `IP${nextIndex}`,
              position,
            },
          ]
        }),
      )
    },

    placeNetLabel(position, text) {
      mutateProject(set, get, (project) =>
        applyObjectChanges(project, (objects) => {
          const nextIndex =
            objects.filter((object) => object.kind === "net-label").length + 1
          return [
            ...objects,
            {
              kind: "net-label",
              id: newId(),
              text: text ?? `NET${nextIndex}`,
              position,
            },
          ]
        }),
      )
    },

    placeText(position, text = "hello") {
      mutateProject(set, get, (project) =>
        applyObjectChanges(project, (objects) => [
          ...objects,
          {
            kind: "text",
            id: newId(),
            text,
            fontSize: DEFAULT_TEXT_SIZE,
            position,
          },
        ]),
      )
    },

    placeBox(start, end) {
      if (!canCreateVisualBox(start, end)) {
        return
      }
      mutateProject(set, get, (project) =>
        applyObjectChanges(project, (objects) => [
          ...objects,
          {
            kind: "box",
            id: newId(),
            start,
            end,
          },
        ]),
      )
    },

    placeLine(start, end) {
      if (!canCreateVisualLine(start, end)) {
        return
      }
      mutateProject(set, get, (project) =>
        applyObjectChanges(project, (objects) => [
          ...objects,
          {
            kind: "line",
            id: newId(),
            start,
            end,
          },
        ]),
      )
    },

    moveObject(id, position) {
      mutateProject(set, get, (project) => {
        const object = project.objects.find((candidate) => candidate.id === id)
        if (!object) return project
        return applyPut(project, moveObjectToAnchor(object, position))
      })
    },

    moveObjects(positions) {
      if (positions.length === 0) return
      const positionById = new Map(
        positions.map(({ objectId, position }) => [objectId, position]),
      )
      mutateProject(
        set,
        get,
        (project) =>
          applyObjectChanges(project, (objects) =>
            objects.map((object) =>
              positionById.has(object.id)
                ? moveObjectToAnchor(object, positionById.get(object.id)!)
                : object,
            ),
          ),
        { history: false },
      )
    },

    moveObjectsOnAxis(axis, line, delta) {
      if (delta === 0) {
        return
      }
      mutateProject(
        set,
        get,
        (project) =>
          applyObjectChanges(project, (objects) =>
            objects
              .map((object) => moveObjectPostsOnAxis(object, axis, line, delta))
              .filter(isPresentSchematicObject),
          ),
        { history: false },
      )
    },

    moveAxisDragTargets(axis, targets, delta) {
      if (delta === 0 || targets.length === 0) {
        return
      }
      mutateProject(
        set,
        get,
        (project) =>
          applyObjectChanges(project, (objects) =>
            objects
              .map((object) =>
                moveCapturedObjectPostsOnAxis(object, axis, targets, delta),
              )
              .filter(isPresentSchematicObject),
          ),
        { history: false },
      )
    },

    moveObjectsAtPost(position, delta) {
      if (delta.x === 0 && delta.y === 0) {
        return
      }
      mutateProject(
        set,
        get,
        (project) =>
          applyObjectChanges(project, (objects) =>
            objects.map((object) => moveObjectPostsAt(object, position, delta)),
          ),
        { history: false },
      )
    },

    updateShapePost(id, endpoint, position) {
      mutateProject(
        set,
        get,
        (project) =>
          applyObjectChanges(project, (objects) =>
            objects.map((object) =>
              (object.kind === "line" || object.kind === "box") && object.id === id
                ? updateTwoPointAnnotationPost(object, endpoint, position)
                : object,
            ),
          ),
        { history: false },
      )
    },

    nudgeSelected(delta) {
      const selected = new Set(get().selectedObjectIds)
      if (selected.size === 0) {
        return
      }
      mutateProject(set, get, (project) => {
        let next = applyObjectChanges(project, (objects) =>
          objects.map((object) => {
            if (!selected.has(object.id)) {
              return object
            }
            if (object.kind === "component") return object
            if (object.kind === "wire") {
              return {
                ...object,
                points: object.points.map((point) => ({
                  x: point.x + delta.x,
                  y: point.y + delta.y,
                })),
              }
            }
            if (isTwoPointAnnotation(object)) {
              return translateTwoPointAnnotation(object, delta)
            }
            if (hasPosition(object)) {
              return {
                ...object,
                position: translatePoint(object.position, delta),
              }
            }
            return object
          }),
        )
        for (const object of project.objects) {
          if (selected.has(object.id) && object.kind === "component") {
            next = applyPut(next, translateComponent(object, delta))
          }
        }
        return next
      })
    },

    rotateObject(id) {
      mutateProject(set, get, (project) => {
        const component = project.objects.find(
          (object): object is Component => object.id === id && object.kind === "component",
        )
        return component ? applyPut(project, rotateComponent(component)) : project
      })
    },

    flipObject(id, axis) {
      mutateProject(set, get, (project) => {
        const object = project.objects.find((candidate) => candidate.id === id)
        return object ? applyPut(project, flipSchematicObject(object, axis)) : project
      })
    },

    swapObjectTerminals(id) {
      mutateProject(set, get, (project) => {
        const object = project.objects.find((candidate) => candidate.id === id)
        return object ? applyPut(project, swapObjectTerminals(object)) : project
      })
    },

    rotateSelected() {
      const selected = new Set(get().selectedObjectIds)
      if (selected.size === 0) {
        return
      }
      mutateProject(set, get, (project) => {
        let next = project
        for (const object of project.objects) {
          if (selected.has(object.id) && object.kind === "component") {
            next = applyPut(next, rotateComponent(object))
          }
        }
        return next
      })
    },

    duplicateSelected(offset = { x: 40, y: 40 }) {
      const selected = new Set(get().selectedObjectIds)
      if (selected.size === 0) {
        return
      }
      let nextSelectedIds: string[] = []
      mutateProject(set, get, (project) => {
        const nextObjects: SchematicObject[] = []
        for (const object of project.objects) {
          if (!selected.has(object.id)) {
            continue
          }
          const duplicate = duplicateObject(
            object,
            [...project.objects, ...nextObjects],
            offset,
          )
          nextObjects.push(duplicate)
        }
        nextSelectedIds = nextObjects.map((object) => object.id)
        return applyObjectChanges(project, (objects) => [
          ...objects,
          ...nextObjects,
        ])
      })
      if (nextSelectedIds.length > 0) {
        set({ selectedObjectIds: nextSelectedIds })
      }
    },

    alignSelected(axis) {
      const selected = new Set(get().selectedObjectIds)
      if (selected.size < 2) return
      mutateProject(set, get, (project) => {
        const objects = project.objects
        const movable = objects.flatMap((object) => {
          const anchor = selected.has(object.id) ? objectMoveAnchor(object) : null
          return anchor ? [{ object, anchor }] : []
        })
        const coordinate = movable[0]?.anchor[axis]
        if (coordinate === undefined) return project
        return applyObjectChanges(project, (current) =>
          current.map((object) => {
            const anchor = selected.has(object.id) ? objectMoveAnchor(object) : null
            return anchor
              ? moveObjectToAnchor(object, { ...anchor, [axis]: coordinate })
              : object
          }),
        )
      })
    },

    distributeSelected(axis) {
      const selected = new Set(get().selectedObjectIds)
      if (selected.size < 3) return
      mutateProject(set, get, (project) => {
        const objects = project.objects
        const movable = objects
          .flatMap((object) => {
            const anchor = selected.has(object.id) ? objectMoveAnchor(object) : null
            return anchor ? [{ object, anchor }] : []
          })
          .sort((a, b) => a.anchor[axis] - b.anchor[axis])
        if (movable.length < 3) return project
        const first = movable[0]!.anchor[axis]
        const step = (movable.at(-1)!.anchor[axis] - first) / (movable.length - 1)
        const coordinates = new Map(
          movable.map(({ object }, index) => [
            object.id,
            Math.round(first + step * index),
          ]),
        )
        return applyObjectChanges(project, (current) =>
          current.map((object) => {
            const anchor = objectMoveAnchor(object)
            const coordinate = coordinates.get(object.id)
            return anchor && coordinate !== undefined
              ? moveObjectToAnchor(object, { ...anchor, [axis]: coordinate })
              : object
          }),
        )
      })
    },

    deleteSelected() {
      const selected = new Set(get().selectedObjectIds)
      if (selected.size === 0) {
        return
      }
      mutateProject(set, get, (project) =>
        applyObjectChanges(project, (objects) =>
          objects.filter((object) => !selected.has(object.id)),
        ),
      )
      set({ selectedObjectIds: [] })
    },

    addWire(points) {
      if (points.length < 2) {
        return
      }
      mutateProject(set, get, (project) =>
        applyObjectChanges(project, (objects) => {
          return [...objects, { kind: "wire", id: newId(), points }]
        }),
      )
    },

    convertWiresToRoutedWires() {
      const state = get()
      const objects = state.project?.objects
      if (!objects || !hasConvertibleWires(objects)) {
        return
      }

      mutateProject(set, get, (project) =>
        applyObjectChanges(project, (objects) =>
          objects.map((object) =>
            object.kind === "wire" ? convertWireToRoutedWire(object) : object,
          ),
        ),
      )
    },

    updateWirePoint(id, pointIndex, position) {
      mutateProject(
        set,
        get,
        (project) =>
          applyObjectChanges(project, (objects) =>
            objects.map((object) =>
              object.kind === "wire" && object.id === id
                ? updateWirePointPosition(object, pointIndex, position)
                : object,
            ),
          ),
        { history: false },
      )
    },

    rerouteWireVia(id, via) {
      mutateProject(
        set,
        get,
        (project) =>
          applyObjectChanges(project, (objects) =>
            objects.map((object) =>
              object.kind === "wire" && object.id === id
                ? rerouteWireThroughVia(object, via)
                : object,
            ),
          ),
        { history: false },
      )
    },

    insertWirePoint(id, afterPointIndex, position) {
      mutateProject(set, get, (project) =>
        applyObjectChanges(project, (objects) =>
          objects.map((object) => {
            if (object.kind !== "wire" || object.id !== id) {
              return object
            }
            return {
              ...object,
              points: [
                ...object.points.slice(0, afterPointIndex + 1),
                position,
                ...object.points.slice(afterPointIndex + 1),
              ],
            }
          }),
        ),
      )
    },

    toggleSwitchState(id) {
      mutateProject(set, get, (project) =>
        applyObjectChanges(project, (objects) =>
          objects.map((object) =>
            object.id === id &&
            object.kind === "component" &&
            object.type === "switch"
              ? {
                  ...object,
                  props: {
                    ...object.props,
                    state: object.props.state === "closed" ? "open" : "closed",
                  },
                }
              : object,
          ),
        ),
      )
    },

    setLogicInputPosition(id, position, options = {}) {
      mutateProject(
        set,
        get,
        (project) =>
          applyObjectChanges(project, (objects) =>
            objects.map((object) =>
              object.id === id &&
              object.kind === "component" &&
              object.type === "logic-input"
                ? { ...object, props: { ...object.props, position } }
                : object,
            ),
          ),
        options.history === undefined ? {} : { history: options.history },
      )
    },

    toggleLogicInputPosition(id) {
      mutateProject(set, get, (project) =>
        applyObjectChanges(project, (objects) =>
          objects.map((object) => {
            if (
              object.id !== id ||
              object.kind !== "component" ||
              object.type !== "logic-input"
            ) {
              return object
            }
            const position = nextLogicInputPosition(object)
            return { ...object, props: { ...object.props, position } }
          }),
        ),
      )
    },

    updateComponentProperty(id, edit) {
      mutateProject(set, get, (project) =>
        applyObjectChanges(project, (objects) =>
          objects.map((object) =>
            object.id === id &&
            object.kind === "component" &&
            object.type === edit.componentType
              ? makeComponent({
                  ...object,
                  props: { ...object.props, [edit.key]: edit.value },
                })
              : object,
          ),
        ),
      )
    },

    updateObjectText(id, text) {
      mutateProject(set, get, (project) =>
        applyObjectChanges(project, (objects) =>
          objects.map((object) => {
            if (object.id !== id) {
              return object
            }
            if (object.kind === "net-label" || object.kind === "text") {
              return { ...object, text }
            }
            if (object.kind === "probe") {
              return { ...object, name: text }
            }
            return object
          }),
        ),
      )
    },

    recompute() {
      set((state) => ({ ...derive(state.project, state.latestRun) }))
    },

    setLatestRun(result) {
      set({ latestRun: result })
    },

    markSaved(savedProject) {
      if (get().project === savedProject) {
        set({ dirty: false })
      }
    },
  }
}

export type EditorSession = Pick<
  EditorState,
  | "project"
  | "selectedObjectIds"
  | "historyPast"
  | "historyFuture"
  | "clipboardObjects"
  | "tool"
  | "dirty"
  | "latestRun"
>

type EditorActions = Omit<
  EditorState,
  keyof EditorSession | keyof DerivedState
>

const initialSession: EditorSession = {
  project: null,
  selectedObjectIds: [],
  historyPast: [],
  historyFuture: [],
  clipboardObjects: [],
  tool: { type: "select" },
  dirty: false,
  latestRun: null,
}

export const editorSessionAtom = Atom.make<EditorSession>(initialSession)

const editorDerivedAtom = Atom.make((get) => {
  const session = get(editorSessionAtom)
  return derive(session.project, session.latestRun)
})
const actionsByRegistry = new WeakMap<
  AtomRegistry.AtomRegistry,
  EditorActions
>()

function editorActions(
  registry: AtomRegistry.AtomRegistry,
): EditorActions {
  const cached = actionsByRegistry.get(registry)
  if (cached) {
    return cached
  }

  const get: StoreGet = () => registry.get(editorStateAtom)
  const set: StoreSet = (update) => {
    const state = get()
    const partial = typeof update === "function" ? update(state) : update
    if (
      "ercIssues" in partial ||
      "observations" in partial
    ) {
      registry.refresh(editorDerivedAtom)
    }
    const next = { ...state, ...partial }
    registry.set(editorSessionAtom, toEditorSession(next))
  }
  const actions = createEditorActions(set, get)
  actionsByRegistry.set(registry, actions)
  return actions
}

export const editorStateAtom = Atom.make((get): EditorState => ({
  ...get(editorSessionAtom),
  ...get(editorDerivedAtom),
  ...editorActions(get.registry),
}))

function toEditorSession(state: EditorState): EditorSession {
  return {
    project: state.project,
    selectedObjectIds: state.selectedObjectIds,
    historyPast: state.historyPast,
    historyFuture: state.historyFuture,
    clipboardObjects: state.clipboardObjects,
    tool: state.tool,
    dirty: state.dirty,
    latestRun: state.latestRun,
  }
}

export const defaultEditorRegistry = AtomRegistry.make()

type EditorStateHook = {
  <A>(selector: (state: EditorState) => A): A
  getState(): EditorState
}

export const useEditorState: EditorStateHook = Object.assign(
  <A>(selector: (state: EditorState) => A): A =>
    useAtomValue(editorStateAtom, selector),
  { getState: () => defaultEditorRegistry.get(editorStateAtom) },
)

export function EditorAtomProvider({
  children,
  registry,
}: {
  readonly children?: ReactNode
  readonly registry?: AtomRegistry.AtomRegistry
}) {
  return registry
    ? createElement(RegistryContext.Provider, { value: registry }, children)
    : createElement(RegistryProvider, { children })
}

export function getEditorState(registry: AtomRegistry.AtomRegistry): EditorState {
  return registry.get(editorStateAtom)
}

function mutateProject(
  set: StoreSet,
  get: StoreGet,
  updater: (project: CircuitProject) => CircuitProject,
  options: { history?: boolean } = {},
): void {
  const state = get()
  const project = state.project
  if (!project) {
    return
  }
  const nextProject = touchProject(commitExplicitConnections(updater(project)))
  const history =
    options.history === false
      ? {}
      : {
          historyPast: [...state.historyPast, project].slice(-HISTORY_LIMIT),
          historyFuture: [],
        }
  set({
    project: nextProject,
    dirty: true,
    ...history,
  })
}

function applyPut(
  project: CircuitProject,
  object: SchematicObject,
): CircuitProject {
  return applyCircuitEdit(project, { _tag: "PutObject", object })
}

/** Browser transforms produce edits; only the core edit algebra mutates a project. */
function applyObjectChanges(
  project: CircuitProject,
  update: (objects: ReadonlyArray<SchematicObject>) => ReadonlyArray<SchematicObject>,
): CircuitProject {
  const next = update(project.objects)
  const nextIds = new Set(next.map((object) => object.id))
  const removed = project.objects
    .filter((object) => !nextIds.has(object.id))
    .map((object) => object.id)
  const currentById = new Map(project.objects.map((object) => [object.id, object]))
  const changed = next.filter((object) => currentById.get(object.id) !== object)
  const edits: CircuitEdit[] = []
  if (removed.length > 0) edits.push({ _tag: "RemoveObjects", ids: removed })
  for (const object of changed.filter((object) => object.kind !== "component")) {
    edits.push({ _tag: "PutObject", object })
  }
  for (const object of changed.filter((object) => object.kind === "component")) {
    edits.push({ _tag: "PutObject", object })
  }
  return applyCircuitEdits(project, edits)
}

/** Commits visible snaps as exact vertices; extraction never needs proximity rules. */
function commitExplicitConnections(project: CircuitProject): CircuitProject {
  const points = new Map<string, Point>()
  for (const object of project.objects) {
    const attachments = object.kind === "component"
      ? getPinPosts(object).map((pin) => pin.position)
      : object.kind === "wire"
        ? [object.points[0]!, object.points.at(-1)!]
        : object.kind === "ground" || object.kind === "net-label" || object.kind === "probe"
          ? [object.position]
          : []
    for (const point of attachments) points.set(`${point.x},${point.y}`, point)
  }

  return applyObjectChanges(project, (objects) => {
    let connected = [...objects]
    for (const point of points.values()) {
      connected = connected.map((object) => {
        if (object.kind !== "wire") return object
        const split = splitWireAtPoint(object, point)
        return split
          ? {
              ...object,
              points: [
                ...object.points.slice(0, split.afterPointIndex + 1),
                split.position,
                ...object.points.slice(split.afterPointIndex + 1),
              ],
            }
          : object
      })
    }
    return connected
  })
}

function touchProject(project: CircuitProject): CircuitProject {
  return {
    ...project,
    updatedAt: DateTime.nowUnsafe(),
  }
}

export function captureAxisDragTargets(
  objects: ReadonlyArray<SchematicObject>,
  axis: "x" | "y",
  line: number,
): AxisDragTarget[] {
  const targets: AxisDragTarget[] = []
  for (const object of objects) {
    if (object.kind === "wire") {
      getWirePostIndexes(object).forEach((pointIndex) => {
        const point = object.points[pointIndex]
        if (point?.[axis] === line) {
          targets.push({
            type: "wire-point",
            objectId: object.id,
            pointIndex,
          })
        }
      })
      continue
    }

    if (isTwoPointAnnotation(object)) {
      if (object.start[axis] === line) {
        targets.push({
          type: "shape-post",
          objectId: object.id,
          endpoint: "start",
        })
      }
      if (object.end[axis] === line) {
        targets.push({
          type: "shape-post",
          objectId: object.id,
          endpoint: "end",
        })
      }
      continue
    }

    if (object.kind === "component") {
      const pins = getPinPosts(object)
      const axisPins =
        pins.length === 2 ? pins : getPrimaryComponentPosts(object)
      if (axisPins.some((pin) => pin.position[axis] === line)) {
        targets.push({ type: "component", objectId: object.id })
      }
      continue
    }

    if (hasPosition(object) && object.position[axis] === line) {
      targets.push({ type: "position", objectId: object.id })
    }
  }
  return targets
}

function pushHistory(
  set: StoreSet,
  project: CircuitProject,
): void {
  set((state) => ({
    historyPast: [...state.historyPast, project].slice(-HISTORY_LIMIT),
    historyFuture: [],
  }))
}

function rotateComponent(component: Component): Component {
  return {
    ...component,
    rotation: ((component.rotation + 90) % 360) as Component["rotation"],
  }
}

function rotationToward(start: Point, end: Point): Component["rotation"] {
  const dx = end.x - start.x
  const dy = end.y - start.y
  return Math.abs(dx) >= Math.abs(dy)
    ? dx >= 0 ? 0 : 180
    : dy >= 0 ? 90 : 270
}

function flipSchematicObject(
  object: SchematicObject,
  axis: FlipAxis,
): SchematicObject {
  if (object.kind === "component") {
    return {
      ...object,
      flipped: !object.flipped,
    }
  }
  if (object.kind === "wire") {
    const center = centerOfPoints(object.points)
    return {
      ...object,
      points: object.points.map((point) => flipPoint(point, center, axis)),
    }
  }
  if (isTwoPointAnnotation(object)) {
    const center = centerOfPoints(twoPointAnnotationPoints(object))
    return {
      ...object,
      start: flipPoint(object.start, center, axis),
      end: flipPoint(object.end, center, axis),
    }
  }
  return object
}

function swapObjectTerminals(object: SchematicObject): SchematicObject {
  if (object.kind === "wire") {
    return { ...object, points: [...object.points].reverse() }
  }
  if (object.kind === "line") {
    return { ...object, start: object.end, end: object.start }
  }
  if (object.kind === "component") {
    return {
      ...object,
      rotation: ((object.rotation + 180) % 360) as Component["rotation"],
    }
  }
  return object
}

function centerOfPoints(points: ReadonlyArray<Point>): Point {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  }
}

function flipPoint(point: Point, center: Point, axis: FlipAxis): Point {
  if (axis === "x") {
    return { x: center.x * 2 - point.x, y: point.y }
  }
  if (axis === "y") {
    return { x: point.x, y: center.y * 2 - point.y }
  }
  return {
    x: center.x + point.y - center.y,
    y: center.y + point.x - center.x,
  }
}

type PositionedSchematicObject = Extract<
  SchematicObject,
  { readonly position: Point }
>

function hasPosition(
  object: SchematicObject,
): object is PositionedSchematicObject {
  return "position" in object
}

function isPresentSchematicObject(
  object: SchematicObject | null,
): object is SchematicObject {
  return object !== null
}

function moveObjectPostsOnAxis(
  object: SchematicObject,
  axis: "x" | "y",
  line: number,
  delta: number,
): SchematicObject | null {
  const moveDelta = axis === "x" ? { x: delta, y: 0 } : { x: 0, y: delta }

  if (object.kind === "wire") {
    const pointIndexes = new Set(
      getWirePostIndexes(object).filter(
        (pointIndex) => object.points[pointIndex]?.[axis] === line,
      ),
    )
    return moveWirePostIndexesOnAxis(object, axis, pointIndexes, delta)
  }

  if (isTwoPointAnnotation(object)) {
    const moved = {
      ...object,
      start:
        object.start[axis] === line
          ? translatePoint(object.start, moveDelta)
          : object.start,
      end:
        object.end[axis] === line ? translatePoint(object.end, moveDelta) : object.end,
    }
    return pointsEqual(moved.start, moved.end) ? null : moved
  }

  if (object.kind === "component") {
    return moveComponentPostsOnAxis(object, axis, line, moveDelta)
  }

  if (hasPosition(object) && object.position[axis] === line) {
    return {
      ...object,
      position: translatePoint(object.position, moveDelta),
    }
  }

  return object
}

function moveCapturedObjectPostsOnAxis(
  object: SchematicObject,
  axis: "x" | "y",
  targets: AxisDragTarget[],
  delta: number,
): SchematicObject | null {
  const objectTargets = targets.filter((target) => target.objectId === object.id)
  if (objectTargets.length === 0) {
    return object
  }
  const moveDelta = axis === "x" ? { x: delta, y: 0 } : { x: 0, y: delta }

  if (object.kind === "wire") {
    const pointIndexes = new Set(
      objectTargets
        .filter((target) => target.type === "wire-point")
        .map((target) => target.pointIndex),
    )
    return moveWirePostIndexesOnAxis(object, axis, pointIndexes, delta)
  }

  if (isTwoPointAnnotation(object)) {
    const endpoints = new Set(
      objectTargets
        .filter((target) => target.type === "shape-post")
        .map((target) => target.endpoint),
    )
    const moved = {
      ...object,
      start: endpoints.has("start")
        ? translatePoint(object.start, moveDelta)
        : object.start,
      end: endpoints.has("end") ? translatePoint(object.end, moveDelta) : object.end,
    }
    return pointsEqual(moved.start, moved.end) ? null : moved
  }

  if (object.kind === "component") {
    return objectTargets.some((target) => target.type === "component")
      ? translateComponent(object, moveDelta)
      : object
  }

  if (hasPosition(object) && objectTargets.some((target) => target.type === "position")) {
    return {
      ...object,
      position: translatePoint(object.position, moveDelta),
    }
  }

  return object
}

function moveWirePostIndexesOnAxis(
  wire: WireObject,
  axis: "x" | "y",
  pointIndexes: Set<number>,
  delta: number,
): WireObject | null {
  if (pointIndexes.size === 0) {
    return wire
  }
  const moveDelta = axis === "x" ? { x: delta, y: 0 } : { x: 0, y: delta }
  const indexesToMove = new Set(pointIndexes)
  const lastIndex = wire.points.length - 1

  for (const pointIndex of pointIndexes) {
    const adjacentIndex =
      pointIndex === 0 ? 1 : pointIndex === lastIndex ? lastIndex - 1 : null
    const point = wire.points[pointIndex]
    const adjacent = adjacentIndex === null ? undefined : wire.points[adjacentIndex]
    if (adjacentIndex !== null && point && adjacent && point[axis] === adjacent[axis]) {
      indexesToMove.add(adjacentIndex)
    }
  }

  const nextPoints = compactConsecutivePoints(
    wire.points.map((point, pointIndex) =>
      indexesToMove.has(pointIndex) ? translatePoint(point, moveDelta) : point,
    ),
  )

  return nextPoints.length >= 2 ? { ...wire, points: nextPoints } : null
}

function compactConsecutivePoints(points: Point[]): Point[] {
  return points.filter((point, index) => {
    const previous = points[index - 1]
    return !previous || !pointsEqual(previous, point)
  })
}

function moveObjectPostsAt(
  object: SchematicObject,
  position: Point,
  delta: Point,
): SchematicObject {
  if (object.kind === "wire") {
    const moved = {
      ...object,
      points: object.points.map((point) =>
        pointsEqual(point, position) ? translatePoint(point, delta) : point,
      ),
    }
    return compactConsecutivePoints(moved.points).length >= 2 ? moved : object
  }

  if (isTwoPointAnnotation(object)) {
    const moved = {
      ...object,
      start: pointsEqual(object.start, position)
        ? translatePoint(object.start, delta)
        : object.start,
      end: pointsEqual(object.end, position)
        ? translatePoint(object.end, delta)
        : object.end,
    }
    return pointsEqual(moved.start, moved.end) ? object : moved
  }

  if (object.kind === "component") {
    return moveComponentPostsAt(object, position, delta)
  }

  if (hasPosition(object) && pointsEqual(object.position, position)) {
    return {
      ...object,
      position: translatePoint(object.position, delta),
    }
  }

  return object
}

function moveComponentPostsOnAxis(
  component: Component,
  axis: "x" | "y",
  line: number,
  delta: Point,
): Component | null {
  return getPinPosts(component).some((pin) => pin.position[axis] === line)
    ? translateComponent(component, delta)
    : component
}

function moveComponentPostsAt(
  component: Component,
  position: Point,
  delta: Point,
): Component {
  return getPinPosts(component).some((pin) => pointsEqual(pin.position, position))
    ? translateComponent(component, delta)
    : component
}

function translateComponent(component: Component, delta: Point): Component {
  return {
    ...component,
    position: translatePoint(component.position, delta),
  }
}

function translatePoint(point: Point, delta: Point): Point {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y,
  }
}

function midpoint(start: Point, end: Point): Point {
  return {
    x: Math.round((start.x + end.x) / 2),
    y: Math.round((start.y + end.y) / 2),
  }
}

function updateWirePointPosition(
  wire: WireObject,
  pointIndex: number,
  position: Point,
): WireObject {
  if (!wire.points[pointIndex]) {
    return wire
  }
  const points = wire.points.map((point, index) =>
    index === pointIndex ? position : point,
  )
  return compactConsecutivePoints(points).length >= 2 ? { ...wire, points } : wire
}

function updateTwoPointAnnotationPost<T extends TwoPointAnnotation>(
  object: T,
  endpoint: "start" | "end",
  position: Point,
): T {
  const moved = { ...object, [endpoint]: position }
  return pointsEqual(moved.start, moved.end) ? object : moved
}

type TwoPointAnnotation = Extract<SchematicObject, { kind: "box" | "line" }>

function isTwoPointAnnotation(
  object: SchematicObject,
): object is TwoPointAnnotation {
  return object.kind === "box" || object.kind === "line"
}

function translateTwoPointAnnotation(
  object: TwoPointAnnotation,
  delta: Point,
): TwoPointAnnotation {
  return {
    ...object,
    start: translatePoint(object.start, delta),
    end: translatePoint(object.end, delta),
  }
}

function twoPointAnnotationPoints(object: TwoPointAnnotation): Point[] {
  return [object.start, object.end]
}

function moveObjectToAnchor(
  object: SchematicObject,
  nextAnchor: Point,
): SchematicObject {
  const anchor = objectMoveAnchor(object)
  if (!anchor) {
    return object
  }
  const delta = {
    x: nextAnchor.x - anchor.x,
    y: nextAnchor.y - anchor.y,
  }
  if (delta.x === 0 && delta.y === 0) {
    return object
  }
  if (object.kind === "wire") {
    return {
      ...object,
      points: object.points.map((point) => translatePoint(point, delta)),
    }
  }
  if (object.kind === "component") {
    return translateComponent(object, delta)
  }
  if (isTwoPointAnnotation(object)) {
    return translateTwoPointAnnotation(object, delta)
  }
  if (hasPosition(object)) {
    return {
      ...object,
      position: nextAnchor,
    }
  }
  return object
}

function duplicateObject(
  object: SchematicObject,
  objects: ReadonlyArray<SchematicObject>,
  offset: Point,
): SchematicObject {
  const nextId = idForDuplicate(object)
  if (object.kind === "component") {
    return {
      ...translateComponent(structuredClone(object), offset),
      id: nextId,
      refdes: getNextRefdes(objects, object.type),
    }
  }
  if (object.kind === "wire") {
    return {
      ...structuredClone(object),
      id: nextId,
      points: object.points.map((point) => ({
        x: point.x + offset.x,
        y: point.y + offset.y,
      })),
    }
  }
  if (isTwoPointAnnotation(object)) {
    return translateTwoPointAnnotation(
      {
        ...structuredClone(object),
        id: nextId,
      },
      offset,
    )
  }
  return {
    ...structuredClone(object),
    id: nextId,
    position: {
      x: object.position.x + offset.x,
      y: object.position.y + offset.y,
    },
  }
}

function idForDuplicate(object: SchematicObject): string {
  switch (object.kind) {
    case "component":
      return newId()
    case "wire":
      return newId()
    case "net-label":
      return newId()
    case "probe":
      return newId()
    case "ground":
      return newId()
    case "text":
      return newId()
    case "line":
      return newId()
    case "box":
      return newId()
  }
}
