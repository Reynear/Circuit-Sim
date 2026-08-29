import { newId } from "@circuit-sim/core/ids"
import type { ComponentType } from "@circuit-sim/core/circuit/components"
import {
  newCircuitProject,
  makeComponent,
  type CircuitProject,
  type GroundObject,
  type NetLabelObject,
  type ProbeObject,
  type SchematicObject,
  type Component,
  type TextObject,
  type Point,
  type WireObject,
} from "@circuit-sim/core/circuit/project"

function component(
  type: ComponentType,
  refdes: string,
  position: Point,
  props: unknown,
  rotation = 0,
): Component {
  return makeComponent({
    kind: "component",
    id: newId(),
    type,
    refdes,
    position,
    rotation,
    flipped: false,
    props,
  })
}

function wire(points: ReadonlyArray<Point>): WireObject {
  return {
    kind: "wire",
    id: newId(),
    points,
  }
}

function ground(position: Point): GroundObject {
  return {
    kind: "ground",
    id: newId(),
    position,
    netName: "GND",
  }
}

function probe(name: string, position: Point): ProbeObject {
  return {
    kind: "probe",
    id: newId(),
    probeType: "voltage",
    name,
    position,
  }
}

function text(textValue: string, position: Point): TextObject {
  return {
    kind: "text",
    id: newId(),
    text: textValue,
    fontSize: 24,
    position,
  }
}

function label(textValue: string, position: Point): NetLabelObject {
  return {
    kind: "net-label",
    id: newId(),
    text: textValue,
    position,
  }
}

function withObjects(
  project: CircuitProject,
  objects: ReadonlyArray<SchematicObject>,
): CircuitProject {
  return {
    ...project,
    objects,
  }
}

export function createRcLowPassExample(): CircuitProject {
  const project = newCircuitProject("RC Low-Pass Demo")
  const v1 = component(
    "dc-voltage-source",
    "V1",
    { x: 120, y: 160 },
    { voltageVolts: 5 },
  )
  const r1 = component("resistor", "R1", { x: 240, y: 160 }, {
    resistanceOhms: 1_000,
  })
  const c1 = component("capacitor", "C1", { x: 360, y: 160 }, {
    capacitanceFarads: 1e-6,
  })
  const vpIn = probe("VP_IN", { x: 160, y: 120 })
  const vpOut = probe("VP_OUT", { x: 300, y: 160 })

  return withObjects(
    project,
    [
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
  )
}

export function createVoltageDividerExample(): CircuitProject {
  const project = newCircuitProject("Voltage Divider Demo")
  const v1 = component(
    "dc-voltage-source",
    "V1",
    { x: 120, y: 160 },
    { voltageVolts: 5 },
  )
  const r1 = component("resistor", "R1", { x: 240, y: 160 }, {
    resistanceOhms: 10_000,
  })
  const r2 = component(
    "resistor",
    "R2",
    { x: 320, y: 220 },
    { resistanceOhms: 10_000 },
    90,
  )
  const vpOut = probe("VP_OUT", { x: 320, y: 180 })

  return withObjects(
    project,
    [
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
  )
}

export function createSourceToGroundExample(): CircuitProject {
  const project = newCircuitProject("Voltage Source to Ground Demo")
  const sourcePositive = { x: 180, y: 140 }
  const sourceNegative = { x: 180, y: 220 }
  const v1 = component(
    "dc-voltage-source",
    "V1",
    { x: 180, y: 180 },
    { voltageVolts: 5 },
    90,
  )
  const vpVin = probe("VP_VIN", sourcePositive)

  return withObjects(
    project,
    [
      text("Source to ground", { x: 120, y: 90 }),
      v1,
      ground(sourceNegative),
      label("VIN", sourcePositive),
      vpVin,
    ],
  )
}
