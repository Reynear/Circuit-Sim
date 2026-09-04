import { Data, Effect, Result, Schema } from "effect"
import { Resvg, type ResvgRenderOptions } from "@resvg/resvg-js"

/** Keep inline MCP images small enough for conservative host/message limits. */
export const MAX_SCHEMATIC_PNG_BYTES = 4_500_000
export const MAX_SCHEMATIC_SVG_BYTES = 8_000_000
export const MAX_SCHEMATIC_OUTPUT_DIMENSION = 4_096

const DimensionSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(MAX_SCHEMATIC_OUTPUT_DIMENSION),
)

const FitToSchema = Schema.Union([
  Schema.TaggedStruct("original", {}),
  Schema.TaggedStruct("width", { value: DimensionSchema }),
  Schema.TaggedStruct("height", { value: DimensionSchema }),
  Schema.TaggedStruct("zoom", { value: Schema.Number.check(Schema.isGreaterThan(0)) }),
])

/** The intentionally small option surface exposed by the server rasterizer. */
export const SchematicPngRasterizeOptionsSchema = Schema.Struct({
  fitTo: Schema.optionalKey(FitToSchema),
  background: Schema.optionalKey(Schema.NonEmptyString.check(Schema.isMaxLength(64))),
  loadSystemFonts: Schema.optionalKey(Schema.Boolean),
})
export type SchematicPngRasterizeOptions = typeof SchematicPngRasterizeOptionsSchema.Type

export class SchematicRasterizationFailed extends Data.TaggedError(
  "SchematicRasterizationFailed",
)<{
  readonly reason: string
}> {}

export class SchematicPngTooLarge extends Data.TaggedError(
  "SchematicPngTooLarge",
)<{
  readonly byteLength: number
  readonly maxBytes: number
}> {}

export type RasterizedSchematicPng = {
  readonly pngBase64: string
  readonly width: number
  readonly height: number
  readonly byteLength: number
}

const describeCause = (cause: unknown): string =>
  cause instanceof Error && cause.message.length > 0
    ? cause.message
    : "the SVG renderer rejected the schematic"

const isRecord = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null

const unexpectedKeys = (
  value: unknown,
  allowed: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  if (!isRecord(value)) return []
  const allowedSet = new Set(allowed)
  return Object.keys(value).filter((key) => !allowedSet.has(key))
}

const toResvgOptions = (
  options: SchematicPngRasterizeOptions,
): ResvgRenderOptions => {
  const fitTo = options.fitTo
  const mappedFitTo =
    fitTo === undefined
      ? undefined
      : fitTo._tag === "original"
        ? { mode: "original" as const }
        : { mode: fitTo._tag, value: fitTo.value }
  return {
    ...(mappedFitTo === undefined ? {} : { fitTo: mappedFitTo }),
    ...(options.background === undefined ? {} : { background: options.background }),
    font: {
      loadSystemFonts: options.loadSystemFonts ?? false,
      defaultFontFamily: "DejaVu Sans",
      sansSerifFamily: "DejaVu Sans",
      monospaceFamily: "DejaVu Sans Mono",
    },
    logLevel: "off",
  }
}

const decodeOptions = (
  value: SchematicPngRasterizeOptions | undefined,
): Result.Result<SchematicPngRasterizeOptions, SchematicRasterizationFailed> => {
  const candidate: unknown = value ?? {}
  const keys = unexpectedKeys(candidate, ["fitTo", "background", "loadSystemFonts"])
  if (keys.length > 0) {
    return Result.fail(
      new SchematicRasterizationFailed({
        reason: `unexpected rasterizer option(s): ${keys.join(", ")}`,
      }),
    )
  }
  const decoded = Schema.decodeUnknownResult(SchematicPngRasterizeOptionsSchema)(candidate)
  return Result.isFailure(decoded)
    ? Result.fail(
        new SchematicRasterizationFailed({
          reason: "rasterizer options failed schema validation",
        }),
      )
    : Result.succeed(decoded.success)
}

const hasPngSignature = (bytes: Buffer): boolean =>
  bytes.length >= 8 &&
  bytes[0] === 0x89 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x4e &&
  bytes[3] === 0x47 &&
  bytes[4] === 0x0d &&
  bytes[5] === 0x0a &&
  bytes[6] === 0x1a &&
  bytes[7] === 0x0a

/** Validate renderer bytes before they become an MCP image content block. */
export const validateRasterizedPng = (
  png: Buffer,
  width: number,
  height: number,
): Result.Result<RasterizedSchematicPng, SchematicRasterizationFailed | SchematicPngTooLarge> => {
  if (png.byteLength > MAX_SCHEMATIC_PNG_BYTES) {
    return Result.fail(
      new SchematicPngTooLarge({
        byteLength: png.byteLength,
        maxBytes: MAX_SCHEMATIC_PNG_BYTES,
      }),
    )
  }
  if (!hasPngSignature(png)) {
    return Result.fail(
      new SchematicRasterizationFailed({ reason: "SVG renderer returned invalid PNG data" }),
    )
  }
  if (
    width < 1 ||
    height < 1 ||
    width > MAX_SCHEMATIC_OUTPUT_DIMENSION ||
    height > MAX_SCHEMATIC_OUTPUT_DIMENSION
  ) {
    return Result.fail(
      new SchematicRasterizationFailed({ reason: "rendered PNG dimensions are outside the limit" }),
    )
  }
  return Result.succeed({
    pngBase64: png.toString("base64"),
    width,
    height,
    byteLength: png.byteLength,
  })
}

/**
 * Rasterize a standalone server-rendered SVG at the MCP boundary.
 * Third-party renderer exceptions are converted immediately into a tagged
 * failure; oversized output never gets base64 encoded or returned.
 */
export const rasterizeSchematicPng = (
  svg: string,
  options?: SchematicPngRasterizeOptions,
): Effect.Effect<RasterizedSchematicPng, SchematicRasterizationFailed | SchematicPngTooLarge> =>
  Effect.gen(function* () {
    if (svg.length === 0) {
      return yield* Effect.fail(
        new SchematicRasterizationFailed({ reason: "SVG source must not be empty" }),
      )
    }
    if (Buffer.byteLength(svg, "utf8") > MAX_SCHEMATIC_SVG_BYTES) {
      return yield* Effect.fail(
        new SchematicRasterizationFailed({ reason: "SVG source exceeds the input size limit" }),
      )
    }
    const parsedOptions = decodeOptions(options)
    if (Result.isFailure(parsedOptions)) return yield* Effect.fail(parsedOptions.failure)

    const rendered = yield* Effect.try({
      try: () => {
        const resvg = new Resvg(svg, toResvgOptions(parsedOptions.success))
        return resvg.render().asPng()
      },
      catch: (cause) =>
        new SchematicRasterizationFailed({ reason: describeCause(cause) }),
    })
    if (rendered.byteLength < 24) {
      return yield* Effect.fail(
        new SchematicRasterizationFailed({ reason: "SVG renderer returned truncated PNG data" }),
      )
    }
    const width = rendered.readUInt32BE(16)
    const height = rendered.readUInt32BE(20)
    const validated = validateRasterizedPng(rendered, width, height)
    if (Result.isFailure(validated)) return yield* Effect.fail(validated.failure)
    return validated.success
  })
