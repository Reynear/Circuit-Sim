import { nanoid } from "nanoid"

export type EntityPrefix =
  | "prj"
  | "sht"
  | "sym"
  | "wire"
  | "pin"
  | "junc"
  | "label"
  | "probe"
  | "text"
  | "line"
  | "box"
  | "net"
  | "sim"
  | "snap"
  | "patch"

export function createId(prefix: EntityPrefix): string {
  return `${prefix}_${nanoid()}`
}

export function hasPrefix(id: string, prefix: EntityPrefix): boolean {
  return id.startsWith(`${prefix}_`)
}
