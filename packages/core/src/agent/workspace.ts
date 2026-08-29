import {
  buildElectricalCircuit,
  circuitHashOf,
  renderCircuitTxt,
  type ElectricalCircuit,
} from "../circuit/electrical-circuit"
import type { CircuitProject, TransientAnalysis } from "../circuit/project"

export type AgentWorkspace = {
  readonly files: {
    readonly "/README.md": string
    readonly "/circuit.txt": string
  }
  readonly circuit: ElectricalCircuit
  readonly circuitHash: string
  readonly analysis: TransientAnalysis
}

/**
 * Builds the complete agent workspace for one exact project snapshot. The
 * workspace is virtual: files are generated strings, never host files.
 */
export function buildAgentWorkspace(project: CircuitProject): AgentWorkspace {
  const circuit = buildElectricalCircuit(project)
  const circuitHash = circuitHashOf(circuit)
  return {
    files: {
      "/README.md": readme(),
      "/circuit.txt": renderCircuitTxt(project, circuit, circuitHash),
    },
    circuit,
    circuitHash,
    analysis: project.analysis,
  }
}

function readme(): string {
  return `# Circuit analysis workspace

\`circuit.txt\` describes the current circuit snapshot.

## Circuit notation

Each component uses:

REFDES TYPE PARAMETERS [MODEL] | PIN=NET PIN=NET

Example:

R1 resistor R=1kOhm [model=ideal] | 1=VIN 2=VOUT

Terminals with the same exact net identifier are directly connected.
\`NC\` means a terminal is not connected to an extracted electrical net.

## Commands

circuit show
circuit component <component>
circuit around <component>
circuit net <net>
circuit connected <terminal> <terminal>
circuit path <start> <end>
circuit islands
circuit help [command]

Run \`circuit help <command>\` for command details.

Simulation commands (\`circuit simulate\`, \`circuit observe\`, \`circuit trace\`)
are not available in this environment yet.

## Conventions

\`circuit connected\` reports direct same-net connection only. A path through
components is shown by \`circuit path\` and does not by itself prove that
current flows under a specific condition.

Text matches from \`search_text\` are discovery, not proof of electrical
connectivity. Exact electrical questions use \`circuit\` commands.
`
}
