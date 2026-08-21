import { create } from "zustand"
import { createId } from "../ids"
import {
  getNextRefdes,
  getRequiredComponentDefinition,
} from "./component-definitions"
import { updateProjectObjects } from "./commands"
import { runErc, type ElectricalIssue } from "./erc"
import { generateTscircuitTsx } from "../tscircuit/generate-tsx"
import {
  analyzeCircuitMeasurements,
  type CircuitMeasurementReport,
} from "../simulation/measurements"
import {
  canCreateVisualBox,
  canCreateVisualLine,
  getSymbolPlacement,
} from "./placement"
import {
  getAnnotationLeadEnd,
  hasAnnotationLead,
  isLeadAnnotationObject,
  translateAnnotationLead,
} from "./annotations"
import {
  getPrimarySymbolPosts,
  getWirePostIndexes,
} from "./post-endpoints"
import { constrainAxisAlignedPostEdit } from "./axis-constrained-post-edit"
import { nextLogicInputPosition } from "./logic-inputs"
import { nextSwitchState } from "./switch-state"
import { DEFAULT_TEXT_SIZE } from "./schematic-text"
import { getSymbolPinWorldPositions } from "./transforms"
import { normalizeDegrees, pointsEqual } from "./geometry"
import {
  convertWireToRoutedWire,
  hasConvertibleWires,
  rerouteWireVia as rerouteWireThroughVia,
} from "./wire-routing"
import type {
  CircuitProject,
  SchematicObject,
  SimulationConfig,
  SymbolObject,
  Vec2,
  WireObject,
} from "./types"

const HISTORY_LIMIT = 100

export type FlipAxis = "x" | "y" | "xy"

export type AxisDragTarget =
  | { type: "wire-point"; objectId: string; pointIndex: number }
  | { type: "shape-post"; objectId: string; endpoint: "start" | "end" }
  | {
      type: "annotation-lead"
      objectId: string
      endpoint: "position" | "leadEnd"
    }
  | { type: "symbol-pin"; objectId: string; componentPinId: string }
  | { type: "position"; objectId: string }

export type EditorTool =
  | { type: "select" }
  | {
      type: "place-symbol"
      componentDefinitionId: string
      props?: Record<string, unknown> | undefined
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
  activeSheetId: string | null
  selectedObjectIds: string[]
  historyPast: CircuitProject[]
  historyFuture: CircuitProject[]
  clipboardObjects: SchematicObject[]
  tool: EditorTool
  dirty: boolean
  generatedTsx: string
  ercIssues: ElectricalIssue[]
  measurements: CircuitMeasurementReport | null

  setProject(project: CircuitProject, options?: { dirty?: boolean }): void
  setTool(tool: EditorTool): void
  selectObject(id: string | null, options?: { toggle?: boolean }): void
  selectObjects(ids: string[], options?: { additive?: boolean }): void
  checkpointHistory(): void
  undo(): void
  redo(): void
  copySelected(): void
  pasteClipboard(offset?: Vec2): void
  placeSymbol(
    componentDefinitionId: string,
    position: Vec2,
    options?: {
      rotation?: SymbolObject["rotation"]
      pinSpacing?: number
      pinSpread?: number
      props?: Record<string, unknown> | undefined
    },
  ): void
  placeGround(position: Vec2, leadEnd?: Vec2): void
  placeVoltageProbe(position: Vec2, leadEnd?: Vec2): void
  placeCurrentProbe(position: Vec2, leadEnd?: Vec2): void
  placeNetLabel(position: Vec2, text?: string, leadEnd?: Vec2): void
  placeText(position: Vec2, text?: string): void
  placeBox(start: Vec2, end: Vec2): void
  placeLine(start: Vec2, end: Vec2): void
  moveObject(id: string, position: Vec2): void
  moveObjects(positions: Record<string, Vec2>): void
  moveObjectsOnAxis(axis: "x" | "y", line: number, delta: number): void
  moveAxisDragTargets(
    axis: "x" | "y",
    targets: AxisDragTarget[],
    delta: number,
  ): void
  moveObjectsAtPost(position: Vec2, delta: Vec2): void
  moveSymbolPin(id: string, componentPinId: string, position: Vec2): void
  updateShapePost(id: string, endpoint: "start" | "end", position: Vec2): void
  nudgeSelected(delta: Vec2): void
  rotateObject(id: string): void
  flipObject(id: string, axis: FlipAxis): void
  swapObjectTerminals(id: string): void
  rotateSelected(): void
  duplicateSelected(offset?: Vec2): void
  alignSelected(axis: "x" | "y"): void
  distributeSelected(axis: "x" | "y"): void
  deleteSelected(): void
  addWire(points: Vec2[]): void
  convertWiresToRoutedWires(): void
  rerouteWireVia(id: string, via: Vec2): void
  updateWirePoint(id: string, pointIndex: number, position: Vec2): void
  insertWirePoint(id: string, afterPointIndex: number, position: Vec2): void
  updateAnnotationLeadPost(
    id: string,
    endpoint: "position" | "leadEnd",
    position: Vec2,
  ): void
  toggleSwitchState(id: string): void
  setLogicInputPosition(
    id: string,
    position: string,
    options?: { history?: boolean },
  ): void
  toggleLogicInputPosition(id: string): void
  updateSimulationConfig(
    simulationId: string,
    patch: Partial<Pick<SimulationConfig, "durationMs" | "timeStepMs">>,
  ): void
  updateSymbolProps(id: string, props: Record<string, unknown>): void
  updateObjectText(id: string, text: string): void
  recompute(): void
  markSaved(): void
}

