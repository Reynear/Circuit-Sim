import { getComponent } from "./components"
import { getPinPosts } from "./component-geometry"
import type {
  CircuitProject,
  Component,
  Point,
  SchematicObject,
} from "./project"

export type ExtractedNetlist = {
  nets: ExtractedNet[]
  pinToNetId: ReadonlyMap<string, string>
  objectToNetId: ReadonlyMap<string, string>
}

export type ExtractedNet = {
  id: string
  name: string
  pins: Array<{
    componentId: string
    type: Component["type"]
    pin: string
    refdes: string
  }>
}

type NetNode = {
  id: string
  kind: "pin" | "wire" | "ground" | "label" | "probe"
  objectId: string
  position: Point
  componentId?: string
  type?: Component["type"]
  refdes?: string
  pin?: string
  netName?: string
}

class UnionFind {
  private readonly parents = new Map<string, string>()

  add(id: string): void {
    this.parents.set(id, id)
  }

  find(id: string): string {
    const parent = this.parents.get(id) ?? id
    if (parent === id) return id
    const root = this.find(parent)
    this.parents.set(id, root)
    return root
  }

  union(a: string, b: string): void {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA !== rootB) this.parents.set(rootB, rootA)
  }
}

export function pinConnectionKey(componentId: string, pin: string): string {
  return `${componentId}:${pin}`
}

/**
 * Derives topology from committed geometry. The editor may use proximity while
 * choosing a snap target, but saved connections exist only at equal coordinates.
 * Wire-to-segment connections are committed by splitting the target wire first.
 */
export function extractNetlist(project: CircuitProject): ExtractedNetlist {
  const nodes: NetNode[] = []
  const union = new UnionFind()
  const pinNodes = new Map<string, string>()
  const namedNodes = new Map<string, string>()

  const addNode = (node: Omit<NetNode, "id">): string => {
    const id = `node_${nodes.length}`
    nodes.push({ ...node, id })
    union.add(id)
    return id
  }

  for (const object of project.objects) {
    if (object.kind === "component") {
      for (const pin of getPinPosts(object)) {
        const id = addNode({
          kind: "pin",
          objectId: object.id,
          position: pin.position,
          componentId: object.id,
          type: object.type,
          refdes: object.refdes,
          pin: pin.pin,
        })
        pinNodes.set(pinConnectionKey(object.id, pin.pin), id)
      }
      continue
    }

    if (object.kind === "wire") {
      const ids = object.points.map((position) =>
        addNode({ kind: "wire", objectId: object.id, position }),
      )
      for (let index = 1; index < ids.length; index += 1) {
        union.union(ids[index - 1]!, ids[index]!)
      }
      continue
    }

    if (object.kind === "ground") {
      const id = addNode({
        kind: "ground",
        objectId: object.id,
        position: object.position,
        netName: "GND",
      })
      unionNamed(namedNodes, union, "GND", id)
      continue
    }

    if (object.kind === "net-label") {
      const name = object.text.trim()
      const id = addNode({
        kind: "label",
        objectId: object.id,
        position: object.position,
        ...(name ? { netName: name } : {}),
      })
      if (name) unionNamed(namedNodes, union, name, id)
      continue
    }

    if (object.kind === "probe") {
      addNode({ kind: "probe", objectId: object.id, position: object.position })
    }
  }

  const nodeAtPosition = new Map<string, string>()
  for (const node of nodes) {
    const key = pointKey(node.position)
    const existing = nodeAtPosition.get(key)
    if (existing) union.union(existing, node.id)
    else nodeAtPosition.set(key, node.id)
  }

  for (const object of project.objects) {
    if (
      object.kind !== "component" ||
      object.type !== "switch" ||
      object.props.state !== "closed"
    ) continue
    const from = pinNodes.get(pinConnectionKey(object.id, "a"))
    const to = pinNodes.get(pinConnectionKey(object.id, "b"))
    if (from && to) union.union(from, to)
  }

  const grouped = new Map<string, NetNode[]>()
  for (const node of nodes) {
    const root = union.find(node.id)
    grouped.set(root, [...(grouped.get(root) ?? []), node])
  }

  const groups = [...grouped.values()]
    .map((group) => group.sort(compareNodes))
    .sort((a, b) => compareNodes(a[0]!, b[0]!))
  const groundedSources = groundedNegativeVoltageSourceIds(groups)
  const pinToNetId = new Map<string, string>()
  const objectToNetId = new Map<string, string>()
  const nets: ExtractedNet[] = []
  let unnamedIndex = 1

  for (const group of groups) {
    if (!shouldKeepPinOnlyGroup(group, groundedSources)) continue
    const explicitNames = group.flatMap((node) => node.netName ? [node.netName] : [])
    const name = explicitNames.includes("GND")
      ? "GND"
      : explicitNames.sort()[0] ?? `N${String(unnamedIndex++).padStart(3, "0")}`
    const id = `net_${name.replace(/[^A-Za-z0-9_]/g, "_")}`
    const pins = group
      .filter((node) => node.kind === "pin")
      .map((node) => ({
        componentId: node.componentId!,
        type: node.type!,
        pin: node.pin!,
        refdes: node.refdes!,
      }))
      .sort((a, b) => a.refdes.localeCompare(b.refdes) || a.pin.localeCompare(b.pin))

    for (const pin of pins) {
      pinToNetId.set(pinConnectionKey(pin.componentId, pin.pin), id)
    }
    for (const node of group) {
      if (node.kind !== "pin") objectToNetId.set(node.objectId, id)
    }
    nets.push({ id, name, pins })
  }

  return { nets, pinToNetId, objectToNetId }
}

