import { createRoot } from "react-dom/client"
import { act } from "react"
import { CreationPreviewLayer } from "./CreationPreviewLayer"

describe("CreationPreviewLayer", () => {
  it("renders an MVP symbol preview with handle posts", () => {
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)

    try {
      act(() => {
        root.render(
          <svg>
            <CreationPreviewLayer
              symbolPreview={{
                componentDefinitionId: "resistor",
                placement: {
                  position: { x: 80, y: 80 },
                  rotation: 0,
                  pinSpacing: 80,
                },
              }}
            />
          </svg>,
        )
      })

      expect(container.querySelector(".symbol")).not.toBeNull()
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
              symbolPreview={null}
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
