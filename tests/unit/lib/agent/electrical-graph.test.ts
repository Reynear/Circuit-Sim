import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  AgentElectricalGraphSchema,
  MAX_AGENT_COMPONENTS,
  compileAgentElectricalGraph,
  type AgentElectricalGraph,
} from "@circuit-sim/core/agent/electrical-graph"
import { buildElectricalCircuit } from "@circuit-sim/core/circuit/electrical-circuit"
import { getPinPosts } from "@circuit-sim/core/circuit/component-geometry"
import { runErc } from "@circuit-sim/core/circuit/erc"
import { newCircuitProject, type Component, type Point, type WireObject } from "@circuit-sim/core/circuit/project"
import { generateSpiceNetlist } from "@circuit-sim/core/simulation/spice-netlist"

const decodeGraph = Schema.decodeUnknownSync(AgentElectricalGraphSchema)

describe("agent electrical graph", () => {
  it("compiles a geometry-free voltage divider into the canonical project", () => {
    const project = compileAgentElectricalGraph(
      newCircuitProject("Agent divider"),
      decodeGraph(voltageDividerGraph()),
    )
    const circuit = buildElectricalCircuit(project)

    expect(circuit.components.map((component) => component.refdes)).toEqual([
      "R1",
      "R2",
      "V1",
    ])
    expect(
      circuit.components
        .flatMap((component) =>
          component.terminals.map((terminal) => [
            `${component.refdes}.${terminal.key}`,
            terminal.net,
          ]),
        )
        .sort(([a], [b]) => String(a).localeCompare(String(b))),
    ).toEqual([
      ["R1.a", "VIN"],
      ["R1.b", "VOUT"],
      ["R2.a", "VOUT"],
      ["R2.b", "GND"],
      ["V1.negative", "GND"],
      ["V1.positive", "VIN"],
    ])
    expect(runErc(project)).toEqual([])
    expect(
      project.objects.filter((object) => object.kind === "component").length,
    ).toBe(3)
    expect(project.objects.filter((object) => object.kind === "wire").length)
      .toBeGreaterThanOrEqual(6)
  })

  it("canonicalizes an explicitly selected ground alias to GND", () => {
    const graph = voltageDividerGraph()
    const project = compileAgentElectricalGraph(
      newCircuitProject("Aliased ground"),
      decodeGraph({
        ...graph,
        groundNet: "N45",
        nets: graph.nets.map((net) =>
          net.name === "GND" ? { ...net, name: "N45" } : net,
        ),
      }),
    )

    expect(buildElectricalCircuit(project).nets.map((net) => net.name)).toContain(
      "GND",
    )
    expect(buildElectricalCircuit(project).nets.map((net) => net.name)).not.toContain(
      "N45",
    )
    expect(runErc(project)).toEqual([])
  })

  it("accepts modeled Zener, transistor, MOSFET, and ideal op amp catalog types", () => {
    const graph = decodeGraph({
      components: [
        { type: "zener-diode", refdes: "DZ1", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 100 } },
        { type: "npn-transistor", refdes: "QN", props: { beta: 100, earlyVoltageVolts: 75, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        { type: "pnp-transistor", refdes: "QP", props: { beta: 80, earlyVoltageVolts: 125, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
        {
          type: "n-mosfet",
          refdes: "MN",
          props: {
            thresholdVolts: 2,
            transconductanceAmpsPerVoltSquared: 0.0125,
            channelLengthModulationPerVolt: 0.04,
          },
        },
        {
          type: "p-mosfet",
          refdes: "MP",
          props: {
            thresholdVolts: -2,
            transconductanceAmpsPerVoltSquared: 0.025,
            channelLengthModulationPerVolt: 0,
          },
        },
        {
          type: "ideal-op-amp-minus-top",
          refdes: "U1",
          props: { gain: 100_000, minOutputVolts: -10, maxOutputVolts: 10 },
        },
      ],
      nets: [
        { name: "GND", terminals: [{ refdes: "DZ1", pin: "anode" }] },
      ],
      groundNet: "GND",
      analysis: { durationMs: 10, timeStepMs: 0.1 },
    })
    const project = compileAgentElectricalGraph(
      newCircuitProject("Modeled semiconductors"),
      graph,
    )

    expect(buildElectricalCircuit(project).components.map((component) => ({
      type: component.type,
      behavior: component.behavior,
    }))).toEqual([
      {
        type: "zener-diode",
        behavior: {
          kind: "zener-diode",
          breakdownVolts: 5.1,
          breakdownCurrentAmps: 0.001,
          saturationCurrentAmps: 1e-14,
          emissionCoefficient: 1,
          dynamicResistanceOhms: 100,
        },
      },
      {
        type: "n-mosfet",
        behavior: {
          kind: "mosfet",
          polarity: "n",
          thresholdVolts: 2,
          transconductanceAmpsPerVoltSquared: 0.0125,
          channelLengthModulationPerVolt: 0.04,
        },
      },
      {
        type: "p-mosfet",
        behavior: {
          kind: "mosfet",
          polarity: "p",
          thresholdVolts: -2,
          transconductanceAmpsPerVoltSquared: 0.025,
          channelLengthModulationPerVolt: 0,
        },
      },
      {
        type: "npn-transistor",
        behavior: {
          kind: "bipolar-transistor",
          polarity: "npn",
          beta: 100,
          earlyVoltageVolts: 75,
          saturationCurrentAmps: 1e-15,
          forwardEmissionCoefficient: 1,
        },
      },
      {
        type: "pnp-transistor",
        behavior: {
          kind: "bipolar-transistor",
          polarity: "pnp",
          beta: 80,
          earlyVoltageVolts: 125,
          saturationCurrentAmps: 1e-15,
          forwardEmissionCoefficient: 1,
        },
      },
      {
        type: "ideal-op-amp-minus-top",
        behavior: {
          kind: "ideal-op-amp",
          gain: 100_000,
          minOutputVolts: -10,
          maxOutputVolts: 10,
        },
      },
    ])
    expect(componentsOf(project).find((component) => component.refdes === "QN")?.flipped)
      .toBe(false)
    expect(componentsOf(project).find((component) => component.refdes === "QP")?.flipped)
      .toBe(true)
    expect(componentsOf(project).find((component) => component.refdes === "MN")?.flipped)
      .toBe(false)
    expect(componentsOf(project).find((component) => component.refdes === "MP")?.flipped)
      .toBe(true)
  })

  it("compiles the complete referenced logic catalog into modeled behavior", () => {
    const commonReference = ["IN1", "OUT1", "UA", "UI", "UO"].map(
      (refdes) => ({ refdes, pin: "reference" }),
    )
    const graph = decodeGraph({
      components: [
        {
          type: "logic-input",
          refdes: "IN1",
          props: {
            position: 1,
            highLogicVoltageVolts: 5,
            lowLogicVoltageVolts: 0,
            ternary: false,
            momentary: false,
          },
        },
        {
          type: "logic-output",
          refdes: "OUT1",
          props: { thresholdVolts: 2.5, currentRequiredAmps: 0.0001 },
        },
        { type: "and-gate", refdes: "UA", props: { inputCount: 2, highLogicVoltageVolts: 5 } },
        { type: "inverter", refdes: "UI", props: { highLogicVoltageVolts: 5 } },
        { type: "or-gate", refdes: "UO", props: { inputCount: 2, highLogicVoltageVolts: 5 } },
      ],
      nets: [{ name: "GND", terminals: commonReference }],
      groundNet: "GND",
      analysis: { durationMs: 10, timeStepMs: 0.1 },
    })
    const project = compileAgentElectricalGraph(
      newCircuitProject("Modeled logic"),
      graph,
    )

    expect(buildElectricalCircuit(project).components.map((component) => ({
      type: component.type,
      behavior: component.behavior,
    }))).toEqual([
      {
        type: "logic-input",
        behavior: { kind: "logic-input", position: 1, highVolts: 5, lowVolts: 0 },
      },
      {
        type: "logic-output",
        behavior: { kind: "logic-output", thresholdVolts: 2.5, requiredAmps: 0.0001 },
      },
      {
        type: "and-gate",
        behavior: { kind: "logic-gate", operation: "and", inputCount: 2, highVolts: 5 },
      },
      {
        type: "inverter",
        behavior: { kind: "inverter", highVolts: 5 },
      },
      {
        type: "or-gate",
        behavior: { kind: "logic-gate", operation: "or", inputCount: 2, highVolts: 5 },
      },
    ])
    expect(
      buildElectricalCircuit(project).components.every((component) =>
        component.terminals.some((terminal) =>
          terminal.key === "reference" && terminal.net === "GND",
        ),
      ),
    ).toBe(true)
  })

  it("uses stable layout regardless of command ordering", () => {
    const first = compileAgentElectricalGraph(
      newCircuitProject("First"),
      decodeGraph(voltageDividerGraph()),
    )
    const graph = voltageDividerGraph()
    const second = compileAgentElectricalGraph(
      newCircuitProject("Second"),
      decodeGraph({
        ...graph,
        components: [...graph.components].reverse(),
        nets: graph.nets.map((net) => ({
          ...net,
          terminals: [...net.terminals].reverse(),
        })).reverse(),
      }),
    )

    expect(layoutOf(second)).toEqual(layoutOf(first))
  })

  it.each([1, 2, 3, 4])(
    "lays out a complementary Darlington stage with %i bias diode(s) as one compact signal path",
    (diodeCount) => {
      const graph = decodeGraph(complementaryDarlingtonGraph(diodeCount))
      const project = compileAgentElectricalGraph(
        newCircuitProject(`${diodeCount}-diode Darlington layout`),
        graph,
      )
      const components = componentsOf(project)
      const biasColumn = [
        positionOf(components, "R1").x,
        ...Array.from(
          { length: diodeCount },
          (_, index) => positionOf(components, `D${index + 1}`).x,
        ),
        positionOf(components, "R2").x,
      ]

      expect(new Set(biasColumn)).toEqual(new Set([440]))
      for (let index = 1; index <= diodeCount; index += 1) {
        expect(components.find(({ refdes }) => refdes === `D${index}`)?.rotation)
          .toBe(90)
      }
      expect(positionOf(components, "VIN").x).toBeLessThan(440)
      expect(positionOf(components, "QN1").x).toBeLessThan(positionOf(components, "QN2").x)
      expect(positionOf(components, "QP1").x).toBeLessThan(positionOf(components, "QP2").x)
      expect(positionOf(components, "RL").x).toBeGreaterThan(positionOf(components, "QN2").x)
      expect(pinDistance(components, "QN1", "emitter", "QN2", "base")).toBe(32)
      expect(pinDistance(components, "QP1", "emitter", "QP2", "base")).toBe(32)
      expect(positionOf(components, "QN2").y).toBeLessThan(positionOf(components, "QP2").y)

      const upperDrive = netLabelOf(project, "UPPER_DRIVE")
      const lowerDrive = netLabelOf(project, "LOWER_DRIVE")
      expect(upperDrive.position.x).toBeLessThan(positionOf(components, "QN1").x)
      expect(upperDrive.position.y).toBeGreaterThan(positionOf(components, "QN2").y)
      expect(lowerDrive.position.x).toBeLessThan(positionOf(components, "QP1").x)
      expect(lowerDrive.position.y).toBeLessThan(positionOf(components, "QP2").y)

      const positiveSource = components.find(({ refdes }) => refdes === "VPOS")!
      const negativeSource = components.find(({ refdes }) => refdes === "VNEG")!
      const positivePins = getPinPosts(positiveSource)
      const negativePins = getPinPosts(negativeSource)
      expect(pinPosition(positivePins, "negative")).toEqual(pinPosition(negativePins, "positive"))
      expect(pinPosition(positivePins, "positive").y)
        .toBeLessThan(pinPosition(positivePins, "negative").y)
      expect(pinPosition(negativePins, "negative").y)
        .toBeGreaterThan(pinPosition(negativePins, "positive").y)
      expect(runErc(project)).toEqual([])
      expectSubmittedConnectivity(project, graph)
    },
  )

  it("uses a rail, bias, active-device, and load column for a single-supply BJT stage", () => {
    const graph = decodeGraph(biasedNpnFollowerGraph())
    const project = compileAgentElectricalGraph(
      newCircuitProject("Textbook NPN follower layout"),
      graph,
    )
    const components = componentsOf(project)

    expect(positionOf(components, "V1").x).toBeLessThan(positionOf(components, "RUP").x)
    expect(positionOf(components, "RUP").x).toBeLessThan(positionOf(components, "Q1").x)
    expect(positionOf(components, "Q1").x).toBeLessThan(positionOf(components, "RE").x)
    expect(positionOf(components, "RUP").x).toBe(positionOf(components, "RDOWN").x)
    expect(components.find(({ refdes }) => refdes === "RUP")?.rotation).toBe(90)
    expect(components.find(({ refdes }) => refdes === "RDOWN")?.rotation).toBe(90)
    expect(components.find(({ refdes }) => refdes === "RE")?.rotation).toBe(90)
    expect(totalWireLength(project)).toBeLessThan(3_600)

    const source = components.find(({ refdes }) => refdes === "V1")!
    const positive = pinPosition(getPinPosts(source), "positive")
    const vccWire = wireLeaving(project, positive)
    expect(vccWire[1]?.y).toBe(positive.y)
    expect(vccWire[1]?.x).toBeGreaterThan(positive.x)
    for (let index = 1; index < vccWire.length; index += 1) {
      expect(segmentCrossesBody(vccWire[index - 1]!, vccWire[index]!, source))
        .toBe(false)
    }

    const grounds = project.objects.filter(({ kind }) => kind === "ground")
    expect(grounds).toHaveLength(1)
    const groundBus = project.objects.find((object) =>
      object.kind === "wire" &&
      object.points.length >= 2 &&
      object.points.every(({ y }) => y === object.points[0]!.y) &&
      Math.min(...object.points.map(({ x }) => x)) <= positionOf(components, "V1").x &&
      Math.max(...object.points.map(({ x }) => x)) >= positionOf(components, "RE").x
    )
    expect(groundBus).toBeDefined()
    expect(runErc(project)).toEqual([])
    expectSubmittedConnectivity(project, graph)
  })

  it("lays sources to the left, loads to the right, and ground below", () => {
    const project = compileAgentElectricalGraph(
      newCircuitProject("Flow layout"),
      decodeGraph(voltageDividerGraph()),
    )
    const components = componentsOf(project)
    expect(positionOf(components, "V1").x).toBeLessThan(positionOf(components, "R1").x)
    expect(positionOf(components, "R1").x).toBeLessThan(positionOf(components, "R2").x)

    const ground = project.objects.find((object) => object.kind === "ground")!
    expect(ground.position.y).toBeGreaterThan(Math.max(...components.map((component) => component.position.y)))

    const source = components.find((component) => component.refdes === "V1")!
    const sourcePins = getPinPosts(source)
    const positive = sourcePins.find((pin) => pin.pin === "positive")!.position
    const negative = sourcePins.find((pin) => pin.pin === "negative")!.position
    expect(source.rotation).toBe(90)
    expect(positive.y).toBeLessThan(source.position.y)
    expect(negative.y).toBeGreaterThan(source.position.y)
    expect(wireLeaving(project, positive)[1]!.y).toBeLessThan(positive.y)
    expect(wireLeaving(project, negative)[1]!.y).toBeGreaterThan(negative.y)
  })

  it("orients a ground-fed current source with its injected load terminal above", () => {
    const project = compileAgentElectricalGraph(
      newCircuitProject("Current source flow"),
      decodeGraph(currentSourceGraph()),
    )
    const source = componentsOf(project).find((component) => component.refdes === "I1")!
    const pins = getPinPosts(source)
    const positive = pins.find((pin) => pin.pin === "positive")!.position
    const negative = pins.find((pin) => pin.pin === "negative")!.position

    expect(source.rotation).toBe(270)
    expect(negative.y).toBeLessThan(source.position.y)
    expect(positive.y).toBeGreaterThan(source.position.y)
    expect(wireLeaving(project, negative)[1]!.y).toBeLessThan(negative.y)
    expect(wireLeaving(project, positive)[1]!.y).toBeGreaterThan(positive.y)
    expect(buildElectricalCircuit(project).components.find(
      (component) => component.refdes === "I1",
    )?.terminals).toEqual([
      expect.objectContaining({ key: "positive", net: "GND" }),
      expect.objectContaining({ key: "negative", net: "OUT" }),
    ])
  })

  it("keeps component bodies separate and routes intermediate wire segments around them", () => {
    const project = compileAgentElectricalGraph(
      newCircuitProject("Readable layout"),
      decodeGraph(branchingGraph()),
    )
    const components = componentsOf(project)
    for (const first of components) {
      for (const second of components) {
        if (first.refdes >= second.refdes) continue
        expect(
          Math.abs(first.position.x - second.position.x) >= 128 ||
            Math.abs(first.position.y - second.position.y) >= 128,
        ).toBe(true)
      }
    }

    const wires = project.objects.filter(
      (object): object is WireObject => object.kind === "wire",
    )
    for (const wire of wires) {
      for (let index = 1; index < wire.points.length - 1; index += 1) {
        const from = wire.points[index - 1]!
        const to = wire.points[index]!
        for (const component of components) {
          const pin = getPinPosts(component).find(
            (candidate) => candidate.position.x === from.x && candidate.position.y === from.y,
          )
          if (pin) continue
          expect(segmentCrossesBody(from, to, component)).toBe(false)
        }
      }
    }
  })

  it("preserves every submitted terminal-to-net relationship in a branched layout", () => {
    const graph = decodeGraph(branchingGraph())
    const project = compileAgentElectricalGraph(
      newCircuitProject("Branched topology"),
      graph,
    )
    const actual = buildElectricalCircuit(project).components
      .flatMap((component) => component.terminals.map((terminal) => ({
        refdes: component.refdes,
        pin: terminal.key,
        net: terminal.net,
      })))
      .sort(compareTerminalNet)
    const expected = graph.nets
      .flatMap((net) => net.terminals.map((terminal) => ({
        ...terminal,
        net: net.name === graph.groundNet ? "GND" : net.name,
      })))
      .sort(compareTerminalNet)

    expect(actual).toEqual(expected)
    expect(runErc(project)).toEqual([])
  })

  it("does not merge adjacent MOSFET drain and source routes", () => {
    const graph = decodeGraph({
      components: [
        { type: "dc-voltage-source", refdes: "VDD", props: { voltageVolts: 5 } },
        { type: "sine-voltage-source", refdes: "VG", props: { amplitudeVolts: 5, frequencyHertz: 50 } },
        { type: "resistor", refdes: "R1", props: { resistanceOhms: 330 } },
        { type: "n-mosfet", refdes: "M1", props: { thresholdVolts: 2, transconductanceAmpsPerVoltSquared: 0.05, channelLengthModulationPerVolt: 0.02 } },
      ],
      nets: [
        { name: "VDD", terminals: [{ refdes: "VDD", pin: "positive" }, { refdes: "R1", pin: "a" }] },
        { name: "GATE", terminals: [{ refdes: "VG", pin: "positive" }, { refdes: "M1", pin: "gate" }] },
        { name: "DRAIN", terminals: [{ refdes: "R1", pin: "b" }, { refdes: "M1", pin: "drain" }] },
        { name: "GND", terminals: [{ refdes: "VDD", pin: "negative" }, { refdes: "VG", pin: "negative" }, { refdes: "M1", pin: "source" }] },
      ],
      groundNet: "GND",
      analysis: { durationMs: 80, timeStepMs: 0.05 },
    })
    const project = compileAgentElectricalGraph(
      newCircuitProject("MOSFET route isolation"),
      graph,
    )
    const circuit = buildElectricalCircuit(project)

    expect(circuit.nets.map((net) => net.name).sort()).toEqual([
      "DRAIN",
      "GATE",
      "GND",
      "VDD",
    ])
    expect(
      circuit.components.find((component) => component.refdes === "M1")?.terminals,
    ).toEqual([
      expect.objectContaining({ key: "gate", net: "GATE" }),
      expect.objectContaining({ key: "drain", net: "DRAIN" }),
      expect.objectContaining({ key: "source", net: "GND" }),
    ])
  })

  it("does not reuse an occupied outward point and short adjacent BJT routes", () => {
    const graph = decodeGraph({
      components: [
        { type: "dc-voltage-source", refdes: "VCC", props: { voltageVolts: 12 } },
        { type: "resistor", refdes: "RZ", props: { resistanceOhms: 1_000 } },
        { type: "resistor", refdes: "RE", props: { resistanceOhms: 4_300 } },
        { type: "resistor", refdes: "RC", props: { resistanceOhms: 3_000 } },
        { type: "zener-diode", refdes: "DZ", props: { breakdownVolts: 5.1, breakdownCurrentAmps: 0.001, saturationCurrentAmps: 1e-14, emissionCoefficient: 1, dynamicResistanceOhms: 10 } },
        { type: "npn-transistor", refdes: "Q1", props: { beta: 100, earlyVoltageVolts: 100, saturationCurrentAmps: 1e-15, forwardEmissionCoefficient: 1 } },
      ],
      nets: [
        { name: "VCC", terminals: [{ refdes: "VCC", pin: "positive" }, { refdes: "RZ", pin: "a" }, { refdes: "RC", pin: "a" }] },
        { name: "VREF", terminals: [{ refdes: "RZ", pin: "b" }, { refdes: "DZ", pin: "cathode" }, { refdes: "Q1", pin: "base" }] },
        { name: "EMITTER", terminals: [{ refdes: "Q1", pin: "emitter" }, { refdes: "RE", pin: "a" }] },
        { name: "COLLECTOR", terminals: [{ refdes: "RC", pin: "b" }, { refdes: "Q1", pin: "collector" }] },
        { name: "GND", terminals: [{ refdes: "VCC", pin: "negative" }, { refdes: "DZ", pin: "anode" }, { refdes: "RE", pin: "b" }] },
      ],
      groundNet: "GND",
      analysis: { durationMs: 10, timeStepMs: 0.1 },
    })
    const project = compileAgentElectricalGraph(
      newCircuitProject("BJT route isolation"),
      graph,
    )
    const circuit = buildElectricalCircuit(project)

    expect(circuit.nets.map((net) => net.name).sort()).toEqual([
      "COLLECTOR",
      "EMITTER",
      "GND",
      "VCC",
      "VREF",
    ])
    expect(
      circuit.components.find((component) => component.refdes === "Q1")?.terminals,
    ).toEqual([
      expect.objectContaining({ key: "base", net: "VREF" }),
      expect.objectContaining({ key: "collector", net: "COLLECTOR" }),
      expect.objectContaining({ key: "emitter", net: "EMITTER" }),
    ])
  })

  it("projects BJT Is and Nf through compilation into SPICE", () => {
    const project = compileAgentElectricalGraph(
      newCircuitProject("Parameterized BJT junction"),
      decodeGraph({
        components: [
          {
            type: "dc-current-source",
            refdes: "I1",
            props: { currentAmps: 0.001 },
          },
          {
            type: "npn-transistor",
            refdes: "Q1",
            props: {
              beta: 120,
              earlyVoltageVolts: 80,
              saturationCurrentAmps: 2e-14,
              forwardEmissionCoefficient: 1.3,
            },
          },
        ],
        nets: [
          {
            name: "VBE",
            terminals: [
              { refdes: "I1", pin: "negative" },
              { refdes: "Q1", pin: "base" },
              { refdes: "Q1", pin: "collector" },
            ],
          },
          {
            name: "GND",
            terminals: [
              { refdes: "I1", pin: "positive" },
              { refdes: "Q1", pin: "emitter" },
            ],
          },
        ],
        groundNet: "GND",
        analysis: { durationMs: 10, timeStepMs: 0.1 },
      }),
    )
    const circuit = buildElectricalCircuit(project)
    const netlist = generateSpiceNetlist({
      circuit,
      analysis: project.analysis,
      title: project.name,
    }).netlist

    expect(
      circuit.components.find((component) => component.refdes === "Q1")
        ?.behavior,
    ).toEqual({
      kind: "bipolar-transistor",
      polarity: "npn",
      beta: 120,
      earlyVoltageVolts: 80,
      saturationCurrentAmps: 2e-14,
      forwardEmissionCoefficient: 1.3,
    })
    expect(netlist).toContain(
      ".model QMODEL_Q1 NPN(Is=2e-14 Nf=1.3 Bf=120 Vaf=80)",
    )
    expect(netlist).toContain("Q1 VBE VBE 0 QMODEL_Q1")
  })

  it("projects ordinary-diode Is, N, and Rs through compilation into SPICE", () => {
    const project = compileAgentElectricalGraph(
      newCircuitProject("Parameterized ordinary diode"),
      decodeGraph({
        components: [
          {
            type: "dc-current-source",
            refdes: "I1",
            props: { currentAmps: 0.001 },
          },
          {
            type: "diode",
            refdes: "D1",
            props: {
              model: "DDEFAULT",
              saturationCurrentAmps: 2e-13,
              emissionCoefficient: 1.7,
              seriesResistanceOhms: 12,
            },
          },
        ],
        nets: [
          {
            name: "FORWARD",
            terminals: [
              { refdes: "I1", pin: "negative" },
              { refdes: "D1", pin: "anode" },
            ],
          },
          {
            name: "GND",
            terminals: [
              { refdes: "I1", pin: "positive" },
              { refdes: "D1", pin: "cathode" },
            ],
          },
        ],
        groundNet: "GND",
        analysis: { durationMs: 10, timeStepMs: 0.1 },
      }),
    )
    const circuit = buildElectricalCircuit(project)
    const netlist = generateSpiceNetlist({
      circuit,
      analysis: project.analysis,
      title: project.name,
    }).netlist

    expect(
      circuit.components.find((component) => component.refdes === "D1")
        ?.behavior,
    ).toEqual({
      kind: "diode",
      model: "DDEFAULT",
      saturationCurrentAmps: 2e-13,
      emissionCoefficient: 1.7,
      seriesResistanceOhms: 12,
    })
    expect(netlist).toContain(
      ".model DDEFAULT_D1 D(Is=2e-13 N=1.7 Rs=12)",
    )
    expect(netlist).toContain("D1 FORWARD 0 DDEFAULT_D1")
  })

  it("projects LED colors into distinct forward-voltage SPICE models", () => {
    const project = compileAgentElectricalGraph(
      newCircuitProject("LED color models"),
      decodeGraph({
        components: [
          { type: "dc-voltage-source", refdes: "V1", props: { voltageVolts: 5 } },
          { type: "resistor", refdes: "RR", props: { resistanceOhms: 330 } },
          { type: "resistor", refdes: "RB", props: { resistanceOhms: 330 } },
          { type: "led", refdes: "LEDR", props: { color: "red" } },
          { type: "led", refdes: "LEDB", props: { color: "blue" } },
        ],
        nets: [
          { name: "VCC", terminals: [{ refdes: "V1", pin: "positive" }, { refdes: "RR", pin: "a" }, { refdes: "RB", pin: "a" }] },
          { name: "RED_A", terminals: [{ refdes: "RR", pin: "b" }, { refdes: "LEDR", pin: "anode" }] },
          { name: "BLUE_A", terminals: [{ refdes: "RB", pin: "b" }, { refdes: "LEDB", pin: "anode" }] },
          { name: "GND", terminals: [{ refdes: "V1", pin: "negative" }, { refdes: "LEDR", pin: "cathode" }, { refdes: "LEDB", pin: "cathode" }] },
        ],
        groundNet: "GND",
        analysis: { durationMs: 10, timeStepMs: 0.1 },
      }),
    )
    const circuit = buildElectricalCircuit(project)
    const netlist = generateSpiceNetlist({
      circuit,
      analysis: project.analysis,
      title: project.name,
    }).netlist

    expect(
      circuit.components.find((component) => component.refdes === "LEDR")?.behavior,
    ).toEqual({
      kind: "diode",
      model: "DLED",
      saturationCurrentAmps: 1e-18,
      emissionCoefficient: 2,
      seriesResistanceOhms: 0,
    })
    expect(
      circuit.components.find((component) => component.refdes === "LEDB")?.behavior,
    ).toEqual({
      kind: "diode",
      model: "DLED_BLUE",
      saturationCurrentAmps: 1e-30,
      emissionCoefficient: 2,
      seriesResistanceOhms: 0,
    })
    expect(netlist).toContain(".model DLED_BLUE D(Is=1e-30 N=2)")
    expect(netlist).toContain(" DLED_BLUE")
  })

  it("keeps a bounded presentation aspect ratio for a multi-branch circuit", () => {
    const project = compileAgentElectricalGraph(
      newCircuitProject("Aspect ratio"),
      decodeGraph(branchingGraph()),
    )
    const points = project.objects.flatMap((object) =>
      object.kind === "component"
        ? [object.position]
        : object.kind === "wire"
          ? object.points
          : object.kind === "line" || object.kind === "box"
            ? [object.start, object.end]
            : [object.position],
    )
    const width = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x))
    const height = Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y))
    expect(Math.max(width / Math.max(height, 1), height / Math.max(width, 1))).toBeLessThan(8)
  })

  it("paginates repeated BJT branches and keeps their generated SVG geometry orthogonal", () => {
    const graph = decodeGraph(parallelBjtBranchesGraph(8))
    const project = compileAgentElectricalGraph(
      newCircuitProject("Parallel BJT branches"),
      graph,
    )
    const components = componentsOf(project)
    const grounds = project.objects.filter((object) => object.kind === "ground")
    const wires = project.objects.filter(
      (object): object is WireObject => object.kind === "wire",
    )

    expect(new Set(components.map(({ position }) => position.y)).size).toBe(4)
    expect(new Set(components.map(({ position }) => position.x)).size).toBe(4)
    expect(grounds).toHaveLength(8)
    for (let branch = 1; branch <= 8; branch += 1) {
      const source = positionOf(components, `I${branch}`)
      const transistor = positionOf(components, `Q${branch}`)
      expect(transistor.y).toBe(source.y)
      expect(transistor.x - source.x).toBe(220)
    }
    for (const wire of wires) {
      for (let index = 1; index < wire.points.length; index += 1) {
        const from = wire.points[index - 1]!
        const to = wire.points[index]!
        expect(from.x === to.x || from.y === to.y).toBe(true)
      }
    }
    for (const label of project.objects.filter((object) => object.kind === "net-label")) {
      const labelBounds = {
        left: label.position.x,
        right: label.position.x + 17 + Math.max(54, 21 + label.text.length * 7),
        top: label.position.y - 12,
        bottom: label.position.y + 12,
      }
      for (const component of components) {
        const horizontalClearance = Math.max(64, component.refdes.length * 4 + 16)
        const componentBounds = {
          left: component.position.x - horizontalClearance,
          right: component.position.x + horizontalClearance,
          top: component.position.y - 84,
          bottom: component.position.y + 84,
        }
        expect(boxesOverlap(labelBounds, componentBounds)).toBe(false)
      }
    }

    expect(buildElectricalCircuit(project).nets.map(({ name }) => name).sort())
      .toEqual(["GND", ...Array.from({ length: 8 }, (_, index) => `VBE_BRANCH_${index + 1}`)].sort())
  })

  it("preserves compatible component positions when a graph gains a component", () => {
    const first = compileAgentElectricalGraph(
      newCircuitProject("Incremental"),
      decodeGraph(voltageDividerGraph()),
    )
    const expanded = {
      ...voltageDividerGraph(),
      components: [
        ...voltageDividerGraph().components,
        { type: "resistor" as const, refdes: "R3", props: { resistanceOhms: 10_000 } },
      ],
      nets: [
        {
          name: "VIN",
          terminals: [
            { refdes: "V1", pin: "positive" },
            { refdes: "R1", pin: "a" },
          ],
        },
        {
          name: "VOUT",
          terminals: [
            { refdes: "R1", pin: "b" },
            { refdes: "R2", pin: "a" },
            { refdes: "R3", pin: "a" },
          ],
        },
        {
          name: "GND",
          terminals: [
            { refdes: "R2", pin: "b" },
            { refdes: "V1", pin: "negative" },
            { refdes: "R3", pin: "b" },
          ],
        },
      ],
    }
    const second = compileAgentElectricalGraph(
      first,
      decodeGraph(expanded),
    )
    for (const refdes of ["V1", "R1", "R2"]) {
      expect(positionOf(componentsOf(second), refdes)).toEqual(
        positionOf(componentsOf(first), refdes),
      )
    }
  })

  it("preserves existing branch positions when an LLM edit grows a paged matrix", () => {
    const first = compileAgentElectricalGraph(
      newCircuitProject("Paged edit"),
      decodeGraph(parallelBjtBranchesGraph(8)),
    )
    const expanded = compileAgentElectricalGraph(
      first,
      decodeGraph(parallelBjtBranchesGraph(9)),
    )
    const firstComponents = componentsOf(first)
    const expandedComponents = componentsOf(expanded)

    for (let branch = 1; branch <= 8; branch += 1) {
      for (const prefix of ["I", "Q"]) {
        expect(positionOf(expandedComponents, `${prefix}${branch}`)).toEqual(
          positionOf(firstComponents, `${prefix}${branch}`),
        )
      }
    }
    expect(positionOf(expandedComponents, "I9").x)
      .toBeGreaterThan(Math.max(...firstComponents.map(({ position }) => position.x)))
    expect(buildElectricalCircuit(expanded).nets.map(({ name }) => name))
      .toContain("VBE_BRANCH_9")
  })

  it("rejects unknown component types and catalog pins", () => {
    expect(() =>
      decodeGraph({
        ...voltageDividerGraph(),
        components: [
          { type: "unknown-device", refdes: "X1", props: {} },
        ],
        nets: [],
      }),
    ).toThrow()

    expect(() =>
      decodeGraph({
        ...voltageDividerGraph(),
        groundNet: "VIN",
        nets: [
          {
            name: "VIN",
            terminals: [{ refdes: "V1", pin: "invented" }],
          },
        ],
      }),
    ).toThrow(/not a catalog terminal/)
  })

  it("rejects invalid cross-property active-block and logic ranges", () => {
    const graphFor = (component: unknown) => ({
      components: [component],
      nets: [{ name: "GND", terminals: [{ refdes: "X1", pin: "reference" }] }],
      groundNet: "GND",
      analysis: { durationMs: 10, timeStepMs: 0.1 },
    })

    expect(() =>
      decodeGraph(graphFor({
        type: "logic-input",
        refdes: "X1",
        props: {
          position: 0,
          highLogicVoltageVolts: 0,
          lowLogicVoltageVolts: 0,
          ternary: false,
          momentary: false,
        },
      })),
    ).toThrow(/low logic voltage must be below/)
    expect(() =>
      decodeGraph({
        components: [{
          type: "ideal-op-amp-minus-top",
          refdes: "X1",
          props: { gain: 100_000, minOutputVolts: 5, maxOutputVolts: 5 },
        }],
        nets: [{ name: "GND", terminals: [{ refdes: "X1", pin: "vMinus" }] }],
        groundNet: "GND",
        analysis: { durationMs: 10, timeStepMs: 0.1 },
      }),
    ).toThrow(/minimum output voltage must be below/)
    expect(() =>
      decodeGraph({
        components: [{
          type: "pulse-voltage-source",
          refdes: "X1",
          props: {
            initialVoltageVolts: 5,
            pulsedVoltageVolts: 5,
            frequencyHertz: 1_000,
            dutyCyclePercent: 50,
            delaySeconds: 0,
            riseTimeSeconds: 1e-8,
            fallTimeSeconds: 1e-8,
          },
        }],
        nets: [{ name: "GND", terminals: [{ refdes: "X1", pin: "negative" }] }],
        groundNet: "GND",
        analysis: { durationMs: 10, timeStepMs: 0.1 },
      }),
    ).toThrow(/pulse voltages must differ/)
  })

  it("rejects ambiguous connectivity and oversized commands", () => {
    expect(() =>
      decodeGraph({
        ...voltageDividerGraph(),
        groundNet: "A",
        nets: [
          { name: "A", terminals: [{ refdes: "R1", pin: "a" }] },
          { name: "B", terminals: [{ refdes: "R1", pin: "a" }] },
        ],
      }),
    ).toThrow(/cannot belong to both/)

    expect(() =>
      decodeGraph({
        components: Array.from({ length: MAX_AGENT_COMPONENTS + 1 }, (_, index) => ({
          type: "resistor",
          refdes: `R${index + 1}`,
          props: { resistanceOhms: 1_000 },
        })),
        nets: [{ name: "GND", terminals: [{ refdes: "R1", pin: "a" }] }],
        groundNet: "GND",
        analysis: { durationMs: 10, timeStepMs: 0.1 },
      }),
    ).toThrow(/at most 32 components/)
  })

  it("requires one unambiguous submitted ground net", () => {
    const graph = voltageDividerGraph()
    expect(() => decodeGraph({ ...graph, groundNet: "MISSING" })).toThrow(
      /must name one of the submitted nets/,
    )
    expect(() =>
      decodeGraph({
        ...graph,
        groundNet: "VOUT",
      }),
    ).toThrow(/conflicts with the reserved GND net name/)
  })

  it("rejects a nonzero one-pin power rail assigned to the selected ground net", () => {
    expect(() =>
      decodeGraph({
        components: [
          { type: "dc-power-rail", refdes: "VCC", props: { voltageVolts: 5 } },
        ],
        nets: [
          { name: "GND", terminals: [{ refdes: "VCC", pin: "rail" }] },
        ],
        groundNet: "GND",
        analysis: { durationMs: 10, timeStepMs: 0.1 },
      }),
    ).toThrow(/cannot be connected to ground at a nonzero voltage/)
  })

  it("requires both terminals of a closed switch to describe one actual net", () => {
    expect(() =>
      decodeGraph({
        components: [
          { type: "switch", refdes: "S1", props: { state: "closed" } },
        ],
        nets: [
          { name: "A", terminals: [{ refdes: "S1", pin: "a" }] },
          { name: "B", terminals: [{ refdes: "S1", pin: "b" }] },
        ],
        groundNet: "A",
        analysis: { durationMs: 10, timeStepMs: 0.1 },
      }),
    ).toThrow(/is closed/)
  })
})

