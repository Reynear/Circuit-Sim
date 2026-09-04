import { Effect, Result } from "effect"
import { describe, expect, it } from "vitest"
import {
  MAX_SCHEMATIC_PNG_BYTES,
  SchematicPngTooLarge,
  SchematicRasterizationFailed,
  rasterizeSchematicPng,
  validateRasterizedPng,
} from "@/server/mcp/schematic-png-rasterizer.server"

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><rect width="120" height="80" fill="#101820"/><circle cx="60" cy="40" r="20" fill="#7dd3a7"/></svg>`

describe("server schematic PNG rasterizer", () => {
  it("returns a valid PNG with the source dimensions", () => {
    const output = Effect.runSync(rasterizeSchematicPng(svg))
    const bytes = Buffer.from(output.pngBase64, "base64")

    expect(bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    expect(output.width).toBe(120)
    expect(output.height).toBe(80)
    expect(output.byteLength).toBe(bytes.byteLength)
  })

  it("supports bounded deterministic fit options", () => {
    const output = Effect.runSync(
      rasterizeSchematicPng(svg, {
        fitTo: { _tag: "width", value: 240 },
        background: "#ffffff",
        loadSystemFonts: false,
      }),
    )
    expect(output.width).toBe(240)
    expect(output.height).toBe(160)
  })

  it("renders schematic labels when the production font path is enabled", () => {
    const blank = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" fill="#fff"/></svg>`
    const labeled = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" fill="#fff"/><text x="12" y="48" font-family="DejaVu Sans, sans-serif" font-size="28" fill="#162536">R1 1k VOUT</text></svg>`
    const options = { loadSystemFonts: true, background: "#ffffff" } as const
    const blankPng = Effect.runSync(rasterizeSchematicPng(blank, options))
    const labeledPng = Effect.runSync(rasterizeSchematicPng(labeled, options))

    expect(labeledPng.pngBase64).not.toBe(blankPng.pngBase64)
    expect(labeledPng.byteLength).toBeGreaterThan(blankPng.byteLength)
  })

  it("maps malformed SVG and invalid options to a tagged renderer failure", () => {
    const malformed = rasterizeSchematicPng("<svg>")
    expect(() => Effect.runSync(malformed)).toThrow(SchematicRasterizationFailed)

    const invalidOptions = rasterizeSchematicPng(svg, {
      fitTo: { _tag: "width", value: 240 },
      // Deliberately exercise the untrusted boundary without weakening the public type.
      ...({ unsupported: true } as unknown as Record<string, unknown>),
    })
    expect(() => Effect.runSync(invalidOptions)).toThrow(SchematicRasterizationFailed)
  })

  it("rejects output over the conservative byte ceiling before encoding it", () => {
    const oversized = validateRasterizedPng(
      Buffer.alloc(MAX_SCHEMATIC_PNG_BYTES + 1),
      1,
      1,
    )
    expect(Result.isFailure(oversized)).toBe(true)
    if (Result.isFailure(oversized)) {
      expect(oversized.failure).toBeInstanceOf(SchematicPngTooLarge)
      expect(oversized.failure._tag).toBe("SchematicPngTooLarge")
    }
  })

  it("rejects invalid signatures and dimensions at the output boundary", () => {
    const invalidSignature = validateRasterizedPng(Buffer.alloc(32), 10, 10)
    expect(Result.isFailure(invalidSignature)).toBe(true)
    if (Result.isFailure(invalidSignature)) {
      expect(invalidSignature.failure._tag).toBe("SchematicRasterizationFailed")
    }

    const validHeader = Buffer.alloc(32)
    validHeader.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const invalidDimensions = validateRasterizedPng(validHeader, 0, 10)
    expect(Result.isFailure(invalidDimensions)).toBe(true)
  })
})
