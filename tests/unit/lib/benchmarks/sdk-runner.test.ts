import { describe, expect, it } from "vitest"
import {
  callWithPilotRateLimitRetry,
  pilotRateLimitRetryMillis,
  traceSignalNameChunks,
} from "../../../../benchmarks/sdk-runner"

describe("SDK benchmark rate-limit pacing", () => {
  it("retries the typed pilot rate limit after the published delay", async () => {
    let attempts = 0
    const delays: number[] = []
    const result = await callWithPilotRateLimitRetry(
      async () => {
        attempts += 1
        if (attempts === 1) {
          throw new Error(
            'Error POSTing to endpoint: {"error":{"code":-32029,"data":{"retryAfterSeconds":2}}}',
          )
        }
        return "ok"
      },
      async (milliseconds) => {
        delays.push(milliseconds)
      },
    )

    expect(result).toBe("ok")
    expect(attempts).toBe(2)
    expect(delays).toEqual([2_100])
  })

  it("does not retry unrelated transport failures or malformed delays", () => {
    expect(pilotRateLimitRetryMillis(new Error("connection refused")))
      .toBeUndefined()
    expect(pilotRateLimitRetryMillis(new Error('{"code":-32029}')))
      .toBeUndefined()
  })

  it("chunks trace signals at the MCP boundary without changing their order", () => {
    const signals = Array.from({ length: 18 }, (_, index) => `V(N${index})`)

    expect(traceSignalNameChunks(signals)).toEqual([
      signals.slice(0, 8),
      signals.slice(8, 16),
      signals.slice(16),
    ])
    expect(traceSignalNameChunks([])).toEqual([])
  })
})
