import {
  DEFAULT_TEXT_SIZE,
  getTextSize,
  parseTextSize,
  splitTextLines,
  textLineY,
} from "@/browser/editor/text"

describe("schematic-text", () => {
  it("normalizes note text sizing and line layout", () => {
    expect(getTextSize({})).toBe(DEFAULT_TEXT_SIZE)
    expect(parseTextSize("18")).toBe(18)
    expect(parseTextSize("0")).toBe(DEFAULT_TEXT_SIZE)
    expect(textLineY(24, 2)).toBe(54)
    expect(splitTextLines("one\ntwo\r\nthree")).toEqual([
      "one",
      "two",
      "three",
    ])
  })
})
