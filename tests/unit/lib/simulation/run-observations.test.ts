import { describe, expect, it } from "vitest"
import { DateTime } from "effect"
import { newId } from "@circuit-sim/core/ids"
import type { SimulationRun } from "@circuit-sim/core/simulation/simulation-run"
import { createVoltageDividerExample } from "@/examples/circuit-projects"
import { runSpiceSimulation } from "@/server/simulation/engines/spicey"
import { observeRun } from "@circuit-sim/core/simulation/run-observations"
import { formatMeasurement } from "@/browser/simulation/display"
import { simulationStatus, type SimulationOutput } from "@circuit-sim/core/simulation/result"

describe("run observations", () => {
  it("derives honest measurements from the final point of a real run", () => {
    const project = createVoltageDividerExample()
    const output = runSpiceSimulation(project)
    expect(simulationStatus(output)).toBe("success")

    const report = observeRun(project, runOf(project.id, output))

    // 5V source across two 10k resistors in series.
    const r1 = report.componentMeasurements.find((c) => c.refdes === "R1")
    const r2 = report.componentMeasurements.find((c) => c.refdes === "R2")
    expect(r1?.voltage).toBeCloseTo(2.5, 5)
    expect(r2?.voltage).toBeCloseTo(2.5, 5)
    expect(r1?.current).toBeCloseTo(0.00025, 8)
    expect(r2?.current).toBeCloseTo(0.00025, 8)
    expect(r1?.power).toBeCloseTo(0.000625, 8)

    const probe = report.probeMeasurements.find((p) => p.name === "VP_OUT")
    expect(probe?.netName).toBeTruthy()
    expect(probe?.voltage).toBeCloseTo(2.5, 5)

    const ground = report.netVoltages.find((net) => net.name === "GND")
    expect(ground?.voltage).toBe(0)
  })

  it("reports unavailable measurements as undefined, never as zero", () => {
    const project = createVoltageDividerExample()
    const output = runSpiceSimulation(project)

    // A run that produced no signals reports no values.
    const stripped = { ...output, signals: [] }
    const report = observeRun(project, runOf(project.id, stripped))

    const r1 = report.componentMeasurements.find((c) => c.refdes === "R1")
    expect(r1?.voltage).toBeUndefined()
    expect(r1?.current).toBeUndefined()
    expect(r1?.power).toBeUndefined()
  })

  it("binds runs to snapshots and marks edited circuits stale", () => {
    const project = createVoltageDividerExample()
    const output = runSpiceSimulation(project)
    const run = runOf(project.id, output)

    const fresh = observeRun(project, run)
    expect(fresh.run.circuitHash).toBe(output.circuitHash)
    expect(fresh.run.stale).toBe(false)

    const changed: typeof project = {
      ...project,
      objects: project.objects.map((object) =>
          object.kind === "component" &&
          object.type === "resistor" &&
          object.refdes === "R1"
            ? {
                ...object,
                props: {
                  ...object.props,
                  resistanceOhms: 1_000,
                },
              }
            : object,
        ),
    }
    const stale = observeRun(changed, run)
    expect(stale.run.stale).toBe(true)
    expect(stale.notes).toContain(
      "The circuit has changed since this run; these values do not describe the current circuit.",
    )
  })
})

function runOf(projectId: string, output: SimulationOutput): SimulationRun {
  return {
    id: newId(),
    projectId,
    projectSnapshotId: newId(),
    createdAt: DateTime.nowUnsafe(),
    ...output,
  }
}

describe("measurement formatting", () => {
  it("formats measurements using engineering prefixes", () => {
    expect(formatMeasurement(5, "V")).toBe("5.00 V")
    expect(formatMeasurement(0.00025, "A")).toBe("250 uA")
    expect(formatMeasurement(0.000625, "W")).toBe("625 uW")
    expect(formatMeasurement(0, "A")).toBe("0 A")
    expect(formatMeasurement(undefined, "V")).toBe("n/a")
  })
})
