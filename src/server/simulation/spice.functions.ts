import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { CircuitProjectSchema } from "../../lib/schematic/schemas"
import type { CircuitProject } from "../../lib/schematic/types"
import { runServerSpiceSimulation } from "./spice.server"

const SpiceSimulationInputSchema = z.object({
  project: CircuitProjectSchema,
  engine: z.enum(["auto", "ngspice", "spicey"]).default("auto"),
})

export const runSpiceSimulationOnServer = createServerFn({ method: "POST" })
  .inputValidator((raw) => SpiceSimulationInputSchema.parse(raw))
  .handler(async ({ data }) => {
    return (await runServerSpiceSimulation({
      project: data.project as CircuitProject,
      engine: data.engine,
    })) as never
  })
