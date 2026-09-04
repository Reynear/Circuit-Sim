import {
  clientOptions,
  mcpServerReference,
  normalizeClientResult,
  type CommonClientOptions,
  type HeadlessClientAdapter,
  type HeadlessClientRequest,
  type PreparedClientInvocation,
} from "./adapter"

export type GeminiCliOptions = CommonClientOptions

/**
 * Builds a one-shot Gemini CLI invocation without starting Gemini.
 *
 * Gemini CLI discovers MCP servers from `.gemini/settings.json`; because this
 * adapter must not write files, the invocation includes the exact settings
 * fragment a process supervisor can materialize in an isolated working
 * directory. Authentication is left to Gemini CLI and is never inspected.
 */
export function createGeminiCliAdapter(
  options: GeminiCliOptions = {},
): HeadlessClientAdapter {
  const configured = clientOptions(options)
  return {
    id: "gemini-cli",
    prepare: (request) => prepareGeminiCliInvocation(request, options),
    normalize: (result) => normalizeClientResult(result, configured.outputFormat),
  }
}

export function prepareGeminiCliInvocation(
  request: HeadlessClientRequest,
  options: GeminiCliOptions = {},
): PreparedClientInvocation {
  const configured = clientOptions(options)
  const mcpServer = mcpServerReference(request, configured.mcpServerName)
  if (mcpServer.name.includes("_")) {
    throw new Error(
      "Gemini MCP server names cannot contain underscores because policy matching would be ambiguous",
    )
  }
  const requiredMcpConfig = {
    mcpServers: {
      [mcpServer.name]: {
        type: "http",
        httpUrl: mcpServer.url,
      },
    },
  }
  const args = [
    "--prompt",
    request.prompt,
    "--output-format",
    configured.outputFormat,
    "--approval-mode",
    "default",
    "--allowed-mcp-server-names",
    mcpServer.name,
    ...(configured.model === undefined ? [] : ["--model", configured.model]),
  ]
  return {
    client: "gemini-cli",
    command: configured.command ?? "gemini",
    args,
    cwd: configured.cwd,
    timeoutMs: configured.timeoutMs,
    maxAttempts: 1,
    outputFormat: configured.outputFormat,
    mcpServer,
    inlineMcpConfig: undefined,
    requiredMcpConfig,
    requiredToolPolicy: {
      kind: "gemini-cli-admin",
      filename: "mcp-only-policy.toml",
      content: [
        "[[rule]]",
        'toolName = "*"',
        'decision = "deny"',
        "priority = 998",
        "",
        "[[rule]]",
        `mcpName = ${JSON.stringify(mcpServer.name)}`,
        'decision = "allow"',
        "priority = 999",
        "",
      ].join("\n"),
    },
  }
}
