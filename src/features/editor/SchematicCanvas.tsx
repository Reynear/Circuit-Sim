import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
} from "react"
import {
  distance,
  pointOnSegment,
  pointsEqual,
  snapToGrid,
} from "../../lib/schematic/geometry"
import {
  getAnnotationLeadEnd,
  hasAnnotationLead,
  isLeadAnnotationObject,
} from "../../lib/schematic/annotations"
import {
  canDragCreateSymbol,
  getSymbolPlacement,
  type SymbolPlacement,
} from "../../lib/schematic/placement"
import {
  hasSelectDragDelayElapsed,
  nearestConnectionSnapPoint,
} from "../../lib/schematic/editor-interaction"
import {
  getPrimarySymbolPosts,
  getWirePostIndexes,
} from "../../lib/schematic/post-endpoints"
import {
  isLogicInputMomentary,
  isLogicInputTogglePoint,
  nextLogicInputPosition,
} from "../../lib/schematic/logic-inputs"
import {
  isSwitchTogglePoint,
  nextSwitchState,
} from "../../lib/schematic/switch-state"
import {
  MOUSE_HIT_TOLERANCE,
  hitTestObjects,
} from "../../lib/schematic/hit-testing"
import { pinConnectionKey } from "../../lib/schematic/net-extraction"
import { getSymbolPinWorldPositions } from "../../lib/schematic/transforms"
import {
  captureAxisDragTargets,
  useEditorStore,
  type EditorTool,
  type AxisDragTarget,
} from "../../lib/schematic/editor-store"
import {
  getMouseWheelValueEdit,
  type MouseWheelValueEdit,
} from "../../lib/schematic/values"
import {
  mergedObjectBounds,
  objectsMatchingSelectionRect,
  rectFromPoints,
  type SelectionRect,
} from "../../lib/schematic/selection-rect"
import {
  getRoutedWireSnapPoint,
  isRoutedWire,
  routeRoutedWire,
  routedWirePoints,
  type WireRouteStyle,
} from "../../lib/schematic/wire-routing"
import type {
  BoxObject,
  GroundObject,
  LineObject,
  NetLabelObject,
  ProbeObject,
  SchematicObject,
  SymbolObject,
  Vec2,
  WireObject,
} from "../../lib/schematic/types"
import { CursorGuideLayer } from "./layers/CursorGuideLayer"
import { BadConnectionLayer } from "./layers/BadConnectionLayer"
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
import { GridLayer } from "./layers/GridLayer"
import { PinLayer } from "./layers/PinLayer"
import { PostLayer } from "./layers/PostLayer"
import { RoutedWireSnapLayer } from "./layers/RoutedWireSnapLayer"
import { SelectionLayer } from "./layers/SelectionLayer"
import { WireEditLayer } from "./layers/WireEditLayer"
import { WireLayer } from "./layers/WireLayer"
import {
  formatMeasurement,
  type CircuitMeasurementReport,
} from "../../lib/simulation/measurements"

type MoveDragState = {
  type: "move"
  objectIds: string[]
  start: Vec2
  initialPositions: Record<string, Vec2>
  snapToGrid: boolean
}

type RoutedWireRerouteDragState = { type: "routed-wire-reroute"; wireId: string }

type DragState =
  | MoveDragState
  | { type: "wire-point"; wireId: string; pointIndex: number }
  | RoutedWireRerouteDragState
  | {
      type: "pending-select-drag"
      pointerDownTime: number
      pendingDrag: MoveDragState | RoutedWireRerouteDragState
    }
  | { type: "shape-post"; objectId: string; endpoint: ShapePostEndpoint }
  | {
      type: "annotation-post"
      objectId: string
      endpoint: AnnotationPostEndpoint
    }
  | { type: "post-group"; position: Vec2 }
  | { type: "held-logic-input"; symbolId: string; releasePosition: string }
  | { type: "pan"; startClient: Vec2; startPan: Vec2 }
  | { type: "marquee"; start: Vec2; current: Vec2; additive: boolean }
  | {
      type: "axis"
      axis: "x" | "y"
      line: number
      targets: AxisDragTarget[]
    }
  | { type: "symbol-pin"; symbolId: string; componentPinId: string }
  | {
      type: "create-symbol"
      componentDefinitionId: string
      props?: Record<string, unknown> | undefined
      start: Vec2
      current: Vec2
    }
  | {
      type: "create-wire"
      start: Vec2
      current: Vec2
      routeStyle: WireRouteStyle
    }
  | {
      type: "create-box"
      start: Vec2
      current: Vec2
    }
  | {
      type: "create-line"
      start: Vec2
      current: Vec2
    }
  | {
      type: "create-annotation"
      toolType: AnnotationPlacementTool
      start: Vec2
      current: Vec2
    }

type ShapePostEndpoint = "start" | "end"
type ShapePostObject = LineObject | BoxObject
type AnnotationPostEndpoint = "position" | "leadEnd"
type AnnotationPlacementTool =
  | "place-ground"
  | "place-voltage-probe"
  | "place-current-probe"
  | "place-net-label"
  | "place-text"

