import type { SpiceTraceBinding } from "./spice-netlist"
import type { SimulationMetric, WaveformTrace } from "./types"

export type ParsedNgspiceOutput = {
  traces: WaveformTrace[]
  warnings: string[]
  errors: string[]
}

export function parseNgspiceAsciiRawOutput(
  rawOutput: string,
  bindings: SpiceTraceBinding[] = [],
): ParsedNgspiceOutput {
  const warnings = diagnosticLines(rawOutput, "warning")
  const errors = diagnosticLines(rawOutput, "error")
  const lines = rawOutput.split(/\r?\n/)
  const flags = valueAfterPrefix(lines, "Flags:")?.toLowerCase() ?? ""
  if (flags.includes("binary")) {
    errors.push("Binary ngspice raw output is not supported; expected ASCII raw output.")
    return { traces: [], warnings, errors }
  }
  if (flags.includes("complex")) {
    errors.push("Complex ngspice raw output is not supported for waveform plotting yet.")
    return { traces: [], warnings, errors }
  }
  const variableCount = numberAfterPrefix(lines, "No. Variables:")
  const pointCount = numberAfterPrefix(lines, "No. Points:")
  const variablesIndex = lines.findIndex((line) => line.trim() === "Variables:")
  const valuesIndex = lines.findIndex((line) => line.trim() === "Values:")
  if (
    variableCount === null ||
    pointCount === null ||
    variablesIndex === -1 ||
    valuesIndex === -1
  ) {
    return { traces: [], warnings, errors }
  }

  const variables = lines
    .slice(variablesIndex + 1, variablesIndex + 1 + variableCount)
    .map((line) => parseRawVariable(line))
    .filter((variable): variable is RawVariable => Boolean(variable))
  const timeVariable = variables.find((variable) => variable.index === 0)
  if (!timeVariable) {
    return { traces: [], warnings, errors }
  }

  const series = new Map<number, Array<{ t: number; v: number }>>(
    variables
      .filter((variable) => variable.index !== 0)
      .map((variable) => [variable.index, []]),
  )
  let cursor = valuesIndex + 1
  for (let pointIndex = 0; pointIndex < pointCount && cursor < lines.length; pointIndex += 1) {
    const first = parseRawValueLine(lines[cursor])
    cursor += 1
    if (!first) {
      continue
    }
    const time = first.value
    for (const variable of variables.filter((candidate) => candidate.index !== 0)) {
      const line = lines[cursor]
      cursor += 1
      const parsed = parseRawValueLine(line)
      if (parsed && Number.isFinite(time) && Number.isFinite(parsed.value)) {
        series.get(variable.index)?.push({ t: time, v: parsed.value })
      }
    }
  }

  const bindingByName = buildBindingLookup(bindings)
  const traces = variables
    .filter((variable) => variable.index !== 0)
    .flatMap((variable) => {
      const points = series.get(variable.index) ?? []
      if (points.length === 0) {
        return []
      }
      const binding = bindingByName.get(normalizeExpression(variable.name))
      return [
        {
          id: `ngspice_${sanitizeTraceId(variable.name)}`,
          name: binding?.targetName ?? normalizeTraceName(variable.name),
          metric: binding?.metric ?? metricForName(variable.name),
          unit: binding?.unit ?? unitForName(variable.name),
          targetId: binding?.targetId ?? variable.name,
          targetName: binding?.targetName ?? normalizeTraceName(variable.name),
          points,
        },
      ]
    })

  return { traces, warnings, errors }
}

