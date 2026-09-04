import { Client, InMemoryTransport } from "@modelcontextprotocol/client"
import { DateTime, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import {
  AgentElectricalGraphSchema,
  compileAgentElectricalGraph,
} from "@circuit-sim/core/agent/electrical-graph"
import {
  buildElectricalCircuit,
  circuitHashOf,
} from "@circuit-sim/core/circuit/electrical-circuit"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"
import { newId } from "@circuit-sim/core/ids"
import { observeRun } from "@circuit-sim/core/simulation/run-observations"
import type { SimulationRun } from "@circuit-sim/core/simulation/simulation-run"
import {
  AgentIdentity,
  AgentOwnerIdSchema,
  AgentProjectRepository,
  AgentProjectRepositoryUnavailable,
  AgentProjectNotFound,
  AgentProjectSnapshotNotFound,
  type AgentProjectRepositoryShape,
  type StoredAgentProject,
} from "@circuit-sim/core/agent/project-workflow"
import {
  AgentSimulationRepository,
  AgentSimulationRepositoryUnavailable,
  AgentSimulator,
  AgentSimulatorUnavailable,
  type AgentSimulationRepositoryShape,
} from "@circuit-sim/core/agent/simulation-workflow"
import {
  createCircuitMcpServer,
  simulationEvidencePayload,
} from "@/server/mcp/circuit-mcp.server"
import {
  MCP_APP_MIME_TYPE,
  SCHEMATIC_APP_RESOURCE_URI,
} from "@/server/mcp/schematic-app-resource.server"
import { schematicResourceUri } from "@/server/mcp/schematic-visual-contract.server"
import { piResult } from "../../../../benchmarks/clients/pi/circuit-sim-mcp"

describe("Circuit Sim MCP server", () => {
  const disposals: Array<() => Promise<void>> = []

  afterEach(async () => {
    await Promise.all(disposals.splice(0).map((dispose) => dispose()))
  })

  it("advertises the four deliberate tools, pinned SVG resource, and modeled catalog", async () => {
    const runtime = unavailableRuntime()
    const server = createCircuitMcpServer(runtime)
    const client = new Client({ name: "circuit-sim-test", version: "0.1.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    disposals.push(async () => {
      await client.close()
      await server.close()
      await runtime.dispose()
    })

    await server.connect(serverTransport)
    await client.connect(clientTransport)

    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "edit_circuit",
      "inspect_circuit",
      "render_schematic",
      "simulate_circuit",
    ])
    expect(
      (await client.listResourceTemplates()).resourceTemplates,
    ).toEqual([
      expect.objectContaining({
        name: "pinned-schematic-svg",
        uriTemplate: expect.stringContaining("/snapshots/{snapshotId}/schematic/"),
        mimeType: "image/svg+xml",
      }),
    ])
    expect(
      JSON.stringify(
        tools.tools.find((tool) => tool.name === "edit_circuit")?.inputSchema,
      ),
    ).toContain('"groundNet"')
    const renderTool = tools.tools.find((tool) => tool.name === "render_schematic")
    expect(renderTool).toMatchObject({
      outputSchema: expect.objectContaining({ type: "object" }),
      _meta: {
        ui: { resourceUri: SCHEMATIC_APP_RESOURCE_URI },
        "openai/outputTemplate": SCHEMATIC_APP_RESOURCE_URI,
      },
    })

    const appResource = await client.readResource({
      uri: SCHEMATIC_APP_RESOURCE_URI,
    })
    const appContent = appResource.contents[0]
    expect(appContent).toMatchObject({
      uri: SCHEMATIC_APP_RESOURCE_URI,
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
    })
    if (!appContent || !("text" in appContent)) {
      throw new Error("schematic app resource omitted its HTML")
    }
    expect(appContent.text).toContain("ui/initialize")
    expect(appContent.text).toContain("ui/notifications/tool-result")
    expect(appContent.text).toContain('request("resources/read"')
    expect(appContent.text).toContain("ui/resource-teardown")
    expect(appContent.text).not.toMatch(/<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i)

    const result = await client.callTool({
      name: "inspect_circuit",
      arguments: { _tag: "catalog" },
    })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      components: expect.arrayContaining([
        expect.objectContaining({
          type: "resistor",
          terminals: [
            expect.objectContaining({ key: "a" }),
            expect.objectContaining({ key: "b" }),
          ],
        }),
        expect.objectContaining({
          type: "dc-current-source",
          semantics: expect.objectContaining({
            currentFlowsFrom: "positive",
            currentFlowsTo: "negative",
          }),
        }),
        expect.objectContaining({
          type: "dc-power-rail",
          terminals: [expect.objectContaining({ key: "rail" })],
          semantics: expect.objectContaining({
            referenceNet: "GND",
            referenceIsImplicit: true,
          }),
        }),
        expect.objectContaining({
          type: "pulse-voltage-source",
          semantics: expect.objectContaining({
            ngspicePrimitive: "PULSE",
            dutyCycleRange: "0 < dutyCyclePercent < 100",
          }),
        }),
      ]),
    })

    const instructions = await client.callTool({
      name: "inspect_circuit",
      arguments: { _tag: "instructions" },
    })
    expect(instructions.structuredContent).toMatchObject({
      instructions: expect.stringContaining(
        "positive current flows from terminal positive to terminal negative",
      ),
    })
    expect(instructions.structuredContent).toMatchObject({
      instructions: expect.stringContaining(
        "set groundNet to the name of exactly one submitted net",
      ),
    })
    expect(instructions.structuredContent).toMatchObject({
      instructions: expect.stringContaining(
        "dc-power-rail is a one-terminal DC source referenced internally to canonical GND",
      ),
    })
    expect(instructions.structuredContent).toMatchObject({
      instructions: expect.stringContaining(
        "pulse-voltage-source is a two-terminal transient source lowered to NGSpice PULSE",
      ),
    })
  })

  it("keeps raw simulator output out of compact agent evidence", () => {
    const project = compileAgentElectricalGraph(
      newCircuitProject("Compact evidence"),
      {
        components: [
          {
            type: "dc-voltage-source",
            refdes: "V1",
            props: { voltageVolts: 5 },
          },
        ],
        nets: [
          {
            name: "VIN",
            terminals: [{ refdes: "V1", pin: "positive" }],
          },
          {
            name: "GND",
            terminals: [{ refdes: "V1", pin: "negative" }],
          },
        ],
        groundNet: "GND",
        analysis: { durationMs: 10, timeStepMs: 0.1 },
      },
    )
    const run: SimulationRun = {
      id: newId(),
      projectId: project.id,
      projectSnapshotId: newId(),
      createdAt: DateTime.nowUnsafe(),
      circuitHash: circuitHashOf(buildElectricalCircuit(project)),
      engine: "ngspice",
      netlist: "generated netlist that is opt-in",
      signals: [],
      diagnostics: {
        warnings: [],
        errors: [],
        suggestions: [],
        unsupportedComponents: [],
        floatingPins: [],
        rawOutput: "large raw simulator output",
      },
      notes: [],
    }
    const evidence = {
      run,
      observation: observeRun(project, run),
      diagnostics: run.diagnostics,
      netlist: run.netlist,
    }

    const compact = simulationEvidencePayload(evidence)
    expect(compact).not.toHaveProperty("netlist")
    expect(compact.diagnostics).not.toHaveProperty("rawOutput")
    expect(simulationEvidencePayload(evidence, true)).toMatchObject({
      netlist: run.netlist,
      diagnostics: { warnings: [], errors: [] },
    })
    expect(
      simulationEvidencePayload(evidence, true).diagnostics,
    ).not.toHaveProperty("rawOutput")
  })

  it("returns a portable result and a readable pinned SVG for one exact snapshot", async () => {
    const stored = renderableStoredProject()
    const runtime = renderableRuntime(stored)
    const server = createCircuitMcpServer(runtime)
    const client = new Client({ name: "circuit-sim-visual-test", version: "0.1.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    disposals.push(async () => {
      await client.close()
      await server.close()
      await runtime.dispose()
    })
    await server.connect(serverTransport)
    await client.connect(clientTransport)

    const inspection = await client.callTool({
      name: "inspect_circuit",
      arguments: { _tag: "get_project", projectId: stored.project.id },
    })
    expect(inspection.structuredContent).toMatchObject({
      currentSnapshotId: stored.currentSnapshotId,
      visualFocus: {
        objects: expect.arrayContaining([
          expect.objectContaining({ kind: "component", label: "R1" }),
        ]),
        nets: expect.arrayContaining([
          expect.objectContaining({ name: "VOUT" }),
        ]),
      },
    })

    const rendered = await client.callTool({
      name: "render_schematic",
      arguments: {
        projectId: stored.project.id,
        focus: { netIds: ["net_VOUT"] },
      },
    })
    expect(rendered.isError).not.toBe(true)
    expect(rendered.content.map((item) => item.type)).toEqual(["text"])
    expect(rendered.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("View pinned snapshot:"),
    })
    expect(JSON.stringify(rendered.structuredContent)).not.toContain("iVBOR")

    const uri = schematicResourceUri(
      {
        projectId: stored.project.id,
        snapshotId: stored.currentSnapshotId,
        circuitHash: circuitHashOf(buildElectricalCircuit(stored.project)),
      },
      { netIds: ["net_VOUT"] },
    )
    const resource = await client.readResource({ uri })
    const contents = resource.contents[0]
    expect(contents).toMatchObject({ mimeType: "image/svg+xml" })
    if (!contents || !("blob" in contents)) {
      throw new Error("pinned schematic resource omitted SVG blob data")
    }
    const svg = Buffer.from(contents.blob, "base64").toString("utf8")
    expect(svg).toContain("<svg")
    expect(svg).toContain("focus")
    expect(svg).toContain("dim")
  })

  it("keeps the text-only Pi fallback useful without copying inline image bytes", () => {
    const encoded = "A".repeat(20_000)
    const result = piResult({
      content: [
        { type: "text", text: "Pinned circuit" },
        { type: "image", mimeType: "image/png", data: encoded },
        {
          type: "resource_link",
          uri: "circuit-sim://projects/pinned.svg",
          name: "circuit-schematic.svg",
          title: "Pinned SVG",
        },
      ],
      structuredContent: { visuals: [{ kind: "schematic" }] },
    })
    expect(JSON.stringify(result)).not.toContain(encoded)
    expect(result.content.map((item) => item.text).join("\n")).toContain(
      "circuit-sim://projects/pinned.svg",
    )
  })

  it("keeps historical snapshot visuals immutable and rejects tampered resource identities", async () => {
    const current = renderableStoredProject()
    const historical = renderableStoredProject({
      projectId: current.project.id,
      ownerId: current.ownerId,
      resistanceOhms: 3_000,
      version: 1,
    })
    const runtime = renderableRuntime(current, [historical, current])
    const server = createCircuitMcpServer(runtime)
    const client = new Client({ name: "circuit-sim-history-test", version: "0.1.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    disposals.push(async () => {
      await client.close()
      await server.close()
      await runtime.dispose()
    })
    await server.connect(serverTransport)
    await client.connect(clientTransport)

    const expectedHash = circuitHashOf(buildElectricalCircuit(historical.project))
    const rendered = await client.callTool({
      name: "render_schematic",
      arguments: {
        projectId: current.project.id,
        snapshotId: historical.currentSnapshotId,
      },
    })
    expect(rendered.structuredContent).toMatchObject({
      snapshot: {
        projectId: current.project.id,
        snapshotId: historical.currentSnapshotId,
        circuitHash: expectedHash,
      },
    })
    const uri = schematicResourceUri(
      {
        projectId: current.project.id,
        snapshotId: historical.currentSnapshotId,
        circuitHash: expectedHash,
      },
      undefined,
    )
    const resource = await client.readResource({ uri })
    const contents = resource.contents[0]
    if (!contents || !("blob" in contents)) throw new Error("historical SVG blob missing")
    const svg = Buffer.from(contents.blob, "base64").toString("utf8")
    expect(svg).toContain("3k")
    expect(uri).toContain(`/snapshots/${historical.currentSnapshotId}/`)
    expect(uri).toContain(`/schematic/${expectedHash}/`)

    const wrongHash = uri.replace(
      `/schematic/${expectedHash}/`,
      "/schematic/tampered/",
    )
    await expect(client.readResource({ uri: wrongHash })).rejects.toThrow()
    const wrongSnapshot = uri.replace(
      `/snapshots/${historical.currentSnapshotId}/`,
      `/snapshots/${newId()}/`,
    )
    await expect(client.readResource({ uri: wrongSnapshot })).rejects.toThrow()
  })
})

