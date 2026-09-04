import { Data, Effect, Result, Schema } from "effect"
import type { CallToolResult } from "@modelcontextprotocol/server"
import { IdSchema } from "@circuit-sim/core/ids"

/** The largest rendered PNG accepted by the MCP visual contract (about 4.5 MiB). */
export const MAX_SCHEMATIC_PNG_BASE64_LENGTH = 6_000_000
export const MAX_FOCUS_IDS = 24
export const MAX_NET_ID_LENGTH = 72
export const MAX_RESOURCE_URI_LENGTH = 2_048

export const SchematicNetIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(MAX_NET_ID_LENGTH),
  Schema.isPattern(/^[A-Za-z0-9_:-]+$/),
)

const FocusIdsSchema = Schema.Array(IdSchema).check(
  Schema.isMaxLength(MAX_FOCUS_IDS),
  Schema.isUnique(),
)

const FocusNetIdsSchema = Schema.Array(SchematicNetIdSchema).check(
  Schema.isMaxLength(MAX_FOCUS_IDS),
  Schema.isUnique(),
)

/** A bounded, explicit focus selection for visual highlighting. */
export const SchematicFocusSchema = Schema.Struct({
  objectIds: Schema.optionalKey(FocusIdsSchema),
  netIds: Schema.optionalKey(FocusNetIdsSchema),
}).check(
  Schema.makeFilter(
    (focus) =>
      (focus.objectIds?.length ?? 0) + (focus.netIds?.length ?? 0) > 0
        ? (focus.objectIds?.length ?? 0) + (focus.netIds?.length ?? 0) <= MAX_FOCUS_IDS
          ? undefined
          : `focus supports at most ${MAX_FOCUS_IDS} combined object and net IDs`
        : "focus must select at least one object or net",
  ),
)
export type SchematicFocus = typeof SchematicFocusSchema.Type

/** Input for the dedicated read-only render_schematic MCP tool. */
export const RenderSchematicInputSchema = Schema.Struct({
  projectId: IdSchema,
  snapshotId: Schema.optionalKey(IdSchema),
  focus: Schema.optionalKey(SchematicFocusSchema),
})
export type RenderSchematicInput = typeof RenderSchematicInputSchema.Type

/** Identity metadata that pins an image to one exact saved circuit snapshot. */
export const SchematicSnapshotMetadataSchema = Schema.Struct({
  projectId: IdSchema,
  snapshotId: IdSchema,
  circuitHash: Schema.NonEmptyString.check(Schema.isMaxLength(256)),
})
export type SchematicSnapshotMetadata = typeof SchematicSnapshotMetadataSchema.Type

const PngBase64Schema = Schema.NonEmptyString.check(
  Schema.isMaxLength(MAX_SCHEMATIC_PNG_BASE64_LENGTH),
  Schema.isPattern(/^[A-Za-z0-9+/]*={0,2}$/),
  Schema.makeFilter((encoded) => {
    const signature = Buffer.from(encoded.slice(0, 16), "base64")
    return signature.length >= 8 &&
      signature[0] === 0x89 &&
      signature[1] === 0x50 &&
      signature[2] === 0x4e &&
      signature[3] === 0x47 &&
      signature[4] === 0x0d &&
      signature[5] === 0x0a &&
      signature[6] === 0x1a &&
      signature[7] === 0x0a
      ? undefined
      : "image data must have a PNG signature"
  }),
)

const ResourceUriSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(MAX_RESOURCE_URI_LENGTH),
)

const DimensionSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(4_096),
)

const VisualWarningsSchema = Schema.Array(
  Schema.NonEmptyString.check(Schema.isMaxLength(512)),
).check(Schema.isMaxLength(64))

