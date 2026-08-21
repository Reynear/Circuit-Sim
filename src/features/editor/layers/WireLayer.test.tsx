import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { CircuitMeasurementReport } from "../../../lib/simulation/measurements"
import type { WireObject } from "../../../lib/schematic/types"
import { WireLayer } from "./WireLayer"

describe("WireLayer", () => {
  it("colors measured wires by net voltage", () => {
    const wire = testWire("wire_1")
    const measurements = {
      netlist: {
        objectToNetId: { [wire.id]: "net_1" },
      },
      netVoltages: [{ netId: "net_1", name: "VIN", voltage: 5 }],
    } as CircuitMeasurementReport

    const { container } = render(
      <svg>
        <WireLayer
          measurements={measurements}
          selectedIds={[]}
          wires={[wire]}
          onWirePointerDown={vi.fn()}
        />
      </svg>,
    )

    expect(container.querySelector(".wire")?.getAttribute("style")).toContain(
      "stroke:",
    )
  })
})

function testWire(id: string): WireObject {
  return {
    kind: "wire",
    id,
    points: [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ],
  }
}
