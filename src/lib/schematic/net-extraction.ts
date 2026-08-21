import { pointOnSegment, pointsEqual } from "./geometry"
import { getSwitchClosedPinPairs } from "./switch-state"
import { getSymbolPinWorldPositions } from "./transforms"
import type {
  CircuitProject,
  SchematicObject,
  SchematicSheet,
  SymbolObject,
  Vec2,
  WireObject,
} from "./types"

export type ExtractedNetlist = {
  nets: ExtractedNet[]
  pinToNetId: Record<string, string>
  objectToNetId: Record<string, string>
}

export type ExtractedNet = {
  id: string
  name: string
  pins: Array<{
    symbolObjectId: string
    componentDefinitionId: string
    pinId: string
    refdes: string
  }>
}

type NodeKind = "pin" | "wire-point" | "ground" | "label" | "probe"

type NetNode = {
  id: string
  kind: NodeKind
  objectId: string
  position: Vec2
  order: number
  symbolObjectId?: string
  componentDefinitionId?: string
  refdes?: string
  pinId?: string
  netName?: string
}

const groundedSourceComponentIds = new Set([
  "dc-voltage-source",
  "sine-voltage-source",
])

class UnionFind {
  private parents = new Map<string, string>()

  add(id: string): void {
    if (!this.parents.has(id)) {
      this.parents.set(id, id)
    }
  }

  find(id: string): string {
    const parent = this.parents.get(id)
    if (!parent) {
      this.add(id)
      return id
    }
    if (parent === id) {
      return id
    }
    const root = this.find(parent)
    this.parents.set(id, root)
    return root
  }

  union(a: string, b: string): void {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA !== rootB) {
      this.parents.set(rootB, rootA)
    }
  }
}

export function pinConnectionKey(
  symbolObjectId: string,
  componentPinId: string,
): string {
  return `${symbolObjectId}:${componentPinId}`
}

function getPrimarySheet(project: CircuitProject): SchematicSheet | null {
  return project.sheets[0] ?? null
}

function segmentPairs(wire: WireObject): Array<[Vec2, Vec2, number]> {
  const pairs: Array<[Vec2, Vec2, number]> = []
  for (let index = 0; index < wire.points.length - 1; index += 1) {
    const a = wire.points[index]
    const b = wire.points[index + 1]
    if (a && b) {
      pairs.push([a, b, index])
    }
  }
  return pairs
}