/** Metadata consumed by both the model-readable fallback and the MCP App view. */
export const SchematicVisualMetadataSchema = Schema.Struct({
  kind: Schema.Literal("schematic"),
  mimeType: Schema.Literal("image/svg+xml"),
  caption: Schema.NonEmptyString.check(Schema.isMaxLength(256)),
  alt: Schema.NonEmptyString.check(Schema.isMaxLength(512)),
  dimensions: Schema.optionalKey(
    Schema.Struct({ width: DimensionSchema, height: DimensionSchema }),
  ),
  uri: ResourceUriSchema,
  browserUrl: Schema.optionalKey(ResourceUriSchema),
  currentProjectUrl: Schema.optionalKey(ResourceUriSchema),
  snapshot: SchematicSnapshotMetadataSchema,
  focus: Schema.NonEmptyString.check(Schema.isMaxLength(MAX_RESOURCE_URI_LENGTH)),
  warnings: Schema.optionalKey(VisualWarningsSchema),
  ercWarnings: Schema.optionalKey(VisualWarningsSchema),
})
export type SchematicVisualMetadata = typeof SchematicVisualMetadataSchema.Type

/** Exact structured result advertised by render_schematic. */
export const RenderSchematicOutputSchema = Schema.Struct({
  visuals: Schema.Array(SchematicVisualMetadataSchema).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(1),
  ),
  snapshot: SchematicSnapshotMetadataSchema,
})
export type RenderSchematicOutput = typeof RenderSchematicOutputSchema.Type

/** Already-rendered visual data supplied by the server-side renderer. */
export const RenderedSchematicSchema = Schema.Struct({
  snapshot: SchematicSnapshotMetadataSchema,
  pngBase64: Schema.optionalKey(PngBase64Schema),
  svgResourceUri: Schema.optionalKey(ResourceUriSchema),
  browserUrl: Schema.optionalKey(ResourceUriSchema),
  currentProjectUrl: Schema.optionalKey(ResourceUriSchema),
  width: Schema.optionalKey(DimensionSchema),
  height: Schema.optionalKey(DimensionSchema),
  caption: Schema.optionalKey(Schema.NonEmptyString.check(Schema.isMaxLength(256))),
  alt: Schema.optionalKey(Schema.NonEmptyString.check(Schema.isMaxLength(512))),
  warnings: Schema.optionalKey(VisualWarningsSchema),
  ercWarnings: Schema.optionalKey(VisualWarningsSchema),
})
export type RenderedSchematic = typeof RenderedSchematicSchema.Type

export class RenderSchematicInputError extends Data.TaggedError(
  "RenderSchematicInputError",
)<{
  readonly reason: string
}> {}

export class RenderSchematicContractError extends Data.TaggedError(
  "RenderSchematicContractError",
)<{
  readonly reason: string
}> {}

export class SchematicFocusIdentityError extends Data.TaggedError(
  "SchematicFocusIdentityError",
)<{
  readonly reason: string
}> {}

const isRecord = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const unexpectedKeys = (
  value: unknown,
  allowed: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  if (!isRecord(value)) return []
  const allowedSet = new Set(allowed)
  return Object.keys(value).filter((key) => !allowedSet.has(key))
}

const schemaFailureReason = (value: unknown): string =>
  isRecord(value) && typeof value.message === "string"
    ? value.message
    : "value did not satisfy the visual contract schema"

const decodeStrict = <A, E>(
  value: unknown,
  schema: Schema.Codec<A, unknown, never, never>,
  allowed: ReadonlyArray<string>,
  error: (reason: string) => E,
): Result.Result<A, E> => {
  const keys = unexpectedKeys(value, allowed)
  if (keys.length > 0) {
    return Result.fail(error(`unexpected field(s): ${keys.join(", ")}`))
  }
  const decoded = Schema.decodeUnknownResult(schema)(value)
  return Result.isFailure(decoded)
    ? Result.fail(error(schemaFailureReason(decoded.failure)))
    : Result.succeed(decoded.success)
}

/** Decode untrusted tool input without Effect Schema's default unknown-key stripping. */
export const decodeRenderSchematicInput = (
  value: unknown,
): Result.Result<RenderSchematicInput, RenderSchematicInputError> => {
  const topLevel = unexpectedKeys(value, ["projectId", "snapshotId", "focus"])
  if (topLevel.length > 0) {
    return Result.fail(
      new RenderSchematicInputError({
        reason: `unexpected field(s): ${topLevel.join(", ")}`,
      }),
    )
  }
  if (isRecord(value) && "focus" in value && value.focus !== undefined) {
    const focusKeys = unexpectedKeys(value.focus, ["objectIds", "netIds"])
    if (focusKeys.length > 0) {
      return Result.fail(
        new RenderSchematicInputError({
          reason: `unexpected focus field(s): ${focusKeys.join(", ")}`,
        }),
      )
    }
  }
  const decoded = Schema.decodeUnknownResult(RenderSchematicInputSchema)(value)
  return Result.isFailure(decoded)
    ? Result.fail(new RenderSchematicInputError({ reason: schemaFailureReason(decoded.failure) }))
    : Result.succeed(decoded.success)
}

