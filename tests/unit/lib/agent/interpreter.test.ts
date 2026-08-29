import { describe, expect, it } from "vitest"
import { buildAgentWorkspace } from "@circuit-sim/core/agent/workspace"
import { interpretAgentCommand } from "@circuit-sim/core/agent/interpreter"
import { createVoltageDividerExample } from "@/examples/circuit-projects"
import { createIslandsFixture } from "../../../fixtures/circuit-projects"

const divider = buildAgentWorkspace(createVoltageDividerExample())
const islands = buildAgentWorkspace(createIslandsFixture())

describe("read_file", () => {
  it("reads a whole file with line numbers", () => {
    const output = interpretAgentCommand(
      "read_file path=/circuit.txt",
      { workspace: divider },
    )
    expect(output).toMatch(/^ *1  CIRCUIT "Voltage Divider Demo"$/m)
    expect(output).toMatch(/^ *6  R1 resistor R=10kOhm/m)
  })

  it("reads a bounded range and reports truncation", () => {
    const output = interpretAgentCommand(
      "read_file path=/circuit.txt start_line=1 line_count=2",
      { workspace: divider },
    )
    expect(output).toContain("[truncated:")
    expect(output.split("\n")).toHaveLength(3)
  })

  it("rejects unknown paths explicitly", () => {
    const output = interpretAgentCommand(
      "read_file path=/etc/passwd",
      { workspace: divider },
    )
    expect(output).toContain("ERROR: no such file: /etc/passwd")
    expect(output).toContain("/README.md /circuit.txt")
  })
})

describe("search_text", () => {
  it("finds literal matches with path:line: prefixes", () => {
    const output = interpretAgentCommand(
      'search_text pattern="R=10kOhm" path=/circuit.txt',
      { workspace: divider },
    )
    expect(output).toContain("/circuit.txt:6: R1 resistor R=10kOhm")
    expect(output).toContain("/circuit.txt:7: R2 resistor R=10kOhm")
  })

  it("supports regular expressions and case folding", () => {
    const output = interpretAgentCommand(
      'search_text pattern="v\\d+" regex=true ignore_case=true',
      { workspace: divider },
    )
    expect(output).toContain("V1")
  })

  it("reports no matches honestly", () => {
    const output = interpretAgentCommand(
      'search_text pattern="zzz" path=/circuit.txt',
      { workspace: divider },
    )
    expect(output).toContain("No matches")
  })

  it("truncates at the limit with an explicit message", () => {
    const output = interpretAgentCommand(
      'search_text pattern=" " path=/circuit.txt limit=2',
      { workspace: divider },
    )
    expect(output).toContain("[truncated: 2 match limit reached]")
  })
})

describe("circuit show", () => {
  it("summarizes the snapshot", () => {
    const output = interpretAgentCommand("circuit show", { workspace: divider })
    expect(output).toContain(`HASH ${divider.circuitHash}`)
    expect(output).toContain("COMPONENTS 3")
    expect(output).toContain("NETS 3")
    expect(output).toMatch(/  GND N001 VOUT/)
  })
})

describe("circuit component", () => {
  it("shows a component definition and terminal nets", () => {
    const output = interpretAgentCommand("circuit component R1", {
      workspace: divider,
    })
    expect(output).toBe(
      [
        "R1 resistor R=10kOhm [model=ideal]",
        "  1 -> N001",
        "  2 -> VOUT",
      ].join("\n"),
    )
  })

  it("names known components on failure", () => {
    const output = interpretAgentCommand("circuit component R9", {
      workspace: divider,
    })
    expect(output).toContain('ERROR: unknown component "R9"')
    expect(output).toContain("Components: R1 R2 V1")
  })
})

describe("circuit around", () => {
  it("lists the electrical neighborhood per terminal", () => {
    const output = interpretAgentCommand("circuit around R1", {
      workspace: divider,
    })
    expect(output).toContain("R1 resistor R=10kOhm [model=ideal]")
    expect(output).toContain("  1 -> N001")
    expect(output).toContain("  2 -> VOUT")
    expect(output).toContain("1 on R2 resistor R=10kOhm")
    expect(output).toContain("+ on V1 dc-voltage-source V=5V")
  })
})

