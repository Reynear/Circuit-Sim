import { Effect } from "effect"
import { newId } from "@circuit-sim/core/ids"
import { extractNetlist } from "@circuit-sim/core/circuit/net-extraction"
import { makeComponent, newCircuitProject } from "@circuit-sim/core/circuit/project"
import { renderSchematic, RenderSchematicRejected } from "@/server/schematic/render-schematic.server"
import { compileAgentElectricalGraph } from "@circuit-sim/core/agent/electrical-graph"
import {
  circuitBenchmarkCases,
  frontierBenchmarkCases,
} from "../../../../benchmarks/cases"
import { intentBenchmarkCases } from "../../../../benchmarks/cases/intent-cases"

const allBenchmarkCases = [
  ...circuitBenchmarkCases,
  ...frontierBenchmarkCases,
  ...intentBenchmarkCases.map((benchmark) => ({
    id: benchmark.id,
    title: benchmark.title,
    graph: benchmark.oracleGraph,
  })),
]

describe("renderSchematic", () => {
  it("renders a deterministic standalone image without editor hit areas", () => {
    const project = fixtureProject()
    const first = Effect.runSync(renderSchematic(project))
    const second = Effect.runSync(renderSchematic(project))

    expect(first.svg).toBe(second.svg)
    expect(first.svg).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(first.svg).toContain("<svg")
    expect(first.svg).toContain("R1")
    expect(first.svg).toContain("1k")
    expect(first.svg).toContain("GND")
    expect(first.svg).toMatch(/<circle class="junction-dot"/)
    expect(first.svg).toContain("canvas-background")
    expect(first.svg).not.toContain("hit-area")
    expect(first.svg).not.toContain("data-testid")
    expect(first.width).toBeGreaterThan(0)
    expect(first.height).toBeGreaterThan(0)
  })

  it("focuses one net and dims the remaining objects", () => {
    const project = fixtureProject()
    const netId = extractNetlist(project).nets.find((net) => net.name === "SIGNAL")?.id
    expect(netId).toBeDefined()

    const result = Effect.runSync(renderSchematic(project, { focus: { netIds: [netId!] } }))

    expect(result.focusedObjectIds).toContain(project.objects.find((object) => object.kind === "net-label")?.id)
    expect(result.svg).toContain("focus")
    expect(result.svg).toContain("dim")
  })

  it("uses canonical active-component glyphs in standalone SVG images", () => {
    const zener = renderBenchmark("zener-shunt-regulator")
    const npn = renderBenchmark("npn-emitter-follower")
    const pnp = renderBenchmark("pnp-high-side-switch")
    const nmos = renderBenchmark("nmos-low-side-regions")
    const pmos = renderBenchmark("pmos-high-side-regions")
    const opAmp = renderBenchmark("op-amp-voltage-follower")
    const logic = renderBenchmark("logic-gate-truth-regions")
    const powerRails = renderBenchmark(
      "complementary-darlington-4-diode-bias-power-rails",
    )

    expect(zener.svg).toContain('class="zener-diode-glyph"')
    expect(npn.svg).toContain('class="bipolar-transistor-glyph npn"')
    expect(pnp.svg).toContain('class="bipolar-transistor-glyph pnp"')
    expect(nmos.svg).toContain('class="mosfet-glyph n-channel"')
    expect(pmos.svg).toContain('class="mosfet-glyph p-channel"')
    expect(opAmp.svg).toContain('class="ideal-op-amp-glyph"')
    expect(logic.svg).toContain('class="logic-input-glyph"')
    expect(logic.svg).toContain('class="logic-output-glyph"')
    expect(logic.svg).toContain('class="logic-gate-glyph and"')
    expect(logic.svg).toContain('class="logic-gate-glyph or"')
    expect(logic.svg).toContain('class="inverter-glyph"')
    expect(powerRails.svg).toContain('class="dc-power-rail-glyph"')
    expect(powerRails.svg).toContain(">VCC</text>")
    expect(powerRails.svg).toContain(">VEE</text>")
    expect(powerRails.svg).toContain(">-15</text>")
    expect(npn.svg).toContain('class="symbol-body transistor-outline"')
    expect(npn.svg).toContain('class="symbol-fill transistor-arrow"')
    expect(pnp.svg).toContain("scale(1 -1)")
    expect(zener.svg).toContain("DZ1")
    expect(npn.svg).toContain("Q1")
    expect(opAmp.svg).toContain("U1")
    expect(logic.svg).toContain("U_AND_HIGH")
  })

  it.each(allBenchmarkCases.map((benchmark) => [benchmark.id, benchmark] as const))(
    "%s compiles into a complete standalone SVG image",
    (_id, benchmark) => {
      const project = compileAgentElectricalGraph(
        newCircuitProject(benchmark.title),
        benchmark.graph,
      )
      const image = Effect.runSync(renderSchematic(project))

      expect(image.svg).toContain('<?xml version="1.0" encoding="UTF-8"?>')
      expect(image.svg).not.toContain("hit-area")
      expect(image.width).toBeGreaterThan(0)
      expect(image.height).toBeGreaterThan(0)
      expect(
        Math.max(image.width / image.height, image.height / image.width),
      ).toBeLessThan(8)
      for (const component of benchmark.graph.components) {
        expect(image.svg).toContain(component.refdes)
      }
      for (const object of project.objects) {
        if (object.kind !== "wire") continue
        for (let index = 1; index < object.points.length; index += 1) {
          const from = object.points[index - 1]!
          const to = object.points[index]!
          expect(from.x === to.x || from.y === to.y).toBe(true)
        }
      }
    },
  )

  it("rejects unknown focus IDs", () => {
    const error = Effect.runSync(
      Effect.flip(renderSchematic(fixtureProject(), { focus: { objectIds: ["missing"] } })),
    )
    expect(error).toBeInstanceOf(RenderSchematicRejected)
    expect(error).toMatchObject({ code: "focus-object-not-found" })
  })

  it("fits long net labels and preserves rotated/flipped symbol transforms", () => {
    const longName = "RECTIFIED_CENTER_TAP_OUTPUT_WITH_A_LONG_READABLE_NET_NAME"
    const project = fixtureProject()
    const transformed = {
      ...project,
      objects: project.objects.map((object) => {
        if (object.kind === "net-label") return { ...object, text: longName }
        if (object.kind === "component" && object.refdes === "V1") {
          return { ...object, rotation: 90 as const, flipped: true }
        }
        return object
      }),
    }
    const result = Effect.runSync(renderSchematic(transformed))
    const label = transformed.objects.find((object) => object.kind === "net-label")!
    const rightEdge = result.viewBox[0] + result.viewBox[2]

    expect(result.svg).toContain(longName)
    expect(rightEdge).toBeGreaterThan(label.position.x + 400)
    expect(result.svg).toContain("rotate(90) scale(1 -1)")
    expect(result.svg).toContain("rotate(-90")
  })
})

