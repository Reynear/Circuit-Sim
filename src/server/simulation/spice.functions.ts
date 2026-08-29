import { createServerFn } from "@tanstack/react-start"
import { Schema } from "effect"
import { CircuitProjectSchema } from "@circuit-sim/core/circuit/project"
import {
  SpiceEnginePreferenceSchema,
  SimulationOutputSchema,
} from "@circuit-sim/core/simulation/result"
import { runServerSpiceSimulation } from "./run-simulation.server"

const SpiceSimulationInputSchema = Schema.Struct({
  project: Schema.toEncoded(CircuitProjectSchema),
  engine: SpiceEnginePreferenceSchema,
})

export const runSpiceSimulationOnServer = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    Schema.decodeUnknownSync(SpiceSimulationInputSchema, {
      onExcessProperty: "error",
    })(raw),
  )
  .handler(async ({ data }) => {
    const project = await Schema.decodePromise(CircuitProjectSchema, {
      onExcessProperty: "error",
    })(data.project)
    const result = await runServerSpiceSimulation({ project, engine: data.engine })
    return Schema.encodePromise(SimulationOutputSchema)(result)
  })
