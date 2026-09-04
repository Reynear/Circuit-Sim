import {
  getLocalPins,
  localToWorld,
} from "@circuit-sim/core/circuit/component-geometry"
import { rotatePoint } from "@circuit-sim/core/circuit/geometry"
import type { Component, Point } from "@circuit-sim/core/circuit/project"

export function getLocalBounds(component: Component) {
  const pins = getLocalPins(component)
  const xs = pins.map((pin) => pin.post.x)
  const ys = pins.map((pin) => pin.post.y)
  const margin = 24
  const left = Math.min(...xs) - margin
  const right = Math.max(...xs) + margin
  const top = Math.min(...ys) - margin
  const bottom = Math.max(...ys) + margin
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function worldToLocal(component: Component, world: Point): Point {
  const rotated = rotatePoint(
    { x: world.x - component.position.x, y: world.y - component.position.y },
    -component.rotation,
  )
  return component.flipped ? { x: rotated.x, y: -rotated.y } : rotated
}

export function getWorldBounds(component: Component) {
  const bounds = getLocalBounds(component)
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ].map((corner) => localToWorld(component, corner))
  const xs = corners.map((corner) => corner.x)
  const ys = corners.map((corner) => corner.y)
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export type ComponentLabelPosition = {
  readonly x: number
  readonly y: number
  readonly textAnchor: "start" | "middle" | "end"
}

export function getComponentLabelPositions(component: Component): {
  readonly refdes: ComponentLabelPosition
  readonly value: ComponentLabelPosition
} {
  if (component.type === "dc-power-rail") {
    if (component.rotation === 0) {
      return {
        refdes: {
          x: component.position.x,
          y: component.position.y - 50,
          textAnchor: "middle",
        },
        value: {
          x: component.position.x,
          y: component.position.y - 33,
          textAnchor: "middle",
        },
      }
    }
    if (component.rotation === 180) {
      return {
        refdes: {
          x: component.position.x,
          y: component.position.y + 42,
          textAnchor: "middle",
        },
        value: {
          x: component.position.x,
          y: component.position.y + 59,
          textAnchor: "middle",
        },
      }
    }
  }
  const bounds = getWorldBounds(component)
  if (component.rotation === 90 || component.rotation === 270) {
    const x = bounds.x - 10
    return {
      refdes: { x, y: component.position.y - 4, textAnchor: "end" },
      value: { x, y: component.position.y + 13, textAnchor: "end" },
    }
  }
  return {
    refdes: {
      x: component.position.x,
      y: bounds.y - 8,
      textAnchor: "middle",
    },
    value: {
      x: component.position.x,
      y: bounds.y + bounds.height + 18,
      textAnchor: "middle",
    },
  }
}
