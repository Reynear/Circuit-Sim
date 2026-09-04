import { Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  AgentElectricalGraphSchema,
  compileAgentElectricalGraph,
} from "@circuit-sim/core/agent/electrical-graph"
import {
  AgentIdentity,
  AgentOwnerIdSchema,
  AgentProjectNotFound,
  AgentProjectRepository,
  AgentProjectSnapshotNotFound,
  type AgentProjectRepositoryShape,
  type StoredAgentProject,
} from "@circuit-sim/core/agent/project-workflow"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"
import { newId } from "@circuit-sim/core/ids"
import {
  SchematicErcBlocked,
  SchematicSnapshotHashMismatch,
  ensureRenderableErc,
  renderAgentSchematic,
} from "@/server/schematic/render-agent-schematic.server"
import { SchematicVisualCache } from "@/server/schematic/schematic-visual-cache.server"

describe("agent schematic rendering workflow", () => {
  it("pins the current snapshot and returns a bounded PNG plus both viewer links", () => {
    const stored = fixtureStoredProject()
    const output = Effect.runSync(
      provide(
        renderAgentSchematic(
          { projectId: stored.project.id },
          {
            cache: new SchematicVisualCache(),
            publicUrl: "https://circuits.example",
          },
        ),
        stored,
      ),
    )

    expect(output.snapshot.snapshotId).toBe(stored.currentSnapshotId)
    expect(output.svg).toContain("R1")
    expect(Buffer.from(output.png.pngBase64, "base64").subarray(1, 4).toString()).toBe("PNG")
    expect(output.png.width).toBeLessThanOrEqual(1_600)
    expect(output.png.height).toBeLessThanOrEqual(1_600)
    expect(output.browserUrl).toContain(`snapshotId=${stored.currentSnapshotId}`)
    expect(output.browserUrl).toContain(`circuitHash=${output.snapshot.circuitHash}`)
    expect(output.currentProjectUrl).toBe(
      `https://circuits.example/agent-projects/${stored.project.id}`,
    )
  })

  it("rejects a pinned resource whose circuit hash no longer matches", () => {
    const stored = fixtureStoredProject()
    const failure = Effect.runSync(
      Effect.flip(
        provide(
          renderAgentSchematic(
            {
              projectId: stored.project.id,
              snapshotId: stored.currentSnapshotId,
            },
            {
              expectedCircuitHash: "wrong-hash",
              cache: new SchematicVisualCache(),
            },
          ),
          stored,
        ),
      ),
    )
    expect(failure).toBeInstanceOf(SchematicSnapshotHashMismatch)
  })

  it("blocks ERC errors while allowing warnings to proceed", () => {
    const projectId = newId()
    const snapshotId = newId()
    expect(
      Effect.runSync(
        ensureRenderableErc(projectId, snapshotId, [
          { id: newId(), severity: "warning", message: "Review this" },
        ]),
      ),
    ).toBeUndefined()

    const failure = Effect.runSync(
      Effect.flip(
        ensureRenderableErc(projectId, snapshotId, [
          { id: newId(), severity: "error", message: "Cannot render safely" },
        ]),
      ),
    )
    expect(failure).toBeInstanceOf(SchematicErcBlocked)
    expect(failure.issues).toHaveLength(1)
  })
})

function fixtureStoredProject(): StoredAgentProject {
  const graph = Schema.decodeUnknownSync(AgentElectricalGraphSchema)({
    components: [
      { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 5 } },
      { type: "resistor", refdes: "R1", props: { resistanceOhms: 1_000 } },
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
        name: "GND",
        terminals: [
          { refdes: "V1", pin: "negative" },
          { refdes: "R1", pin: "b" },
        ],
      },
    ],
    groundNet: "GND",
    analysis: { durationMs: 10, timeStepMs: 0.1 },
  })
  return {
    ownerId: Schema.decodeUnknownSync(AgentOwnerIdSchema)("visual-test"),
    version: 2,
    currentSnapshotId: newId(),
    project: compileAgentElectricalGraph(
      newCircuitProject("Rendered divider"),
      graph,
    ),
  }
}

function provide<A, E>(
  effect: Effect.Effect<A, E, AgentIdentity | AgentProjectRepository>,
  stored: StoredAgentProject,
): Effect.Effect<A, E> {
  const repository: AgentProjectRepositoryShape = {
    create: () => Effect.die("not used"),
    list: () => Effect.succeed([]),
    get: (ownerId, projectId) =>
      ownerId === stored.ownerId && projectId === stored.project.id
        ? Effect.succeed(stored)
        : Effect.fail(new AgentProjectNotFound({ projectId })),
    getSnapshot: (ownerId, projectId, snapshotId) =>
      ownerId === stored.ownerId &&
      projectId === stored.project.id &&
      snapshotId === stored.currentSnapshotId
        ? Effect.succeed(stored)
        : Effect.fail(new AgentProjectSnapshotNotFound({ projectId, snapshotId })),
    replaceAtVersion: () => Effect.die("not used"),
  }
  return effect.pipe(
    Effect.provideService(AgentIdentity, { ownerId: stored.ownerId }),
    Effect.provideService(AgentProjectRepository, repository),
  )
}
