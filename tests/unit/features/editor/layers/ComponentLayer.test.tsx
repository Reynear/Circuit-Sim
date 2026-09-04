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
    const refdes = container.querySelector(".refdes")
    expect(refdes).not.toHaveAttribute("transform")
    expect(refdes).toHaveAttribute("text-anchor", "end")
    expect(Number(refdes?.getAttribute("x"))).toBeLessThan(0)
    for (const label of container.querySelectorAll(".symbol-label")) {
      expect(label.getAttribute("transform")).toMatch(/^rotate\(-90 /)
    }
  })

  it("renders a one-pin DC power gate without plus/minus source terminals", () => {
    const rail = component(
      "dc-power-rail",
      "VCC",
      { voltageVolts: 15 },
    )
    const { container } = renderLayer(rail)

    expect(container.querySelectorAll(".pin-lead")).toHaveLength(1)
    expect(container.querySelector(".dc-power-rail-glyph")).not.toBeNull()
    expect(container.querySelector(".dc-power-rail-glyph path"))
      .toHaveAttribute("d", "M -10 4 L 0 -14 L 10 4 Z")
    expect(container.querySelector(".refdes")?.textContent).toBe("VCC")
    expect(container.querySelector(".value")?.textContent).toBe("15")
  })

  it("renders a two-terminal PWM source with a distinct caption", () => {
    const pulse = component("pulse-voltage-source", "VPWM", {
      initialVoltageVolts: 0,
      pulsedVoltageVolts: 12,
      frequencyHertz: 20_000,
      dutyCyclePercent: 40,
      delaySeconds: 0,
      riseTimeSeconds: 50e-9,
      fallTimeSeconds: 50e-9,
    })
    const { container } = renderLayer(pulse)

    expect(container.querySelectorAll(".pin-lead")).toHaveLength(2)
    expect(container.querySelector(".pulse-source-waveform")).toHaveAttribute(
      "d",
      "M -13 6 H -6 V -7 H 6 V 6 H 13",
    )
    expect(container.querySelector("circle.symbol-body")).not.toBeNull()
    expect(container.querySelector(".value")?.textContent).toBe("0→12 20kHz 40%")
  })

  it("omits the internal default diode model name from the schematic caption", () => {
    const diode = component("diode", "D1", {
      model: "DDEFAULT",
      saturationCurrentAmps: 1e-14,
      emissionCoefficient: 1,
      seriesResistanceOhms: 0,
    })
    const { container } = renderLayer(diode)

    expect(container.querySelector(".refdes")?.textContent).toBe("D1")
    expect(container.querySelector(".value")?.textContent).toBe("")
  })

  it("renders distinct Zener and bipolar SVG symbols", () => {
    const zener = renderLayer(
      component("zener-diode", "DZ1", {
        breakdownVolts: 5.1,
        breakdownCurrentAmps: 0.001,
        saturationCurrentAmps: 1e-14,
        emissionCoefficient: 1,
        dynamicResistanceOhms: 10,
      }),
    )
    const npn = renderLayer(
      component("npn-transistor", "Q1", {
        beta: 100,
        earlyVoltageVolts: 100,
        saturationCurrentAmps: 1e-15,
        forwardEmissionCoefficient: 1,
      }),
    )
    const pnp = renderLayer(
      component("pnp-transistor", "Q2", {
        beta: 100,
        earlyVoltageVolts: 100,
        saturationCurrentAmps: 1e-15,
        forwardEmissionCoefficient: 1,
      }),
    )

    expect(
      Array.from(zener.container.querySelectorAll(".zener-diode-glyph path"))
        .some((path) => path.getAttribute("d")?.includes("L 16 -16")),
    ).toBe(true)
    expect(npn.container.querySelector(".bipolar-transistor-glyph.npn")).not.toBeNull()
    expect(pnp.container.querySelector(".bipolar-transistor-glyph.pnp")).not.toBeNull()
    expect(npn.container.querySelector(".transistor-outline")).toHaveAttribute("r", "30")
    expect(npn.container.querySelector(".transistor-body")).toHaveAttribute(
      "d",
      "M -24 0 H -12 M -12 -18 V 18 M -12 -12 L 24 -32 M -12 12 L 24 32",
    )
    expect(npn.container.querySelector(".transistor-arrow")).toHaveAttribute(
      "d",
      "M 7 28 L 20 30 L 12 20 Z",
    )
    expect(pnp.container.querySelector(".transistor-arrow")).toHaveAttribute(
      "d",
      "M 15 21 L 2 20 L 10 30 Z",
    )
  })

  it("renders distinct N-channel and P-channel MOSFET SVG symbols", () => {
    const nmos = renderLayer(
      component("n-mosfet", "M1", {
        thresholdVolts: 2,
        transconductanceAmpsPerVoltSquared: 0.05,
        channelLengthModulationPerVolt: 0.02,
      }),
    )
    const pmos = renderLayer(
      component("p-mosfet", "M2", {
        thresholdVolts: -2,
        transconductanceAmpsPerVoltSquared: 0.05,
        channelLengthModulationPerVolt: 0.02,
      }),
    )

    expect(nmos.container.querySelector(".mosfet-glyph.n-channel")).not.toBeNull()
    expect(pmos.container.querySelector(".mosfet-glyph.p-channel")).not.toBeNull()
    expect(pmos.container.querySelector(".mosfet-glyph.p-channel circle")).not.toBeNull()
  })

  it("renders the canonical ideal op amp SVG symbol", () => {
    const opAmp = renderLayer(
      component("ideal-op-amp-minus-top", "U1", {
        gain: 100_000,
        minOutputVolts: -10,
        maxOutputVolts: 10,
      }),
    )

    expect(opAmp.container.querySelector(".ideal-op-amp-glyph")).not.toBeNull()
    expect(opAmp.container.querySelector(".ideal-op-amp-glyph path")?.getAttribute("d"))
      .toContain("L 42 0 Z")
    expect(opAmp.container.querySelector(".ideal-op-amp-glyph")?.textContent)
      .toBe("-+")
  })

  it("renders distinct referenced logic SVG symbols", () => {
    const input = renderLayer(component("logic-input", "IN1", {
      position: 1,
      highLogicVoltageVolts: 5,
      lowLogicVoltageVolts: 0,
      ternary: false,
      momentary: false,
    }))
    const output = renderLayer(component("logic-output", "OUT1", {
      thresholdVolts: 2.5,
      currentRequiredAmps: 0.0001,
    }))
    const and = renderLayer(component("and-gate", "U1", {
      inputCount: 2,
      highLogicVoltageVolts: 5,
    }))
    const or = renderLayer(component("or-gate", "U2", {
      inputCount: 2,
      highLogicVoltageVolts: 5,
    }))
    const inverter = renderLayer(component("inverter", "U3", {
      highLogicVoltageVolts: 5,
    }))

    expect(input.container.querySelector(".logic-input-glyph")?.textContent).toBe("1")
    expect(output.container.querySelector(".logic-output-glyph")?.textContent).toBe("OUT")
    expect(and.container.querySelector(".logic-gate-glyph.and")?.textContent).toBe("&")
    expect(or.container.querySelector(".logic-gate-glyph.or")?.textContent).toBe(">=1")
    expect(inverter.container.querySelector(".inverter-glyph circle")).not.toBeNull()
    expect(and.container.querySelectorAll(".pin-lead")).toHaveLength(4)
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
