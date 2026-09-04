import { DateTime, Schema } from "effect"
import {
  andGate,
  capacitor,
  dcCurrentSource,
  dcPowerRail,
  dcVoltageSource,
  diode,
  getComponent,
  inductor,
  idealOpAmp,
  inverter,
  led,
  logicInput,
  logicOutput,
  nMosfet,
  npnTransistor,
  orGate,
  pMosfet,
  pulseVoltageSource,
  pnpTransistor,
  resistor,
  sineVoltageSource,
  switchComponent,
  zenerDiode,
  type ComponentPropertyDefinitions,
  type ComponentSpec,
} from "../circuit/components"
import { getPinPosts } from "../circuit/component-geometry"
import {
  CircuitProjectSchema,
  TransientAnalysisSchema,
  makeComponent,
  type CircuitProject,
  type Component,
  type Point,
  type SchematicObject,
} from "../circuit/project"
import { newId } from "../ids"

export const MAX_AGENT_COMPONENTS = 32
export const MAX_AGENT_NETS = 64

export const agentComponentSpecs = [
  resistor,
  capacitor,
  inductor,
  idealOpAmp,
  logicInput,
  logicOutput,
  andGate,
  orGate,
  inverter,
  switchComponent,
  dcVoltageSource,
  dcPowerRail,
  sineVoltageSource,
  pulseVoltageSource,
  dcCurrentSource,
  diode,
  zenerDiode,
  led,
  nMosfet,
  pMosfet,
  npnTransistor,
  pnpTransistor,
] as const

export type AgentComponentType = (typeof agentComponentSpecs)[number]["type"]

/** The validated component vocabulary exposed at agent-facing boundaries. */
export function agentComponentCatalog() {
  return agentComponentSpecs.map((spec) => {
    const semantics = componentSemantics(spec.type)
    return {
      type: spec.type,
      name: spec.name,
      defaultProperties: spec.defaults,
      properties: spec.propertyList.map((property) => ({
        key: property.key,
        label: property.label,
        input: property.input,
        default: property.default,
        ...(property.unit === undefined ? {} : { unit: property.unit }),
        ...(property.options === undefined ? {} : { options: property.options }),
      })),
      terminals: spec.terminals.map((terminal) => ({
        key: terminal.key,
        label: terminal.label,
        electrical: terminal.electrical,
      })),
      ...(semantics === undefined ? {} : { semantics }),
    }
  })
}

function componentSemantics(type: AgentComponentType) {
  return type === "dc-power-rail"
    ? {
        referenceNet: "GND",
        referenceIsImplicit: true,
        guidance:
          "Connect rail to the powered net. Positive values create VCC-like rails; negative values create VEE-like rails.",
      }
    : type === "dc-current-source"
      ? {
          currentFlowsFrom: "positive",
          currentFlowsTo: "negative",
          positiveLoadGuidance:
            "To raise a load net above GND, connect positive to GND and negative to the load net.",
        }
      : type === "pulse-voltage-source"
        ? {
            ngspicePrimitive: "PULSE",
            dutyCycleRange: "0 < dutyCyclePercent < 100",
            guidance:
              "Connect negative to GND for a ground-referenced PWM drive; initialVoltageVolts and pulsedVoltageVolts must differ.",
          }
        : undefined
}

const AgentIdentifierSchema = Schema.String.check(
  Schema.isMaxLength(64),
  Schema.isPattern(/^[A-Za-z][A-Za-z0-9_]*$/),
)

function agentComponentSchema<
  const Type extends string,
  const Definitions extends ComponentPropertyDefinitions,
>(spec: ComponentSpec<Type, Definitions>) {
  return Schema.Struct({
    refdes: AgentIdentifierSchema,
    type: Schema.Literal(spec.type),
    props: spec.props,
  })
}

export const AgentElectricalComponentSchema = Schema.Union([
  agentComponentSchema(resistor),
  agentComponentSchema(capacitor),
  agentComponentSchema(inductor),
  agentComponentSchema(idealOpAmp),
  agentComponentSchema(logicInput),
  agentComponentSchema(logicOutput),
  agentComponentSchema(andGate),
  agentComponentSchema(orGate),
  agentComponentSchema(inverter),
  agentComponentSchema(switchComponent),
  agentComponentSchema(dcVoltageSource),
  agentComponentSchema(dcPowerRail),
  agentComponentSchema(sineVoltageSource),
  agentComponentSchema(pulseVoltageSource),
  agentComponentSchema(dcCurrentSource),
  agentComponentSchema(diode),
  agentComponentSchema(zenerDiode),
  agentComponentSchema(led),
  agentComponentSchema(nMosfet),
  agentComponentSchema(pMosfet),
  agentComponentSchema(npnTransistor),
  agentComponentSchema(pnpTransistor),
])
export type AgentElectricalComponent =
  typeof AgentElectricalComponentSchema.Type

export const AgentTerminalRefSchema = Schema.Struct({
  refdes: AgentIdentifierSchema,
  pin: AgentIdentifierSchema,
})
export type AgentTerminalRef = typeof AgentTerminalRefSchema.Type

export const AgentElectricalNetSchema = Schema.Struct({
  name: AgentIdentifierSchema,
  terminals: Schema.Array(AgentTerminalRefSchema).check(Schema.isMinLength(1)),
})
export type AgentElectricalNet = typeof AgentElectricalNetSchema.Type

const AgentElectricalGraphDataSchema = Schema.Struct({
  components: Schema.Array(AgentElectricalComponentSchema),
  nets: Schema.Array(AgentElectricalNetSchema),
  groundNet: AgentIdentifierSchema,
  analysis: TransientAnalysisSchema,
})

/**
 * Geometry-free replacement command accepted from an agent boundary. It is
 * compiled into CircuitProject and is never persisted as a competing model.
 */
export const AgentElectricalGraphSchema = AgentElectricalGraphDataSchema.check(
  Schema.makeFilter(validateAgentElectricalGraph),
)
export type AgentElectricalGraph = typeof AgentElectricalGraphSchema.Type

function validateAgentElectricalGraph(
  graph: typeof AgentElectricalGraphDataSchema.Type,
): string | undefined {
  if (graph.components.length > MAX_AGENT_COMPONENTS) {
    return `Agent circuits support at most ${MAX_AGENT_COMPONENTS} components`
  }
  if (graph.nets.length > MAX_AGENT_NETS) {
    return `Agent circuits support at most ${MAX_AGENT_NETS} nets`
  }

  const componentByRefdes = new Map(
    graph.components.map((component) => [component.refdes, component]),
  )
  if (componentByRefdes.size !== graph.components.length) {
    return "Agent component reference designators must be unique"
  }
  for (const component of graph.components) {
    if (
      component.type === "ideal-op-amp-minus-top" &&
      component.props.minOutputVolts >= component.props.maxOutputVolts
    ) {
      return `${component.refdes} minimum output voltage must be below its maximum output voltage`
    }
    if (
      component.type === "logic-input" &&
      component.props.lowLogicVoltageVolts >= component.props.highLogicVoltageVolts
    ) {
      return `${component.refdes} low logic voltage must be below its high logic voltage`
    }
    if (
      component.type === "pulse-voltage-source" &&
      component.props.initialVoltageVolts ===
        component.props.pulsedVoltageVolts
    ) {
      return `${component.refdes} pulse voltages must differ`
    }
  }

  const netNames = graph.nets.map((net) => net.name)
  if (new Set(netNames).size !== netNames.length) {
    return "Agent net names must be unique"
  }
  if (!netNames.includes(graph.groundNet)) {
    return `Agent ground net ${graph.groundNet} must name one of the submitted nets`
  }
  if (graph.groundNet !== "GND" && netNames.includes("GND")) {
    return `Agent ground net ${graph.groundNet} conflicts with the reserved GND net name`
  }

  const netByTerminal = new Map<string, string>()
  for (const net of graph.nets) {
    for (const terminal of net.terminals) {
      const component = componentByRefdes.get(terminal.refdes)
      if (!component) {
        return `${terminal.refdes}.${terminal.pin} refers to an unknown component`
      }
      if (
        !getComponent(component.type).terminals.some(
          (candidate) => candidate.key === terminal.pin,
        )
      ) {
        return `${terminal.refdes}.${terminal.pin} is not a catalog terminal`
      }

      const key = terminalKey(terminal)
      const existingNet = netByTerminal.get(key)
      if (existingNet) {
        return `${key} cannot belong to both ${existingNet} and ${net.name}`
      }
      netByTerminal.set(key, net.name)
    }
  }

  for (const component of graph.components) {
    if (component.type !== "switch" || component.props.state !== "closed") {
      continue
    }
    const firstNet = netByTerminal.get(`${component.refdes}.a`)
    const secondNet = netByTerminal.get(`${component.refdes}.b`)
    if (!firstNet || firstNet !== secondNet) {
      return `${component.refdes} is closed, so terminals a and b must name the same net`
    }
  }

  for (const component of graph.components) {
    if (component.type !== "dc-power-rail") continue
    const railNet = netByTerminal.get(`${component.refdes}.rail`)
    if (railNet === graph.groundNet && component.props.voltageVolts !== 0) {
      return `${component.refdes}.rail cannot be connected to ground at a nonzero voltage`
    }
  }

  return undefined
}

/**
 * Replaces the complete electrical content of a project with a deterministic
 * schematic. IDs and update time identify this compilation; component
 * placement and wire geometry depend only on the validated graph.
 */
export function compileAgentElectricalGraph(
  project: CircuitProject,
  graph: AgentElectricalGraph,
): CircuitProject {
  const sortedComponents = [...graph.components].sort(compareComponents)
  const layout = layoutCircuit(
    project,
    sortedComponents,
    graph.nets,
    graph.groundNet,
  )
  const components = sortedComponents.map((component) =>
    makeComponent({
      kind: "component",
      id: newId(),
      type: component.type,
      refdes: component.refdes,
      props: component.props,
      ...layout.placements.get(component.refdes)!,
    }),
  )
  const componentByRefdes = new Map(
    components.map((component) => [component.refdes, component]),
  )
  const routedObjects = routeNets(
    graph.nets,
    componentByRefdes,
    graph.groundNet,
    layout.compactRouting,
  )

  return Schema.decodeUnknownSync(Schema.toType(CircuitProjectSchema))({
    ...project,
    objects: [...components, ...routedObjects],
    analysis: graph.analysis,
    updatedAt: DateTime.nowUnsafe(),
  })
}

type ComponentPlacement = {
  readonly position: Point
  readonly rotation: Component["rotation"]
  readonly flipped: boolean
}

type CircuitLayout = {
  readonly placements: ReadonlyMap<string, ComponentPlacement>
  readonly compactRouting: boolean
}

type LayoutTopology = {
  readonly componentByRefdes: ReadonlyMap<string, AgentElectricalComponent>
  readonly netByName: ReadonlyMap<string, AgentElectricalNet>
  readonly netByTerminal: ReadonlyMap<string, string>
}

type TwoTerminalConnection = {
  readonly component: AgentElectricalComponent
  readonly first: { readonly pin: string; readonly net: string }
  readonly second: { readonly pin: string; readonly net: string }
}

type RailSource = {
  readonly component: AgentElectricalComponent
  readonly rail: string
  readonly connection: TwoTerminalConnection | undefined
}

type SupplySource = {
  readonly component: AgentElectricalComponent
  readonly supplyNet: string
  readonly connection: TwoTerminalConnection | undefined
}

type NetPath = {
  readonly components: ReadonlyArray<AgentElectricalComponent>
  readonly nets: ReadonlyArray<string>
}

function layoutCircuit(
  project: CircuitProject,
  components: ReadonlyArray<AgentElectricalComponent>,
  nets: ReadonlyArray<AgentElectricalNet>,
  groundNet: string,
): CircuitLayout {
  const topology = layoutTopology(components, nets)
  const specialized = voltageAmplifierDrivenComplementaryFollowerPlacements(
    components,
    topology,
    groundNet,
  ) ?? complementaryFollowerPlacements(
    components,
    topology,
    groundNet,
  ) ?? tunedCommonEmitterPlacements(
    components,
    topology,
    groundNet,
  ) ?? commonEmitterAmplifierPlacements(
    components,
    topology,
    groundNet,
  ) ?? singleRailNpnFollowerPlacements(components, topology, groundNet)
  if (specialized?.size === components.length) {
    return { placements: specialized, compactRouting: true }
  }

  const positions = layoutComponents(project, components, nets, groundNet)
  return {
    compactRouting: false,
    placements: new Map(components.map((component) => [
      component.refdes,
      {
        position: positions.get(component.refdes)!,
        rotation: componentRotation(component, nets, groundNet),
        flipped: componentIsFlipped(component),
      },
    ])),
  }
}