function renderableStoredProject(options: {
  readonly projectId?: string
  readonly ownerId?: StoredAgentProject["ownerId"]
  readonly resistanceOhms?: number
  readonly version?: number
} = {}): StoredAgentProject {
  const graph = Schema.decodeUnknownSync(AgentElectricalGraphSchema)({
    components: [
      { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 5 } },
      { type: "resistor", refdes: "R1", props: { resistanceOhms: 1_000 } },
      {
        type: "resistor",
        refdes: "R2",
        props: { resistanceOhms: options.resistanceOhms ?? 2_000 },
      },
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
  })
  const base = newCircuitProject("MCP voltage divider")
  return {
    ownerId: options.ownerId ?? Schema.decodeUnknownSync(AgentOwnerIdSchema)("visual-mcp-test"),
    version: options.version ?? 2,
    currentSnapshotId: newId(),
    project: compileAgentElectricalGraph(
      options.projectId === undefined ? base : { ...base, id: options.projectId },
      graph,
    ),
  }
}

function renderableRuntime(
  stored: StoredAgentProject,
  snapshots: ReadonlyArray<StoredAgentProject> = [stored],
) {
  const projectRepository: AgentProjectRepositoryShape = {
    create: () => Effect.die("not used"),
    list: () => Effect.succeed([]),
    get: (ownerId, projectId) =>
      ownerId === stored.ownerId && projectId === stored.project.id
        ? Effect.succeed(stored)
        : Effect.fail(new AgentProjectNotFound({ projectId })),
    getSnapshot: (ownerId, projectId, snapshotId) =>
      Effect.suspend(() => {
        const snapshot = snapshots.find(
          (candidate) =>
            ownerId === candidate.ownerId &&
            projectId === candidate.project.id &&
            snapshotId === candidate.currentSnapshotId,
        )
        return snapshot
          ? Effect.succeed(snapshot)
          : Effect.fail(new AgentProjectSnapshotNotFound({ projectId, snapshotId }))
      }),
    replaceAtVersion: () => Effect.die("not used"),
  }
  const simulationRepository: AgentSimulationRepositoryShape = {
    insert: () => Effect.die("not used"),
    get: () => Effect.die("not used"),
    listByProject: () => Effect.succeed([]),
  }
  return ManagedRuntime.make(
    Layer.mergeAll(
      Layer.succeed(AgentIdentity, { ownerId: stored.ownerId }),
      Layer.succeed(AgentProjectRepository, projectRepository),
      Layer.succeed(AgentSimulationRepository, simulationRepository),
      Layer.succeed(AgentSimulator, {
        run: () => Effect.die("not used"),
      }),
    ),
  )
}

