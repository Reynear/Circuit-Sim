import { Schema } from "effect"
import { SignalsSchema } from "./signals"

const spiceEnginePreferences = ["ngspice", "spicey"] as const
export const SpiceEnginePreferenceSchema = Schema.Literals(
  spiceEnginePreferences,
)
export type SpiceEnginePreference = typeof SpiceEnginePreferenceSchema.Type

export const CircuitHashSchema = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{16}$/),
)

export const SimulationDiagnosticsSchema = Schema.Struct({
  warnings: Schema.Array(Schema.String),
  errors: Schema.Array(Schema.String),
  suggestions: Schema.Array(Schema.String),
  unsupportedComponents: Schema.Array(Schema.String),
  floatingPins: Schema.Array(Schema.String),
  rawOutput: Schema.optionalKey(Schema.String),
})

/** Boundary value returned by a simulator. Persistence metadata does not belong here. */
export const SimulationOutputSchema = Schema.Struct({
  circuitHash: CircuitHashSchema,
  engine: SpiceEnginePreferenceSchema,
  netlist: Schema.String,
  signals: SignalsSchema,
  diagnostics: SimulationDiagnosticsSchema,
  notes: Schema.Array(Schema.String),
})
export type SimulationOutput = typeof SimulationOutputSchema.Type
export type EncodedSimulationOutput = typeof SimulationOutputSchema.Encoded

export type SimulationStatus = "success" | "partial" | "failed"

export function simulationStatus(output: SimulationOutput): SimulationStatus {
  if (output.diagnostics.errors.length > 0) return "failed"
  return output.diagnostics.warnings.length > 0 ||
    output.diagnostics.suggestions.length > 0 ||
    output.diagnostics.unsupportedComponents.length > 0 ||
    output.diagnostics.floatingPins.length > 0
    ? "partial"
    : "success"
}
