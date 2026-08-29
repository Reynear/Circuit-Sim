import { componentDefinitionLine } from "../circuit/electrical-circuit"
import type { ElectricalComponent, ElectricalNet } from "../circuit/electrical-circuit"
import type { AgentWorkspace } from "./workspace"

export type AgentCommandContext = {
  readonly workspace: AgentWorkspace
}

const MAX_PATHS = 8
const MAX_PATH_NETS = 12
const SEARCH_DEFAULT_LIMIT = 20
const SEARCH_CONTEXT_DEFAULT = 0

/**
 * Interprets one agent command against the workspace. Pure: no I/O, no host
 * access. Returns plain-text output; every failure is an explicit ERROR
 * message that names what went wrong and what exists.
 */
export function interpretAgentCommand(
  input: string,
  context: AgentCommandContext,
): string {
  const tokens = tokenize(input)
  const [head, ...rest] = tokens
  if (!head) {
    return "ERROR: empty command. Try `circuit help` or read /README.md."
  }
  switch (head) {
    case "read_file":
      return readFile(rest, context)
    case "search_text":
      return searchText(rest, context)
    case "circuit":
      return circuit(rest, context)
    default:
      return `ERROR: unknown command "${head}". Available: read_file, search_text, circuit.`
  }
}

// ---------------------------------------------------------------------------
// Workspace tools
// ---------------------------------------------------------------------------

function workspaceFile(
  workspace: AgentWorkspace,
  path: string,
): string | undefined {
  return Object.entries(workspace.files).find(([name]) => name === path)?.[1]
}

function readFile(args: string[], context: AgentCommandContext): string {
  const options = parseOptions(args)
  const path = optionValue(options, "path")
  if (!path) {
    return "ERROR: read_file requires path=<file>."
  }
  const content = workspaceFile(context.workspace, path)
  if (content === undefined) {
    return `ERROR: no such file: ${path}. Workspace files: ${Object.keys(
      context.workspace.files,
    ).join(" ")}`
  }

  const lines = content.split("\n")
  const start = numberOption(options, "start_line", 1)
  const count = numberOption(options, "line_count", lines.length)
  const from = Math.max(1, start)
  const to = Math.min(lines.length, from + count - 1)

  const numbered = []
  for (let index = from; index <= to; index += 1) {
    numbered.push(`${String(index).padStart(4)}  ${lines[index - 1] ?? ""}`)
  }
  const parts = numbered.join("\n")
  if (to < lines.length) {
    return `${parts}\n[truncated: lines ${to + 1}-${lines.length} of ${lines.length} remain; use start_line to continue]`
  }
  return parts
}

function searchText(args: string[], context: AgentCommandContext): string {
  const options = parseOptions(args)
  const pattern = optionValue(options, "pattern")
  if (!pattern) {
    return "ERROR: search_text requires pattern=<text>."
  }
  const requestedPath = optionValue(options, "path")
  const paths = requestedPath
    ? [requestedPath]
    : Object.keys(context.workspace.files)
  const files: Array<readonly [path: string, content: string]> = []
  for (const path of paths) {
    const content = workspaceFile(context.workspace, path)
    if (content === undefined) {
      return `ERROR: no such file: ${path}. Workspace files: ${Object.keys(
        context.workspace.files,
      ).join(" ")}`
    }
    files.push([path, content])
  }

  const useRegex = booleanOption(options, "regex")
  const ignoreCase = booleanOption(options, "ignore_case")
  const contextLines = numberOption(options, "context", SEARCH_CONTEXT_DEFAULT)
  const limit = numberOption(options, "limit", SEARCH_DEFAULT_LIMIT)

  let matcher: (line: string) => boolean
  if (useRegex) {
    try {
      const regex = new RegExp(pattern, ignoreCase ? "i" : "")
      matcher = (line) => regex.test(line)
    } catch (error) {
      return `ERROR: invalid regular expression "${pattern}": ${
        error instanceof Error ? error.message : String(error)
      }`
    }
  } else {
    const needle = ignoreCase ? pattern.toLowerCase() : pattern
    matcher = (line) =>
      (ignoreCase ? line.toLowerCase() : line).includes(needle)
  }

  const results: string[] = []
  let truncated = false
  for (const [path, content] of files) {
    const lines = content.split("\n")
    for (let index = 0; index < lines.length; index += 1) {
      if (!matcher(lines[index] ?? "")) {
        continue
      }
      if (results.length >= limit) {
        truncated = true
        break
      }
      const from = Math.max(0, index - contextLines)
      const to = Math.min(lines.length - 1, index + contextLines)
      for (let contextIndex = from; contextIndex <= to; contextIndex += 1) {
        const line = lines[contextIndex] ?? ""
        const prefix = contextIndex === index ? ":" : "-"
        results.push(`${path}:${contextIndex + 1}${prefix} ${line}`)
      }
    }
    if (truncated) {
      break
    }
  }

  if (results.length === 0) {
    return `No matches for "${pattern}" in ${paths.join(" ")}.`
  }
  return truncated
    ? `${results.join("\n")}\n[truncated: ${limit} match limit reached]`
    : results.join("\n")
}

