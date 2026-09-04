import { mkdir } from "node:fs/promises"
import { chromium } from "playwright"

const outputDirectory = new URL("../artifacts/webmcp-demo-chat/", import.meta.url)
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
await page.goto("http://127.0.0.1:3000/workbench", { waitUntil: "networkidle" })
await page.getByTestId("webmcp-status").getByText("Agent-ready", { exact: false }).waitFor()
await installRecordingShell(page)
const workbench = page
await page.waitForTimeout(2_000)

await appendMessage(page, "user", {
  text: "Design a stable beta-100 NPN bias stage from 12 V. Aim for BASE near 1.8 V, EMITTER near 1.1 V, and COLLECTOR near 10 V. Simulate it and explain how emitter degeneration stabilizes the operating point.",
})
await page.waitForTimeout(3_000)

await appendMessage(page, "assistant", {
  text: "I’ll inspect the live workbench and component catalog, author the complete electrical graph, then use ngspice evidence before answering.",
})
await page.waitForTimeout(2_000)

await appendTool(page, "inspect_circuit", "catalog", "Running")
const catalog = await invokeTool(workbench, "inspect_circuit", { action: "catalog" })
assertSuccess(catalog, "catalog inspection")
await finishTool(page, "inspect_circuit", `${catalog.data.components.length} component models`)
await page.waitForTimeout(2_000)

await appendTool(page, "inspect_circuit", "current circuit + hash", "Running")
const current = await invokeTool(workbench, "inspect_circuit", { action: "current" })
assertSuccess(current, "current-circuit inspection")
await finishTool(page, "inspect_circuit", `hash ${current.data.project.circuitHash.slice(0, 8)}`)
await page.waitForTimeout(2_000)

await appendTool(page, "author_circuit", "6 components · 5 named nets", "Running")
const authored = await invokeTool(workbench, "author_circuit", {
  expectedCircuitHash: current.data.project.circuitHash,
  graph: bjtBiasGraph(1_000),
})
assertSuccess(authored, "initial authoring")
await finishTool(page, "author_circuit", "ERC 0 · autosaved · Undo available")
await page.waitForTimeout(5_000)

await appendTool(page, "highlight_components", "Q1 · RUP · RDOWN · RC · RE", "Running")
const highlighted = await invokeTool(workbench, "highlight_components", {
  refdes: ["Q1", "RUP", "RDOWN", "RC", "RE"],
})
assertSuccess(highlighted, "component highlighting")
await finishTool(page, "highlight_components", "5 parts selected on canvas")
await page.waitForTimeout(3_000)

await appendTool(page, "simulate_circuit", "ngspice · exact circuit snapshot", "Running")
const baselineRun = await invokeTool(workbench, "simulate_circuit", { engine: "ngspice" })
assertSuccess(baselineRun, "baseline simulation")
const baseline = voltages(baselineRun)
await finishTool(
  page,
  "simulate_circuit",
  `BASE ${formatVoltage(baseline.BASE)} · EMITTER ${formatVoltage(baseline.EMITTER)} · COLLECTOR ${formatVoltage(baseline.COLLECTOR)}`,
)
await page.waitForTimeout(5_000)

await appendMessage(page, "assistant", {
  text: `The simulated operating point is BASE ${formatVoltage(baseline.BASE)}, EMITTER ${formatVoltage(baseline.EMITTER)}, and COLLECTOR ${formatVoltage(baseline.COLLECTOR)}. The ${formatVoltage((baseline.BASE ?? 0) - (baseline.EMITTER ?? 0))} base-emitter offset forward-biases Q1. RE converts rising current into a higher emitter voltage, reducing VBE—local negative feedback that resists beta and temperature drift.`,
})
await page.waitForTimeout(6_000)

await appendMessage(page, "user", {
  text: "Now double the emitter resistor to 2 kΩ. Make the change, rerun it, and tell me what moved and why.",
})
await page.waitForTimeout(3_000)

await appendMessage(page, "assistant", {
  text: "I’ll re-inspect first so the write is protected against a stale circuit hash, then replace the graph and compare exact measurements.",
})
await page.waitForTimeout(2_000)

