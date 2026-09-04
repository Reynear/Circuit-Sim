import { createFileRoute } from "@tanstack/react-router"
import { handleCircuitMcpRequest } from "@/server/mcp/circuit-mcp-endpoint.server"

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: ({ request }) => handleCircuitMcpRequest(request),
    },
  },
})