function layoutTopology(
  components: ReadonlyArray<AgentElectricalComponent>,
  nets: ReadonlyArray<AgentElectricalNet>,
): LayoutTopology {
  return {
    componentByRefdes: new Map(
      components.map((component) => [component.refdes, component]),
    ),
    netByName: new Map(nets.map((net) => [net.name, net])),
    netByTerminal: new Map(
      nets.flatMap((net) =>
        net.terminals.map((terminal) => [terminalKey(terminal), net.name] as const),
      ),
    ),
  }
}

function componentIsFlipped(component: AgentElectricalComponent): boolean {
  return component.type === "pnp-transistor" || component.type === "p-mosfet"
}

function terminalNet(
  topology: LayoutTopology,
  refdes: string,
  pin: string,
): string | undefined {
  return topology.netByTerminal.get(`${refdes}.${pin}`)
}

function twoTerminalConnection(
  component: AgentElectricalComponent,
  topology: LayoutTopology,
): TwoTerminalConnection | undefined {
  const terminals = getComponent(component.type).terminals
  if (terminals.length !== 2) return undefined
  const [firstPin, secondPin] = terminals
  const firstNet = terminalNet(topology, component.refdes, firstPin!.key)
  const secondNet = terminalNet(topology, component.refdes, secondPin!.key)
  if (!firstNet || !secondNet || firstNet === secondNet) return undefined
  return {
    component,
    first: { pin: firstPin!.key, net: firstNet },
    second: { pin: secondPin!.key, net: secondNet },
  }
}

function connectionBetween(
  components: ReadonlyArray<AgentElectricalComponent>,
  topology: LayoutTopology,
  firstNet: string,
  secondNet: string,
  acceptedTypes?: ReadonlySet<AgentComponentType>,
): TwoTerminalConnection | undefined {
  return components
    .flatMap((component) => {
      if (acceptedTypes && !acceptedTypes.has(component.type)) return []
      const connection = twoTerminalConnection(component, topology)
      if (!connection) return []
      return (
        connection.first.net === firstNet && connection.second.net === secondNet
      ) || (
        connection.first.net === secondNet && connection.second.net === firstNet
      )
        ? [connection]
        : []
    })
    .sort((a, b) => compareComponents(a.component, b.component))[0]
}

function verticalRotation(
  connection: TwoTerminalConnection,
  topNet: string,
): Component["rotation"] {
  const pin = connection.first.net === topNet
    ? connection.first.pin
    : connection.second.pin
  const terminal = getComponent(connection.component.type).terminals.find(
    (candidate) => candidate.key === pin,
  )
  if (!terminal) return 0
  return terminal.position[0] <= 0 ? 90 : 270
}

function horizontalRotation(
  connection: TwoTerminalConnection,
  leftNet: string,
): Component["rotation"] {
  const pin = connection.first.net === leftNet
    ? connection.first.pin
    : connection.second.pin
  const terminal = getComponent(connection.component.type).terminals.find(
    (candidate) => candidate.key === pin,
  )
  if (!terminal) return 0
  return terminal.position[0] <= 0 ? 0 : 180
}

function placement(
  component: AgentElectricalComponent,
  position: Point,
  rotation: Component["rotation"] = 0,
): ComponentPlacement {
  return {
    position,
    rotation,
    flipped: componentIsFlipped(component),
  }
}

const BIAS_PATH_TYPES = new Set<AgentComponentType>([
  "resistor",
  "diode",
  "zener-diode",
  "led",
  "dc-voltage-source",
])

const SHUNT_TYPES = new Set<AgentComponentType>([
  "resistor",
  "capacitor",
  "inductor",
  "diode",
  "zener-diode",
  "led",
])

function findNetPath(
  components: ReadonlyArray<AgentElectricalComponent>,
  topology: LayoutTopology,
  startNet: string,
  endNet: string,
  forbiddenNets: ReadonlySet<string>,
  excludedRefdes: ReadonlySet<string>,
  acceptedTypes = BIAS_PATH_TYPES,
): NetPath | undefined {
  type QueueEntry = NetPath & { readonly current: string }
  const queue: QueueEntry[] = [{ current: startNet, components: [], nets: [startNet] }]
  const bestDepth = new Map([[startNet, 0]])
  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.current === endNet) return current
    if (current.components.length >= 6) continue
    const edges = components
      .flatMap((component) => {
        if (
          excludedRefdes.has(component.refdes) ||
          !acceptedTypes.has(component.type)
        ) return []
        const connection = twoTerminalConnection(component, topology)
        if (!connection) return []
        if (connection.first.net === current.current) {
          return [{ component, next: connection.second.net }]
        }
        if (connection.second.net === current.current) {
          return [{ component, next: connection.first.net }]
        }
        return []
      })
      .filter(({ next }) => next === endNet || !forbiddenNets.has(next))
      .sort((a, b) =>
        biasPathPriority(a.component) - biasPathPriority(b.component) ||
        compareComponents(a.component, b.component),
      )
    for (const edge of edges) {
      const nextDepth = current.components.length + 1
      if ((bestDepth.get(edge.next) ?? Number.POSITIVE_INFINITY) <= nextDepth) continue
      bestDepth.set(edge.next, nextDepth)
      queue.push({
        current: edge.next,
        components: [...current.components, edge.component],
        nets: [...current.nets, edge.next],
      })
    }
  }
  return undefined
}

function biasPathPriority(component: AgentElectricalComponent): number {
  switch (component.type) {
    case "diode":
    case "zener-diode":
    case "led":
      return 0
    case "dc-voltage-source":
      return 1
    default:
      return 2
  }
}

type EmitterOutputOption = {
  readonly net: string
  readonly ballast?: TwoTerminalConnection
}

function emitterOutputOptions(
  transistor: AgentElectricalComponent,
  components: ReadonlyArray<AgentElectricalComponent>,
  topology: LayoutTopology,
  groundNet: string,
): ReadonlyArray<EmitterOutputOption> {
  const emitterNet = terminalNet(topology, transistor.refdes, "emitter")
  if (!emitterNet) return []
  const throughBallast = components.flatMap((component) => {
    if (component.type !== "resistor") return []
    const connection = twoTerminalConnection(component, topology)
    if (!connection) return []
    if (connection.first.net === emitterNet && connection.second.net !== groundNet) {
      return [{ net: connection.second.net, ballast: connection }]
    }
    if (connection.second.net === emitterNet && connection.first.net !== groundNet) {
      return [{ net: connection.first.net, ballast: connection }]
    }
    return []
  })
  return [{ net: emitterNet }, ...throughBallast]
}

function groundedShunt(
  components: ReadonlyArray<AgentElectricalComponent>,
  topology: LayoutTopology,
  net: string,
  groundNet: string,
): TwoTerminalConnection | undefined {
  return connectionBetween(components, topology, net, groundNet, SHUNT_TYPES)
}

function darlingtonDriver(
  finalTransistor: AgentElectricalComponent,
  components: ReadonlyArray<AgentElectricalComponent>,
  topology: LayoutTopology,
): AgentElectricalComponent | undefined {
  const baseNet = terminalNet(topology, finalTransistor.refdes, "base")
  const collectorNet = terminalNet(topology, finalTransistor.refdes, "collector")
  if (!baseNet || !collectorNet) return undefined
  return components
    .filter((candidate) =>
      candidate.refdes !== finalTransistor.refdes &&
      candidate.type === finalTransistor.type &&
      terminalNet(topology, candidate.refdes, "emitter") === baseNet &&
      terminalNet(topology, candidate.refdes, "collector") === collectorNet,
    )
    .sort(compareComponents)[0]
}

/** Places a single-transistor tuned stage with its parallel tank above the collector. */
function tunedCommonEmitterPlacements(
  components: ReadonlyArray<AgentElectricalComponent>,
  topology: LayoutTopology,
  groundNet: string,
): ReadonlyMap<string, ComponentPlacement> | undefined {
  const supplies = components
    .filter((component) => component.type === "dc-power-rail")
    .flatMap((component) => {
      const supplyNet = terminalNet(topology, component.refdes, "rail")
      return supplyNet ? [{ component, supplyNet }] : []
    })
    .sort((a, b) => compareComponents(a.component, b.component))

  for (const supply of supplies) {
    const transistors = components
      .filter((component) =>
        component.type === "npn-transistor" &&
        terminalNet(topology, component.refdes, "emitter") === groundNet,
      )
      .sort(compareComponents)
    for (const transistor of transistors) {
      const baseNet = terminalNet(topology, transistor.refdes, "base")
      const collectorNet = terminalNet(topology, transistor.refdes, "collector")
      if (!baseNet || !collectorNet) continue
      const tank = components
        .flatMap((component) => {
          if (
            component.type !== "resistor" &&
            component.type !== "inductor" &&
            component.type !== "capacitor"
          ) return []
          const connection = twoTerminalConnection(component, topology)
          if (!connection) return []
          return (
            connection.first.net === supply.supplyNet &&
            connection.second.net === collectorNet
          ) || (
            connection.second.net === supply.supplyNet &&
            connection.first.net === collectorNet
          )
            ? [connection]
            : []
        })
        .sort((a, b) => compareComponents(a.component, b.component))
      if (
        !tank.some(({ component }) => component.type === "resistor") ||
        !tank.some(({ component }) => component.type === "inductor") ||
        !tank.some(({ component }) => component.type === "capacitor")
      ) continue

      const baseDrive = components
        .filter((component) => component.type === "resistor")
        .flatMap((component) => {
          const connection = twoTerminalConnection(component, topology)
          if (!connection) return []
          const driveNet = connection.first.net === baseNet
            ? connection.second.net
            : connection.second.net === baseNet
              ? connection.first.net
              : undefined
          return driveNet ? [{ connection, driveNet }] : []
        })
        .sort((a, b) => compareComponents(a.connection.component, b.connection.component))[0]
      if (!baseDrive) continue

      const signal = components
        .filter((component) => component.type === "sine-voltage-source")
        .flatMap((component) => {
          const connection = twoTerminalConnection(component, topology)
          if (!connection) return []
          const biasNet = connection.first.net === baseDrive.driveNet
            ? connection.second.net
            : connection.second.net === baseDrive.driveNet
              ? connection.first.net
              : undefined
          return biasNet ? [{ connection, biasNet }] : []
        })
        .sort((a, b) => compareComponents(a.connection.component, b.connection.component))[0]
      if (!signal) continue
      const bias = components
        .filter((component) => component.type === "dc-voltage-source")
        .flatMap((component) => {
          const connection = twoTerminalConnection(component, topology)
          if (!connection) return []
          return (
            connection.first.net === signal.biasNet &&
            connection.second.net === groundNet
          ) || (
            connection.second.net === signal.biasNet &&
            connection.first.net === groundNet
          )
            ? [connection]
            : []
        })
        .sort((a, b) => compareComponents(a.component, b.component))[0]
      if (!bias) continue

      const placedRefdes = new Set([
        supply.component.refdes,
        transistor.refdes,
        baseDrive.connection.component.refdes,
        signal.connection.component.refdes,
        bias.component.refdes,
        ...tank.map(({ component }) => component.refdes),
      ])
      if (components.some((component) => !placedRefdes.has(component.refdes))) continue

      const topRailY = 120
      const collectorY = 360
      const baseY = 392
      const xSource = 280
      const xBaseResistor = 520
      const xTransistor = 720
      const tankXs = [600, 748, 896]
      const result = new Map<string, ComponentPlacement>()
      result.set(supply.component.refdes, placement(
        supply.component,
        { x: 748, y: topRailY - 40 },
      ))
      result.set(signal.connection.component.refdes, placement(
        signal.connection.component,
        { x: xSource, y: baseY + 32 },
        verticalRotation(signal.connection, baseDrive.driveNet),
      ))
      result.set(bias.component.refdes, placement(
        bias.component,
        { x: xSource, y: baseY + 96 },
        verticalRotation(bias, signal.biasNet),
      ))
      result.set(baseDrive.connection.component.refdes, placement(
        baseDrive.connection.component,
        { x: xBaseResistor, y: baseY },
        horizontalRotation(baseDrive.connection, baseDrive.driveNet),
      ))
      result.set(transistor.refdes, placement(
        transistor,
        { x: xTransistor, y: baseY },
      ))
      tank.forEach((connection, index) => {
        result.set(connection.component.refdes, placement(
          connection.component,
          {
            x: tankXs[index] ?? tankXs.at(-1)! + (index - 2) * 112,
            y: Math.round((topRailY + collectorY) / 2),
          },
          verticalRotation(connection, supply.supplyNet),
        ))
      })
      return result
    }
  }
  return undefined
}

/**
 * Recognizes the textbook capacitively coupled common-emitter stage. Keeping
 * its bias divider, collector load, emitter network, and output load in their
 * conventional columns is substantially clearer than treating every shared
 * supply node as a generic graph-rank edge.
 */
