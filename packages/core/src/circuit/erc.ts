import { newId } from "../ids"
import { buildElectricalCircuit, isSpiceUnsupported } from "./electrical-circuit"
import { extractNetlist } from "./net-extraction"
import { getPinPosts } from "./component-geometry"
import {
  type CircuitProject,
  type ProbeObject,
  type Component,
  type Point,
} from "./project"

export type ElectricalIssue = {
  id: string
  severity: "info" | "warning" | "error"
  message: string
  objectIds?: string[]
  positions?: ReadonlyArray<Point>
}

export function runErc(project: CircuitProject): ElectricalIssue[] {
  const issues: ElectricalIssue[] = []
  const circuit = buildElectricalCircuit(project)
  const netlist = extractNetlist(project)
  const objects = project.objects
  const components = objects.filter(
    (object): object is Component => object.kind === "component",
  )
  const probes = objects.filter(
    (object): object is ProbeObject => object.kind === "probe",
  )

  if (!circuit.nets.some((net) => net.name === "GND")) {
    issues.push(issue("warning", "Circuit has no GND net."))
  }

  for (const component of components) {
    const electricalComponent = circuit.components.find(
      (candidate) => candidate.refdes === component.refdes,
    )
    const pinPositions = getPinPosts(component)
    for (const terminal of electricalComponent?.terminals ?? []) {
      if (terminal.net === null) {
        const position = pinPositions.find(
          (candidate) => candidate.pin === terminal.key,
        )?.position
        issues.push(
          issue(
            "warning",
            `${component.refdes}.${terminal.label} is unconnected.`,
            [component.id],
            position ? [position] : [component.position],
          ),
        )
      }
    }

    if (
      electricalComponent?.behavior.kind === "dc-power-rail" &&
      electricalComponent.behavior.volts !== 0 &&
      electricalComponent.terminals.find((terminal) => terminal.key === "rail")
        ?.net === "GND"
    ) {
      issues.push(
        issue(
          "error",
          `${component.refdes}.RAIL cannot drive GND to a nonzero voltage.`,
          [component.id],
          [component.position],
        ),
      )
    }

  }

  for (const probe of probes) {
    if (!netlist.objectToNetId.get(probe.id)) {
      issues.push(
        issue(
          "warning",
          `${probe.name} is not attached to a net.`,
          [probe.id],
          [probe.position],
        ),
      )
    }
  }

  const unsupportedRefdes = new Set(
    circuit.components
      .filter((component) => isSpiceUnsupported(component.behavior))
      .map((component) => component.refdes),
  )
  const unsupported = components.filter((component) =>
    unsupportedRefdes.has(component.refdes),
  )
  if (unsupported.length > 0) {
    issues.push(
      issue(
        "warning",
        "Circuit includes components without simulation models.",
        unsupported.map((component) => component.id),
      ),
    )
  }

  return issues
}

function issue(
  severity: ElectricalIssue["severity"],
  message: string,
  objectIds?: string[],
  positions?: ReadonlyArray<Point>,
): ElectricalIssue {
  return {
    id: newId(),
    severity,
    message,
    ...(objectIds ? { objectIds } : {}),
    ...(positions ? { positions } : {}),
  }
}