type DerivedState = Pick<EditorState, "generatedTsx" | "ercIssues" | "measurements">

function derive(project: CircuitProject | null): DerivedState {
  if (!project) {
    return { generatedTsx: "", ercIssues: [], measurements: null }
  }
  return {
    generatedTsx: generateTscircuitTsx(project),
    ercIssues: runErc(project),
    measurements: analyzeCircuitMeasurements(project),
  }
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: null,
  activeSheetId: null,
  selectedObjectIds: [],
  historyPast: [],
  historyFuture: [],
  clipboardObjects: [],
  tool: { type: "select" },
  dirty: false,
  generatedTsx: "",
  ercIssues: [],
  measurements: null,

  setProject(project, options = {}) {
    set({
      project,
      activeSheetId: project.sheets[0]?.id ?? null,
      selectedObjectIds: [],
      historyPast: [],
      historyFuture: [],
      dirty: options.dirty ?? false,
      ...derive(project),
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
    const nextProject = structuredClone(previous)
    set({
      project: nextProject,
      historyPast: nextPast,
      historyFuture: [structuredClone(state.project), ...state.historyFuture].slice(0, HISTORY_LIMIT),
      activeSheetId: nextProject.sheets[0]?.id ?? null,
      selectedObjectIds: [],
      dirty: true,
      ...derive(nextProject),
    })
  },

  redo() {
    const state = get()
    const next = state.historyFuture[0]
    if (!state.project || !next) {
      return
    }
    const nextProject = structuredClone(next)
    set({
      project: nextProject,
      historyPast: [...state.historyPast, structuredClone(state.project)].slice(-HISTORY_LIMIT),
      historyFuture: state.historyFuture.slice(1),
      activeSheetId: nextProject.sheets[0]?.id ?? null,
      selectedObjectIds: [],
      dirty: true,
      ...derive(nextProject),
    })
  },

  copySelected() {
    const state = get()
    const selected = new Set(state.selectedObjectIds)
    const objects =
      state.project?.sheets
        .find((sheet) => sheet.id === state.activeSheetId)
        ?.objects.filter((object) => selected.has(object.id)) ?? []
    set({ clipboardObjects: structuredClone(objects) })
  },

  pasteClipboard(offset = { x: 40, y: 40 }) {
    const clipboard = get().clipboardObjects
    if (clipboard.length === 0) {
      return
    }
    let nextSelectedIds: string[] = []
    mutateProject(set, get, (project, sheetId) => {
      const sheet = project.sheets.find((candidate) => candidate.id === sheetId)
      if (!sheet) {
        return project
      }
      const nextObjects: SchematicObject[] = []
      for (const object of clipboard) {
        nextObjects.push(
          duplicateObject(object, [...sheet.objects, ...nextObjects], offset),
        )
      }
      nextSelectedIds = nextObjects.map((object) => object.id)
      return updateProjectObjects(project, sheetId, (objects) => [
        ...objects,
        ...nextObjects,
      ])
    })
    if (nextSelectedIds.length > 0) {
      set({ selectedObjectIds: nextSelectedIds })
    }
  },

  placeSymbol(componentDefinitionId, position, options = {}) {
    mutateProject(set, get, (project, sheetId) => {
      const definition = getRequiredComponentDefinition(componentDefinitionId)
      return updateProjectObjects(project, sheetId, (objects) => {
        const symbol = {
          kind: "symbol" as const,
          id: createId("sym"),
          componentDefinitionId,
          symbolDefinitionId: definition.defaultSymbolId,
          refdes: getNextRefdes(objects, componentDefinitionId),
          position,
          rotation: options.rotation ?? 0,
          props: { ...definition.defaultProps, ...options.props },
        }
        return [
          ...objects,
          {
            ...symbol,
            ...(options.pinSpacing ? { pinSpacing: options.pinSpacing } : {}),
            ...(options.pinSpread ? { pinSpread: options.pinSpread } : {}),
          },
        ]
      })
    })
  },

  placeGround(position, leadEnd) {
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) => [
        ...objects,
        {
          kind: "ground",
          id: createId("junc"),
          position,
          ...annotationLeadProps(position, leadEnd),
          netName: "GND",
        },
      ]),
    )
  },

  placeVoltageProbe(position, leadEnd) {
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) => {
        const nextIndex =
          objects.filter(
            (object) => object.kind === "probe" && object.probeType === "voltage",
          ).length + 1
        return [
          ...objects,
          {
            kind: "probe",
            id: createId("probe"),
            probeType: "voltage",
            name: `VP${nextIndex}`,
            position,
            ...annotationLeadProps(position, leadEnd),
          },
        ]
      }),
    )
  },

  placeCurrentProbe(position, leadEnd) {
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) => {
        const nextIndex =
          objects.filter(
            (object) => object.kind === "probe" && object.probeType === "current",
          ).length + 1
        return [
          ...objects,
          {
            kind: "probe",
            id: createId("probe"),
            probeType: "current",
            name: `IP${nextIndex}`,
            position,
            ...annotationLeadProps(position, leadEnd),
          },
        ]
      }),
    )
  },

  placeNetLabel(position, text, leadEnd) {
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) => {
        const nextIndex =
          objects.filter((object) => object.kind === "net-label").length + 1
        return [
          ...objects,
          {
            kind: "net-label",
            id: createId("label"),
            text: text ?? `NET${nextIndex}`,
            position,
            ...annotationLeadProps(position, leadEnd),
          },
        ]
      }),
    )
  },

  placeText(position, text = "hello") {
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) => [
        ...objects,
        {
          kind: "text",
          id: createId("text"),
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
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) => [
        ...objects,
        {
          kind: "box",
          id: createId("box"),
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
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) => [
        ...objects,
        {
          kind: "line",
          id: createId("line"),
          start,
          end,
        },
      ]),
    )
  },

  moveObject(id, position) {
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) =>
        objects.map((object) =>
          object.id === id ? moveObjectToAnchor(object, position) : object,
        ),
      ),
    )
  },

  moveObjects(positions) {
    const ids = new Set(Object.keys(positions))
    if (ids.size === 0) {
      return
    }
    mutateProject(
      set,
      get,
      (project, sheetId) =>
        updateProjectObjects(project, sheetId, (objects) =>
          objects.map((object) =>
            ids.has(object.id) && positions[object.id]
              ? moveObjectToAnchor(object, positions[object.id]!)
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
      (project, sheetId) =>
        updateProjectObjects(project, sheetId, (objects) =>
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
      (project, sheetId) =>
        updateProjectObjects(project, sheetId, (objects) =>
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
      (project, sheetId) =>
        updateProjectObjects(project, sheetId, (objects) =>
          objects.map((object) => moveObjectPostsAt(object, position, delta)),
        ),
      { history: false },
    )
  },

  moveSymbolPin(id, componentPinId, position) {
    mutateProject(
      set,
      get,
      (project, sheetId) =>
        updateProjectObjects(project, sheetId, (objects) =>
          objects.map((object) =>
            object.kind === "symbol" && object.id === id
              ? moveSymbolPinTo(object, componentPinId, position)
              : object,
          ),
        ),
      { history: false },
    )
  },

  updateShapePost(id, endpoint, position) {
    mutateProject(
      set,
      get,
      (project, sheetId) =>
        updateProjectObjects(project, sheetId, (objects) =>
          objects.map((object) =>
            (object.kind === "line" || object.kind === "box") && object.id === id
              ? updateTwoPointAnnotationPost(object, endpoint, position)
              : object,
          ),
        ),
      { history: false },
    )
  },

  updateAnnotationLeadPost(id, endpoint, position) {
    mutateProject(
      set,
      get,
      (project, sheetId) =>
        updateProjectObjects(project, sheetId, (objects) =>
          objects.map((object) =>
            isLeadAnnotationObject(object) && object.id === id
              ? setAnnotationLeadPost(object, endpoint, position)
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
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) =>
        objects.map((object) => {
          if (!selected.has(object.id)) {
            return object
          }
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
          if (isLeadAnnotationObject(object)) {
            return translateAnnotationLead(object, delta)
          }
          if (hasPosition(object)) {
            return {
              ...object,
              position: {
                x: object.position.x + delta.x,
                y: object.position.y + delta.y,
              },
            }
          }
          return object
        }),
      ),
    )
  },

  rotateObject(id) {
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) =>
        objects.map((object) =>
          object.id === id && object.kind === "symbol"
            ? { ...object, rotation: rotate(object.rotation) }
            : object,
        ),
      ),
    )
  },

  flipObject(id, axis) {
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) =>
        objects.map((object) =>
          object.id === id ? flipSchematicObject(object, axis) : object,
        ),
      ),
    )
  },

  swapObjectTerminals(id) {
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) =>
        objects.map((object) =>
          object.id === id ? swapObjectTerminals(object) : object,
        ),
      ),
    )
  },

  rotateSelected() {
    const selected = new Set(get().selectedObjectIds)
    if (selected.size === 0) {
      return
    }
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) =>
        objects.map((object) =>
          selected.has(object.id) && object.kind === "symbol"
            ? { ...object, rotation: rotate(object.rotation) }
            : object,
        ),
      ),
    )
  },

  duplicateSelected(offset = { x: 40, y: 40 }) {
    const selected = new Set(get().selectedObjectIds)
    if (selected.size === 0) {
      return
    }
    let nextSelectedIds: string[] = []
    mutateProject(set, get, (project, sheetId) => {
      const sheet = project.sheets.find((candidate) => candidate.id === sheetId)
      if (!sheet) {
        return project
      }
      const nextObjects: SchematicObject[] = []
      for (const object of sheet.objects) {
        if (!selected.has(object.id)) {
          continue
        }
        const duplicate = duplicateObject(
          object,
          [...sheet.objects, ...nextObjects],
          offset,
        )
        nextObjects.push(duplicate)
      }
      nextSelectedIds = nextObjects.map((object) => object.id)
      return updateProjectObjects(project, sheetId, (objects) => [
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
    if (selected.size < 2) {
      return
    }
    mutateProject(set, get, (project, sheetId) => {
      const sheet = project.sheets.find((candidate) => candidate.id === sheetId)
      const selectedPositioned =
        sheet?.objects.filter(
          (object): object is SchematicObject & { position: Vec2 } =>
            selected.has(object.id) && hasPosition(object),
        ) ??
        []
      const anchor = selectedPositioned[0]?.position[axis]
      if (anchor === undefined) {
        return project
      }
      return updateProjectObjects(project, sheetId, (objects) =>
        objects.map((object) =>
          selected.has(object.id) && hasPosition(object)
            ? {
                ...object,
                position: {
                  ...object.position,
                  [axis]: anchor,
                },
              }
            : object,
        ),
      )
    })
  },

  distributeSelected(axis) {
    const selected = new Set(get().selectedObjectIds)
    if (selected.size < 3) {
      return
    }
    mutateProject(set, get, (project, sheetId) => {
      const sheet = project.sheets.find((candidate) => candidate.id === sheetId)
      const selectedPositioned =
        sheet?.objects
          .filter(
            (object): object is SchematicObject & { position: Vec2 } =>
              selected.has(object.id) && hasPosition(object),
          )
          .sort((a, b) => a.position[axis] - b.position[axis]) ?? []
      if (selectedPositioned.length < 3) {
        return project
      }
      const first = selectedPositioned[0]!.position[axis]
      const last = selectedPositioned[selectedPositioned.length - 1]!.position[axis]
      const step = (last - first) / (selectedPositioned.length - 1)
      const nextPositions = new Map(
        selectedPositioned.map((object, index) => [
          object.id,
          first + step * index,
        ]),
      )
      return updateProjectObjects(project, sheetId, (objects) =>
        objects.map((object) =>
          selected.has(object.id) && hasPosition(object)
            ? {
                ...object,
                position: {
                  ...object.position,
                  [axis]: nextPositions.get(object.id) ?? object.position[axis],
                },
              }
            : object,
        ),
      )
    })
  },

  deleteSelected() {
    const selected = new Set(get().selectedObjectIds)
    if (selected.size === 0) {
      return
    }
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) =>
        objects.filter((object) => !selected.has(object.id)),
      ),
    )
    set({ selectedObjectIds: [] })
  },

  addWire(points) {
    if (points.length < 2) {
      return
    }
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) => [
        ...objects,
        { kind: "wire", id: createId("wire"), points },
      ]),
    )
  },

  convertWiresToRoutedWires() {
    const state = get()
    const sheet = state.project?.sheets.find(
      (candidate) => candidate.id === state.activeSheetId,
    )
    if (!sheet || !hasConvertibleWires(sheet.objects)) {
      return
    }

    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) =>
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
      (project, sheetId) =>
        updateProjectObjects(project, sheetId, (objects) =>
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
      (project, sheetId) =>
        updateProjectObjects(project, sheetId, (objects) =>
          objects.map((object) =>
            object.kind === "wire" && object.id === id
              ? rerouteWireThroughVia(object, via, {
                  excludeObjectIds: [id],
                  gridSize:
                    project.sheets.find((sheet) => sheet.id === sheetId)?.gridSize ??
                    20,
                  objects,
                })
              : object,
          ),
        ),
      { history: false },
    )
  },

  insertWirePoint(id, afterPointIndex, position) {
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) =>
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
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) =>
        objects.map((object) => {
          if (object.id !== id || object.kind !== "symbol") {
            return object
          }
          const nextState = nextSwitchState(object)
          return nextState
            ? { ...object, props: { ...object.props, state: nextState } }
            : object
        }),
      ),
    )
  },

  setLogicInputPosition(id, position, options = {}) {
    mutateProject(
      set,
      get,
      (project, sheetId) =>
        updateProjectObjects(project, sheetId, (objects) =>
          objects.map((object) =>
            object.id === id &&
            object.kind === "symbol" &&
            object.componentDefinitionId === "logic-input"
              ? { ...object, props: { ...object.props, position } }
              : object,
          ),
        ),
      options.history === undefined ? {} : { history: options.history },
    )
  },

  toggleLogicInputPosition(id) {
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) =>
        objects.map((object) => {
          if (
            object.id !== id ||
            object.kind !== "symbol" ||
            object.componentDefinitionId !== "logic-input"
          ) {
            return object
          }
          const nextPosition = nextLogicInputPosition(object)
          return nextPosition
            ? { ...object, props: { ...object.props, position: nextPosition } }
            : object
        }),
      ),
    )
  },

  updateSimulationConfig(simulationId, patch) {
    const state = get()
    const project = state.project
    if (!project || !project.simulations.some((simulation) => simulation.id === simulationId)) {
      return
    }
    const nextProject = touchProject({
      ...project,
      simulations: project.simulations.map((simulation) =>
        simulation.id === simulationId
          ? {
              ...simulation,
              ...sanitizeSimulationPatch(patch, simulation),
            }
          : simulation,
      ),
    })
    set({
      project: nextProject,
      historyPast: [...state.historyPast, structuredClone(project)].slice(-HISTORY_LIMIT),
      historyFuture: [],
      dirty: true,
      ...derive(nextProject),
    })
  },

  updateSymbolProps(id, props) {
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) =>
        objects.map((object) =>
          object.id === id && object.kind === "symbol"
            ? { ...object, props: { ...object.props, ...props } }
            : object,
        ),
      ),
    )
  },

  updateObjectText(id, text) {
    mutateProject(set, get, (project, sheetId) =>
      updateProjectObjects(project, sheetId, (objects) =>
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
    set((state) => ({ ...derive(state.project) }))
  },

  markSaved() {
    set({ dirty: false })
  },
}))

