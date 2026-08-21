import type { TextObject } from "./types"

export const DEFAULT_TEXT_SIZE = 24
export const TEXT_LINE_GAP = 3

export function getTextSize(text: Pick<TextObject, "fontSize">): number {
  return validTextSize(text.fontSize) ?? DEFAULT_TEXT_SIZE
}

export function parseTextSize(value: string | undefined): number {
  return validTextSize(Number(value)) ?? DEFAULT_TEXT_SIZE
}

export function splitTextLines(text: string): string[] {
  return text.split(/\r?\n/)
}

export function textLineY(fontSize: number, index: number): number {
  return index * (fontSize + TEXT_LINE_GAP)
}

function validTextSize(value: number | undefined): number | null {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return null
  }
  return value
}
