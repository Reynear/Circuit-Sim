import { Schema } from "effect"
import { IdSchema, newId } from "@circuit-sim/core/ids"

describe("IDs", () => {
  it("creates unique UUIDs", () => {
    const first = newId()
    const second = newId()

    expect(first).not.toBe(second)
    expect(() => Schema.decodeUnknownSync(IdSchema)(first)).not.toThrow()
  })
})
