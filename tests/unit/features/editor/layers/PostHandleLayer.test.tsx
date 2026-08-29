import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PostHandleLayer } from "@/features/editor/layers/PostHandleLayer"
import type { SchematicObject, Component } from "@circuit-sim/core/circuit/project"

describe("PostHandleLayer", () => {
  it("shows selected component primary handles as active square handles", () => {
    const component = resistor("sym_1")
    const { container } = render(
      <svg>
        <PostHandleLayer
          hoverObjectId={null}
          objects={[component]}
          selectedIds={[component.id]}
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
      },
      {
        kind: "line",
        id: "line_1",
        start: { x: 0, y: 60 },
        end: { x: 80, y: 60 },
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

    expect(container.querySelectorAll("[data-testid='post-handle']")).toHaveLength(7)
    expect(container.querySelectorAll(".post-handle.interactive")).toHaveLength(2)
  })

  it("enlarges the grabbed post handle", () => {
    const component = resistor("sym_1")
    const { container } = render(
      <svg>
        <PostHandleLayer
          grabbedPost={{ objectId: component.id, postIndex: 1 }}
          hoverObjectId={null}
          objects={[component]}
          selectedIds={[component.id]}
        />
      </svg>,
    )

    const grabbed = container.querySelector(".post-handle.grabbed")
    expect(grabbed).toHaveAttribute("width", "9")
    expect(grabbed).toHaveAttribute("height", "9")
  })
})

function resistor(id: string): Component {
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
