const transientLayerSelectors = [
  ".cursor-guide-layer",
  ".selection-layer",
  ".wire-edit-layer",
  ".post-handle-layer",
  ".creation-preview-layer",
  ".post-layer",
  "[data-testid='wire-hit-area']",
  ".annotation-hit-area",
]

const copiedStyleProperties = [
  "color",
  "display",
  "dominant-baseline",
  "fill",
  "fill-opacity",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "opacity",
  "stroke",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "stroke-width",
  "text-anchor",
  "visibility",
  "vector-effect",
]

export type SchematicSvgExportOptions = {
  title?: string
}

export function serializeSchematicSvg(
  sourceSvg: SVGSVGElement,
  options: SchematicSvgExportOptions = {},
): string {
  const clone = sourceSvg.ownerDocument.importNode(sourceSvg, true)
  const { width, height } = dimensionsForSvg(sourceSvg)

  inlineComputedStyles(sourceSvg, clone)
  removeTransientLayers(clone)
  stripEditorAttributes(clone)

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  clone.setAttribute("width", String(width))
  clone.setAttribute("height", String(height))
  clone.setAttribute("viewBox", `0 0 ${width} ${height}`)
  clone.setAttribute("role", "img")

  if (options.title) {
    const title = clone.ownerDocument.createElementNS(
      "http://www.w3.org/2000/svg",
      "title",
    )
    title.textContent = options.title
    clone.insertBefore(title, clone.firstChild)
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`
}

function dimensionsForSvg(svg: SVGSVGElement): { width: number; height: number } {
  const rect = svg.getBoundingClientRect()
  const width =
    roundDimension(rect.width) ??
    roundDimension(svg.clientWidth) ??
    roundDimension(Number(svg.getAttribute("width"))) ??
    1200
  const height =
    roundDimension(rect.height) ??
    roundDimension(svg.clientHeight) ??
    roundDimension(Number(svg.getAttribute("height"))) ??
    800
  return { width, height }
}

function roundDimension(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

function inlineComputedStyles(source: SVGSVGElement, clone: SVGSVGElement): void {
  const sourceElements = [source, ...Array.from(source.querySelectorAll("*"))]
  const cloneElements = [clone, ...Array.from(clone.querySelectorAll("*"))]
  const view = source.ownerDocument.defaultView
  if (!view) {
    return
  }

  sourceElements.forEach((sourceElement, index) => {
    const cloneElement = cloneElements[index]
    if (!(cloneElement instanceof Element)) {
      return
    }
    const computed = view.getComputedStyle(sourceElement)
    const declarations = copiedStyleProperties
      .map((property) => [property, computed.getPropertyValue(property)] as const)
      .filter(([, value]) => value.trim().length > 0)
      .map(([property, value]) => `${property}: ${value.trim()}`)

    if (declarations.length > 0) {
      cloneElement.setAttribute("style", declarations.join("; "))
    }
  })
}

function removeTransientLayers(svg: SVGSVGElement): void {
  for (const selector of transientLayerSelectors) {
    svg.querySelectorAll(selector).forEach((node) => node.remove())
  }
}

function stripEditorAttributes(svg: SVGSVGElement): void {
  const elements = [svg, ...Array.from(svg.querySelectorAll("*"))]
  for (const element of elements) {
    for (const attribute of Array.from(element.attributes)) {
      if (
        attribute.name.startsWith("data-") ||
        attribute.name.startsWith("aria-")
      ) {
        element.removeAttribute(attribute.name)
      }
    }
  }
}
