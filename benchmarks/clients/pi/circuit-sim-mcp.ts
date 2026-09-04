/**
 * Pi extension for the Circuit Sim MCP benchmark.
 *
 * Pi deliberately has no built-in MCP client. This small adapter discovers the
 * Circuit Sim tools once, registers them with Pi, and forwards each call over
 * the official Streamable HTTP MCP transport. It is intentionally benchmark
 * scoped: it does not install anything or modify Pi settings.
 *
 * Usage:
 *
 *   pi --no-builtin-tools \
 *     -e ./benchmarks/clients/pi/circuit-sim-mcp.ts \
 *     "Use Circuit Sim to ..."
 *
 * Set CIRCUIT_SIM_MCP_URL to override the default local endpoint.
 */

import {
  Client,
  StreamableHTTPClientTransport,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/client"

const DEFAULT_ENDPOINT = "http://127.0.0.1:3000/mcp"
const EXPECTED_TOOL_NAMES = [
  "edit_circuit",
  "inspect_circuit",
  "render_schematic",
  "simulate_circuit",
] as const

type PiTool = {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly parameters: Tool["inputSchema"]
  readonly execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
  ) => Promise<{
    readonly content: ReadonlyArray<{ readonly type: "text"; readonly text: string }>
    readonly details: Record<string, unknown>
  }>
}

type PiExtensionApi = {
  registerTool(tool: PiTool): void
  on(event: "session_shutdown", handler: () => void | Promise<void>): void
}

/**
 * Kept separate from the extension factory so a benchmark can unit-test the
 * endpoint contract without loading Pi itself.
 */
export function assertCircuitSimTools(tools: ReadonlyArray<Pick<Tool, "name">>): void {
  const names = tools.map((tool) => tool.name).sort()
  const expected = [...EXPECTED_TOOL_NAMES].sort()
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  ) {
    throw new Error(
      `Circuit Sim MCP must expose exactly ${expected.join(", ")}; received ${names.join(", ")}`,
    )
  }
}

export function endpointFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): URL {
  const endpoint = new URL(environment.CIRCUIT_SIM_MCP_URL ?? DEFAULT_ENDPOINT)
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
    throw new Error("CIRCUIT_SIM_MCP_URL must use http or https")
  }
  return endpoint
}

export default async function circuitSimMcpExtension(
  pi: PiExtensionApi,
): Promise<void> {
  const endpoint = endpointFromEnvironment()
  const client = new Client({ name: "circuit-sim-pi-benchmark", version: "0.1.0" })
  const transport = new StreamableHTTPClientTransport(endpoint)

  await client.connect(transport)
  const discovered = await client.listTools()
  assertCircuitSimTools(discovered.tools)

  for (const tool of discovered.tools) {
    pi.registerTool(makePiTool(client, tool))
  }

  pi.on("session_shutdown", async () => {
    await client.close()
  })
}

function makePiTool(client: Client, tool: Tool): PiTool {
  return {
    name: tool.name,
    label: tool.title ?? tool.name,
    description: tool.description ?? `Call Circuit Sim's ${tool.name} MCP tool.`,
    parameters: tool.inputSchema,
    execute: async (_toolCallId, params, signal) => {
      const result = await client.callTool(
        { name: tool.name, arguments: params },
        { signal },
      )
      return piResult(result)
    },
  }
}

export function piResult(result: CallToolResult) {
  const content = result.content.map((block) => {
    if (block.type === "text") return block
    if (block.type === "image") {
      return {
        type: "text" as const,
        text: `[Circuit Sim returned a ${block.mimeType} image. Use the pinned schematic link included with this result.]`,
      }
    }
    if (block.type === "resource_link") {
      return {
        type: "text" as const,
        text: `${block.title ?? block.name}: ${block.uri}`,
      }
    }
    return {
      type: "text" as const,
      text: `[Circuit Sim returned ${block.type} content that this Pi adapter cannot display.]`,
    }
  })

  if (result.isError) {
    const detail = result.structuredContent
      ? JSON.stringify(result.structuredContent)
      : content.map((block) => block.text).join("\n")
    throw new Error(`Circuit Sim MCP tool failed: ${detail}`)
  }

  return {
    content,
    details: {
      mcpStructuredContent: result.structuredContent ?? null,
    },
  }
}
