import { parseNgspiceAsciiRawOutput } from "./ngspice-output"
import type { SpiceTraceBinding } from "./spice-netlist"

describe("ngspice raw output parser", () => {
  it("parses ASCII raw voltage and current traces with bindings", () => {
    const bindings: SpiceTraceBinding[] = [
      {
        expression: "V(OUT)",
        metric: "voltage",
        unit: "V",
        targetId: "OUT",
        targetName: "V(OUT)",
      },
      {
        expression: "@r1[i]",
        metric: "current",
        unit: "A",
        targetId: "sym_r1",
        targetName: "R1",
      },
    ]
    const parsed = parseNgspiceAsciiRawOutput(
      `Title: demo
Plotname: Transient Analysis
Flags: real
No. Variables: 3
No. Points: 2
Variables:
  0 time time
  1 v(out) voltage
  2 i(@r1[i]) current
Values:
0 0
  1
  0.001
1 0.001
  2
  0.002
`,
      bindings,
    )

    expect(parsed.errors).toEqual([])
    expect(parsed.traces).toHaveLength(2)
    expect(parsed.traces[0]).toMatchObject({
      metric: "voltage",
      targetId: "OUT",
    })
    expect(parsed.traces[1]).toMatchObject({
      metric: "current",
      targetId: "sym_r1",
    })
    expect(parsed.traces[1]?.points[1]).toEqual({ t: 0.001, v: 0.002 })
  })

  it("parses Fortran D exponent values from ngspice raw output", () => {
    const parsed = parseNgspiceAsciiRawOutput(`Title: demo
Plotname: Transient Analysis
Flags: real
No. Variables: 2
No. Points: 2
Variables:
  0 time time
  1 v(out) voltage
Values:
0 0
  1.5D+00
1 1.0D-03
  2.5D+00
`)

    expect(parsed.errors).toEqual([])
    expect(parsed.traces[0]?.points).toEqual([
      { t: 0, v: 1.5 },
      { t: 0.001, v: 2.5 },
    ])
  })

  it("surfaces unsupported raw output formats instead of silently parsing nothing", () => {
    const binary = parseNgspiceAsciiRawOutput(`Title: demo
Flags: real binary
No. Variables: 2
No. Points: 1
`)
    const complex = parseNgspiceAsciiRawOutput(`Title: demo
Flags: complex
No. Variables: 2
No. Points: 1
`)

    expect(binary.errors.join("\n")).toContain("Binary ngspice raw output")
    expect(complex.errors.join("\n")).toContain("Complex ngspice raw output")
  })
})
