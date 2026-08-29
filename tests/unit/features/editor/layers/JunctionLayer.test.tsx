import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { JunctionLayer } from "@/features/editor/layers/JunctionLayer"

describe("annotation rendering", () => {
  it("renders fixed annotation glyphs from their connection position", () => {
    const { container } = render(
      <svg>
        <JunctionLayer
          objects={[
            { kind: "ground", id: "ground", position: { x: 20, y: 40 }, netName: "GND" },
            { kind: "net-label", id: "label", position: { x: 80, y: 40 }, text: "BUS" },
            { kind: "probe", id: "probe", position: { x: 160, y: 40 }, probeType: "voltage", name: "VP1" },
          ]}
          selectedIds={[]}
          onObjectPointerDown={() => {}}
        />
      </svg>,
    )

    expect(container.querySelectorAll(".junction")).toHaveLength(3)
    expect(container.querySelectorAll(".annotation-lead")).toHaveLength(3)
    expect(container.querySelector(".junction")?.getAttribute("transform")).toBe("translate(20 40)")
  })
})
