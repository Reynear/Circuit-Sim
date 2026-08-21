import {
  convertWireToRoutedWire,
  getRoutedWireSnapPoint,
  hasConvertibleWires,
  isRoutedWire,
  rerouteWireVia,
  routeRoutedWire,
  routedWirePoints,
} from "./wire-routing"
import type { SchematicObject, WireObject } from "./types"

function wire(points: WireObject["points"]): WireObject {
  return { kind: "wire", id: "wire_test", points }
}

describe("wire routing", () => {
  it("creates schematic-style horizontal-first routed points", () => {
    expect(
      routedWirePoints({ x: 0, y: 0 }, { x: 60, y: 40 }, "horizontal-first"),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 40 },
    ])
  })

  it("creates vertical-first routed points when requested", () => {
    expect(
      routedWirePoints({ x: 0, y: 0 }, { x: 60, y: 40 }, "vertical-first"),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 60, y: 40 },
    ])
  })

  it("detects wires that still have diagonal segments", () => {
    expect(isRoutedWire(wire([{ x: 0, y: 0 }, { x: 60, y: 40 }]))).toBe(false)
    expect(
      isRoutedWire(
        wire([
          { x: 0, y: 0 },
          { x: 60, y: 0 },
          { x: 60, y: 40 },
        ]),
      ),
    ).toBe(true)
  })

  it("converts every diagonal segment in a polyline", () => {
    expect(
      convertWireToRoutedWire(
        wire([
          { x: 0, y: 0 },
          { x: 60, y: 40 },
          { x: 100, y: 40 },
          { x: 120, y: 80 },
        ]),
      ).points,
    ).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 40 },
      { x: 100, y: 40 },
      { x: 120, y: 40 },
      { x: 120, y: 80 },
    ])
  })

  it("leaves already routed wires unchanged", () => {
    const routed = wire([
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 40 },
    ])
    expect(convertWireToRoutedWire(routed)).toBe(routed)
  })

  it("detects convertible wires in a mixed schematic object list", () => {
    expect(hasConvertibleWires([wire([{ x: 0, y: 0 }, { x: 10, y: 10 }])])).toBe(
      true,
    )
    expect(hasConvertibleWires([wire([{ x: 0, y: 0 }, { x: 10, y: 0 }])])).toBe(
      false,
    )
  })

  it("reroutes an existing routed wire through a dragged via point", () => {
    expect(
      rerouteWireVia(
        wire([
          { x: 0, y: 0 },
          { x: 80, y: 0 },
          { x: 80, y: 40 },
        ]),
        { x: 40, y: 60 },
      ).points,
    ).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 60 },
      { x: 80, y: 60 },
      { x: 80, y: 40 },
    ])
  })

  it("keeps the preferred schematic pattern when no obstacle blocks the route", () => {
    expect(
      routeRoutedWire(
        { x: 0, y: 0 },
        { x: 60, y: 40 },
        { gridSize: 20, fallbackStyle: "horizontal-first" },
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 40 },
    ])
  })

  it("routes around occupied schematic cells when the preferred pattern is blocked", () => {
    const obstacle: SchematicObject = {
      kind: "box",
      id: "box_blocker",
      start: { x: 20, y: -20 },
      end: { x: 60, y: 20 },
    }

    const points = routeRoutedWire(
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      {
        gridSize: 20,
        objects: [obstacle],
      },
    )

    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points.at(-1)).toEqual({ x: 80, y: 0 })
    expect(points.some((point) => Math.abs(point.y) >= 40)).toBe(true)
    expect(routeCrossesRect(points, { x: 20, y: -20, width: 40, height: 40 })).toBe(
      false,
    )
  })

  it("routes around visible schematic ground body bars", () => {
    const ground: SchematicObject = {
      kind: "ground",
      id: "ground_blocker",
      position: { x: 40, y: 0 },
      leadEnd: { x: 80, y: 0 },
      netName: "GND",
    }

    const points = routeRoutedWire(
      { x: 0, y: 10 },
      { x: 120, y: 10 },
      {
        gridSize: 10,
        objects: [ground],
      },
    )

    expect(points[0]).toEqual({ x: 0, y: 10 })
    expect(points.at(-1)).toEqual({ x: 120, y: 10 })
    expect(
      routeCrossesOrthogonalSegment(points, { x: 80, y: -10 }, { x: 80, y: 10 }),
    ).toBe(false)
  })

  it("routes around visible schematic net label bodies", () => {
    const label: SchematicObject = {
      kind: "net-label",
      id: "label_blocker",
      text: "BUS",
      position: { x: 40, y: 0 },
      leadEnd: { x: 80, y: 0 },
    }

    const points = routeRoutedWire(
      { x: 100, y: -40 },
      { x: 100, y: 40 },
      {
        gridSize: 10,
        objects: [label],
      },
    )

    expect(points[0]).toEqual({ x: 100, y: -40 })
    expect(points.at(-1)).toEqual({ x: 100, y: 40 })
    expect(routeCrossesRect(points, { x: 80, y: -7, width: 54, height: 14 })).toBe(
      false,
    )
  })

  it("reroutes through a via while avoiding other schematic objects", () => {
    const obstacle: SchematicObject = {
      kind: "box",
      id: "box_reroute_blocker",
      start: { x: 20, y: -20 },
      end: { x: 60, y: 20 },
    }
    const result = rerouteWireVia(
      wire([
        { x: 0, y: 0 },
        { x: 80, y: 0 },
      ]),
      { x: 80, y: 60 },
      {
        gridSize: 20,
        objects: [obstacle],
      },
    )

    expect(result.points[0]).toEqual({ x: 0, y: 0 })
    expect(result.points).toContainEqual({ x: 80, y: 60 })
    expect(routeCrossesRect(result.points, { x: 20, y: -20, width: 40, height: 40 })).toBe(
      false,
    )
  })

  it("snaps a schematic routed-wire hover point to the nearest segment", () => {
    const routed = wire([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 60 },
    ])

    expect(getRoutedWireSnapPoint(routed, { x: 35, y: 12 }, 20)).toEqual({
      x: 40,
      y: 0,
    })
    expect(getRoutedWireSnapPoint(routed, { x: 92, y: 35 }, 20)).toEqual({
      x: 80,
      y: 40,
    })
  })

  it("does not clamp schematic routed-wire snap points to the segment endpoints", () => {
    expect(
      getRoutedWireSnapPoint(
        wire([
          { x: 0, y: 0 },
          { x: 80, y: 0 },
        ]),
        { x: 120, y: 8 },
        20,
      ),
    ).toEqual({ x: 120, y: 0 })
  })

  it("does not snap wires without segments", () => {
    expect(getRoutedWireSnapPoint(wire([{ x: 0, y: 0 }]), { x: 10, y: 10 }, 20)).toBe(
      null,
    )
  })
})

