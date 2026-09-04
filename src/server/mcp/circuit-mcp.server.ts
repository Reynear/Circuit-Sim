import { Effect, ManagedRuntime, Result, Schema } from "effect"
import {
  McpServer,
  ResourceNotFoundError,
  ResourceTemplate,
  createMcpHandler,
  type CallToolResult,
  type McpHttpHandler,
} from "@modelcontextprotocol/server"
import {
  AgentElectricalGraphSchema,
  agentComponentCatalog,
} from "@circuit-sim/core/agent/electrical-graph"
import {
  AgentIdentity,
  AgentProjectNotFound,
  AgentProjectRepository,
  AgentProjectRepositoryUnavailable,
  AgentProjectSnapshotNotFound,
  AgentProjectSummarySchema,
  AgentProjectVersionConflict,
  CreateAgentProjectInputSchema,
  ProjectVersionSchema,
  createAgentProject,
  getAgentProject,
  listAgentProjects,
  replaceAgentProject,
  type AgentProjectInspection,
} from "@circuit-sim/core/agent/project-workflow"
import {
  AgentSimulationRepository,
  AgentSimulationRepositoryUnavailable,
  AgentSimulationRunNotFound,
  AgentSimulator,
  AgentSimulatorUnavailable,
  getAgentSimulationRun,
  listAgentSimulationRuns,
  simulateAgentProject,
  type AgentSimulationEvidence,
} from "@circuit-sim/core/agent/simulation-workflow"
import { IdSchema } from "@circuit-sim/core/ids"
import { extractNetlist } from "@circuit-sim/core/circuit/net-extraction"
import { SimulationRunSchema } from "@circuit-sim/core/simulation/simulation-run"
import {
  RenderSchematicContractError,
  RenderSchematicInputError,
  RenderSchematicInputSchema,
  RenderSchematicOutputSchema,
  buildRenderSchematicResult,
  decodeRenderSchematicInput,
  decodeSchematicFocusIdentity,
} from "./schematic-visual-contract.server"
import {
  MCP_APP_MIME_TYPE,
  SCHEMATIC_APP_HTML,
  SCHEMATIC_APP_RESOURCE_URI,
} from "./schematic-app-resource.server"
import {
  SchematicPngTooLarge,
  SchematicRasterizationFailed,
} from "./schematic-png-rasterizer.server"
import {
  SchematicErcBlocked,
  SchematicPublicUrlInvalid,
  SchematicSnapshotHashMismatch,
  renderAgentSchematic,
  renderAgentSchematicSvg,
} from "@/server/schematic/render-agent-schematic.server"
import {
  RenderSchematicFailed,
  RenderSchematicRejected,
} from "@/server/schematic/render-schematic.server"

const InspectCircuitInputSchema = Schema.Union([
  Schema.TaggedStruct("instructions", {}),
  Schema.TaggedStruct("catalog", {}),
  Schema.TaggedStruct("list_projects", {}),
  Schema.TaggedStruct("get_project", { projectId: IdSchema }),
  Schema.TaggedStruct("get_run", {
    runId: IdSchema,
    includeNetlist: Schema.optionalKey(Schema.Boolean),
  }),
  Schema.TaggedStruct("list_runs", { projectId: IdSchema }),
  Schema.TaggedStruct("trace", {
    runId: IdSchema,
    signalNames: Schema.optionalKey(
      Schema.Array(Schema.NonEmptyString).check(Schema.isMaxLength(8)),
    ),
    offset: Schema.optionalKey(
      Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    ),
    limit: Schema.optionalKey(
      Schema.Int.check(
        Schema.isGreaterThanOrEqualTo(1),
        Schema.isLessThanOrEqualTo(500),
      ),
    ),
  }),
])

const EditCircuitInputSchema = Schema.Union([
  Schema.TaggedStruct("create", CreateAgentProjectInputSchema.fields),
  Schema.TaggedStruct("replace", {
    projectId: IdSchema,
    expectedVersion: ProjectVersionSchema,
    graph: AgentElectricalGraphSchema,
  }),
])

const SimulateCircuitInputSchema = Schema.Struct({
  projectId: IdSchema,
  includeNetlist: Schema.optionalKey(Schema.Boolean),
})

