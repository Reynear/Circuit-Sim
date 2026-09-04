import { Result, Schema } from "effect"
import type { WebMCP } from "webmcp-types"
import {
  AgentElectricalGraphSchema,
  agentComponentCatalog,
} from "@circuit-sim/core/agent/electrical-graph"
import {
  buildElectricalCircuit,
  circuitHashOf,
} from "@circuit-sim/core/circuit/electrical-circuit"
import { SpiceEnginePreferenceSchema } from "@circuit-sim/core/simulation/result"
import type { SpiceEnginePreference } from "@circuit-sim/core/simulation/result"
import type { Component } from "@circuit-sim/core/circuit/project"
import type { EditorState } from "@/browser/editor/editor-state"

const InspectCircuitInputSchema = Schema.Struct({
  action: Schema.Literals([
    "instructions",
    "catalog",
    "current",
    "latest_simulation",
  ]),
})

const AuthorCircuitInputSchema = Schema.Struct({
  expectedCircuitHash: Schema.NonEmptyString,
  graph: AgentElectricalGraphSchema,
})

const SimulateCircuitInputSchema = Schema.Struct({
  engine: Schema.optionalKey(SpiceEnginePreferenceSchema),
})

const HighlightComponentsInputSchema = Schema.Struct({
  refdes: Schema.Array(Schema.NonEmptyString).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(12),
  ),
})

const InspectCircuitJsonSchema = Schema.toStandardJSONSchemaV1(
  Schema.toStandardSchemaV1(InspectCircuitInputSchema),
)["~standard"].jsonSchema.input({ target: "draft-2020-12" })
const AuthorCircuitJsonSchema = Schema.toStandardJSONSchemaV1(
  Schema.toStandardSchemaV1(AuthorCircuitInputSchema),
)["~standard"].jsonSchema.input({ target: "draft-2020-12" })
const SimulateCircuitJsonSchema = Schema.toStandardJSONSchemaV1(
  Schema.toStandardSchemaV1(SimulateCircuitInputSchema),
)["~standard"].jsonSchema.input({ target: "draft-2020-12" })
const HighlightComponentsJsonSchema = Schema.toStandardJSONSchemaV1(
  Schema.toStandardSchemaV1(HighlightComponentsInputSchema),
)["~standard"].jsonSchema.input({ target: "draft-2020-12" })

export type WebMcpActivity = {
  readonly message: string
  readonly panel?: "issues" | "measurements" | "simulation"
}

export type WebMcpSimulationResult =
  | {
      readonly _tag: "Success"
      readonly data: unknown
    }
  | {
      readonly _tag: "Failure"
      readonly error: {
        readonly code: string
        readonly message: string
        readonly retryable: boolean
      }
    }

export type CircuitWebMcpDependencies = {
  readonly getState: () => EditorState
  readonly runSimulation: (
    engine: SpiceEnginePreference,
    signal: AbortSignal,
  ) => Promise<WebMcpSimulationResult>
  readonly onActivity: (activity: WebMcpActivity) => void
}

export function makeCircuitWebMcpTools(
  dependencies: CircuitWebMcpDependencies,
): ReadonlyArray<WebMCP.ModelContextTool> {
  return [
    {
      name: "inspect_circuit",
      title: "Inspect Circuit",
      description:
        "Read Circuit Sim instructions, the component catalog, the current validated electrical circuit, or the latest simulation evidence on this page.",
      inputSchema: InspectCircuitJsonSchema,
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: (input) => inspectCircuit(dependencies, input),
    },
    {
      name: "author_circuit",
      title: "Author Circuit",
      description:
        "Replace the active page's complete electrical circuit with a validated graph. The canvas updates visibly, the change is autosaved, and the user can undo it.",
      inputSchema: AuthorCircuitJsonSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => authorCircuit(dependencies, input),
    },
    {
      name: "simulate_circuit",
      title: "Simulate Circuit",
      description:
        "Run SPICE for the exact active circuit, store the run with its project snapshot, show the Simulation panel, and return bounded measurement evidence.",
      inputSchema: SimulateCircuitJsonSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input, options) =>
        simulateCircuit(dependencies, input, options.signal),
    },
    {
      name: "highlight_components",
      title: "Highlight Components",
      description:
        "Highlight one or more components on the active schematic by reference designator so the user can follow an explanation on the canvas.",
      inputSchema: HighlightComponentsJsonSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => highlightComponents(dependencies, input),
    },
  ]
}

function inspectCircuit(
  dependencies: CircuitWebMcpDependencies,
  input: unknown,
) {
  const decoded = decodeInput(InspectCircuitInputSchema, input)
  if (decoded._tag === "Failure") return decoded

  switch (decoded.data.action) {
    case "instructions":
      return success({ instructions: AGENT_INSTRUCTIONS })
    case "catalog":
      return success({ components: agentComponentCatalog() })
    case "current": {
      const state = dependencies.getState()
      return state.project
        ? success(currentCircuitPayload(state))
        : failure("NoActiveProject", "No circuit project is loaded on this page.", false)
    }
    case "latest_simulation": {
      const observations = dependencies.getState().observations
      return observations
        ? success(simulationEvidencePayload(observations))
        : failure(
            "NoSimulationRun",
            "The active circuit has no simulation evidence yet. Call simulate_circuit.",
            true,
          )
    }
  }
}