function voltageDividerGraph() {
  return {
    components: [
      {
        type: "dc-voltage-source" as const,
        refdes: "V1",
        props: { voltageVolts: 5 },
      },
      {
        type: "resistor" as const,
        refdes: "R1",
        props: { resistanceOhms: 10_000 },
      },
      {
        type: "resistor" as const,
        refdes: "R2",
        props: { resistanceOhms: 10_000 },
      },
    ],
    nets: [
      {
        name: "VIN",
        terminals: [
          { refdes: "V1", pin: "positive" },
          { refdes: "R1", pin: "a" },
        ],
      },
      {
        name: "VOUT",
        terminals: [
          { refdes: "R1", pin: "b" },
          { refdes: "R2", pin: "a" },
        ],
      },
      {
        name: "GND",
        terminals: [
          { refdes: "R2", pin: "b" },
          { refdes: "V1", pin: "negative" },
        ],
      },
    ],
    groundNet: "GND",
    analysis: { durationMs: 10, timeStepMs: 0.1 },
  }
}

function biasedNpnFollowerGraph() {
  return {
    components: [
      { type: "dc-voltage-source" as const, refdes: "V1", props: { voltageVolts: 9 } },
      { type: "resistor" as const, refdes: "RUP", props: { resistanceOhms: 47_000 } },
      { type: "resistor" as const, refdes: "RDOWN", props: { resistanceOhms: 15_000 } },
      { type: "resistor" as const, refdes: "RE", props: { resistanceOhms: 1_000 } },
      { type: "npn-transistor" as const, refdes: "Q1", props: bjtProps() },
    ],
    nets: [
      {
        name: "VCC",
        terminals: [
          { refdes: "V1", pin: "positive" },
          { refdes: "RUP", pin: "a" },
          { refdes: "Q1", pin: "collector" },
        ],
      },
      {
        name: "BASE",
        terminals: [
          { refdes: "RUP", pin: "b" },
          { refdes: "RDOWN", pin: "a" },
          { refdes: "Q1", pin: "base" },
        ],
      },
      {
        name: "EMITTER",
        terminals: [
          { refdes: "Q1", pin: "emitter" },
          { refdes: "RE", pin: "a" },
        ],
      },
      {
        name: "GND",
        terminals: [
          { refdes: "V1", pin: "negative" },
          { refdes: "RDOWN", pin: "b" },
          { refdes: "RE", pin: "b" },
        ],
      },
    ],
    groundNet: "GND",
    analysis: { durationMs: 10, timeStepMs: 0.1 },
  }
}