function mutateProject(
  set: Parameters<typeof useEditorStore.setState>[0] extends never
    ? never
    : typeof useEditorStore.setState,
  get: typeof useEditorStore.getState,
  updater: (project: CircuitProject, sheetId: string) => CircuitProject,
  options: { history?: boolean } = {},
): void {
  const state = get()
  const project = state.project
  const sheetId = state.activeSheetId
  if (!project || !sheetId) {
    return
  }
  const nextProject = touchProject(updater(project, sheetId))
  const history =
    options.history === false
      ? {}
      : {
          historyPast: [...state.historyPast, structuredClone(project)].slice(-HISTORY_LIMIT),
          historyFuture: [],
        }
  set({
    project: nextProject,
    dirty: true,
    ...history,
    ...derive(nextProject),
  })
}

function touchProject(project: CircuitProject): CircuitProject {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
  }
}

function sanitizeSimulationPatch(
  patch: Partial<Pick<SimulationConfig, "durationMs" | "timeStepMs">>,
  current: SimulationConfig,
): Partial<Pick<SimulationConfig, "durationMs" | "timeStepMs">> {
  return {
    ...(patch.durationMs !== undefined
      ? { durationMs: positiveNumber(patch.durationMs, current.durationMs) }
      : {}),
    ...(patch.timeStepMs !== undefined
      ? { timeStepMs: positiveNumber(patch.timeStepMs, current.timeStepMs) }
      : {}),
  }
}

function positiveNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function captureAxisDragTargets(
  objects: SchematicObject[],
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

    if (isLeadAnnotationObject(object) && hasAnnotationLead(object)) {
      if (object.position[axis] === line) {
        targets.push({
          type: "annotation-lead",
          objectId: object.id,
          endpoint: "position",
        })
      }
      if (getAnnotationLeadEnd(object)[axis] === line) {
        targets.push({
          type: "annotation-lead",
          objectId: object.id,
          endpoint: "leadEnd",
        })
      }
      continue
    }

    if (object.kind === "symbol") {
      const pins = getSymbolPinWorldPositions(object)
      const axisPins =
        pins.length === 2 ? pins : getPrimarySymbolPosts(object)
      axisPins.forEach((pin) => {
        if (pin.position[axis] === line) {
          targets.push({
            type: "symbol-pin",
            objectId: object.id,
            componentPinId: pin.componentPinId,
          })
        }
      })
      continue
    }

    if (hasPosition(object) && object.position[axis] === line) {
      targets.push({ type: "position", objectId: object.id })
    }
  }
  return targets
}

function pushHistory(
  set: typeof useEditorStore.setState,
  project: CircuitProject,
): void {
  set((state) => ({
    historyPast: [...state.historyPast, structuredClone(project)].slice(-HISTORY_LIMIT),
    historyFuture: [],
  }))
}

