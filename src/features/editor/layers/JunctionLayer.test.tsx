import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it } from "vitest"
import type {
  GroundObject,
  NetLabelObject,
  ProbeObject,
  TextObject,
} from "../../../lib/schematic/types"
import { JunctionLayer } from "./JunctionLayer"

describe("JunctionLayer", () => {
  it("orients ground bars from the post-to-body lead vector", () => {
    const ground: GroundObject = {
      kind: "ground",
      id: "junc_ground_horizontal",
      position: { x: 100, y: 120 },
      leadEnd: { x: 160, y: 120 },
      netName: "GND",
    }
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)

    try {
      act(() => {
        root.render(
          <svg>
            <JunctionLayer
              objects={[ground]}
              selectedIds={[]}
              onObjectPointerDown={() => undefined}
            />
          </svg>,
        )
      })

      expect(container.querySelector(".junction")?.getAttribute("transform")).toBe(
        "translate(100 120)",
      )
      expect(
        container.querySelector('[data-testid="annotation-lead-body"]')?.getAttribute(
          "transform",
        ),
      ).toBe("translate(60 0)")
      expect(
        attributes(container.querySelector(".annotation-lead"), [
          "x1",
          "y1",
          "x2",
          "y2",
        ]),
      ).toEqual({ x1: "0", y1: "0", x2: "60", y2: "0" })
      expect(
        Array.from(container.querySelectorAll(".ground-bar")).map((bar) =>
          attributes(bar, ["x1", "y1", "x2", "y2"]),
        ),
      ).toEqual([
        { x1: "0", y1: "-10", x2: "0", y2: "10" },
        { x1: "5", y1: "-6", x2: "5", y2: "6" },
        { x1: "10", y1: "-2", x2: "10", y2: "2" },
      ])
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })

  it("renders invisible hit targets for lead annotation bodies", () => {
    const label: NetLabelObject = {
      kind: "net-label",
      id: "label_hit",
      text: "BUS",
      position: { x: 20, y: 30 },
      leadEnd: { x: 60, y: 30 },
    }
    const probe: ProbeObject = {
      kind: "probe",
      id: "probe_hit",
      probeType: "voltage",
      name: "VP1",
      position: { x: 100, y: 80 },
      leadEnd: { x: 140, y: 80 },
    }
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)

    try {
      act(() => {
        root.render(
          <svg>
            <JunctionLayer
              objects={[label, probe]}
              selectedIds={[]}
              onObjectPointerDown={() => undefined}
            />
          </svg>,
        )
      })

      const annotationGroups = Array.from(
        container.querySelectorAll(".annotation-hit-targets"),
      )
      expect(annotationGroups).toHaveLength(2)
      expect(
        attributes(annotationGroups[0]?.querySelector("line") ?? null, [
          "x1",
          "y1",
          "x2",
          "y2",
        ]),
      ).toEqual({ x1: "0", y1: "0", x2: "40", y2: "0" })
      expect(
        attributes(annotationGroups[0]?.querySelector("rect") ?? null, [
          "x",
          "y",
          "width",
          "height",
        ]),
      ).toEqual({ x: "40", y: "-7", width: "54", height: "14" })
      expect(
        Array.from(annotationGroups[1]?.querySelectorAll("rect") ?? []).map((rect) =>
          attributes(rect, ["x", "y", "width", "height"]),
        ),
      ).toEqual([
        { x: "29", y: "-11", width: "22", height: "22" },
        { x: "16", y: "16", width: "48", height: "16" },
      ])
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })

  it("renders schematic TextElm notes at baseline size with multiline tspans", () => {
    const text: TextObject = {
      kind: "text",
      id: "text_schematic_note",
      text: "one\ntwo",
      fontSize: 24,
      position: { x: 20, y: 30 },
    }
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)

    try {
      act(() => {
        root.render(
          <svg>
            <JunctionLayer
              objects={[text]}
              selectedIds={[]}
              onObjectPointerDown={() => undefined}
            />
          </svg>,
        )
      })

      const textElement = container.querySelector(".schematic-text-note")
      expect(textElement?.getAttribute("x")).toBe("0")
      expect(textElement?.getAttribute("y")).toBe("0")
      expect(textElement?.getAttribute("style")).toContain("font-size: 24px")
      expect(
        Array.from(container.querySelectorAll("tspan")).map((line) => ({
          text: line.textContent,
          x: line.getAttribute("x"),
          y: line.getAttribute("y"),
        })),
      ).toEqual([
        { text: "one", x: "0", y: "0" },
        { text: "two", x: "0", y: "27" },
      ])
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })
})

function attributes(element: Element | null, names: string[]) {
  if (!element) {
    throw new Error("Missing SVG element")
  }
  return Object.fromEntries(
    names.map((name) => [name, element.getAttribute(name)]),
  )
}