function complementaryDarlingtonGraph(diodeCount: number) {
  const pathNets = Array.from(
    { length: diodeCount + 1 },
    (_, index) => index === 0
      ? "UPPER_BIAS"
      : index === diodeCount
        ? "LOWER_BIAS"
        : `BIAS_${index}`,
  )
  const inputNet = pathNets[Math.floor(diodeCount / 2)]!
  const diodeTerminals = pathNets.map((name, index) => ({
    name,
    terminals: [
      ...(index > 0 ? [{ refdes: `D${index}`, pin: "cathode" }] : []),
      ...(index < diodeCount ? [{ refdes: `D${index + 1}`, pin: "anode" }] : []),
      ...(index === 0
        ? [{ refdes: "R1", pin: "b" }, { refdes: "QN1", pin: "base" }]
        : []),
      ...(index === diodeCount
        ? [{ refdes: "R2", pin: "a" }, { refdes: "QP1", pin: "base" }]
        : []),
      ...(name === inputNet ? [{ refdes: "VIN", pin: "positive" }] : []),
    ],
  }))
  return {
    components: [
      { type: "dc-voltage-source" as const, refdes: "VPOS", props: { voltageVolts: 15 } },
      { type: "dc-voltage-source" as const, refdes: "VNEG", props: { voltageVolts: 15 } },
      { type: "sine-voltage-source" as const, refdes: "VIN", props: { amplitudeVolts: 5, frequencyHertz: 1_000 } },
      { type: "resistor" as const, refdes: "R1", props: { resistanceOhms: 5_100 } },
      { type: "resistor" as const, refdes: "R2", props: { resistanceOhms: 5_100 } },
      { type: "resistor" as const, refdes: "RL", props: { resistanceOhms: 30 } },
      ...Array.from({ length: diodeCount }, (_, index) => ({
        type: "diode" as const,
        refdes: `D${index + 1}`,
        props: {
          model: "DDEFAULT",
          saturationCurrentAmps: 1e-14,
          emissionCoefficient: 1,
          seriesResistanceOhms: 0,
        },
      })),
      { type: "npn-transistor" as const, refdes: "QN1", props: bjtProps() },
      { type: "npn-transistor" as const, refdes: "QN2", props: bjtProps() },
      { type: "pnp-transistor" as const, refdes: "QP1", props: bjtProps() },
      { type: "pnp-transistor" as const, refdes: "QP2", props: bjtProps() },
    ],
    nets: [
      {
        name: "VCC",
        terminals: [
          { refdes: "VPOS", pin: "positive" },
          { refdes: "R1", pin: "a" },
          { refdes: "QN1", pin: "collector" },
          { refdes: "QN2", pin: "collector" },
        ],
      },
      ...diodeTerminals,
      {
        name: "VEE",
        terminals: [
          { refdes: "R2", pin: "b" },
          { refdes: "VNEG", pin: "negative" },
          { refdes: "QP1", pin: "collector" },
          { refdes: "QP2", pin: "collector" },
        ],
      },
      {
        name: "UPPER_DRIVE",
        terminals: [
          { refdes: "QN1", pin: "emitter" },
          { refdes: "QN2", pin: "base" },
        ],
      },
      {
        name: "LOWER_DRIVE",
        terminals: [
          { refdes: "QP1", pin: "emitter" },
          { refdes: "QP2", pin: "base" },
        ],
      },
      {
        name: "VOUT",
        terminals: [
          { refdes: "QN2", pin: "emitter" },
          { refdes: "QP2", pin: "emitter" },
          { refdes: "RL", pin: "a" },
        ],
      },
      {
        name: "GND",
        terminals: [
          { refdes: "VPOS", pin: "negative" },
          { refdes: "VNEG", pin: "positive" },
          { refdes: "VIN", pin: "negative" },
          { refdes: "RL", pin: "b" },
        ],
      },
    ],
    groundNet: "GND",
    analysis: { durationMs: 4, timeStepMs: 0.01 },
  }
}