function commonEmitterAmplifierPlacements(
  components: ReadonlyArray<AgentElectricalComponent>,
  topology: LayoutTopology,
  groundNet: string,
): ReadonlyMap<string, ComponentPlacement> | undefined {
  const supplies = components
    .filter((component) =>
      component.type === "dc-power-rail" ||
      component.type === "dc-voltage-source",
    )
    .flatMap((component): SupplySource[] => {
      if (component.type === "dc-power-rail") {
        const supplyNet = terminalNet(topology, component.refdes, "rail")
        return supplyNet ? [{ component, supplyNet, connection: undefined }] : []
      }
      const connection = twoTerminalConnection(component, topology)
      if (!connection) return []
      const supplyNet = connection.first.net === groundNet
        ? connection.second.net
        : connection.second.net === groundNet
          ? connection.first.net
          : undefined
      return supplyNet ? [{ component, supplyNet, connection }] : []
    })
    .sort((a, b) => compareComponents(a.component, b.component))

  for (const supply of supplies) {
    const transistors = components
      .filter((component) =>
        component.type === "npn-transistor" &&
        terminalNet(topology, component.refdes, "collector") !== supply.supplyNet,
      )
      .sort(compareComponents)
    for (const transistor of transistors) {
      const baseNet = terminalNet(topology, transistor.refdes, "base")
      const collectorNet = terminalNet(topology, transistor.refdes, "collector")
      const emitterNet = terminalNet(topology, transistor.refdes, "emitter")
      if (!baseNet || !collectorNet || !emitterNet) continue

      const baseFeed = connectionBetween(
        components,
        topology,
        supply.supplyNet,
        baseNet,
        new Set(["resistor"]),
      )
      const baseShunt = connectionBetween(
        components,
        topology,
        baseNet,
        groundNet,
        new Set(["resistor"]),
      )
      const collectorFeed = connectionBetween(
        components,
        topology,
        supply.supplyNet,
        collectorNet,
        new Set(["resistor"]),
      )
      const emitterShunt = connectionBetween(
        components,
        topology,
        emitterNet,
        groundNet,
        new Set(["resistor"]),
      )
      const emitterBypass = connectionBetween(
        components,
        topology,
        emitterNet,
        groundNet,
        new Set(["capacitor"]),
      )
      if (
        !baseFeed || !baseShunt || !collectorFeed ||
        !emitterShunt || !emitterBypass
      ) continue

      const output = components
        .filter((component) => component.type === "capacitor")
        .flatMap((component) => {
          const coupling = twoTerminalConnection(component, topology)
          if (!coupling) return []
          const outputNet = coupling.first.net === collectorNet
            ? coupling.second.net
            : coupling.second.net === collectorNet
              ? coupling.first.net
              : undefined
          if (!outputNet) return []
          const load = connectionBetween(
            components,
            topology,
            outputNet,
            groundNet,
            new Set(["resistor"]),
          )
          return load ? [{ coupling, outputNet, load }] : []
        })
        .sort((a, b) => compareComponents(a.coupling.component, b.coupling.component))[0]
      if (!output) continue

      const input = components
        .filter((component) =>
          component.type === "sine-voltage-source" ||
          component.type === "pulse-voltage-source" ||
          component.type === "dc-voltage-source",
        )
        .flatMap((component) => {
          if (component.refdes === supply.component.refdes) return []
          const source = twoTerminalConnection(component, topology)
          if (!source) return []
          const inputNet = source.first.net === groundNet
            ? source.second.net
            : source.second.net === groundNet
              ? source.first.net
              : undefined
          if (!inputNet) return []
          const coupling = connectionBetween(
            components,
            topology,
            inputNet,
            baseNet,
            new Set(["capacitor"]),
          )
          return coupling ? [{ source, inputNet, coupling }] : []
        })
        .sort((a, b) => compareComponents(a.source.component, b.source.component))[0]
      if (!input) continue

      const placedRefdes = new Set([
        supply.component.refdes,
        transistor.refdes,
        baseFeed.component.refdes,
        baseShunt.component.refdes,
        collectorFeed.component.refdes,
        emitterShunt.component.refdes,
        emitterBypass.component.refdes,
        output.coupling.component.refdes,
        output.load.component.refdes,
        input.source.component.refdes,
        input.coupling.component.refdes,
      ])
      if (components.some((component) => !placedRefdes.has(component.refdes))) continue

      const topRailY = 120
      const baseY = 360
      const collectorY = baseY - 32
      const emitterY = baseY + 32
      const xInput = 160
      const xInputCoupling = 320
      const xBias = 480
      const xTransistor = 720
      const xOutputCoupling = 880
      const xLoad = 1_060
      const result = new Map<string, ComponentPlacement>()

      result.set(supply.component.refdes, supply.connection
        ? placement(
            supply.component,
            { x: xInput, y: 176 },
            verticalRotation(supply.connection, supply.supplyNet),
          )
        : placement(supply.component, { x: 640, y: topRailY - 40 }))
      result.set(input.source.component.refdes, placement(
        input.source.component,
        { x: xInput, y: baseY + 32 },
        verticalRotation(input.source, input.inputNet),
      ))
      result.set(input.coupling.component.refdes, placement(
        input.coupling.component,
        { x: xInputCoupling, y: baseY },
        horizontalRotation(input.coupling, input.inputNet),
      ))
      result.set(baseFeed.component.refdes, placement(
        baseFeed.component,
        { x: xBias, y: 240 },
        verticalRotation(baseFeed, supply.supplyNet),
      ))
      result.set(baseShunt.component.refdes, placement(
        baseShunt.component,
        { x: xBias, y: 500 },
        verticalRotation(baseShunt, baseNet),
      ))
      result.set(collectorFeed.component.refdes, placement(
        collectorFeed.component,
        { x: xTransistor + 28, y: 220 },
        verticalRotation(collectorFeed, supply.supplyNet),
      ))
      result.set(transistor.refdes, placement(
        transistor,
        { x: xTransistor, y: baseY },
      ))
      result.set(emitterShunt.component.refdes, placement(
        emitterShunt.component,
        { x: xTransistor + 28, y: 520 },
        verticalRotation(emitterShunt, emitterNet),
      ))
      result.set(emitterBypass.component.refdes, placement(
        emitterBypass.component,
        { x: xOutputCoupling, y: 520 },
        verticalRotation(emitterBypass, emitterNet),
      ))
      result.set(output.coupling.component.refdes, placement(
        output.coupling.component,
        { x: xOutputCoupling, y: collectorY },
        horizontalRotation(output.coupling, collectorNet),
      ))
      result.set(output.load.component.refdes, placement(
        output.load.component,
        { x: xLoad, y: emitterY + 76 },
        verticalRotation(output.load, output.outputNet),
      ))
      return result
    }
  }
  return undefined
}

/**
 * Recognizes a complementary emitter follower driven by a common-emitter
 * voltage-amplifier stage. This is the standard topology where a trim chain
 * biases the driver and the driver collector closes the lower end of the
 * diode bias string.
 */
function voltageAmplifierDrivenComplementaryFollowerPlacements(
  components: ReadonlyArray<AgentElectricalComponent>,
  topology: LayoutTopology,
  groundNet: string,
): ReadonlyMap<string, ComponentPlacement> | undefined {
  const npns = components
    .filter((component) => component.type === "npn-transistor")
    .sort(compareComponents)
  const pnps = components
    .filter((component) => component.type === "pnp-transistor")
    .sort(compareComponents)

  for (const upper of npns) {
    const outputNet = terminalNet(topology, upper.refdes, "emitter")
    const upperRail = terminalNet(topology, upper.refdes, "collector")
    const upperBase = terminalNet(topology, upper.refdes, "base")
    if (!outputNet || !upperRail || !upperBase) continue
    for (const lower of pnps) {
      const lowerOutput = terminalNet(topology, lower.refdes, "emitter")
      const lowerRail = terminalNet(topology, lower.refdes, "collector")
      const lowerBase = terminalNet(topology, lower.refdes, "base")
      if (
        lowerOutput !== outputNet || !lowerRail || !lowerBase ||
        lowerRail === upperRail
      ) continue
      const load = connectionBetween(
        components,
        topology,
        outputNet,
        groundNet,
        new Set(["resistor"]),
      )
      const upperFeed = connectionBetween(
        components,
        topology,
        upperRail,
        upperBase,
        new Set(["resistor"]),
      )
      if (!load || !upperFeed) continue

      const biasPath = findNetPath(
        components,
        topology,
        upperBase,
        lowerBase,
        new Set([groundNet, upperRail, lowerRail, outputNet]),
        new Set([upper.refdes, lower.refdes, load.component.refdes]),
        new Set(["diode", "zener-diode", "led"]),
      )
      if (!biasPath || biasPath.components.length === 0) continue

      const drivers = npns.filter((component) =>
        component.refdes !== upper.refdes &&
        terminalNet(topology, component.refdes, "collector") === lowerBase,
      )
      for (const driver of drivers) {
        const driverBase = terminalNet(topology, driver.refdes, "base")
        const driverEmitter = terminalNet(topology, driver.refdes, "emitter")
        if (!driverBase || !driverEmitter) continue
        const emitterFeed = connectionBetween(
          components,
          topology,
          driverEmitter,
          lowerRail,
          new Set(["resistor"]),
        )
        const driverSupplyFeed = connectionBetween(
          components,
          topology,
          upperRail,
          driverBase,
          new Set(["resistor"]),
        )
        if (!emitterFeed || !driverSupplyFeed) continue

        const excluded = new Set([
          upper.refdes,
          lower.refdes,
          driver.refdes,
          load.component.refdes,
          upperFeed.component.refdes,
          emitterFeed.component.refdes,
          driverSupplyFeed.component.refdes,
          ...biasPath.components.map(({ refdes }) => refdes),
        ])
        const trimPath = findNetPath(
          components,
          topology,
          driverBase,
          lowerRail,
          new Set([groundNet, upperRail, outputNet, upperBase, lowerBase]),
          excluded,
          new Set(["resistor"]),
        )
        if (!trimPath || trimPath.components.length === 0) continue

        const input = components
          .filter((component) =>
            component.type === "sine-voltage-source" ||
            component.type === "pulse-voltage-source",
          )
          .flatMap((component) => {
            const source = twoTerminalConnection(component, topology)
            if (!source) return []
            const inputNet = source.first.net === groundNet
              ? source.second.net
              : source.second.net === groundNet
                ? source.first.net
                : undefined
            if (!inputNet) return []
            const path = findNetPath(
              components,
              topology,
              inputNet,
              driverBase,
              new Set([groundNet, upperRail, lowerRail, outputNet]),
              new Set([...excluded, ...trimPath.components.map(({ refdes }) => refdes)]),
              new Set(["capacitor"]),
            )
            return path ? [{ source, inputNet, path }] : []
          })
          .sort((a, b) => compareComponents(a.source.component, b.source.component))[0]
        if (!input) continue

        const railSources = components
          .filter((component) =>
            component.type === "dc-power-rail" ||
            component.type === "dc-voltage-source",
          )
          .flatMap((component): RailSource[] => {
            if (component.type === "dc-power-rail") {
              const rail = terminalNet(topology, component.refdes, "rail")
              return rail === upperRail || rail === lowerRail
                ? [{ component, rail, connection: undefined }]
                : []
            }
            const connection = twoTerminalConnection(component, topology)
            if (!connection) return []
            const rail = connection.first.net === groundNet
              ? connection.second.net
              : connection.second.net === groundNet
                ? connection.first.net
                : undefined
            return rail === upperRail || rail === lowerRail
              ? [{ component, rail, connection }]
              : []
          })
          .sort((a, b) => compareComponents(a.component, b.component))
        if (
          !railSources.some(({ rail }) => rail === upperRail) ||
          !railSources.some(({ rail }) => rail === lowerRail)
        ) continue

        const placedRefdes = new Set([
          upper.refdes,
          lower.refdes,
          driver.refdes,
          load.component.refdes,
          upperFeed.component.refdes,
          emitterFeed.component.refdes,
          driverSupplyFeed.component.refdes,
          ...biasPath.components.map(({ refdes }) => refdes),
          ...trimPath.components.map(({ refdes }) => refdes),
          input.source.component.refdes,
          ...input.path.components.map(({ refdes }) => refdes),
          ...railSources.map(({ component }) => component.refdes),
        ])
        if (components.some((component) => !placedRefdes.has(component.refdes))) continue

        const topRailY = 120
        const upperBaseY = 300
        const lowerBaseY = 620
        const bottomRailY = 880
        const outputY = 460
        const driverBaseY = 652
        const xInput = 160
        const xInputPath = 340
        const xTrim = 440
        const xBias = 520
        const xDriver = 650
        const xFinal = 800
        const xLoad = 1_040
        const result = new Map<string, ComponentPlacement>()

        result.set(upper.refdes, placement(upper, { x: xFinal, y: upperBaseY }))
        result.set(lower.refdes, placement(lower, { x: xFinal, y: lowerBaseY }))
        result.set(driver.refdes, placement(driver, { x: xDriver, y: driverBaseY }))
        result.set(upperFeed.component.refdes, placement(
          upperFeed.component,
          { x: xBias, y: 200 },
          verticalRotation(upperFeed, upperRail),
        ))
        biasPath.components.forEach((component, index) => {
          const connection = twoTerminalConnection(component, topology)!
          const topNet = biasPath.nets[index]!
          const topY = Math.round(
            upperBaseY + (lowerBaseY - upperBaseY) * index /
              biasPath.components.length,
          )
          const bottomY = Math.round(
            upperBaseY + (lowerBaseY - upperBaseY) * (index + 1) /
              biasPath.components.length,
          )
          result.set(component.refdes, placement(
            component,
            { x: xBias, y: Math.round((topY + bottomY) / 2) },
            verticalRotation(connection, topNet),
          ))
        })
        result.set(driverSupplyFeed.component.refdes, placement(
          driverSupplyFeed.component,
          { x: xTrim, y: 336 },
          verticalRotation(driverSupplyFeed, upperRail),
        ))
        trimPath.components.forEach((component, index) => {
          const connection = twoTerminalConnection(component, topology)!
          const topNet = trimPath.nets[index]!
          const topY = Math.round(
            driverBaseY + (bottomRailY - driverBaseY) * index /
              trimPath.components.length,
          )
          const bottomY = Math.round(
            driverBaseY + (bottomRailY - driverBaseY) * (index + 1) /
              trimPath.components.length,
          )
          result.set(component.refdes, placement(
            component,
            { x: xTrim, y: Math.round((topY + bottomY) / 2) },
            verticalRotation(connection, topNet),
          ))
        })
        result.set(emitterFeed.component.refdes, placement(
          emitterFeed.component,
          { x: xDriver + 28, y: 788 },
          verticalRotation(emitterFeed, driverEmitter),
        ))
        result.set(input.source.component.refdes, placement(
          input.source.component,
          { x: xInput, y: driverBaseY + 32 },
          verticalRotation(input.source, input.inputNet),
        ))
        input.path.components.forEach((component, index) => {
          const connection = twoTerminalConnection(component, topology)!
          const leftNet = input.path.nets[index]!
          result.set(component.refdes, placement(
            component,
            {
              x: xInputPath + index * 96,
              y: driverBaseY,
            },
            horizontalRotation(connection, leftNet),
          ))
        })
        result.set(load.component.refdes, placement(
          load.component,
          { x: xLoad, y: outputY + 64 },
          verticalRotation(load, outputNet),
        ))
        railSources.forEach((source, index) => {
          const upperRailSource = source.rail === upperRail
          result.set(source.component.refdes, source.connection
            ? placement(
                source.component,
                { x: xInput - index * 96, y: outputY + (upperRailSource ? -64 : 64) },
                verticalRotation(
                  source.connection,
                  upperRailSource ? source.rail : groundNet,
                ),
              )
            : placement(
                source.component,
                { x: 700, y: upperRailSource ? topRailY - 40 : bottomRailY + 40 },
                upperRailSource ? 0 : 180,
              ))
        })
        return result
      }
    }
  }
  return undefined
}

