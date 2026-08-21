import type { SymbolObject } from "./types"

const suffixMultipliers: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  "µ": 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  meg: 1e6,
  Meg: 1e6,
  g: 1e9,
  G: 1e9,
}

const e12Values = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2]

const wheelEditableFieldsByComponent: Record<string, string[]> = {
  capacitor: ["value", "capacitance"],
  inductor: ["value", "inductance"],
  resistor: ["value", "resistance"],
}

const wheelEditLabelsByComponent: Record<string, string> = {
  capacitor: "Capacitance",
  inductor: "Inductance",
  resistor: "Resistance",
}

const displaySuffixes = [
  { suffix: "G", multiplier: 1e9 },
  { suffix: "M", multiplier: 1e6 },
  { suffix: "k", multiplier: 1e3 },
  { suffix: "", multiplier: 1 },
  { suffix: "m", multiplier: 1e-3 },
  { suffix: "u", multiplier: 1e-6 },
  { suffix: "n", multiplier: 1e-9 },
  { suffix: "p", multiplier: 1e-12 },
]

export type MouseWheelValueEdit = {
  field: string
  label: string
  value: string
  values: Array<{ value: string; active: boolean }>
}

export function parseSiValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim()
  const match = normalized.match(
    /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(?:\s*)(meg|Meg|[pnumkKMGgµ])?(?:[a-zA-ZΩµ]*)?$/u,
  )
  if (!match) {
    return null
  }

  const magnitude = Number(match[1])
  if (!Number.isFinite(magnitude)) {
    return null
  }

  const suffix = match[2]
  return magnitude * (suffix ? suffixMultipliers[suffix] ?? 1 : 1)
}

export function isPositiveSiValue(value: unknown): boolean {
  const parsed = parseSiValue(value)
  return parsed !== null && parsed > 0
}

export function getMouseWheelValueEdit(
  symbol: SymbolObject,
  deltaY: number,
): MouseWheelValueEdit | null {
  const editableFields = wheelEditableFieldsByComponent[symbol.componentDefinitionId]
  if (!editableFields || deltaY === 0) {
    return null
  }

  const field = editableFields.find(
    (candidate) => parseSiValue(symbol.props[candidate]) !== null,
  )
  if (!field) {
    return null
  }

  const parts = parseSiValueParts(symbol.props[field])
  if (!parts || parts.value <= 0) {
    return null
  }

  const direction = deltaY < 0 ? 1 : -1
  const nextValue = stepE12Value(parts.value, direction)
  if (nextValue === parts.value) {
    return null
  }

  return {
    field,
    label: wheelEditLabelsByComponent[symbol.componentDefinitionId] ?? field,
    value: formatSiValue(nextValue, parts.unit),
    values: nearbyE12Values(nextValue, parts.unit),
  }
}

type SiValueParts = {
  value: number
  unit: string
}

function parseSiValueParts(value: unknown): SiValueParts | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? { value, unit: "" } : null
  }
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim()
  const match = normalized.match(
    /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(?:\s*)(meg|Meg|[pnumkKMGgµ])?([a-zA-ZΩµ]*)?$/u,
  )
  if (!match) {
    return null
  }

  const magnitude = Number(match[1])
  if (!Number.isFinite(magnitude)) {
    return null
  }

  const suffix = match[2]
  return {
    value: magnitude * (suffix ? suffixMultipliers[suffix] ?? 1 : 1),
    unit: match[3] ?? "",
  }
}

function stepE12Value(value: number, direction: -1 | 1): number {
  const exponent = Math.floor(Math.log10(value))
  const candidates = buildE12Candidates(exponent)
  const currentIndex = insertCurrentValue(candidates, value)
  const nextIndex = Math.min(
    candidates.length - 1,
    Math.max(0, currentIndex + direction),
  )
  return candidates[nextIndex] ?? value
}

function nearbyE12Values(
  value: number,
  unit: string,
): Array<{ value: string; active: boolean }> {
  const exponent = Math.floor(Math.log10(value))
  const candidates = buildE12Candidates(exponent)
  const activeIndex = insertCurrentValue(candidates, value)
  const start = Math.max(0, activeIndex - 2)
  const end = Math.min(candidates.length, start + 5)
  return candidates.slice(Math.max(0, end - 5), end).map((candidate) => ({
    value: formatSiValue(candidate, unit),
    active: nearlyEqual(candidate, value),
  }))
}

function buildE12Candidates(centerExponent: number): number[] {
  const values: number[] = []
  for (let exponent = centerExponent - 2; exponent <= centerExponent + 2; exponent += 1) {
    const multiplier = 10 ** exponent
    for (const value of e12Values) {
      values.push(value * multiplier)
    }
  }
  return values.sort((a, b) => a - b)
}

function insertCurrentValue(values: number[], value: number): number {
  const existingIndex = values.findIndex((candidate) => nearlyEqual(candidate, value))
  if (existingIndex >= 0) {
    return existingIndex
  }
  const insertAt = values.findIndex((candidate) => candidate > value)
  if (insertAt === -1) {
    values.push(value)
    return values.length - 1
  }
  values.splice(insertAt, 0, value)
  return insertAt
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1e-15, Math.abs(b) * 1e-9)
}

function formatSiValue(value: number, unit: string): string {
  const absoluteValue = Math.abs(value)
  const display =
    displaySuffixes.find(({ multiplier }) => absoluteValue >= multiplier) ??
    displaySuffixes[displaySuffixes.length - 1]
  const scaled = value / (display?.multiplier ?? 1)
  return `${formatCompactNumber(scaled)}${display?.suffix ?? ""}${unit}`
}

function formatCompactNumber(value: number): string {
  const rounded = Number(value.toPrecision(3))
  return Object.is(rounded, -0) ? "0" : String(rounded)
}