function bjtProps() {
  return {
    beta: 100,
    earlyVoltageVolts: 100,
    saturationCurrentAmps: 1e-15,
    forwardEmissionCoefficient: 1,
  }
}

function currentSourceGraph() {
  return {
    components: [
      {
        type: "dc-current-source" as const,
        refdes: "I1",
        props: { currentAmps: 0.001 },
      },
      {
        type: "resistor" as const,
        refdes: "R1",
        props: { resistanceOhms: 1_000 },
      },
    ],
    nets: [
      {
        name: "OUT",
        terminals: [
          { refdes: "I1", pin: "negative" },
          { refdes: "R1", pin: "a" },
        ],
      },
      {
        name: "GND",
        terminals: [
          { refdes: "I1", pin: "positive" },
          { refdes: "R1", pin: "b" },
        ],
      },
    ],
    groundNet: "GND",
    analysis: { durationMs: 10, timeStepMs: 0.1 },
  }
}

function wireLeaving(
  project: ReturnType<typeof compileAgentElectricalGraph>,
  point: Point,
): WireObject["points"] {
  const wire = project.objects.find(
    (object): object is WireObject =>
      object.kind === "wire" &&
      object.points[0]?.x === point.x &&
      object.points[0]?.y === point.y,
  )
  if (!wire) throw new Error(`No wire leaves ${point.x},${point.y}`)
  return wire.points
}

