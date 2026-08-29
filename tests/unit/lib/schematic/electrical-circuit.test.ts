import { describe, expect, it } from "vitest"
import { createVoltageDividerExample } from "@/examples/circuit-projects"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"
import {
  buildElectricalCircuit,
  circuitHashOf,
  renderCircuitTxt,
} from "@circuit-sim/core/circuit/electrical-circuit"
import type { CircuitProject } from "@circuit-sim/core/circuit/project"

const projectHash = (project: CircuitProject) => circuitHashOf(buildElectricalCircuit(project))

describe("electrical circuit", () => {
  it("generates structured behavior and connectivity", () => {
    const circuit = buildElectricalCircuit(createVoltageDividerExample())

    expect(circuit.components.find((component) => component.refdes === "V1"))
      .toMatchObject({
        type: "dc-voltage-source",
        behavior: { kind: "dc-voltage-source", volts: 5 },
      })
    const r1 = circuit.components.find((component) => component.refdes === "R1")
    expect(r1?.behavior).toEqual({ kind: "resistor", ohms: 10_000 })
    expect(r1?.terminals.map((terminal) => `${terminal.label}=${terminal.net}`))
      .toEqual(["1=N001", "2=VOUT"])

    expect(circuit.nets.find((net) => net.name === "GND")?.terminals)
      .toContainEqual({ refdes: "R2", pin: "2" })
  })

  it("represents an empty project without sentinel values", () => {
    expect(buildElectricalCircuit(newCircuitProject("Empty"))).toEqual({
      components: [],
      nets: [],
    })
  })

  it("renders circuit.txt from structured values", () => {
    const project = createVoltageDividerExample()
    const circuit = buildElectricalCircuit(project)
    const hash = circuitHashOf(circuit)
    const text = renderCircuitTxt(project, circuit, hash)

    expect(text).toContain(`HASH ${hash}`)
    expect(text).toContain('CIRCUIT "Voltage Divider Demo"')
    expect(text).toMatch(/^V1 dc-voltage-source V=5V \[model=ideal\] \| \+=N001 -=GND$/m)
    expect(text).toMatch(/^R1 resistor R=10kOhm \[model=ideal\] \| /m)
    expect(text).toMatch(/^ANALYSIS tran duration=/m)
  })
})

describe("circuit identity", () => {
  const project = createVoltageDividerExample()

  it("is deterministic and ignores presentation-only changes", () => {
    expect(projectHash(project)).toBe(projectHash(project))
    expect(projectHash(moveEverything(project))).toBe(
      projectHash(project),
    )
    expect(projectHash({ ...project, name: "Renamed" })).toBe(
      projectHash(project),
    )
  })

  it("changes when electrical behavior changes", () => {
    expect(projectHash(withResistance(project, "R1", 1_000))).not.toBe(
      projectHash(project),
    )
  })
})

function moveEverything(project: CircuitProject): CircuitProject {
  const shift = (point: { x: number; y: number }) => ({
    x: point.x + 500,
    y: point.y + 500,
  })
  return {
    ...project,
    objects: project.objects.map((object) => {
        if (object.kind === "component") {
          return { ...object, position: shift(object.position) }
        }
        if (object.kind === "wire") {
          return { ...object, points: object.points.map(shift) }
        }
        if ("position" in object) {
          return {
            ...object,
            position: shift(object.position),
          }
        }
        return object
      }),
  }
}

function withResistance(
  project: CircuitProject,
  refdes: string,
  resistanceOhms: number,
): CircuitProject {
  return {
    ...project,
    objects: project.objects.map((object) =>
        object.kind === "component" &&
        object.type === "resistor" &&
        object.refdes === refdes
          ? { ...object, props: { resistanceOhms } }
          : object,
      ),
  }
}
