import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"
import type { WireObject } from "../../../lib/schematic/types"
import { WireEditLayer } from "./WireEditLayer"

describe("WireEditLayer", () => {
  it("shows only endpoint handles in schematic post mode", () => {
    const wire: WireObject = {
      kind: "wire",
      id: "wire_1",
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
      ],
    }

    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)

    try {
      act(() => {
        root.render(
          <svg>
            <WireEditLayer
              pointMode="post-endpoints"
              wires={[wire]}
              onPointPointerDown={() => undefined}
              onMidpointPointerDown={() => undefined}
            />
          </svg>,
        )
      })

      expect(
        container
          .querySelector(".wire-edit-layer")
          ?.classList.contains("post-mode"),
      ).toBe(true)
      expect(container.querySelectorAll(".wire-point-handle")).toHaveLength(2)
      expect(container.querySelectorAll(".wire-midpoint-handle")).toHaveLength(0)
      expect(
        Array.from(container.querySelectorAll(".wire-point-handle")).map((node) => ({
          cx: node.getAttribute("cx"),
          cy: node.getAttribute("cy"),
        })),
      ).toEqual([
        { cx: "0", cy: "0" },
        { cx: "40", cy: "40" },
      ])
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })
})
