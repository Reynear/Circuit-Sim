import { Data, Effect } from "effect"
import {
  AgentIdentity,
  AgentProjectRepository,
  getAgentProject,
  getAgentProjectSnapshot,
  type AgentProjectInspection,
  type AgentProjectRepositoryError,
} from "@circuit-sim/core/agent/project-workflow"
import type { ElectricalIssue } from "@circuit-sim/core/circuit/erc"
import {
  type RenderSchematicInput,
  type SchematicSnapshotMetadata,
  schematicFocusIdentity,
  schematicResourceUri,
} from "@/server/mcp/schematic-visual-contract.server"
import {
  rasterizeSchematicPng,
  type RasterizedSchematicPng,
  type SchematicPngTooLarge,
  type SchematicRasterizationFailed,
} from "@/server/mcp/schematic-png-rasterizer.server"
import {
  renderSchematic,
  type RenderSchematicError,
  type SchematicRenderWarning,
} from "./render-schematic.server"
import {
  schematicVisualCache,
  type SchematicVisualCache,
} from "./schematic-visual-cache.server"

export class SchematicErcBlocked extends Data.TaggedError(
  "SchematicErcBlocked",
)<{
  readonly projectId: string
  readonly snapshotId: string
  readonly issues: ReadonlyArray<ElectricalIssue>
}> {}

export class SchematicSnapshotHashMismatch extends Data.TaggedError(
  "SchematicSnapshotHashMismatch",
)<{
  readonly projectId: string
  readonly snapshotId: string
  readonly expectedCircuitHash: string
  readonly actualCircuitHash: string
}> {}

export class SchematicPublicUrlInvalid extends Data.TaggedError(
  "SchematicPublicUrlInvalid",
)<{
  readonly configuredUrl: string
}> {}

export type AgentSchematicRenderError =
  | AgentProjectRepositoryError
  | RenderSchematicError
  | SchematicRasterizationFailed
  | SchematicPngTooLarge
  | SchematicErcBlocked
  | SchematicSnapshotHashMismatch
  | SchematicPublicUrlInvalid

export type AgentSchematicSvg = {
  readonly request: RenderSchematicInput
  readonly projectName: string
  readonly projectVersion: number
  readonly snapshot: SchematicSnapshotMetadata
  readonly svgResourceUri: string
  readonly browserUrl: string
  readonly currentProjectUrl: string
  readonly caption: string
  readonly alt: string
  readonly svg: string
  readonly sourceWidth: number
  readonly sourceHeight: number
  readonly warnings: ReadonlyArray<SchematicRenderWarning>
  readonly ercWarnings: ReadonlyArray<string>
}

export type AgentSchematicVisual = AgentSchematicSvg & {
  readonly png: RasterizedSchematicPng
}

type RenderDependencies = {
  readonly expectedCircuitHash?: string
  readonly cache?: SchematicVisualCache
  readonly publicUrl?: string
}

/** Resolve and render one exact immutable CircuitProject snapshot as SVG. */
export function renderAgentSchematicSvg(
  request: RenderSchematicInput,
  dependencies: RenderDependencies = {},
): Effect.Effect<
  AgentSchematicSvg,
  AgentSchematicRenderError,
  AgentIdentity | AgentProjectRepository
> {
  return Effect.gen(function* () {
    const inspection = yield* loadInspection(request)
    const snapshot = snapshotMetadata(inspection)
    if (
      dependencies.expectedCircuitHash !== undefined &&
      dependencies.expectedCircuitHash !== snapshot.circuitHash
    ) {
      return yield* Effect.fail(
        new SchematicSnapshotHashMismatch({
          projectId: snapshot.projectId,
          snapshotId: snapshot.snapshotId,
          expectedCircuitHash: dependencies.expectedCircuitHash,
          actualCircuitHash: snapshot.circuitHash,
        }),
      )
    }

    yield* ensureRenderableErc(
      snapshot.projectId,
      snapshot.snapshotId,
      inspection.erc,
    )

    const svgResourceUri = schematicResourceUri(snapshot, request.focus)
    const cache = dependencies.cache ?? schematicVisualCache
    const cached = cache.get(svgResourceUri)
    const rendered = cached === undefined
      ? yield* renderSchematic(
          inspection.project,
          request.focus === undefined ? {} : { focus: request.focus },
        )
      : undefined
    const svg = cached?.svg ?? rendered!.svg
    if (cached === undefined) {
      cache.set(svgResourceUri, {
        svg,
        sourceWidth: rendered!.width,
        sourceHeight: rendered!.height,
        warnings: rendered!.warnings,
      })
    }

    const urls = yield* schematicUrls(
      { ...request, snapshotId: snapshot.snapshotId },
      snapshot.circuitHash,
      dependencies.publicUrl ?? process.env.CIRCUIT_SIM_PUBLIC_URL ?? "http://127.0.0.1:3000",
    )
    const caption = `${inspection.name} schematic`
    return {
      request,
      projectName: inspection.name,
      projectVersion: inspection.version,
      snapshot,
      svgResourceUri,
      browserUrl: urls.pinned,
      currentProjectUrl: urls.current,
      caption,
      alt: caption,
      svg,
      sourceWidth: rendered?.width ?? cached!.sourceWidth,
      sourceHeight: rendered?.height ?? cached!.sourceHeight,
      warnings: (rendered?.warnings ?? cached!.warnings) as ReadonlyArray<SchematicRenderWarning>,
      ercWarnings: inspection.erc
        .filter((issue) => issue.severity === "warning")
        .map((issue) => issue.message),
    }
  })
}