function routeCrossesRect(points: WireObject["points"], rect: Rect): boolean {
  return points.some((point, index) => {
    const next = points[index + 1]
    return next ? segmentCrossesRect(point, next, rect) : false
  })
}

type Rect = { x: number; y: number; width: number; height: number }

function segmentCrossesRect(start: WireObject["points"][number], end: WireObject["points"][number], rect: Rect): boolean {
  if (start.y === end.y) {
    const minX = Math.min(start.x, end.x)
    const maxX = Math.max(start.x, end.x)
    return (
      start.y > rect.y &&
      start.y < rect.y + rect.height &&
      maxX > rect.x &&
      minX < rect.x + rect.width
    )
  }
  if (start.x === end.x) {
    const minY = Math.min(start.y, end.y)
    const maxY = Math.max(start.y, end.y)
    return (
      start.x > rect.x &&
      start.x < rect.x + rect.width &&
      maxY > rect.y &&
      minY < rect.y + rect.height
    )
  }
  return true
}

function routeCrossesOrthogonalSegment(
  points: WireObject["points"],
  obstacleStart: WireObject["points"][number],
  obstacleEnd: WireObject["points"][number],
): boolean {
  return points.some((start, index) => {
    const end = points[index + 1]
    return end
      ? orthogonalSegmentsIntersect(start, end, obstacleStart, obstacleEnd)
      : false
  })
}

function orthogonalSegmentsIntersect(
  a: WireObject["points"][number],
  b: WireObject["points"][number],
  c: WireObject["points"][number],
  d: WireObject["points"][number],
): boolean {
  if (a.y === b.y && c.x === d.x) {
    return (
      between(c.x, a.x, b.x) &&
      between(a.y, c.y, d.y)
    )
  }
  if (a.x === b.x && c.y === d.y) {
    return (
      between(a.x, c.x, d.x) &&
      between(c.y, a.y, b.y)
    )
  }
  if (a.x === b.x && c.x === d.x) {
    return a.x === c.x && rangesOverlap(a.y, b.y, c.y, d.y)
  }
  if (a.y === b.y && c.y === d.y) {
    return a.y === c.y && rangesOverlap(a.x, b.x, c.x, d.x)
  }
  return true
}

function between(value: number, a: number, b: number): boolean {
  return value >= Math.min(a, b) && value <= Math.max(a, b)
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return (
    Math.max(Math.min(aStart, aEnd), Math.min(bStart, bEnd)) <=
    Math.min(Math.max(aStart, aEnd), Math.max(bStart, bEnd))
  )
}
