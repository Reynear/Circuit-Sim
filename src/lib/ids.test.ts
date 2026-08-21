import { createId, hasPrefix } from "./ids"

describe("ids", () => {
  it("creates prefixed IDs", () => {
    expect(hasPrefix(createId("sym"), "sym")).toBe(true)
  })

  it("creates unique IDs", () => {
    expect(createId("wire")).not.toBe(createId("wire"))
  })
})