function rotate(rotation: SymbolObject["rotation"]): SymbolObject["rotation"] {
  return normalizeDegrees(rotation + 90)
}

type TransformMatrix = readonly [number, number, number, number]

const identityMatrix: TransformMatrix = [1, 0, 0, 1]
const mirrorXMatrix: TransformMatrix = [-1, 0, 0, 1]
const flipMatrices: Record<FlipAxis, TransformMatrix> = {
  x: mirrorXMatrix,
  y: [1, 0, 0, -1],
  xy: [0, 1, 1, 0],
}

function flipSchematicObject(
  object: SchematicObject,
  axis: FlipAxis,
): SchematicObject {
  if (object.kind === "symbol") {
    return flipSymbolObject(object, axis)
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
    return {
      ...object,
      points: [...object.points].reverse(),
    }
  }
  if (object.kind === "line") {
    return {
      ...object,
      start: object.end,
      end: object.start,
    }
  }
  if (object.kind !== "symbol") {
    return object
  }

  const pins = getSymbolPinWorldPositions(object)
  const [pin1, pin2] = pins
  if (pins.length !== 2 || !pin1 || !pin2) {
    return object
  }

  return applySymbolPosts(object, pin2.position, pin1.position)
}

function flipSymbolObject(symbol: SymbolObject, axis: FlipAxis): SymbolObject {
  const currentMatrix = multiplyMatrices(
    rotationMatrix(symbol.rotation),
    symbol.mirrored ? mirrorXMatrix : identityMatrix,
  )
  const nextMatrix = multiplyMatrices(flipMatrices[axis], currentMatrix)
  const nextOrientation = decomposeSymbolOrientation(nextMatrix)
  if (!nextOrientation) {
    return symbol
  }

  if (nextOrientation.mirrored) {
    return {
      ...symbol,
      rotation: nextOrientation.rotation,
      mirrored: true,
    }
  }

  const { mirrored: _mirrored, ...unmirroredSymbol } = symbol
  return {
    ...unmirroredSymbol,
    rotation: nextOrientation.rotation,
  }
}

