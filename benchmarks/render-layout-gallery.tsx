import { mkdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { Effect } from "effect"
import { compileAgentElectricalGraph } from "@circuit-sim/core/agent/electrical-graph"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"
import { renderSchematic } from "../src/server/schematic/render-schematic.server.tsx"
import { rasterizeSchematicPng } from "../src/server/mcp/schematic-png-rasterizer.server.ts"
import { circuitBenchmarkCases, frontierBenchmarkCases } from "./cases"

const defaultCaseIds = [
  "npn-emitter-follower",
  "frontier-darlington-emitter-follower",
  "complementary-darlington-1-diode-bias",
  "complementary-darlington-2-diode-bias",
  "complementary-darlington-3-diode-bias",
  "complementary-darlington-4-diode-bias",
  "complementary-darlington-4-diode-bias-power-rails",
  "frontier-image1-class-a-ce-amplifier",
  "frontier-image2-class-b-push-pull",
  "frontier-image2-class-ab-push-pull",
  "frontier-derived-class-c-tuned-amplifier",
  "frontier-derived-class-d-pwm-stage",
  "frontier-image3-r5-zero-offset",
] as const

const argumentValue = (name: string) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

const requestedIds = argumentValue("--cases")?.split(",").filter(Boolean) ??
  defaultCaseIds
const outputDirectory = resolve(
  argumentValue("--out") ?? "artifacts/layout-gallery",
)
const allCases = [...circuitBenchmarkCases, ...frontierBenchmarkCases]
const selected = requestedIds.map((id) => {
  const benchmark = allCases.find((candidate) => candidate.id === id)
  if (!benchmark) throw new Error(`Unknown benchmark case: ${id}`)
  return benchmark
})

await mkdir(outputDirectory, { recursive: true })
const summary = []
for (const benchmark of selected) {
  const project = compileAgentElectricalGraph(
    newCircuitProject(benchmark.title),
    benchmark.graph,
  )
  const rendered = Effect.runSync(renderSchematic(project))
  const png = Effect.runSync(rasterizeSchematicPng(rendered.svg, {
    fitTo: { _tag: "width", value: Math.min(2_400, rendered.width) },
    loadSystemFonts: true,
  }))
  await Promise.all([
    writeFile(join(outputDirectory, `${benchmark.id}.svg`), rendered.svg, "utf8"),
    writeFile(
      join(outputDirectory, `${benchmark.id}.png`),
      Buffer.from(png.pngBase64, "base64"),
    ),
    writeFile(
      join(outputDirectory, `${benchmark.id}.project.json`),
      `${JSON.stringify(project, null, 2)}\n`,
      "utf8",
    ),
  ])
  summary.push({
    id: benchmark.id,
    width: rendered.width,
    height: rendered.height,
    warningCount: rendered.warnings.length,
    pngBytes: png.byteLength,
  })
}
await writeFile(
  join(outputDirectory, "summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8",
)
process.stdout.write(`${JSON.stringify({ outputDirectory, cases: summary }, null, 2)}\n`)
process.exit(0)
