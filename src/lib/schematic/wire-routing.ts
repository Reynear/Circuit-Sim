import { pointsEqual } from "./geometry"
import {
  getAnnotationLeadEnd,
  hasAnnotationLead,
  isLeadAnnotationObject,
} from "./annotations"
import {
  leadAnnotationBodyRects,
  leadAnnotationBodySegments,
  leadAnnotationBounds,
} from "./lead-annotation-geometry"
import { getSymbolWorldBounds } from "./symbol-geometry"
import type { SchematicObject, Vec2, WireObject } from "./types"

export type WireRouteStyle = "horizontal-first" | "vertical-first" | "straight"

type OrthogonalRouteStyle = Exclude<WireRouteStyle, "straight">

type RouteOptions = {
  objects?: SchematicObject[]
  gridSize?: number
  excludeObjectIds?: string[]
  fallbackStyle?: OrthogonalRouteStyle
  extraObstacleSegments?: Array<{ start: Vec2; end: Vec2 }>
}

type Rect = { x: number; y: number; width: number; height: number }
type Cell = { row: number; col: number }
type RoutingGrid = {
  blocked: Set<string>
  cols: number
  gridSize: number
  originX: number
  originY: number
  rows: number
}

const DEFAULT_GRID_SIZE = 20
const ROUTER_MARGIN_CELLS = 4
const TURN_PENALTY = 4

export function routedWirePoints(
  start: Vec2,
  end: Vec2,
  style: WireRouteStyle,
): Vec2[] {
  if (style === "straight") {
    return [start, end]
  }
  if (start.x === end.x || start.y === end.y) {
    return [start, end]
  }
  return style === "vertical-first"
    ? [start, { x: start.x, y: end.y }, end]
    : [start, { x: end.x, y: start.y }, end]
}

export function isRoutedWire(wire: WireObject): boolean {
  return wire.points.every((point, index) => {
    const next = wire.points[index + 1]
    return !next || point.x === next.x || point.y === next.y
  })
}

export function hasConvertibleWires(objects: SchematicObject[]): boolean {
  return objects.some(
    (object) => object.kind === "wire" && !isRoutedWire(object),
  )
}

export function convertWireToRoutedWire(
  wire: WireObject,
  style: OrthogonalRouteStyle = "horizontal-first",
): WireObject {
  if (isRoutedWire(wire) || wire.points.length < 2) {
    return wire
  }

  const points: Vec2[] = []
  for (let index = 0; index < wire.points.length - 1; index += 1) {
    const start = wire.points[index]
    const end = wire.points[index + 1]
    if (!start || !end) {
      continue
    }
    appendPoints(points, routedWirePoints(start, end, style))
  }

  return points.length >= 2 ? { ...wire, points } : wire
}

export function routeRoutedWire(
  start: Vec2,
  end: Vec2,
  options: RouteOptions = {},
): Vec2[] {
  const gridSize = options.gridSize ?? DEFAULT_GRID_SIZE
  const style = options.fallbackStyle ?? "horizontal-first"
  const grid = createRoutingGrid(start, end, options)
  const routed =
    tryPatternRoute(start, end, grid, style) ??
    routeWithAStar(start, end, grid, style)
  return routed ?? routedWirePoints(start, end, style)
}

export function rerouteWireVia(
  wire: WireObject,
  via: Vec2,
  optionsOrStyle: RouteOptions | OrthogonalRouteStyle = "horizontal-first",
): WireObject {
  const start = wire.points[0]
  const end = wire.points.at(-1)
  if (!start || !end) {
    return wire
  }

  const options =
    typeof optionsOrStyle === "string"
      ? { fallbackStyle: optionsOrStyle }
      : optionsOrStyle
  const excludedIds = new Set(options.excludeObjectIds ?? [])
  excludedIds.add(wire.id)
  const baseOptions = {
    ...options,
    excludeObjectIds: [...excludedIds],
  }
  const firstRoute = routeRoutedWire(start, via, baseOptions)
  const secondRoute = routeRoutedWire(via, end, {
    ...baseOptions,
    extraObstacleSegments: [
      ...(baseOptions.extraObstacleSegments ?? []),
      ...segmentsForRoute(firstRoute),
    ],
  })

  const points: Vec2[] = []
  appendPoints(points, firstRoute)
  appendPoints(points, secondRoute)

  return points.length >= 2 ? { ...wire, points } : wire
}

