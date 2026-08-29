import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"
import { CursorGuideLayer } from "@/features/editor/layers/OverlayLayer"

describe("CursorGuideLayer", () => {
  it("does not draw non-schematic cursor markers by default", () => {
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)

    try {
      act(() => {
        root.render(
          <svg>
            <CursorGuideLayer
              bounds={{ left: 0, top: 0, right: 300, bottom: 200 }}
              cursor={{ x: 100, y: 80 }}
              snapPoint={{ x: 100, y: 80 }}
            />
          </svg>,
        )
      })

      expect(container.querySelector(".cursor-guide-layer")).toBeNull()
      expect(container.querySelector(".grid-cell-highlight")).toBeNull()
      expect(container.querySelector(".snap-point")).toBeNull()
      expect(container.querySelector(".cursor-tool-preview")).toBeNull()
      expect(container.querySelectorAll("[data-testid='cursor-crosshair']")).toHaveLength(0)
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })

  it("draws only crosshair lines when the schematic crosshair option is enabled", () => {
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)

    try {
      act(() => {
        root.render(
          <svg>
            <CursorGuideLayer
              bounds={{ left: 0, top: 0, right: 300, bottom: 200 }}
              cursor={{ x: 100, y: 80 }}
              showCrossHairs
              snapPoint={{ x: 100, y: 80 }}
            />
          </svg>,
        )
      })

      expect(container.querySelector(".cursor-guide-layer")).not.toBeNull()
      expect(container.querySelectorAll("[data-testid='cursor-crosshair']")).toHaveLength(2)
      expect(container.querySelector(".grid-cell-highlight")).toBeNull()
      expect(container.querySelector(".snap-point")).toBeNull()
      expect(container.querySelector(".cursor-tool-preview")).toBeNull()
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })
})
