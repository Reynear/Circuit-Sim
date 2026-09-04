import { createServerFn } from "@tanstack/react-start"
import { Effect, Result, Schema } from "effect"
import { IdSchema } from "@circuit-sim/core/ids"
import { decodeSchematicFocusIdentity } from "@/server/mcp/schematic-visual-contract.server"
import { circuitAgentRuntime } from "@/server/mcp/circuit-mcp-runtime.server"
import { renderAgentSchematicSvg } from "@/server/schematic/render-agent-schematic.server"

const AgentProjectBrowserInputSchema = Schema.Struct({
  projectId: IdSchema,
  snapshotId: Schema.optionalKey(IdSchema),
  circuitHash: Schema.optionalKey(
    Schema.NonEmptyString.check(Schema.isMaxLength(256)),
  ),
  focus: Schema.optionalKey(
    Schema.NonEmptyString.check(Schema.isMaxLength(2_048)),
  ),
})

export const getAgentProjectForBrowser = createServerFn({ method: "GET" })
  .validator((raw: unknown) =>
    Schema.decodeUnknownSync(AgentProjectBrowserInputSchema, {
      onExcessProperty: "error",
    })(raw),
  )
  .handler(async ({ data }) => {
    const focus = data.focus === undefined
      ? Result.succeed(undefined)
      : decodeSchematicFocusIdentity(data.focus)
    if (Result.isFailure(focus)) {
      return {
        _tag: "failure" as const,
        error: focus.failure._tag,
        message: focus.failure.reason,
      }
    }
    const request = {
      projectId: data.projectId,
      ...(data.snapshotId === undefined ? {} : { snapshotId: data.snapshotId }),
      ...(focus.success === undefined ? {} : { focus: focus.success }),
    }
    return circuitAgentRuntime.runPromise(
      Effect.match(
        renderAgentSchematicSvg(request, {
          ...(data.circuitHash === undefined
            ? {}
            : { expectedCircuitHash: data.circuitHash }),
        }),
        {
          onFailure: (error) => ({
            _tag: "failure" as const,
            error: error._tag,
            message: "The requested pinned schematic could not be rendered.",
          }),
          onSuccess: (rendered) => ({
            _tag: "success" as const,
            projectName: rendered.projectName,
            version: rendered.projectVersion,
            snapshot: rendered.snapshot,
            caption: rendered.caption,
            svg: rendered.svg,
            warnings: rendered.warnings,
            ercWarnings: rendered.ercWarnings,
            currentProjectUrl: rendered.currentProjectUrl,
          }),
        },
      ),
    )
  })
