type RateLimitBucket =
  | "inspect"
  | "edit"
  | "render"
  | "simulate"

type RateLimitRule = {
  readonly limit: number
  readonly windowMillis: number
}

export type CircuitMcpRateLimitConfig = {
  readonly global: RateLimitRule
  readonly buckets: Readonly<Record<RateLimitBucket, RateLimitRule>>
}

export type CircuitMcpRateLimitDecision =
  | { readonly _tag: "Allowed" }
  | {
      readonly _tag: "Limited"
      readonly bucket: "global" | RateLimitBucket
      readonly retryAfterSeconds: number
    }

type WindowCounter = {
  readonly startedAt: number
  count: number
}

export const PILOT_RATE_LIMITS: CircuitMcpRateLimitConfig = {
  global: { limit: 600, windowMillis: 60_000 },
  buckets: {
    inspect: { limit: 180, windowMillis: 60_000 },
    edit: { limit: 60, windowMillis: 60_000 },
    render: { limit: 30, windowMillis: 60_000 },
    simulate: { limit: 30, windowMillis: 60_000 },
  },
}

export class CircuitMcpRateLimiter {
  readonly #counters = new Map<string, WindowCounter>()
  #checks = 0

  constructor(
    readonly config: CircuitMcpRateLimitConfig = PILOT_RATE_LIMITS,
    readonly now: () => number = Date.now,
  ) {}

  check(clientKey: string, bucket: RateLimitBucket): CircuitMcpRateLimitDecision {
    const now = this.now()
    this.#checks += 1
    if (this.#checks % 128 === 0) {
      this.#prune(now)
    }

    const global = this.#consume("global", this.config.global, now)
    if (global._tag === "Limited") {
      return global
    }

    return this.#consume(
      `${bucket}:${clientKey}`,
      this.config.buckets[bucket],
      now,
      bucket,
    )
  }

  #consume(
    key: string,
    rule: RateLimitRule,
    now: number,
    bucket: "global" | RateLimitBucket = "global",
  ): CircuitMcpRateLimitDecision {
    const current = this.#counters.get(key)
    if (!current || now - current.startedAt >= rule.windowMillis) {
      this.#counters.set(key, { startedAt: now, count: 1 })
      return { _tag: "Allowed" }
    }

    if (current.count >= rule.limit) {
      return {
        _tag: "Limited",
        bucket,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil(
            (rule.windowMillis - (now - current.startedAt)) / 1_000,
          ),
        ),
      }
    }

    current.count += 1
    return { _tag: "Allowed" }
  }

  #prune(now: number): void {
    const longestWindow = Math.max(
      this.config.global.windowMillis,
      ...Object.values(this.config.buckets).map(
        (rule) => rule.windowMillis,
      ),
    )
    for (const [key, counter] of this.#counters) {
      if (now - counter.startedAt >= longestWindow) {
        this.#counters.delete(key)
      }
    }
  }
}

export async function rateLimitCircuitMcpRequest(
  request: Request,
  limiter: CircuitMcpRateLimiter,
): Promise<Response | undefined> {
  const payload =
    request.method === "POST"
      ? await request.clone().json().catch(() => undefined)
      : undefined
  const decision = limiter.check(
    clientKeyForRequest(request),
    bucketForPayload(payload),
  )
  if (decision._tag === "Allowed") {
    return undefined
  }

  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32029,
        message: "Circuit Sim pilot rate limit exceeded.",
        data: {
          bucket: decision.bucket,
          retryAfterSeconds: decision.retryAfterSeconds,
        },
      },
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(decision.retryAfterSeconds),
      },
    },
  )
}

function bucketForPayload(payload: unknown): RateLimitBucket {
  if (!isRecord(payload)) {
    return "inspect"
  }
  if (payload.method === "resources/read") {
    return "render"
  }
  if (payload.method !== "tools/call" || !isRecord(payload.params)) {
    return "inspect"
  }

  switch (payload.params.name) {
    case "edit_circuit":
      return "edit"
    case "render_schematic":
      return "render"
    case "simulate_circuit":
      return "simulate"
    default:
      return "inspect"
  }
}

function clientKeyForRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const candidate =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    forwarded ??
    "unknown"
  return /^[A-Za-z0-9:.%-]{1,96}$/.test(candidate) ? candidate : "unknown"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
