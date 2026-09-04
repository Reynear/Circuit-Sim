import { DateTime, Effect, Schema } from "effect"
import {
  AgentIdentity,
  AgentOwnerIdSchema,
  AgentProjectNotFound,
  AgentProjectRepository,
  AgentProjectRepositoryUnavailable,
  type AgentProjectRepositoryShape,
  type StoredAgentProject,
} from "@circuit-sim/core/agent/project-workflow"
import {
  AgentSimulationRepository,
  AgentSimulationRepositoryUnavailable,
  AgentSimulationRunNotFound,
  getAgentSimulationRun,
  type AgentSimulationRepositoryShape,
} from "@circuit-sim/core/agent/simulation-workflow"
import { compileAgentElectricalGraph } from "@circuit-sim/core/agent/electrical-graph"
import {
  buildElectricalCircuit,
  circuitHashOf,
} from "@circuit-sim/core/circuit/electrical-circuit"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"
import { newId } from "@circuit-sim/core/ids"
import type { SimulationRun } from "@circuit-sim/core/simulation/simulation-run"

describe("agent simulation evidence", () => {
  it("reconstructs a stored run from its immutable project snapshot", async () => {
    const ownerId = Schema.decodeUnknownSync(AgentOwnerIdSchema)("snapshot-test")
    const original = compileAgentElectricalGraph(
      newCircuitProject("Original divider"),
      dividerGraph(),
    )
    const originalSnapshot: StoredAgentProject = {
      ownerId,
      version: 2,
      currentSnapshotId: newId(),
      project: original,
    }
    const current: StoredAgentProject = {
      ...originalSnapshot,
      version: 3,
      currentSnapshotId: newId(),
      project: compileAgentElectricalGraph(original, sourceGraph()),
    }
    const run: SimulationRun = {
      id: newId(),
      projectId: original.id,
      projectSnapshotId: originalSnapshot.currentSnapshotId,
      createdAt: DateTime.nowUnsafe(),
      circuitHash: circuitHashOf(buildElectricalCircuit(original)),
      engine: "ngspice",
      netlist: "test netlist\n",
      signals: [],
      diagnostics: {
        warnings: [],
        errors: [],
        suggestions: [],
        unsupportedComponents: [],
        floatingPins: [],
      },
      notes: [],
    }
    let requestedSnapshotId: string | undefined

    const evidence = await Effect.runPromise(
      getAgentSimulationRun(run.id).pipe(
        Effect.provideService(AgentIdentity, { ownerId }),
        Effect.provideService(
          AgentProjectRepository,
          projectRepository({
            current,
            originalSnapshot,
            onSnapshot: (snapshotId) => {
              requestedSnapshotId = snapshotId
            },
          }),
        ),
        Effect.provideService(
          AgentSimulationRepository,
          simulationRepository(ownerId, run),
        ),
      ),
    )

    expect(requestedSnapshotId).toBe(originalSnapshot.currentSnapshotId)
    expect(evidence.run.projectSnapshotId).toBe(originalSnapshot.currentSnapshotId)
    expect(evidence.observation.run.stale).toBe(false)
    expect(evidence.observation.circuit.components).toHaveLength(3)
  })
})

function projectRepository(input: {
  readonly current: StoredAgentProject
  readonly originalSnapshot: StoredAgentProject
  readonly onSnapshot: (snapshotId: string) => void
}): AgentProjectRepositoryShape {
  return {
    create: () =>
      Effect.fail(new AgentProjectRepositoryUnavailable({ operation: "create" })),
    list: () =>
      Effect.fail(new AgentProjectRepositoryUnavailable({ operation: "list" })),
    get: (_ownerId, projectId) =>
      projectId === input.current.project.id
        ? Effect.succeed(input.current)
        : Effect.fail(new AgentProjectNotFound({ projectId })),
    getSnapshot: (_ownerId, projectId, snapshotId) => {
      input.onSnapshot(snapshotId)
      return projectId === input.originalSnapshot.project.id &&
        snapshotId === input.originalSnapshot.currentSnapshotId
        ? Effect.succeed(input.originalSnapshot)
        : Effect.fail(
            new AgentProjectRepositoryUnavailable({ operation: "get_snapshot" }),
          )
    },
    replaceAtVersion: () =>
      Effect.fail(new AgentProjectRepositoryUnavailable({ operation: "replace" })),
  }
}

function simulationRepository(
  ownerId: StoredAgentProject["ownerId"],
  run: SimulationRun,
): AgentSimulationRepositoryShape {
  return {
    insert: () =>
      Effect.fail(
        new AgentSimulationRepositoryUnavailable({ operation: "insert" }),
      ),
    get: (_ownerId, runId) =>
      runId === run.id
        ? Effect.succeed({ ownerId, run })
        : Effect.fail(new AgentSimulationRunNotFound({ runId })),
    listByProject: () =>
      Effect.fail(
        new AgentSimulationRepositoryUnavailable({ operation: "list" }),
      ),
  }
}

function dividerGraph() {
  return {
    components: [
      { type: "dc-voltage-source" as const, refdes: "V1", props: { voltageVolts: 5 } },
      { type: "resistor" as const, refdes: "R1", props: { resistanceOhms: 10_000 } },
      { type: "resistor" as const, refdes: "R2", props: { resistanceOhms: 10_000 } },
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

function sourceGraph() {
  return {
    components: [
      { type: "dc-voltage-source" as const, refdes: "V1", props: { voltageVolts: 3 } },
    ],
    nets: [
      { name: "VIN", terminals: [{ refdes: "V1", pin: "positive" }] },
      { name: "GND", terminals: [{ refdes: "V1", pin: "negative" }] },
    ],
    groundNet: "GND",
    analysis: { durationMs: 10, timeStepMs: 0.1 },
  }
}