export function getRoutedWireSnapPoint(
  wire: WireObject,
  raw: Vec2,
  gridSize: number,
): Vec2 | null {
  if (wire.points.length < 2) {
    return null
  }

  let bestSegment: { index: number; distanceSquared: number } | null = null
  for (let index = 0; index < wire.points.length - 1; index += 1) {
    const start = wire.points[index]
    const end = wire.points[index + 1]
    if (!start || !end) {
      continue
    }
    const distanceSquared = distanceToSegmentSquared(start, end, raw)
    if (!bestSegment || distanceSquared < bestSegment.distanceSquared) {
      bestSegment = { index, distanceSquared }
    }
  }

  if (!bestSegment) {
    return null
  }

  const start = wire.points[bestSegment.index]
  const end = wire.points[bestSegment.index + 1]
  if (!start || !end) {
    return null
  }

  return start.x === end.x
    ? { x: start.x, y: snapCoordinate(raw.y, gridSize) }
    : { x: snapCoordinate(raw.x, gridSize), y: start.y }
}

function appendPoints(target: Vec2[], points: Vec2[]) {
  for (const point of points) {
    const previous = target.at(-1)
    if (!previous || !pointsEqual(previous, point)) {
      target.push(point)
    }
  }
}

function createRoutingGrid(start: Vec2, end: Vec2, options: RouteOptions): RoutingGrid {
  const gridSize = options.gridSize ?? DEFAULT_GRID_SIZE
  const bounds = routingBounds(start, end, options)
  const originX =
    Math.floor(bounds.x / gridSize) * gridSize - ROUTER_MARGIN_CELLS * gridSize
  const originY =
    Math.floor(bounds.y / gridSize) * gridSize - ROUTER_MARGIN_CELLS * gridSize
  const maxX = bounds.x + bounds.width
  const maxY = bounds.y + bounds.height
  const cols =
    Math.ceil((maxX - originX) / gridSize) + 1 + ROUTER_MARGIN_CELLS * 2
  const rows =
    Math.ceil((maxY - originY) / gridSize) + 1 + ROUTER_MARGIN_CELLS * 2
  const grid: RoutingGrid = {
    blocked: new Set(),
    cols,
    gridSize,
    originX,
    originY,
    rows,
  }

  const excluded = new Set(options.excludeObjectIds ?? [])
  for (const object of options.objects ?? []) {
    if (excluded.has(object.id)) {
      continue
    }
    markObjectObstacle(grid, object)
  }
  for (const segment of options.extraObstacleSegments ?? []) {
    markSegmentObstacle(grid, segment.start, segment.end)
  }

  clearCell(grid, pointToCell(grid, start))
  clearCell(grid, pointToCell(grid, end))
  return grid
}

function routingBounds(start: Vec2, end: Vec2, options: RouteOptions): Rect {
  const rects = [
    pointRect(start),
    pointRect(end),
    ...(options.objects ?? []).flatMap(objectRoutingRects),
    ...(options.extraObstacleSegments ?? []).flatMap((segment) => [
      pointRect(segment.start),
      pointRect(segment.end),
    ]),
  ]
  const minX = Math.min(...rects.map((rect) => rect.x))
  const minY = Math.min(...rects.map((rect) => rect.y))
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width))
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function pointRect(point: Vec2): Rect {
  return { x: point.x, y: point.y, width: 0, height: 0 }
}

function objectRoutingRects(object: SchematicObject): Rect[] {
  if (object.kind === "symbol") {
    return [getSymbolWorldBounds(object)]
  }
  if (object.kind === "box") {
    return [rectFromPoints(object.start, object.end)]
  }
  if (object.kind === "line") {
    return [rectFromPoints(object.start, object.end)]
  }
  if (object.kind === "wire") {
    return object.points.slice(0, -1).flatMap((point, index) => {
      const next = object.points[index + 1]
      return next ? [rectFromPoints(point, next)] : []
    })
  }
  if (isLeadAnnotationObject(object) && hasAnnotationLead(object)) {
    return [leadAnnotationBounds(object)]
  }
  if ("position" in object) {
    return [pointRect(object.position)]
  }
  return []
}

function markObjectObstacle(grid: RoutingGrid, object: SchematicObject) {
  if (object.kind === "symbol") {
    markRectObstacle(grid, getSymbolWorldBounds(object))
    return
  }
  if (object.kind === "wire") {
    for (let index = 0; index < object.points.length - 1; index += 1) {
      const start = object.points[index]
      const end = object.points[index + 1]
      if (start && end) {
        markSegmentObstacle(grid, start, end)
      }
    }
    return
  }
  if (object.kind === "box") {
    markRectObstacle(grid, rectFromPoints(object.start, object.end))
    return
  }
  if (object.kind === "line") {
    markSegmentObstacle(grid, object.start, object.end)
    return
  }
  if (isLeadAnnotationObject(object) && hasAnnotationLead(object)) {
    markSegmentObstacle(grid, object.position, getAnnotationLeadEnd(object))
    for (const segment of leadAnnotationBodySegments(object)) {
      markSegmentObstacle(grid, segment.start, segment.end)
    }
    for (const rect of leadAnnotationBodyRects(object)) {
      markRectObstacle(grid, rect)
    }
    return
  }
  if ("position" in object) {
    markPointObstacle(grid, object.position)
  }
}

