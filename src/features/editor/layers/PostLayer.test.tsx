import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"
import type { WireObject } from "../../../lib/schematic/types"
import { PostLayer } from "./PostLayer"

describe("PostLayer", () => {
  it("draws schematic post dots with fillOval geometry", () => {
    const wire: WireObject = {
      kind: "wire",
      id: "wire_1",
      points: [
        { x: 20, y: 40 },
        { x: 80, y: 40 },
      ],
    }
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)

    try {
      act(() => {
        root.render(
          <svg>
            <PostLayer objects={[wire]} />
          </svg>,
        )
      })

      const post = container.querySelector(".wire-post")
      expect(post?.tagName.toLowerCase()).toBe("ellipse")
      expect(post).toHaveAttribute("cx", "20.5")
      expect(post).toHaveAttribute("cy", "40.5")
      expect(post).toHaveAttribute("rx", "3.5")
      expect(post).toHaveAttribute("ry", "3.5")
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })
})
