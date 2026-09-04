import { createFileRoute } from "@tanstack/react-router"
import { handleMissingMcpProtectedResourceMetadata } from "@/server/mcp/oauth-protected-resource.server"

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  server: {
    handlers: {
      GET: () => handleMissingMcpProtectedResourceMetadata(),
    },
  },
})
