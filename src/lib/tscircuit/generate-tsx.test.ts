import {
  createDemoRcLowPassProject,
  createDemoSourceToGroundProject,
  createEmptyProject,
} from "../schematic/create-default-project"
import type {
  CircuitProject,
  SchematicObject,
  SymbolObject,
} from "../schematic/types"
import { generateTscircuitTsx } from "./generate-tsx"

describe("generateTscircuitTsx", () => {
  it("generates the expected tscircuit primitives for the RC demo", () => {
    const output = generateTscircuitTsx(createDemoRcLowPassProject())

    expect(output).toContain("<board")
    expect(output).toContain("data-circuit-id=\"sym_")
    expect(output).toContain("<resistor")
    expect(output).toContain("<capacitor")
    expect(output).toContain("<voltagesource")
    expect(output).toContain("<trace")
    expect(output).toContain("<voltageprobe")
    expect(output).toContain("<analogsimulation")
    expect(output).toContain("data-circuit-id=\"sim_")
  })

  it("generates a grounded source trace for the source-to-ground demo", () => {
    const output = generateTscircuitTsx(createDemoSourceToGroundProject())

    expect(output).toContain("<voltagesource")
    expect(output).toContain('schRotation={90}')
    expect(output).toContain('<trace from="net.GND" to=".V1 > .pin2" />')
    expect(output).toContain('<voltageprobe')
  })

  it("is deterministic for the same project document", () => {
    const project = createDemoRcLowPassProject()

    expect(generateTscircuitTsx(project)).toEqual(generateTscircuitTsx(project))
  })

  it("maps MVP schematic symbols to tscircuit primitives", () => {
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
      symbol("npn-transistor", "Q1", { beta: "100" }),
      symbol("pnp-transistor", "Q2", { beta: "80" }),
      symbol("n-mosfet", "M1", { thresholdVoltage: "2V" }),
      symbol("p-mosfet", "M2", { thresholdVoltage: "-2V" }),
      symbol("ideal-op-amp-minus-top", "U1", { gain: "100k" }),
      symbol("logic-input", "IN1", { position: "1" }),
      symbol("logic-output", "OUT1", { threshold: "2.5V" }),
      symbol("and-gate", "U2", { inputCount: "2" }),
      symbol("or-gate", "U3", { inputCount: "2" }),
      symbol("inverter", "U4", {}),
    ])

    const output = generateTscircuitTsx(project)

    expect(output).toContain('<resistor data-circuit-id="sym_r1"')
    expect(output).toContain('resistance="2.2k"')
    expect(output).toContain("<capacitor")
    expect(output).toContain('capacitance="47nF"')
    expect(output).toContain("<inductor")
    expect(output).toContain('inductance="10mH"')
    expect(output).toContain("<switch")
    expect(output).toContain('state="closed"')
    expect(output).toContain("<potentiometer")
    expect(output).toContain('wiper="0.35"')
    expect(output).toContain("<voltagesource")
    expect(output).toContain('voltage="9V"')
    expect(output).toContain('voltage="2V"')
    expect(output).toContain("<currentsource")
    expect(output).toContain('current="2mA"')
    expect(output).toContain("<diode")
    expect(output).toContain("<led")
    expect(output).toContain('<transistor data-circuit-id="sym_q1"')
    expect(output).toContain('type="npn"')
    expect(output).toContain('type="pnp"')
    expect(output).toContain("<mosfet")
    expect(output).toContain('channelType="n"')
    expect(output).toContain('channelType="p"')
    expect(output).toContain("<opamp")
    expect(output).toContain('inputOrder="minus-top"')
    expect(output).toContain("<logicinput")
    expect(output).toContain("<logicoutput")
    expect(output).toContain("<andgate")
    expect(output).toContain("<orgate")
    expect(output).toContain("<inverter")
  })

  it("exports non-cardinal schematic rotation", () => {
    const project = projectWithObjects([
      {
        ...symbol("resistor", "R1", { value: "1k" }),
        id: "sym_diag",
        position: { x: 30, y: 40 },
        rotation: 53.130102354,
        pinSpacing: 100,
      },
    ])

    expect(generateTscircuitTsx(project)).toContain(
      '<resistor data-circuit-id="sym_diag" name="R1" resistance="1k" schX={0.75} schY={1} schRotation={53.130102} />',
    )
  })

  it("exports probes connected to extracted nets", () => {
    const project = projectWithObjects([
      symbol("resistor", "R1", { value: "1k" }, { x: 40, y: 0 }),
      {
        kind: "wire",
        id: "wire_left",
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
      },
      {
        kind: "probe",
        id: "probe_left",
        probeType: "voltage",
        name: "VP_LEFT",
        position: { x: 0, y: 0 },
      },
      {
        kind: "probe",
        id: "probe_current",
        probeType: "current",
        name: "IP_LEFT",
        position: { x: 0, y: 0 },
      },
    ])

    const output = generateTscircuitTsx(project)

    expect(output).toContain(
      '<voltageprobe data-circuit-id="probe_left" name="VP_LEFT"',
    )
    expect(output).toContain(
      '<currentprobe data-circuit-id="probe_current" name="IP_LEFT"',
    )
  })

  it("exports visible schematic text and drawing annotations", () => {
    const project = projectWithObjects([
      {
        kind: "text",
        id: "text_note",
        text: "Scope note",
        position: { x: 80, y: -40 },
      },
      {
        kind: "line",
        id: "line_scope_marker",
        start: { x: 40, y: 80 },
        end: { x: 200, y: 120 },
      },
      {
        kind: "box",
        id: "box_note_frame",
        start: { x: -40, y: -80 },
        end: { x: 120, y: 40 },
      },
    ])

    const output = generateTscircuitTsx(project)

    expect(output).toContain(
      '<textnote data-circuit-id="text_note" text="Scope note" schX={2} schY={-1} />',
    )
    expect(output).toContain(
      '<visualline data-circuit-id="line_scope_marker" startX={1} startY={2} endX={5} endY={3} />',
    )
    expect(output).toContain(
      '<visualbox data-circuit-id="box_note_frame" startX={-1} startY={-2} endX={3} endY={1} />',
    )
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
  position = { x: 0, y: 0 },
): SymbolObject {
  return {
    kind: "symbol",
    id: `sym_${refdes.toLowerCase()}`,
    componentDefinitionId,
    symbolDefinitionId: symbolDefinitionIdFor(componentDefinitionId),
    refdes,
    position,
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