function renderBenchmark(id: string) {
  const benchmark = circuitBenchmarkCases.find((candidate) => candidate.id === id)!
  const project = compileAgentElectricalGraph(
    newCircuitProject(benchmark.title),
    benchmark.graph,
  )
  return Effect.runSync(renderSchematic(project))
}

function fixtureProject() {
  const project = newCircuitProject("Static render")
  const source = makeComponent({
    kind: "component",
    id: newId(),
    type: "dc-voltage-source",
    refdes: "V1",
    position: { x: 80, y: 100 },
    rotation: 0,
    flipped: false,
    props: { voltageVolts: 5 },
  })
  const resistor = makeComponent({
    kind: "component",
    id: newId(),
    type: "resistor",
    refdes: "R1",
    position: { x: 200, y: 100 },
    rotation: 0,
    flipped: false,
    props: { resistanceOhms: 1_000 },
  })
  const labelId = newId()
  const groundId = newId()
  const wireId = newId()
  const branchTrunkId = newId()
  const branchId = newId()
  return {
    ...project,
    objects: [
      source,
      resistor,
      { kind: "wire" as const, id: wireId, points: [{ x: 120, y: 100 }, { x: 160, y: 100 }] },
      {
        kind: "wire" as const,
        id: branchTrunkId,
        points: [{ x: 300, y: 240 }, { x: 340, y: 240 }, { x: 380, y: 240 }],
      },
      {
        kind: "wire" as const,
        id: branchId,
        points: [{ x: 340, y: 240 }, { x: 340, y: 280 }],
      },
      { kind: "net-label" as const, id: labelId, text: "SIGNAL", position: { x: 160, y: 100 } },
      { kind: "ground" as const, id: groundId, netName: "GND" as const, position: { x: 120, y: 140 } },
    ],
  }
}
