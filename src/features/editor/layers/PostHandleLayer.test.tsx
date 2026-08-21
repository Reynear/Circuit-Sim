import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PostHandleLayer } from "./PostHandleLayer"
import type { SchematicObject, SymbolObject } from "../../../lib/schematic/types"

describe("PostHandleLayer", () => {
  it("shows selected symbol primary handles as active square handles", () => {
    const symbol = resistor("sym_1")
    const { container } = render(
      <svg>
        <PostHandleLayer
          hoverObjectId={null}
          objects={[symbol]}
          selectedIds={[symbol.id]}
        />
      </svg>,
    )

    const handles = Array.from(container.querySelectorAll("[data-testid='post-handle']"))
    expect(handles).toHaveLength(2)
    expect(handles.map((handle) => handle.tagName.toLowerCase())).toEqual([
      "rect",
      "rect",
    ])
    expect(handles[0]).toHaveAttribute("x", "-43")
    expect(handles[1]).toHaveAttribute("x", "37")
  })

  it("shows all object posts in drag-post mode and only direct handles are interactive", () => {
    const onPostPointerDown = vi.fn()
    const objects: SchematicObject[] = [
      resistor("sym_1"),
      {
        kind: "wire",
        id: "wire_1",
        points: [
          { x: -40, y: 0 },
          { x: -80, y: 0 },
          { x: -80, y: 40 },
        ],
      },
      {
        kind: "probe",
        id: "probe_1",
        probeType: "voltage",
        name: "VP1",
        position: { x: 20, y: 20 },
        leadEnd: { x: 40, y: 20 },
      },
    ]

    const { container } = render(
      <svg>
        <PostHandleLayer
          hoverObjectId={null}
          objects={objects}
          onPostPointerDown={onPostPointerDown}
          selectedIds={[]}
          showAllPosts
        />
      </svg>,
    )

    expect(container.querySelectorAll("[data-testid='post-handle']")).toHaveLength(6)
    expect(container.querySelectorAll(".post-handle.interactive")).toHaveLength(2)
  })

  it("enlarges the grabbed post handle", () => {
    const symbol = resistor("sym_1")
    const { container } = render(
      <svg>
        <PostHandleLayer
          grabbedPost={{ objectId: symbol.id, postIndex: 1 }}
          hoverObjectId={null}
          objects={[symbol]}
          selectedIds={[symbol.id]}
        />
      </svg>,
    )

    const grabbed = container.querySelector(".post-handle.grabbed")
    expect(grabbed).toHaveAttribute("width", "9")
    expect(grabbed).toHaveAttribute("height", "9")
  })
})

function resistor(id: string): SymbolObject {
  return {
    kind: "symbol",
    id,
    componentDefinitionId: "resistor",
    symbolDefinitionId: "resistor",
    refdes: "R1",
    position: { x: 0, y: 0 },
    rotation: 0,
    props: { value: "1k" },
  }
}
