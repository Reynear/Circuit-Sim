export type CachedSchematicVisual = {
  readonly svg: string
  readonly sourceWidth: number
  readonly sourceHeight: number
  readonly warnings: ReadonlyArray<string>
  readonly png?: {
    readonly base64: string
    readonly width: number
    readonly height: number
  }
}

/**
 * Small process-local LRU for derived visuals. Cache entries are disposable:
 * every key identifies an immutable project snapshot that can be rendered
 * again from CircuitProject.
 */
export class SchematicVisualCache {
  readonly #entries = new Map<string, CachedSchematicVisual>()

  constructor(readonly capacity = 64) {}

  get(key: string): CachedSchematicVisual | undefined {
    const value = this.#entries.get(key)
    if (value === undefined) return undefined
    this.#entries.delete(key)
    this.#entries.set(key, value)
    return value
  }

  set(key: string, value: CachedSchematicVisual): void {
    this.#entries.delete(key)
    this.#entries.set(key, value)
    while (this.#entries.size > this.capacity) {
      const oldest = this.#entries.keys().next().value
      if (oldest === undefined) return
      this.#entries.delete(oldest)
    }
  }

  clear(): void {
    this.#entries.clear()
  }

  get size(): number {
    return this.#entries.size
  }
}

export const schematicVisualCache = new SchematicVisualCache()
