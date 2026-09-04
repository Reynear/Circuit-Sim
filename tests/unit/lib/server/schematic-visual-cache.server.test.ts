import { describe, expect, it } from "vitest"
import {
  SchematicVisualCache,
  type CachedSchematicVisual,
} from "@/server/schematic/schematic-visual-cache.server"

const visual = (svg: string): CachedSchematicVisual => ({
  svg,
  sourceWidth: 100,
  sourceHeight: 80,
  warnings: [],
  png: { base64: "iVBORw0KGgo=", width: 100, height: 80 },
})

describe("SchematicVisualCache", () => {
  it("evicts the least recently used derived visual", () => {
    const cache = new SchematicVisualCache(2)
    cache.set("a", visual("a"))
    cache.set("b", visual("b"))
    expect(cache.get("a")?.svg).toBe("a")

    cache.set("c", visual("c"))

    expect(cache.get("b")).toBeUndefined()
    expect(cache.get("a")?.svg).toBe("a")
    expect(cache.get("c")?.svg).toBe("c")
    expect(cache.size).toBe(2)
  })
})
