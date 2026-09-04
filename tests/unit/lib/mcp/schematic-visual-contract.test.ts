import { Effect, Result, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { newId } from "@circuit-sim/core/ids"
import {
  MAX_FOCUS_IDS,
  MAX_SCHEMATIC_PNG_BASE64_LENGTH,
  RenderSchematicInputSchema,
  RenderSchematicOutputSchema,
  RenderSchematicContractError,
  buildRenderSchematicResult,
  decodeRenderSchematicInput,
  decodeSchematicFocusIdentity,
  schematicFocusIdentity,
  schematicResourceUri,
} from "@/server/mcp/schematic-visual-contract.server"

const projectId = newId()
const snapshotId = newId()
const objectId = newId()
const snapshot = {
  projectId,
  snapshotId,
  circuitHash: "circuit-hash-001",
}

const validRequest = {
  projectId,
  snapshotId,
  focus: { objectIds: [objectId], netIds: ["VOUT"] },
}

describe("MCP schematic visual contract", () => {
  it("requires the exact render_schematic input shape", () => {
    const decoded = decodeRenderSchematicInput(validRequest)
    expect(Result.isSuccess(decoded)).toBe(true)

    const withUnknown = decodeRenderSchematicInput({
      ...validRequest,
      extra: true,
    })
    expect(Result.isFailure(withUnknown)).toBe(true)

    const withFocusUnknown = decodeRenderSchematicInput({
      ...validRequest,
      focus: { objectIds: [objectId], extra: "do not strip" },
    })
    expect(Result.isFailure(withFocusUnknown)).toBe(true)

    const emptyFocus = decodeRenderSchematicInput({
      projectId,
      focus: {},
    })
    expect(Result.isFailure(emptyFocus)).toBe(true)

    const duplicateIds = decodeRenderSchematicInput({
      projectId,
      focus: { objectIds: [objectId, objectId] },
    })
    expect(Result.isFailure(duplicateIds)).toBe(true)
  })

  it("bounds focus selections and keeps the published schema available", () => {
    const inputSchema = Schema.toStandardJSONSchemaV1(
      Schema.toStandardSchemaV1(RenderSchematicInputSchema),
    )
    expect(inputSchema).toBeDefined()

    const tooMany = Array.from({ length: MAX_FOCUS_IDS + 1 }, () => newId())
    expect(
      Result.isFailure(
        decodeRenderSchematicInput({
          projectId,
          focus: { objectIds: tooMany },
        }),
      ),
    ).toBe(true)
  })

  it("uses a stable pinned identity independent of focus ordering", () => {
    const first = schematicFocusIdentity({
      objectIds: [objectId, projectId],
      netIds: ["Z", "A"],
    })
    const second = schematicFocusIdentity({
      objectIds: [projectId, objectId],
      netIds: ["A", "Z"],
    })
    expect(first).toBe(second)
    const roundTrip = decodeSchematicFocusIdentity(first)
    expect(Result.isSuccess(roundTrip)).toBe(true)
    if (Result.isSuccess(roundTrip)) {
      expect(roundTrip.success).toEqual({
        objectIds: [projectId, objectId].sort(),
        netIds: ["A", "Z"],
      })
    }
    expect(schematicFocusIdentity(undefined)).toBe("all")
    expect(schematicResourceUri(snapshot, { objectIds: [objectId] })).toBe(
      schematicResourceUri(snapshot, { objectIds: [objectId] }),
    )
    expect(schematicResourceUri(snapshot, undefined)).toContain(
      `projects/${projectId}/snapshots/${snapshotId}/schematic/${snapshot.circuitHash}/`,
    )
  })

  it("bounds the combined focus group and rejects ambiguous resource identities", () => {
    const objectIds = Array.from({ length: MAX_FOCUS_IDS }, () => newId())
    expect(
      Result.isFailure(
        decodeRenderSchematicInput({
          projectId,
          focus: { objectIds, netIds: ["net_extra"] },
        }),
      ),
    ).toBe(true)
    expect(Result.isFailure(decodeSchematicFocusIdentity("objects-a/nets-b"))).toBe(true)
  })

  it("returns a portable text result while publishing the pinned visual identity", () => {
    const result = Effect.runSync(
      buildRenderSchematicResult({
        request: validRequest,
        rendered: {
          snapshot,
          pngBase64: "iVBORw0KGgo=",
          svgResourceUri: schematicResourceUri(snapshot, validRequest.focus),
          browserUrl: "https://circuit.example/projects/project-1",
          width: 800,
          height: 600,
          caption: "Center-tap rectifier",
          currentProjectUrl: "https://circuit.example/projects/project-1/current",
          warnings: ["large-canvas"],
          ercWarnings: ["Review floating input"],
        },
      }),
    )

    expect(result.content.map((item) => item.type)).toEqual(["text"])
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Center-tap rectifier"),
    })
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Current project:"),
    })
    expect(JSON.stringify(result.structuredContent)).not.toContain(
      "iVBORw0KGgo=",
    )
    expect(result.structuredContent).toMatchObject({
      visuals: [
        expect.objectContaining({
          kind: "schematic",
          mimeType: "image/svg+xml",
          uri: schematicResourceUri(snapshot, validRequest.focus),
          dimensions: { width: 800, height: 600 },
          browserUrl: "https://circuit.example/projects/project-1",
          currentProjectUrl: "https://circuit.example/projects/project-1/current",
          warnings: ["large-canvas"],
          ercWarnings: ["Review floating input"],
        }),
      ],
    })
    expect(
      Result.isSuccess(
        Schema.decodeUnknownResult(RenderSchematicOutputSchema)(
          result.structuredContent,
        ),
      ),
    ).toBe(true)
  })

  it("rejects malformed, oversized, and unpinned renderer output with tagged errors", () => {
    const malformed = buildRenderSchematicResult({
      request: validRequest,
      rendered: {
        snapshot,
        pngBase64: "not base64",
      },
    })
    expect(() => Effect.runSync(malformed)).toThrow(RenderSchematicContractError)

    const notPng = buildRenderSchematicResult({
      request: validRequest,
      rendered: {
        snapshot,
        pngBase64: "QUJD",
      },
    })
    expect(() => Effect.runSync(notPng)).toThrow(RenderSchematicContractError)

    const oversized = buildRenderSchematicResult({
      request: validRequest,
      rendered: {
        snapshot,
        pngBase64: "A".repeat(MAX_SCHEMATIC_PNG_BASE64_LENGTH + 1),
      },
    })
    expect(() => Effect.runSync(oversized)).toThrow(RenderSchematicContractError)

    const unpinned = buildRenderSchematicResult({
      request: validRequest,
      rendered: {
        snapshot,
        svgResourceUri: "circuit-sim://schematic/not-pinned.svg",
      },
    })
    expect(() => Effect.runSync(unpinned)).toThrow(RenderSchematicContractError)

    const snapshotUnknown = buildRenderSchematicResult({
      request: validRequest,
      rendered: {
        snapshot: { ...snapshot, hidden: "field" },
        browserUrl: "https://circuit.example/project",
      },
    })
    expect(() => Effect.runSync(snapshotUnknown)).toThrow(RenderSchematicContractError)

    const wrongProject = buildRenderSchematicResult({
      request: validRequest,
      rendered: {
        snapshot: { ...snapshot, projectId: newId() },
        browserUrl: "https://circuit.example/project",
      },
    })
    expect(() => Effect.runSync(wrongProject)).toThrow(RenderSchematicContractError)
  })
})
