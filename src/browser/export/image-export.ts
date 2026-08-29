import { serializeSchematicSvg, type SchematicSvgExportOptions } from "./svg-export"

export type SchematicPngExportOptions = SchematicSvgExportOptions & {
  backgroundColor?: string
  scale?: number
}

export async function renderSchematicSvgToPngBlob(
  sourceSvg: SVGSVGElement,
  options: SchematicPngExportOptions = {},
): Promise<Blob> {
  const svgText = serializeSchematicSvg(sourceSvg, options)
  return renderSvgTextToPngBlob(svgText, options)
}

export async function renderSchematicSvgToPngDataUrl(
  sourceSvg: SVGSVGElement,
  options: SchematicPngExportOptions = {},
): Promise<string> {
  const blob = await renderSchematicSvgToPngBlob(sourceSvg, options)
  return blobToDataUrl(blob)
}

export async function copyPngBlobToClipboard(blob: Blob): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Image clipboard export is not available in this browser.")
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      "image/png": blob,
    }),
  ])
}

export function schematicBackgroundColor(sourceSvg: SVGSVGElement): string {
  const view = sourceSvg.ownerDocument.defaultView
  const container = sourceSvg.closest(".canvas-wrap") ?? sourceSvg
  const background = view?.getComputedStyle(container).backgroundColor
  return background && background !== "rgba(0, 0, 0, 0)"
    ? background
    : "#000000"
}

async function renderSvgTextToPngBlob(
  svgText: string,
  options: SchematicPngExportOptions,
): Promise<Blob> {
  const { width, height } = dimensionsFromSvgText(svgText)
  const scale = clampScale(options.scale ?? 2)
  const imageUrl = URL.createObjectURL(
    new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }),
  )
  try {
    const image = await loadImage(imageUrl)
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("PNG export canvas could not be created.")
    }

    context.scale(scale, scale)
    context.fillStyle = options.backgroundColor ?? "#000000"
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    return await canvasToBlob(canvas)
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function dimensionsFromSvgText(svgText: string): { width: number; height: number } {
  const document = new DOMParser().parseFromString(svgText, "image/svg+xml")
  const svg = document.documentElement
  const width = parseDimension(svg.getAttribute("width")) ?? 1200
  const height = parseDimension(svg.getAttribute("height")) ?? 800
  return { width, height }
}

function parseDimension(value: string | null): number | null {
  if (!value) {
    return null
  }
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function clampScale(value: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }
  return Math.min(4, Math.max(1, value))
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("The schematic SVG could not be rasterized."))
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("PNG export could not be created."))
        return
      }
      resolve(blob)
    }, "image/png")
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }
      reject(new Error("PNG preview could not be created."))
    }
    reader.onerror = () => reject(new Error("PNG preview could not be created."))
    reader.readAsDataURL(blob)
  })
}