function markRectObstacle(grid: RoutingGrid, rect: Rect) {
  const minCol = Math.floor((rect.x - grid.originX) / grid.gridSize)
  const maxCol = Math.ceil((rect.x + rect.width - grid.originX) / grid.gridSize)
  const minRow = Math.floor((rect.y - grid.originY) / grid.gridSize)
  const maxRow = Math.ceil((rect.y + rect.height - grid.originY) / grid.gridSize)
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      blockCell(grid, { row, col })
    }
  }
}

function markPointObstacle(grid: RoutingGrid, point: Vec2) {
  blockCell(grid, pointToCell(grid, point))
}

function markSegmentObstacle(grid: RoutingGrid, start: Vec2, end: Vec2) {
  if (start.x !== end.x && start.y !== end.y) {
    markRectObstacle(grid, rectFromPoints(start, end))
    return
  }

  const startCell = pointToCell(grid, start)
  const endCell = pointToCell(grid, end)
  const rowStep = Math.sign(endCell.row - startCell.row)
  const colStep = Math.sign(endCell.col - startCell.col)
  let row = startCell.row
  let col = startCell.col
  while (true) {
    blockCell(grid, { row, col })
    if (row === endCell.row && col === endCell.col) {
      break
    }
    row += rowStep
    col += colStep
  }
}

function tryPatternRoute(
  start: Vec2,
  end: Vec2,
  grid: RoutingGrid,
  style: OrthogonalRouteStyle,
): Vec2[] | null {
  const candidates =
    style === "vertical-first"
      ? [
          [start, { x: start.x, y: end.y }, end],
          [start, { x: end.x, y: start.y }, end],
        ]
      : [
          [start, { x: end.x, y: start.y }, end],
          [start, { x: start.x, y: end.y }, end],
        ]

  for (const candidate of candidates) {
    const points = compactCollinearPoints(compactConsecutiveRoutePoints(candidate))
    if (routeIsClear(points, grid)) {
      return points
    }
  }
  return null
}

function routeIsClear(points: Vec2[], grid: RoutingGrid): boolean {
  return points.every((point, index) => {
    const next = points[index + 1]
    return !next || segmentIsClear(point, next, grid)
  })
}

function segmentIsClear(start: Vec2, end: Vec2, grid: RoutingGrid): boolean {
  if (start.x !== end.x && start.y !== end.y) {
    return false
  }
  const startCell = pointToCell(grid, start)
  const endCell = pointToCell(grid, end)
  const rowStep = Math.sign(endCell.row - startCell.row)
  const colStep = Math.sign(endCell.col - startCell.col)
  let row = startCell.row
  let col = startCell.col
  while (true) {
    if (isBlocked(grid, { row, col })) {
      return false
    }
    if (row === endCell.row && col === endCell.col) {
      break
    }
    row += rowStep
    col += colStep
  }
  return true
}

