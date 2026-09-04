import { describe, expect, it } from "vitest"
import {
  CircuitMcpRateLimiter,
  rateLimitCircuitMcpRequest,
  type CircuitMcpRateLimitConfig,
} from "@/server/mcp/circuit-mcp-rate-limit.server"

describe("Circuit MCP pilot rate limits", () => {
  it("applies tighter render limits per client without blocking inspection", async () => {
    let now = 1_000
    const limiter = new CircuitMcpRateLimiter(testConfig(), () => now)

    expect(
      await rateLimitCircuitMcpRequest(
        toolRequest("render_schematic", "198.51.100.1"),
        limiter,
      ),
    ).toBeUndefined()

    const limited = await rateLimitCircuitMcpRequest(
      toolRequest("render_schematic", "198.51.100.1"),
      limiter,
    )
    expect(limited?.status).toBe(429)
    expect(limited?.headers.get("retry-after")).toBe("10")
    expect(await limited?.json()).toMatchObject({
      error: {
        data: { bucket: "render", retryAfterSeconds: 10 },
      },
    })

    expect(
      await rateLimitCircuitMcpRequest(
        toolRequest("inspect_circuit", "198.51.100.1"),
        limiter,
      ),
    ).toBeUndefined()
    expect(
      await rateLimitCircuitMcpRequest(
        toolRequest("render_schematic", "198.51.100.2"),
        limiter,
      ),
    ).toBeUndefined()

    now += 10_000
    expect(
      await rateLimitCircuitMcpRequest(
        toolRequest("render_schematic", "198.51.100.1"),
        limiter,
      ),
    ).toBeUndefined()
  })

  it("counts MCP resource reads as rendering work", async () => {
    const limiter = new CircuitMcpRateLimiter(testConfig(), () => 1_000)
    const resourceRead = jsonRequest(
      { jsonrpc: "2.0", id: 1, method: "resources/read", params: {} },
      "203.0.113.4",
    )

    expect(
      await rateLimitCircuitMcpRequest(resourceRead, limiter),
    ).toBeUndefined()
    expect(
      (
        await rateLimitCircuitMcpRequest(
          resourceRead.clone(),
          limiter,
        )
      )?.status,
    ).toBe(429)
  })

  it("enforces a global ceiling across client keys", async () => {
    const config = testConfig()
    const limiter = new CircuitMcpRateLimiter(
      { ...config, global: { limit: 2, windowMillis: 10_000 } },
      () => 1_000,
    )

    expect(
      await rateLimitCircuitMcpRequest(
        toolRequest("inspect_circuit", "192.0.2.1"),
        limiter,
      ),
    ).toBeUndefined()
    expect(
      await rateLimitCircuitMcpRequest(
        toolRequest("inspect_circuit", "192.0.2.2"),
        limiter,
      ),
    ).toBeUndefined()
    expect(
      (
        await rateLimitCircuitMcpRequest(
          toolRequest("inspect_circuit", "192.0.2.3"),
          limiter,
        )
      )?.status,
    ).toBe(429)
  })
})

function testConfig(): CircuitMcpRateLimitConfig {
  return {
    global: { limit: 100, windowMillis: 10_000 },
    buckets: {
      inspect: { limit: 10, windowMillis: 10_000 },
      edit: { limit: 3, windowMillis: 10_000 },
      render: { limit: 1, windowMillis: 10_000 },
      simulate: { limit: 1, windowMillis: 10_000 },
    },
  }
}

function toolRequest(name: string, client: string): Request {
  return jsonRequest(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: {} },
    },
    client,
  )
}

function jsonRequest(payload: unknown, client: string): Request {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": client,
    },
    body: JSON.stringify(payload),
  })
}