function unionNamed(
  namedNodes: Map<string, string>,
  union: UnionFind,
  name: string,
  id: string,
): void {
  const existing = namedNodes.get(name)
  if (existing) union.union(existing, id)
  else namedNodes.set(name, id)
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`
}

function compareNodes(a: NetNode, b: NetNode): number {
  return (
    a.position.x - b.position.x ||
    a.position.y - b.position.y ||
    a.objectId.localeCompare(b.objectId) ||
    a.id.localeCompare(b.id)
  )
}

function shouldKeepPinOnlyGroup(group: NetNode[], groundedSources: Set<string>): boolean {
  const pins = group.filter((node) => node.kind === "pin")
  return (
    group.some((node) => node.kind !== "pin") ||
    pins.length > 1 ||
    pins.some((pin) => pin.type === "dc-power-rail") ||
    pins.some((pin) => isGroundReferencedVoltageSourceOutputPin(pin, groundedSources))
  )
}

function isVoltageSourcePin(
  node: NetNode,
  terminal: 0 | 1,
): node is NetNode & { componentId: string } {
  if (node.kind !== "pin" || !node.componentId || !node.type) return false
  if (node.type !== "dc-voltage-source" && node.type !== "sine-voltage-source") return false
  return getComponent(node.type).terminals[terminal]?.key === node.pin
}

function groundedNegativeVoltageSourceIds(groups: NetNode[][]): Set<string> {
  const sourceIds = new Set<string>()
  for (const group of groups) {
    if (!group.some((node) => node.kind === "ground")) continue
    for (const node of group) {
      if (isVoltageSourcePin(node, 1)) sourceIds.add(node.componentId)
    }
  }
  return sourceIds
}

function isGroundReferencedVoltageSourceOutputPin(
  node: NetNode,
  sourceIds: Set<string>,
): boolean {
  return isVoltageSourcePin(node, 0) && sourceIds.has(node.componentId)
}

export function netHighlightObjectIds(
  objects: ReadonlyArray<SchematicObject>,
  netlist: ExtractedNetlist,
  hoverObjectId: string,
): string[] {
  const hoverObject = objects.find((object) => object.id === hoverObjectId)
  if (hoverObject?.kind !== "wire") return []
  const netId = netlist.objectToNetId.get(hoverObject.id)
  if (!netId) return []
  return objects
    .filter((object) => objectTouchesNet(object, netId, netlist))
    .map((object) => object.id)
}

function objectTouchesNet(
  object: SchematicObject,
  netId: string,
  netlist: ExtractedNetlist,
): boolean {
  if (netlist.objectToNetId.get(object.id) === netId) return true
  return object.kind === "component" && getPinPosts(object).some(
    (pin) => netlist.pinToNetId.get(pinConnectionKey(object.id, pin.pin)) === netId,
  )
}

export function getComponents(project: CircuitProject): Component[] {
  return project.objects.filter(
    (object): object is Component => object.kind === "component",
  )
}
