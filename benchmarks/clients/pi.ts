import { resolve } from "node:path"
import {
  clientOptions,
  mcpServerReference,
  normalizeClientResult,
  type CommonClientOptions,
  type HeadlessClientAdapter,
  type HeadlessClientRequest,
  type PreparedClientInvocation,
} from "./adapter"

export type PiOptions = CommonClientOptions & {
  readonly extensionPath?: string
}

export function createPiAdapter(
  options: PiOptions = {},
): HeadlessClientAdapter {
  const configured = clientOptions(options)
  return {
    id: "pi",
    prepare: (request) => preparePiInvocation(request, options),
    normalize: (result) => normalizeClientResult(result, configured.outputFormat),
  }
}

export function preparePiInvocation(
  request: HeadlessClientRequest,
  options: PiOptions = {},
): PreparedClientInvocation {
  const configured = clientOptions(options)
  const mcpServer = mcpServerReference(request, configured.mcpServerName)
  const extensionPath = resolve(
    options.extensionPath ?? "benchmarks/clients/pi/circuit-sim-mcp.ts",
  )
  return {
    client: "pi",
    command: configured.command ?? "pi",
    args: [
      "--print",
      "--mode",
      "json",
      "--no-session",
      "--no-builtin-tools",
      "--no-extensions",
      "--extension",
      extensionPath,
      "--no-skills",
      "--no-context-files",
      "--no-approve",
      ...(configured.model === undefined ? [] : ["--model", configured.model]),
      request.prompt,
    ],
    cwd: configured.cwd,
    timeoutMs: configured.timeoutMs,
    maxAttempts: 1,
    outputFormat: configured.outputFormat,
    mcpServer,
    inlineMcpConfig: undefined,
    requiredMcpConfig: undefined,
  }
}
