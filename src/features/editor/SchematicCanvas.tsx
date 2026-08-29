import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
} from "react"
import type { ComponentType } from "@circuit-sim/core/circuit/components"
import {
  distance,
  pointsEqual,
  snapToGrid,
} from "@circuit-sim/core/circuit/geometry"
import {
  GRID_SIZE,
  hasSelectDragDelayElapsed,
  isLogicInputTogglePoint,
  isSwitchTogglePoint,
  nearestConnectionSnapPoint,
  nextLogicInputPosition,
} from "@/browser/editor/interaction"
import {
  getPrimaryComponentPosts,
  getWirePostIndexes,
} from "@/browser/editor/post-endpoints"
import {
  MOUSE_HIT_TOLERANCE,
  hitTestObjects,
} from "@/browser/editor/hit-testing"
import { netHighlightObjectIds as highlightObjectIdsForNet } from "@circuit-sim/core/circuit/net-extraction"
import { getPinPosts } from "@circuit-sim/core/circuit/component-geometry"
import {
  captureAxisDragTargets,
  useEditorState,
  type EditorTool,
  type AxisDragTarget,
} from "@/browser/editor/editor-state"
import {
  getMouseWheelValueEdit,
  type MouseWheelValueEdit,
} from "@/browser/editor/values"
import {
  mergedObjectBounds,
  rectFromPoints,
  type SelectionRect,
} from "@/browser/editor/selection-rect"
import {
  getRoutedWireSnapPoint,
  isRoutedWire,
  routedWirePoints,
  splitWireAtPoint,
  type WireRouteStyle,
} from "@/browser/editor/wire-routing"
import {
  type BoxObject,
  GroundObject,
  LineObject,
  NetLabelObject,
  ProbeObject,
  SchematicObject,
  Component,
  Point,
  WireObject,
} from "@circuit-sim/core/circuit/project"
import {
  isGraphicObject,
  objectMoveAnchor,
} from "@/browser/editor/object-geometry"
import {
  BadConnectionLayer,
  CursorGuideLayer,
  GridLayer,
  PostLayer,
  RoutedWireSnapLayer,
  SelectionLayer,
} from "./layers/OverlayLayer"
import {
  CreationPreviewLayer,
  CreationPreviewHandle,
  type AnnotationPreview,
} from "./layers/CreationPreviewLayer"
import { ElementLayer } from "./layers/ElementLayer"
import {
  PostHandleLayer,
  type GrabbedPostHandle,
} from "./layers/PostHandleLayer"
import { PinLayer } from "./layers/PinLayer"
import { WireEditLayer } from "./layers/WireEditLayer"
import { WireLayer } from "./layers/WireLayer"
import { formatMeasurement } from "@/browser/simulation/display"
import type { RunObservationReport } from "@circuit-sim/core/simulation/run-observations"
import {
  beginMarquee,
  beginShapeCreation,
  isAnnotationPlacementToolType,
  marqueeSelectionIds,
  modifierAdditive,
  shapeCreationHasSize,
  updateCreationDrag,
  updateMarquee,
  type AnnotationPlacementTool,
  type DragState,
  type MoveDragState,
  type ShapePostEndpoint,
} from "@/browser/editor/canvas-gestures"

export type {
  AnnotationPlacementTool,
  DragState,
} from "@/browser/editor/canvas-gestures"

type ShapePostObject = LineObject | BoxObject

type WheelValuePopupState = MouseWheelValueEdit & {
  x: number
  y: number
  componentId: string
}

type DragStartPlan = {
  readonly drag: DragState
  readonly checkpoint?: true
  readonly select?: string | null
  readonly wireRouteStyle?: WireRouteStyle
}

const defaultVoltageColors = {
  voltageRange: 5,
  positiveColor: "#00ff00",
  negativeColor: "#ff0000",
  neutralColor: "#808080",
}

const editValuesWithMouseWheel = false
const editingDisabled = false

function grabbedPostHandleFromDrag(
  drag: DragState | null,
  objects: ReadonlyArray<SchematicObject>,
): GrabbedPostHandle | null {
  if (!drag) {
    return null
  }
  if (drag.type === "shape-post") {
    return {
      objectId: drag.objectId,
      postIndex: drag.endpoint === "start" ? 0 : 1,
    }
  }
  if (drag.type === "wire-point") {
    const wire = objects.find(
      (object): object is WireObject =>
        object.kind === "wire" && object.id === drag.wireId,
    )
    if (!wire) {
      return null
    }
    const postIndex = getWirePostIndexes(wire).indexOf(drag.pointIndex)
    return postIndex >= 0 ? { objectId: drag.wireId, postIndex } : null
  }
  return null
}