/** Stable identity for the requested highlighting set. */
export const schematicFocusIdentity = (focus: SchematicFocus | undefined): string => {
  if (focus === undefined) return "all"
  const objects = [...(focus.objectIds ?? [])].sort().join(".") || "-"
  const nets = [...(focus.netIds ?? [])].sort().join(".") || "-"
  return `objects-${objects}~nets-${nets}`
}

/** Reconstruct a validated focus group from the self-describing resource key. */
export const decodeSchematicFocusIdentity = (
  identity: string,
): Result.Result<SchematicFocus | undefined, SchematicFocusIdentityError> => {
  if (identity === "all") return Result.succeed(undefined)
  const match = /^objects-([^~]+)~nets-([^~]+)$/.exec(identity)
  if (!match) {
    return Result.fail(
      new SchematicFocusIdentityError({ reason: "invalid schematic focus identity" }),
    )
  }
  const objectIds = match[1] === "-" ? [] : match[1]!.split(".")
  const netIds = match[2] === "-" ? [] : match[2]!.split(".")
  const decoded = Schema.decodeUnknownResult(SchematicFocusSchema)({
    ...(objectIds.length === 0 ? {} : { objectIds }),
    ...(netIds.length === 0 ? {} : { netIds }),
  })
  return Result.isFailure(decoded)
    ? Result.fail(
        new SchematicFocusIdentityError({ reason: schemaFailureReason(decoded.failure) }),
      )
    : Result.succeed(decoded.success)
}

/** Deterministic pinned URI for the SVG representation of one visual snapshot. */
export const schematicResourceUri = (
  metadata: SchematicSnapshotMetadata,
  focus: SchematicFocus | undefined,
): string =>
  `circuit-sim://projects/${metadata.projectId}/snapshots/${metadata.snapshotId}/schematic/${metadata.circuitHash}/${schematicFocusIdentity(focus)}.svg`

export type RenderSchematicResultInput = {
  readonly request: RenderSchematicInput
  readonly rendered: unknown
}

const textContent = (text: string): CallToolResult["content"][number] => ({
  type: "text",
  text,
})

const validateRendered = (
  request: RenderSchematicInput,
  value: unknown,
): Result.Result<RenderedSchematic, RenderSchematicContractError> => {
  if (isRecord(value) && "snapshot" in value) {
    const snapshotKeys = unexpectedKeys(value.snapshot, [
      "projectId",
      "snapshotId",
      "circuitHash",
    ])
    if (snapshotKeys.length > 0) {
      return Result.fail(
        new RenderSchematicContractError({
          reason: `unexpected snapshot field(s): ${snapshotKeys.join(", ")}`,
        }),
      )
    }
  }
  const decoded = decodeStrict(
    value,
    RenderedSchematicSchema,
    [
      "snapshot",
      "pngBase64",
      "svgResourceUri",
      "browserUrl",
      "currentProjectUrl",
      "width",
      "height",
      "caption",
      "alt",
      "warnings",
      "ercWarnings",
    ],
    (reason) => new RenderSchematicContractError({ reason }),
  )
  if (Result.isFailure(decoded)) return decoded

  const rendered = decoded.success
  const decodedSnapshot = Schema.decodeUnknownResult(
    SchematicSnapshotMetadataSchema,
  )(rendered.snapshot)
  if (Result.isFailure(decodedSnapshot)) {
    return Result.fail(
      new RenderSchematicContractError({
        reason: schemaFailureReason(decodedSnapshot.failure),
      }),
    )
  }
  const snapshot = decodedSnapshot.success
  if (snapshot.projectId !== request.projectId) {
    return Result.fail(
      new RenderSchematicContractError({
        reason: "rendered snapshot does not belong to requested project",
      }),
    )
  }
  if (request.snapshotId !== undefined && snapshot.snapshotId !== request.snapshotId) {
    return Result.fail(
      new RenderSchematicContractError({
        reason: "rendered snapshot does not match requested snapshotId",
      }),
    )
  }
  if (rendered.width === undefined !== (rendered.height === undefined)) {
    return Result.fail(
      new RenderSchematicContractError({
        reason: "width and height must be supplied together",
      }),
    )
  }
  if (
    rendered.pngBase64 === undefined &&
    rendered.svgResourceUri === undefined &&
    rendered.browserUrl === undefined
  ) {
    return Result.fail(
      new RenderSchematicContractError({
        reason: "a PNG, pinned SVG resource URI, or browser URL is required",
      }),
    )
  }
  const expectedUri = schematicResourceUri(snapshot, request.focus)
  if (
    rendered.svgResourceUri !== undefined &&
    rendered.svgResourceUri !== expectedUri
  ) {
    return Result.fail(
      new RenderSchematicContractError({
        reason: "svgResourceUri must be the deterministic pinned schematic URI",
      }),
    )
  }
  return Result.succeed(rendered)
}