function compareTerminalNet(
  a: { readonly refdes: string; readonly pin: string; readonly net: string | null },
  b: { readonly refdes: string; readonly pin: string; readonly net: string | null },
): number {
  return a.refdes.localeCompare(b.refdes) || a.pin.localeCompare(b.pin)
}

function layoutOf(project: ReturnType<typeof compileAgentElectricalGraph>) {
  return project.objects.map((object) => {
    const { id: _, ...withoutId } = object
    return withoutId
  })
}

function componentsOf(project: ReturnType<typeof compileAgentElectricalGraph>): Component[] {
  return project.objects.filter(
    (object): object is Component => object.kind === "component",
  )
}

function positionOf(components: ReadonlyArray<Component>, refdes: string): Point {
  return components.find((component) => component.refdes === refdes)!.position
}

function netLabelOf(
  project: ReturnType<typeof compileAgentElectricalGraph>,
  text: string,
) {
  const label = project.objects.find(
    (object) => object.kind === "net-label" && object.text === text,
  )
  if (!label || label.kind !== "net-label") {
    throw new Error(`Missing net label ${text}`)
  }
  return label
}

function pinPosition(
  pins: ReadonlyArray<{ readonly pin: string; readonly position: Point }>,
  pin: string,
): Point {
  const post = pins.find((candidate) => candidate.pin === pin)
  if (!post) throw new Error(`Missing pin ${pin}`)
  return post.position
}