export function parseNgspicePrintOutput(output: string): ParsedNgspiceOutput {
  const warnings = diagnosticLines(output, "warning")
  const errors = diagnosticLines(output, "error")

  const rows = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const headerIndex = rows.findIndex((line) => /^index\s+time\s+/i.test(line))
  if (headerIndex === -1) {
    return { traces: [], warnings, errors }
  }

  const headers = rows[headerIndex]!.split(/\s+/)
  const valueHeaders = headers.slice(2)
  const series = new Map<string, Array<{ t: number; v: number }>>(
    valueHeaders.map((header) => [header, []]),
  )

  for (const row of rows.slice(headerIndex + 1)) {
    const columns = row.split(/\s+/)
    if (columns.length < headers.length) {
      continue
    }
    const time = parseSpiceNumber(columns[1])
    if (!Number.isFinite(time)) {
      continue
    }
    valueHeaders.forEach((header, index) => {
      const raw = columns[index + 2]
      const value = raw ? parseSpiceNumber(raw) : Number.NaN
      if (Number.isFinite(value)) {
        series.get(header)?.push({ t: time, v: value })
      }
    })
  }

  const traces = [...series.entries()]
    .filter(([, points]) => points.length > 0)
    .map(([name, points]) => ({
      id: `ngspice_${sanitizeTraceId(name)}`,
      name: normalizeTraceName(name),
      metric: metricForName(name),
      unit: unitForName(name),
      targetId: name,
      targetName: normalizeTraceName(name),
      points,
    }))

  return { traces, warnings, errors }
}

type RawVariable = {
  index: number
  name: string
  kind: string
}

function parseRawVariable(line: string): RawVariable | null {
  const columns = line.trim().split(/\s+/)
  const index = parseSpiceNumber(columns[0])
  const name = columns[1]
  const kind = columns[2]
  if (!Number.isInteger(index) || !name || !kind) {
    return null
  }
  return { index, name, kind }
}

function parseRawValueLine(line: string | undefined): { index?: number; value: number } | null {
  if (!line) {
    return null
  }
  const columns = line.trim().split(/\s+/)
  if (columns.length === 0) {
    return null
  }
  const first = parseSpiceNumber(columns[0])
  if (columns.length === 1) {
    return Number.isFinite(first) ? { value: first } : null
  }
  const second = parseSpiceNumber(columns[1])
  if (Number.isFinite(first) && Number.isFinite(second)) {
    return { index: first, value: second }
  }
  return Number.isFinite(first) ? { value: first } : null
}

function numberAfterPrefix(lines: string[], prefix: string): number | null {
  const value = valueAfterPrefix(lines, prefix)
  if (value === null) {
    return null
  }
  const parsed = parseSpiceNumber(value)
  return Number.isFinite(parsed) ? parsed : null
}

function valueAfterPrefix(lines: string[], prefix: string): string | null {
  const line = lines.find((candidate) =>
    candidate.trim().toLowerCase().startsWith(prefix.toLowerCase()),
  )
  if (!line) {
    return null
  }
  return line.slice(line.indexOf(":") + 1).trim()
}

function parseSpiceNumber(value: string | undefined): number {
  if (!value) {
    return Number.NaN
  }
  return Number(value.replace(/[dD]([+-]?\d+)$/, "e$1"))
}

function diagnosticLines(output: string, kind: "warning" | "error"): string[] {
  const pattern = kind === "warning" ? /warning/i : /\berror\b|fatal|singular matrix|timestep too small|convergence/i
  return output
    .split(/\r?\n/)
    .filter((line) => pattern.test(line))
    .map((line) => line.trim())
}

function buildBindingLookup(
  bindings: SpiceTraceBinding[],
): Map<string, SpiceTraceBinding> {
  const lookup = new Map<string, SpiceTraceBinding>()
  for (const binding of bindings) {
    for (const key of expressionAliases(binding.expression)) {
      lookup.set(key, binding)
    }
  }
  return lookup
}

function expressionAliases(expression: string): string[] {
  const normalized = normalizeExpression(expression)
  if (normalized.startsWith("@")) {
    return [normalized, normalizeExpression(`I(${expression})`)]
  }
  return [normalized]
}

function normalizeExpression(expression: string): string {
  return expression.replace(/\s+/g, "").toLowerCase()
}

function normalizeTraceName(name: string): string {
  return name.toUpperCase().startsWith("V(") || name.toUpperCase().startsWith("I(")
    ? name
    : `V(${name})`
}

function metricForName(name: string): SimulationMetric {
  return name.toUpperCase().startsWith("I(") ? "current" : "voltage"
}

function unitForName(name: string): "V" | "A" {
  return metricForName(name) === "current" ? "A" : "V"
}

function sanitizeTraceId(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_")
}
