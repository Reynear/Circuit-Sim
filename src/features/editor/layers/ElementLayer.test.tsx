import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"
import type {
  SchematicObject,
  SymbolObject,
  TextObject,
  WireObject,
} from "../../../lib/schematic/types"
import { ElementLayer } from "./ElementLayer"

describe("ElementLayer", () => {
  it("renders objects in CircuitProject order to match schematic elmList drawing", () => {
    const symbol = testResistor("sym_1")
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
    const objects: SchematicObject[] = [symbol, text, wire]

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
              onSymbolPointerDown={() => undefined}
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
      ).toEqual(["symbol-layer", "junction-layer", "wire-layer"])
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })
})

function testResistor(id: string): SymbolObject {
  return {
    kind: "symbol",
    id,
    componentDefinitionId: "resistor",
    symbolDefinitionId: "resistor",
    refdes: "R1",
    position: { x: 0, y: 0 },
    rotation: 0,
    props: { resistance: "1k" },
  }
}