function pinDistance(
  components: ReadonlyArray<Component>,
  firstRefdes: string,
  firstPin: string,
  secondRefdes: string,
  secondPin: string,
): number {
  const first = getPinPosts(
    components.find(({ refdes }) => refdes === firstRefdes)!,
  ).find(({ pin }) => pin === firstPin)!.position
  const second = getPinPosts(
    components.find(({ refdes }) => refdes === secondRefdes)!,
  ).find(({ pin }) => pin === secondPin)!.position
  return Math.abs(first.x - second.x) + Math.abs(first.y - second.y)
}

function totalWireLength(
  project: ReturnType<typeof compileAgentElectricalGraph>,
): number {
  return project.objects
    .filter((object): object is WireObject => object.kind === "wire")
    .reduce((total, wire) => total + wire.points.slice(1).reduce(
      (length, point, index) => {
        const previous = wire.points[index]!
        return length + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)
      },
      0,
    ), 0)
}

function expectSubmittedConnectivity(
  project: ReturnType<typeof compileAgentElectricalGraph>,
  graph: AgentElectricalGraph,
) {
  const actual = buildElectricalCircuit(project).components
    .flatMap((component) => component.terminals.map((terminal) => ({
      refdes: component.refdes,
      pin: terminal.key,
      net: terminal.net,
    })))
    .sort(compareTerminalNet)
  const expected = graph.nets
    .flatMap((net) => net.terminals.map((terminal) => ({
      ...terminal,
      net: net.name === graph.groundNet ? "GND" : net.name,
    })))
    .sort(compareTerminalNet)
  expect(actual).toEqual(expected)
}

