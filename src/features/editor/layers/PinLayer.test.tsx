import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"
import type { SymbolObject } from "../../../lib/schematic/types"
import { PinLayer } from "./PinLayer"

describe("PinLayer", () => {
  it("keeps drag-post hit targets to primary symbol posts", () => {
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
              symbols={[opAmp]}
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
        { cx: "-48", cy: "0" },
        { cx: "56", cy: "0" },
      ])

      act(() => {
        root.render(
          <svg>
            <PinLayer
              interactive
              symbols={[opAmp]}
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

function testOpAmp(id: string): SymbolObject {
  return {
    kind: "symbol",
    id,
    componentDefinitionId: "ideal-op-amp-minus-top",
    symbolDefinitionId: "ideal-op-amp-minus-top",
    refdes: "U1",
    position: { x: 0, y: 0 },
    rotation: 0,
    props: {},
  }
}
