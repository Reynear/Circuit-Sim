import {
  normalizeProcessResult,
  type CapturedProcessResult,
  type ClientOutputFormat,
  type NormalizedProcessResult,
} from "./process-result"

export type BenchmarkClientId = "claude-code" | "gemini-cli" | "pi"

export type McpServerReference = {
  readonly name: string
  readonly url: string
}

export type HeadlessClientRequest = {
  readonly prompt: string
  readonly mcpUrl: string
}

export type PreparedClientInvocation = {
  readonly client: BenchmarkClientId
  readonly command: string
  readonly args: ReadonlyArray<string>
  /** Optional process stdin, used when a prompt is too large for argv. */
  readonly stdin?: string
  readonly cwd: string | undefined
  readonly timeoutMs: number
  /** The benchmark runner must not retry model calls. */
  readonly maxAttempts: 1
  readonly outputFormat: ClientOutputFormat
  readonly mcpServer: McpServerReference
  /** Inline configuration where the CLI supports it. */
  readonly inlineMcpConfig: unknown | undefined
  /** Configuration a runner may materialize for a CLI that reads settings. */
  readonly requiredMcpConfig: unknown | undefined
  /** A deny-by-default policy the runner must materialize before invocation. */
  readonly requiredToolPolicy?: {
    readonly kind: "gemini-cli-admin"
    readonly filename: string
    readonly content: string
  }
}

export type HeadlessClientAdapter = {
  readonly id: BenchmarkClientId
  readonly prepare: (
    request: HeadlessClientRequest,
  ) => PreparedClientInvocation
  readonly normalize: (
    result: CapturedProcessResult,
  ) => NormalizedProcessResult
}

export type CommonClientOptions = {
  readonly command?: string
  readonly cwd?: string
  readonly model?: string
  readonly mcpServerName?: string
  readonly outputFormat?: ClientOutputFormat
  readonly timeoutMs?: number
}

export const DEFAULT_CLIENT_TIMEOUT_MS = 120_000
export const DEFAULT_MCP_SERVER_NAME = "circuit-sim"

export function clientOptions(options: CommonClientOptions = {}) {
  return {
    command: nonEmptyOption(options.command, "command"),
    cwd: options.cwd,
    model: nonEmptyOption(options.model, "model"),
    mcpServerName:
      options.mcpServerName === undefined
        ? DEFAULT_MCP_SERVER_NAME
        : validMcpServerName(options.mcpServerName),
    outputFormat: options.outputFormat ?? "stream-json",
    timeoutMs: validTimeout(options.timeoutMs ?? DEFAULT_CLIENT_TIMEOUT_MS),
  }
}

export function mcpServerReference(
  request: HeadlessClientRequest,
  name: string,
): McpServerReference {
  if (request.prompt.trim().length === 0) {
    throw new Error("Headless benchmark prompts cannot be blank")
  }
  return { name, url: safeMcpUrl(request.mcpUrl) }
}

export function normalizeClientResult(
  result: CapturedProcessResult,
  format: ClientOutputFormat,
): NormalizedProcessResult {
  return normalizeProcessResult(result, format)
}

function safeMcpUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("MCP URL must be an absolute http or https URL")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MCP URL must use http or https")
  }
  // Credentials belong in the client transport, never in benchmark command
  // arguments. Query strings and fragments are rejected for the same reason:
  // they are commonly used to smuggle bearer tokens into copied URLs.
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("MCP URL must not contain credentials, query parameters, or fragments")
  }
  return url.href
}

function validMcpServerName(value: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value)) {
    throw new Error(
      "MCP server name must start with a letter and contain only letters, numbers, underscores, or hyphens",
    )
  }
  return value
}

function nonEmptyOption(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined
  if (value.trim().length === 0) throw new Error(`${label} cannot be blank`)
  return value
}

function validTimeout(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Client timeout must be a positive finite number")
  }
  return Math.floor(value)
}