function segmentCrossesBody(from: Point, to: Point, component: Component): boolean {
  const left = component.position.x - 40
  const right = component.position.x + 40
  const top = component.position.y - 40
  const bottom = component.position.y + 40
  if (from.x === to.x) {
    return from.x > left && from.x < right &&
      Math.max(from.y, to.y) > top && Math.min(from.y, to.y) < bottom
  }
  if (from.y === to.y) {
    return from.y > top && from.y < bottom &&
      Math.max(from.x, to.x) > left && Math.min(from.x, to.x) < right
  }
  return true
}

function boxesOverlap(
  first: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number },
  second: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number },
): boolean {
  return first.left < second.right && first.right > second.left &&
    first.top < second.bottom && first.bottom > second.top
}

function branchingGraph() {
  return {
    components: [
      { type: "dc-voltage-source" as const, refdes: "V1", props: { voltageVolts: 5 } },
      { type: "resistor" as const, refdes: "R1", props: { resistanceOhms: 1_000 } },
      { type: "resistor" as const, refdes: "R2", props: { resistanceOhms: 2_000 } },
      { type: "capacitor" as const, refdes: "C1", props: { capacitanceFarads: 1e-6 } },
      { type: "resistor" as const, refdes: "R3", props: { resistanceOhms: 3_000 } },
    ],
    nets: [
      { name: "VIN", terminals: [{ refdes: "V1", pin: "positive" }, { refdes: "R1", pin: "a" }, { refdes: "R2", pin: "a" }] },
      { name: "VOUT", terminals: [{ refdes: "R1", pin: "b" }, { refdes: "C1", pin: "a" }, { refdes: "R3", pin: "a" }] },
      { name: "GND", terminals: [{ refdes: "V1", pin: "negative" }, { refdes: "R2", pin: "b" }, { refdes: "C1", pin: "b" }, { refdes: "R3", pin: "b" }] },
    ],
    groundNet: "GND",
    analysis: { durationMs: 10, timeStepMs: 0.1 },
  }
}

