import { Schema } from "effect"
import { TransientAnalysisSchema } from "@circuit-sim/core/circuit/project"
import { ElectricalBehaviorSchema } from "@circuit-sim/core/circuit/electrical-circuit"
import { SimulationDiagnosticsSchema } from "@circuit-sim/core/simulation/result"

const OptionalFinite = Schema.optionalKey(
  Schema.Number.check(Schema.isFinite()),
)

export const ProjectInspectionPayloadSchema = Schema.Struct({
  projectId: Schema.String,
  name: Schema.String,
  version: Schema.Int,
  currentSnapshotId: Schema.String,
  circuitHash: Schema.String,
  browserUrl: Schema.String,
  analysis: TransientAnalysisSchema,
  circuit: Schema.Struct({
    components: Schema.Array(
      Schema.Struct({
        refdes: Schema.String,
        type: Schema.String,
        behavior: ElectricalBehaviorSchema,
        terminals: Schema.Array(
          Schema.Struct({
            key: Schema.String,
            label: Schema.String,
            net: Schema.NullOr(Schema.String),
          }),
        ),
      }),
    ),
    nets: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        terminals: Schema.Array(
          Schema.Struct({ refdes: Schema.String, pin: Schema.String }),
        ),
      }),
    ),
  }),
  erc: Schema.Array(Schema.Unknown),
})
export type ProjectInspectionPayload =
  typeof ProjectInspectionPayloadSchema.Type

const RunEvidenceSchema = Schema.Struct({
  id: Schema.String,
  projectId: Schema.String,
  projectSnapshotId: Schema.String,
  createdAt: Schema.String,
  engine: Schema.Literals(["ngspice", "spicey"]),
  status: Schema.Literals(["success", "partial", "failed"]),
  circuitHash: Schema.String,
  stale: Schema.Boolean,
})

const NetVoltageSchema = Schema.Struct({
  netId: Schema.String,
  name: Schema.String,
  voltage: OptionalFinite,
})

const ComponentMeasurementSchema = Schema.Struct({
  objectId: Schema.String,
  refdes: Schema.String,
  type: Schema.String,
  voltage: OptionalFinite,
  current: OptionalFinite,
  power: OptionalFinite,
})

const SimulationEvidencePayloadFields = {
  run: RunEvidenceSchema,
  diagnostics: SimulationDiagnosticsSchema,
  netVoltages: Schema.Array(NetVoltageSchema),
  componentMeasurements: Schema.Array(ComponentMeasurementSchema),
  probeMeasurements: Schema.Array(Schema.Unknown),
  availableSignals: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      unit: Schema.Literals(["V", "A", "W"]),
      sampleCount: Schema.Int,
    }),
  ),
  notes: Schema.Array(Schema.String),
}

/** The public MCP response shape when generated SPICE input is not requested. */
export const CompactSimulationEvidencePayloadSchema = Schema.Struct(
  SimulationEvidencePayloadFields,
)
export type CompactSimulationEvidencePayload =
  typeof CompactSimulationEvidencePayloadSchema.Type

/** Benchmark evaluators explicitly opt into the generated netlist. */
export const SimulationEvidencePayloadSchema = Schema.Struct({
  ...SimulationEvidencePayloadFields,
  netlist: Schema.String,
})
export type SimulationEvidencePayload =
  typeof SimulationEvidencePayloadSchema.Type

export const TracePayloadSchema = Schema.Struct({
  runId: Schema.String,
  offset: Schema.Int,
  limit: Schema.Int,
  signals: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      unit: Schema.Literals(["V", "A", "W"]),
      totalSamples: Schema.Int,
      points: Schema.Array(
        Schema.Struct({
          t: Schema.Number.check(Schema.isFinite()),
          v: Schema.Number.check(Schema.isFinite()),
        }),
      ),
    }),
  ),
  missingSignalNames: Schema.Array(Schema.String),
})
export type TracePayload = typeof TracePayloadSchema.Type

export const ProjectListPayloadSchema = Schema.Struct({
  projects: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      version: Schema.Int,
      currentSnapshotId: Schema.String,
      updatedAt: Schema.String,
    }),
  ),
})

export const RunListPayloadSchema = Schema.Struct({
  runs: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      projectId: Schema.String,
      projectSnapshotId: Schema.String,
      createdAt: Schema.String,
      engine: Schema.Literals(["ngspice", "spicey"]),
      circuitHash: Schema.String,
    }),
  ),
})