function complementaryFollowerPlacements(
  components: ReadonlyArray<AgentElectricalComponent>,
  topology: LayoutTopology,
  groundNet: string,
): ReadonlyMap<string, ComponentPlacement> | undefined {
  const npns = components.filter((component) => component.type === "npn-transistor")
  const pnps = components.filter((component) => component.type === "pnp-transistor")
  const candidates = npns.flatMap((npn) =>
    pnps.flatMap((pnp) =>
      emitterOutputOptions(npn, components, topology, groundNet).flatMap((upperOutput) =>
        emitterOutputOptions(pnp, components, topology, groundNet).flatMap((lowerOutput) => {
          if (upperOutput.net !== lowerOutput.net) return []
          const load = groundedShunt(
            components,
            topology,
            upperOutput.net,
            groundNet,
          )
          if (!load) return []
          const upperRail = terminalNet(topology, npn.refdes, "collector")
          const lowerRail = terminalNet(topology, pnp.refdes, "collector")
          if (!upperRail || !lowerRail || upperRail === lowerRail) return []
          const upperDriver = darlingtonDriver(npn, components, topology)
          const lowerDriver = darlingtonDriver(pnp, components, topology)
          const upperBase = terminalNet(
            topology,
            (upperDriver ?? npn).refdes,
            "base",
          )
          const lowerBase = terminalNet(
            topology,
            (lowerDriver ?? pnp).refdes,
            "base",
          )
          if (!upperBase || !lowerBase || upperBase === lowerBase) return []
          const excluded = new Set([
            npn.refdes,
            pnp.refdes,
            load.component.refdes,
            ...(upperDriver ? [upperDriver.refdes] : []),
            ...(lowerDriver ? [lowerDriver.refdes] : []),
            ...(upperOutput.ballast ? [upperOutput.ballast.component.refdes] : []),
            ...(lowerOutput.ballast ? [lowerOutput.ballast.component.refdes] : []),
          ])
          const path = findNetPath(
            components,
            topology,
            upperBase,
            lowerBase,
            new Set([groundNet, upperRail, lowerRail, upperOutput.net]),
            excluded,
          )
          if (!path || path.components.length === 0) return []
          return [{
            npn,
            pnp,
            upperOutput,
            lowerOutput,
            outputNet: upperOutput.net,
            load,
            upperRail,
            lowerRail,
            upperDriver,
            lowerDriver,
            upperBase,
            lowerBase,
            path,
          }]
        }),
      ),
    ),
  ).sort((a, b) =>
    Number(Boolean(b.upperDriver)) + Number(Boolean(b.lowerDriver)) -
      Number(Boolean(a.upperDriver)) - Number(Boolean(a.lowerDriver)) ||
    a.outputNet.localeCompare(b.outputNet) ||
    compareComponents(a.npn, b.npn) || compareComponents(a.pnp, b.pnp),
  )
  const stage = candidates[0]
  if (!stage) return undefined

  const upperFeed = connectionBetween(
    components,
    topology,
    stage.upperRail,
    stage.upperBase,
    new Set(["resistor"]),
  )
  const lowerFeed = connectionBetween(
    components,
    topology,
    stage.lowerBase,
    stage.lowerRail,
    new Set(["resistor"]),
  )
  if (!upperFeed || !lowerFeed) return undefined

  const railSources = components
    .filter((component) =>
      component.type === "dc-power-rail" ||
      component.type === "dc-voltage-source" ||
      component.type === "sine-voltage-source" ||
      component.type === "pulse-voltage-source" ||
      component.type === "dc-current-source",
    )
    .flatMap((component): RailSource[] => {
      if (component.type === "dc-power-rail") {
        const rail = terminalNet(topology, component.refdes, "rail")
        return rail === stage.upperRail || rail === stage.lowerRail
          ? [{ component, rail, connection: undefined }]
          : []
      }
      const connection = twoTerminalConnection(component, topology)
      if (!connection) return []
      const rail = connection.first.net === groundNet
        ? connection.second.net
        : connection.second.net === groundNet
          ? connection.first.net
          : undefined
      if (rail === stage.upperRail || rail === stage.lowerRail) {
        return [{ component, rail, connection }]
      }
      return []
    })
  const pathNets = new Set(stage.path.nets)
  const signalSources = components
    .filter((component) =>
      component.type === "dc-voltage-source" ||
      component.type === "sine-voltage-source" ||
      component.type === "pulse-voltage-source" ||
      component.type === "dc-current-source",
    )
    .flatMap((component) => {
      const connection = twoTerminalConnection(component, topology)
      if (!connection || railSources.some((source) =>
        source.component.refdes === component.refdes,
      )) return []
      const other = connection.first.net === groundNet
        ? connection.second.net
        : connection.second.net === groundNet
          ? connection.first.net
          : undefined
      return other && pathNets.has(other) ? [{ connection, signalNet: other }] : []
    })

  const placedRefdes = new Set([
    stage.npn.refdes,
    stage.pnp.refdes,
    stage.load.component.refdes,
    upperFeed.component.refdes,
    lowerFeed.component.refdes,
    ...stage.path.components.map(({ refdes }) => refdes),
    ...railSources.map(({ component }) => component.refdes),
    ...signalSources.map(({ connection }) => connection.component.refdes),
    ...(stage.upperDriver ? [stage.upperDriver.refdes] : []),
    ...(stage.lowerDriver ? [stage.lowerDriver.refdes] : []),
    ...(stage.upperOutput.ballast
      ? [stage.upperOutput.ballast.component.refdes]
      : []),
    ...(stage.lowerOutput.ballast
      ? [stage.lowerOutput.ballast.component.refdes]
      : []),
  ])
  if (components.some((component) => !placedRefdes.has(component.refdes))) {
    return undefined
  }

  const xSource = 160
  const xSignalSource = 280
  const xBias = 440
  const xDriver = 640
  const xFinal = 744
  const xLoad = 984
  const topRailY = 120
  const upperBaseY = 300
  const baseSpan = Math.max(320, stage.path.components.length * 112)
  const lowerBaseY = upperBaseY + baseSpan
  const bottomRailY = lowerBaseY + 180
  const upperFinalY = upperBaseY + (stage.upperDriver ? 32 : 0)
  const lowerFinalY = lowerBaseY - (stage.lowerDriver ? 32 : 0)
  const upperEmitterY = upperFinalY + 32
  const lowerEmitterY = lowerFinalY - 32
  const outputY = Math.round((upperEmitterY + lowerEmitterY) / 2)
  const netY = new Map(stage.path.nets.map((net, index) => [
    net,
    Math.round(upperBaseY + baseSpan * index / stage.path.components.length),
  ]))
  const result = new Map<string, ComponentPlacement>()
  result.set(stage.npn.refdes, placement(stage.npn, { x: xFinal, y: upperFinalY }))
  result.set(stage.pnp.refdes, placement(stage.pnp, { x: xFinal, y: lowerFinalY }))
  if (stage.upperDriver) {
    result.set(
      stage.upperDriver.refdes,
      placement(stage.upperDriver, { x: xDriver, y: upperBaseY }),
    )
  }
  if (stage.lowerDriver) {
    result.set(
      stage.lowerDriver.refdes,
      placement(stage.lowerDriver, { x: xDriver, y: lowerBaseY }),
    )
  }
  result.set(upperFeed.component.refdes, placement(
    upperFeed.component,
    { x: xBias, y: Math.round((topRailY + upperBaseY) / 2) },
    verticalRotation(upperFeed, stage.upperRail),
  ))
  result.set(lowerFeed.component.refdes, placement(
    lowerFeed.component,
    { x: xBias, y: Math.round((lowerBaseY + bottomRailY) / 2) },
    verticalRotation(lowerFeed, stage.lowerBase),
  ))
  stage.path.components.forEach((component, index) => {
    const connection = twoTerminalConnection(component, topology)!
    const topNet = stage.path.nets[index]!
    const topY = netY.get(topNet)!
    const bottomY = netY.get(stage.path.nets[index + 1]!)!
    result.set(component.refdes, placement(
      component,
      { x: xBias, y: Math.round((topY + bottomY) / 2) },
      verticalRotation(connection, topNet),
    ))
  })
  result.set(stage.load.component.refdes, placement(
    stage.load.component,
    { x: xLoad, y: outputY + 40 },
    verticalRotation(stage.load, stage.outputNet),
  ))

  if (stage.upperOutput.ballast) {
    const ballast = stage.upperOutput.ballast
    const emitterNet = terminalNet(topology, stage.npn.refdes, "emitter")!
    result.set(ballast.component.refdes, placement(
      ballast.component,
      { x: xFinal + 32, y: Math.round((upperEmitterY + outputY) / 2) },
      verticalRotation(ballast, emitterNet),
    ))
  }
  if (stage.lowerOutput.ballast) {
    const ballast = stage.lowerOutput.ballast
    result.set(ballast.component.refdes, placement(
      ballast.component,
      { x: xFinal + 32, y: Math.round((lowerEmitterY + outputY) / 2) },
      verticalRotation(ballast, stage.outputNet),
    ))
  }

  railSources
    .sort((a, b) => compareComponents(a.component, b.component))
    .forEach((source) => {
      const upper = source.rail === stage.upperRail
      if (source.connection) {
        result.set(source.component.refdes, placement(
          source.component,
          { x: xSource, y: outputY + (upper ? -40 : 40) },
          verticalRotation(source.connection, upper ? source.rail : groundNet),
        ))
        return
      }
      result.set(source.component.refdes, placement(
        source.component,
        {
          x: xDriver + 32,
          y: upper ? topRailY - 40 : bottomRailY + 40,
        },
        upper ? 0 : 180,
      ))
    })
  signalSources
    .sort((a, b) => compareComponents(a.connection.component, b.connection.component))
    .forEach(({ connection, signalNet }, index) => {
      result.set(connection.component.refdes, placement(
        connection.component,
        { x: xSignalSource - index * 96, y: netY.get(signalNet)! + 40 },
        verticalRotation(connection, signalNet),
      ))
    })
  return result
}