function rotationMatrix(rotation: number): TransformMatrix {
  const radians = (normalizeDegrees(rotation) * Math.PI) / 180
  const cos = cleanMatrixNumber(Math.cos(radians))
  const sin = cleanMatrixNumber(Math.sin(radians))
  return [cos, -sin, sin, cos]
}

function decomposeSymbolOrientation(
  matrix: TransformMatrix,
): { rotation: SymbolObject["rotation"]; mirrored: boolean } | null {
  const [a, b, c, d] = matrix
  const determinant = a * d - b * c
  if (Math.abs(Math.abs(determinant) - 1) > 0.001) {
    return null
  }
  if (determinant < 0) {
    return {
      rotation: normalizeDegrees((Math.atan2(-c, d) * 180) / Math.PI),
      mirrored: true,
    }
  }
  return {
    rotation: normalizeDegrees((Math.atan2(c, a) * 180) / Math.PI),
    mirrored: false,
  }
}

function multiplyMatrices(
  left: TransformMatrix,
  right: TransformMatrix,
): TransformMatrix {
  return [
    left[0] * right[0] + left[1] * right[2],
    left[0] * right[1] + left[1] * right[3],
    left[2] * right[0] + left[3] * right[2],
    left[2] * right[1] + left[3] * right[3],
  ]
}

function cleanMatrixNumber(value: number): number {
  const rounded = Number(value.toFixed(9))
  return Object.is(rounded, -0) ? 0 : rounded
}

function centerOfPoints(points: Vec2[]): Vec2 {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  }
}

