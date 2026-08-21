export type Vec2 = {
  x: number
  y: number
}

export type RotationDegrees = number

export type CircuitProject = {
  id: string
  name: string
  version: number
  sheets: SchematicSheet[]
  simulations: SimulationConfig[]
  createdAt: string
  updatedAt: string
}

export type SchematicSheet = {
  id: string
  name: string
  gridSize: number
  objects: SchematicObject[]
}

export type SchematicObject =
  | SymbolObject
  | WireObject
  | JunctionObject
  | NetLabelObject
  | GroundObject
  | ProbeObject
  | TextObject
  | LineObject
  | BoxObject

export type SymbolObject = {
  kind: "symbol"
  id: string
  componentDefinitionId: string
  symbolDefinitionId: string
  refdes: string
  position: Vec2
  rotation: RotationDegrees
  pinSpacing?: number
  pinSpread?: number
  mirrored?: boolean
  props: Record<string, unknown>
}

export type WireObject = {
  kind: "wire"
  id: string
  points: Vec2[]
}

export type JunctionObject = {
  kind: "junction"
  id: string
  position: Vec2
}

export type NetLabelObject = {
  kind: "net-label"
  id: string
  text: string
  position: Vec2
  leadEnd?: Vec2
}

export type GroundObject = {
  kind: "ground"
  id: string
  position: Vec2
  leadEnd?: Vec2
  netName: "GND"
}

export type ProbeObject = {
  kind: "probe"
  id: string
  probeType: "voltage" | "current"
  name: string
  position: Vec2
  leadEnd?: Vec2
}

export type TextObject = {
  kind: "text"
  id: string
  text: string
  fontSize?: number
  position: Vec2
}

export type LineObject = {
  kind: "line"
  id: string
  start: Vec2
  end: Vec2
}

export type BoxObject = {
  kind: "box"
  id: string
  start: Vec2
  end: Vec2
}

export type SimulationConfig = {
  id: string
  name: string
  type: "transient"
  durationMs: number
  timeStepMs: number
  probeIds: string[]
}