function singleRailNpnFollowerPlacements(
  components: ReadonlyArray<AgentElectricalComponent>,
  topology: LayoutTopology,
  groundNet: string,
): ReadonlyMap<string, ComponentPlacement> | undefined {
  const supplySources = components
    .filter((component) =>
      component.type === "dc-voltage-source" ||
      component.type === "dc-power-rail",
    )
    .flatMap((component): SupplySource[] => {
      if (component.type === "dc-power-rail") {
        const supplyNet = terminalNet(topology, component.refdes, "rail")
        return supplyNet ? [{ component, supplyNet, connection: undefined }] : []
      }
      const connection = twoTerminalConnection(component, topology)
      if (!connection) return []
      const supplyNet = connection.first.net === groundNet
        ? connection.second.net
        : connection.second.net === groundNet
          ? connection.first.net
          : undefined
      return supplyNet ? [{ component, connection, supplyNet }] : []
    })
    .filter(({ supplyNet }) => components.some((component) =>
      component.type === "npn-transistor" &&
      terminalNet(topology, component.refdes, "collector") === supplyNet,
    ))
    .sort((a, b) => compareComponents(a.component, b.component))
  for (const supply of supplySources) {
    const finals = components
      .filter((component) =>
        component.type === "npn-transistor" &&
        terminalNet(topology, component.refdes, "collector") === supply.supplyNet,
      )
      .flatMap((transistor) => {
        const outputNet = terminalNet(topology, transistor.refdes, "emitter")
        if (!outputNet) return []
        const load = groundedShunt(components, topology, outputNet, groundNet)
        return load ? [{ transistor, outputNet, load }] : []
      })
      .sort((a, b) => compareComponents(a.transistor, b.transistor))
    const final = finals[0]
    if (!final) continue
    const driver = darlingtonDriver(final.transistor, components, topology)
    const inputTransistor = driver ?? final.transistor
    const baseNet = terminalNet(topology, inputTransistor.refdes, "base")
    if (!baseNet) continue
    const supplyFeed = connectionBetween(
      components,
      topology,
      supply.supplyNet,
      baseNet,
      SHUNT_TYPES,
    )
    const groundShunt = groundedShunt(components, topology, baseNet, groundNet)

    const excluded = new Set([
      supply.component.refdes,
      final.transistor.refdes,
      final.load.component.refdes,
      ...(driver ? [driver.refdes] : []),
      ...(supplyFeed ? [supplyFeed.component.refdes] : []),
      ...(groundShunt ? [groundShunt.component.refdes] : []),
    ])
    const driveCandidates = components
      .filter((component) =>
        (component.type === "dc-voltage-source" ||
          component.type === "sine-voltage-source" ||
          component.type === "pulse-voltage-source") &&
        component.refdes !== supply.component.refdes,
      )
      .flatMap((component) => {
        const connection = twoTerminalConnection(component, topology)
        if (!connection) return []
        const driveNet = connection.first.net === groundNet
          ? connection.second.net
          : connection.second.net === groundNet
            ? connection.first.net
            : undefined
        if (!driveNet) return []
        const path = findNetPath(
          components,
          topology,
          driveNet,
          baseNet,
          new Set([groundNet, supply.supplyNet, final.outputNet]),
          new Set([...excluded, component.refdes]),
          new Set(["resistor", "capacitor", "inductor"]),
        )
        return path ? [{ connection, driveNet, path }] : []
      })
      .sort((a, b) =>
        a.path.components.length - b.path.components.length ||
        compareComponents(a.connection.component, b.connection.component),
      )
    const drive = driveCandidates[0]
    const placedRefdes = new Set([
      supply.component.refdes,
      final.transistor.refdes,
      final.load.component.refdes,
      ...(driver ? [driver.refdes] : []),
      ...(supplyFeed ? [supplyFeed.component.refdes] : []),
      ...(groundShunt ? [groundShunt.component.refdes] : []),
      ...(drive
        ? [
            drive.connection.component.refdes,
            ...drive.path.components.map(({ refdes }) => refdes),
          ]
        : []),
    ])
    if (components.some((component) => !placedRefdes.has(component.refdes))) continue

    const topRailY = 120
    const baseY = 320
    const finalY = baseY + (driver ? 32 : 0)
    const outputY = finalY + 32
    const xSource = 160
    const xBias = 420
    const xDriver = 616
    const xFinal = 720
    const xLoad = 960
    const result = new Map<string, ComponentPlacement>()
    result.set(supply.component.refdes, supply.connection
      ? placement(
          supply.component,
          { x: xSource, y: topRailY + 40 },
          verticalRotation(supply.connection, supply.supplyNet),
        )
      : placement(
          supply.component,
          { x: xBias, y: topRailY - 40 },
          0,
        ))
    result.set(final.transistor.refdes, placement(
      final.transistor,
      { x: xFinal, y: finalY },
    ))
    if (driver) {
      result.set(driver.refdes, placement(driver, { x: xDriver, y: baseY }))
    }
    result.set(final.load.component.refdes, placement(
      final.load.component,
      { x: xLoad, y: outputY + 40 },
      verticalRotation(final.load, final.outputNet),
    ))
    if (supplyFeed) {
      result.set(supplyFeed.component.refdes, placement(
        supplyFeed.component,
        { x: xBias, y: Math.round((topRailY + baseY) / 2) },
        verticalRotation(supplyFeed, supply.supplyNet),
      ))
    }
    if (groundShunt) {
      result.set(groundShunt.component.refdes, placement(
        groundShunt.component,
        { x: xBias, y: baseY + 160 },
        verticalRotation(groundShunt, baseNet),
      ))
    }
    if (drive) {
      result.set(drive.connection.component.refdes, placement(
        drive.connection.component,
        { x: xSource, y: baseY + 40 },
        verticalRotation(drive.connection, drive.driveNet),
      ))
      drive.path.components.forEach((component, index) => {
        const connection = twoTerminalConnection(component, topology)!
        const leftNet = drive.path.nets[index]!
        result.set(component.refdes, placement(
          component,
          {
            x: Math.round(xSource + 120 +
              (xBias - xSource - 120) * (index + 0.5) / drive.path.components.length),
            y: baseY,
          },
          horizontalRotation(connection, leftNet),
        ))
      })
    }
    return result
  }
  return undefined
}

function componentRotation(
  component: AgentElectricalComponent,
  nets: ReadonlyArray<AgentElectricalNet>,
  groundNet: string,
): 0 | 90 | 180 | 270 {
  if (component.type === "dc-power-rail") {
    return component.props.voltageVolts < 0 ? 180 : 0
  }
  if (
    component.type !== "dc-voltage-source" &&
    component.type !== "sine-voltage-source" &&
    component.type !== "pulse-voltage-source" &&
    component.type !== "dc-current-source"
  ) {
    return 0
  }
  const groundTerminals = nets.find((net) => net.name === groundNet)?.terminals ?? []
  const groundedPin = groundTerminals.find(
    (terminal) => terminal.refdes === component.refdes,
  )?.pin
  if (groundedPin === "negative") return 90
  if (groundedPin === "positive") return 270

  // Ungrounded sources remain horizontal. Voltage sources present their
  // positive terminal toward downstream ranks; current sources present the
  // negative terminal used by the documented positive-load convention.
  return component.type === "dc-current-source" ? 0 : 180
}

function routeNets(
  nets: ReadonlyArray<AgentElectricalNet>,
  componentByRefdes: ReadonlyMap<string, Component>,
  groundNet: string,
  compactRouting = false,
): SchematicObject[] {
  if (compactRouting) {
    return routeCompactNets(nets, componentByRefdes, groundNet)
  }
  const objects: SchematicObject[] = []

  const components = [...componentByRefdes.values()]
  const componentObstacles = components.map(componentObstacle)
  const annotationObstacles: ComponentObstacle[] = []
  const groupByRefdes = connectedComponentGroups(
    componentAdjacency(components, nets, groundNet),
  )
  const occupiedPoints = new Set<string>()
  let routeSerial = 0
  for (const net of [...nets].sort(compareNets)) {
    const terminalPosts = [...net.terminals]
      .sort(compareTerminalRefs)
      .map((terminal) => {
        const component = componentByRefdes.get(terminal.refdes)!
        const pin = getPinPosts(component).find(
          (candidate) => candidate.pin === terminal.pin,
        )!
        return { terminal, component, pin: pin.position }
      })

    if (net.name === groundNet) {
      // Repeated named ground symbols are one electrical net in extraction.
      // Cluster them near their terminals instead of drawing a canvas-wide bus.
      for (const [clusterIndex, cluster] of groundTerminalClusters(
        terminalPosts,
        groupByRefdes,
      ).entries()) {
        const obstacles = [...componentObstacles, ...annotationObstacles]
        const hub = groundHub(cluster, obstacles, occupiedPoints)
        const annotationObstacle = groundAnnotationObstacle(hub, clusterIndex)
        occupiedPoints.add(pointKey(hub))
        objects.push({ kind: "ground", id: newId(), position: hub, netName: "GND" })
        for (const { component, pin } of cluster) {
          const points = routePinToPoint(
            pin,
            component,
            hub,
            [...obstacles, annotationObstacle],
            routeSerial,
            occupiedPoints,
          )
          routeSerial += 1
          for (const point of points) occupiedPoints.add(pointKey(point))
          objects.push({ kind: "wire", id: newId(), points })
        }
        annotationObstacles.push(annotationObstacle)
      }
      continue
    }

    const obstacles = [...componentObstacles, ...annotationObstacles]
    // Keep the electrical junction compact. The readable net label gets its
    // own attachment point so long text cannot drag every terminal route away.
    const hub = wireHub(
      terminalPosts.map(({ pin }) => pin),
      obstacles,
      occupiedPoints,
    )
    occupiedPoints.add(pointKey(hub))
    const labelHub = netLabelHub(
      net.name,
      [hub, ...terminalPosts.map(({ pin }) => pin)],
      obstacles,
      occupiedPoints,
    )
    const annotationObstacle = netLabelObstacle(net.name, labelHub)
    occupiedPoints.add(pointKey(labelHub))
    objects.push({ kind: "net-label", id: newId(), text: net.name, position: labelHub })

    for (const { component, pin } of terminalPosts) {
      const points = routePinToPoint(
        pin,
        component,
        hub,
        [...obstacles, annotationObstacle],
        routeSerial,
        occupiedPoints,
      )
      routeSerial += 1
      for (const point of points) occupiedPoints.add(pointKey(point))
      objects.push({
        kind: "wire",
        id: newId(),
        points,
      })
    }
    if (hub.x !== labelHub.x || hub.y !== labelHub.y) {
      const points = routePointToPoint(
        hub,
        labelHub,
        [...obstacles, annotationObstacle],
        routeSerial,
        occupiedPoints,
      )
      routeSerial += 1
      for (const point of points) occupiedPoints.add(pointKey(point))
      objects.push({ kind: "wire", id: newId(), points })
    }
    annotationObstacles.push(annotationObstacle)
  }

  return objects
}

type RoutedTerminal = {
  readonly terminal: AgentTerminalRef
  readonly component: Component
  readonly pin: Point
}