export function SchematicCanvas() {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const project = useEditorState((state) => state.project)
  const selectedObjectIds = useEditorState((state) => state.selectedObjectIds)
  const tool = useEditorState((state) => state.tool)
  const measurements = useEditorState((state) => state.observations)
  const ercIssues = useEditorState((state) => state.ercIssues)
  const setTool = useEditorState((state) => state.setTool)
  const selectObject = useEditorState((state) => state.selectObject)
  const selectObjects = useEditorState((state) => state.selectObjects)
  const checkpointHistory = useEditorState((state) => state.checkpointHistory)
  const placeComponent = useEditorState((state) => state.placeComponent)
  const placeGround = useEditorState((state) => state.placeGround)
  const placeVoltageProbe = useEditorState((state) => state.placeVoltageProbe)
  const placeCurrentProbe = useEditorState((state) => state.placeCurrentProbe)
  const placeNetLabel = useEditorState((state) => state.placeNetLabel)
  const placeText = useEditorState((state) => state.placeText)
  const placeBox = useEditorState((state) => state.placeBox)
  const placeLine = useEditorState((state) => state.placeLine)
  const moveObjects = useEditorState((state) => state.moveObjects)
  const moveAxisDragTargets = useEditorState((state) => state.moveAxisDragTargets)
  const moveObjectsAtPost = useEditorState((state) => state.moveObjectsAtPost)
  const updateShapePost = useEditorState((state) => state.updateShapePost)
  const addWire = useEditorState((state) => state.addWire)
  const updateWirePoint = useEditorState((state) => state.updateWirePoint)
  const rerouteWireVia = useEditorState((state) => state.rerouteWireVia)
  const insertWirePoint = useEditorState((state) => state.insertWirePoint)
  const toggleSwitchState = useEditorState(
    (state) => state.toggleSwitchState,
  )
  const setLogicInputPosition = useEditorState(
    (state) => state.setLogicInputPosition,
  )
  const toggleLogicInputPosition = useEditorState(
    (state) => state.toggleLogicInputPosition,
  )
  const updateComponentProperty = useEditorState(
    (state) => state.updateComponentProperty,
  )
  const [size, setSize] = useState({ width: 900, height: 600 })
  const [pan, setPan] = useState<Point>({ x: 120, y: 80 })
  const [scale, setScale] = useState(1)
  const dragRef = useRef<DragState | null>(null)
  const wheelValuePopupTimeoutRef = useRef<number | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [wireStart, setWireStart] = useState<Point | null>(null)
  const [wireRouteStyle, setWireRouteStyle] = useState<WireRouteStyle>("horizontal-first")
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Point | null>(null)
  const [cursorInsideCanvas, setCursorInsideCanvas] = useState(false)
  const [hoverObjectId, setHoverObjectId] = useState<string | null>(null)
  const [netHighlightKeyHeld, setNetHighlightKeyHeld] = useState(false)
  const [wheelValuePopup, setWheelValuePopup] =
    useState<WheelValuePopupState | null>(null)

  const objects = useMemo(() => project?.objects ?? [], [project])
  const selectedObjects = useMemo(
    () => objects.filter((object) => selectedObjectIds.includes(object.id)),
    [objects, selectedObjectIds],
  )
  const components = objects.filter(
    (object): object is Component => object.kind === "component",
  )
  const wires = objects.filter(
    (object): object is WireObject => object.kind === "wire",
  )
  const worldBounds = {
    left: -pan.x / scale,
    top: -pan.y / scale,
    right: (size.width - pan.x) / scale,
    bottom: (size.height - pan.y) / scale,
  }
  const activeWirePoints =
    drag?.type === "create-wire"
      ? pointsEqual(drag.start, drag.current)
        ? null
        : sceneWireRoutePoints(drag.start, drag.current, drag.routeStyle)
      : tool.type === "draw-wire" && wireStart && hoverPoint
      ? sceneWireRoutePoints(wireStart, hoverPoint, wireRouteStyle)
      : null
  const activeWirePreviewHandles =
    activeWirePoints && activeWirePoints.length > 1
      ? activeWirePoints.filter(
          (_, index) => index === 0 || index === activeWirePoints.length - 1,
        )
      : []
  const activeComponentPreview = componentPreviewFromDrag(drag)
  const activeBoxPreview =
    drag?.type === "create-box" && !pointsEqual(drag.start, drag.current)
      ? drag
      : null
  const activeLinePreview =
    drag?.type === "create-line" && !pointsEqual(drag.start, drag.current)
      ? drag
      : null
  const activeAnnotationPreview = annotationPreviewFromDrag(drag)
  const marqueeRect = drag?.type === "marquee" ? rectFromPoints(drag.start, drag.current) : null
  const axisToolMode = tool.type === "drag-row" || tool.type === "drag-column"
  const axisDragMode = axisToolMode || drag?.type === "axis"
  const showDragPosts =
    axisDragMode ||
    tool.type === "drag-selected" ||
    tool.type === "drag-post" ||
    drag?.type === "shape-post" ||
    drag?.type === "post-group" ||
    drag?.type === "wire-point" ||
    drag?.type === "move"
  const grabbedPostHandle = useMemo(
    () => grabbedPostHandleFromDrag(drag, objects),
    [drag, objects],
  )
  const activeDragPostObjectId =
    grabbedPostHandle?.objectId ??
    (tool.type === "drag-post" && !drag ? hoverObjectId : null)
  const cursorGuidePoint = cursorInsideCanvas ? cursorPoint : null
  const cursorGuideSnapPoint = cursorInsideCanvas ? hoverPoint : null
  const showCursorCrossHairs =
    tool.type === "draw-wire" || tool.type === "drag-post" || isPlacementTool(tool)
  const netHighlightObjectIds = useMemo(
    () =>
      netHighlightKeyHeld && hoverObjectId && measurements
        ? highlightObjectIdsForNet(objects, measurements.netlist, hoverObjectId)
        : [],
    [hoverObjectId, measurements, netHighlightKeyHeld, objects],
  )
  const routedWireSnapPoint = useMemo(() => {
    const allowHoverSnap = editingDisabled || tool.type === "select"
    if (!allowHoverSnap || drag || !cursorPoint || !hoverObjectId) {
      return null
    }
    const wire = wires.find((candidate) => candidate.id === hoverObjectId)
    if (!wire || !isRoutedWireWithBends(wire)) {
      return null
    }
    return getRoutedWireSnapPoint(wire, cursorPoint)
  }, [cursorPoint, drag, editingDisabled, hoverObjectId, tool.type, wires])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (tool.type !== "draw-wire") {
      setWireStart(null)
    }
  }, [tool.type])

  useEffect(() => {
    if (!editingDisabled) {
      return
    }
    setActiveDrag(null)
    setWireStart(null)
    setWheelValuePopup(null)
    if (tool.type !== "select") {
      setTool({ type: "select" })
    }
  }, [editingDisabled, setTool, tool.type])

  useEffect(
    () => () => {
      if (wheelValuePopupTimeoutRef.current !== null) {
        window.clearTimeout(wheelValuePopupTimeoutRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Shift") {
        setNetHighlightKeyHeld(true)
      }
    }
    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === "Shift") {
        setNetHighlightKeyHeld(false)
      }
    }
    function handleBlur() {
      setNetHighlightKeyHeld(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", handleBlur)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", handleBlur)
    }
  }, [])

  function setActiveDrag(nextDrag: DragState | null) {
    dragRef.current = nextDrag
    setDrag(nextDrag)
  }

  function beginDrag(
    plan: DragStartPlan,
    event: PointerEvent<SVGElement>,
  ): void {
    if (plan.select !== undefined) {
      selectObject(plan.select)
    }
    if (plan.checkpoint) {
      checkpointHistory()
    }
    if (plan.wireRouteStyle) {
      setWireRouteStyle(plan.wireRouteStyle)
    }
    setActiveDrag(plan.drag)
    const captureTarget = event.currentTarget.ownerSVGElement ?? event.currentTarget
    captureTarget.setPointerCapture(event.pointerId)
  }

  function eventWorldPoint(event: PointerEvent<SVGElement>): Point {
    return clientWorldPoint(event.clientX, event.clientY)
  }

  function clientWorldPoint(clientX: number, clientY: number): Point {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) {
      return { x: 0, y: 0 }
    }
    return {
      x: (clientX - rect.left - pan.x) / scale,
      y: (clientY - rect.top - pan.y) / scale,
    }
  }

  function isClientPointInsideCanvas(clientX: number, clientY: number): boolean {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) {
      return false
    }
    return (
      clientX >= rect.left &&
      clientX < rect.right &&
      clientY >= rect.top &&
      clientY < rect.bottom
    )
  }

  function snappedEventPoint(event: PointerEvent<SVGElement>): Point {
    const raw = eventWorldPoint(event)
    const nearest = nearestConnectionSnapPoint(
      raw,
      objects,
      Math.max(10, GRID_SIZE * 0.65),
    )
    return nearest ?? snapToGrid(raw, GRID_SIZE)
  }

  function handleCanvasPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button === 2) {
      return
    }
    const position = snappedEventPoint(event)
    const rawPosition = eventWorldPoint(event)
    const modifierMode = modifierDragMode(event)
    if (editingDisabled) {
      if (event.button === 1 || modifierMode === "drag-all") {
        beginDrag(panDragPlan(event), event)
      } else if (event.button === 0) {
        selectObject(null)
      }
      return
    }
    if (isTemporarySelectModifier(event)) {
      beginDrag(marqueeDragPlan(rawPosition, event), event)
      return
    }
    if (tool.type !== "draw-wire" && modifierMode === "drag-row") {
      const plan = axisDragPlan("y", position.y)
      if (plan) beginDrag(plan, event)
      return
    }
    if (tool.type !== "draw-wire" && modifierMode === "drag-column") {
      const plan = axisDragPlan("x", position.x)
      if (plan) beginDrag(plan, event)
      return
    }
    if (
      event.button === 1 ||
      tool.type === "drag-all" ||
      (tool.type !== "draw-wire" && modifierMode === "drag-all")
    ) {
      beginDrag(panDragPlan(event), event)
      return
    }

    if (tool.type === "drag-row" || tool.type === "drag-column") {
      const axis = tool.type === "drag-column" ? "x" : "y"
      const plan = axisDragPlan(axis, position[axis])
      if (plan) beginDrag(plan, event)
      return
    }

    if (tool.type === "drag-selected") {
      const plan = moveDragPlanForObjectIds(selectedObjectIds, event)
      if (plan) beginDrag(plan, event)
      return
    }

    const placement = placementDragPlan(position)
    if (placement) {
      beginDrag(placement, event)
      return
    }
    if (tool.type === "draw-wire") {
      if (event.detail >= 2) {
        setWireStart(null)
        setHoverPoint(null)
        return
      }
      const plan = wireCreationDragPlan(position, event)
      if (plan) beginDrag(plan, event)
      return
    }
    if (tool.type === "drag-post") {
      return
    }

    beginDrag(marqueeDragPlan(rawPosition, event), event)
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const activeDrag = dragRef.current
    const insideCanvas = isClientPointInsideCanvas(event.clientX, event.clientY)
    setCursorInsideCanvas(insideCanvas)
    if (
      activeDrag &&
      shouldIgnoreOutOfBoundsDrag(activeDrag) &&
      !insideCanvas
    ) {
      return
    }
    const position = snappedEventPoint(event)
    const rawPosition = eventWorldPoint(event)
    setWireRouteStyle(wireRouteStyleFromTool(tool, event))
    setNetHighlightKeyHeld(event.shiftKey)
    setHoverPoint(position)
    setCursorPoint(rawPosition)
    if (!activeDrag) {
      return
    }
    if (activeDrag.type === "pending-select-drag") {
      if (
        !hasSelectDragDelayElapsed(
          activeDrag.pointerDownTime,
          window.performance.now(),
        )
      ) {
        return
      }
      checkpointHistory()
      setActiveDrag(activeDrag.pendingDrag)
      if (activeDrag.pendingDrag.type === "move") {
        moveObjectsForDrag(activeDrag.pendingDrag, position, rawPosition)
      } else {
        rerouteWireVia(activeDrag.pendingDrag.wireId, position)
      }
    } else if (activeDrag.type === "move") {
      moveObjectsForDrag(activeDrag, position, rawPosition)
    } else if (activeDrag.type === "wire-point") {
      updateWirePoint(activeDrag.wireId, activeDrag.pointIndex, position)
    } else if (activeDrag.type === "routed-wire-reroute") {
      rerouteWireVia(activeDrag.wireId, position)
    } else if (activeDrag.type === "shape-post") {
      updateShapePost(activeDrag.objectId, activeDrag.endpoint, position)
    } else if (activeDrag.type === "post-group") {
      const delta = {
        x: position.x - activeDrag.position.x,
        y: position.y - activeDrag.position.y,
      }
      moveObjectsAtPost(activeDrag.position, delta)
      setActiveDrag({ ...activeDrag, position })
    } else if (activeDrag.type === "held-logic-input") {
      return
    } else if (activeDrag.type === "axis") {
      const nextLine = position[activeDrag.axis]
      moveAxisDragTargets(
        activeDrag.axis,
        activeDrag.targets,
        nextLine - activeDrag.line,
      )
      setActiveDrag({ ...activeDrag, line: nextLine })
    } else if (activeDrag.type === "marquee") {
      const nextDrag = updateMarquee(activeDrag, rawPosition)
      setActiveDrag(nextDrag)
      selectObjects(marqueeSelectionIds(nextDrag, objects), {
        additive: nextDrag.additive,
      })
    } else if (
      activeDrag.type === "create-component" ||
      activeDrag.type === "create-annotation" ||
      activeDrag.type === "create-box" ||
      activeDrag.type === "create-wire" ||
      activeDrag.type === "create-line"
    ) {
      setActiveDrag(
        updateCreationDrag(
          activeDrag,
          position,
          rawPosition,
          wireRouteStyleFromTool(tool, event),
        ),
      )
    } else {
      setPan({
        x: activeDrag.startPan.x + event.clientX - activeDrag.startClient.x,
        y: activeDrag.startPan.y + event.clientY - activeDrag.startClient.y,
      })
    }
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    const activeDrag = dragRef.current
    if (activeDrag) {
      if (activeDrag.type === "marquee") {
        selectObjects(marqueeSelectionIds(activeDrag, objects), {
          additive: activeDrag.additive,
        })
      } else if (
        activeDrag.type === "create-component" &&
        !pointsEqual(activeDrag.start, activeDrag.current)
      ) {
        placeComponent(activeDrag.component, activeDrag.start, activeDrag.current)
      } else if (activeDrag.type === "create-annotation") {
        commitAnnotationPlacement(
          activeDrag.toolType,
          annotationPlacementPosition(activeDrag),
        )
      } else if (activeDrag.type === "create-box") {
        if (shapeCreationHasSize(activeDrag)) {
          placeBox(activeDrag.start, activeDrag.current)
        }
      } else if (activeDrag.type === "create-wire") {
        if (pointsEqual(activeDrag.start, activeDrag.current)) {
          commitWirePoint(activeDrag.start, activeDrag.routeStyle)
        } else {
          addWire(
            sceneWireRoutePoints(
              activeDrag.start,
              activeDrag.current,
              activeDrag.routeStyle,
            ),
          )
          setWireStart(null)
          setHoverPoint(activeDrag.current)
        }
      } else if (activeDrag.type === "create-line") {
        if (shapeCreationHasSize(activeDrag)) {
          placeLine(activeDrag.start, activeDrag.current)
        }
      } else if (activeDrag.type === "held-logic-input") {
        setLogicInputPosition(
          activeDrag.componentId,
          activeDrag.releasePosition,
          { history: false },
        )
      }
      setActiveDrag(null)
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handlePointerLeave() {
    setCursorInsideCanvas(false)
    if (!dragRef.current) {
      setHoverPoint(null)
      setCursorPoint(null)
      setHoverObjectId(null)
    }
  }

  function handleCanvasContextMenu(event: MouseEvent<SVGSVGElement>) {
    event.preventDefault()
    setActiveDrag(null)
    if (tool.type === "draw-wire") {
      setWireStart(null)
      setHoverPoint(null)
    }
    const worldPoint = clientWorldPoint(event.clientX, event.clientY)
    const hitTarget = hitTestObjects(
      worldPoint,
      objects,
      MOUSE_HIT_TOLERANCE,
    )
    if (hitTarget?.objectId) {
      selectObject(hitTarget.objectId)
    }
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.stopPropagation()
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    const client = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const world = {
      x: (client.x - pan.x) / scale,
      y: (client.y - pan.y) / scale,
    }
    if (editValuesWithMouseWheel && !editingDisabled) {
      const valueEdit = getWheelValueEditTarget(world, event.deltaY)
      if (valueEdit) {
        updateComponentProperty(
          valueEdit.component.id,
          valueEdit.edit.propertyEdit,
        )
        showWheelValuePopup(valueEdit.component.id, valueEdit.edit, client)
        return
      }
    }
    const nextScale = Math.min(2.5, Math.max(0.35, scale * (event.deltaY > 0 ? 0.9 : 1.1)))
    zoomAtClient(client, world, nextScale)
  }

  function getWheelValueEditTarget(
    world: Point,
    deltaY: number,
  ): { component: Component; edit: MouseWheelValueEdit } | null {
    const hit = hitTestObjects(world, objects, 10 / scale)
    if (!hit || (hit.type !== "object" && hit.type !== "pin")) {
      return null
    }
    const component = objects.find(
      (object): object is Component =>
        object.kind === "component" && object.id === hit.objectId,
    )
    if (!component) {
      return null
    }
    const edit = getMouseWheelValueEdit(component, deltaY)
    return edit ? { component, edit } : null
  }

  function showWheelValuePopup(
    componentId: string,
    edit: MouseWheelValueEdit,
    client: Point,
  ) {
    const popupWidth = 132
    const popupHeight = 140
    setWheelValuePopup({
      ...edit,
      componentId,
      x: Math.min(Math.max(8, client.x + 14), Math.max(8, size.width - popupWidth)),
      y: Math.min(Math.max(8, client.y + 14), Math.max(8, size.height - popupHeight)),
    })
    if (wheelValuePopupTimeoutRef.current !== null) {
      window.clearTimeout(wheelValuePopupTimeoutRef.current)
    }
    wheelValuePopupTimeoutRef.current = window.setTimeout(() => {
      setWheelValuePopup(null)
      wheelValuePopupTimeoutRef.current = null
    }, 1400)
  }

  function zoomAtClient(client: Point, world: Point, nextScale: number) {
    setScale(nextScale)
    setPan({
      x: client.x - world.x * nextScale,
      y: client.y - world.y * nextScale,
    })
  }

  function zoomFromCenter(multiplier: number) {
    const client = { x: size.width / 2, y: size.height / 2 }
    const world = {
      x: (client.x - pan.x) / scale,
      y: (client.y - pan.y) / scale,
    }
    const nextScale = Math.min(2.5, Math.max(0.35, scale * multiplier))
    zoomAtClient(client, world, nextScale)
  }

  function fitToObjects() {
    const bounds = mergedObjectBounds(objects)
    if (!bounds) {
      setScale(1)
      setPan({ x: 120, y: 80 })
      return
    }
    fitToBounds(bounds)
  }

  function fitToSelection() {
    const bounds = mergedObjectBounds(selectedObjects)
    if (!bounds) {
      return
    }
    fitToBounds(bounds)
  }

  function fitToBounds(bounds: SelectionRect) {
    const padding = 90
    const nextScale = Math.min(
      2.5,
      Math.max(
        0.35,
        Math.min(
          (size.width - padding * 2) / Math.max(bounds.width, 1),
          (size.height - padding * 2) / Math.max(bounds.height, 1),
        ),
      ),
    )
    setScale(nextScale)
    setPan({
      x: size.width / 2 - (bounds.x + bounds.width / 2) * nextScale,
      y: size.height / 2 - (bounds.y + bounds.height / 2) * nextScale,
    })
  }

  function handleObjectPointerDown(
    objectId: string,
    event: PointerEvent<SVGGElement>,
  ) {
    event.stopPropagation()
    if (event.button === 2) {
      return
    }
    if (event.button === 1) {
      beginDrag(panDragPlan(event), event)
      return
    }
    if (editingDisabled) {
      selectObject(objectId)
      return
    }
    const modifierMode = modifierDragMode(event)
    if (isTemporarySelectModifier(event)) {
      const plan = canDirectSelectPostDrag(objectId)
        ? directSelectPostDragPlan(objectId, event)
        : null
      if (plan) {
        beginDrag(plan, event)
        return
      }
      selectObject(objectId, { toggle: true })
      return
    }
    if (tool.type === "draw-wire") {
      if (event.detail >= 2) {
        setWireStart(null)
        setTool({ type: "select" })
        const plan = moveDragPlanForObject(objectId, event)
        if (plan) beginDrag(plan, event)
        return
      }
      const plan = wireCreationDragPlan(snappedEventPoint(event), event)
      if (plan) beginDrag(plan, event)
      return
    }
    if (
      tool.type === "drag-row" ||
      tool.type === "drag-column" ||
      modifierMode === "drag-row" ||
      modifierMode === "drag-column"
    ) {
      const axis =
        tool.type === "drag-column" || modifierMode === "drag-column"
          ? "x"
          : "y"
      const position = snappedEventPoint(event)
      const plan = axisDragPlan(axis, position[axis])
      if (plan) beginDrag(plan, event)
      return
    }
    if (tool.type === "drag-all" || modifierMode === "drag-all") {
      beginDrag(panDragPlan(event), event)
      return
    }
    if (tool.type === "drag-post" || modifierMode === "drag-post") {
      const plan = shapePostDragPlanForObject(objectId, event)
      if (plan) {
        beginDrag(plan, event)
        return
      }
      if (tool.type === "drag-post") {
        const movePlan = moveDragPlanForObject(objectId, event)
        if (movePlan) beginDrag(movePlan, event)
        return
      }
    }
    if (tool.type === "drag-selected") {
      const plan = moveDragPlanForObjectIds(
        [...selectedObjectIds, objectId],
        event,
      )
      if (plan) beginDrag(plan, event)
      return
    }
    if (isPlacementTool(tool)) {
      const plan = placementDragPlan(snappedEventPoint(event))
      if (plan) beginDrag(plan, event)
      return
    }
    if (tool.type !== "select") {
      selectObject(objectId)
      return
    }
    const directPostPlan = canDirectSelectPostDrag(objectId)
      ? directSelectPostDragPlan(objectId, event)
      : null
    if (directPostPlan) {
      beginDrag(directPostPlan, event)
      return
    }
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      selectObject(objectId, { toggle: true })
      return
    }

    const pendingMove = moveDragPlanForObject(objectId, event, true)
    if (pendingMove) {
      beginDrag(pendingMove, event)
    } else {
      selectObject(objectId)
    }
  }

  function moveDragPlanForObject(
    objectId: string,
    event: PointerEvent<SVGElement>,
    pending = false,
  ): DragStartPlan | null {
    if (!objects.some((object) => object.id === objectId)) {
      return null
    }
    const movesSelection = selectedObjectIds.includes(objectId)
    const plan = moveDragPlanForObjectIds(
      movesSelection ? selectedObjectIds : [objectId],
      event,
      pending,
    )
    return plan && !movesSelection ? { ...plan, select: objectId } : plan
  }

  function moveDragPlanForObjectIds(
    objectIds: string[],
    event: PointerEvent<SVGElement>,
    pending = false,
  ): DragStartPlan | null {
    const moveDrag = createMoveDragState(objectIds, event)
    if (!moveDrag) {
      return null
    }
    return pending
      ? {
          drag: {
            type: "pending-select-drag",
            pointerDownTime: window.performance.now(),
            pendingDrag: moveDrag,
          },
        }
      : { drag: moveDrag, checkpoint: true }
  }

  function createMoveDragState(
    objectIds: string[],
    event: PointerEvent<SVGElement>,
  ): MoveDragState | null {
    if (editingDisabled) {
      return null
    }
    const movingIds = [...new Set(objectIds)]
    const movingObjects = objects.filter((candidate) =>
      movingIds.includes(candidate.id),
    )
    const snapToGrid = !movingObjects.every(isGraphicObject)
    const initialPositions = movingObjects.map((candidate) => ({
      objectId: candidate.id,
      position: objectMoveAnchor(candidate),
    }))
    if (initialPositions.length === 0) {
      return null
    }
    const dragStart = snapToGrid
      ? snappedEventPoint(event)
      : eventWorldPoint(event)
    return {
      type: "move",
      objectIds: movingIds,
      start: dragStart,
      initialPositions,
      snapToGrid,
    }
  }

  function moveObjectsForDrag(
    dragState: MoveDragState,
    snappedPosition: Point,
    rawPosition: Point,
  ) {
    const movePoint = dragState.snapToGrid ? snappedPosition : rawPosition
    const delta = {
      x: movePoint.x - dragState.start.x,
      y: movePoint.y - dragState.start.y,
    }
    moveObjects(
      dragState.initialPositions.map(({ objectId, position }) => ({
        objectId,
        position: { x: position.x + delta.x, y: position.y + delta.y },
      })),
    )
  }

  function marqueeDragPlan(
    position: Point,
    event: PointerEvent<SVGElement>,
  ): DragStartPlan {
    return { drag: beginMarquee(position, modifierAdditive(event)) }
  }

  function placementDragPlan(position: Point): DragStartPlan | null {
    if (tool.type === "place-component") {
      return {
        select: null,
        drag: {
          type: "create-component",
          component: tool.component,
          start: position,
          current: position,
        },
      }
    }
    if (isAnnotationPlacementToolType(tool.type)) {
      return {
        select: null,
        drag: {
          type: "create-annotation",
          toolType: tool.type,
          start: position,
          current: position,
        },
      }
    }
    if (tool.type === "place-box" || tool.type === "place-line") {
      return {
        select: null,
        drag: beginShapeCreation(
          tool.type === "place-box" ? "create-box" : "create-line",
          position,
        ),
      }
    }
    return null
  }

  function axisDragPlan(
    axis: "x" | "y",
    line: number,
  ): DragStartPlan | null {
    return editingDisabled
      ? null
      : {
          select: null,
          checkpoint: true,
          drag: {
            type: "axis",
            axis,
            line,
            targets: captureAxisDragTargets(objects, axis, line),
          },
        }
  }

  function shapePostDragPlanForObject(
    objectId: string,
    event: PointerEvent<SVGElement>,
  ): DragStartPlan | null {
    const object = objects.find(
      (candidate): candidate is ShapePostObject =>
        candidate.id === objectId && isShapePostObject(candidate),
    )
    if (!object) {
      return null
    }
    const endpoint = nearestShapePostEndpoint(
      object,
      eventWorldPoint(event),
      Math.max(10, GRID_SIZE * 0.75),
    )
    if (!endpoint) {
      return null
    }
    return event.shiftKey
      ? postGroupDragPlan(
          endpoint === "start" ? object.start : object.end,
        )
      : shapePostDragPlan(object, endpoint)
  }

  function shapePostDragPlan(
    object: ShapePostObject,
    endpoint: ShapePostEndpoint,
  ): DragStartPlan | null {
    return editingDisabled
      ? null
      : {
          select: null,
          checkpoint: true,
          drag: { type: "shape-post", objectId: object.id, endpoint },
        }
  }

  function directSelectPostDragPlan(
    objectId: string,
    event: PointerEvent<SVGElement>,
  ): DragStartPlan | null {
    const object = objects.find((candidate) => candidate.id === objectId)
    return (
      shapePostDragPlanForObject(objectId, event) ??
      (object && event.shiftKey && "position" in object
        ? postGroupDragPlan(object.position)
        : null)
    )
  }

  function canDirectSelectPostDrag(objectId: string): boolean {
    return !selectedObjectIds.some((selectedId) => selectedId !== objectId)
  }

  function postGroupDragPlan(position: Point): DragStartPlan | null {
    return editingDisabled
      ? null
      : {
          select: null,
          checkpoint: true,
          drag: { type: "post-group", position },
        }
  }

  function panDragPlan(event: PointerEvent<SVGElement>): DragStartPlan {
    return {
      select: null,
      drag: {
        type: "pan",
        startClient: { x: event.clientX, y: event.clientY },
        startPan: pan,
      },
    }
  }

  function handleComponentPointerDown(
    componentId: string,
    event: PointerEvent<SVGGElement>,
  ) {
    const component = components.find((candidate) => candidate.id === componentId)
    if (
      component &&
      event.button === 0 &&
      !editingDisabled &&
      tool.type === "select" &&
      component.type === "logic-input" &&
      isLogicInputTogglePoint(
        component,
        eventWorldPoint(event),
        Math.max(10, GRID_SIZE * 0.6),
      )
    ) {
      event.stopPropagation()
      selectObject(componentId)
      if (component.props.momentary) {
        const releasePosition = component.props.position
        setLogicInputPosition(componentId, nextLogicInputPosition(component), {
          history: false,
        })
        beginDrag(
          {
            drag: {
              type: "held-logic-input",
              componentId,
              releasePosition,
            },
          },
          event,
        )
        return
      }
      toggleLogicInputPosition(componentId)
      return
    }
    if (
      component &&
      event.button === 0 &&
      !editingDisabled &&
      tool.type === "select" &&
      isSwitchTogglePoint(
        component,
        eventWorldPoint(event),
        Math.max(10, GRID_SIZE * 0.6),
      )
    ) {
      event.stopPropagation()
      selectObject(componentId)
      toggleSwitchState(componentId)
      return
    }
    handleObjectPointerDown(componentId, event)
  }

  function handleObjectDoubleClick(
    objectId: string,
    event: MouseEvent<SVGGElement>,
  ) {
    event.stopPropagation()
    if (editingDisabled) {
      selectObject(objectId)
      return
    }
    if (tool.type === "draw-wire") {
      setWireStart(null)
      setTool({ type: "select" })
    }
    selectObject(objectId)
  }

  function handleWirePointerDown(
    wireId: string,
    event: PointerEvent<SVGPolylineElement>,
  ) {
    event.stopPropagation()
    if (event.button === 2) {
      return
    }
    if (event.button === 1) {
      beginDrag(panDragPlan(event), event)
      return
    }
    if (editingDisabled) {
      selectObject(wireId)
      return
    }

    const modifierMode = modifierDragMode(event)
    const wire = objects.find(
      (object): object is WireObject =>
        object.kind === "wire" && object.id === wireId,
    )
    if (isTemporarySelectModifier(event)) {
      const pointIndex = wire
        ? nearestWirePointIndex(
            wire,
            eventWorldPoint(event),
            Math.max(10, GRID_SIZE * 0.75),
            isRoutedWireWithBends(wire),
          )
        : null
      const plan =
        wire && pointIndex !== null
          ? wirePointDragPlan(wire, pointIndex, event)
          : null
      if (plan) {
        beginDrag(plan, event)
      } else {
        selectObject(wireId, { toggle: true })
      }
      return
    }
    if (tool.type === "draw-wire") {
      const plan = wireCreationDragPlan(snappedEventPoint(event), event)
      if (plan) beginDrag(plan, event)
      return
    }
    if (tool.type === "drag-post" || modifierMode === "drag-post") {
      const pointIndex = wire
        ? nearestWirePointIndex(
            wire,
            eventWorldPoint(event),
            Math.max(10, GRID_SIZE * 0.75),
            true,
          )
        : null
      const pointPlan =
        wire && pointIndex !== null
          ? wirePointDragPlan(wire, pointIndex, event)
          : null
      if (pointPlan) {
        beginDrag(pointPlan, event)
        return
      }
      const splitPoint = wire
        ? getRoutedWireSnapPoint(wire, eventWorldPoint(event))
        : null
      const split = wire && splitPoint
        ? splitWireAtPoint(wire, splitPoint)
        : null
      if (wire && split) {
        insertWirePoint(wire.id, split.afterPointIndex, split.position)
        beginDrag(
          {
            select: null,
            drag: {
              type: "wire-point",
              wireId: wire.id,
              pointIndex: split.afterPointIndex + 1,
            },
          },
          event,
        )
      }
      return
    }
    if (
      tool.type === "drag-row" ||
      tool.type === "drag-column" ||
      modifierMode === "drag-row" ||
      modifierMode === "drag-column"
    ) {
      const axis =
        tool.type === "drag-column" || modifierMode === "drag-column"
          ? "x"
          : "y"
      const position = snappedEventPoint(event)
      const plan = axisDragPlan(axis, position[axis])
      if (plan) beginDrag(plan, event)
      return
    }
    if (tool.type === "drag-all" || modifierMode === "drag-all") {
      beginDrag(panDragPlan(event), event)
      return
    }
    if (tool.type === "drag-selected") {
      const plan = moveDragPlanForObjectIds(
        [...selectedObjectIds, wireId],
        event,
      )
      if (plan) beginDrag(plan, event)
      return
    }
    if (isPlacementTool(tool)) {
      const plan = placementDragPlan(snappedEventPoint(event))
      if (plan) beginDrag(plan, event)
      return
    }
    if (tool.type === "select" && canDirectSelectPostDrag(wireId) && wire) {
      const pointIndex = nearestWirePointIndex(
        wire,
        eventWorldPoint(event),
        Math.max(10, GRID_SIZE * 0.75),
        isRoutedWireWithBends(wire),
      )
      const plan =
        (pointIndex !== null
          ? wirePointDragPlan(wire, pointIndex, event)
          : null) ?? pendingRoutedWireReroutePlan(wire)
      if (plan) {
        beginDrag(plan, event)
        return
      }
    }
    if (tool.type === "select" && (event.shiftKey || event.metaKey || event.ctrlKey)) {
      selectObject(wireId, { toggle: true })
      return
    }
    if (tool.type === "select") {
      const plan = moveDragPlanForObject(wireId, event, true)
      if (plan) {
        beginDrag(plan, event)
        return
      }
    }
    selectObject(wireId)
  }

  function handleWirePointPointerDown(
    wireId: string,
    pointIndex: number,
    event: PointerEvent<SVGCircleElement>,
  ) {
    event.stopPropagation()
    if (event.button === 2) {
      return
    }
    if (event.button === 1) {
      beginDrag(panDragPlan(event), event)
      return
    }
    if (editingDisabled) {
      selectObject(wireId)
      return
    }
    const modifierMode = modifierDragMode(event)
    if (
      tool.type === "drag-row" ||
      tool.type === "drag-column" ||
      modifierMode === "drag-row" ||
      modifierMode === "drag-column"
    ) {
      const axis =
        tool.type === "drag-column" || modifierMode === "drag-column"
          ? "x"
          : "y"
      const position = snappedEventPoint(event)
      const plan = axisDragPlan(axis, position[axis])
      if (plan) beginDrag(plan, event)
      return
    }
    if (tool.type === "drag-all" || modifierMode === "drag-all") {
      beginDrag(panDragPlan(event), event)
      return
    }
    const wire = objects.find(
      (object): object is WireObject =>
        object.kind === "wire" && object.id === wireId,
    )
    const plan = wire ? wirePointDragPlan(wire, pointIndex, event) : null
    if (plan) beginDrag(plan, event)
  }

  function handleWireMidpointPointerDown(
    wireId: string,
    segmentIndex: number,
    position: Point,
    event: PointerEvent<SVGRectElement>,
  ) {
    event.stopPropagation()
    if (event.button === 2) {
      return
    }
    if (event.button === 1) {
      beginDrag(panDragPlan(event), event)
      return
    }
    if (editingDisabled) {
      selectObject(wireId)
      return
    }
    const modifierMode = modifierDragMode(event)
    if (
      tool.type === "drag-row" ||
      tool.type === "drag-column" ||
      modifierMode === "drag-row" ||
      modifierMode === "drag-column"
    ) {
      const axis =
        tool.type === "drag-column" || modifierMode === "drag-column"
          ? "x"
          : "y"
      const dragPosition = snappedEventPoint(event)
      const plan = axisDragPlan(axis, dragPosition[axis])
      if (plan) beginDrag(plan, event)
      return
    }
    if (tool.type === "drag-all" || modifierMode === "drag-all") {
      beginDrag(panDragPlan(event), event)
      return
    }
    insertWirePoint(wireId, segmentIndex, position)
    beginDrag(
      {
        select:
          tool.type === "drag-post" || modifierMode === "drag-post"
            ? null
            : wireId,
        drag: { type: "wire-point", wireId, pointIndex: segmentIndex + 1 },
      },
      event,
    )
  }

  function wirePointDragPlan(
    wire: WireObject,
    pointIndex: number,
    event: PointerEvent<SVGElement>,
  ): DragStartPlan | null {
    const point = wire.points[pointIndex]
    if (!point || editingDisabled) {
      return null
    }
    return event.shiftKey
      ? postGroupDragPlan(point)
      : {
          select: null,
          checkpoint: true,
          drag: { type: "wire-point", wireId: wire.id, pointIndex },
        }
  }

  function pendingRoutedWireReroutePlan(
    wire: WireObject,
  ): DragStartPlan | null {
    return isRoutedWireWithBends(wire)
      ? {
          select: wire.id,
          drag: {
            type: "pending-select-drag",
            pointerDownTime: window.performance.now(),
            pendingDrag: { type: "routed-wire-reroute", wireId: wire.id },
          },
        }
      : null
  }

  function handlePostPointerDown(
    objectId: string,
    postIndex: number,
    event: PointerEvent<SVGElement>,
  ) {
    event.stopPropagation()
    if (event.button === 2) {
      return
    }
    if (event.button === 1) {
      beginDrag(panDragPlan(event), event)
      return
    }
    if (editingDisabled) {
      selectObject(objectId)
      return
    }
    const shapeObject = objects.find(
      (candidate): candidate is ShapePostObject =>
        candidate.id === objectId && isShapePostObject(candidate),
    )
    if (shapeObject) {
      const endpoint = postIndex === 0 ? "start" : "end"
      const plan =
        tool.type === "drag-post" && event.shiftKey
          ? postGroupDragPlan(
              endpoint === "start" ? shapeObject.start : shapeObject.end,
            )
          : shapePostDragPlan(shapeObject, endpoint)
      if (plan) beginDrag(plan, event)
      return
    }
    const annotationObject = objects.find(
      (candidate): candidate is GroundObject | NetLabelObject | ProbeObject =>
        candidate.id === objectId &&
        (candidate.kind === "ground" ||
          candidate.kind === "net-label" ||
          candidate.kind === "probe"),
    )
    if (!annotationObject) return
    const plan = tool.type === "drag-post" && event.shiftKey
      ? postGroupDragPlan(annotationObject.position)
      : moveDragPlanForObject(objectId, event)
    if (plan) beginDrag(plan, event)
  }

  function handlePinPointerDown(
    componentId: string,
    pin: string,
    position: Point,
    event: PointerEvent<SVGCircleElement>,
  ) {
    if (event.button === 2) {
      event.stopPropagation()
      return
    }
    if (event.button === 1) {
      event.stopPropagation()
      beginDrag(panDragPlan(event), event)
      return
    }
    if (editingDisabled) {
      event.stopPropagation()
      selectObject(componentId)
      return
    }
    if (
      tool.type === "drag-post" ||
      modifierDragMode(event) === "drag-post"
    ) {
      event.stopPropagation()
      const plan = tool.type === "drag-post" && event.shiftKey
        ? postGroupDragPlan(position)
        : moveDragPlanForObject(componentId, event)
      if (plan) beginDrag(plan, event)
      return
    }
    if (tool.type === "draw-wire") {
      event.stopPropagation()
      if (event.detail >= 2) {
        setWireStart(null)
        setTool({ type: "select" })
        selectObject(componentId)
        return
      }
      const plan = wireCreationDragPlan(snapToGrid(position, GRID_SIZE), event)
      if (plan) beginDrag(plan, event)
    }
  }

  function wireCreationDragPlan(
    position: Point,
    event: PointerEvent<SVGElement>,
  ): DragStartPlan | null {
    if (editingDisabled) {
      return null
    }
    const routeStyle = wireRouteStyleFromTool(tool, event)
    return {
      wireRouteStyle: routeStyle,
      drag: {
        type: "create-wire",
        start: position,
        current: position,
        routeStyle,
      },
    }
  }

  function commitWirePoint(position: Point, routeStyle: WireRouteStyle) {
    if (editingDisabled) {
      return
    }
    if (!wireStart) {
      setWireStart(position)
      setHoverPoint(position)
      return
    }
    if (pointsEqual(wireStart, position)) {
      setHoverPoint(position)
      return
    }
    addWire(sceneWireRoutePoints(wireStart, position, routeStyle))
    setWireStart(position)
    setHoverPoint(position)
  }

  function commitAnnotationPlacement(
    toolType: AnnotationPlacementTool,
    position: Point,
  ) {
    if (editingDisabled) {
      return
    }
    switch (toolType) {
      case "place-ground":
        placeGround(position)
        return
      case "place-voltage-probe":
        placeVoltageProbe(position)
        return
      case "place-current-probe":
        placeCurrentProbe(position)
        return
      case "place-net-label":
        placeNetLabel(position)
        return
      case "place-text":
        placeText(position)
        return
    }
  }

  function sceneWireRoutePoints(
    start: Point,
    end: Point,
    routeStyle: WireRouteStyle,
  ): ReadonlyArray<Point> {
    return routedWirePoints(start, end, routeStyle)
  }

  return (
    <div
      className={[
        "canvas-wrap",
        editingDisabled ? "editing-disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-editing-disabled={editingDisabled ? "true" : "false"}
      data-tool={tool.type}
      data-wheel-value-editing={
        editValuesWithMouseWheel && !editingDisabled ? "true" : "false"
      }
    >
      <svg
        ref={svgRef}
        className="schematic-canvas"
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
        onContextMenu={handleCanvasContextMenu}
      >
        <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
          <GridLayer bounds={worldBounds} />
          <ElementLayer
            objects={objects}
            selectedIds={selectedObjectIds}
            measurements={measurements}
            netHighlightIds={netHighlightObjectIds}
            showPower={false}
            showValues
            showVoltage
            voltageColors={defaultVoltageColors}
            onObjectPointerDown={handleObjectPointerDown}
            onObjectDoubleClick={handleObjectDoubleClick}
            onComponentPointerDown={handleComponentPointerDown}
            onWirePointerDown={handleWirePointerDown}
            onPointerEnterObject={setHoverObjectId}
            onPointerLeaveObject={() => setHoverObjectId(null)}
          />
          <PinLayer
            interactive={
              !editingDisabled && (tool.type === "draw-wire" || tool.type === "drag-post")
            }
            pinMode={tool.type === "drag-post" ? "primary-posts" : "all"}
            components={components}
            onPinPointerDown={handlePinPointerDown}
          />
          {axisToolMode ? null : (
            <PostLayer objects={objects} />
          )}
          {editingDisabled ? null : (
            <WireEditLayer
              pointMode={tool.type === "drag-post" ? "post-endpoints" : "all"}
              wires={
                tool.type === "drag-post"
                  ? wires
                  : wires.filter((wire) => selectedObjectIds.includes(wire.id))
              }
              onPointPointerDown={handleWirePointPointerDown}
              onMidpointPointerDown={handleWireMidpointPointerDown}
            />
          )}
          <PostHandleLayer
            activeDragPostObjectId={activeDragPostObjectId}
            grabbedPost={grabbedPostHandle}
            hoverObjectId={hoverObjectId}
            objects={objects}
            {...(!editingDisabled && tool.type === "drag-post"
              ? { onPostPointerDown: handlePostPointerDown }
              : {})}
            selectedIds={selectedObjectIds}
            showAllPosts={showDragPosts}
          />
          <RoutedWireSnapLayer point={routedWireSnapPoint} />
          <WireLayer
            wires={[]}
            selectedIds={selectedObjectIds}
            activeWirePoints={activeWirePoints ?? undefined}
            measurements={measurements}
            showVoltage
            voltageColors={defaultVoltageColors}
            onWirePointerDown={handleWirePointerDown}
          />
          {activeWirePreviewHandles.length > 0 ? (
            <g
              className="creation-preview-layer active-wire-preview-handles"
              data-testid="active-wire-preview-handles"
            >
              {activeWirePreviewHandles.map((position, index) => (
                <CreationPreviewHandle
                  key={`${position.x}-${position.y}-${index}`}
                  position={position}
                />
              ))}
            </g>
          ) : null}
          <CreationPreviewLayer
            annotationPreview={activeAnnotationPreview}
            componentPreview={activeComponentPreview}
          />
          {activeBoxPreview ? (
            <g className="creation-preview-layer" data-testid="box-preview-layer">
              <rect
                className="schematic-box preview"
                x={Math.min(activeBoxPreview.start.x, activeBoxPreview.current.x)}
                y={Math.min(activeBoxPreview.start.y, activeBoxPreview.current.y)}
                width={Math.abs(activeBoxPreview.current.x - activeBoxPreview.start.x)}
                height={Math.abs(activeBoxPreview.current.y - activeBoxPreview.start.y)}
              />
            </g>
          ) : null}
          {activeLinePreview ? (
            <g className="creation-preview-layer" data-testid="line-preview-layer">
              <line
                className="schematic-line preview"
                x1={activeLinePreview.start.x}
                y1={activeLinePreview.start.y}
                x2={activeLinePreview.current.x}
                y2={activeLinePreview.current.y}
              />
            </g>
          ) : null}
          <BadConnectionLayer issues={ercIssues} />
          <SelectionLayer
            marquee={marqueeRect}
          />
          <CursorGuideLayer
            bounds={worldBounds}
            cursor={cursorGuidePoint}
            showCrossHairs={showCursorCrossHairs}
            snapPoint={cursorGuideSnapPoint}
          />
        </g>
      </svg>
      {wheelValuePopup ? <ScrollValuePopup popup={wheelValuePopup} /> : null}
      <div className="canvas-controls" aria-label="Canvas controls">
        <button className="button" data-testid="zoom-out" onClick={() => zoomFromCenter(0.85)}>
          -
        </button>
        <button className="button" data-testid="zoom-fit" onClick={fitToObjects}>
          Fit All
        </button>
        <button
          className="button"
          data-testid="zoom-selection"
          disabled={selectedObjects.length === 0}
          onClick={fitToSelection}
        >
          Fit Sel
        </button>
        <span className="zoom-readout" data-testid="zoom-level">
          {Math.round(scale * 100)}%
        </span>
        <button className="button" data-testid="zoom-in" onClick={() => zoomFromCenter(1.15)}>
          +
        </button>
      </div>
      <CanvasStatusBar
        cursor={hoverPoint}
        hoverObjectId={hoverObjectId}
        measurements={measurements}
        objects={objects}
        scale={scale}
        selectedCount={selectedObjectIds.length}
        editingDisabled={editingDisabled}
      />
    </div>
  )
}

function ScrollValuePopup({ popup }: { popup: WheelValuePopupState }) {
  return (
    <div
      className="scroll-value-popup"
      data-component-id={popup.componentId}
      data-testid="scroll-value-popup"
      style={{ left: popup.x, top: popup.y }}
    >
      <div className="scroll-value-popup-title">{popup.label}</div>
      <div className="scroll-value-popup-values">
        {popup.values.map((entry) => (
          <div
            className={entry.active ? "active" : undefined}
            data-active={entry.active ? "true" : "false"}
            key={entry.value}
          >
            {entry.value}
          </div>
        ))}
      </div>
    </div>
  )
}

function isShapePostObject(object: SchematicObject): object is ShapePostObject {
  return object.kind === "line" || object.kind === "box"
}

function shouldIgnoreOutOfBoundsDrag(drag: DragState): boolean {
  return (
    drag.type === "pan" ||
    drag.type === "create-component" ||
    drag.type === "create-annotation" ||
    drag.type === "create-box" ||
    drag.type === "create-line" ||
    drag.type === "create-wire"
  )
}

function nearestShapePostEndpoint(
  object: ShapePostObject,
  point: Point,
  tolerance: number,
): ShapePostEndpoint | null {
  const startDistance = distance(point, object.start)
  const endDistance = distance(point, object.end)
  const nearest = startDistance <= endDistance ? startDistance : endDistance
  if (nearest > tolerance) {
    return null
  }
  return startDistance <= endDistance ? "start" : "end"
}


function nearestWirePointIndex(
  wire: WireObject,
  point: Point,
  tolerance: number,
  endpointsOnly = false,
): number | null {
  let nearest: { index: number; distance: number } | null = null
  const pointIndexes = endpointsOnly
    ? getWirePostIndexes(wire)
    : wire.points.map((_, index) => index)
  for (const index of pointIndexes) {
    const wirePoint = wire.points[index]
    if (!wirePoint) {
      continue
    }
    const pointDistance = distance(point, wirePoint)
    if (pointDistance > tolerance) {
      continue
    }
    if (!nearest || pointDistance < nearest.distance) {
      nearest = { index, distance: pointDistance }
    }
  }
  return nearest?.index ?? null
}

function isRoutedWireWithBends(wire: WireObject): boolean {
  return wire.points.length > 2 && isRoutedWire(wire)
}

function wireRouteStyleFromTool(
  tool: EditorTool,
  event: PointerEvent<SVGElement>,
): WireRouteStyle {
  if (tool.type !== "draw-wire" || (tool.routeMode ?? "straight") === "straight") {
    return "straight"
  }
  if (event.altKey) {
    return "straight"
  }
  if (event.shiftKey) {
    return "vertical-first"
  }
  return "horizontal-first"
}

function modifierDragMode(
  event: PointerEvent<SVGElement>,
): "drag-all" | "drag-row" | "drag-column" | "drag-post" | null {
  if (event.altKey && (event.metaKey || event.ctrlKey)) {
    return "drag-column"
  }
  if (event.altKey && event.shiftKey) {
    return "drag-row"
  }
  if (event.altKey) {
    return "drag-all"
  }
  if (event.shiftKey) {
    return null
  }
  if (event.metaKey || event.ctrlKey) {
    return "drag-post"
  }
  return null
}

function isTemporarySelectModifier(
  event: PointerEvent<SVGElement>,
): boolean {
  return event.shiftKey && !event.altKey
}

function isPlacementTool(tool: EditorTool): boolean {
  return (
    tool.type === "place-component" ||
    tool.type === "place-ground" ||
    tool.type === "place-voltage-probe" ||
    tool.type === "place-current-probe" ||
    tool.type === "place-net-label" ||
    tool.type === "place-text" ||
    tool.type === "place-box" ||
    tool.type === "place-line"
  )
}

function componentPreviewFromDrag(
  drag: DragState | null,
): { type: ComponentType; start: Point; end: Point } | null {
  return drag?.type === "create-component" &&
    !pointsEqual(drag.start, drag.current)
    ? { type: drag.component, start: drag.start, end: drag.current }
    : null
}

function annotationPreviewFromDrag(
  drag: DragState | null,
): AnnotationPreview | null {
  if (drag?.type !== "create-annotation" || pointsEqual(drag.start, drag.current)) {
    return null
  }
  return {
    kind: annotationPreviewKindForTool(drag.toolType),
    start: drag.start,
    current: drag.current,
  }
}

function annotationPlacementPosition(
  drag: Extract<DragState, { type: "create-annotation" }>,
): Point {
  return drag.toolType === "place-text" ? drag.current : drag.start
}

function annotationPreviewKindForTool(
  toolType: AnnotationPlacementTool,
): AnnotationPreview["kind"] {
  switch (toolType) {
    case "place-ground":
      return "ground"
    case "place-voltage-probe":
      return "voltage-probe"
    case "place-current-probe":
      return "current-probe"
    case "place-net-label":
      return "net-label"
    case "place-text":
      return "text"
  }
}

function CanvasStatusBar({
  cursor,
  editingDisabled,
  hoverObjectId,
  measurements,
  objects,
  scale,
  selectedCount,
}: {
  cursor: Point | null
  editingDisabled: boolean
  hoverObjectId: string | null
  measurements: RunObservationReport | null
  objects: ReadonlyArray<SchematicObject>
  scale: number
  selectedCount: number
}) {
  const hover = hoverObjectId
    ? objects.find((object) => object.id === hoverObjectId)
    : null
  const summary = hover
    ? measurementSummary(hover, measurements)
    : "Ready"

  return (
    <div className="canvas-status" data-testid="canvas-status">
      <span>
        {cursor ? `x ${cursor.x}, y ${cursor.y}` : "x -, y -"} · grid {GRID_SIZE} ·
        zoom {Math.round(scale * 100)}% · selected {selectedCount}
        {editingDisabled ? " · editing disabled" : ""}
      </span>
      <strong>{summary}</strong>
    </div>
  )
}

function measurementSummary(
  object: SchematicObject,
  measurements: RunObservationReport | null,
): string {
  if (!measurements) {
    return "No measurements available."
  }
  if (object.kind === "component") {
    const component = measurements.componentMeasurements.find(
      (candidate) => candidate.objectId === object.id,
    )
    return component
      ? `${component.refdes}: V ${formatMeasurement(component.voltage, "V")} · I ${formatMeasurement(
          component.current,
          "A",
        )} · P ${formatMeasurement(component.power, "W")}`
      : `${object.refdes}: no measurement`
  }
  if (object.kind === "probe") {
    const probe = measurements.probeMeasurements.find(
      (candidate) => candidate.objectId === object.id,
    )
    return `${object.name}: ${formatMeasurement(probe?.voltage, "V")} on ${
      probe?.netName ?? "unattached"
    }`
  }
  if (object.kind === "wire" || object.kind === "ground" || object.kind === "net-label") {
    const netId = measurements.netlist.objectToNetId.get(object.id)
    const net = measurements.netVoltages.find((candidate) => candidate.netId === netId)
    return net
      ? `${net.name}: ${formatMeasurement(net.voltage, "V")}`
      : `${object.kind}: no net`
  }
  return object.kind
}
