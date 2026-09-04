import { describe, expect, it, vi } from "vitest"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { buildElectricalCircuit, circuitHashOf } from "@circuit-sim/core/circuit/electrical-circuit"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"
import {
  getEditorState,
} from "@/browser/editor/editor-state"
import {
  makeCircuitWebMcpTools,
  type WebMcpActivity,
} from "@/browser/webmcp/circuit-tools"

const executeOptions = { signal: new AbortController().signal }

describe("Circuit WebMCP tools", () => {
  it("inspects, authors, and highlights through the canonical editor state", async () => {
    const registry = AtomRegistry.make()
    const activities: WebMcpActivity[] = []
    const getState = () => getEditorState(registry)
    getState().setProject(newCircuitProject("WebMCP workbench"))

    const tools = makeCircuitWebMcpTools({
      getState,
      runSimulation: vi.fn(),
      onActivity: (activity) => activities.push(activity),
    })
    const tool = (name: string) => {
      const found = tools.find((candidate) => candidate.name === name)
      if (!found) throw new Error(`Missing WebMCP tool: ${name}`)
      return found
    }
    const initialHash = circuitHashOf(buildElectricalCircuit(getState().project!))

    const authored = await tool("author_circuit").execute(
      {
        expectedCircuitHash: initialHash,
        graph: voltageDividerGraph(),
      },
      executeOptions,
    ) as { readonly _tag: string }

    expect(authored._tag).toBe("Success")
    expect(getState().historyPast).toHaveLength(1)
    expect(getState().dirty).toBe(true)
    expect(getState().ercIssues).toEqual([])
    expect(buildElectricalCircuit(getState().project!).components.map(({ refdes }) => refdes))
      .toEqual(["R1", "R2", "V1"])

    const highlighted = await tool("highlight_components").execute(
      { refdes: ["R1", "R2"] },
      executeOptions,
    ) as { readonly _tag: string }

    expect(highlighted._tag).toBe("Success")
    expect(
      getState().project!.objects
        .filter((object) => getState().selectedObjectIds.includes(object.id))
        .map((object) => object.kind === "component" ? object.refdes : object.kind),
    ).toEqual(["R1", "R2"])
    expect(activities.map(({ message }) => message)).toEqual([
      "Agent authored 3 components and 3 nets.",
      "Agent highlighted R1, R2.",
    ])
  })

  it("rejects stale writes and delegates simulation with the requested engine", async () => {
    const registry = AtomRegistry.make()
    const getState = () => getEditorState(registry)
    const runSimulation = vi.fn().mockResolvedValue({
      _tag: "Success",
      data: { run: { status: "success" } },
    })
    getState().setProject(newCircuitProject("WebMCP workbench"))
    const tools = makeCircuitWebMcpTools({
      getState,
      runSimulation,
      onActivity: () => undefined,
    })
    const tool = (name: string) => {
      const found = tools.find((candidate) => candidate.name === name)
      if (!found) throw new Error(`Missing WebMCP tool: ${name}`)
      return found
    }

    const stale = await tool("author_circuit").execute(
      {
        expectedCircuitHash: "stale-hash",
        graph: voltageDividerGraph(),
      },
      executeOptions,
    ) as { readonly _tag: string; readonly error?: { readonly code: string } }
    expect(stale).toMatchObject({
      _tag: "Failure",
      error: { code: "CircuitChanged", retryable: true },
    })
    expect(getState().historyPast).toEqual([])

    const simulated = await tool("simulate_circuit").execute(
      { engine: "spicey" },
      executeOptions,
    ) as { readonly _tag: string }
    expect(simulated._tag).toBe("Success")
    expect(runSimulation).toHaveBeenCalledWith("spicey", executeOptions.signal)
  })
})

function voltageDividerGraph() {
  return {
    components: [
      { refdes: "V1", type: "dc-voltage-source", props: { voltageVolts: 12 } },
      { refdes: "R1", type: "resistor", props: { resistanceOhms: 1_400 } },
      { refdes: "R2", type: "resistor", props: { resistanceOhms: 1_000 } },
    ],
    nets: [
      {
        name: "VIN",
        terminals: [
          { refdes: "V1", pin: "positive" },
          { refdes: "R1", pin: "a" },
        ],
      },
      {
        name: "VOUT",
        terminals: [
          { refdes: "R1", pin: "b" },
          { refdes: "R2", pin: "a" },
        ],
      },
      {
        name: "GND",
        terminals: [
          { refdes: "R2", pin: "b" },
          { refdes: "V1", pin: "negative" },
        ],
      },
    ],
    groundNet: "GND",
    analysis: { durationMs: 10, timeStepMs: 0.1 },
  }
}
