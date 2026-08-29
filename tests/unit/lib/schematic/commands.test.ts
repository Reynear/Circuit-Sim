import { describe, expect, it } from "vitest"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"
import { applyCircuitEdits } from "@circuit-sim/core/circuit/edit"

describe("circuit edits", () => {
  it("leave revision timestamp ownership to the mutation boundary", () => {
    const project = newCircuitProject()
    const updated = applyCircuitEdits(project, [])

    expect(updated).toBe(project)
    expect(updated.updatedAt).toBe(project.updatedAt)
  })
})
