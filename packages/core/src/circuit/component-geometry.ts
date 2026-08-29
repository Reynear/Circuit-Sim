import { getComponent, type ComponentTerminal } from "./components"
import { rotatePoint } from "./geometry"
import type { Component, Point } from "./project"

export type ComponentPin = Omit<ComponentTerminal, "position"> & {
  readonly post: Point
}

export type ComponentPost = {
  readonly componentId: string
  readonly type: Component["type"]
  readonly refdes: string
  readonly pin: string
  readonly position: Point
}

export function getLocalPins(component: Component): ComponentPin[] {
  return getComponent(component.type).terminals.map((terminal) => ({
    key: terminal.key,
    label: terminal.label,
    electrical: terminal.electrical,
    post: { x: terminal.position[0], y: terminal.position[1] },
  }))
}

export function localToWorld(component: Component, local: Point): Point {
  const flipped = component.flipped ? { x: local.x, y: -local.y } : local
  const rotated = rotatePoint(flipped, component.rotation)
  return {
    x: component.position.x + rotated.x,
    y: component.position.y + rotated.y,
  }
}

export function getPinPosts(component: Component): ComponentPost[] {
  return getLocalPins(component).map((pin) => ({
    componentId: component.id,
    type: component.type,
    refdes: component.refdes,
    pin: pin.key,
    position: localToWorld(component, pin.post),
  }))
}