// ---------------------------------------------------------------------------
// Circuit commands
// ---------------------------------------------------------------------------

function circuit(args: string[], context: AgentCommandContext): string {
  const [subcommand, ...rest] = args
  const circuit = context.workspace.circuit
  switch (subcommand) {
    case "show":
      return showCommand(circuit, context)
    case "component":
      return componentCommand(rest, circuit)
    case "around":
      return aroundCommand(rest, circuit)
    case "net":
      return netCommand(rest, circuit)
    case "connected":
      return connectedCommand(rest, circuit)
    case "path":
      return pathCommand(rest, circuit)
    case "islands":
      return islandsCommand(circuit)
    case "help":
      return helpCommand(rest)
    default:
      return `ERROR: unknown circuit command "${subcommand ?? ""}". Run \`circuit help\` for the command list.`
  }
}

function showCommand(
  circuit: AgentWorkspace["circuit"],
  context: AgentCommandContext,
): string {
  const componentLines = circuit.components.map(
    (component) => `  ${componentDefinitionLine(component)}`,
  )
  const netNames = circuit.nets.map((net) => net.name).join(" ")
  return [
    `HASH ${context.workspace.circuitHash}`,
    `COMPONENTS ${circuit.components.length}`,
    ...componentLines,
    `NETS ${circuit.nets.length}`,
    `  ${netNames}`,
    `ANALYSIS tran duration=${context.workspace.analysis.durationMs}ms step=${context.workspace.analysis.timeStepMs}ms`,
  ].join("\n")
}

function componentCommand(
  args: string[],
  circuit: AgentWorkspace["circuit"],
): string {
  const refdes = args[0]
  const component = findComponent(circuit, refdes)
  if (!component) {
    return unknownComponent(refdes, circuit)
  }
  const terminals = component.terminals.map(
    (terminal) => `  ${terminal.label} -> ${terminal.net ?? "NC"}`,
  )
  return [componentDefinitionLine(component), ...terminals].join("\n")
}

function aroundCommand(
  args: string[],
  circuit: AgentWorkspace["circuit"],
): string {
  const refdes = args[0]
  const component = findComponent(circuit, refdes)
  if (!component) {
    return unknownComponent(refdes, circuit)
  }
  const lines = [componentDefinitionLine(component)]
  for (const terminal of component.terminals) {
    lines.push(`  ${terminal.label} -> ${terminal.net ?? "NC"}`)
    if (terminal.net === null) {
      continue
    }
    for (const neighbor of terminalsOnNet(circuit, terminal.net)) {
      const [neighborRefdes, neighborPin] = splitTerminalRef(neighbor)
      if (neighborRefdes === component.refdes) {
        continue
      }
      const neighborComponent = findComponent(circuit, neighborRefdes)
      lines.push(
        `    ${neighborPin} on ${neighborRefdes} ${describeComponent(neighborComponent)}`,
      )
    }
  }
  return lines.join("\n")
}

