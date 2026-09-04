import { getPinPosts, type ComponentPost } from "@circuit-sim/core/circuit/component-geometry"
import type { Component, Point, SchematicObject, WireObject } from "@circuit-sim/core/circuit/project"

export type VisiblePost = {
  key: string
  kind: "annotation" | "post"
  position: Point
}

type CountedPost = {
  count: number
  hasAnnotation: boolean
  order: number
  position: Point
}

export function getVisiblePosts(objects: ReadonlyArray<SchematicObject>): VisiblePost[] {
  const counted = new Map<string, CountedPost>()
  objects.forEach((object, order) => {
    for (const post of postsFor(object)) {
      const key = postKey(post.position)
      const current = counted.get(key)
      counted.set(key, {
        count: (current?.count ?? 0) + 1,
        hasAnnotation: Boolean(current?.hasAnnotation || post.kind === "annotation"),
        order: current?.order ?? order,
        position: current?.position ?? post.position,
      })
    }
  })
  return [...counted.entries()]
    .filter(([, post]) => post.count !== 2)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([key, post]) => ({
      key,
      kind: post.hasAnnotation ? "annotation" : "post",
      position: post.position,
    }))
}

export function getWirePostIndexes(wire: WireObject): [number, number] {
  return [0, wire.points.length - 1]
}

export function getPrimaryComponentPosts(
  component: Component,
): ComponentPost[] {
  const posts = getPinPosts(component)
  return posts.length <= 2 ? posts : [posts[0]!, posts.at(-1)!]
}

export function getTemporaryComponentHandles(component: Component): Point[] {
  return getPrimaryComponentPosts(component).map((post) => post.position)
}

export function getNormalComponentHandles(component: Component): ComponentPost[] {
  return getPinPosts(component)
}

function postsFor(
  object: SchematicObject,
): Array<{ kind: "annotation" | "post"; position: Point }> {
  if (object.kind === "component") {
    return getPinPosts(object).map((pin) => ({ kind: "post", position: pin.position }))
  }
  if (object.kind === "wire") {
    return getWirePostIndexes(object).flatMap((index) => {
      const position = object.points[index]
      return position ? [{ kind: "post", position }] : []
    })
  }
  if (
    object.kind === "ground" ||
    object.kind === "net-label" ||
    object.kind === "probe"
  ) {
    return [{ kind: "annotation", position: object.position }]
  }
  return []
}

function postKey(position: Point): string {
  return `${position.x}:${position.y}`
}
