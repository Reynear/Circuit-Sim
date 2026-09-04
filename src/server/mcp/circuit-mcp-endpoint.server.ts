import {
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  originValidationResponse,
} from "@modelcontextprotocol/server"
import { createCircuitMcpHandler } from "./circuit-mcp.server"
import { circuitAgentRuntime } from "./circuit-mcp-runtime.server"
import {
  CircuitMcpRateLimiter,
  rateLimitCircuitMcpRequest,
} from "./circuit-mcp-rate-limit.server"

const handler = createCircuitMcpHandler(circuitAgentRuntime)
const rateLimiter = new CircuitMcpRateLimiter()

export async function handleCircuitMcpRequest(
  request: Request,
): Promise<Response> {
  const rejected =
    hostHeaderValidationResponse(request, allowedHostnames()) ??
    originValidationResponse(request, allowedOriginHostnames())
  if (rejected) {
    return rejected
  }

  return (
    (await rateLimitCircuitMcpRequest(request, rateLimiter)) ??
    handler.fetch(request)
  )
}

export function allowedHostnames(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  return configuredHostnames(
    environment.CIRCUIT_SIM_ALLOWED_HOSTNAMES,
    localhostAllowedHostnames(),
  )
}

export function allowedOriginHostnames(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  return configuredHostnames(
    environment.CIRCUIT_SIM_ALLOWED_ORIGIN_HOSTNAMES ??
      environment.CIRCUIT_SIM_ALLOWED_HOSTNAMES,
    localhostAllowedOrigins(),
  )
}

function configuredHostnames(
  value: string | undefined,
  fallback: string[],
): string[] {
  const configured = value
    ?.split(",")
    .map((hostname) => hostname.trim())
    .filter((hostname) => hostname.length > 0)
  return configured && configured.length > 0 ? configured : fallback
}