/**
 * Build the portable MCP result. Some chat hosts reject tool responses that
 * contain image content, so the tool result stays text-only and publishes the
 * pinned visual through structured metadata, the browser URL, and the
 * registered SVG resource template.
 */
export const buildRenderSchematicResult = ({
  request,
  rendered,
}: RenderSchematicResultInput): Effect.Effect<
  CallToolResult,
  RenderSchematicContractError | RenderSchematicInputError
> =>
  Effect.gen(function* () {
    const parsedRequest = decodeRenderSchematicInput(request)
    if (Result.isFailure(parsedRequest)) return yield* Effect.fail(parsedRequest.failure)

    const parsedRendered = validateRendered(parsedRequest.success, rendered)
    if (Result.isFailure(parsedRendered)) return yield* Effect.fail(parsedRendered.failure)

    const input = parsedRequest.success
    const artifact = parsedRendered.success
    const uri = schematicResourceUri(artifact.snapshot, input.focus)
    const caption = artifact.caption ?? "Circuit schematic"
    const alt = artifact.alt ?? `${caption} for circuit ${artifact.snapshot.circuitHash}`
    const dimensions =
      artifact.width !== undefined && artifact.height !== undefined
        ? { width: artifact.width, height: artifact.height }
        : undefined
    const metadata: SchematicVisualMetadata = {
      kind: "schematic",
      mimeType: "image/svg+xml",
      caption,
      alt,
      ...(dimensions === undefined ? {} : { dimensions }),
      uri,
      ...(artifact.browserUrl === undefined ? {} : { browserUrl: artifact.browserUrl }),
      ...(artifact.currentProjectUrl === undefined
        ? {}
        : { currentProjectUrl: artifact.currentProjectUrl }),
      snapshot: artifact.snapshot,
      focus: schematicFocusIdentity(input.focus),
      ...(artifact.warnings === undefined ? {} : { warnings: artifact.warnings }),
      ...(artifact.ercWarnings === undefined ? {} : { ercWarnings: artifact.ercWarnings }),
    }
    const location = artifact.browserUrl ?? uri
    const current = artifact.currentProjectUrl === undefined
      ? ""
      : ` Current project: ${artifact.currentProjectUrl}`
    const warningText = [
      ...(artifact.warnings ?? []),
      ...(artifact.ercWarnings ?? []).map((warning) => `ERC: ${warning}`),
    ]
    const warnings = warningText.length === 0
      ? ""
      : ` Warnings: ${warningText.join("; ")}.`
    const text = `${caption}. Snapshot ${artifact.snapshot.snapshotId}; circuit ${artifact.snapshot.circuitHash}. View pinned snapshot: ${location}.${current}${warnings}`
    return {
      content: [textContent(text)],
      structuredContent: {
        visuals: [metadata],
        snapshot: artifact.snapshot,
      },
    }
  })