type CircuitMcpServices =
  | AgentIdentity
  | AgentProjectRepository
  | AgentSimulator
  | AgentSimulationRepository

export type CircuitMcpRuntime = ManagedRuntime.ManagedRuntime<
  CircuitMcpServices,
  never
>

export function createCircuitMcpHandler(
  runtime: CircuitMcpRuntime,
): McpHttpHandler {
  return createMcpHandler(() => createCircuitMcpServer(runtime), {
    responseMode: "json",
  })
}

export function createCircuitMcpServer(runtime: CircuitMcpRuntime): McpServer {
  const server = new McpServer(
    { name: "circuit-sim", version: "0.1.0" },
    { instructions: SERVER_INSTRUCTIONS },
  )

  server.registerTool(
    "inspect_circuit",
    {
      title: "Inspect Circuit",
      description:
        "Read Circuit Sim instructions, modeled component catalog, owned projects, project electrical state, simulation evidence, or bounded waveform traces.",
      inputSchema: Schema.toStandardJSONSchemaV1(
        Schema.toStandardSchemaV1(InspectCircuitInputSchema),
      ),
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (input) => {
      switch (input._tag) {
        case "instructions":
          return success({ instructions: SERVER_INSTRUCTIONS })
        case "catalog":
          return success({ components: agentComponentCatalog() })
        case "list_projects":
          return runTool(runtime, listAgentProjects(), (projects) => ({
            projects: projects.map((project) =>
              Schema.encodeSync(AgentProjectSummarySchema)(project),
            ),
          }))
        case "get_project":
          return runTool(
            runtime,
            getAgentProject(input.projectId),
            projectInspectionPayload,
          )
        case "get_run":
          return runTool(
            runtime,
            getAgentSimulationRun(input.runId),
            (evidence) =>
              simulationEvidencePayload(evidence, input.includeNetlist ?? false),
          )
        case "list_runs":
          return runTool(
            runtime,
            listAgentSimulationRuns(input.projectId),
            (runs) => ({
              runs: runs.map(({ run }) => {
                const encoded = Schema.encodeSync(SimulationRunSchema)(run)
                return {
                  id: encoded.id,
                  projectId: encoded.projectId,
                  projectSnapshotId: encoded.projectSnapshotId,
                  createdAt: encoded.createdAt,
                  engine: encoded.engine,
                  circuitHash: encoded.circuitHash,
                }
              }),
            }),
          )
        case "trace":
          return runTool(
            runtime,
            getAgentSimulationRun(input.runId),
            (evidence) => tracePayload(evidence, input),
          )
      }
    },
  )

  server.registerTool(
    "edit_circuit",
    {
      title: "Edit Circuit",
      description:
        "Create an empty owned project or atomically replace a project's complete validated electrical graph, including its explicit groundNet, at an expected version.",
      inputSchema: Schema.toStandardJSONSchemaV1(
        Schema.toStandardSchemaV1(EditCircuitInputSchema),
      ),
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async (input) => {
      switch (input._tag) {
        case "create":
          return runTool(
            runtime,
            createAgentProject({ name: input.name }),
            projectInspectionPayload,
          )
        case "replace":
          return runTool(
            runtime,
            replaceAgentProject({
              projectId: input.projectId,
              expectedVersion: input.expectedVersion,
              graph: input.graph,
            }),
            projectInspectionPayload,
          )
      }
    },
  )

  server.registerTool(
    "simulate_circuit",
    {
      title: "Simulate Circuit",
      description:
        "Explicitly run the saved analysis for one project with native ngspice and return stored evidence for the exact project snapshot.",
      inputSchema: Schema.toStandardJSONSchemaV1(
        Schema.toStandardSchemaV1(SimulateCircuitInputSchema),
      ),
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async (input) =>
      runTool(
        runtime,
        simulateAgentProject({ projectId: input.projectId }),
        (evidence) =>
          simulationEvidencePayload(evidence, input.includeNetlist ?? false),
      ),
  )

  server.registerTool(
    "render_schematic",
    {
      title: "Render Schematic",
      description:
        "Render one exact ERC-clean Circuit Sim project snapshot as a light schematic. Optionally highlight one validated group of object and net IDs while dimming everything else. Returns a portable text result plus pinned SVG and browser viewer identities.",
      inputSchema: Schema.toStandardJSONSchemaV1(
        Schema.toStandardSchemaV1(RenderSchematicInputSchema),
      ),
      outputSchema: Schema.toStandardJSONSchemaV1(
        Schema.toStandardSchemaV1(RenderSchematicOutputSchema),
      ),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ui: { resourceUri: SCHEMATIC_APP_RESOURCE_URI },
        "openai/outputTemplate": SCHEMATIC_APP_RESOURCE_URI,
        "openai/toolInvocation/invoking": "Rendering schematic…",
        "openai/toolInvocation/invoked": "Schematic ready.",
      },
    },
    async (input) => {
      const decoded = decodeRenderSchematicInput(input)
      if (Result.isFailure(decoded)) return failure(decoded.failure)
      return runtime.runPromise(
        Effect.match(
          renderAgentSchematic(decoded.success).pipe(
            Effect.flatMap((rendered) =>
              buildRenderSchematicResult({
                request: decoded.success,
                rendered: {
                  snapshot: rendered.snapshot,
                  pngBase64: rendered.png.pngBase64,
                  svgResourceUri: rendered.svgResourceUri,
                  browserUrl: rendered.browserUrl,
                  currentProjectUrl: rendered.currentProjectUrl,
                  width: rendered.png.width,
                  height: rendered.png.height,
                  caption: rendered.caption,
                  alt: rendered.alt,
                  warnings: rendered.warnings,
                  ercWarnings: rendered.ercWarnings,
                },
              }),
            ),
          ),
          { onFailure: failure, onSuccess: (result) => result },
        ),
      )
    },
  )

  server.registerResource(
    "schematic-app",
    SCHEMATIC_APP_RESOURCE_URI,
    {
      title: "Circuit Sim schematic viewer",
      description:
        "Self-contained inline viewer for one immutable render_schematic result.",
      mimeType: MCP_APP_MIME_TYPE,
      _meta: {
        ui: {
          prefersBorder: true,
          csp: {
            connectDomains: [],
            resourceDomains: [],
            frameDomains: [],
            baseUriDomains: [],
          },
        },
      },
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: MCP_APP_MIME_TYPE,
          text: SCHEMATIC_APP_HTML,
          _meta: {
            ui: {
              prefersBorder: true,
              csp: {
                connectDomains: [],
                resourceDomains: [],
                frameDomains: [],
                baseUriDomains: [],
              },
            },
          },
        },
      ],
    }),
  )

  server.registerResource(
    "pinned-schematic-svg",
    new ResourceTemplate(
      "circuit-sim://projects/{projectId}/snapshots/{snapshotId}/schematic/{circuitHash}/{focus}.svg",
      { list: undefined },
    ),
    {
      title: "Pinned circuit schematic",
      description: "Deterministic SVG derived from one immutable CircuitProject snapshot.",
      mimeType: "image/svg+xml",
    },
    async (uri, variables) => {
      const focus = decodeSchematicFocusIdentity(String(variables.focus))
      if (Result.isFailure(focus)) {
        throw new ResourceNotFoundError(uri.href, focus.failure.reason)
      }
      const decoded = decodeRenderSchematicInput({
        projectId: String(variables.projectId),
        snapshotId: String(variables.snapshotId),
        ...(focus.success === undefined ? {} : { focus: focus.success }),
      })
      if (Result.isFailure(decoded)) {
        throw new ResourceNotFoundError(uri.href, decoded.failure.reason)
      }
      const outcome = await runtime.runPromise(
        Effect.result(
          renderAgentSchematicSvg(decoded.success, {
            expectedCircuitHash: String(variables.circuitHash),
          }),
        ),
      )
      if (Result.isFailure(outcome)) {
        throw new ResourceNotFoundError(
          uri.href,
          resourceFailureMessage(outcome.failure),
        )
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "image/svg+xml",
            blob: Buffer.from(outcome.success.svg, "utf8").toString("base64"),
          },
        ],
      }
    },
  )

  return server
}