export function extractNetlist(project: CircuitProject): ExtractedNetlist {
  const sheet = getPrimarySheet(project)
  if (!sheet) {
    return { nets: [], pinToNetId: {}, objectToNetId: {} }
  }

  const nodes: NetNode[] = []
  const uf = new UnionFind()
  const wirePointNodeIds = new Map<string, string[]>()
  const pinNodeIds = new Map<string, string>()
  let nodeIndex = 0

  function addNode(node: Omit<NetNode, "id" | "order">): string {
    const id = `node_${nodeIndex}`
    const fullNode = { ...node, id, order: nodeIndex }
    nodeIndex += 1
    nodes.push(fullNode)
    uf.add(id)
    return id
  }

  for (const object of sheet.objects) {
    if (object.kind === "symbol") {
      for (const pin of getSymbolPinWorldPositions(object)) {
        const pinNodeId = addNode({
          kind: "pin",
          objectId: object.id,
          position: pin.position,
          symbolObjectId: object.id,
          componentDefinitionId: object.componentDefinitionId,
          refdes: object.refdes,
          pinId: pin.componentPinId,
        })
        pinNodeIds.set(
          pinConnectionKey(object.id, pin.componentPinId),
          pinNodeId,
        )
      }
      for (const [fromPinId, toPinId] of getSwitchClosedPinPairs(object)) {
        const fromNode = pinNodeIds.get(pinConnectionKey(object.id, fromPinId))
        const toNode = pinNodeIds.get(pinConnectionKey(object.id, toPinId))
        if (fromNode && toNode) {
          uf.union(fromNode, toNode)
        }
      }
    }

    if (object.kind === "wire") {
      const ids = object.points.map((point) =>
        addNode({
          kind: "wire-point",
          objectId: object.id,
          position: point,
        }),
      )
      wirePointNodeIds.set(object.id, ids)
      for (let index = 0; index < ids.length - 1; index += 1) {
        const current = ids[index]
        const next = ids[index + 1]
        if (current && next) {
          uf.union(current, next)
        }
      }
    }

    if (object.kind === "ground") {
      addNode({
        kind: "ground",
        objectId: object.id,
        position: object.position,
        netName: object.netName,
      })
    }

    if (object.kind === "net-label") {
      addNode({
        kind: "label",
        objectId: object.id,
        position: object.position,
        netName: object.text.trim(),
      })
    }

    if (object.kind === "probe") {
      addNode({
        kind: "probe",
        objectId: object.id,
        position: object.position,
      })
    }
  }

  for (let aIndex = 0; aIndex < nodes.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < nodes.length; bIndex += 1) {
      const a = nodes[aIndex]
      const b = nodes[bIndex]
      if (a && b && pointsEqual(a.position, b.position, 4)) {
        uf.union(a.id, b.id)
      }
    }
  }

  const wires = sheet.objects.filter(
    (object): object is WireObject => object.kind === "wire",
  )

  const segmentStartNode = (wire: WireObject, index: number): string | null =>
    wirePointNodeIds.get(wire.id)?.[index] ?? null

  for (const node of nodes) {
    if (node.kind === "wire-point") {
      continue
    }

    for (const wire of wires) {
      for (const [a, b, segmentIndex] of segmentPairs(wire)) {
        if (pointOnSegment(node.position, a, b, 4)) {
          const startNode = segmentStartNode(wire, segmentIndex)
          if (startNode) {
            uf.union(node.id, startNode)
          }
        }
      }
    }
  }

  for (const sourceWire of wires) {
    const sourceIds = wirePointNodeIds.get(sourceWire.id) ?? []
    sourceWire.points.forEach((point, pointIndex) => {
      const sourceNode = sourceIds[pointIndex]
      if (!sourceNode) {
        return
      }
      for (const targetWire of wires) {
        for (const [a, b, segmentIndex] of segmentPairs(targetWire)) {
          if (sourceWire.id === targetWire.id && pointIndex === segmentIndex) {
            continue
          }
          if (pointOnSegment(point, a, b, 4)) {
            const targetNode = segmentStartNode(targetWire, segmentIndex)
            if (targetNode) {
              uf.union(sourceNode, targetNode)
            }
          }
        }
      }
    })
  }

  const grouped = new Map<string, NetNode[]>()
  for (const node of nodes) {
    const root = uf.find(node.id)
    grouped.set(root, [...(grouped.get(root) ?? []), node])
  }

  const allGroups = [...grouped.values()]
    .map((group) => group.sort((a, b) => a.order - b.order))
    .sort((a, b) => a[0]!.order - b[0]!.order)
  const sourceIdsWithGroundedNegativePin =
    groundedNegativeVoltageSourceIds(allGroups)
  const groups = allGroups.filter((group) =>
    shouldCreateNet(group, sourceIdsWithGroundedNegativePin),
  )

  const pinToNetId: Record<string, string> = {}
  const objectToNetId: Record<string, string> = {}
  const nets: ExtractedNet[] = []
  let unnamedIndex = 1

  for (const group of groups) {
    const explicitNames = group
      .map((node) => node.netName)
      .filter((name): name is string => Boolean(name))
    const hasGround = explicitNames.includes("GND")
    const name =
      (hasGround ? "GND" : explicitNames.find((candidate) => candidate)) ??
      `N${String(unnamedIndex++).padStart(3, "0")}`
    const id = `net_${name.replace(/[^A-Za-z0-9_]/g, "_")}`
    const pins = group
      .filter((node) => node.kind === "pin")
      .map((node) => ({
        symbolObjectId: node.symbolObjectId!,
        componentDefinitionId: node.componentDefinitionId!,
        pinId: node.pinId!,
        refdes: node.refdes!,
      }))
      .sort(
        (a, b) =>
          a.refdes.localeCompare(b.refdes) || a.pinId.localeCompare(b.pinId),
      )

    for (const pin of pins) {
      pinToNetId[pinConnectionKey(pin.symbolObjectId, pin.pinId)] = id
    }

    for (const node of group) {
      if (node.kind !== "pin") {
        objectToNetId[node.objectId] = id
      }
    }

    nets.push({ id, name, pins })
  }

  return { nets, pinToNetId, objectToNetId }
}

function shouldCreateNet(
  group: NetNode[],
  sourceIdsWithGroundedNegativePin: Set<string>,
): boolean {
  const hasWire = group.some((node) => node.kind === "wire-point")
  const hasGround = group.some((node) => node.kind === "ground")
  const hasLabel = group.some((node) => node.kind === "label")
  const pins = group.filter((node) => node.kind === "pin")
  if (hasWire || hasGround || hasLabel) {
    return true
  }
  return (
    pins.length > 1 ||
    pins.some((pin) =>
      isGroundReferencedVoltageSourceOutputPin(
        pin,
        sourceIdsWithGroundedNegativePin,
      ),
    ) ||
    (pins.length === 1 && group.length > 1)
  )
}

function groundedNegativeVoltageSourceIds(groups: NetNode[][]): Set<string> {
  const sourceIds = new Set<string>()
  for (const group of groups) {
    if (!group.some((node) => node.kind === "ground")) {
      continue
    }
    for (const node of group) {
      if (
        node.kind === "pin" &&
        node.pinId === "pin2" &&
        node.symbolObjectId &&
        node.componentDefinitionId &&
        groundedSourceComponentIds.has(node.componentDefinitionId)
      ) {
        sourceIds.add(node.symbolObjectId)
      }
    }
  }
  return sourceIds
}

function isGroundReferencedVoltageSourceOutputPin(
  node: NetNode,
  sourceIdsWithGroundedNegativePin: Set<string>,
): boolean {
  return Boolean(
    node.kind === "pin" &&
      node.pinId === "pin1" &&
      node.symbolObjectId &&
      node.componentDefinitionId &&
      groundedSourceComponentIds.has(node.componentDefinitionId) &&
      sourceIdsWithGroundedNegativePin.has(node.symbolObjectId),
  )
}

export function getSymbols(project: CircuitProject): SymbolObject[] {
  return (
    getPrimarySheet(project)?.objects.filter(
      (object): object is SymbolObject => object.kind === "symbol",
    ) ?? []
  )
}

export function getSchematicObjects(project: CircuitProject): SchematicObject[] {
  return getPrimarySheet(project)?.objects ?? []
}
