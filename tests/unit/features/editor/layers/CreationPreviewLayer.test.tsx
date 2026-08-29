import { createRoot } from "react-dom/client"
import { act } from "react"
import { CreationPreviewLayer } from "@/features/editor/layers/CreationPreviewLayer"

describe("CreationPreviewLayer", () => {
  it("renders an MVP component preview with handle posts", () => {
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)

    try {
      act(() => {
        root.render(
          <svg>
            <CreationPreviewLayer
              componentPreview={{
                type: "resistor",
                start: { x: 40, y: 80 },
                end: { x: 120, y: 80 },
              }}
            />
          </svg>,
        )
      })

      expect(container.querySelector(".component")).not.toBeNull()
      expect(container.querySelectorAll("[data-testid='creation-preview-post']")).toHaveLength(2)
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })

  it("renders text annotation previews", () => {
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)

    try {
      act(() => {
        root.render(
          <svg>
            <CreationPreviewLayer
              annotationPreview={{
                kind: "text",
                start: { x: 0, y: 0 },
                current: { x: 20, y: 20 },
              }}
              componentPreview={null}
            />
          </svg>,
        )
      })

      expect(container.querySelector(".schematic-text-note")?.textContent).toBe(
        "hello",
      )
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })
})
