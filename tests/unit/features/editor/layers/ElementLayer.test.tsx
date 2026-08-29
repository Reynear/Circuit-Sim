import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"
import type {
  SchematicObject,
  Component,
  TextObject,
  WireObject,
} from "@circuit-sim/core/circuit/project"
import { ElementLayer } from "@/features/editor/layers/ElementLayer"

describe("ElementLayer", () => {
  it("renders committed content in direct drawing layers", () => {
    const component = testResistor("sym_1")
    const text: TextObject = {
      kind: "text",
      id: "text_1",
      text: "note",
      position: { x: 0, y: 30 },
    }
    const wire: WireObject = {
      kind: "wire",
      id: "wire_1",
      points: [
        { x: -40, y: 0 },
        { x: 40, y: 0 },
      ],
    }
    const objects: SchematicObject[] = [component, text, wire]

    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)

    try {
      act(() => {
        root.render(
          <svg>
            <ElementLayer
              objects={objects}
              selectedIds={[]}
              measurements={null}
              onObjectPointerDown={() => undefined}
              onObjectDoubleClick={() => undefined}
              onComponentPointerDown={() => undefined}
              onWirePointerDown={() => undefined}
              onPointerEnterObject={() => undefined}
              onPointerLeaveObject={() => undefined}
            />
          </svg>,
        )
      })

      const elementLayer = container.querySelector(".element-layer")
      expect(elementLayer).not.toBeNull()
      expect(
        Array.from(elementLayer?.children ?? []).map((child) =>
          child.getAttribute("class"),
        ),
      ).toEqual(["wire-layer", "connection-dots", "component-layer", "junction-layer"])
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })
})

function testResistor(id: string): Component {
  return {
    kind: "component",
    id,
    type: "resistor",
    refdes: "R1",
    position: { x: 0, y: 0 },
    rotation: 0,
    flipped: false,
    props: { resistanceOhms: 1_000 },
  }
}