function netCommand(
  args: string[],
  circuit: AgentWorkspace["circuit"],
): string {
  const name = args[0]
  const net = findNet(circuit, name)
  if (!net) {
    return unknownNet(name, circuit)
  }
  return [
    `NET ${net.name}`,
    ...net.terminals.map((ref) => `  ${ref.refdes}.${ref.pin}`),
  ].join("\n")
}

function connectedCommand(
  args: string[],
  circuit: AgentWorkspace["circuit"],
): string {
  if (args.length < 2) {
    return "ERROR: connected requires two terminals, e.g. `circuit connected R1.2 C1.1`."
  }
  const first = describeTerminalNet(circuit, args[0] ?? "")
  const second = describeTerminalNet(circuit, args[1] ?? "")
  if (typeof first === "string") {
    return first
  }
  if (typeof second === "string") {
    return second
  }
  if (first.net === second.net) {
    return `YES\n${first.ref} and ${second.ref} are on ${first.net}.`
  }
  const pathExists = findPaths(circuit, first.net, second.net, 1).length > 0
  const detail = pathExists
    ? `A path through components exists between ${first.net} and ${second.net} (see \`circuit path ${first.net} ${second.net}\`).`
    : `No connection was found between ${first.net} and ${second.net}.`
  return `NO\n${first.ref} is on ${first.net}. ${second.ref} is on ${second.net}.\n${detail}`
}

function pathCommand(
  args: string[],
  circuit: AgentWorkspace["circuit"],
): string {
  if (args.length < 2) {
    return "ERROR: path requires a start and end net, e.g. `circuit path VIN GND`."
  }
  const [startName, endName] = args
  if (!findNet(circuit, startName)) {
    return unknownNet(startName, circuit)
  }
  if (!findNet(circuit, endName)) {
    return unknownNet(endName, circuit)
  }
  if (startName === endName) {
    return `ERROR: start and end are the same net (${startName}).`
  }
  const paths = findPaths(circuit, startName ?? "", endName ?? "", MAX_PATHS)
  if (paths.length === 0) {
    return `NO PATH\nNo path through components connects ${startName} and ${endName}. They may be in disconnected regions (see \`circuit islands\`).`
  }
  const lines = paths.map(
    (path, index) => `PATH ${index + 1}\n${path.join(" -> ")}`,
  )
  if (paths.length === MAX_PATHS) {
    lines.push(
      `[truncated after ${MAX_PATHS} paths; more paths may exist]`,
    )
  }
  return lines.join("\n")
}

function islandsCommand(circuit: AgentWorkspace["circuit"]): string {
  const regions = islandRegions(circuit)
  return regions
    .map((region, index) => {
      const grounded = region.nets.includes("GND")
      return [
        `REGION ${index + 1}${grounded ? " grounded" : ""}`,
        `  nets: ${region.nets.join(" ") || "(none)"}`,
        `  components: ${region.components.join(" ") || "(none)"}`,
      ].join("\n")
    })
    .join("\n")
}

function helpCommand(args: string[]): string {
  const topic = args[0]
  const topics = {
    show: "circuit show — overview: circuit hash, every component, every net, analysis settings.",
    component:
      "circuit component <refdes> — one component's definition and each terminal's net.",
    around:
      "circuit around <refdes> — the component plus, per terminal, the other terminals sharing its net.",
    net: "circuit net <name> — every component terminal on one net.",
    connected:
      "circuit connected <REFDES.PIN> <REFDES.PIN> — whether two terminals share a net (direct connection, not a path through components).",
    path: "circuit path <net> <net> — every path through components between two nets, alternating nets and components. Bounded output.",
    islands: "circuit islands — disconnected regions of the circuit.",
  }
  const selected = Object.entries(topics).find(([name]) => name === topic)?.[1]
  if (selected) return selected
  return [
    "Available commands:",
    ...Object.values(topics).map((line) => `  ${line}`),
    "Workspace tools:",
    "  read_file path=<file> [start_line=N] [line_count=N] — read numbered lines of /README.md or /circuit.txt.",
    "  search_text pattern=<text> [path=<file>] [regex=true] [ignore_case=true] [context=N] [limit=N] — constrained text search.",
  ].join("\n")
}

