import { serializeSchematicSvg } from "./svg-export"

describe("svg-export", () => {
  it("serializes the schematic canvas as standalone SVG", () => {
    document.body.innerHTML = `
      <svg class="schematic-canvas" data-testid="canvas">
        <g transform="translate(10 20) scale(1.5)">
          <g class="grid-layer"><line x1="0" y1="0" x2="100" y2="0" /></g>
          <g class="element-layer">
            <polyline class="wire" points="0,0 40,0 40,40" style="stroke: #00ffff; fill: none" />
          </g>
          <g class="selection-layer"><rect x="0" y="0" width="20" height="20" /></g>
          <g class="cursor-guide-layer"><circle cx="5" cy="5" r="3" /></g>
          <polyline data-testid="wire-hit-area" points="0,0 40,0" />
          <rect class="annotation-hit-area" x="20" y="20" width="30" height="20" />
        </g>
      </svg>
    `
    const svg = document.querySelector("svg") as SVGSVGElement
    svg.getBoundingClientRect = () =>
      ({
        bottom: 480,
        height: 480,
        left: 0,
        right: 640,
        top: 0,
        width: 640,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect

    const exported = serializeSchematicSvg(svg, { title: "Voltage Divider Demo" })

    expect(exported).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(exported).toContain('<title>Voltage Divider Demo</title>')
    expect(exported).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(exported).toContain('width="640"')
    expect(exported).toContain('height="480"')
    expect(exported).toContain('viewBox="0 0 640 480"')
    expect(exported).toContain("polyline")
    expect(exported).not.toContain("selection-layer")
    expect(exported).not.toContain("cursor-guide-layer")
    expect(exported).not.toContain("wire-hit-area")
    expect(exported).not.toContain("annotation-hit-area")
    expect(exported).not.toContain("data-testid")
  })
})
