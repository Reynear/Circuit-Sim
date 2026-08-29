import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"
import type { Component } from "@circuit-sim/core/circuit/project"
import { PinLayer } from "@/features/editor/layers/PinLayer"

describe("PinLayer", () => {
  it("keeps drag-post hit targets to primary component posts", () => {
    const opAmp = testOpAmp("sym_1")
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)

    try {
      act(() => {
        root.render(
          <svg>
            <PinLayer
              interactive
              pinMode="primary-posts"
              components={[opAmp]}
              onPinPointerDown={() => undefined}
            />
          </svg>,
        )
      })

      expect(
        Array.from(container.querySelectorAll(".pin")).map((node) => ({
          cx: node.getAttribute("cx"),
          cy: node.getAttribute("cy"),
        })),
      ).toEqual([
        { cx: "-48", cy: "-18" },
        { cx: "0", cy: "40" },
      ])

      act(() => {
        root.render(
          <svg>
            <PinLayer
              interactive
              components={[opAmp]}
              onPinPointerDown={() => undefined}
            />
          </svg>,
        )
      })

      expect(container.querySelectorAll(".pin")).toHaveLength(5)
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })
})

function testOpAmp(id: string): Component {
  return {
    kind: "component",
    id,
    type: "ideal-op-amp-minus-top",
    refdes: "U1",
    position: { x: 0, y: 0 },
    rotation: 0,
    flipped: false,
    props: { maxOutputVolts: 15, minOutputVolts: -15, gain: 100_000 },
  }
}