// ---------------------------------------------------------------------------
// Topology queries over the circuit
// ---------------------------------------------------------------------------

function findComponent(
  circuit: AgentWorkspace["circuit"],
  refdes: string | undefined,
): ElectricalComponent | null {
  if (!refdes) {
    return null
  }
  return (
    circuit.components.find((component) => component.refdes === refdes) ?? null
  )
}

function findNet(
  circuit: AgentWorkspace["circuit"],
  name: string | undefined,
): ElectricalNet | null {
  if (!name) {
    return null
  }
  return circuit.nets.find((net) => net.name === name) ?? null
}

function terminalsOnNet(
  circuit: AgentWorkspace["circuit"],
  netName: string,
): readonly string[] {
  return (
    findNet(circuit, netName)?.terminals.map(
      (terminal) => `${terminal.refdes}.${terminal.pin}`,
    ) ?? []
  )
}

function describeComponent(
  component: ElectricalComponent | null,
): string {
  if (!component) {
    return "(unknown component)"
  }
  return componentDefinitionLine(component).slice(component.refdes.length + 1)
}

type TerminalNet = { ref: string; net: string }

function describeTerminalNet(
  circuit: AgentWorkspace["circuit"],
  ref: string,
): TerminalNet | string {
  const [refdes, pin] = splitTerminalRef(ref)
  if (!refdes || !pin) {
    return `ERROR: "${ref}" is not a terminal reference. Use REFDES.PIN, e.g. R1.2.`
  }
  const component = findComponent(circuit, refdes)
  if (!component) {
    return unknownComponent(refdes, circuit)
  }
  const terminal = component.terminals.find((candidate) => candidate.label === pin)
  if (!terminal) {
    return `ERROR: ${refdes} has no terminal "${pin}". Terminals: ${component.terminals
      .map((candidate) => candidate.label)
      .join(" ")}.`
  }
  if (terminal.net === null) {
    return `ERROR: ${ref} is not connected (NC).`
  }
  return { ref, net: terminal.net }
}

/** Splits `REFDES.PIN` on the last dot; pin labels may contain dots. */
function splitTerminalRef(ref: string): [string, string] {
  const splitAt = ref.lastIndexOf(".")
  if (splitAt <= 0 || splitAt === ref.length - 1) {
    return ["", ""]
  }
  return [ref.slice(0, splitAt), ref.slice(splitAt + 1)]
}

function netsOfComponent(component: ElectricalComponent): string[] {
  return component.terminals.flatMap((terminal) =>
    terminal.net === null ? [] : [terminal.net],
  ).filter((net, index, nets) => nets.indexOf(net) === index)
}

/** Bounded DFS for net→component→net paths between two nets. */
function findPaths(
  circuit: AgentWorkspace["circuit"],
  start: string,
  end: string,
  limit: number,
): string[][] {
  const componentsByNet = new Map<string, ElectricalComponent[]>()
  for (const component of circuit.components) {
    for (const net of netsOfComponent(component)) {
      componentsByNet.set(net, [...(componentsByNet.get(net) ?? []), component])
    }
  }

  const paths: string[][] = []
  const walk = (current: string, path: string[], visitedNets: Set<string>) => {
    if (paths.length >= limit) {
      return
    }
    if (path.length > MAX_PATH_NETS * 2) {
      return
    }
    for (const component of componentsByNet.get(current) ?? []) {
      for (const next of netsOfComponent(component)) {
        if (next === current || visitedNets.has(next)) {
          continue
        }
        const nextPath = [...path, component.refdes, next]
        if (next === end) {
          paths.push([start, ...nextPath])
          if (paths.length >= limit) {
            return
          }
          continue
        }
        visitedNets.add(next)
        walk(next, nextPath, visitedNets)
        visitedNets.delete(next)
      }
    }
  }
  walk(start, [start], new Set([start]))
  return paths
}