function unavailableRuntime() {
  const projectRepository: AgentProjectRepositoryShape = {
    create: () =>
      Effect.fail(new AgentProjectRepositoryUnavailable({ operation: "create" })),
    list: () =>
      Effect.fail(new AgentProjectRepositoryUnavailable({ operation: "list" })),
    get: () =>
      Effect.fail(new AgentProjectRepositoryUnavailable({ operation: "get" })),
    getSnapshot: () =>
      Effect.fail(
        new AgentProjectRepositoryUnavailable({ operation: "get_snapshot" }),
      ),
    replaceAtVersion: () =>
      Effect.fail(new AgentProjectRepositoryUnavailable({ operation: "replace" })),
  }
  const simulationRepository: AgentSimulationRepositoryShape = {
    insert: () =>
      Effect.fail(
        new AgentSimulationRepositoryUnavailable({ operation: "insert" }),
      ),
    get: () =>
      Effect.fail(
        new AgentSimulationRepositoryUnavailable({ operation: "get" }),
      ),
    listByProject: () =>
      Effect.fail(
        new AgentSimulationRepositoryUnavailable({ operation: "list" }),
      ),
  }
  const layer = Layer.mergeAll(
    Layer.succeed(AgentIdentity, {
      ownerId: Schema.decodeUnknownSync(AgentOwnerIdSchema)("test-owner"),
    }),
    Layer.succeed(AgentProjectRepository, projectRepository),
    Layer.succeed(AgentSimulationRepository, simulationRepository),
    Layer.succeed(AgentSimulator, {
      run: () =>
        Effect.fail(
          new AgentSimulatorUnavailable({ message: "unavailable in catalog test" }),
        ),
    }),
  )
  return ManagedRuntime.make(layer)
}
