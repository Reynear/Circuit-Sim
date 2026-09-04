import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client"

const endpoint = new URL(process.env.CIRCUIT_SIM_MCP_URL ?? "http://127.0.0.1:3000/mcp")
const schematicAppUri = "ui://circuit-sim/schematic/v1.html"
const schematicAppMimeType = "text/html;profile=mcp-app"
const client = new Client({ name: "circuit-sim-smoke", version: "0.1.0" })

try {
  await client.connect(new StreamableHTTPClientTransport(endpoint))

  const tools = (await client.listTools()).tools
  const toolNames = tools.map((tool) => tool.name).sort()
  assert(
    JSON.stringify(toolNames) ===
      JSON.stringify(["edit_circuit", "inspect_circuit", "render_schematic", "simulate_circuit"]),
    `Unexpected MCP tools: ${toolNames.join(", ")}`,
  )
  const renderTool = tools.find((tool) => tool.name === "render_schematic")
  assert(isRecord(renderTool), "render_schematic metadata is missing")
  assert(isRecord(renderTool._meta), "render_schematic has no MCP App metadata")
  const renderUi = objectField(renderTool._meta, "ui")
  assert(
    stringField(renderUi, "resourceUri") === schematicAppUri,
    "render_schematic points to the wrong MCP App resource",
  )
  assert(isRecord(renderTool.outputSchema), "render_schematic has no output schema")

  const schematicApp = await client.readResource({ uri: schematicAppUri })
  const appContent = schematicApp.contents[0]
  assert(appContent && "text" in appContent, "MCP App resource has no HTML")
  assert(appContent.mimeType === schematicAppMimeType, "MCP App resource has the wrong MIME type")
  assert(appContent.text.includes("ui/initialize"), "MCP App omits its initialization handshake")
  assert(appContent.text.includes("resources/read"), "MCP App cannot read the pinned SVG resource")

  const created = contentOf(
    await client.callTool({
      name: "edit_circuit",
      arguments: {
        _tag: "create",
        name: `MCP Smoke ${new Date().toISOString()}`,
      },
    }),
  )
  const projectId = stringField(created, "projectId")
  const version = numberField(created, "version")

  const edited = contentOf(
    await client.callTool({
      name: "edit_circuit",
      arguments: {
        _tag: "replace",
        projectId,
        expectedVersion: version,
        graph: voltageDividerGraph(),
      },
    }),
  )
  assert(numberField(edited, "version") === 2, "Replacement did not advance version")
  const browserUrl = stringField(edited, "browserUrl")
  const browserResponse = await fetch(browserUrl)
  assert(browserResponse.ok, `Browser view returned HTTP ${browserResponse.status}`)
  assert(
    (await browserResponse.text()).includes("Agent circuit unavailable") === false,
    "Browser view could not load the stored project",
  )

  const rendered = await client.callTool({
    name: "render_schematic",
    arguments: { projectId, focus: { netIds: ["net_VOUT"] } },
  })
  assert(!rendered.isError, `Schematic render failed: ${JSON.stringify(rendered.structuredContent)}`)
  assert(
    JSON.stringify(rendered.content.map((block) => block.type)) ===
      JSON.stringify(["text"]),
    "Schematic render did not return the portable text result",
  )
  const renderMetadata = contentOf(rendered)
  const visual = arrayField(renderMetadata, "visuals")[0]
  assert(isRecord(visual), "Schematic visual metadata is missing")
  const resourceUri = stringField(visual, "uri")
  const svgResource = await client.readResource({ uri: resourceUri })
  const svgContent = svgResource.contents[0]
  assert(svgContent && "blob" in svgContent, "Pinned SVG resource has no blob")
  const svg = Buffer.from(svgContent.blob, "base64").toString("utf8")
  assert(svg.includes("<svg"), "Pinned resource is not SVG")
  assert(svg.includes("focus") && svg.includes("dim"), "Focused SVG lacks highlight and dim classes")
  assert(svg.includes(">R1<") && svg.includes(">VOUT<"), "Pinned SVG lacks circuit labels")
  assert(!JSON.stringify(renderMetadata).includes("iVBOR"), "Structured metadata contains PNG bytes")
  const pinnedBrowserUrl = stringField(visual, "browserUrl")
  const pinnedBrowserResponse = await fetch(pinnedBrowserUrl)
  assert(pinnedBrowserResponse.ok, `Pinned browser view returned HTTP ${pinnedBrowserResponse.status}`)
  assert(
    (await pinnedBrowserResponse.text()).includes("Agent circuit unavailable") === false,
    "Pinned browser view could not load the rendered snapshot",
  )

  const evidence = contentOf(
    await client.callTool({
      name: "simulate_circuit",
      arguments: { projectId },
    }),
  )
  const run = objectField(evidence, "run")
  const diagnostics = objectField(evidence, "diagnostics")
  const errors = arrayField(diagnostics, "errors")
  assert(errors.length === 0, `Simulation errors: ${JSON.stringify(errors)}`)
  const vout = arrayField(evidence, "netVoltages").find(
    (entry) => isRecord(entry) && entry.name === "VOUT",
  )
  assert(isRecord(vout), "VOUT observation is missing")
  assert(
    typeof vout.voltage === "number" && Math.abs(vout.voltage - 2.5) < 0.05,
    `Expected VOUT near 2.5V, received ${String(vout.voltage)}`,
  )

  process.stdout.write(
    `${JSON.stringify({
      endpoint: endpoint.href,
      projectId,
      version: 2,
      runId: stringField(run, "id"),
      status: stringField(run, "status"),
      voutVolts: vout.voltage,
      browserUrl,
      pinnedBrowserUrl,
      schematicMimeType: stringField(visual, "mimeType"),
      schematicSvgBytes: Buffer.byteLength(svg),
      schematicAppUri,
      schematicAppBytes: Buffer.byteLength(appContent.text),
    })}\n`,
  )
} finally {
  await client.close()
}

function voltageDividerGraph() {
  return {
    components: [
      {
        type: "dc-voltage-source",
        refdes: "V1",
        props: { voltageVolts: 5 },
      },
      { type: "resistor", refdes: "R1", props: { resistanceOhms: 10_000 } },
      { type: "resistor", refdes: "R2", props: { resistanceOhms: 10_000 } },
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

function contentOf(result) {
  if (result.isError) {
    throw new Error(`MCP tool failed: ${JSON.stringify(result.structuredContent)}`)
  }
  assert(isRecord(result.structuredContent), "Tool returned no structured content")
  return result.structuredContent
}

function objectField(record, key) {
  const value = record[key]
  assert(isRecord(value), `${key} must be an object`)
  return value
}

function arrayField(record, key) {
  const value = record[key]
  assert(Array.isArray(value), `${key} must be an array`)
  return value
}

function stringField(record, key) {
  const value = record[key]
  assert(typeof value === "string", `${key} must be a string`)
  return value
}

function numberField(record, key) {
  const value = record[key]
  assert(typeof value === "number", `${key} must be a number`)
  return value
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