function islandRegions(
  circuit: AgentWorkspace["circuit"],
): Array<{ nets: string[]; components: string[] }> {
  const parent = new Map<string, string>()
  const find = (key: string): string => {
    let root = key
    while (parent.get(root) !== root) {
      root = parent.get(root)!
    }
    return root
  }
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b))
  }
  for (const net of circuit.nets) {
    parent.set(net.name, net.name)
  }
  for (const component of circuit.components) {
    const nets = netsOfComponent(component)
    if (nets.length === 0) {
      parent.set(component.refdes, component.refdes)
      continue
    }
    for (const net of nets.slice(1)) {
      union(nets[0]!, net)
    }
  }

  const byRoot = new Map<string, { nets: string[]; components: string[] }>()
  for (const net of circuit.nets) {
    const root = find(net.name)
    const region = byRoot.get(root) ?? { nets: [], components: [] }
    region.nets.push(net.name)
    byRoot.set(root, region)
  }
  for (const component of circuit.components) {
    const nets = netsOfComponent(component)
    if (nets.length === 0) {
      byRoot.set(component.refdes, {
        nets: [],
        components: [component.refdes],
      })
      continue
    }
    byRoot.get(find(nets[0]!))?.components.push(component.refdes)
  }
  return [...byRoot.values()].map((region) => ({
    nets: region.nets.sort((a, b) => a.localeCompare(b)),
    components: region.components.sort((a, b) => a.localeCompare(b)),
  }))
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

type ParsedOptions = {
  positional: string[]
  values: Array<{ name: string; value: string }>
}

function optionValue(options: ParsedOptions, name: string): string | undefined {
  return options.values.find((option) => option.name === name)?.value
}

function parseOptions(args: string[]): ParsedOptions {
  const positional: string[] = []
  const values: Array<{ name: string; value: string }> = []
  for (const arg of args) {
    const equalsAt = arg.indexOf("=")
    if (equalsAt > 0) {
      const key = arg.slice(0, equalsAt)
      const value = arg.slice(equalsAt + 1)
      values.push({ name: key, value })
    } else {
      positional.push(arg)
    }
  }
  return { positional, values }
}

function numberOption(
  options: ParsedOptions,
  key: string,
  fallback: number,
): number {
  const raw = optionValue(options, key)
  if (raw === undefined || raw === "") {
    return fallback
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback
}

function booleanOption(options: ParsedOptions, key: string): boolean {
  const raw = optionValue(options, key)
  return raw === "true" || raw === "1" || raw === "yes"
}

function unknownComponent(
  refdes: string | undefined,
  circuit: AgentWorkspace["circuit"],
): string {
  const known = circuit.components.map((component) => component.refdes)
  return `ERROR: unknown component "${refdes ?? ""}". Components: ${known.join(" ") || "(none)"}.`
}

function unknownNet(
  name: string | undefined,
  circuit: AgentWorkspace["circuit"],
): string {
  const known = circuit.nets.map((net) => net.name)
  return `ERROR: unknown net "${name ?? ""}". Nets: ${known.join(" ") || "(none)"}.`
}

/** Splits a command line into tokens, honoring double and single quotes. */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ""
  let quote: '"' | "'" | null = null
  let hasCurrent = false
  for (const char of input) {
    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      hasCurrent = true
      continue
    }
    if (/\s/.test(char)) {
      if (hasCurrent || current) {
        tokens.push(current)
        current = ""
        hasCurrent = false
      }
      continue
    }
    current += char
    hasCurrent = true
  }
  if (quote) {
    // Unterminated quote: treat the rest as one token; callers report errors.
    hasCurrent = true
  }
  if (hasCurrent || current) {
    tokens.push(current)
  }
  return tokens
}