type ComponentObstacle = {
  readonly refdes: string
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

const COMPONENT_SPACING_X = 220
const COMPONENT_SPACING_Y = 208
const PAGE_GUTTER_X = 160
const COMPONENT_BODY_CLEARANCE = 64
const COMPONENT_ROUTE_CLEARANCE = 84
const ROUTE_CLEARANCE = 24
const LAYOUT_TARGET_ASPECT_RATIO = 1.6

function routeCompactNets(
  nets: ReadonlyArray<AgentElectricalNet>,
  componentByRefdes: ReadonlyMap<string, Component>,
  groundNet: string,
): SchematicObject[] {
  const objects: SchematicObject[] = []
  const components = [...componentByRefdes.values()]
  const bodyObstacles = components.map(compactComponentObstacle)
  const groundObstacles = components.map(componentObstacle)
  const annotationObstacles: ComponentObstacle[] = []
  const groupByRefdes = connectedComponentGroups(
    componentAdjacency(components, nets, groundNet),
  )
  const occupiedGroundPoints = new Set<string>()
  let groundRouteSerial = 0

  for (const net of [...nets].sort(compareNets)) {
    const terminalPosts = [...net.terminals]
      .sort(compareTerminalRefs)
      .map((terminal) => {
        const component = componentByRefdes.get(terminal.refdes)!
        const pin = getPinPosts(component).find(
          (candidate) => candidate.pin === terminal.pin,
        )!
        return { terminal, component, pin: pin.position }
      })

    if (net.name === groundNet) {
      const routedGround = routeCompactGround(
        terminalPosts,
        components,
        groupByRefdes,
        groundObstacles,
        annotationObstacles,
        occupiedGroundPoints,
        groundRouteSerial,
      )
      objects.push(...routedGround.objects)
      groundRouteSerial = routedGround.nextRouteSerial
      continue
    }

    const hub = compactWireHub(terminalPosts)
    for (const terminal of terminalPosts) {
      const points = compactTerminalPath(
        terminal.pin,
        terminal.component,
        hub,
        bodyObstacles,
      )
      if (points.length >= 2) {
        objects.push({ kind: "wire", id: newId(), points })
      }
    }

    const labelHub = compactNetLabelHub(
      net.name,
      hub,
      terminalPosts,
      [...bodyObstacles, ...annotationObstacles],
    )
    objects.push({
      kind: "net-label",
      id: newId(),
      text: net.name,
      position: labelHub,
    })
    if (labelHub.x !== hub.x || labelHub.y !== hub.y) {
      const points = compactPointPath(hub, labelHub, bodyObstacles)
      if (points.length >= 2) {
        objects.push({ kind: "wire", id: newId(), points })
      }
    }
    annotationObstacles.push(netLabelObstacle(net.name, labelHub))
  }
  return objects
}

function routeCompactGround(
  terminals: ReadonlyArray<RoutedTerminal>,
  components: ReadonlyArray<Component>,
  groupByRefdes: ReadonlyMap<string, string>,
  componentObstacles: ReadonlyArray<ComponentObstacle>,
  annotationObstacles: ComponentObstacle[],
  occupiedPoints: Set<string>,
  initialRouteSerial: number,
): { readonly objects: SchematicObject[]; readonly nextRouteSerial: number } {
  const objects: SchematicObject[] = []
  let routeSerial = initialRouteSerial
  const hasNpn = components.some(({ type }) => type === "npn-transistor")
  const hasPnp = components.some(({ type }) => type === "pnp-transistor")
  const supplyCount = components.filter(
    ({ type }) => type === "dc-voltage-source" || type === "dc-power-rail",
  ).length
  const explicitRailCount = components.filter(
    ({ type }) => type === "dc-power-rail",
  ).length
  if (
    hasNpn && !hasPnp && terminals.length >= 2 &&
    (supplyCount === 1 || explicitRailCount === 1)
  ) {
    const groundY = Math.max(
      ...terminals.map(({ pin }) => pin.y),
      ...components.map(({ position }) => position.y + 52),
    ) + 64
    const xs = [...new Set(terminals.map(({ pin }) => pin.x))].sort((a, b) => a - b)
    const busPoints = xs.map((x) => ({ x, y: groundY }))
    if (busPoints.length >= 2) {
      objects.push({ kind: "wire", id: newId(), points: busPoints })
    }
    for (const terminal of terminals) {
      const target = { x: terminal.pin.x, y: groundY }
      if (terminal.pin.y !== groundY) {
        objects.push({
          kind: "wire",
          id: newId(),
          points: [terminal.pin, target],
        })
      }
    }
    const hub = busPoints[Math.floor(busPoints.length / 2)]!
    objects.push({ kind: "ground", id: newId(), position: hub, netName: "GND" })
    return { objects, nextRouteSerial: routeSerial }
  }

  const remaining = [...terminals]
  const coincidentSupplyGroups = new Map<string, RoutedTerminal[]>()
  for (const terminal of terminals) {
    if (
      terminal.component.type !== "dc-voltage-source" &&
      terminal.component.type !== "sine-voltage-source" &&
      terminal.component.type !== "pulse-voltage-source"
    ) continue
    const key = pointKey(terminal.pin)
    coincidentSupplyGroups.set(key, [
      ...(coincidentSupplyGroups.get(key) ?? []),
      terminal,
    ])
  }
  const sharedSupply = [...coincidentSupplyGroups.values()]
    .filter((group) => group.length >= 2)
    .sort((a, b) => compareRoutedTerminals(a[0]!, b[0]!))[0]
  if (sharedSupply) {
    const junction = sharedSupply[0]!.pin
    const hub = { x: junction.x - 128, y: junction.y }
    objects.push({ kind: "ground", id: newId(), position: hub, netName: "GND" })
    for (const terminal of sharedSupply) {
      objects.push({ kind: "wire", id: newId(), points: [terminal.pin, hub] })
      const index = remaining.indexOf(terminal)
      if (index >= 0) remaining.splice(index, 1)
    }
  }

  for (const [clusterIndex, cluster] of groundTerminalClusters(
    remaining,
    groupByRefdes,
  ).entries()) {
    const obstacles = [...componentObstacles, ...annotationObstacles]
    const hub = groundHub(cluster, obstacles, occupiedPoints)
    const annotationObstacle = groundAnnotationObstacle(hub, clusterIndex)
    occupiedPoints.add(pointKey(hub))
    objects.push({ kind: "ground", id: newId(), position: hub, netName: "GND" })
    for (const { component, pin } of cluster) {
      const points = routePinToPoint(
        pin,
        component,
        hub,
        [...obstacles, annotationObstacle],
        routeSerial,
        occupiedPoints,
      )
      routeSerial += 1
      for (const point of points) occupiedPoints.add(pointKey(point))
      objects.push({ kind: "wire", id: newId(), points })
    }
    annotationObstacles.push(annotationObstacle)
  }
  return { objects, nextRouteSerial: routeSerial }
}

function compactComponentObstacle(component: Component): ComponentObstacle {
  return {
    refdes: component.refdes,
    left: component.position.x - 36,
    right: component.position.x + 36,
    top: component.position.y - 36,
    bottom: component.position.y + 36,
  }
}

function compactWireHub(terminals: ReadonlyArray<RoutedTerminal>): Point {
  const powerRails = terminals.filter(
    ({ component, terminal }) =>
      component.type === "dc-power-rail" && terminal.pin === "rail",
  )
  if (powerRails.length === 1) return powerRails[0]!.pin
  const collectors = terminals.filter(({ terminal }) => terminal.pin === "collector")
  if (collectors.length >= 2) {
    const allNpn = collectors.every(({ component }) => component.type === "npn-transistor")
    const allPnp = collectors.every(({ component }) => component.type === "pnp-transistor")
    if (allNpn || allPnp) {
      const ys = terminals.map(({ pin }) => pin.y)
      return {
        x: medianCoordinate(terminals.map(({ pin }) => pin.x)),
        y: allNpn ? Math.min(...ys) : Math.max(...ys),
      }
    }
  }
  return {
    x: compactCenter(terminals.map(({ pin }) => pin.x)),
    y: compactCenter(terminals.map(({ pin }) => pin.y)),
  }
}

function compactCenter(values: ReadonlyArray<number>): number {
  if (values.length === 2) return Math.round((values[0]! + values[1]!) / 2)
  return medianCoordinate(values)
}

function medianCoordinate(values: ReadonlyArray<number>): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

function compactTerminalPath(
  pin: Point,
  component: Component,
  hub: Point,
  obstacles: ReadonlyArray<ComponentObstacle>,
): Point[] {
  if (pin.x === hub.x && pin.y === hub.y) return []
  const ignored = new Set([component.refdes])
  const candidates = compactPathCandidates(pin, hub, obstacles)
    .filter((path) => compactPathLeavesComponentOutward(path, pin, component))
    .filter((path) => compactPathClear(path, obstacles, ignored))
    .sort((a, b) =>
      compactPathScore(a) - compactPathScore(b) ||
      stablePathKey(a).localeCompare(stablePathKey(b)),
    )
  return candidates[0] ?? simplifyPoints([pin, { x: pin.x, y: hub.y }, hub])
}

function compactPathLeavesComponentOutward(
  path: ReadonlyArray<Point>,
  pin: Point,
  component: Component,
): boolean {
  const next = path.find(
    (point, index) => index > 0 && (point.x !== pin.x || point.y !== pin.y),
  )
  if (!next) return true
  const pinX = pin.x - component.position.x
  const pinY = pin.y - component.position.y
  const routeX = next.x - pin.x
  const routeY = next.y - pin.y

  // A negative dot product means the first wire segment points back through
  // the component body. Perpendicular departures are safe because canonical
  // terminal posts already sit outside the rendered symbol body.
  return pinX * routeX + pinY * routeY >= 0
}

function compactPointPath(
  start: Point,
  end: Point,
  obstacles: ReadonlyArray<ComponentObstacle>,
): Point[] {
  if (start.x === end.x && start.y === end.y) return []
  const candidates = compactPathCandidates(start, end, obstacles)
    .filter((path) => compactPathClear(path, obstacles, new Set()))
    .sort((a, b) =>
      compactPathScore(a) - compactPathScore(b) ||
      stablePathKey(a).localeCompare(stablePathKey(b)),
    )
  return candidates[0] ?? simplifyPoints([start, { x: start.x, y: end.y }, end])
}

function compactPathCandidates(
  start: Point,
  end: Point,
  obstacles: ReadonlyArray<ComponentObstacle>,
): Point[][] {
  const left = Math.min(...obstacles.map((obstacle) => obstacle.left)) - 56
  const right = Math.max(...obstacles.map((obstacle) => obstacle.right)) + 56
  const top = Math.min(...obstacles.map((obstacle) => obstacle.top)) - 56
  const bottom = Math.max(...obstacles.map((obstacle) => obstacle.bottom)) + 56
  return [
    [start, { x: end.x, y: start.y }, end],
    [start, { x: start.x, y: end.y }, end],
    [start, { x: left, y: start.y }, { x: left, y: end.y }, end],
    [start, { x: right, y: start.y }, { x: right, y: end.y }, end],
    [start, { x: start.x, y: top }, { x: end.x, y: top }, end],
    [start, { x: start.x, y: bottom }, { x: end.x, y: bottom }, end],
  ].map(simplifyPoints)
}

function compactPathScore(path: ReadonlyArray<Point>): number {
  return pathLength(path) + Math.max(0, path.length - 2) * 12
}

function compactPathClear(
  path: ReadonlyArray<Point>,
  obstacles: ReadonlyArray<ComponentObstacle>,
  ignored: ReadonlySet<string>,
): boolean {
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]!
    const to = path[index]!
    if (from.x !== to.x && from.y !== to.y) return false
    if (obstacles.some((obstacle) => {
      if (ignored.has(obstacle.refdes)) return false
      if (from.x === to.x) {
        return from.x > obstacle.left && from.x < obstacle.right &&
          Math.max(from.y, to.y) > obstacle.top &&
          Math.min(from.y, to.y) < obstacle.bottom
      }
      return from.y > obstacle.top && from.y < obstacle.bottom &&
        Math.max(from.x, to.x) > obstacle.left &&
        Math.min(from.x, to.x) < obstacle.right
    })) return false
  }
  return true
}

function compactNetLabelHub(
  name: string,
  hub: Point,
  terminals: ReadonlyArray<RoutedTerminal>,
  obstacles: ReadonlyArray<ComponentObstacle>,
): Point {
  const pins = terminals.map(({ pin }) => pin)
  const minimumX = Math.min(...pins.map(({ x }) => x), hub.x)
  const maximumX = Math.max(...pins.map(({ x }) => x), hub.x)
  const minimumY = Math.min(...pins.map(({ y }) => y), hub.y)
  const maximumY = Math.max(...pins.map(({ y }) => y), hub.y)
  const width = netLabelTotalWidth(name)
  const transistorInterstage = terminals.length === 2 && terminals.every(
    ({ component, terminal }) =>
      (component.type === "npn-transistor" || component.type === "pnp-transistor") &&
      (terminal.pin === "base" || terminal.pin === "emitter"),
  )
  const interstageCandidate = transistorInterstage
    ? [{
        x: minimumX - width - 40,
        // Keep Darlington interstage names on a short side branch between the
        // device pair and the bias string. A 56 px offset clears both transistor
        // bodies and the adjacent, vertically stacked bias-net label.
        y: hub.y + (terminals[0]!.component.type === "npn-transistor" ? 56 : -56),
      }]
    : []
  const hubTerminalComponents = new Set(
    terminals
      .filter(({ pin }) => pin.x === hub.x && pin.y === hub.y)
      .map(({ component }) => component.refdes),
  )
  const candidates = [
    ...interstageCandidate,
    hub,
    { x: maximumX + 40, y: hub.y },
    { x: minimumX - width - 40, y: hub.y },
    { x: hub.x, y: minimumY - 56 },
    { x: hub.x, y: maximumY + 56 },
    { x: maximumX + 40, y: minimumY - 56 },
    { x: minimumX - width - 40, y: maximumY + 56 },
    { x: hub.x + 40, y: maximumY + 72 },
    { x: hub.x + 40, y: minimumY - 72 },
    { x: hub.x - width - 40, y: maximumY + 72 },
    { x: hub.x - width - 40, y: minimumY - 72 },
  ]
  return candidates.find((candidate) => {
    const label = netLabelObstacle(name, candidate)
    return !obstacles.some((obstacle) => boxesOverlap(label, obstacle)) &&
      compactPathCandidates(hub, candidate, obstacles).some((path) =>
        compactPathClear(path, obstacles, hubTerminalComponents),
      )
  }) ?? candidates.at(-1)!
}

