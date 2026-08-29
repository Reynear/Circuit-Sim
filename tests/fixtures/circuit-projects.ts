import { newId } from "@circuit-sim/core/ids"
import {
  newCircuitProject,
  makeComponent,
  type CircuitProject,
  type Component,
  type Point,
} from "@circuit-sim/core/circuit/project"
import type { ComponentType } from "@circuit-sim/core/circuit/components"

/** Artificial disconnected topology used to verify island discovery. */
export function createIslandsFixture(): CircuitProject {
  return {
    ...newCircuitProject("Islands Fixture"),
    objects: [
      {
        kind: "text",
        id: newId(),
        text: "Two disconnected regions",
        fontSize: 24,
        position: { x: 120, y: 60 },
      },
      component("dc-voltage-source", "V1", { x: 180, y: 180 }, { voltageVolts: 5 }, 90),
      {
        kind: "ground",
        id: newId(),
        position: { x: 180, y: 220 },
        netName: "GND",
      },
      {
        kind: "net-label",
        id: newId(),
        text: "VIN",
        position: { x: 180, y: 140 },
      },
      component("resistor", "R3", { x: 420, y: 100 }, { resistanceOhms: 1_000 }),
      component("resistor", "R4", { x: 500, y: 100 }, { resistanceOhms: 2_000 }),
    ],
  }
}

function component(
  type: ComponentType,
  refdes: string,
  position: Point,
  props: unknown,
  rotation: Component["rotation"] = 0,
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
