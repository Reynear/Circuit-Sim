import {
  clientOptions,
  mcpServerReference,
  normalizeClientResult,
  type CommonClientOptions,
  type HeadlessClientAdapter,
  type HeadlessClientRequest,
  type PreparedClientInvocation,
} from "./adapter"

export type ClaudeCodeOptions = CommonClientOptions

/**
 * Builds a one-shot Claude Code invocation without starting Claude Code.
 * Authentication remains entirely owned by the caller's process environment
 * and is never read, copied, or printed by this adapter.
 */
export function createClaudeCodeAdapter(
  options: ClaudeCodeOptions = {},
): HeadlessClientAdapter {
  const configured = clientOptions(options)
  return {
    id: "claude-code",
    prepare: (request) => prepareClaudeCodeInvocation(request, options),
    normalize: (result) => normalizeClientResult(result, configured.outputFormat),
  }
}

export function prepareClaudeCodeInvocation(
  request: HeadlessClientRequest,
  options: ClaudeCodeOptions = {},
): PreparedClientInvocation {
  const configured = clientOptions(options)
  const mcpServer = mcpServerReference(request, configured.mcpServerName)
  const inlineMcpConfig = {
    mcpServers: {
      [mcpServer.name]: {
        type: "http",
        url: mcpServer.url,
      },
    },
  }
  const args = [
    "--print",
    "--no-session-persistence",
    "--output-format",
    configured.outputFormat,
    "--input-format",
    "text",
    "--tools",
    "",
    "--allowedTools",
    `mcp__${mcpServer.name}__*`,
    "--mcp-config",
    JSON.stringify(inlineMcpConfig),
    "--strict-mcp-config",
    ...(configured.model === undefined ? [] : ["--model", configured.model]),
    request.prompt,
  ]
  return {
    client: "claude-code",
    command: configured.command ?? "claude",
    args,
    cwd: configured.cwd,
    timeoutMs: configured.timeoutMs,
    maxAttempts: 1,
    outputFormat: configured.outputFormat,
    mcpServer,
    inlineMcpConfig,
    requiredMcpConfig: undefined,
  }
}
