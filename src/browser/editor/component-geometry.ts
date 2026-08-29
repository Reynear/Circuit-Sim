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
