/**
 * Result captured by a process supervisor.
 *
 * Adapters deliberately do not spawn a process. A benchmark runner may pass a
 * result captured by its own supervisor to `normalizeProcessResult`.
 */
export type CapturedProcessResult = {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | null
  readonly signal?: string | null
  readonly timedOut?: boolean
  readonly durationMs?: number
}

export type ClientOutputFormat = "json" | "stream-json"

export type ParsedProcessEvent = {
  readonly value: unknown
  readonly line: number
}

export type NormalizedProcessResult = {
  readonly status: "success" | "failed" | "timed_out"
  readonly ok: boolean
  readonly exitCode: number | null
  readonly signal: string | null
  readonly timedOut: boolean
  readonly durationMs: number | undefined
  /** Complete captured stdout; callers choose whether to persist it. */
  readonly stdout: string
  /** Complete captured stderr; callers choose whether to persist it. */
  readonly stderr: string
  /** JSON values from one JSON document or newline-delimited JSON events. */
  readonly events: ReadonlyArray<ParsedProcessEvent>
  /** Non-JSON output, retained without writing it anywhere. */
  readonly text: string
  /** Malformed non-empty JSON lines, with line numbers for diagnostics. */
  readonly parseErrors: ReadonlyArray<string>
}

/**
 * Normalizes either a single JSON document or newline-delimited JSON output.
 *
 * Both Claude Code's `--output-format json|stream-json` and Gemini CLI's
 * `--output-format json|stream-json` are accepted. Plain text is retained as
 * text so a failed invocation remains diagnosable without guessing at its
 * schema. This function never logs, reads environment variables, or retries.
 */
export function normalizeProcessResult(
  result: CapturedProcessResult,
  _format: ClientOutputFormat = "stream-json",
): NormalizedProcessResult {
  const parsed = parseJsonOutput(result.stdout)
  const timedOut = result.timedOut === true
  const status = timedOut
    ? "timed_out"
    : result.exitCode === 0
      ? "success"
      : "failed"

  return {
    status,
    ok: status === "success",
    exitCode: result.exitCode,
    signal: result.signal ?? null,
    timedOut,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
    events: parsed.events,
    text: parsed.text,
    parseErrors: parsed.parseErrors,
  }
}

/** Returns only the final user-facing assistant message, excluding prompts and tool output. */
export function finalAssistantText(result: NormalizedProcessResult): string {
  for (let index = result.events.length - 1; index >= 0; index -= 1) {
    const event = result.events[index]?.value
    if (!isRecord(event) || event.type !== "message_end") continue
    const message = event.message
    if (!isRecord(message) || message.role !== "assistant") continue
    return textFromValue(message.content)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0)
      .join("\n")
  }
  return result.text
}

function parseJsonOutput(output: string): {
  events: ParsedProcessEvent[]
  text: string
  parseErrors: string[]
} {
  const trimmed = output.trim()
  if (trimmed.length === 0) {
    return { events: [], text: "", parseErrors: [] }
  }

  const document = parseJson(trimmed)
  if (document.ok) {
    return {
      events: [{ value: document.value, line: 1 }],
      text: textFromEvents([document.value]),
      parseErrors: [],
    }
  }

  const events: ParsedProcessEvent[] = []
  const textLines: string[] = []
  const parseErrors: string[] = []
  for (const [index, line] of output.split(/\r?\n/).entries()) {
    const lineNumber = index + 1
    const lineTrimmed = line.trim()
    if (lineTrimmed.length === 0) continue
    const parsedLine = parseJson(lineTrimmed)
    if (parsedLine.ok) {
      events.push({ value: parsedLine.value, line: lineNumber })
    } else {
      textLines.push(line)
      parseErrors.push(`Line ${lineNumber} is not valid JSON.`)
    }
  }

  return {
    events,
    text: [
      ...textLines,
      textFromEvents(events.map((event) => event.value)),
    ]
      .filter((line) => line.trim().length > 0)
      .join("\n"),
    parseErrors: events.length > 0 ? parseErrors : [],
  }
}

function parseJson(value: string):
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) }
  } catch {
    return { ok: false }
  }
}

/** Extracts user-facing response text from common Claude/Gemini event shapes. */
function textFromEvents(events: ReadonlyArray<unknown>): string {
  const chunks: string[] = []
  const seen = new Set<string>()
  for (const event of events) {
    for (const chunk of textFromValue(event)) {
      const normalized = chunk.trim()
      if (normalized.length === 0 || seen.has(normalized)) continue
      seen.add(normalized)
      chunks.push(normalized)
    }
  }
  return chunks.join("\n")
}

function textFromValue(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(textFromValue)
  if (!isRecord(value)) return []

  // Final result fields are preferred so metadata does not become answer text.
  for (const key of ["result", "response", "text"]) {
    const candidate = value[key]
    if (typeof candidate === "string") return [candidate]
  }

  const message = value.message
  if (isRecord(message)) {
    const content = message.content
    const chunks = textFromValue(content)
    if (chunks.length > 0) return chunks
  }

  const content = value.content
  if (typeof content === "string" || Array.isArray(content)) {
    return textFromValue(content)
  }
  return []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
