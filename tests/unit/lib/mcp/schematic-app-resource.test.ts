import { afterEach, describe, expect, it, vi } from "vitest"
import {
  SCHEMATIC_APP_HTML,
  SCHEMATIC_APP_RESOURCE_URI,
} from "@/server/mcp/schematic-app-resource.server"

const isRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

describe("schematic MCP App resource", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.head.innerHTML = ""
    document.body.innerHTML = ""
  })

  it("initializes, reads the pinned SVG, renders it, and tears down cleanly", async () => {
    const parsed = new DOMParser().parseFromString(SCHEMATIC_APP_HTML, "text/html")
    const script = parsed.querySelector("script")?.textContent
    expect(script).toBeTruthy()
    parsed.querySelector("script")?.remove()
    document.head.innerHTML = parsed.head.innerHTML
    document.body.innerHTML = parsed.body.innerHTML

    const outbound: Array<unknown> = []
    vi.spyOn(window, "postMessage").mockImplementation((message) => {
      outbound.push(message)
    })
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0)
      return 1
    })
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {})
    const viewport = document.getElementById("viewport")
    if (!viewport) throw new Error("schematic app fixture has no viewport")
    Object.defineProperty(viewport, "scrollTo", { value: vi.fn() })

    window.eval(script!)

    const initialize = await waitForMessage(outbound, "ui/initialize")
    expect(initialize.params).toMatchObject({
      appInfo: { name: "Circuit Sim schematic", version: "1.0.0" },
      appCapabilities: { availableDisplayModes: ["inline"] },
      protocolVersion: "2026-01-26",
    })
    sendFromHost({
      jsonrpc: "2.0",
      id: initialize.id,
      result: {
        protocolVersion: "2026-01-26",
        hostInfo: { name: "test-host", version: "1" },
        hostCapabilities: {},
        hostContext: { theme: "dark" },
      },
    })
    await waitForMessage(outbound, "ui/notifications/initialized")
    expect(document.documentElement.dataset.theme).toBe("dark")

    const resourceUri =
      "circuit-sim://projects/project-1/snapshots/snapshot-1/schematic/hash/all.svg"
    sendFromHost({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        content: [{ type: "text", text: "Portable fallback" }],
        structuredContent: {
          visuals: [
            {
              kind: "schematic",
              mimeType: "image/svg+xml",
              caption: "Voltage divider schematic",
              alt: "A voltage divider",
              dimensions: { width: 800, height: 400 },
              uri: resourceUri,
              snapshot: {
                projectId: "project-1",
                snapshotId: "snapshot-1",
                circuitHash: "0123456789abcdef",
              },
              focus: "all",
            },
          ],
          snapshot: {
            projectId: "project-1",
            snapshotId: "snapshot-1",
            circuitHash: "0123456789abcdef",
          },
        },
      },
    })

    const resourceRead = await waitForMessage(outbound, "resources/read")
    expect(resourceRead.params).toEqual({ uri: resourceUri })
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="white"/></svg>'
    sendFromHost({
      jsonrpc: "2.0",
      id: resourceRead.id,
      result: {
        contents: [
          {
            uri: resourceUri,
            mimeType: "image/svg+xml",
            blob: Buffer.from(svg, "utf8").toString("base64"),
          },
        ],
      },
    })

    await vi.waitFor(() => {
      const image = document.getElementById("schematic")
      expect(image).toBeInstanceOf(HTMLImageElement)
      expect((image as HTMLImageElement).hidden).toBe(false)
      expect((image as HTMLImageElement).src).toMatch(/^data:image\/svg\+xml;base64,/)
    })
    expect(document.getElementById("schematic-title")?.textContent).toBe(
      "Voltage divider schematic",
    )
    expect(document.getElementById("metadata")?.textContent).toContain(
      "0123456789ab · whole circuit",
    )

    const unsafeResourceUri = resourceUri.replace("/all.svg", "/unsafe.svg")
    const unsafeStart = outbound.length
    sendFromHost({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        structuredContent: {
          visuals: [
            {
              kind: "schematic",
              mimeType: "image/svg+xml",
              caption: "Unsafe schematic",
              alt: "Unsafe schematic",
              uri: unsafeResourceUri,
              snapshot: {
                projectId: "project-1",
                snapshotId: "snapshot-1",
                circuitHash: "0123456789abcdef",
              },
              focus: "all",
            },
          ],
        },
      },
    })
    const unsafeRead = await waitForMessage(
      outbound,
      "resources/read",
      unsafeStart,
    )
    const unsafeSvg = '<svg xmlns="http://www.w3.org/2000/svg"><script>throw new Error("active")</script></svg>'
    sendFromHost({
      jsonrpc: "2.0",
      id: unsafeRead.id,
      result: {
        contents: [
          {
            uri: unsafeResourceUri,
            mimeType: "image/svg+xml",
            blob: Buffer.from(unsafeSvg, "utf8").toString("base64"),
          },
        ],
      },
    })
    await vi.waitFor(() => {
      expect(document.getElementById("state")?.textContent).toContain(
        "unsupported active content",
      )
      expect((document.getElementById("schematic") as HTMLImageElement).hidden).toBe(true)
    })

    sendFromHost({
      jsonrpc: "2.0",
      id: 9001,
      method: "ui/resource-teardown",
      params: {},
    })
    await vi.waitFor(() => {
      expect(outbound).toContainEqual({
        jsonrpc: "2.0",
        id: 9001,
        result: {},
      })
    })
  })

  it("publishes no external asset dependency", () => {
    expect(SCHEMATIC_APP_RESOURCE_URI).toMatch(/^ui:\/\//)
    expect(SCHEMATIC_APP_HTML).not.toMatch(
      /<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i,
    )
  })
})

const sendFromHost = (data: unknown) => {
  window.dispatchEvent(
    new MessageEvent("message", { data, source: window }),
  )
}

const waitForMessage = async (
  messages: ReadonlyArray<unknown>,
  method: string,
  startAt = 0,
): Promise<Record<string, unknown>> => {
  let found: Record<string, unknown> | undefined
  await vi.waitFor(() => {
    const candidate = messages.slice(startAt).find(
      (message) => isRecord(message) && message.method === method,
    )
    expect(candidate).toBeDefined()
    if (isRecord(candidate)) found = candidate
  })
  if (found === undefined) throw new Error(`MCP App did not send ${method}`)
  return found
}