function simplifyPoints(points: ReadonlyArray<Point>): Point[] {
  const deduped = dedupePoints(points)
  return deduped.filter((point, index) => {
    const previous = deduped[index - 1]
    const next = deduped[index + 1]
    if (!previous || !next) return true
    return !(
      (previous.x === point.x && point.x === next.x) ||
      (previous.y === point.y && point.y === next.y)
    )
  })
}

function layoutComponents(
  project: CircuitProject,
  components: ReadonlyArray<AgentElectricalComponent>,
  nets: ReadonlyArray<AgentElectricalNet>,
  groundNet: string,
): ReadonlyMap<string, Point> {
  const adjacency = componentAdjacency(components, nets, groundNet)
  const rankByRefdes = componentRanks(components, adjacency)
  const byRank = new Map<number, AgentElectricalComponent[]>()
  for (const component of components) {
    const rank = rankByRefdes.get(component.refdes) ?? 0
    byRank.set(rank, [...(byRank.get(rank) ?? []), component])
  }
  const orderedByRank = orderRankMembers(byRank, rankByRefdes, adjacency)
  const rankCount = Math.max(0, ...orderedByRank.keys()) + 1
  // Preserve source-to-load ranks while wrapping overloaded ranks into
  // deterministic pages. This keeps matrix-style LLM output bounded.
  const rowsPerPage = chooseRowsPerPage(orderedByRank, rankCount)

  const desired = new Map<string, Point>()
  for (const [rank, members] of [...orderedByRank.entries()].sort(([a], [b]) => a - b)) {
    for (const [index, component] of members.entries()) {
      const page = Math.floor(index / rowsPerPage)
      const row = index % rowsPerPage
      desired.set(component.refdes, {
        x: layoutX(rank, page, rankCount),
        y: 200 + row * COMPONENT_SPACING_Y,
      })
    }
  }

  const previous = new Map(
    project.objects
      .filter((object): object is Component => object.kind === "component")
      .map((component) => [component.refdes, component]),
  )
  const positions = new Map<string, Point>()
  const occupied: Point[] = []
  for (const component of components) {
    const candidate = desired.get(component.refdes)!
    const old = previous.get(component.refdes)
    if (
      old &&
      old.type === component.type &&
      Math.abs(old.position.x - candidate.x) <= COMPONENT_SPACING_X / 2 &&
      !positionOverlaps(old.position, occupied)
    ) {
      positions.set(component.refdes, old.position)
      occupied.push(old.position)
    }
  }

  for (const component of components) {
    if (positions.has(component.refdes)) continue
    const candidate = desired.get(component.refdes)!
    const position = firstFreePosition(candidate, occupied)
    positions.set(component.refdes, position)
    occupied.push(position)
  }
  return positions
}

function componentAdjacency(
  components: ReadonlyArray<{ readonly refdes: string }>,
  nets: ReadonlyArray<AgentElectricalNet>,
  groundNet: string,
): ReadonlyMap<string, ReadonlySet<string>> {
  const adjacency = new Map<string, Set<string>>()
  for (const component of components) adjacency.set(component.refdes, new Set())
  for (const net of nets) {
    if (net.name === groundNet) continue
    const refs = [...new Set(net.terminals.map((terminal) => terminal.refdes))]
    for (const refdes of refs) {
      const neighbors = adjacency.get(refdes)
      if (!neighbors) continue
      for (const neighbor of refs) if (neighbor !== refdes) neighbors.add(neighbor)
    }
  }
  return adjacency
}

function componentRanks(
  components: ReadonlyArray<AgentElectricalComponent>,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): ReadonlyMap<string, number> {
  const sourceRefs = components
    .filter((component) =>
      component.type === "dc-power-rail" ||
      component.type === "dc-voltage-source" ||
      component.type === "sine-voltage-source" ||
      component.type === "pulse-voltage-source" ||
      component.type === "dc-current-source",
    )
    .map((component) => component.refdes)
    .sort()
  const rank = new Map<string, number>()
  const queue = [...sourceRefs]
  for (const refdes of sourceRefs) rank.set(refdes, 0)
  for (const component of components) {
    if (!rank.has(component.refdes)) rank.set(component.refdes, Number.POSITIVE_INFINITY)
  }
  while (queue.length > 0) {
    const refdes = queue.shift()!
    const current = rank.get(refdes) ?? 0
    for (const neighbor of [...(adjacency.get(refdes) ?? [])].sort()) {
      if ((rank.get(neighbor) ?? Number.POSITIVE_INFINITY) <= current + 1) continue
      rank.set(neighbor, current + 1)
      queue.push(neighbor)
    }
  }
  for (const [refdes, value] of rank) if (!Number.isFinite(value)) rank.set(refdes, 0)
  return rank
}

function orderRankMembers(
  byRank: ReadonlyMap<number, ReadonlyArray<AgentElectricalComponent>>,
  rankByRefdes: ReadonlyMap<string, number>,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): ReadonlyMap<number, ReadonlyArray<AgentElectricalComponent>> {
  const ordered = new Map<number, ReadonlyArray<AgentElectricalComponent>>()
  const orderByRefdes = new Map<string, number>()
  for (const [rank, members] of [...byRank.entries()].sort(([a], [b]) => a - b)) {
    const sorted = [...members].sort((a, b) => {
      const aOrder = precedingNeighborOrder(a.refdes, rank, rankByRefdes, adjacency, orderByRefdes)
      const bOrder = precedingNeighborOrder(b.refdes, rank, rankByRefdes, adjacency, orderByRefdes)
      if (aOrder !== bOrder) return aOrder - bOrder
      return compareComponents(a, b)
    })
    sorted.forEach((component, index) => orderByRefdes.set(component.refdes, index))
    ordered.set(rank, sorted)
  }
  return ordered
}

function precedingNeighborOrder(
  refdes: string,
  rank: number,
  rankByRefdes: ReadonlyMap<string, number>,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  orderByRefdes: ReadonlyMap<string, number>,
): number {
  const orders = [...(adjacency.get(refdes) ?? [])].flatMap((neighbor) =>
    (rankByRefdes.get(neighbor) ?? rank) < rank && orderByRefdes.has(neighbor)
      ? [orderByRefdes.get(neighbor)!]
      : [],
  )
  return orders.length === 0
    ? Number.POSITIVE_INFINITY
    : orders.reduce((sum, order) => sum + order, 0) / orders.length
}

function chooseRowsPerPage(
  byRank: ReadonlyMap<number, ReadonlyArray<AgentElectricalComponent>>,
  rankCount: number,
): number {
  const maximumMembers = Math.max(1, ...[...byRank.values()].map((members) => members.length))
  let bestRows = 1
  let bestScore = Number.POSITIVE_INFINITY
  for (let rows = 1; rows <= maximumMembers; rows += 1) {
    let maximumX = 0
    let maximumY = 0
    let pageBreaks = 0
    for (const [rank, members] of byRank) {
      for (const index of members.keys()) {
        const page = Math.floor(index / rows)
        maximumX = Math.max(maximumX, layoutX(rank, page, rankCount) - 200)
        maximumY = Math.max(maximumY, (index % rows) * COMPONENT_SPACING_Y)
      }
      pageBreaks += Math.max(0, Math.ceil(members.length / rows) - 1)
    }
    const width = maximumX + COMPONENT_BODY_CLEARANCE * 2
    const height = maximumY + COMPONENT_BODY_CLEARANCE * 2
    const aspectRatio = width / Math.max(height, 1)
    const score = Math.abs(Math.log(aspectRatio / LAYOUT_TARGET_ASPECT_RATIO)) +
      pageBreaks * 0.03
    if (score < bestScore) {
      bestRows = rows
      bestScore = score
    }
  }
  return bestRows
}

function layoutX(rank: number, page: number, rankCount: number): number {
  return 200 + rank * COMPONENT_SPACING_X +
    page * (rankCount * COMPONENT_SPACING_X + PAGE_GUTTER_X)
}

function positionOverlaps(position: Point, occupied: ReadonlyArray<Point>): boolean {
  return occupied.some(
    (other) => Math.abs(other.x - position.x) < COMPONENT_BODY_CLEARANCE * 2 &&
      Math.abs(other.y - position.y) < COMPONENT_BODY_CLEARANCE * 2,
  )
}

function firstFreePosition(
  preferred: Point,
  occupied: ReadonlyArray<Point>,
): Point {
  if (!positionOverlaps(preferred, occupied)) return preferred
  for (let row = 1; row < MAX_AGENT_COMPONENTS; row += 1) {
    for (const direction of [1, -1]) {
      const candidate = {
        x: preferred.x,
        y: preferred.y + direction * row * COMPONENT_SPACING_Y,
      }
      if (!positionOverlaps(candidate, occupied)) return candidate
    }
  }
  return { x: preferred.x, y: preferred.y + COMPONENT_SPACING_Y }
}

function componentObstacle(component: Component): ComponentObstacle {
  const horizontalClearance = Math.max(
    COMPONENT_BODY_CLEARANCE,
    Math.min(180, component.refdes.length * 4 + 16),
  )
  return {
    refdes: component.refdes,
    left: component.position.x - horizontalClearance,
    right: component.position.x + horizontalClearance,
    top: component.position.y - 84,
    bottom: component.position.y + 84,
  }
}

function wireHub(
  points: ReadonlyArray<Point>,
  obstacles: ReadonlyArray<ComponentObstacle>,
  occupiedPoints: ReadonlySet<string>,
): Point {
  const sortedX = points.map(({ x }) => x).sort((a, b) => a - b)
  const sortedY = points.map(({ y }) => y).sort((a, b) => a - b)
  const minX = sortedX[0]!
  const maxX = sortedX.at(-1)!
  const minY = sortedY[0]!
  const maxY = sortedY.at(-1)!
  const averageX = Math.round(sortedX.reduce((sum, value) => sum + value, 0) / sortedX.length)
  const averageY = Math.round(sortedY.reduce((sum, value) => sum + value, 0) / sortedY.length)
  const medianX = sortedX[Math.floor(sortedX.length / 2)]!
  const medianY = sortedY[Math.floor(sortedY.length / 2)]!
  const xs = [...new Set([
    averageX,
    medianX,
    Math.round((minX + maxX) / 2),
    minX - 96,
    maxX + 96,
  ])]
  const ys = [...new Set([
    averageY,
    medianY,
    Math.round((minY + maxY) / 2),
    minY - 96,
    maxY + 96,
  ])]
  const candidates = xs.flatMap((x) => ys.map((y) => ({ x, y })))
    .filter((candidate) =>
      !pointInsideObstacle(candidate, obstacles) &&
      !occupiedPoints.has(pointKey(candidate)),
    )
    .sort((a, b) =>
      totalManhattanDistance(a, points) - totalManhattanDistance(b, points) ||
      pointKey(a).localeCompare(pointKey(b)),
    )
  return candidates[0] ?? { x: maxX + 96, y: averageY }
}

function totalManhattanDistance(candidate: Point, points: ReadonlyArray<Point>): number {
  return points.reduce(
    (distance, point) => distance +
      Math.abs(candidate.x - point.x) + Math.abs(candidate.y - point.y),
    0,
  )
}

function netLabelHub(
  name: string,
  points: ReadonlyArray<Point>,
  obstacles: ReadonlyArray<ComponentObstacle>,
  occupiedPoints: ReadonlySet<string>,
): Point {
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const averageX = Math.round(points.reduce((sum, point) => sum + point.x, 0) / points.length)
  const averageY = Math.round(points.reduce((sum, point) => sum + point.y, 0) / points.length)
  const labelWidth = netLabelTotalWidth(name)
  const above = { x: averageX, y: minY - 112 }
  const below = { x: averageX, y: maxY + 112 }
  const left = { x: minX - labelWidth - 96, y: averageY }
  const right = { x: maxX + 96, y: averageY }
  const primary = name.length > 12
    ? [right, left, above, below]
    : [{ x: points[0]!.x, y: points[0]!.y }, above, below, right, left]
  const staggered = [48, -48, 96, -96].flatMap((offset) => [
    { x: right.x, y: right.y + offset },
    { x: left.x, y: left.y + offset },
    { x: above.x + offset, y: above.y },
    { x: below.x + offset, y: below.y },
  ])
  const candidates = [
    ...primary,
    ...staggered,
    ...Array.from({ length: MAX_AGENT_NETS }, (_, lane) => ({
      x: right.x + (lane + 1) * 64,
      y: right.y,
    })),
  ]
  return candidates.find((candidate) => hubFitsLabel(name, candidate, obstacles, occupiedPoints)) ?? right
}

