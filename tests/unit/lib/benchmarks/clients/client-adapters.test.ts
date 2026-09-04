import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  createClaudeCodeAdapter,
  createGeminiCliAdapter,
  finalAssistantText,
  normalizeProcessResult,
  preparePiInvocation,
  prepareClaudeCodeInvocation,
  prepareGeminiCliInvocation,
} from "../../../../../benchmarks/clients"
import { captureProcess } from "../../../../../benchmarks/model-runner"

describe("headless benchmark client adapters", () => {
  const request = {
    prompt: "Inspect and simulate the circuit using only Circuit Sim.",
    mcpUrl: "http://127.0.0.1:3000/mcp",
  }

  it("prepares Claude Code with inline MCP configuration and one attempt", () => {
    const invocation = prepareClaudeCodeInvocation(request, {
      model: "sonnet",
      timeoutMs: 45_000,
    })

    expect(invocation).toMatchObject({
      client: "claude-code",
      command: "claude",
      timeoutMs: 45_000,
      maxAttempts: 1,
      mcpServer: { name: "circuit-sim", url: request.mcpUrl },
    })
    expect(invocation.args).toEqual([
      "--print",
      "--no-session-persistence",
      "--output-format",
      "stream-json",
      "--input-format",
      "text",
      "--tools",
      "",
      "--allowedTools",
      "mcp__circuit-sim__*",
      "--mcp-config",
      JSON.stringify({
        mcpServers: {
          "circuit-sim": { type: "http", url: request.mcpUrl },
        },
      }),
      "--strict-mcp-config",
      "--model",
      "sonnet",
      request.prompt,
    ])
    expect(invocation.args.join(" ")).not.toContain("API_KEY")
  })

  it("prepares Pi with only the explicit Circuit Sim extension", () => {
    const invocation = preparePiInvocation(request, {
      model: "openai-codex/gpt-5.6-luna",
      extensionPath: "benchmarks/clients/pi/circuit-sim-mcp.ts",
    })

    expect(invocation).toMatchObject({
      client: "pi",
      command: "pi",
      maxAttempts: 1,
      mcpServer: { name: "circuit-sim", url: request.mcpUrl },
    })
    expect(invocation.args).toEqual(
      expect.arrayContaining([
        "--no-builtin-tools",
        "--no-extensions",
        "--extension",
        "--no-skills",
        "--no-context-files",
        "openai-codex/gpt-5.6-luna",
        request.prompt,
      ]),
    )
  })

  it("prepares Gemini CLI with isolated settings data and one attempt", () => {
    const invocation = prepareGeminiCliInvocation(request, {
      command: "/opt/bin/gemini",
      mcpServerName: "circuit-sim-benchmark",
      outputFormat: "json",
    })

    expect(invocation).toMatchObject({
      client: "gemini-cli",
      command: "/opt/bin/gemini",
      timeoutMs: 120_000,
      maxAttempts: 1,
      outputFormat: "json",
      requiredMcpConfig: {
        mcpServers: {
          "circuit-sim-benchmark": {
            type: "http",
            httpUrl: request.mcpUrl,
          },
        },
      },
    })
    expect(invocation.args).toEqual([
      "--prompt",
      request.prompt,
      "--output-format",
      "json",
      "--approval-mode",
      "default",
      "--allowed-mcp-server-names",
      "circuit-sim-benchmark",
    ])
    expect(invocation.requiredToolPolicy).toMatchObject({
      kind: "gemini-cli-admin",
      filename: "mcp-only-policy.toml",
    })
    expect(invocation.requiredToolPolicy?.content).toContain('toolName = "*"')
    expect(invocation.requiredToolPolicy?.content).toContain(
      'mcpName = "circuit-sim-benchmark"',
    )
  })

  it("normalizes a single JSON response without printing or retrying", () => {
    const result = normalizeProcessResult({
      stdout: JSON.stringify({
        type: "result",
        result: "VOUT is 2.5 V based on the simulation.",
        session_id: "session-is-not-logged",
      }),
      stderr: "",
      exitCode: 0,
      durationMs: 123,
    })

    expect(result).toMatchObject({
      status: "success",
      ok: true,
      exitCode: 0,
      timedOut: false,
      durationMs: 123,
      text: "VOUT is 2.5 V based on the simulation.",
      parseErrors: [],
    })
    expect(result.events).toHaveLength(1)
  })

  it("normalizes newline-delimited Claude and Gemini event shapes", () => {
    const result = normalizeProcessResult({
      stdout: [
        JSON.stringify({ type: "system", subtype: "init" }),
        JSON.stringify({
          type: "assistant",
          message: {
            content: [{ type: "text", text: "The circuit is a divider." }],
          },
        }),
        JSON.stringify({
          type: "message",
          content: "VOUT is 2.5 V.",
        }),
        JSON.stringify({ type: "result", result: "VOUT is 2.5 V." }),
      ].join("\n"),
      stderr: "",
      exitCode: 0,
    })

    expect(result.status).toBe("success")
    expect(result.events).toHaveLength(4)
    expect(result.text).toContain("The circuit is a divider.")
    expect(result.text).toContain("VOUT is 2.5 V.")
    expect(result.parseErrors).toEqual([])
  })

  it("retains plain output and diagnoses mixed malformed stream lines", () => {
    const result = normalizeProcessResult({
      stdout: [
        "warning from the CLI",
        JSON.stringify({ response: "The model stopped early." }),
        "not-json",
      ].join("\n"),
      stderr: "diagnostic",
      exitCode: 0,
    })

    expect(result.text).toContain("warning from the CLI")
    expect(result.text).toContain("The model stopped early.")
    expect(result.parseErrors).toEqual([
      "Line 1 is not valid JSON.",
      "Line 3 is not valid JSON.",
    ])
  })

  it("distinguishes timeout and nonzero process failures", () => {
    expect(
      normalizeProcessResult({
        stdout: "",
        stderr: "timed out",
        exitCode: null,
        signal: "SIGTERM",
        timedOut: true,
      }),
    ).toMatchObject({ status: "timed_out", ok: false, timedOut: true })
    expect(
      normalizeProcessResult({
        stdout: "",
        stderr: "failed",
        exitCode: 2,
      }),
    ).toMatchObject({ status: "failed", ok: false, timedOut: false })
  })

  it("captures and times out client processes without a shell", async () => {
    const base = {
      client: "pi" as const,
      command: process.execPath,
      cwd: undefined,
      maxAttempts: 1 as const,
      outputFormat: "json" as const,
      mcpServer: { name: "circuit-sim", url: request.mcpUrl },
      inlineMcpConfig: undefined,
      requiredMcpConfig: undefined,
    }
    const completed = await Effect.runPromise(
      captureProcess({
        ...base,
        args: ["-e", 'process.stdout.write("captured")'],
        timeoutMs: 5_000,
      }),
    )
    const stdinPayload = "judge evidence ".repeat(20_000)
    const piped = await Effect.runPromise(
      captureProcess({
        ...base,
        args: [
          "-e",
          'let value = ""; process.stdin.setEncoding("utf8"); process.stdin.on("data", (chunk) => value += chunk); process.stdin.on("end", () => process.stdout.write(String(value.length)))',
        ],
        stdin: stdinPayload,
        timeoutMs: 5_000,
      }),
    )
    const timedOut = await Effect.runPromise(
      captureProcess({
        ...base,
        args: ["-e", "setInterval(() => {}, 1000)"],
        timeoutMs: 30,
      }),
    )

    expect(completed).toMatchObject({ exitCode: 0, stdout: "captured" })
    expect(piped).toMatchObject({
      exitCode: 0,
      stdout: String(stdinPayload.length),
    })
    expect(timedOut).toMatchObject({ timedOut: true, signal: "SIGTERM" })
  })

  it("rejects unsafe MCP URLs and invalid execution settings", () => {
    expect(() =>
      prepareClaudeCodeInvocation({
        ...request,
        mcpUrl: "https://example.test/mcp?token=secret",
      }),
    ).toThrow(/must not contain credentials/)
    expect(() =>
      prepareGeminiCliInvocation(request, { timeoutMs: 0 }),
    ).toThrow(/timeout must be a positive/)
    expect(() =>
      createClaudeCodeAdapter({ mcpServerName: "not valid" }),
    ).toThrow(/MCP server name/)
    expect(() => createGeminiCliAdapter({ command: " " })).toThrow(
      /command cannot be blank/,
    )
    expect(() =>
      prepareGeminiCliInvocation(request, {
        mcpServerName: "unsafe_server",
      }),
    ).toThrow(/cannot contain underscores/)
  })

  it("extracts only the final assistant answer from a streamed transcript", () => {
    const result = normalizeProcessResult({
      stdout: [
        JSON.stringify({
          type: "message_end",
          message: { role: "user", content: "hidden benchmark prompt" },
        }),
        JSON.stringify({ type: "tool_result", text: "hidden tool evidence" }),
        JSON.stringify({
          type: "message_end",
          message: { role: "assistant", content: "intermediate answer" },
        }),
        JSON.stringify({
          type: "message_end",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "final supported answer" }],
          },
        }),
      ].join("\n"),
      stderr: "",
      exitCode: 0,
    })

    expect(result.text).toContain("hidden benchmark prompt")
    expect(result.text).toContain("hidden tool evidence")
    expect(finalAssistantText(result)).toBe("final supported answer")
  })
})