const SERVER_INSTRUCTIONS = `Circuit Sim designs and simulates electronic circuits from one canonical project model.

- Call inspect_circuit with action=catalog before inventing component types, properties, or terminal keys.
- Call inspect_circuit with action=get_project before replacing an existing project.
- edit_circuit replacement is the whole electrical graph and requires the current expectedVersion.
- Every replacement graph must set groundNet to the name of exactly one submitted net. That selected net is canonicalized to GND. For example, if the user says N45 is ground, submit a net named N45 and set groundNet to N45; do not add a second GND net.
- dc-power-rail is a one-terminal DC source referenced internally to canonical GND. Connect its rail terminal to the powered net; use a positive voltage for VCC and a negative voltage for VEE. Do not also place its hidden reference in the graph or connect a nonzero rail terminal to GND.
- pulse-voltage-source is a two-terminal transient source lowered to NGSpice PULSE(initial, pulsed, delay, rise, fall, width, period). Duty cycle must be strictly between 0% and 100%; connect negative to GND for a ground-referenced PWM drive.
- For dc-current-source, positive current flows from terminal positive to terminal negative. To raise a load above GND, connect positive to GND and negative to the load net.
- Editing does not simulate. Call simulate_circuit explicitly before claiming electrical behavior.
- After the final edit, inspect the returned ERC result. ERC errors block rendering and must be corrected; warnings may be rendered but remain visible in the render result.
- Call render_schematic after an ERC-clean final edit, or whenever the user asks to see the circuit. Omit focus for the whole schematic; otherwise use only object and net IDs published by inspect_circuit action=get_project.
- render_schematic pins its SVG resource identity and browser viewer to one immutable snapshot. Use the separate current-project link only when the user wants the latest editable state.
- Use inspect_circuit action=list_runs to discover persisted evidence for a project and get_run for one exact run.
- Simulation evidence is compact by default. Request includeNetlist only when the generated SPICE input is needed for debugging.
- Treat simulation values as evidence for the idealized models only, not as proof of physical safety, tolerances, thermal behavior, or manufacturability.
- Use inspect_circuit action=trace only for selected, bounded waveform samples.`