describe("circuit net", () => {
  it("lists terminals on a net", () => {
    const output = interpretAgentCommand("circuit net VOUT", {
      workspace: divider,
    })
    expect(output).toBe(["NET VOUT", "  R1.2", "  R2.1"].join("\n"))
  })

  it("names known nets on failure", () => {
    const output = interpretAgentCommand("circuit net NOPE", {
      workspace: divider,
    })
    expect(output).toContain('ERROR: unknown net "NOPE"')
    expect(output).toContain("Nets: GND N001 VOUT")
  })
})

describe("circuit connected", () => {
  it("confirms direct same-net connection", () => {
    const output = interpretAgentCommand("circuit connected R1.2 R2.1", {
      workspace: divider,
    })
    expect(output).toBe("YES\nR1.2 and R2.1 are on VOUT.")
  })

  it("distinguishes no-same-net from an indirect path", () => {
    const output = interpretAgentCommand("circuit connected R1.1 R1.2", {
      workspace: divider,
    })
    expect(output).toContain("NO")
    expect(output).toContain("R1.1 is on N001. R1.2 is on VOUT.")
    expect(output).toContain("A path through components exists")
  })

  it("rejects malformed terminal references", () => {
    const output = interpretAgentCommand("circuit connected R1 R2", {
      workspace: divider,
    })
    expect(output).toContain("is not a terminal reference")
  })

  it("reports NC terminals as unconnected", () => {
    const output = interpretAgentCommand("circuit connected R3.1 R4.2", {
      workspace: islands,
    })
    expect(output).toContain("is not connected (NC)")
  })
})

describe("circuit path", () => {
  it("finds both series and direct-source paths", () => {
    const output = interpretAgentCommand("circuit path N001 GND", {
      workspace: divider,
    })
    expect(output).toContain("PATH 1")
    expect(output).toContain("N001 -> R1 -> VOUT -> R2 -> GND")
    expect(output).toContain("N001 -> V1 -> GND")
  })

  it("reports no path across disconnected regions", () => {
    const output = interpretAgentCommand("circuit path VIN N001", {
      workspace: islands,
    })
    expect(output).toContain("NO PATH")
    expect(output).toContain("disconnected regions")
  })
})

describe("circuit islands", () => {
  it("separates grounded and floating regions", () => {
    const output = interpretAgentCommand("circuit islands", {
      workspace: islands,
    })
    expect(output).toContain("REGION 1 grounded")
    expect(output).toContain("nets: GND VIN")
    expect(output).toContain("components: V1")
    expect(output).toContain("REGION 2")
    expect(output).toMatch(/nets: N001/)
    expect(output).toContain("components: R3 R4")
  })

  it("reports one region for a fully connected circuit", () => {
    const output = interpretAgentCommand("circuit islands", {
      workspace: divider,
    })
    expect(output).toContain("REGION 1 grounded")
    expect(output).not.toContain("REGION 2")
  })
})

describe("circuit help", () => {
  it("lists available commands", () => {
    const output = interpretAgentCommand("circuit help", { workspace: divider })
    expect(output).toContain("circuit component <refdes>")
    expect(output).toContain("search_text pattern=<text>")
  })

  it("documents a single command", () => {
    const output = interpretAgentCommand("circuit help path", {
      workspace: divider,
    })
    expect(output).toContain("alternating nets and components")
  })
})

describe("unknown commands", () => {
  it("are rejected with the available surface", () => {
    expect(interpretAgentCommand("bash ls", { workspace: divider })).toContain(
      'ERROR: unknown command "bash"',
    )
    expect(
      interpretAgentCommand("circuit simulate tran", { workspace: divider }),
    ).toContain("unknown circuit command")
  })
})
