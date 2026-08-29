import { Option } from "effect"
import {
  capacitor,
  decodeComponentPropertyEdit,
  inductor,
  readComponentProperty,
  resistor,
  type ComponentPropertyEdit,
} from "@circuit-sim/core/circuit/components"
import type { Component } from "@circuit-sim/core/circuit/project"
import { formatSiValue } from "@circuit-sim/core/circuit/values"

export { formatSiValue }

const suffixMultipliers = [
  ["p", 1e-12], ["n", 1e-9], ["u", 1e-6], ["µ", 1e-6],
  ["m", 1e-3], ["k", 1e3], ["K", 1e3], ["M", 1e6],
  ["meg", 1e6], ["Meg", 1e6], ["g", 1e9], ["G", 1e9],
] as const

function suffixMultiplier(suffix: string | undefined): number {
  return suffixMultipliers.find(([name]) => name === suffix)?.[1] ?? 1
}

const e12Values = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2]

const wheelEditProperties = [
  capacitor.properties.capacitanceFarads,
  inductor.properties.inductanceHenries,
  resistor.properties.resistanceOhms,
] as const

export type MouseWheelValueEdit = {
  propertyEdit: ComponentPropertyEdit
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
  return magnitude * suffixMultiplier(suffix)
}

export function getMouseWheelValueEdit(
  component: Component,
  deltaY: number,
): MouseWheelValueEdit | null {
  const property = wheelEditProperties.find(
    (candidate) => candidate.componentType === component.type,
  )
  if (!property || deltaY === 0) {
    return null
  }

  const parts = parseSiValueParts(readComponentProperty(property, component.props))
  if (!parts || parts.value <= 0) {
    return null
  }

  const direction = deltaY < 0 ? 1 : -1
  const nextValue = stepE12Value(parts.value, direction)
  if (nextValue === parts.value) {
    return null
  }

  const decodedEdit: Option.Option<ComponentPropertyEdit> =
    decodeComponentPropertyEdit(property, nextValue)
  if (Option.isNone(decodedEdit)) {
    throw new Error(`${property.componentType} generated an invalid wheel edit`)
  }
  return {
    propertyEdit: decodedEdit.value,
    label: property.label,
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
    value: magnitude * suffixMultiplier(suffix),
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
