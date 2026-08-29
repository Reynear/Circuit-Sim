import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"
import type { ElectricalIssue } from "@circuit-sim/core/circuit/erc"
import { BadConnectionLayer } from "@/features/editor/layers/OverlayLayer"

describe("BadConnectionLayer", () => {
  it("uses schematic's 7px bad-connection marker geometry", () => {
    const issue: ElectricalIssue = {
      id: "erc_bad_connection",
      severity: "error",
      message: "Bad connection",
      positions: [{ x: 120, y: 80 }],
    }
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)

    try {
      act(() => {
        root.render(
          <svg>
            <BadConnectionLayer issues={[issue]} />
          </svg>,
        )
      })

      const marker = container.querySelector(".bad-connection-dot")
      expect(marker?.tagName.toLowerCase()).toBe("ellipse")
      expect(marker?.getAttribute("cx")).toBe("120.5")
      expect(marker?.getAttribute("cy")).toBe("80.5")
      expect(marker?.getAttribute("rx")).toBe("3.5")
      expect(marker?.getAttribute("ry")).toBe("3.5")
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })
})