function projectInspectionPayload(
  inspection: AgentProjectInspection,
) {
  const baseUrl =
    process.env.CIRCUIT_SIM_PUBLIC_URL ?? "http://127.0.0.1:3000"
  return {
    projectId: inspection.projectId,
    name: inspection.name,
    version: inspection.version,
    currentSnapshotId: inspection.currentSnapshotId,
    circuitHash: inspection.circuitHash,
    browserUrl: new URL(
      `/agent-projects/${inspection.projectId}`,
      baseUrl,
    ).href,
    analysis: inspection.project.analysis,
    circuit: inspection.circuit,
    erc: inspection.erc,
    visualFocus: visualFocusIndex(inspection),
  }
}

function visualFocusIndex(inspection: AgentProjectInspection) {
  const netlist = extractNetlist(inspection.project)
  return {
    objects: inspection.project.objects.map((object) => ({
      id: object.id,
      kind: object.kind,
      ...(object.kind === "component" ? { label: object.refdes } : {}),
      ...(object.kind === "net-label" ? { label: object.text } : {}),
      ...(object.kind === "ground" ? { label: "GND" } : {}),
      ...(object.kind === "probe" ? { label: object.name } : {}),
    })),
    nets: netlist.nets.map((net) => ({ id: net.id, name: net.name })),
  }
}

export function simulationEvidencePayload(
  evidence: AgentSimulationEvidence,
  includeNetlist = false,
) {
  const observation = evidence.observation
  const encodedRun = Schema.encodeSync(SimulationRunSchema)(evidence.run)
  return {
    run: {
      id: encodedRun.id,
      projectId: encodedRun.projectId,
      projectSnapshotId: encodedRun.projectSnapshotId,
      createdAt: encodedRun.createdAt,
      engine: observation.run.engine,
      status: observation.run.status,
      circuitHash: observation.run.circuitHash,
      stale: observation.run.stale,
    },
    ...(includeNetlist ? { netlist: evidence.netlist } : {}),
    diagnostics: {
      warnings: evidence.diagnostics.warnings,
      errors: evidence.diagnostics.errors,
      suggestions: evidence.diagnostics.suggestions,
      unsupportedComponents: evidence.diagnostics.unsupportedComponents,
      floatingPins: evidence.diagnostics.floatingPins,
    },
    netVoltages: observation.netVoltages,
    componentMeasurements: observation.componentMeasurements,
    probeMeasurements: observation.probeMeasurements,
    availableSignals: observation.signals.map((signal) => ({
      name: signal.name,
      unit: signal.unit,
      sampleCount: signal.points.length,
    })),
    notes: observation.notes,
  }
}

