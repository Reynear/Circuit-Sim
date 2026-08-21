import { simulate } from "spicey"
import { createId } from "../ids"
import type { CircuitProject } from "../schematic/types"
import type { SimulationResult, WaveformTrace } from "./types"
import {
  generateSpiceNetlist,
  type SpiceElementBinding,
} from "./spice-netlist"

export function runSpiceSimulation(project: CircuitProject): SimulationResult {
  const build = generateSpiceNetlist(project)
  const notes = [
    "Ran transient SPICE with the local spicey MNA engine for supported R/C/L/diode/voltage-source circuits.",
    ...build.notes,
  ]

  try {
    const result = simulate(build.netlist)
    if (!result.tran) {
      return {
        id: createId("sim"),
        createdAt: new Date().toISOString(),
        kind: "spice",
        engine: "spicey",
        status: build.diagnostics.errors.length > 0 ? "failed" : "partial",
        netlist: build.netlist,
        traces: [],
        notes: ["No transient result was produced.", ...notes],
        diagnostics: {
          ...build.diagnostics,
          errors: ["No transient result was produced.", ...build.diagnostics.errors],
        },
      }
    }

    const traces = [
      ...voltageTraces(result.tran),
      ...currentTraces(result.tran, build.elements),
      ...powerTraces(result.tran, build.elements),
    ]
    return {
      id: createId("sim"),
      createdAt: new Date().toISOString(),
      kind: "spice",
      engine: "spicey",
      status:
        build.diagnostics.unsupportedComponents.length > 0 ||
        build.diagnostics.floatingPins.length > 0
          ? "partial"
          : "success",
      netlist: build.netlist,
      traces,
      notes,
      diagnostics: build.diagnostics,
    }
  } catch (error) {
    const message = `SPICE simulation failed: ${error instanceof Error ? error.message : String(error)}`
    return {
      id: createId("sim"),
      createdAt: new Date().toISOString(),
      kind: "spice",
      engine: "spicey",
      status: "failed",
      netlist: build.netlist,
      traces: [],
      notes: [message, ...notes],
      diagnostics: {
        ...build.diagnostics,
        errors: [message, ...build.diagnostics.errors],
      },
    }
  }
}

type SpiceTranResult = NonNullable<ReturnType<typeof simulate>["tran"]>

function voltageTraces(tran: SpiceTranResult): WaveformTrace[] {
  return Object.entries(tran.nodeVoltages)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([nodeName, values]) => ({
      id: `spice_v_${nodeName}`,
      name: `V(${nodeName})`,
      metric: "voltage" as const,
      unit: "V",
      targetId: nodeName,
      targetName: nodeName,
      points: tran.times.map((t, index) => ({ t, v: values[index] ?? 0 })),
    }))
}

function currentTraces(
  tran: SpiceTranResult,
  elements: SpiceElementBinding[],
): WaveformTrace[] {
  return Object.entries(tran.elementCurrents)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([spiceName, values]) => {
      const element = elements.find((candidate) => candidate.spiceName === spiceName)
      return {
        id: `spice_i_${spiceName}`,
        name: `I(${element?.refdes ?? spiceName})`,
        metric: "current" as const,
        unit: "A",
        targetId: element?.objectId ?? spiceName,
        targetName: element?.refdes ?? spiceName,
        points: tran.times.map((t, index) => ({ t, v: values[index] ?? 0 })),
      }
    })
}

function powerTraces(
  tran: SpiceTranResult,
  elements: SpiceElementBinding[],
): WaveformTrace[] {
  return elements
    .map((element) => {
      const current = tran.elementCurrents[element.spiceName]
      if (!current) {
        return null
      }
      return {
        id: `spice_p_${element.spiceName}`,
        name: `P(${element.refdes})`,
        metric: "power" as const,
        unit: "W",
        targetId: element.objectId,
        targetName: element.refdes,
        points: tran.times.map((t, index) => {
          const voltage = nodeVoltage(tran, element.n1, index) - nodeVoltage(tran, element.n2, index)
          return { t, v: voltage * (current[index] ?? 0) }
        }),
      }
    })
    .filter((trace): trace is NonNullable<typeof trace> => Boolean(trace))
}

function nodeVoltage(
  tran: SpiceTranResult,
  nodeName: string,
  index: number,
): number {
  if (nodeName === "0") {
    return 0
  }
  return tran.nodeVoltages[nodeName]?.[index] ?? 0
}
