import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"
import { RoutedWireSnapLayer } from "@/features/editor/layers/OverlayLayer"

describe("RoutedWireSnapLayer", () => {
  it("draws the schematic routed-wire snap point as a 9px oval", () => {
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)

    try {
      act(() => {
        root.render(
          <svg>
            <RoutedWireSnapLayer point={{ x: 80, y: 120 }} />
          </svg>,
        )
      })

      const marker = container.querySelector(".routed-wire-snap-point")
      expect(marker?.tagName.toLowerCase()).toBe("ellipse")
      expect(marker).toHaveAttribute("cx", "80.5")
      expect(marker).toHaveAttribute("cy", "120.5")
      expect(marker).toHaveAttribute("rx", "4.5")
      expect(marker).toHaveAttribute(
        "ry",
        "4.5",
      )
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })
})