function authorCircuit(
  dependencies: CircuitWebMcpDependencies,
  input: unknown,
) {
  const decoded = decodeInput(AuthorCircuitInputSchema, input)
  if (decoded._tag === "Failure") return decoded

  const state = dependencies.getState()
  if (!state.project) {
    return failure("NoActiveProject", "No circuit project is loaded on this page.", false)
  }
  const currentHash = circuitHashOf(buildElectricalCircuit(state.project))
  if (decoded.data.expectedCircuitHash !== currentHash) {
    return failure(
      "CircuitChanged",
      `The circuit changed after inspection. Inspect it again and use circuit hash ${currentHash}.`,
      true,
    )
  }

  state.replaceElectricalGraph(decoded.data.graph)
  const next = dependencies.getState()
  if (!next.project) {
    return failure("NoActiveProject", "The circuit project was closed during the edit.", true)
  }

  dependencies.onActivity({
    message: `Agent authored ${decoded.data.graph.components.length} components and ${decoded.data.graph.nets.length} nets.`,
    panel: "issues",
  })
  return success({
    ...currentCircuitPayload(next),
    previousCircuitHash: currentHash,
    undoAvailable: next.historyPast.length > 0,
  })
}

async function simulateCircuit(
  dependencies: CircuitWebMcpDependencies,
  input: unknown,
  signal: AbortSignal,
) {
  const decoded = decodeInput(SimulateCircuitInputSchema, input)
  if (decoded._tag === "Failure") return decoded
  return dependencies.runSimulation(decoded.data.engine ?? "ngspice", signal)
}

function highlightComponents(
  dependencies: CircuitWebMcpDependencies,
  input: unknown,
) {
  const decoded = decodeInput(HighlightComponentsInputSchema, input)
  if (decoded._tag === "Failure") return decoded
  const state = dependencies.getState()
  if (!state.project) {
    return failure("NoActiveProject", "No circuit project is loaded on this page.", false)
  }

  const requested = new Set(decoded.data.refdes)
  const components = state.project.objects.filter(
    (object): object is Component =>
      object.kind === "component" && requested.has(object.refdes),
  )
  const found = new Set(components.map((component) => component.refdes))
  const missing = decoded.data.refdes.filter((refdes) => !found.has(refdes))
  if (missing.length > 0) {
    return failure(
      "UnknownComponent",
      `Unknown reference designator(s): ${missing.join(", ")}.`,
      true,
    )
  }

  state.selectObjects(components.map((component) => component.id))
  dependencies.onActivity({
    message: `Agent highlighted ${components.map((component) => component.refdes).join(", ")}.`,
  })
  return success({ highlighted: components.map((component) => component.refdes) })
}

function currentCircuitPayload(state: EditorState) {
  const project = state.project!
  const circuit = buildElectricalCircuit(project)
  return {
    project: {
      id: project.id,
      name: project.name,
      circuitHash: circuitHashOf(circuit),
      analysis: project.analysis,
      objectCount: project.objects.length,
      dirty: state.dirty,
    },
    circuit,
    erc: state.ercIssues.map((issue) => ({
      severity: issue.severity,
      message: issue.message,
      objectIds: issue.objectIds ?? [],
    })),
    latestSimulation: state.observations
      ? simulationEvidencePayload(state.observations)
      : null,
  }
}

function simulationEvidencePayload(
  observations: NonNullable<EditorState["observations"]>,
) {
  return {
    run: observations.run,
    netVoltages: observations.netVoltages,
    componentMeasurements: observations.componentMeasurements,
    probeMeasurements: observations.probeMeasurements,
    notes: observations.notes,
  }
}

function decodeInput<SchemaType extends Schema.ConstraintDecoder<unknown>>(
  schema: SchemaType,
  input: unknown,
):
  | { readonly _tag: "Decoded"; readonly data: SchemaType["Type"] }
  | Extract<WebMcpSimulationResult, { readonly _tag: "Failure" }> {
  const decoded = Schema.decodeUnknownResult(schema, {
    onExcessProperty: "error",
  })(input)
  return Result.isSuccess(decoded)
    ? { _tag: "Decoded", data: decoded.success }
    : failure("InvalidInput", String(decoded.failure), true)
}

function success(data: unknown) {
  return { _tag: "Success" as const, data }
}

function failure(
  code: string,
  message: string,
  retryable: boolean,
): Extract<WebMcpSimulationResult, { readonly _tag: "Failure" }> {
  return {
    _tag: "Failure",
    error: { code, message, retryable },
  }
}

const AGENT_INSTRUCTIONS = `Circuit Sim exposes the exact circuit open on this page.

1. Inspect the catalog before choosing component types, properties, or terminal keys.
2. Inspect the current circuit immediately before authoring and pass its circuitHash to author_circuit.
3. author_circuit replaces the complete electrical graph as one visible, undoable edit. Every graph must choose one submitted net as groundNet; it becomes GND.
4. Editing does not prove electrical behavior. Call simulate_circuit and ground claims in its exact circuit hash and measurements.
5. Treat simulation as evidence for idealized models, not proof of physical safety, tolerances, thermal behavior, or manufacturability.
6. Use highlight_components when pointing out parts of the design to the user.`
