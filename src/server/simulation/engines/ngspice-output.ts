export type ParsedSignalSeries = {
  /** Normalized SPICE expression, e.g. `v(n001)` or `@r1[i]`. */
  expression: string
  points: Array<{ t: number; v: number }>
}

export type ParsedNgspiceOutput = {
  series: ParsedSignalSeries[]
  warnings: string[]
  errors: string[]
}

export function parseNgspiceAsciiRawOutput(
  rawOutput: string,
): ParsedNgspiceOutput {
  const warnings = diagnosticLines(rawOutput, "warning")
  const errors = diagnosticLines(rawOutput, "error")
  const lines = rawOutput.split(/\r?\n/)
  const flags = valueAfterPrefix(lines, "Flags:")?.toLowerCase() ?? ""
  if (flags.includes("binary")) {
    errors.push("Binary ngspice raw output is not supported; expected ASCII raw output.")
    return { series: [], warnings, errors }
  }
  if (flags.includes("complex")) {
    errors.push("Complex ngspice raw output is not supported for waveform plotting yet.")
    return { series: [], warnings, errors }
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
    return { series: [], warnings, errors }
  }

  const variables = lines
    .slice(variablesIndex + 1, variablesIndex + 1 + variableCount)
    .map((line) => parseRawVariable(line))
    .filter((variable): variable is RawVariable => Boolean(variable))
  const timeVariable = variables.find((variable) => variable.index === 0)
  if (!timeVariable) {
    return { series: [], warnings, errors }
  }

  const seriesPoints = new Map<number, Array<{ t: number; v: number }>>(
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
        seriesPoints.get(variable.index)?.push({ t: time, v: parsed.value })
      }
    }
  }

  const series = variables
    .filter((variable) => variable.index !== 0)
    .flatMap((variable) => {
      const points = seriesPoints.get(variable.index) ?? []
      if (points.length === 0) {
        return []
      }
      return [
        {
          expression: normalizeExpression(variable.name),
          points,
        },
      ]
    })

  return { series, warnings, errors }
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
    return { series: [], warnings, errors }
  }

  const headers = rows[headerIndex]!.split(/\s+/)
  const valueHeaders = headers.slice(2)
  const seriesByHeader = new Map<string, Array<{ t: number; v: number }>>(
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
        seriesByHeader.get(header)?.push({ t: time, v: value })
      }
    })
  }

  const series = [...seriesByHeader.entries()]
    .filter(([, points]) => points.length > 0)
    .map(([name, points]) => ({
      expression: normalizeExpression(name),
      points,
    }))

  return { series, warnings, errors }
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

function normalizeExpression(expression: string): string {
  return expression.replace(/\s+/g, "").toLowerCase()
}
