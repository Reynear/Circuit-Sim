import type { Vec2 } from "./types"

export type SquareMarker = {
  x: number
  y: number
  width: number
  height: number
}

export type OvalMarker = {
  cx: number
  cy: number
  rx: number
  ry: number
}

export const POST_HANDLE_SIZE = 7
export const GRABBED_HANDLE_SIZE = 9

export function squareMarker(
  position: Vec2,
  size = POST_HANDLE_SIZE,
): SquareMarker {
  const offset = Math.floor(size / 2)
  return {
    x: position.x - offset,
    y: position.y - offset,
    width: size,
    height: size,
  }
}

export function ovalMarker(
  position: Vec2,
  size = POST_HANDLE_SIZE,
): OvalMarker {
  const square = squareMarker(position, size)
  return {
    cx: square.x + square.width / 2,
    cy: square.y + square.height / 2,
    rx: square.width / 2,
    ry: square.height / 2,
  }
}
