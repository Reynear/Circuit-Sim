import { createId } from "../ids"
import type {
  CircuitProject,
  GroundObject,
  NetLabelObject,
  ProbeObject,
  SimulationConfig,
  SymbolObject,
  TextObject,
  Vec2,
  WireObject,
} from "./types"
import { DEFAULT_TEXT_SIZE } from "./schematic-text"

function nowIso(): string {
  return new Date().toISOString()
}

function createBaseProject(name: string): CircuitProject {
  const timestamp = nowIso()
  return {
    id: createId("prj"),
    name,
    version: 1,
    sheets: [
      {
        id: createId("sht"),
        name: "Main",
        gridSize: 20,
        objects: [],
      },
    ],
    simulations: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function symbol(
  componentDefinitionId: string,
  symbolDefinitionId: string,
  refdes: string,
  position: Vec2,
  props: Record<string, unknown>,
  rotation = 0,
): SymbolObject {
  return {
    kind: "symbol",
    id: createId("sym"),
    componentDefinitionId,
    symbolDefinitionId,
    refdes,
    position,
    rotation,
    props,
  }
}

function wire(points: Vec2[]): WireObject {
  return {
    kind: "wire",
    id: createId("wire"),
    points,
  }
}

function ground(position: Vec2, leadEnd?: Vec2): GroundObject {
  return {
    kind: "ground",
    id: createId("junc"),
    position,
    ...(leadEnd ? { leadEnd } : {}),
    netName: "GND",
  }
}

function probe(name: string, position: Vec2, leadEnd?: Vec2): ProbeObject {
  return {
    kind: "probe",
    id: createId("probe"),
    probeType: "voltage",
    name,
    position,
    ...(leadEnd ? { leadEnd } : {}),
  }
}

function text(textValue: string, position: Vec2): TextObject {
  return {
    kind: "text",
    id: createId("text"),
    text: textValue,
    fontSize: DEFAULT_TEXT_SIZE,
    position,
  }
}

function label(textValue: string, position: Vec2, leadEnd?: Vec2): NetLabelObject {
  return {
    kind: "net-label",
    id: createId("label"),
    text: textValue,
    position,
    ...(leadEnd ? { leadEnd } : {}),
  }
}

function transientSimulation(probeIds: string[]): SimulationConfig {
  return {
    id: createId("sim"),
    name: "Transient",
    type: "transient",
    durationMs: 10,
    timeStepMs: 0.1,
    probeIds,
  }
}

export function createEmptyProject(name = "Untitled Circuit"): CircuitProject {
  return createBaseProject(name)
}

export function createDemoRcLowPassProject(): CircuitProject {
  const project = createBaseProject("RC Low-Pass Demo")
  const sheet = requireMainSheet(project)
  const v1 = symbol(
    "dc-voltage-source",
    "dc-source",
    "V1",
    { x: 120, y: 160 },
    { voltage: "5V" },
  )
  const r1 = symbol("resistor", "resistor", "R1", { x: 240, y: 160 }, {
    value: "1k",
  })
  const c1 = symbol("capacitor", "capacitor", "C1", { x: 360, y: 160 }, {
    value: "1uF",
  })
  const vpIn = probe("VP_IN", { x: 160, y: 120 })
  const vpOut = probe("VP_OUT", { x: 300, y: 160 })

  project.sheets[0] = {
    ...sheet,
    objects: [
      v1,
      r1,
      c1,
      wire([
        { x: 80, y: 160 },
        { x: 80, y: 120 },
        { x: 200, y: 120 },
        { x: 200, y: 160 },
      ]),
      wire([
        { x: 280, y: 160 },
        { x: 320, y: 160 },
      ]),
      wire([
        { x: 400, y: 160 },
        { x: 400, y: 240 },
      ]),
      wire([
        { x: 160, y: 160 },
        { x: 160, y: 240 },
        { x: 400, y: 240 },
      ]),
      ground({ x: 400, y: 240 }),
      label("VIN", { x: 160, y: 120 }),
      label("VOUT", { x: 300, y: 160 }),
      vpIn,
      vpOut,
    ],
  }
  project.simulations = [transientSimulation([vpIn.id, vpOut.id])]
  return project
}

export function createDemoVoltageDividerProject(): CircuitProject {
  const project = createBaseProject("Voltage Divider Demo")
  const sheet = requireMainSheet(project)
  const v1 = symbol(
    "dc-voltage-source",
    "dc-source",
    "V1",
    { x: 120, y: 160 },
    { voltage: "5V" },
  )
  const r1 = symbol("resistor", "resistor", "R1", { x: 240, y: 160 }, {
    value: "10k",
  })
  const r2 = symbol(
    "resistor",
    "resistor",
    "R2",
    { x: 320, y: 220 },
    { value: "10k" },
    90,
  )
  const vpOut = probe("VP_OUT", { x: 320, y: 180 })

  project.sheets[0] = {
    ...sheet,
    objects: [
      text("Voltage divider", { x: 220, y: 100 }),
      v1,
      r1,
      r2,
      wire([
        { x: 80, y: 160 },
        { x: 80, y: 120 },
        { x: 200, y: 120 },
        { x: 200, y: 160 },
      ]),
      wire([
        { x: 280, y: 160 },
        { x: 320, y: 160 },
        { x: 320, y: 180 },
      ]),
      wire([
        { x: 320, y: 260 },
        { x: 320, y: 300 },
      ]),
      wire([
        { x: 160, y: 160 },
        { x: 160, y: 300 },
        { x: 320, y: 300 },
      ]),
      ground({ x: 320, y: 300 }),
      label("VOUT", { x: 320, y: 180 }),
      vpOut,
    ],
  }
  project.simulations = [transientSimulation([vpOut.id])]
  return project
}

export function createDemoSourceToGroundProject(): CircuitProject {
  const project = createBaseProject("Voltage Source to Ground Demo")
  const sheet = requireMainSheet(project)
  const sourcePositive = { x: 180, y: 140 }
  const sourceNegative = { x: 180, y: 220 }
  const v1 = symbol(
    "dc-voltage-source",
    "dc-source",
    "V1",
    { x: 180, y: 180 },
    { voltage: "5V" },
    90,
  )
  const vpVin = probe("VP_VIN", sourcePositive, { x: 250, y: 140 })

  project.sheets[0] = {
    ...sheet,
    objects: [
      text("Source to ground", { x: 120, y: 90 }),
      v1,
      ground(sourceNegative, { x: 180, y: 265 }),
      label("VIN", sourcePositive, { x: 105, y: 140 }),
      vpVin,
    ],
  }
  project.simulations = [transientSimulation([vpVin.id])]
  return project
}

function requireMainSheet(project: CircuitProject) {
  const sheet = project.sheets[0]
  if (!sheet) {
    throw new Error("Default project did not create a sheet")
  }
  return sheet
}
