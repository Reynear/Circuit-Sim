import { Option, Schema } from "effect"
import { createSourceToGroundExample } from "@/examples/circuit-projects"
import { runSpiceSimulation } from "@/server/simulation/engines/spicey"
import {
  SimulationOutputSchema,
  simulationStatus,
} from "@circuit-sim/core/simulation/result"
import { SignalSchema } from "@circuit-sim/core/simulation/signals"

describe("simulation output schema", () => {
  it("contains simulator output without persistence metadata", () => {
    const output = runSpiceSimulation(createSourceToGroundExample())

    const encoded = Schema.encodeSync(SimulationOutputSchema)(output)
    const decoded = Schema.decodeSync(SimulationOutputSchema)(encoded)

    expect(decoded).not.toHaveProperty("id")
    expect(decoded).not.toHaveProperty("createdAt")
    expect(decoded).not.toHaveProperty("status")
    expect(simulationStatus(decoded)).toBe("success")
  })

  it("rejects incomplete signals at an unknown-data boundary", () => {
    const decoded = Schema.decodeUnknownOption(SignalSchema)({
      points: [{ t: 0, v: 5 }],
    })

    expect(Option.isNone(decoded)).toBe(true)
  })
})
