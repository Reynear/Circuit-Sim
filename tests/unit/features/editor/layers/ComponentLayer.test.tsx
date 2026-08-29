import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { newId } from "@circuit-sim/core/ids"
import type { RunObservationReport } from "@circuit-sim/core/simulation/run-observations"
import { makeComponent, type Component } from "@circuit-sim/core/circuit/project"
import { ComponentLayer } from "@/features/editor/layers/ComponentLayer"

describe("ComponentLayer", () => {
  it("renders refdes, value, pin leads, and component body", () => {
    const resistor = component("resistor", "R1", { resistanceOhms: 1_000 })
    const { container } = renderLayer(resistor)

    expect(container.querySelector(".refdes")?.textContent).toBe("R1")
    expect(container.querySelector(".value")?.textContent).toBe("1k")
    expect(container.querySelectorAll(".pin-lead")).toHaveLength(2)
    expect(container.querySelector("path.symbol-body")).toBeTruthy()
  })

  it("keeps capacitor terminals and body at a fixed size", () => {
    const capacitor = component("capacitor", "C1", { capacitanceFarads: 1e-6 })
    const { container } = renderLayer(capacitor)

    const leads = Array.from(container.querySelectorAll(".pin-lead"))
    expect(leads.map((lead) => lead.getAttribute("x1"))).toEqual(["-40", "40"])
    expect(container.querySelectorAll("line.symbol-body")).toHaveLength(2)
  })

  it("keeps labels horizontal while rotating the body", () => {
    const source = component(
      "dc-voltage-source",
      "V1",
      { voltageVolts: 5 },
      90,
    )
    const { container } = renderLayer(source)

    expect(container.querySelector(".component > g")).toHaveAttribute(
      "transform",
      "translate(0 0) rotate(90)",
    )
    expect(container.querySelector(".refdes")).not.toHaveAttribute("transform")
  })

  it("uses measurement colors unless selected", () => {
    const resistor = component("resistor", "R1", { resistanceOhms: 1_000 })
    const measurements = {
      componentMeasurements: [
        {
          objectId: resistor.id,
          refdes: "R1",
          type: "resistor",
          voltage: 5,
          current: 0.005,
          power: 0.025,
          label: "R1",
        },
      ],
    } as unknown as RunObservationReport

    const { container, rerender } = render(
      <svg>
        <ComponentLayer
          measurements={measurements}
          showPower
          components={[resistor]}
          selectedIds={[]}
          onComponentPointerDown={vi.fn()}
        />
      </svg>,
    )
    expect(container.querySelector(".component")).toHaveAttribute(
      "style",
      "--symbol-dynamic-stroke: #f59e0b;",
    )

    rerender(
      <svg>
        <ComponentLayer
          measurements={measurements}
          showPower
          components={[resistor]}
          selectedIds={[resistor.id]}
          onComponentPointerDown={vi.fn()}
        />
      </svg>,
    )
    expect(container.querySelector(".component")?.getAttribute("style")).not.toContain(
      "--symbol-dynamic-stroke",
    )
  })
})

function renderLayer(component: Component) {
  return render(
    <svg>
      <ComponentLayer
        components={[component]}
        selectedIds={[]}
        onComponentPointerDown={vi.fn()}
      />
    </svg>,
  )
}

function component(
  type: string,
  refdes: string,
  props: unknown,
  rotation: Component["rotation"] = 0,
): Component {
  return makeComponent({
    kind: "component",
    id: newId(),
    type,
    refdes,
    position: { x: 0, y: 0 },
    rotation,
    flipped: false,
    props,
  })
}