await appendTool(page, "inspect_circuit", "current circuit + fresh hash", "Running")
const beforeRevision = await invokeTool(workbench, "inspect_circuit", { action: "current" })
assertSuccess(beforeRevision, "revision inspection")
await finishTool(page, "inspect_circuit", `hash ${beforeRevision.data.project.circuitHash.slice(0, 8)}`)
await page.waitForTimeout(2_000)

await appendTool(page, "author_circuit", "RE: 1 kΩ → 2 kΩ", "Running")
const revised = await invokeTool(workbench, "author_circuit", {
  expectedCircuitHash: beforeRevision.data.project.circuitHash,
  graph: bjtBiasGraph(2_000),
})
assertSuccess(revised, "revised authoring")
await finishTool(page, "author_circuit", "validated · visible · undoable")
await page.waitForTimeout(5_000)

await appendTool(page, "simulate_circuit", "ngspice · revised snapshot", "Running")
const revisedRun = await invokeTool(workbench, "simulate_circuit", { engine: "ngspice" })
assertSuccess(revisedRun, "revised simulation")
const changed = voltages(revisedRun)
await finishTool(
  page,
  "simulate_circuit",
  `BASE ${formatVoltage(changed.BASE)} · EMITTER ${formatVoltage(changed.EMITTER)} · COLLECTOR ${formatVoltage(changed.COLLECTOR)}`,
)
await page.waitForTimeout(5_000)

await appendMessage(page, "assistant", {
  text: `After RE doubles, EMITTER moves from ${formatVoltage(baseline.EMITTER)} to ${formatVoltage(changed.EMITTER)} and COLLECTOR from ${formatVoltage(baseline.COLLECTOR)} to ${formatVoltage(changed.COLLECTOR)}. The larger degeneration resistor reduces collector current, so RC drops less voltage and the collector rises. The emitter voltage does not double because Q1 and the loaded base divider settle at a new feedback-controlled operating point.`,
})
await page.waitForTimeout(8_000)

await setEndCard(page)
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

async function invokeTool(frame, name, input) {
  return frame.evaluate(
    async ({ name, input }) => {
      const tool = window.__circuitSimWebMcpTools.get(name)
      if (!tool) throw new Error(`WebMCP tool was not registered: ${name}`)
      return tool.execute(input, { signal: new AbortController().signal })
    },
    { name, input },
  )
}

function assertSuccess(result, operation) {
  if (result?._tag !== "Success") {
    throw new Error(`${operation} failed: ${JSON.stringify(result)}`)
  }
}

function voltages(result) {
  return Object.fromEntries(result.data.netVoltages.map(({ name, voltage }) => [name, voltage]))
}

function formatVoltage(value) {
  return typeof value === "number" ? `${value.toFixed(2)} V` : "unavailable"
}

async function appendMessage(page, role, { text }) {
  await page.evaluate(({ role, text }) => {
    const feed = document.querySelector("[data-chat-feed]")
    const message = document.createElement("article")
    message.className = `message ${role}`
    const label = document.createElement("div")
    label.className = "message-label"
    label.textContent = role === "user" ? "You" : "Codex"
    const body = document.createElement("div")
    body.className = "message-body"
    body.textContent = text
    message.append(label, body)
    feed.append(message)
    message.scrollIntoView({ behavior: "smooth", block: "end" })
  }, { role, text })
}

async function appendTool(page, name, summary, state) {
  await page.evaluate(({ name, summary, state }) => {
    const feed = document.querySelector("[data-chat-feed]")
    const card = document.createElement("article")
    card.className = "tool-card"
    card.dataset.toolName = name
    card.innerHTML = `
      <div class="tool-topline">
        <span class="tool-icon">⌁</span>
        <strong>${name}</strong>
        <span class="tool-state running">${state}</span>
      </div>
      <div class="tool-summary">${summary}</div>
    `
    feed.append(card)
    card.scrollIntoView({ behavior: "smooth", block: "end" })
  }, { name, summary, state })
}

