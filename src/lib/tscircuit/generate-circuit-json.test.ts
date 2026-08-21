import { any_circuit_element } from "circuit-json"
import {
  createDemoRcLowPassProject,
  createEmptyProject,
} from "../schematic/create-default-project"
import type {
  CircuitProject,
  SchematicObject,
  SymbolObject,
} from "../schematic/types"
import { generateCircuitJson, generateCircuitJsonString } from "./generate-circuit-json"

describe("generateCircuitJson", () => {
  it("exports the RC demo as validated Circuit JSON elements", () => {
    const project = createDemoRcLowPassProject()
    const circuitJson = generateCircuitJson(project)
    const validatedCircuitJson = circuitJson.map((element) =>
      any_circuit_element.parse(element),
    )

    expect(validatedCircuitJson).toContainEqual(
      expect.objectContaining({
        type: "source_project_metadata",
        name: "RC Low-Pass Demo",
        software_used_string: "Circuit Sim",
      }),
    )
    expect(validatedCircuitJson).toContainEqual(
      expect.objectContaining({
        type: "schematic_sheet",
        name: "Main",
      }),
    )
    expect(validatedCircuitJson).toContainEqual(
      expect.objectContaining({
        type: "source_component",
        name: "R1",
        ftype: "simple_resistor",
        resistance: 1000,
      }),
    )
    expect(validatedCircuitJson).toContainEqual(
      expect.objectContaining({
        type: "source_component",
        name: "C1",
        ftype: "simple_capacitor",
        capacitance: 0.000001,
      }),
    )
    expect(validatedCircuitJson).toContainEqual(
      expect.objectContaining({
        type: "source_component",
        name: "V1",
        ftype: "simple_voltage_source",
        voltage: 5,
      }),
    )

    const sourceTraces = validatedCircuitJson.filter(
      (
        element,
      ): element is Extract<
        (typeof validatedCircuitJson)[number],
        { type: "source_trace" }
      > => element.type === "source_trace",
    )
    expect(sourceTraces.length).toBeGreaterThan(0)
    expect(
      sourceTraces.some((trace) => trace.connected_source_port_ids.length >= 2),
    ).toBe(true)
  })

  it("maps MVP schematic symbols to source components", () => {
    const project = projectWithObjects([
      symbol("resistor", "R1", { value: "2.2k" }),
      symbol("capacitor", "C1", { value: "47nF" }),
      symbol("inductor", "L1", { value: "10mH" }),
      symbol("switch", "S1", { state: "closed" }),
      symbol("potentiometer", "RV1", { value: "10k", wiper: "0.35" }),
      symbol("dc-voltage-source", "V1", { voltage: "9V" }),
      symbol("sine-voltage-source", "V2", {
        amplitude: "2V",
        frequency: "1k",
      }),
      symbol("dc-current-source", "I1", { current: "2mA" }),
      symbol("diode", "D1", {}),
      symbol("led", "LED1", {}),
      symbol("npn-transistor", "Q1", {}),
      symbol("pnp-transistor", "Q2", {}),
      symbol("n-mosfet", "M1", {}),
      symbol("p-mosfet", "M2", {}),
      symbol("ideal-op-amp-minus-top", "U1", {}),
      symbol("logic-input", "IN1", { position: "1" }),
      symbol("logic-output", "OUT1", {}),
      symbol("and-gate", "U2", { inputCount: "2" }),
      symbol("or-gate", "U3", { inputCount: "2" }),
      symbol("inverter", "U4", {}),
    ])

    const sourceComponents = generateCircuitJson(project).filter(
      (element) => element.type === "source_component",
    )

    expect(sourceComponents).toContainEqual(
      expect.objectContaining({
        name: "L1",
        ftype: "simple_inductor",
        inductance: 0.01,
      }),
    )
    expect(sourceComponents).toContainEqual(
      expect.objectContaining({
        name: "S1",
        ftype: "simple_switch",
        display_value: "closed",
      }),
    )
    expect(sourceComponents).toContainEqual(
      expect.objectContaining({
        name: "RV1",
        ftype: "simple_pinout",
        display_value: "10k",
      }),
    )
    expect(sourceComponents).toContainEqual(
      expect.objectContaining({
        name: "V2",
        ftype: "simple_voltage_source",
        voltage: 2,
        frequency: 1000,
        wave_shape: "sinewave",
      }),
    )
    expect(sourceComponents).toContainEqual(
      expect.objectContaining({
        name: "I1",
        ftype: "simple_current_source",
        current: 0.002,
      }),
    )
    expect(sourceComponents).toContainEqual(
      expect.objectContaining({
        name: "Q1",
        ftype: "simple_transistor",
        transistor_type: "npn",
      }),
    )
    expect(sourceComponents).toContainEqual(
      expect.objectContaining({
        name: "M2",
        ftype: "simple_mosfet",
        channel_type: "p",
        mosfet_mode: "enhancement",
      }),
    )
    expect(sourceComponents).toContainEqual(
      expect.objectContaining({
        name: "U1",
        ftype: "simple_op_amp",
      }),
    )
    expect(sourceComponents).toContainEqual(
      expect.objectContaining({
        name: "U4",
        ftype: "simple_pinout",
      }),
    )
  })

  it("exports diagonal symbol ports in schematic coordinates", () => {
    const project = projectWithObjects([
      {
        ...symbol("resistor", "R1", { value: "1k" }),
        id: "sym_diag",
        position: { x: 30, y: 40 },
        rotation: 53.130102354,
        pinSpacing: 100,
      },
    ])

    const schematicPorts = generateCircuitJson(project).filter(
      (
        element,
      ): element is {
        type: "schematic_port"
        center: { x: number; y: number }
      } => element.type === "schematic_port",
    )

    expect(schematicPorts.map((port) => port.center)).toEqual([
      { x: 0, y: 0 },
      { x: 1.5, y: 2 },
    ])
  })

  it("exports labels, probes, notes, and visual annotations", () => {
    const project = projectWithObjects([
      {
        kind: "wire",
        id: "wire_out",
        points: [
          { x: 0, y: 0 },
          { x: 80, y: 0 },
        ],
      },
      {
        kind: "net-label",
        id: "label_out",
        text: "OUT",
        position: { x: 40, y: 0 },
      },
      {
        kind: "probe",
        id: "probe_out",
        probeType: "voltage",
        name: "VP_OUT",
        position: { x: 40, y: 0 },
      },
      {
        kind: "text",
        id: "text_note",
        text: "Measure after R1",
        position: { x: 0, y: 80 },
        fontSize: 150,
      },
      {
        kind: "line",
        id: "line_marker",
        start: { x: 40, y: 80 },
        end: { x: 200, y: 120 },
      },
      {
        kind: "box",
        id: "box_scope",
        start: { x: -40, y: -80 },
        end: { x: 120, y: 40 },
      },
    ])

    const circuitJson = generateCircuitJson(project)

    expect(circuitJson).toContainEqual(
      expect.objectContaining({
        type: "source_net",
        name: "OUT",
      }),
    )
    expect(circuitJson).toContainEqual(
      expect.objectContaining({
        type: "schematic_voltage_probe",
        name: "VP_OUT",
        schematic_trace_id: "schematic_trace_wire_out",
      }),
    )
    expect(circuitJson).toContainEqual(
      expect.objectContaining({
        type: "schematic_text",
        text: "Measure after R1",
        position: { x: 0, y: 2 },
      }),
    )
    expect(circuitJson).toContainEqual(
      expect.objectContaining({
        type: "schematic_line",
        x1: 1,
        y1: 2,
        x2: 5,
        y2: 3,
      }),
    )
    expect(circuitJson).toContainEqual(
      expect.objectContaining({
        type: "schematic_box",
        x: -1,
        y: -2,
        width: 4,
        height: 3,
      }),
    )
  })

  it("serializes generated Circuit JSON with a trailing newline", () => {
    const serialized = generateCircuitJsonString(createDemoRcLowPassProject())

    expect(serialized).toMatch(/"type": "source_project_metadata"/)
    expect(serialized).toMatch(/"type": "source_component"/)
    expect(serialized.endsWith("\n")).toBe(true)
  })
})

function projectWithObjects(objects: SchematicObject[]): CircuitProject {
  const project = createEmptyProject()
  const sheet = project.sheets[0]
  if (!sheet) {
    throw new Error("Expected default project to include a sheet")
  }
  project.sheets[0] = { ...sheet, objects }
  return project
}

function symbol(
  componentDefinitionId: string,
  refdes: string,
  props: Record<string, unknown>,
): SymbolObject {
  return {
    kind: "symbol",
    id: `sym_${refdes.toLowerCase()}`,
    componentDefinitionId,
    symbolDefinitionId: symbolDefinitionIdFor(componentDefinitionId),
    refdes,
    position: { x: 0, y: 0 },
    rotation: 0,
    props,
  }
}

function symbolDefinitionIdFor(componentDefinitionId: string): string {
  switch (componentDefinitionId) {
    case "dc-voltage-source":
      return "dc-source"
    case "sine-voltage-source":
      return "sine-source"
    case "dc-current-source":
      return "current-source"
    default:
      return componentDefinitionId
  }
}
