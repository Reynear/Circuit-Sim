import { createId } from "../ids"
import { getComponentDefinition } from "./component-definitions"
import { extractNetlist, pinConnectionKey } from "./net-extraction"
import { getSymbolPinWorldPositions } from "./transforms"
import { isPositiveSiValue } from "./values"
import type { CircuitProject, ProbeObject, SymbolObject, Vec2 } from "./types"

export type ElectricalIssue = {
  id: string
  severity: "info" | "warning" | "error"
  message: string
  objectIds?: string[]
  positions?: Vec2[]
}

const valuePropByComponent: Record<string, string> = {
  resistor: "value",
  capacitor: "value",
  inductor: "value",
  "dc-voltage-source": "voltage",
  "sine-voltage-source": "amplitude",
  "dc-current-source": "current",
}

const simpleSolverSupportedComponents = new Set([
  "resistor",
  "capacitor",
  "dc-voltage-source",
  "sine-voltage-source",
  "switch",
])

export function runErc(project: CircuitProject): ElectricalIssue[] {
  const issues: ElectricalIssue[] = []
  const netlist = extractNetlist(project)
  const objects = project.sheets[0]?.objects ?? []
  const symbols = objects.filter(
    (object): object is SymbolObject => object.kind === "symbol",
  )
  const probes = objects.filter(
    (object): object is ProbeObject => object.kind === "probe",
  )

  if (!netlist.nets.some((net) => net.name === "GND")) {
    issues.push(issue("warning", "Circuit has no GND net."))
  }

  const seenRefdes = new Map<string, string>()
  for (const symbol of symbols) {
    const existing = seenRefdes.get(symbol.refdes)
    if (existing) {
      issues.push(
        issue("warning", `Duplicate refdes ${symbol.refdes}.`, [
          existing,
          symbol.id,
        ]),
      )
    } else {
      seenRefdes.set(symbol.refdes, symbol.id)
    }

    const definition = getComponentDefinition(symbol.componentDefinitionId)
    if (!definition) {
      issues.push(
        issue(
          "error",
          `Unknown component ${symbol.componentDefinitionId}.`,
          [symbol.id],
          [symbol.position],
        ),
      )
      continue
    }

    const pinPositions = getSymbolPinWorldPositions(symbol)
    for (const pin of definition.pins) {
      if (!netlist.pinToNetId[pinConnectionKey(symbol.id, pin.id)]) {
        const position = pinPositions.find(
          (candidate) => candidate.componentPinId === pin.id,
        )?.position
        issues.push(
          issue(
            "warning",
            `${symbol.refdes}.${pin.name} is unconnected.`,
            [symbol.id],
            position ? [position] : [symbol.position],
          ),
        )
      }
    }

    const valueProp = valuePropByComponent[symbol.componentDefinitionId]
    if (valueProp && !isPositiveSiValue(symbol.props[valueProp])) {
      issues.push(
        issue(
          "error",
          `${symbol.refdes} has an invalid ${valueProp} value.`,
          [symbol.id],
          [symbol.position],
        ),
      )
    }
  }

  for (const probe of probes) {
    if (!netlist.objectToNetId[probe.id]) {
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

  for (const simulation of project.simulations) {
    const voltageProbeIds = new Set(
      probes
        .filter((probe) => probe.probeType === "voltage")
        .map((probe) => probe.id),
    )
    const selectedVoltageProbeCount = simulation.probeIds.filter((probeId) =>
      voltageProbeIds.has(probeId),
    ).length
    if (selectedVoltageProbeCount === 0) {
      issues.push(
        issue("warning", `${simulation.name} has no voltage probes selected.`),
      )
    }

    const unsupported = symbols.filter(
      (symbol) =>
        !simpleSolverSupportedComponents.has(symbol.componentDefinitionId),
    )
    if (unsupported.length > 0) {
      issues.push(
        issue(
          "warning",
          `${simulation.name} includes components unsupported by the demo solver.`,
          unsupported.map((symbol) => symbol.id),
        ),
      )
    }
  }

  return issues
}

function issue(
  severity: ElectricalIssue["severity"],
  message: string,
  objectIds?: string[],
  positions?: Vec2[],
): ElectricalIssue {
  return {
    id: createId("junc"),
    severity,
    message,
    ...(objectIds ? { objectIds } : {}),
    ...(positions ? { positions } : {}),
  }
}