function parallelBjtBranchesGraph(count: number) {
  return {
    components: Array.from({ length: count }, (_, index) => {
      const branch = index + 1
      return [
        {
          type: "dc-current-source" as const,
          refdes: `I${branch}`,
          props: { currentAmps: branch % 2 === 0 ? 0.001 : 0.0001 },
        },
        {
          type: "npn-transistor" as const,
          refdes: `Q${branch}`,
          props: {
            beta: 100,
            earlyVoltageVolts: 100,
            saturationCurrentAmps: 1e-15,
            forwardEmissionCoefficient: 1,
          },
        },
      ]
    }).flat(),
    nets: [
      ...Array.from({ length: count }, (_, index) => {
        const branch = index + 1
        return {
          name: `VBE_BRANCH_${branch}`,
          terminals: [
            { refdes: `I${branch}`, pin: "negative" },
            { refdes: `Q${branch}`, pin: "base" },
            { refdes: `Q${branch}`, pin: "collector" },
          ],
        }
      }),
      {
        name: "GND",
        terminals: Array.from({ length: count }, (_, index) => {
          const branch = index + 1
          return [
            { refdes: `I${branch}`, pin: "positive" },
            { refdes: `Q${branch}`, pin: "emitter" },
          ]
        }).flat(),
      },
    ],
    groundNet: "GND",
    analysis: { durationMs: 10, timeStepMs: 0.1 },
  }
}

const _typecheckGraph: AgentElectricalGraph = decodeGraph(voltageDividerGraph())
void _typecheckGraph