type WheelValuePopupState = MouseWheelValueEdit & {
  x: number
  y: number
  symbolId: string
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
  objects: SchematicObject[],
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
  if (drag.type === "annotation-post") {
    return {
      objectId: drag.objectId,
      postIndex: drag.endpoint === "position" ? 0 : 1,
    }
  }
  if (drag.type === "symbol-pin") {
    const symbol = objects.find(
      (object): object is SymbolObject =>
        object.kind === "symbol" && object.id === drag.symbolId,
    )
    if (!symbol) {
      return null
    }
    const postIndex = getPrimarySymbolPosts(symbol).findIndex(
      (post) => post.componentPinId === drag.componentPinId,
    )
    return postIndex >= 0
      ? { objectId: drag.symbolId, postIndex }
      : null
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
  const project = useEditorStore((state) => state.project)
  const activeSheetId = useEditorStore((state) => state.activeSheetId)
  const selectedObjectIds = useEditorStore((state) => state.selectedObjectIds)
  const tool = useEditorStore((state) => state.tool)
  const measurements = useEditorStore((state) => state.measurements)
  const ercIssues = useEditorStore((state) => state.ercIssues)
  const setTool = useEditorStore((state) => state.setTool)
  const selectObject = useEditorStore((state) => state.selectObject)
  const selectObjects = useEditorStore((state) => state.selectObjects)
  const checkpointHistory = useEditorStore((state) => state.checkpointHistory)
  const placeSymbol = useEditorStore((state) => state.placeSymbol)
  const placeGround = useEditorStore((state) => state.placeGround)
  const placeVoltageProbe = useEditorStore((state) => state.placeVoltageProbe)
  const placeCurrentProbe = useEditorStore((state) => state.placeCurrentProbe)
  const placeNetLabel = useEditorStore((state) => state.placeNetLabel)
  const placeText = useEditorStore((state) => state.placeText)
  const placeBox = useEditorStore((state) => state.placeBox)
  const placeLine = useEditorStore((state) => state.placeLine)
  const moveObjects = useEditorStore((state) => state.moveObjects)
  const moveAxisDragTargets = useEditorStore((state) => state.moveAxisDragTargets)
  const moveObjectsAtPost = useEditorStore((state) => state.moveObjectsAtPost)
  const moveSymbolPin = useEditorStore((state) => state.moveSymbolPin)
  const updateShapePost = useEditorStore((state) => state.updateShapePost)
  const updateAnnotationLeadPost = useEditorStore(
    (state) => state.updateAnnotationLeadPost,
  )
  const addWire = useEditorStore((state) => state.addWire)
  const updateWirePoint = useEditorStore((state) => state.updateWirePoint)
  const rerouteWireVia = useEditorStore((state) => state.rerouteWireVia)
  const insertWirePoint = useEditorStore((state) => state.insertWirePoint)
  const toggleSwitchState = useEditorStore(
    (state) => state.toggleSwitchState,
  )
  const setLogicInputPosition = useEditorStore(
    (state) => state.setLogicInputPosition,
  )
  const toggleLogicInputPosition = useEditorStore(
    (state) => state.toggleLogicInputPosition,
  )
  const updateSymbolProps = useEditorStore((state) => state.updateSymbolProps)
  const [size, setSize] = useState({ width: 900, height: 600 })
  const [pan, setPan] = useState<Vec2>({ x: 120, y: 80 })
  const [scale, setScale] = useState(1)
  const dragRef = useRef<DragState | null>(null)
  const wheelValuePopupTimeoutRef = useRef<number | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [wireStart, setWireStart] = useState<Vec2 | null>(null)
  const [wireRouteStyle, setWireRouteStyle] = useState<WireRouteStyle>("horizontal-first")
  const [hoverPoint, setHoverPoint] = useState<Vec2 | null>(null)
  const [cursorPoint, setCursorPoint] = useState<Vec2 | null>(null)
  const [cursorInsideCanvas, setCursorInsideCanvas] = useState(false)
  const [hoverObjectId, setHoverObjectId] = useState<string | null>(null)
  const [netHighlightKeyHeld, setNetHighlightKeyHeld] = useState(false)
  const [wheelValuePopup, setWheelValuePopup] =
    useState<WheelValuePopupState | null>(null)

  const sheet = project?.sheets.find((candidate) => candidate.id === activeSheetId)
  const sheetGridSize = sheet?.gridSize ?? 20
  const gridSize = sheetGridSize
  const objects = useMemo(() => sheet?.objects ?? [], [sheet])
  const selectedObjects = useMemo(
    () => objects.filter((object) => selectedObjectIds.includes(object.id)),
    [objects, selectedObjectIds],
  )
  const symbols = objects.filter(
    (object): object is SymbolObject => object.kind === "symbol",
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
  const activeSymbolPreview = symbolPreviewFromDrag(drag, gridSize)
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
    drag?.type === "symbol-pin" ||
    drag?.type === "shape-post" ||
    drag?.type === "annotation-post" ||
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
      netHighlightIdsForHover({
        hoverObjectId,
        keyHeld: netHighlightKeyHeld,
        measurements,
        objects,
      }),
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
    return getRoutedWireSnapPoint(wire, cursorPoint, gridSize)
  }, [cursorPoint, drag, editingDisabled, gridSize, hoverObjectId, tool.type, wires])

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

  function eventWorldPoint(event: PointerEvent<SVGElement>): Vec2 {
    return clientWorldPoint(event.clientX, event.clientY)
  }

  function clientWorldPoint(clientX: number, clientY: number): Vec2 {
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

  function snappedEventPoint(event: PointerEvent<SVGElement>): Vec2 {
    const raw = eventWorldPoint(event)
    const nearest = nearestConnectionSnapPoint(
      raw,
      objects,
      {
        gridSize,
        tolerance: Math.max(10, gridSize * 0.65),
      },
    )
    return nearest ?? snapToGrid(raw, gridSize)
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
        startPanDrag(event)
        return
      }
      if (event.button === 0) {
        selectObject(null)
      }
      return
    }
    if (isTemporarySelectModifier(event)) {
      startMarqueeSelection(rawPosition, event)
      return
    }
    if (tool.type !== "draw-wire" && modifierMode === "drag-row") {
      startAxisDragAt("y", position.y, event)
      return
    }
    if (tool.type !== "draw-wire" && modifierMode === "drag-column") {
      startAxisDragAt("x", position.x, event)
      return
    }
    if (
      event.button === 1 ||
      tool.type === "drag-all" ||
      (tool.type !== "draw-wire" && modifierMode === "drag-all")
    ) {
      startPanDrag(event)
      return
    }

    if (tool.type === "drag-row" || tool.type === "drag-column") {
      const axis = tool.type === "drag-column" ? "x" : "y"
      startAxisDragAt(axis, position[axis], event)
      return
    }

    if (tool.type === "drag-selected") {
      startMoveForObjectIds(selectedObjectIds, event)
      return
    }

    if (isPlacementTool(tool) && isTemporarySelectModifier(event)) {
      startMarqueeSelection(rawPosition, event)
      return
    }

    if (startPlacementToolAtPointer(event, position)) {
      return
    }
    if (tool.type === "draw-wire") {
      const routeStyle = wireRouteStyleFromTool(tool, event)
      setWireRouteStyle(routeStyle)
      if (event.detail >= 2) {
        setWireStart(null)
        setHoverPoint(null)
        return
      }
      setActiveDrag({
        type: "create-wire",
        start: position,
        current: position,
        routeStyle,
      })
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    if (tool.type === "drag-post") {
      return
    }

    setActiveDrag({
      type: "marquee",
      start: rawPosition,
      current: rawPosition,
      additive: event.shiftKey || event.metaKey || event.ctrlKey,
    })
    event.currentTarget.setPointerCapture(event.pointerId)
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
    } else if (activeDrag.type === "annotation-post") {
      updateAnnotationLeadPost(
        activeDrag.objectId,
        activeDrag.endpoint,
        position,
      )
    } else if (activeDrag.type === "post-group") {
      const delta = {
        x: position.x - activeDrag.position.x,
        y: position.y - activeDrag.position.y,
      }
      moveObjectsAtPost(activeDrag.position, delta)
      setActiveDrag({ ...activeDrag, position })
    } else if (activeDrag.type === "held-logic-input") {
      return
    } else if (activeDrag.type === "symbol-pin") {
      moveSymbolPin(activeDrag.symbolId, activeDrag.componentPinId, position)
    } else if (activeDrag.type === "axis") {
      const nextLine = position[activeDrag.axis]
      moveAxisDragTargets(
        activeDrag.axis,
        activeDrag.targets,
        nextLine - activeDrag.line,
      )
      setActiveDrag({ ...activeDrag, line: nextLine })
    } else if (activeDrag.type === "marquee") {
      const nextDrag = { ...activeDrag, current: rawPosition }
      setActiveDrag(nextDrag)
      selectObjects(selectionIdsForRect(rectFromPoints(nextDrag.start, nextDrag.current)), {
        additive: nextDrag.additive,
      })
    } else if (activeDrag.type === "create-symbol") {
      setActiveDrag({ ...activeDrag, current: position })
    } else if (activeDrag.type === "create-annotation") {
      setActiveDrag({
        ...activeDrag,
        current:
          activeDrag.toolType === "place-text" ? rawPosition : position,
      })
    } else if (activeDrag.type === "create-box") {
      setActiveDrag({ ...activeDrag, current: rawPosition })
    } else if (activeDrag.type === "create-wire") {
      setActiveDrag({
        ...activeDrag,
        current: position,
        routeStyle: wireRouteStyleFromTool(tool, event),
      })
    } else if (activeDrag.type === "create-line") {
      setActiveDrag({ ...activeDrag, current: rawPosition })
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
        const rect = rectFromPoints(activeDrag.start, activeDrag.current)
        selectObjects(selectionIdsForRect(rect), { additive: activeDrag.additive })
      } else if (activeDrag.type === "create-symbol") {
        const placement = getSymbolPlacement(
          activeDrag.componentDefinitionId,
          activeDrag.start,
          activeDrag.current,
          gridSize,
        )
        if (placement) {
          placeSymbol(activeDrag.componentDefinitionId, placement.position, {
            rotation: placement.rotation,
            ...(placement.pinSpacing
              ? { pinSpacing: placement.pinSpacing }
              : {}),
            ...(placement.pinSpread
              ? { pinSpread: placement.pinSpread }
              : {}),
            props: activeDrag.props,
          })
        }
      } else if (activeDrag.type === "create-annotation") {
        commitAnnotationPlacement(
          activeDrag.toolType,
          annotationPlacementPosition(activeDrag),
          annotationPlacementLeadEnd(activeDrag),
        )
      } else if (activeDrag.type === "create-box") {
        if (!pointsEqual(activeDrag.start, activeDrag.current)) {
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
        if (!pointsEqual(activeDrag.start, activeDrag.current)) {
          placeLine(activeDrag.start, activeDrag.current)
        }
      } else if (activeDrag.type === "held-logic-input") {
        setLogicInputPosition(
          activeDrag.symbolId,
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
        updateSymbolProps(valueEdit.symbol.id, {
          [valueEdit.edit.field]: valueEdit.edit.value,
        })
        showWheelValuePopup(valueEdit.symbol.id, valueEdit.edit, client)
        return
      }
    }
    const nextScale = Math.min(2.5, Math.max(0.35, scale * (event.deltaY > 0 ? 0.9 : 1.1)))
    zoomAtClient(client, world, nextScale)
  }

  function getWheelValueEditTarget(
    world: Vec2,
    deltaY: number,
  ): { symbol: SymbolObject; edit: MouseWheelValueEdit } | null {
    const hit = hitTestObjects(world, objects, 10 / scale)
    if (!hit || (hit.type !== "object" && hit.type !== "pin")) {
      return null
    }
    const symbol = objects.find(
      (object): object is SymbolObject =>
        object.kind === "symbol" && object.id === hit.objectId,
    )
    if (!symbol) {
      return null
    }
    const edit = getMouseWheelValueEdit(symbol, deltaY)
    return edit ? { symbol, edit } : null
  }

  function showWheelValuePopup(
    symbolId: string,
    edit: MouseWheelValueEdit,
    client: Vec2,
  ) {
    const popupWidth = 132
    const popupHeight = 140
    setWheelValuePopup({
      ...edit,
      symbolId,
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

  function zoomAtClient(client: Vec2, world: Vec2, nextScale: number) {
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
      startPanDrag(event)
      return
    }
    if (editingDisabled) {
      selectObject(objectId)
      return
    }
    const modifierMode = modifierDragMode(event)
    if (isTemporarySelectModifier(event)) {
      if (
        canDirectSelectPostDrag(objectId) &&
        startDirectSelectPostDragForObject(objectId, event)
      ) {
        return
      }
      selectObject(objectId, { toggle: true })
      return
    }
    if (tool.type === "draw-wire") {
      if (event.detail >= 2) {
        setWireStart(null)
        setTool({ type: "select" })
        startMoveForObject(objectId, event)
        return
      }
      startWireCreation(snappedEventPoint(event), event)
      return
    }
    if (
      tool.type === "drag-row" ||
      tool.type === "drag-column" ||
      modifierMode === "drag-row" ||
      modifierMode === "drag-column"
    ) {
      startAxisDrag(
        tool.type === "drag-column" || modifierMode === "drag-column"
          ? "x"
          : "y",
        event,
      )
      return
    }
    if (tool.type === "drag-all" || modifierMode === "drag-all") {
      startPanDrag(event)
      return
    }
    if (tool.type === "drag-post" || modifierMode === "drag-post") {
      if (startSymbolPinDragForObject(objectId, event)) {
        return
      }
      if (startShapePostDragForObject(objectId, event)) {
        return
      }
      if (startAnnotationPostDragForObject(objectId, event, true)) {
        return
      }
      if (tool.type === "drag-post") {
        startMoveForObject(objectId, event)
        return
      }
    }
    if (tool.type === "drag-selected") {
      startMoveForObjectIds([...selectedObjectIds, objectId], event)
      return
    }
    if (isPlacementTool(tool) && isTemporarySelectModifier(event)) {
      selectObject(objectId, { toggle: true })
      return
    }
    if (
      isPlacementTool(tool) &&
      startPlacementToolAtPointer(
        event,
        snappedEventPoint(event),
      )
    ) {
      return
    }
    if (tool.type !== "select") {
      selectObject(objectId)
      return
    }
    if (
      canDirectSelectPostDrag(objectId) &&
      startDirectSelectPostDragForObject(objectId, event)
    ) {
      return
    }
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      selectObject(objectId, { toggle: true })
      return
    }

    if (!startPendingMoveForObject(objectId, event)) {
      selectObject(objectId)
    }
  }

  function startMoveForObject(
    objectId: string,
    event: PointerEvent<SVGElement>,
  ): boolean {
    const object = objects.find((candidate) => candidate.id === objectId)
    if (!object || !objectMoveAnchor(object)) {
      selectObject(objectId)
      return false
    }

    const shouldMoveSelection = selectedObjectIds.includes(objectId)
    const movingIds = shouldMoveSelection ? selectedObjectIds : [objectId]
    if (!shouldMoveSelection) {
      selectObject(objectId)
    }
    return startMoveForObjectIds(movingIds, event)
  }

  function startPendingMoveForObject(
    objectId: string,
    event: PointerEvent<SVGElement>,
  ): boolean {
    const object = objects.find((candidate) => candidate.id === objectId)
    if (!object || !objectMoveAnchor(object)) {
      selectObject(objectId)
      return false
    }

    const shouldMoveSelection = selectedObjectIds.includes(objectId)
    const movingIds = shouldMoveSelection ? selectedObjectIds : [objectId]
    if (!shouldMoveSelection) {
      selectObject(objectId)
    }
    return startPendingMoveForObjectIds(movingIds, event)
  }

  function startMoveForObjectIds(
    objectIds: string[],
    event: PointerEvent<SVGElement>,
    start?: Vec2,
  ): boolean {
    const moveDrag = createMoveDragState(objectIds, event, start)
    if (!moveDrag) {
      return false
    }
    checkpointHistory()
    setActiveDrag(moveDrag)
    capturePointer(event.currentTarget, event.pointerId)
    return true
  }

  function startPendingMoveForObjectIds(
    objectIds: string[],
    event: PointerEvent<SVGElement>,
    start?: Vec2,
  ): boolean {
    const moveDrag = createMoveDragState(objectIds, event, start)
    if (!moveDrag) {
      return false
    }
    setActiveDrag({
      type: "pending-select-drag",
      pointerDownTime: window.performance.now(),
      pendingDrag: moveDrag,
    })
    capturePointer(event.currentTarget, event.pointerId)
    return true
  }

  function createMoveDragState(
    objectIds: string[],
    event: PointerEvent<SVGElement>,
    start?: Vec2,
  ): MoveDragState | null {
    if (editingDisabled) {
      return null
    }
    const movingIds = [...new Set(objectIds)]
    const movingObjects = objects.filter(
      (candidate) =>
        movingIds.includes(candidate.id) && Boolean(objectMoveAnchor(candidate)),
    )
    const snapToGrid = !movingObjects.every(isGraphicObject)
    const initialPositions = Object.fromEntries(
      movingObjects.map((candidate) => [
        candidate.id,
        objectMoveAnchor(candidate) ?? { x: 0, y: 0 },
      ]),
    )
    if (Object.keys(initialPositions).length === 0) {
      return null
    }
    const dragStart = start ?? (snapToGrid ? snappedEventPoint(event) : eventWorldPoint(event))
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
    snappedPosition: Vec2,
    rawPosition: Vec2,
  ) {
    const movePoint = dragState.snapToGrid ? snappedPosition : rawPosition
    const delta = {
      x: movePoint.x - dragState.start.x,
      y: movePoint.y - dragState.start.y,
    }
    moveObjects(
      Object.fromEntries(
        Object.entries(dragState.initialPositions).map(([id, initial]) => [
          id,
          { x: initial.x + delta.x, y: initial.y + delta.y },
        ]),
      ),
    )
  }

  function startMarqueeSelection(
    position: Vec2,
    event: PointerEvent<SVGElement>,
  ) {
    setActiveDrag({
      type: "marquee",
      start: position,
      current: position,
      additive: event.shiftKey || event.metaKey || event.ctrlKey,
    })
    capturePointer(event.currentTarget, event.pointerId)
  }

  function selectionIdsForRect(rect: SelectionRect): string[] {
    return objectsMatchingSelectionRect(objects, rect)
  }

  function startPlacementToolAtPointer(
    event: PointerEvent<SVGElement>,
    position: Vec2,
  ): boolean {
    if (tool.type === "place-symbol") {
      selectObject(null)
      if (canDragCreateSymbol(tool.componentDefinitionId)) {
        setActiveDrag({
          type: "create-symbol",
          componentDefinitionId: tool.componentDefinitionId,
          props: tool.props,
          start: position,
          current: position,
        })
        capturePointer(event.currentTarget, event.pointerId)
        return true
      }
      placeSymbol(tool.componentDefinitionId, position, { props: tool.props })
      return true
    }
    if (isAnnotationPlacementToolType(tool.type)) {
      selectObject(null)
      setActiveDrag({
        type: "create-annotation",
        toolType: tool.type,
        start: position,
        current: position,
      })
      capturePointer(event.currentTarget, event.pointerId)
      return true
    }
    if (tool.type === "place-box") {
      selectObject(null)
      setActiveDrag({
        type: "create-box",
        start: position,
        current: position,
      })
      capturePointer(event.currentTarget, event.pointerId)
      return true
    }
    if (tool.type === "place-line") {
      selectObject(null)
      setActiveDrag({
        type: "create-line",
        start: position,
        current: position,
      })
      capturePointer(event.currentTarget, event.pointerId)
      return true
    }
    return false
  }

  function startAxisDrag(axis: "x" | "y", event: PointerEvent<SVGElement>) {
    if (editingDisabled) {
      return
    }
    const position = snappedEventPoint(event)
    startAxisDragAt(axis, position[axis], event)
  }

  function startAxisDragAt(
    axis: "x" | "y",
    line: number,
    event: PointerEvent<SVGElement>,
  ) {
    if (editingDisabled) {
      return
    }
    selectObject(null)
    checkpointHistory()
    setActiveDrag({
      type: "axis",
      axis,
      line,
      targets: captureAxisDragTargets(objects, axis, line),
    })
    capturePointer(event.currentTarget, event.pointerId)
  }

  function startShapePostDragForObject(
    objectId: string,
    event: PointerEvent<SVGElement>,
  ): boolean {
    const object = objects.find(
      (candidate): candidate is ShapePostObject =>
        candidate.id === objectId && isShapePostObject(candidate),
    )
    if (!object) {
      return false
    }
    const endpoint = nearestShapePostEndpoint(
      object,
      eventWorldPoint(event),
      Math.max(10, gridSize * 0.75),
    )
    if (!endpoint) {
      return false
    }
    if (event.shiftKey) {
      return startPostGroupDrag(
        object.id,
        endpoint === "start" ? object.start : object.end,
        event,
      )
    }
    return startShapePostDrag(object, endpoint, event)
  }

  function startShapePostDrag(
    object: ShapePostObject,
    endpoint: ShapePostEndpoint,
    event: PointerEvent<SVGElement>,
  ): boolean {
    if (editingDisabled) {
      return false
    }
    selectObject(null)
    checkpointHistory()
    setActiveDrag({ type: "shape-post", objectId: object.id, endpoint })
    capturePointer(event.currentTarget, event.pointerId)
    return true
  }

  function startAnnotationPostDragForObject(
    objectId: string,
    event: PointerEvent<SVGElement>,
    includeLeadEnd: boolean,
  ): boolean {
    const object = objects.find(
      (candidate): candidate is GroundObject | NetLabelObject | ProbeObject =>
        candidate.id === objectId && isLeadAnnotationObject(candidate),
    )
    if (!object) {
      return false
    }
    const endpoint = nearestAnnotationPostEndpoint(
      object,
      eventWorldPoint(event),
      Math.max(10, gridSize * 0.75),
      includeLeadEnd,
    )
    if (!endpoint) {
      return false
    }
    const point =
      endpoint === "position" ? object.position : getAnnotationLeadEnd(object)
    if (event.shiftKey) {
      return startPostGroupDrag(object.id, point, event)
    }
    return startAnnotationPostDrag(object, endpoint, event)
  }

  function startAnnotationPostDrag(
    object: GroundObject | NetLabelObject | ProbeObject,
    endpoint: AnnotationPostEndpoint,
    event: PointerEvent<SVGElement>,
  ): boolean {
    if (editingDisabled) {
      return false
    }
    selectObject(null)
    checkpointHistory()
    setActiveDrag({ type: "annotation-post", objectId: object.id, endpoint })
    capturePointer(event.currentTarget, event.pointerId)
    return true
  }

  function startDirectSelectPostDragForObject(
    objectId: string,
    event: PointerEvent<SVGElement>,
  ): boolean {
    if (startSymbolPinDragForObject(objectId, event)) {
      return true
    }
    if (startShapePostDragForObject(objectId, event)) {
      return true
    }
    if (startAnnotationPostDragForObject(objectId, event, false)) {
      return true
    }
    const object = objects.find((candidate) => candidate.id === objectId)
    if (object && event.shiftKey && "position" in object) {
      return startPostGroupDrag(object.id, object.position, event)
    }
    return false
  }

  function canDirectSelectPostDrag(objectId: string): boolean {
    return !selectedObjectIds.some((selectedId) => selectedId !== objectId)
  }

  function startPostGroupDrag(
    objectId: string,
    position: Vec2,
    event: PointerEvent<SVGElement>,
  ): boolean {
    if (editingDisabled) {
      return false
    }
    selectObject(null)
    checkpointHistory()
    setActiveDrag({ type: "post-group", position })
    capturePointer(event.currentTarget, event.pointerId)
    return true
  }

  function capturePointer(target: SVGElement, pointerId: number) {
    const captureTarget = target.ownerSVGElement ?? target
    captureTarget.setPointerCapture(pointerId)
  }

  function startPanDrag(event: PointerEvent<SVGElement>) {
    selectObject(null)
    setActiveDrag({
      type: "pan",
      startClient: { x: event.clientX, y: event.clientY },
      startPan: pan,
    })
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId)
  }

  function handleSymbolPointerDown(
    symbolId: string,
    event: PointerEvent<SVGGElement>,
  ) {
    const symbol = symbols.find((candidate) => candidate.id === symbolId)
    if (
      symbol &&
      event.button === 0 &&
      !editingDisabled &&
      tool.type === "select" &&
      isLogicInputTogglePoint(
        symbol,
        eventWorldPoint(event),
        Math.max(10, gridSize * 0.6),
      )
    ) {
      event.stopPropagation()
      selectObject(symbolId)
      if (isLogicInputMomentary(symbol)) {
        const releasePosition = String(symbol.props.position ?? "0")
        setLogicInputPosition(
          symbolId,
          nextLogicInputPosition(symbol) ?? "1",
          { history: false },
        )
        setActiveDrag({
          type: "held-logic-input",
          symbolId,
          releasePosition,
        })
        capturePointer(event.currentTarget, event.pointerId)
        return
      }
      toggleLogicInputPosition(symbolId)
      return
    }
    if (
      symbol &&
      event.button === 0 &&
      !editingDisabled &&
      tool.type === "select" &&
      isSwitchTogglePoint(
        symbol,
        eventWorldPoint(event),
        Math.max(10, gridSize * 0.6),
      )
    ) {
      event.stopPropagation()
      selectObject(symbolId)
      toggleSwitchState(symbolId)
      return
    }
    handleObjectPointerDown(symbolId, event)
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
      startPanDrag(event)
      return
    }
    if (editingDisabled) {
      selectObject(wireId)
      return
    }
    const modifierMode = modifierDragMode(event)
    if (isTemporarySelectModifier(event)) {
      const wire = objects.find(
        (object): object is WireObject =>
          object.kind === "wire" && object.id === wireId,
      )
      const pointIndex = wire
        ? nearestWirePointIndex(
            wire,
            eventWorldPoint(event),
            Math.max(10, gridSize * 0.75),
            isRoutedWireWithBends(wire),
          )
        : null
      if (wire && pointIndex !== null) {
        startWirePointDrag(wire, pointIndex, event)
        return
      }
      selectObject(wireId, { toggle: true })
      return
    }
    if (tool.type === "draw-wire") {
      startWireCreation(snappedEventPoint(event), event)
      return
    }
    if (tool.type === "drag-post" || modifierMode === "drag-post") {
      const wire = objects.find(
        (object): object is WireObject =>
          object.kind === "wire" && object.id === wireId,
      )
      const pointIndex = wire
        ? nearestWirePointIndex(
            wire,
            eventWorldPoint(event),
            Math.max(10, gridSize * 0.75),
            true,
          )
        : null
      if (wire && pointIndex !== null) {
        startWirePointDrag(wire, pointIndex, event)
        return
      }
      const split = wire
        ? splitWireAtPoint(wire, eventWorldPoint(event), gridSize)
        : null
      if (wire && split) {
        insertWirePoint(wire.id, split.afterPointIndex, split.position)
        selectObject(null)
        setActiveDrag({
          type: "wire-point",
          wireId: wire.id,
          pointIndex: split.afterPointIndex + 1,
        })
        event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId)
      }
      return
    }
    if (
      tool.type === "drag-row" ||
      tool.type === "drag-column" ||
      modifierMode === "drag-row" ||
      modifierMode === "drag-column"
    ) {
      startAxisDrag(
        tool.type === "drag-column" || modifierMode === "drag-column"
          ? "x"
          : "y",
        event,
      )
      return
    }
    if (tool.type === "drag-all" || modifierMode === "drag-all") {
      startPanDrag(event)
      return
    }
    if (tool.type === "drag-selected") {
      startMoveForObjectIds([...selectedObjectIds, wireId], event)
      return
    }
    if (isPlacementTool(tool) && isTemporarySelectModifier(event)) {
      selectObject(wireId, { toggle: true })
      return
    }
    if (
      isPlacementTool(tool) &&
      startPlacementToolAtPointer(event, snappedEventPoint(event))
    ) {
      return
    }
    if (tool.type === "select" && canDirectSelectPostDrag(wireId)) {
      const wire = objects.find(
        (object): object is WireObject =>
          object.kind === "wire" && object.id === wireId,
      )
      const pointIndex = wire
        ? nearestWirePointIndex(
            wire,
            eventWorldPoint(event),
            Math.max(10, gridSize * 0.75),
            isRoutedWireWithBends(wire),
          )
        : null
      if (wire && pointIndex !== null) {
        startWirePointDrag(wire, pointIndex, event)
        return
      }
      if (wire && startPendingRoutedWireReroute(wire, event)) {
        return
      }
    }
    if (tool.type === "select" && (event.shiftKey || event.metaKey || event.ctrlKey)) {
      selectObject(wireId, { toggle: true })
      return
    }
    if (tool.type === "select" && startPendingMoveForObject(wireId, event)) {
      return
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
      startPanDrag(event)
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
      startAxisDrag(
        tool.type === "drag-column" || modifierMode === "drag-column"
          ? "x"
          : "y",
        event,
      )
      return
    }
    if (tool.type === "drag-all" || modifierMode === "drag-all") {
      startPanDrag(event)
      return
    }
    const wire = objects.find(
      (object): object is WireObject =>
        object.kind === "wire" && object.id === wireId,
    )
    const point = wire?.points[pointIndex]
    if (tool.type === "drag-post" && event.shiftKey && point) {
      startPostGroupDrag(wireId, point, event)
      return
    }
    if (wire) {
      startWirePointDrag(wire, pointIndex, event)
    }
  }

  function handleWireMidpointPointerDown(
    wireId: string,
    segmentIndex: number,
    position: Vec2,
    event: PointerEvent<SVGRectElement>,
  ) {
    event.stopPropagation()
    if (event.button === 2) {
      return
    }
    if (event.button === 1) {
      startPanDrag(event)
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
      startAxisDrag(
        tool.type === "drag-column" || modifierMode === "drag-column"
          ? "x"
          : "y",
        event,
      )
      return
    }
    if (tool.type === "drag-all" || modifierMode === "drag-all") {
      startPanDrag(event)
      return
    }
    insertWirePoint(wireId, segmentIndex, position)
    selectObject(
      tool.type === "drag-post" || modifierMode === "drag-post" ? null : wireId,
    )
    setActiveDrag({ type: "wire-point", wireId, pointIndex: segmentIndex + 1 })
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId)
  }

  function startWirePointDrag(
    wire: WireObject,
    pointIndex: number,
    event: PointerEvent<SVGElement>,
  ): boolean {
    const point = wire.points[pointIndex]
    if (!point) {
      return false
    }
    if (event.shiftKey) {
      return startPostGroupDrag(wire.id, point, event)
    }
    selectObject(null)
    checkpointHistory()
    setActiveDrag({ type: "wire-point", wireId: wire.id, pointIndex })
    capturePointer(event.currentTarget, event.pointerId)
    return true
  }

  function startPendingRoutedWireReroute(
    wire: WireObject,
    event: PointerEvent<SVGElement>,
  ): boolean {
    if (!isRoutedWireWithBends(wire)) {
      return false
    }
    selectObject(wire.id)
    setActiveDrag({
      type: "pending-select-drag",
      pointerDownTime: window.performance.now(),
      pendingDrag: { type: "routed-wire-reroute", wireId: wire.id },
    })
    capturePointer(event.currentTarget, event.pointerId)
    return true
  }

  function startSymbolPinDragForObject(
    objectId: string,
    event: PointerEvent<SVGElement>,
  ): boolean {
    const symbol = objects.find(
      (candidate): candidate is SymbolObject =>
        candidate.id === objectId && candidate.kind === "symbol",
    )
    if (!symbol) {
      return false
    }
    const pin = nearestSymbolPost(
      symbol,
      eventWorldPoint(event),
      Math.max(10, gridSize * 0.75),
    )
    if (!pin) {
      return false
    }
    if (event.shiftKey) {
      return startPostGroupDrag(symbol.id, pin.position, event)
    }
    if (editingDisabled) {
      return false
    }
    selectObject(null)
    checkpointHistory()
    setActiveDrag({
      type: "symbol-pin",
      symbolId: symbol.id,
      componentPinId: pin.componentPinId,
    })
    capturePointer(event.currentTarget, event.pointerId)
    return true
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
      startPanDrag(event)
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
      if (tool.type === "drag-post" && event.shiftKey) {
        startPostGroupDrag(
          shapeObject.id,
          postIndex === 0 ? shapeObject.start : shapeObject.end,
          event,
        )
        return
      }
      startShapePostDrag(shapeObject, postIndex === 0 ? "start" : "end", event)
      return
    }
    const annotationObject = objects.find(
      (candidate): candidate is GroundObject | NetLabelObject | ProbeObject =>
        candidate.id === objectId && isLeadAnnotationObject(candidate),
    )
    if (!annotationObject) {
      return
    }
    const endpoint: AnnotationPostEndpoint =
      postIndex === 0 ? "position" : "leadEnd"
    const point =
      endpoint === "position"
        ? annotationObject.position
        : getAnnotationLeadEnd(annotationObject)
    if (tool.type === "drag-post" && event.shiftKey) {
      startPostGroupDrag(annotationObject.id, point, event)
      return
    }
    startAnnotationPostDrag(annotationObject, endpoint, event)
  }

  function handlePinPointerDown(
    symbolId: string,
    componentPinId: string,
    position: Vec2,
    event: PointerEvent<SVGCircleElement>,
  ) {
    if (event.button === 2) {
      event.stopPropagation()
      return
    }
    if (event.button === 1) {
      event.stopPropagation()
      startPanDrag(event)
      return
    }
    if (editingDisabled) {
      event.stopPropagation()
      selectObject(symbolId)
      return
    }
    if (
      tool.type === "drag-post" ||
      modifierDragMode(event) === "drag-post"
    ) {
      event.stopPropagation()
      if (tool.type === "drag-post" && event.shiftKey) {
        startPostGroupDrag(symbolId, position, event)
        return
      }
      selectObject(null)
      checkpointHistory()
      setActiveDrag({ type: "symbol-pin", symbolId, componentPinId })
      event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId)
      return
    }
    if (tool.type === "draw-wire") {
      event.stopPropagation()
      if (event.detail >= 2) {
        setWireStart(null)
        setTool({ type: "select" })
        selectObject(symbolId)
        return
      }
      startWireCreation(snapToGrid(position, gridSize), event)
    }
  }

  function startWireCreation(position: Vec2, event: PointerEvent<SVGElement>) {
    if (editingDisabled) {
      return
    }
    const routeStyle = wireRouteStyleFromTool(tool, event)
    setWireRouteStyle(routeStyle)
    setActiveDrag({
      type: "create-wire",
      start: position,
      current: position,
      routeStyle,
    })
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId)
  }

  function commitWirePoint(position: Vec2, routeStyle: WireRouteStyle) {
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
    position: Vec2,
    leadEnd?: Vec2,
  ) {
    if (editingDisabled) {
      return
    }
    switch (toolType) {
      case "place-ground":
        placeGround(position, leadEnd)
        return
      case "place-voltage-probe":
        placeVoltageProbe(position, leadEnd)
        return
      case "place-current-probe":
        placeCurrentProbe(position, leadEnd)
        return
      case "place-net-label":
        placeNetLabel(position, undefined, leadEnd)
        return
      case "place-text":
        placeText(position)
        return
    }
  }

  function sceneWireRoutePoints(
    start: Vec2,
    end: Vec2,
    routeStyle: WireRouteStyle,
  ): Vec2[] {
    return routeStyle === "straight"
      ? routedWirePoints(start, end, routeStyle)
      : routeRoutedWire(start, end, {
          fallbackStyle: routeStyle,
          gridSize,
          objects,
        })
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
          <GridLayer bounds={worldBounds} gridSize={gridSize} />
          <ElementLayer
            objects={objects}
            selectedIds={selectedObjectIds}
            measurements={measurements}
            netHighlightIds={netHighlightObjectIds}
            europeanResistors={false}
            iecGates={false}
            showPower={false}
            showValues
            showVoltage
            voltageColors={defaultVoltageColors}
            onObjectPointerDown={handleObjectPointerDown}
            onObjectDoubleClick={handleObjectDoubleClick}
            onSymbolPointerDown={handleSymbolPointerDown}
            onWirePointerDown={handleWirePointerDown}
            onPointerEnterObject={setHoverObjectId}
            onPointerLeaveObject={() => setHoverObjectId(null)}
          />
          <PinLayer
            interactive={
              !editingDisabled && (tool.type === "draw-wire" || tool.type === "drag-post")
            }
            pinMode={tool.type === "drag-post" ? "primary-posts" : "all"}
            symbols={symbols}
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
            europeanResistors={false}
            iecGates={false}
            symbolPreview={activeSymbolPreview}
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
        gridSize={gridSize}
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
      data-symbol-id={popup.symbolId}
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

function objectMoveAnchor(object: SchematicObject): Vec2 | null {
  if (object.kind === "wire") {
    return object.points[0] ?? null
  }
  if (object.kind === "line") {
    return object.start
  }
  if (object.kind === "box") {
    return object.start
  }
  if ("position" in object) {
    return object.position
  }
  return null
}

function isGraphicObject(object: SchematicObject): boolean {
  return object.kind === "box" || object.kind === "line" || object.kind === "text"
}

function isShapePostObject(object: SchematicObject): object is ShapePostObject {
  return object.kind === "line" || object.kind === "box"
}

function shouldIgnoreOutOfBoundsDrag(drag: DragState): boolean {
  return (
    drag.type === "pan" ||
    drag.type === "create-symbol" ||
    drag.type === "create-annotation" ||
    drag.type === "create-box" ||
    drag.type === "create-line" ||
    drag.type === "create-wire"
  )
}

function nearestShapePostEndpoint(
  object: ShapePostObject,
  point: Vec2,
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

function nearestAnnotationPostEndpoint(
  object: GroundObject | NetLabelObject | ProbeObject,
  point: Vec2,
  tolerance: number,
  includeLeadEnd: boolean,
): AnnotationPostEndpoint | null {
  const positionDistance = distance(point, object.position)
  const leadEnd = getAnnotationLeadEnd(object)
  const leadEndDistance =
    includeLeadEnd && hasAnnotationLead(object)
      ? distance(point, leadEnd)
      : Number.POSITIVE_INFINITY
  const nearest = Math.min(positionDistance, leadEndDistance)
  if (nearest > tolerance) {
    return null
  }
  return positionDistance <= leadEndDistance ? "position" : "leadEnd"
}

function nearestSymbolPost(
  symbol: SymbolObject,
  point: Vec2,
  tolerance: number,
): { componentPinId: string; position: Vec2 } | null {
  let nearestPin: { componentPinId: string; position: Vec2; distance: number } | null =
    null
  for (const pin of getPrimarySymbolPosts(symbol)) {
    const pinDistance = distance(point, pin.position)
    if (pinDistance > tolerance) {
      continue
    }
    if (!nearestPin || pinDistance < nearestPin.distance) {
      nearestPin = { ...pin, distance: pinDistance }
    }
  }
  return nearestPin
    ? {
        componentPinId: nearestPin.componentPinId,
        position: nearestPin.position,
      }
    : null
}

function nearestWirePointIndex(
  wire: WireObject,
  point: Vec2,
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

function netHighlightIdsForHover({
  hoverObjectId,
  keyHeld,
  measurements,
  objects,
}: {
  hoverObjectId: string | null
  keyHeld: boolean
  measurements: CircuitMeasurementReport | null
  objects: SchematicObject[]
}): string[] {
  if (!keyHeld || !hoverObjectId || !measurements) {
    return []
  }
  const hoverObject = objects.find((object) => object.id === hoverObjectId)
  if (hoverObject?.kind !== "wire") {
    return []
  }
  const netId = measurements.netlist.objectToNetId[hoverObject.id]
  if (!netId) {
    return []
  }

  return objects
    .filter((object) => objectTouchesNet(object, netId, measurements))
    .map((object) => object.id)
}

function objectTouchesNet(
  object: SchematicObject,
  netId: string,
  measurements: CircuitMeasurementReport,
): boolean {
  if (measurements.netlist.objectToNetId[object.id] === netId) {
    return true
  }
  if (object.kind !== "symbol") {
    return false
  }
  return getSymbolPinWorldPositions(object).some(
    (pin) =>
      measurements.netlist.pinToNetId[
        pinConnectionKey(object.id, pin.componentPinId)
      ] === netId,
  )
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

function splitWireAtPoint(
  wire: WireObject,
  point: Vec2,
  gridSize: number,
): { afterPointIndex: number; position: Vec2 } | null {
  const snapped = snapToGrid(point, gridSize)
  for (let index = 0; index < wire.points.length - 1; index += 1) {
    const start = wire.points[index]
    const end = wire.points[index + 1]
    if (!start || !end) {
      continue
    }
    const position = projectedSplitPoint(snapped, start, end)
    if (
      pointsEqual(position, start) ||
      pointsEqual(position, end) ||
      !pointOnSegment(position, start, end, gridSize / 2)
    ) {
      continue
    }
    return { afterPointIndex: index, position }
  }
  return null
}

function projectedSplitPoint(point: Vec2, start: Vec2, end: Vec2): Vec2 {
  if (start.x === end.x) {
    return { x: start.x, y: point.y }
  }
  if (start.y === end.y) {
    return { x: point.x, y: start.y }
  }
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    return start
  }
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  )
  return {
    x: Math.round(start.x + dx * t),
    y: Math.round(start.y + dy * t),
  }
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
    tool.type === "place-symbol" ||
    tool.type === "place-ground" ||
    tool.type === "place-voltage-probe" ||
    tool.type === "place-current-probe" ||
    tool.type === "place-net-label" ||
    tool.type === "place-text" ||
    tool.type === "place-box" ||
    tool.type === "place-line"
  )
}

function isAnnotationPlacementToolType(
  type: EditorTool["type"],
): type is AnnotationPlacementTool {
  return (
    type === "place-ground" ||
    type === "place-voltage-probe" ||
    type === "place-current-probe" ||
    type === "place-net-label" ||
    type === "place-text"
  )
}

function symbolPreviewFromDrag(
  drag: DragState | null,
  gridSize: number,
): { componentDefinitionId: string; placement: SymbolPlacement } | null {
  if (drag?.type !== "create-symbol") {
    return null
  }
  const placement = getSymbolPlacement(
    drag.componentDefinitionId,
    drag.start,
    drag.current,
    gridSize,
  )
  return placement
    ? { componentDefinitionId: drag.componentDefinitionId, placement }
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
): Vec2 {
  return drag.toolType === "place-text" ? drag.current : drag.start
}

function annotationPlacementLeadEnd(
  drag: Extract<DragState, { type: "create-annotation" }>,
): Vec2 | undefined {
  return drag.toolType === "place-text" ||
    pointsEqual(drag.start, drag.current)
    ? undefined
    : drag.current
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
  gridSize,
  hoverObjectId,
  measurements,
  objects,
  scale,
  selectedCount,
}: {
  cursor: Vec2 | null
  editingDisabled: boolean
  gridSize: number
  hoverObjectId: string | null
  measurements: CircuitMeasurementReport | null
  objects: SchematicObject[]
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
        {cursor ? `x ${cursor.x}, y ${cursor.y}` : "x -, y -"} · grid {gridSize} ·
        zoom {Math.round(scale * 100)}% · selected {selectedCount}
        {editingDisabled ? " · editing disabled" : ""}
      </span>
      <strong>{summary}</strong>
    </div>
  )
}

function measurementSummary(
  object: SchematicObject,
  measurements: CircuitMeasurementReport | null,
): string {
  if (!measurements) {
    return "No measurements available."
  }
  if (object.kind === "symbol") {
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
    const netId = measurements.netlist.objectToNetId[object.id]
    const net = measurements.netVoltages.find((candidate) => candidate.netId === netId)
    return net
      ? `${net.name}: ${formatMeasurement(net.voltage, "V")}`
      : `${object.kind}: no net`
  }
  return object.kind
}