export function ensureRenderableErc(
  projectId: string,
  snapshotId: string,
  issues: ReadonlyArray<ElectricalIssue>,
): Effect.Effect<void, SchematicErcBlocked> {
  const blockingIssues = issues.filter((issue) => issue.severity === "error")
  return blockingIssues.length === 0
    ? Effect.void
    : Effect.fail(
        new SchematicErcBlocked({
          projectId,
          snapshotId,
          issues: blockingIssues,
        }),
      )
}

/** Render the same pinned SVG as a bounded PNG suitable for MCP ImageContent. */
export function renderAgentSchematic(
  request: RenderSchematicInput,
  dependencies: RenderDependencies = {},
): Effect.Effect<
  AgentSchematicVisual,
  AgentSchematicRenderError,
  AgentIdentity | AgentProjectRepository
> {
  return Effect.gen(function* () {
    const rendered = yield* renderAgentSchematicSvg(request, dependencies)
    const cache = dependencies.cache ?? schematicVisualCache
    const cached = cache.get(rendered.svgResourceUri)
    const png = cached?.png === undefined
      ? yield* rasterizeSchematicPng(rendered.svg, pngOptions(
          rendered.sourceWidth,
          rendered.sourceHeight,
        ))
      : {
          pngBase64: cached.png.base64,
          width: cached.png.width,
          height: cached.png.height,
          byteLength: Buffer.byteLength(cached.png.base64, "base64"),
        }
    if (cached?.png === undefined) {
      cache.set(rendered.svgResourceUri, {
        svg: rendered.svg,
        sourceWidth: rendered.sourceWidth,
        sourceHeight: rendered.sourceHeight,
        warnings: rendered.warnings,
        png: { base64: png.pngBase64, width: png.width, height: png.height },
      })
    }
    return { ...rendered, png }
  })
}

function loadInspection(
  request: RenderSchematicInput,
): Effect.Effect<
  AgentProjectInspection,
  AgentProjectRepositoryError,
  AgentIdentity | AgentProjectRepository
> {
  return request.snapshotId === undefined
    ? getAgentProject(request.projectId)
    : getAgentProjectSnapshot(request.projectId, request.snapshotId)
}

function snapshotMetadata(
  inspection: AgentProjectInspection,
): SchematicSnapshotMetadata {
  return {
    projectId: inspection.projectId,
    snapshotId: inspection.currentSnapshotId,
    circuitHash: inspection.circuitHash,
  }
}

function schematicUrls(
  request: RenderSchematicInput & { readonly snapshotId: string },
  circuitHash: string,
  configuredUrl: string,
): Effect.Effect<
  { readonly pinned: string; readonly current: string },
  SchematicPublicUrlInvalid
> {
  return Effect.try({
    try: () => {
      const current = new URL(`/agent-projects/${request.projectId}`, configuredUrl)
      const pinned = new URL(current)
      pinned.searchParams.set("snapshotId", request.snapshotId)
      pinned.searchParams.set("circuitHash", circuitHash)
      if (request.focus !== undefined) {
        pinned.searchParams.set("focus", schematicFocusIdentity(request.focus))
      }
      return { pinned: pinned.href, current: current.href }
    },
    catch: () => new SchematicPublicUrlInvalid({ configuredUrl }),
  })
}

function pngOptions(width: number, height: number) {
  const longEdge = Math.max(width, height)
  const scale = longEdge > 1_600
    ? 1_600 / longEdge
    : longEdge < 800
      ? Math.min(2, 800 / Math.max(longEdge, 1))
      : 1
  return {
    fitTo: scale === 1
      ? { _tag: "original" as const }
      : { _tag: "zoom" as const, value: scale },
    background: "#ffffff",
    loadSystemFonts: true,
  }
}
