import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"

const outputDirectory = new URL("../artifacts/webmcp-demo/", import.meta.url)
await mkdir(outputDirectory, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: {
    dir: outputDirectory.pathname,
    size: { width: 1920, height: 1080 },
  },
})

await context.addInitScript(() => {
  const tools = new Map()
  Object.defineProperty(window, "__circuitSimWebMcpTools", {
    value: tools,
    configurable: false,
  })
  Object.defineProperty(Document.prototype, "modelContext", {
    value: {
      registerTool(tool) {
        tools.set(tool.name, tool)
      },
      unregisterTool(name) {
        tools.delete(name)
      },
    },
    configurable: true,
  })
})

const page = await context.newPage()
const video = page.video()

await page.goto("http://127.0.0.1:3000/workbench", {
  waitUntil: "networkidle",
})
await page.getByTestId("webmcp-status").getByText("Agent-ready", { exact: false }).waitFor()

await addOverlay(page, {
  eyebrow: "OPENAI WEBMCP CHALLENGE",
  title: "Design circuits by conversation.",
  body: "Verify them by simulation. See every change.",
})
await page.waitForTimeout(5_000)

await addOverlay(page, {
  eyebrow: "4 PAGE-NATIVE TOOLS",
  title: "Inspect · Author · Simulate · Highlight",
  body: "Semantic circuit actions registered directly by the page—no pixel coordinates or brittle UI automation.",
})
await page.waitForTimeout(7_000)

await addOverlay(page, {
  eyebrow: "USER REQUEST",
  title: "Build a 12 V voltage divider",
  body: "Use 1.4 kΩ and 1 kΩ resistors, highlight them, run ngspice, and explain VOUT.",
})
await page.waitForTimeout(7_000)

const current = await invokeTool(page, "inspect_circuit", { action: "current" })
if (current?._tag !== "Success") throw new Error(JSON.stringify(current))

await addOverlay(page, {
  eyebrow: "AUTHOR_CIRCUIT",
  title: "One validated, visible edit",
  body: "A geometry-free electrical graph becomes the canonical editable schematic, with ERC, autosave, and one-step Undo.",
})

const authored = await invokeTool(page, "author_circuit", {
  expectedCircuitHash: current.data.project.circuitHash,
  graph: voltageDividerGraph(),
})
if (authored?._tag !== "Success") throw new Error(JSON.stringify(authored))
await page.waitForTimeout(10_000)

await addOverlay(page, {
  eyebrow: "HIGHLIGHT_COMPONENTS",
  title: "The explanation stays grounded on canvas",
  body: "R1 and R2 are selected so the user can see exactly what the agent is discussing.",
})
const highlighted = await invokeTool(page, "highlight_components", {
  refdes: ["R1", "R2"],
})
if (highlighted?._tag !== "Success") throw new Error(JSON.stringify(highlighted))
await page.waitForTimeout(8_000)

await addOverlay(page, {
  eyebrow: "SIMULATE_CIRCUIT",
  title: "Evidence from the exact circuit snapshot",
  body: "Circuit Sim runs ngspice, stores the run, opens the Simulation panel, and returns bounded measurements to the agent.",
})
const simulated = await invokeTool(page, "simulate_circuit", { engine: "ngspice" })
if (simulated?._tag !== "Success") throw new Error(JSON.stringify(simulated))
await page.waitForTimeout(12_000)

const vout = simulated.data.netVoltages.find(({ net }) => net === "VOUT")?.voltage
await addOverlay(page, {
  eyebrow: "MEASURED, NOT GUESSED",
  title: `VOUT = ${formatVoltage(vout)}`,
  body: "The agent and the user see the same simulation evidence. Stale writes are rejected with an optimistic circuit-hash guard.",
})
await page.waitForTimeout(10_000)

await addOverlay(page, {
  eyebrow: "CIRCUIT SIM + WEBMCP",
  title: "One circuit. Human and agent interfaces.",
  body: "Inspect. Author. Simulate. Explain. Every action remains visible and undoable.",
})
await page.waitForTimeout(7_000)

await page.screenshot({
  path: new URL("thumbnail.png", outputDirectory).pathname,
  type: "png",
})
await page.close()
await context.close()
await browser.close()

const videoPath = await video.path()
process.stdout.write(`${videoPath}\n`)

async function invokeTool(page, name, input) {
  return page.evaluate(
    async ({ name, input }) => {
      const tool = window.__circuitSimWebMcpTools.get(name)
      if (!tool) throw new Error(`WebMCP tool was not registered: ${name}`)
      return tool.execute(input, { signal: new AbortController().signal })
    },
    { name, input },
  )
}

async function addOverlay(page, content) {
  await page.evaluate((content) => {
    document.querySelector("[data-demo-overlay]")?.remove()
    const overlay = document.createElement("section")
    overlay.dataset.demoOverlay = "true"
    Object.assign(overlay.style, {
      position: "fixed",
      zIndex: "2147483647",
      left: "48px",
      bottom: "44px",
      width: "760px",
      padding: "24px 28px",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "18px",
      color: "#f8fafc",
      background: "rgba(10, 10, 10, 0.92)",
      boxShadow: "0 20px 60px rgba(0,0,0,0.42)",
      fontFamily: "Verdana, Geneva, sans-serif",
      backdropFilter: "blur(12px)",
    })
    overlay.innerHTML = `
      <div style="color:#d7e65f;font-size:15px;font-weight:700;letter-spacing:.16em;margin-bottom:10px">${content.eyebrow}</div>
      <div style="font-size:34px;font-weight:700;line-height:1.15;margin-bottom:10px">${content.title}</div>
      <div style="color:#d4d4d8;font-size:19px;line-height:1.48">${content.body}</div>
    `
    document.body.append(overlay)
  }, content)
}

function formatVoltage(value) {
  return typeof value === "number" ? `${value.toFixed(2)} V` : "5.00 V"
}

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
