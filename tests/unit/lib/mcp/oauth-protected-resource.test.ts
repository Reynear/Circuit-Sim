import { describe, expect, it } from "vitest"
import { handleMissingMcpProtectedResourceMetadata } from "@/server/mcp/oauth-protected-resource.server"

describe("MCP OAuth protected-resource discovery", () => {
  it("reports that the local unauthenticated MCP server does not advertise OAuth", async () => {
    const response = handleMissingMcpProtectedResourceMetadata()

    expect(response.status).toBe(404)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.text()).toBe("")
  })
})
