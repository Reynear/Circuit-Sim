import { simulate } from "spicey"
import {
  buildElectricalCircuit,
  circuitHashOf,
} from "@circuit-sim/core/circuit/electrical-circuit"
import type { CircuitProject } from "@circuit-sim/core/circuit/project"
import type { SimulationOutput } from "@circuit-sim/core/simulation/result"
import {
  buildTranSignals,
  type NodeNetName,
  type SignalElement,
  type Signals,
} from "@circuit-sim/core/simulation/signals"
import { generateSpiceNetlist } from "@circuit-sim/core/simulation/spice-netlist"
import type { SpiceElementBinding } from "@circuit-sim/core/simulation/spice-netlist"

export function runSpiceSimulation(
  project: CircuitProject,
): SimulationOutput {
  const circuit = buildElectricalCircuit(project)
  const build = generateSpiceNetlist({
    circuit,
    analysis: project.analysis,
    title: project.name,
  })
  const circuitHash = circuitHashOf(circuit)
  const notes = [
    "Ran transient SPICE with the local spicey MNA engine for supported R/C/L/diode/voltage-source circuits.",
    ...build.notes,
  ]

  try {
    const result = simulate(build.netlist)
    if (!result.tran) {
      return {
        engine: "spicey",
        circuitHash,
        netlist: build.netlist,
        signals: [],
        notes: ["No transient result was produced.", ...notes],
        diagnostics: {
          ...build.diagnostics,
          errors: ["No transient result was produced.", ...build.diagnostics.errors],
        },
      }
    }

    const signals = tranSignals(result.tran, build.netNameByNodeName, build.elements)
    return {
      engine: "spicey",
      circuitHash,
      netlist: build.netlist,
      signals,
      notes,
      diagnostics: build.diagnostics,
    }
  } catch (error) {
    const message = `SPICE simulation failed: ${error instanceof Error ? error.message : String(error)}`
    return {
      engine: "spicey",
      circuitHash,
      netlist: build.netlist,
      signals: [],
      notes: [message, ...notes],
      diagnostics: {
        ...build.diagnostics,
        errors: [message, ...build.diagnostics.errors],
      },
    }
  }
}

type SpiceTranResult = NonNullable<ReturnType<typeof simulate>["tran"]>

function tranSignals(
  tran: SpiceTranResult,
  netNameByNodeName: ReadonlyArray<NodeNetName>,
  elements: ReadonlyArray<SpiceElementBinding>,
): Signals {
  return buildTranSignals({
    times: tran.times,
    nodeVoltages: Object.entries(tran.nodeVoltages).map(([nodeName, values]) => ({
      nodeName,
      values,
    })),
    nodeNetNames: netNameByNodeName,
    elementCurrents: elements.flatMap(
      (element): Array<{
        element: SignalElement
        terminalCurrents: Array<{
          label: string
          current: ReadonlyArray<number>
        }>
      }> => {
        const expressions = new Set(
          element.terminals.flatMap((terminal) =>
            terminal.currentExpression ? [terminal.currentExpression] : [],
          ),
        )
        const current = tran.elementCurrents[element.spiceName]
        const terminalCurrents = element.terminals.flatMap((terminal) => {
          const constantCurrent = terminal.constantCurrent
          const values = constantCurrent === undefined
            ? current && expressions.size === 1
              ? current
              : null
            : tran.times.map(() => constantCurrent)
          return values
            ? [{
                label: terminal.label,
                current: terminal.negate
                  ? values.map((value) => -value)
                  : values,
              }]
            : []
        })
        return terminalCurrents.length > 0
          ? [{
              element: {
                refdes: element.refdes,
                terminals: element.terminals.map((terminal) => ({
                  label: terminal.label,
                  node: terminal.node,
                })),
              },
              terminalCurrents,
            }]
          : []
      },
    ),
  })
}