function flipPoint(point: Vec2, center: Vec2, axis: FlipAxis): Vec2 {
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

function hasPosition(
  object: SchematicObject,
): object is SchematicObject & { position: Vec2 } {
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

  if (isLeadAnnotationObject(object) && hasAnnotationLead(object)) {
    const leadEnd = getAnnotationLeadEnd(object)
    const moved = {
      ...object,
      position:
        object.position[axis] === line
          ? translatePoint(object.position, moveDelta)
          : object.position,
      leadEnd:
        leadEnd[axis] === line ? translatePoint(leadEnd, moveDelta) : leadEnd,
    }
    return validAnnotationLeadMove(object, moved)
  }

  if (object.kind === "symbol") {
    return moveSymbolPostsOnAxis(object, axis, line, moveDelta)
  }

  if (hasPosition(object) && object.position[axis] === line) {
    return {
      ...object,
      position: translatePoint(object.position, moveDelta),
    } as SchematicObject
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

  if (isLeadAnnotationObject(object) && hasAnnotationLead(object)) {
    const endpoints = new Set(
      objectTargets
        .filter((target) => target.type === "annotation-lead")
        .map((target) => target.endpoint),
    )
    const moved = {
      ...object,
      position: endpoints.has("position")
        ? translatePoint(object.position, moveDelta)
        : object.position,
      leadEnd: endpoints.has("leadEnd")
        ? translatePoint(getAnnotationLeadEnd(object), moveDelta)
        : getAnnotationLeadEnd(object),
    }
    return validAnnotationLeadMove(object, moved)
  }

  if (object.kind === "symbol") {
    const componentPinIds = new Set(
      objectTargets
        .filter((target) => target.type === "symbol-pin")
        .map((target) => target.componentPinId),
    )
    return moveCapturedSymbolPostsOnAxis(object, componentPinIds, moveDelta)
  }

  if (hasPosition(object) && objectTargets.some((target) => target.type === "position")) {
    return {
      ...object,
      position: translatePoint(object.position, moveDelta),
    } as SchematicObject
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

function compactConsecutivePoints(points: Vec2[]): Vec2[] {
  return points.filter((point, index) => {
    const previous = points[index - 1]
    return !previous || !pointsEqual(previous, point)
  })
}

function moveObjectPostsAt(
  object: SchematicObject,
  position: Vec2,
  delta: Vec2,
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

  if (isLeadAnnotationObject(object) && hasAnnotationLead(object)) {
    const leadEnd = getAnnotationLeadEnd(object)
    const moved = {
      ...object,
      position: pointsEqual(object.position, position)
        ? translatePoint(object.position, delta)
        : object.position,
      leadEnd: pointsEqual(leadEnd, position)
        ? translatePoint(leadEnd, delta)
        : leadEnd,
    }
    return validAnnotationLeadMove(object, moved)
  }

  if (object.kind === "symbol") {
    return moveSymbolPostsAt(object, position, delta)
  }

  if (hasPosition(object) && pointsEqual(object.position, position)) {
    return {
      ...object,
      position: translatePoint(object.position, delta),
    } as SchematicObject
  }

  return object
}

function moveSymbolPostsOnAxis(
  symbol: SymbolObject,
  axis: "x" | "y",
  line: number,
  delta: Vec2,
): SymbolObject | null {
  const [pin1, pin2] = getPrimarySymbolPosts(symbol)
  if (!pin1 || !pin2) {
    return symbol
  }
  if (![pin1, pin2].some((pin) => pin.position[axis] === line)) {
    return symbol
  }

  const nextPin1 =
    pin1.position[axis] === line
      ? translatePoint(pin1.position, delta)
      : pin1.position
  const nextPin2 =
    pin2.position[axis] === line
      ? translatePoint(pin2.position, delta)
      : pin2.position

  if (pointsEqual(nextPin1, nextPin2)) {
    return null
  }
  return applySymbolPosts(symbol, nextPin1, nextPin2)
}

function moveSymbolPostsAt(
  symbol: SymbolObject,
  position: Vec2,
  delta: Vec2,
): SymbolObject {
  const [pin1, pin2] = getPrimarySymbolPosts(symbol)
  if (!pin1 || !pin2) {
    const pins = getSymbolPinWorldPositions(symbol)
    const pin = pins.find((candidate) => pointsEqual(candidate.position, position))
    if (!pin) {
      return symbol
    }
    return {
      ...symbol,
      position: translatePoint(symbol.position, delta),
    }
  }

  if (![pin1, pin2].some((pin) => pointsEqual(pin.position, position))) {
    return symbol
  }

  const nextPin1 = pointsEqual(pin1.position, position)
    ? translatePoint(pin1.position, delta)
    : pin1.position
  const nextPin2 = pointsEqual(pin2.position, position)
    ? translatePoint(pin2.position, delta)
    : pin2.position

  return applySymbolPosts(symbol, nextPin1, nextPin2)
}

function moveCapturedSymbolPostsOnAxis(
  symbol: SymbolObject,
  componentPinIds: Set<string>,
  delta: Vec2,
): SymbolObject | null {
  const [pin1, pin2] = getPrimarySymbolPosts(symbol)
  if (!pin1 || !pin2) {
    return symbol
  }
  if (
    !componentPinIds.has(pin1.componentPinId) &&
    !componentPinIds.has(pin2.componentPinId)
  ) {
    return symbol
  }
  const nextPin1 = componentPinIds.has(pin1.componentPinId)
    ? translatePoint(pin1.position, delta)
    : pin1.position
  const nextPin2 = componentPinIds.has(pin2.componentPinId)
    ? translatePoint(pin2.position, delta)
    : pin2.position

  if (pointsEqual(nextPin1, nextPin2)) {
    return null
  }
  return applySymbolPosts(symbol, nextPin1, nextPin2)
}

function moveSymbolPinTo(
  symbol: SymbolObject,
  componentPinId: string,
  position: Vec2,
): SymbolObject {
  const pins = getSymbolPinWorldPositions(symbol)
  const [pin1, pin2] = getPrimarySymbolPosts(symbol)
  if (!pin1 || !pin2) {
    return symbol
  }
  if (
    componentPinId !== pin1.componentPinId &&
    componentPinId !== pin2.componentPinId
  ) {
    const pin = pins.find((candidate) => candidate.componentPinId === componentPinId)
    if (!pin) {
      return symbol
    }
    return {
      ...symbol,
      position: {
        x: symbol.position.x + position.x - pin.position.x,
        y: symbol.position.y + position.y - pin.position.y,
      },
    }
  }

  return applySymbolPosts(
    symbol,
    pin1.componentPinId === componentPinId ? position : pin1.position,
    pin2.componentPinId === componentPinId ? position : pin2.position,
  )
}

function applySymbolPosts(
  symbol: SymbolObject,
  pin1Position: Vec2,
  pin2Position: Vec2,
): SymbolObject {
  const [currentPin1, currentPin2] = getPrimarySymbolPosts(symbol)
  const adjusted =
    currentPin1 && currentPin2
      ? constrainAxisAlignedPostEdit({
          componentDefinitionId: symbol.componentDefinitionId,
          currentStart: currentPin1.position,
          currentEnd: currentPin2.position,
          nextStart: pin1Position,
          nextEnd: pin2Position,
        })
      : { start: pin1Position, end: pin2Position }
  const placement = getSymbolPlacement(
    symbol.componentDefinitionId,
    adjusted.start,
    adjusted.end,
    1,
  )
  if (!placement) {
    return symbol
  }
  return {
    ...symbol,
    position: placement.position,
    rotation: placement.rotation,
    ...(placement.pinSpacing ? { pinSpacing: placement.pinSpacing } : {}),
    ...(placement.pinSpread ? { pinSpread: placement.pinSpread } : {}),
  }
}

function translatePoint(point: Vec2, delta: Vec2): Vec2 {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y,
  }
}

function annotationLeadProps(
  position: Vec2,
  leadEnd: Vec2 | undefined,
): { leadEnd?: Vec2 } {
  return leadEnd && !pointsEqual(position, leadEnd) ? { leadEnd } : {}
}

function setAnnotationLeadPost<T extends SchematicObject>(
  object: T,
  endpoint: "position" | "leadEnd",
  position: Vec2,
): T {
  if (!isLeadAnnotationObject(object)) {
    return object
  }
  if (endpoint === "position") {
    return pointsEqual(position, getAnnotationLeadEnd(object))
      ? object
      : ({
          ...object,
          position,
          leadEnd: getAnnotationLeadEnd(object),
        } as T)
  }
  return pointsEqual(position, object.position)
    ? object
    : ({
        ...object,
        leadEnd: position,
      } as T)
}

function updateWirePointPosition(
  wire: WireObject,
  pointIndex: number,
  position: Vec2,
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
  position: Vec2,
): T {
  const moved = { ...object, [endpoint]: position }
  return pointsEqual(moved.start, moved.end) ? object : moved
}

function validAnnotationLeadMove<T extends SchematicObject>(original: T, moved: T): T {
  return isLeadAnnotationObject(moved) &&
    pointsEqual(moved.position, getAnnotationLeadEnd(moved))
    ? original
    : moved
}

type TwoPointAnnotation = Extract<SchematicObject, { kind: "box" | "line" }>

function isTwoPointAnnotation(
  object: SchematicObject,
): object is TwoPointAnnotation {
  return object.kind === "box" || object.kind === "line"
}

function translateTwoPointAnnotation(
  object: TwoPointAnnotation,
  delta: Vec2,
): TwoPointAnnotation {
  return {
    ...object,
    start: translatePoint(object.start, delta),
    end: translatePoint(object.end, delta),
  }
}

function twoPointAnnotationPoints(object: TwoPointAnnotation): Vec2[] {
  return [object.start, object.end]
}

function moveObjectToAnchor(
  object: SchematicObject,
  nextAnchor: Vec2,
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
  if (isTwoPointAnnotation(object)) {
    return translateTwoPointAnnotation(object, delta)
  }
  if (isLeadAnnotationObject(object)) {
    return translateAnnotationLead(object, delta)
  }
  if (hasPosition(object)) {
    return {
      ...object,
      position: nextAnchor,
    } as SchematicObject
  }
  return object
}

function objectMoveAnchor(object: SchematicObject): Vec2 | null {
  if (object.kind === "wire") {
    return object.points[0] ?? null
  }
  if (isTwoPointAnnotation(object)) {
    return object.start
  }
  if (hasPosition(object)) {
    return object.position
  }
  return null
}

function duplicateObject(
  object: SchematicObject,
  objects: SchematicObject[],
  offset: Vec2,
): SchematicObject {
  const nextId = idForDuplicate(object)
  if (object.kind === "symbol") {
    return {
      ...structuredClone(object),
      id: nextId,
      refdes: getNextRefdes(objects, object.componentDefinitionId),
      position: {
        x: object.position.x + offset.x,
        y: object.position.y + offset.y,
      },
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
  if (isLeadAnnotationObject(object)) {
    return translateAnnotationLead(
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
  } as SchematicObject
}

function idForDuplicate(object: SchematicObject): string {
  switch (object.kind) {
    case "symbol":
      return createId("sym")
    case "wire":
      return createId("wire")
    case "junction":
      return createId("junc")
    case "net-label":
      return createId("label")
    case "probe":
      return createId("probe")
    case "ground":
      return createId("junc")
    case "text":
      return createId("text")
    case "line":
      return createId("line")
    case "box":
      return createId("box")
  }
}