async function finishTool(page, name, result) {
  await page.evaluate(({ name, result }) => {
    const cards = [...document.querySelectorAll(`[data-tool-name="${name}"]`)]
    const card = cards.at(-1)
    card.querySelector(".tool-state").className = "tool-state complete"
    card.querySelector(".tool-state").textContent = "Done"
    card.querySelector(".tool-summary").textContent = result
  }, { name, result })
}

async function setEndCard(page) {
  await page.evaluate(() => {
    const card = document.createElement("section")
    card.className = "end-card"
    card.innerHTML = `
      <div class="end-eyebrow">CIRCUIT SIM + WEBMCP</div>
      <div class="end-title">One circuit. Human and agent interfaces.</div>
      <div class="end-body">Design by conversation · verify by simulation · see every change</div>
    `
    document.body.append(card)
  })
}

async function installRecordingShell(page) {
  await page.evaluate((shellMarkup) => {
    const parsed = new DOMParser().parseFromString(shellMarkup, "text/html")
    const root = document.body.firstElementChild
    const style = document.createElement("style")
    style.textContent = `${parsed.querySelector("style").textContent}
      .browser-content { min-width: 0; min-height: 0; overflow: hidden; }
      .browser-content > * { width: 100%; height: 100%; }
    `
    const stage = document.createElement("main")
    stage.className = "stage"
    const chat = parsed.querySelector(".chat").cloneNode(true)
    const browserPanel = document.createElement("section")
    browserPanel.className = "browser"
    const browserBar = parsed.querySelector(".browser-bar").cloneNode(true)
    const browserContent = document.createElement("div")
    browserContent.className = "browser-content"
    root.remove()
    browserContent.append(root)
    browserPanel.append(browserBar, browserContent)
    stage.append(chat, browserPanel)
    document.body.replaceChildren(style, stage)
  }, recordingShell())
}

