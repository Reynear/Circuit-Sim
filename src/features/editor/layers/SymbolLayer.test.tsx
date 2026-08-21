import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SymbolLayer } from "./SymbolLayer"
import type { CircuitMeasurementReport } from "../../../lib/simulation/measurements"
import type { SymbolObject } from "../../../lib/schematic/types"

describe("SymbolLayer", () => {
  it("renders refdes, value, pin leads, and MVP symbol body", () => {
    const resistor = symbol("sym_r1", "resistor", "R1", { value: "1k" })

    const { container } = render(
      <svg>
        <SymbolLayer
          symbols={[resistor]}
          selectedIds={[]}
          onSymbolPointerDown={vi.fn()}
        />
      </svg>,
    )

    expect(container.querySelector(".refdes")?.textContent).toBe("R1")
    expect(container.querySelector(".value")?.textContent).toBe("1k")
    expect(container.querySelectorAll(".pin-lead")).toHaveLength(2)
    expect(container.querySelector("path.symbol-body")).toBeTruthy()
  })

  it("terminates capacitor leads on the plates", () => {
    const capacitor = symbol("sym_c1", "capacitor", "C1", { value: "1uF" })

    const { container } = render(
      <svg>
        <SymbolLayer
          symbols={[capacitor]}
          selectedIds={[]}
          onSymbolPointerDown={vi.fn()}
        />
      </svg>,
    )

    const leads = Array.from(container.querySelectorAll(".pin-lead"))
    expect(leads.map((lead) => lead.getAttribute("x2"))).toEqual(["-10", "10"])
  })

  it("keeps labels horizontal while rotating the symbol body", () => {
    const source = symbol("sym_v1", "dc-voltage-source", "V1", { voltage: "5V" })
    source.symbolDefinitionId = "dc-source"
    source.rotation = 90

    const { container } = render(
      <svg>
        <SymbolLayer
          symbols={[source]}
          selectedIds={[]}
          onSymbolPointerDown={vi.fn()}
        />
      </svg>,
    )

    expect(container.querySelector(".symbol")).toHaveAttribute(
      "transform",
      "translate(0 0) rotate(90)",
    )
    expect(container.querySelector(".refdes")).not.toHaveAttribute("transform")
  })

  it("uses measurement colors unless the symbol is selected", () => {
    const resistor = symbol("sym_r1", "resistor", "R1", { value: "1k" })
    const measurements = {
      componentMeasurements: [
        {
          objectId: resistor.id,
          refdes: "R1",
          componentDefinitionId: "resistor",
          voltage: 5,
          current: 0.005,
          power: 0.025,
          label: "R1",
        },
      ],
    } as CircuitMeasurementReport

    const { container, rerender } = render(
      <svg>
        <SymbolLayer
          measurements={measurements}
          showPower
          symbols={[resistor]}
          selectedIds={[]}
          onSymbolPointerDown={vi.fn()}
        />
      </svg>,
    )

    expect(container.querySelector(".symbol")).toHaveAttribute(
      "style",
      "--symbol-dynamic-stroke: #f59e0b;",
    )

    rerender(
      <svg>
        <SymbolLayer
          measurements={measurements}
          showPower
          symbols={[resistor]}
          selectedIds={[resistor.id]}
          onSymbolPointerDown={vi.fn()}
        />
      </svg>,
    )

    expect(container.querySelector(".symbol")?.getAttribute("style")).not.toContain(
      "--symbol-dynamic-stroke",
    )
  })
})

function symbol(
  id: string,
  componentDefinitionId: string,
  refdes: string,
  props: Record<string, unknown>,
): SymbolObject {
  return {
    kind: "symbol",
    id,
    componentDefinitionId,
    symbolDefinitionId: componentDefinitionId,
    refdes,
    position: { x: 0, y: 0 },
    rotation: 0,
    props,
  }
}