function routeWithAStar(
  start: Vec2,
  end: Vec2,
  grid: RoutingGrid,
  style: OrthogonalRouteStyle,
): Vec2[] | null {
  const startCell = pointToCell(grid, start)
  const goalCell = pointToCell(grid, end)
  if (!isValidCell(grid, startCell) || !isValidCell(grid, goalCell)) {
    return null
  }

  type Direction = "up" | "down" | "left" | "right" | "none"
  type Node = Cell & {
    direction: Direction
    fScore: number
    gScore: number
    sequence: number
  }

  const startNode: Node = {
    ...startCell,
    direction: "none",
    fScore: manhattan(startCell, goalCell),
    gScore: 0,
    sequence: 0,
  }
  const open: Node[] = [startNode]
  const cameFrom = new Map<string, string>()
  const gScore = new Map([[stateKey(startCell, "none"), 0]])
  const nodes = new Map([[stateKey(startCell, "none"), startNode]])
  let sequence = 1

  while (open.length > 0) {
    open.sort(
      (left, right) =>
        left.fScore - right.fScore ||
        left.gScore - right.gScore ||
        left.sequence - right.sequence,
    )
    const current = open.shift()
    if (!current) {
      break
    }

    if (current.row === goalCell.row && current.col === goalCell.col) {
      return cellsToRoute(
        reconstructCells(stateKey(current, current.direction), cameFrom, nodes),
        grid,
        start,
        end,
      )
    }

    for (const nextDirection of orderedDirections(current, goalCell, style)) {
      const nextCell = moveCell(current, nextDirection)
      if (!isValidCell(grid, nextCell) || isBlocked(grid, nextCell)) {
        continue
      }
      const turnCost =
        current.direction === "none" || current.direction === nextDirection
          ? 0
          : TURN_PENALTY
      const tentativeG = current.gScore + 1 + turnCost
      const nextKey = stateKey(nextCell, nextDirection)
      if (tentativeG >= (gScore.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        continue
      }
      const nextNode = {
        ...nextCell,
        direction: nextDirection,
        gScore: tentativeG,
        fScore: tentativeG + manhattan(nextCell, goalCell),
        sequence,
      }
      sequence += 1
      cameFrom.set(nextKey, stateKey(current, current.direction))
      gScore.set(nextKey, tentativeG)
      nodes.set(nextKey, nextNode)
      open.push(nextNode)
    }
  }

  return null
}

function orderedDirections(
  current: Cell,
  goal: Cell,
  style: OrthogonalRouteStyle,
): Array<"up" | "down" | "left" | "right"> {
  const horizontal =
    goal.col >= current.col ? (["right", "left"] as const) : (["left", "right"] as const)
  const vertical =
    goal.row >= current.row ? (["down", "up"] as const) : (["up", "down"] as const)
  return style === "vertical-first"
    ? [vertical[0], horizontal[0], horizontal[1], vertical[1]]
    : [horizontal[0], vertical[0], vertical[1], horizontal[1]]
}

function moveCell(
  cell: Cell,
  direction: "up" | "down" | "left" | "right",
): Cell {
  switch (direction) {
    case "up":
      return { row: cell.row - 1, col: cell.col }
    case "down":
      return { row: cell.row + 1, col: cell.col }
    case "left":
      return { row: cell.row, col: cell.col - 1 }
    case "right":
      return { row: cell.row, col: cell.col + 1 }
  }
}

function reconstructCells(
  goalKey: string,
  cameFrom: Map<string, string>,
  nodes: Map<string, Cell>,
): Cell[] {
  const cells: Cell[] = []
  let currentKey: string | undefined = goalKey
  while (currentKey) {
    const node = nodes.get(currentKey)
    if (!node) {
      break
    }
    cells.push({ row: node.row, col: node.col })
    currentKey = cameFrom.get(currentKey)
  }
  return cells.reverse()
}

function cellsToRoute(
  cells: Cell[],
  grid: RoutingGrid,
  start: Vec2,
  end: Vec2,
): Vec2[] {
  const points = compactCollinearPoints(cells.map((cell) => cellToPoint(grid, cell)))
  if (points.length === 0) {
    return [start, end]
  }
  points[0] = start
  points[points.length - 1] = end
  return compactCollinearPoints(compactConsecutiveRoutePoints(points))
}

function compactConsecutiveRoutePoints(points: Vec2[]): Vec2[] {
  return points.filter((point, index) => {
    const previous = points[index - 1]
    return !previous || !pointsEqual(previous, point)
  })
}

function compactCollinearPoints(points: Vec2[]): Vec2[] {
  return points.filter((point, index) => {
    const previous = points[index - 1]
    const next = points[index + 1]
    if (!previous || !next) {
      return true
    }
    return !(
      (previous.x === point.x && point.x === next.x) ||
      (previous.y === point.y && point.y === next.y)
    )
  })
}

function segmentsForRoute(points: Vec2[]): Array<{ start: Vec2; end: Vec2 }> {
  return points.slice(0, -1).flatMap((point, index) => {
    const next = points[index + 1]
    return next ? [{ start: point, end: next }] : []
  })
}

function pointToCell(grid: RoutingGrid, point: Vec2): Cell {
  return {
    row: Math.round((point.y - grid.originY) / grid.gridSize),
    col: Math.round((point.x - grid.originX) / grid.gridSize),
  }
}

function cellToPoint(grid: RoutingGrid, cell: Cell): Vec2 {
  return {
    x: grid.originX + cell.col * grid.gridSize,
    y: grid.originY + cell.row * grid.gridSize,
  }
}

function stateKey(cell: Cell, direction: string): string {
  return `${cell.row},${cell.col},${direction}`
}

function cellKey(cell: Cell): string {
  return `${cell.row},${cell.col}`
}

function blockCell(grid: RoutingGrid, cell: Cell) {
  if (isValidCell(grid, cell)) {
    grid.blocked.add(cellKey(cell))
  }
}

function clearCell(grid: RoutingGrid, cell: Cell) {
  grid.blocked.delete(cellKey(cell))
}

function isBlocked(grid: RoutingGrid, cell: Cell): boolean {
  return grid.blocked.has(cellKey(cell))
}

function isValidCell(grid: RoutingGrid, cell: Cell): boolean {
  return cell.row >= 0 && cell.row < grid.rows && cell.col >= 0 && cell.col < grid.cols
}

function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col)
}

function rectFromPoints(a: Vec2, b: Vec2): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}

function distanceToSegmentSquared(start: Vec2, end: Vec2, point: Vec2): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    return squaredDistance(point, start)
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  )
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  }
  return squaredDistance(point, projection)
}

function squaredDistance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

function snapCoordinate(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize
}