function recordingShell() {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #09090b; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .stage { display: grid; grid-template-columns: 610px 1fr; width: 100%; height: 100%; }
        .chat { display: grid; grid-template-rows: 66px 1fr 72px; min-width: 0; background: #111113; border-right: 1px solid #34343a; }
        .chat-header { display: flex; align-items: center; gap: 12px; padding: 0 22px; border-bottom: 1px solid #2b2b30; background: #161618; }
        .codex-mark { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: #f4f4f5; color: #09090b; font-weight: 800; }
        .chat-title { font-size: 16px; font-weight: 700; }
        .chat-subtitle { color: #a1a1aa; font-size: 12px; margin-top: 2px; }
        .feed { padding: 22px 20px 34px; overflow: hidden; scroll-behavior: smooth; }
        .message { margin-bottom: 18px; animation: enter .35s ease both; }
        .message.user { margin-left: 52px; }
        .message-label { color: #a1a1aa; font-size: 12px; font-weight: 700; margin: 0 0 7px 4px; }
        .message-body { border: 1px solid #333338; border-radius: 16px; padding: 13px 15px; color: #e4e4e7; font-size: 15px; line-height: 1.48; background: #1d1d20; }
        .message.user .message-body { background: #2a2a2f; }
        .tool-card { margin: 0 0 13px 4px; padding: 12px 14px; border: 1px solid #3f3f46; border-radius: 12px; background: #17171a; animation: enter .35s ease both; }
        .tool-topline { display: flex; align-items: center; gap: 9px; color: #fafafa; font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
        .tool-icon { color: #d7e65f; font-size: 20px; line-height: 1; }
        .tool-state { margin-left: auto; padding: 3px 7px; border-radius: 999px; font: 10px -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 750; text-transform: uppercase; letter-spacing: .06em; }
        .tool-state.running { color: #fef08a; background: #3f3a16; }
        .tool-state.complete { color: #bbf7d0; background: #143621; }
        .tool-summary { margin: 7px 0 0 29px; color: #a1a1aa; font-size: 12px; line-height: 1.4; }
        .composer { margin: 10px 18px 16px; display: flex; align-items: center; padding: 0 16px; color: #71717a; border: 1px solid #333338; border-radius: 14px; background: #19191c; font-size: 14px; }
        .browser { display: grid; grid-template-rows: 66px 1fr; min-width: 0; background: #050505; }
        .browser-bar { display: flex; align-items: center; gap: 12px; padding: 0 18px; border-bottom: 1px solid #34343a; background: #202024; }
        .traffic { display: flex; gap: 7px; }
        .traffic i { width: 11px; height: 11px; border-radius: 50%; background: #52525b; }
        .address { flex: 1; padding: 10px 14px; border: 1px solid #3f3f46; border-radius: 9px; color: #d4d4d8; background: #111113; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
        .site-tools { padding: 6px 10px; border: 1px solid #5b641d; border-radius: 999px; color: #e8f36b; background: #2b2e15; font-size: 11px; font-weight: 750; }
        iframe { width: 100%; height: 100%; border: 0; background: #000; }
        .end-card { position: fixed; z-index: 20; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 1040px; padding: 58px 66px; border: 1px solid rgba(255,255,255,.18); border-radius: 28px; color: #fafafa; background: rgba(8,8,9,.95); box-shadow: 0 35px 120px rgba(0,0,0,.7); text-align: center; animation: enter .5s ease both; }
        .end-eyebrow { color: #d7e65f; font-size: 16px; font-weight: 800; letter-spacing: .18em; }
        .end-title { margin-top: 18px; font-size: 49px; line-height: 1.1; font-weight: 800; }
        .end-body { margin-top: 18px; color: #d4d4d8; font-size: 22px; }
        @keyframes enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      </style>
    </head>
    <body>
      <main class="stage">
        <section class="chat">
          <header class="chat-header">
            <div class="codex-mark">C</div>
            <div><div class="chat-title">Codex</div><div class="chat-subtitle">Circuit design session</div></div>
          </header>
          <div class="feed" data-chat-feed></div>
          <div class="composer">Message Codex…</div>
        </section>
        <section class="browser">
          <header class="browser-bar">
            <span class="traffic"><i></i><i></i><i></i></span>
            <div class="address">Circuit Sim · /workbench</div>
            <div class="site-tools">4 WebMCP tools</div>
          </header>
          <iframe src="http://127.0.0.1:3000/workbench" title="Circuit Sim in-app browser"></iframe>
        </section>
      </main>
    </body>
  </html>`
}

function bjtBiasGraph(emitterResistanceOhms) {
  return {
    groundNet: "GND",
    components: [
      { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 12 } },
      { type: "resistor", refdes: "RUP", props: { resistanceOhms: 56_000 } },
      { type: "resistor", refdes: "RDOWN", props: { resistanceOhms: 10_000 } },
      { type: "resistor", refdes: "RC", props: { resistanceOhms: 2_000 } },
      { type: "resistor", refdes: "RE", props: { resistanceOhms: emitterResistanceOhms } },
      {
        type: "npn-transistor",
        refdes: "Q1",
        props: {
          beta: 100,
          earlyVoltageVolts: 100,
          saturationCurrentAmps: 1e-15,
          forwardEmissionCoefficient: 1,
        },
      },
    ],
    nets: [
      {
        name: "VCC",
        terminals: [
          { refdes: "VCC", pin: "positive" },
          { refdes: "RUP", pin: "a" },
          { refdes: "RC", pin: "a" },
        ],
      },
      {
        name: "BASE",
        terminals: [
          { refdes: "RUP", pin: "b" },
          { refdes: "RDOWN", pin: "a" },
          { refdes: "Q1", pin: "base" },
        ],
      },
      {
        name: "COLLECTOR",
        terminals: [
          { refdes: "RC", pin: "b" },
          { refdes: "Q1", pin: "collector" },
        ],
      },
      {
        name: "EMITTER",
        terminals: [
          { refdes: "Q1", pin: "emitter" },
          { refdes: "RE", pin: "a" },
        ],
      },
      {
        name: "GND",
        terminals: [
          { refdes: "VCC", pin: "negative" },
          { refdes: "RDOWN", pin: "b" },
          { refdes: "RE", pin: "b" },
        ],
      },
    ],
    analysis: { durationMs: 20, timeStepMs: 0.1 },
  }
}