function groundHub(
  terminals: ReadonlyArray<RoutedTerminal>,
  obstacles: ReadonlyArray<ComponentObstacle>,
  occupiedPoints: ReadonlySet<string>,
): Point {
  const points = terminals.map(({ pin }) => pin)
  const refdes = new Set(terminals.map(({ component }) => component.refdes))
  const localObstacles = obstacles.filter((obstacle) => refdes.has(obstacle.refdes))
  const bottom = Math.max(
    ...localObstacles.map((obstacle) => obstacle.bottom),
    ...points.map((point) => point.y),
  )
  const averageX = Math.round(points.reduce((sum, point) => sum + point.x, 0) / points.length)
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const candidates = [
    { x: averageX, y: bottom + 64 },
    { x: minX, y: bottom + 64 },
    { x: maxX, y: bottom + 64 },
    { x: averageX - 96, y: bottom + 64 },
    { x: averageX + 96, y: bottom + 64 },
    { x: averageX, y: bottom + 112 },
  ]
  return candidates.find((candidate) =>
    !pointInsideObstacle(candidate, obstacles) &&
    !obstacles.some((obstacle) => boxesOverlap(groundAnnotationObstacle(candidate, -1), obstacle)) &&
    !occupiedPoints.has(pointKey(candidate)),
  ) ?? candidates[0]!
}

function routePointToPoint(
  from: Point,
  to: Point,
  obstacles: ReadonlyArray<ComponentObstacle>,
  routeIndex: number,
  occupiedPoints: ReadonlySet<string>,
): Point[] {
  return dedupePoints([
    from,
    ...routePath(from, to, obstacles, new Set(), routeIndex, occupiedPoints),
  ])
}

function connectedComponentGroups(
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): ReadonlyMap<string, string> {
  const groupByRefdes = new Map<string, string>()
  for (const start of [...adjacency.keys()].sort()) {
    if (groupByRefdes.has(start)) continue
    const members: string[] = []
    const queue = [start]
    const seen = new Set([start])
    while (queue.length > 0) {
      const refdes = queue.shift()!
      members.push(refdes)
      for (const neighbor of [...(adjacency.get(refdes) ?? [])].sort()) {
        if (seen.has(neighbor)) continue
        seen.add(neighbor)
        queue.push(neighbor)
      }
    }
    const group = members.sort()[0]!
    for (const refdes of members) groupByRefdes.set(refdes, group)
  }
  return groupByRefdes
}

function groundTerminalClusters(
  terminals: ReadonlyArray<RoutedTerminal>,
  groupByRefdes: ReadonlyMap<string, string>,
): ReadonlyArray<ReadonlyArray<RoutedTerminal>> {
  const grouped = new Map<string, RoutedTerminal[]>()
  for (const terminal of terminals) {
    const group = groupByRefdes.get(terminal.component.refdes) ?? terminal.component.refdes
    grouped.set(group, [...(grouped.get(group) ?? []), terminal])
  }

  const result: RoutedTerminal[][] = []
  for (const [, members] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const clusters: RoutedTerminal[][] = []
    for (const terminal of [...members].sort(compareRoutedTerminals)) {
      const candidate = clusters
        .filter((cluster) => groundClusterCanAccept(cluster, terminal))
        .sort((a, b) => distanceToCluster(terminal, a) - distanceToCluster(terminal, b))[0]
      if (candidate) candidate.push(terminal)
      else clusters.push([terminal])
    }
    result.push(...clusters)
  }
  return result
}

function groundClusterCanAccept(
  cluster: ReadonlyArray<RoutedTerminal>,
  terminal: RoutedTerminal,
): boolean {
  if (cluster.length >= 3) return false
  const points = [...cluster.map(({ pin }) => pin), terminal.pin]
  return Math.max(...points.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x)) <=
      COMPONENT_SPACING_X + 64 &&
    Math.max(...points.map(({ y }) => y)) - Math.min(...points.map(({ y }) => y)) <=
      COMPONENT_SPACING_Y + 48
}

function distanceToCluster(
  terminal: RoutedTerminal,
  cluster: ReadonlyArray<RoutedTerminal>,
): number {
  const averageX = cluster.reduce((sum, member) => sum + member.pin.x, 0) / cluster.length
  const averageY = cluster.reduce((sum, member) => sum + member.pin.y, 0) / cluster.length
  return Math.abs(terminal.pin.x - averageX) + Math.abs(terminal.pin.y - averageY)
}

function compareRoutedTerminals(a: RoutedTerminal, b: RoutedTerminal): number {
  return a.pin.y - b.pin.y || a.pin.x - b.pin.x || compareTerminalRefs(a.terminal, b.terminal)
}

function netLabelTotalWidth(name: string): number {
  return 17 + Math.max(54, 21 + name.length * 7)
}

function netLabelObstacle(name: string, hub: Point): ComponentObstacle {
  return {
    refdes: `@label:${name}`,
    left: hub.x,
    right: hub.x + netLabelTotalWidth(name),
    top: hub.y - 12,
    bottom: hub.y + 12,
  }
}

function groundAnnotationObstacle(hub: Point, index: number): ComponentObstacle {
  return {
    refdes: `@ground:${index}`,
    left: hub.x - 14,
    right: hub.x + 48,
    top: hub.y,
    bottom: hub.y + 42,
  }
}

function hubFitsLabel(
  name: string,
  hub: Point,
  obstacles: ReadonlyArray<ComponentObstacle>,
  occupiedPoints: ReadonlySet<string>,
): boolean {
  const label = netLabelObstacle(name, hub)
  return !pointInsideObstacle(hub, obstacles) &&
    !occupiedPoints.has(pointKey(hub)) &&
    !obstacles.some((obstacle) => boxesOverlap(label, obstacle))
}

function boxesOverlap(a: ComponentObstacle, b: ComponentObstacle): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function routePinToPoint(
  pin: Point,
  component: Component,
  target: Point,
  obstacles: ReadonlyArray<ComponentObstacle>,
  routeIndex: number,
  occupiedPoints: ReadonlySet<string>,
): Point[] {
  const starts = outwardPoints(pin, component)
  const available = starts.filter(
    (candidate) => !occupiedPoints.has(pointKey(candidate)),
  )
  const candidates = (available.length > 0 ? available : starts)
    .map((start) => {
      const route = routePath(
        start,
        target,
        obstacles,
        new Set(),
        routeIndex,
        occupiedPoints,
      )
      const points = dedupePoints([pin, start, ...route])
      return {
        points,
        score: pathLength(points) + Math.max(0, points.length - 2) * 12,
      }
    })
    .sort((a, b) =>
      a.score - b.score || stablePathKey(a.points).localeCompare(stablePathKey(b.points)),
    )
  return candidates[0]?.points ?? [pin, target]
}

function outwardPoints(pin: Point, component: Component): ReadonlyArray<Point> {
  const horizontal = Math.sign(pin.x - component.position.x)
  const vertical = Math.sign(pin.y - component.position.y)
  const horizontalOffset = Math.max(
    ROUTE_CLEARANCE,
    COMPONENT_ROUTE_CLEARANCE - Math.abs(pin.x - component.position.x),
  )
  const verticalOffset = Math.max(
    ROUTE_CLEARANCE,
    COMPONENT_ROUTE_CLEARANCE - Math.abs(pin.y - component.position.y),
  )
  const firstLane = dedupePoints([
    ...(horizontal === 0
      ? []
      : [{ x: pin.x + horizontal * horizontalOffset, y: pin.y }]),
    ...(vertical === 0
      ? []
      : [{ x: pin.x, y: pin.y + vertical * verticalOffset }]),
  ])
  return dedupePoints(
    Array.from({ length: MAX_AGENT_NETS }, (_, lane) =>
      firstLane.map((point) => ({
        x: pin.x + (point.x - pin.x) * (lane + 1),
        y: pin.y + (point.y - pin.y) * (lane + 1),
      })),
    ).flat(),
  )
}

function routePath(
  start: Point,
  end: Point,
  obstacles: ReadonlyArray<ComponentObstacle>,
  ignored: ReadonlySet<string>,
  routeIndex: number,
  occupiedPoints: ReadonlySet<string>,
): Point[] {
  const xCandidates = [...new Set([
    start.x,
    end.x,
    Math.min(...obstacles.map((obstacle) => obstacle.left)) - 4 * ROUTE_CLEARANCE,
    Math.max(...obstacles.map((obstacle) => obstacle.right)) + 4 * ROUTE_CLEARANCE,
    ...obstacles.flatMap((obstacle) => [obstacle.left - ROUTE_CLEARANCE, obstacle.right + ROUTE_CLEARANCE]),
    ...obstacleCorridors(obstacles, "left", "right"),
  ])]
  const yCandidates = [...new Set([
    start.y,
    end.y,
    Math.min(...obstacles.map((obstacle) => obstacle.top)) - 4 * ROUTE_CLEARANCE,
    Math.max(...obstacles.map((obstacle) => obstacle.bottom)) + 4 * ROUTE_CLEARANCE,
    ...obstacles.flatMap((obstacle) => [obstacle.top - ROUTE_CLEARANCE, obstacle.bottom + ROUTE_CLEARANCE]),
    ...obstacleCorridors(obstacles, "top", "bottom"),
  ])]
  const candidates: Point[][] = [
    [start, { x: end.x, y: start.y }, end],
    [start, { x: start.x, y: end.y }, end],
    ...yCandidates.map((y) => [start, { x: start.x, y }, { x: end.x, y }, end]),
    ...xCandidates.map((x) => [start, { x, y: start.y }, { x, y: end.y }, end]),
  ]
  const valid = candidates
    .map(dedupePoints)
    .filter((path) => pathClear(path, obstacles, ignored, occupiedPoints))
    .sort((a, b) => pathLength(a) - pathLength(b) || stablePathKey(a).localeCompare(stablePathKey(b)))
  if (valid[0]) return valid[0].slice(1)

  const outerBase =
    Math.min(...obstacles.map((obstacle) => obstacle.left)) -
    4 * ROUTE_CLEARANCE
  for (let lane = routeIndex; lane < routeIndex + MAX_AGENT_NETS; lane += 1) {
    const outerX = outerBase - lane * 8
    const fallback = dedupePoints([
      start,
      { x: outerX, y: start.y },
      { x: outerX, y: end.y },
      end,
    ])
    if (pathClear(fallback, obstacles, ignored, occupiedPoints)) {
      return fallback.slice(1)
    }
  }

  const outerX = outerBase - (routeIndex + MAX_AGENT_NETS) * 8
  return dedupePoints([
    { x: outerX, y: start.y },
    { x: outerX, y: end.y },
    end,
  ])
}

function obstacleCorridors(
  obstacles: ReadonlyArray<ComponentObstacle>,
  leading: "left" | "top",
  trailing: "right" | "bottom",
): number[] {
  const corridors: number[] = []
  for (const before of obstacles) {
    for (const after of obstacles) {
      if (before[trailing] >= after[leading]) continue
      corridors.push(Math.round((before[trailing] + after[leading]) / 2))
    }
  }
  return corridors
}

function pointInsideObstacle(point: Point, obstacles: ReadonlyArray<ComponentObstacle>): boolean {
  return obstacles.some((obstacle) =>
    point.x > obstacle.left && point.x < obstacle.right &&
    point.y > obstacle.top && point.y < obstacle.bottom,
  )
}

function pathClear(
  path: ReadonlyArray<Point>,
  obstacles: ReadonlyArray<ComponentObstacle>,
  ignored: ReadonlySet<string>,
  occupiedPoints: ReadonlySet<string>,
): boolean {
  for (let index = 1; index < path.length - 1; index += 1) {
    if (occupiedPoints.has(pointKey(path[index]!))) return false
  }
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]!
    const to = path[index]!
    if (from.x !== to.x && from.y !== to.y) return false
    if (obstacles.some((obstacle) => {
      if (ignored.has(obstacle.refdes)) return false
      if (from.x === to.x) {
        return from.x > obstacle.left && from.x < obstacle.right &&
          Math.max(from.y, to.y) > obstacle.top && Math.min(from.y, to.y) < obstacle.bottom
      }
      return from.y > obstacle.top && from.y < obstacle.bottom &&
        Math.max(from.x, to.x) > obstacle.left && Math.min(from.x, to.x) < obstacle.right
    })) return false
  }
  return true
}

function pathLength(path: ReadonlyArray<Point>): number {
  return path.slice(1).reduce((length, point, index) => {
    const previous = path[index]!
    return length + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)
  }, 0)
}

function stablePathKey(path: ReadonlyArray<Point>): string {
  return path.map((point) => `${point.x},${point.y}`).join(";")
}

function dedupePoints(points: ReadonlyArray<Point>): Point[] {
  return points.filter((point, index) => {
    const previous = points[index - 1]
    return !previous || point.x !== previous.x || point.y !== previous.y
  })
}

function terminalKey(terminal: AgentTerminalRef): string {
  return `${terminal.refdes}.${terminal.pin}`
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`
}

function compareComponents(
  a: AgentElectricalComponent,
  b: AgentElectricalComponent,
): number {
  return a.refdes.localeCompare(b.refdes) || a.type.localeCompare(b.type)
}

function compareNets(a: AgentElectricalNet, b: AgentElectricalNet): number {
  return a.name.localeCompare(b.name)
}

function compareTerminalRefs(a: AgentTerminalRef, b: AgentTerminalRef): number {
  return a.refdes.localeCompare(b.refdes) || a.pin.localeCompare(b.pin)
}