function tracePayload(
  evidence: AgentSimulationEvidence,
  input: {
    readonly signalNames?: ReadonlyArray<string>
    readonly offset?: number
    readonly limit?: number
  },
) {
  const available = evidence.observation.signals
  const requested = input.signalNames ?? available.map((signal) => signal.name)
  const names = new Set(requested)
  const offset = input.offset ?? 0
  const limit = input.limit ?? 200
  return {
    runId: evidence.observation.run.id,
    offset,
    limit,
    signals: available
      .filter((signal) => names.has(signal.name))
      .map((signal) => ({
        name: signal.name,
        unit: signal.unit,
        totalSamples: signal.points.length,
        points: signal.points.slice(offset, offset + limit),
      })),
    missingSignalNames: requested.filter(
      (name) => !available.some((signal) => signal.name === name),
    ),
  }
}

function runTool<A, E>(
  runtime: CircuitMcpRuntime,
  effect: Effect.Effect<A, E, CircuitMcpServices>,
  payloadOf: (value: A) => Record<string, unknown>,
): Promise<CallToolResult> {
  return runtime.runPromise(
    Effect.match(effect, {
      onFailure: failure,
      onSuccess: (value) => success(payloadOf(value)),
    }),
  )
}

function success(payload: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  }
}

function failure(error: unknown): CallToolResult {
  const payload = errorPayload(error)
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  }
}

function resourceFailureMessage(error: unknown): string {
  const payload = errorPayload(error)
  return typeof payload.message === "string"
    ? payload.message
    : typeof payload.error === "string"
      ? payload.error
      : "Pinned schematic is unavailable"
}

function errorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof RenderSchematicInputError) {
    return { error: error._tag, message: error.reason }
  }
  if (error instanceof RenderSchematicContractError) {
    return { error: error._tag, message: error.reason }
  }
  if (error instanceof RenderSchematicRejected) {
    return { error: error._tag, code: error.code, message: error.message }
  }
  if (error instanceof RenderSchematicFailed) {
    return { error: error._tag, message: error.message }
  }
  if (error instanceof SchematicRasterizationFailed) {
    return { error: error._tag, message: error.reason }
  }
  if (error instanceof SchematicPngTooLarge) {
    return {
      error: error._tag,
      byteLength: error.byteLength,
      maxBytes: error.maxBytes,
    }
  }
  if (error instanceof SchematicErcBlocked) {
    return {
      error: error._tag,
      projectId: error.projectId,
      snapshotId: error.snapshotId,
      issues: error.issues,
    }
  }
  if (error instanceof SchematicSnapshotHashMismatch) {
    return {
      error: error._tag,
      projectId: error.projectId,
      snapshotId: error.snapshotId,
      expectedCircuitHash: error.expectedCircuitHash,
      actualCircuitHash: error.actualCircuitHash,
    }
  }
  if (error instanceof SchematicPublicUrlInvalid) {
    return { error: error._tag, message: "CIRCUIT_SIM_PUBLIC_URL is invalid" }
  }
  if (error instanceof AgentProjectVersionConflict) {
    return {
      error: error._tag,
      projectId: error.projectId,
      expectedVersion: error.expectedVersion,
      currentVersion: error.currentVersion,
    }
  }
  if (error instanceof AgentProjectNotFound) {
    return { error: error._tag, projectId: error.projectId }
  }
  if (error instanceof AgentProjectSnapshotNotFound) {
    return {
      error: error._tag,
      projectId: error.projectId,
      snapshotId: error.snapshotId,
    }
  }
  if (error instanceof AgentSimulationRunNotFound) {
    return { error: error._tag, runId: error.runId }
  }
  if (error instanceof AgentSimulatorUnavailable) {
    return { error: error._tag, message: error.message }
  }
  if (
    error instanceof AgentProjectRepositoryUnavailable ||
    error instanceof AgentSimulationRepositoryUnavailable
  ) {
    return { error: error._tag, operation: error.operation }
  }
  return { error: "UnexpectedAgentWorkflowFailure" }
}
