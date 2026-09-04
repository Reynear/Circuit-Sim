import { Effect, Exit, Option } from "effect"
import { useEffect, useState } from "react"
import { CircuitEditorPage } from "@/features/editor/CircuitEditorPage"
import {
  createProject,
  loadLatestProject,
} from "@/browser/persistence/project-store"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"

export const AGENT_WORKBENCH_PROJECT_ID =
  "00000000-0000-4000-8000-000000000001"

export function AgentWorkbench() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    let active = true
    const initialize = Effect.gen(function*() {
      const existing = yield* loadLatestProject(AGENT_WORKBENCH_PROJECT_ID)
      if (Option.isNone(existing)) {
        yield* createProject({
          ...newCircuitProject("Shared Agent Workbench"),
          id: AGENT_WORKBENCH_PROJECT_ID,
        })
      }
    })

    void Effect.runPromiseExit(initialize).then((exit) => {
      if (active) setState(Exit.isSuccess(exit) ? "ready" : "error")
    })
    return () => {
      active = false
    }
  }, [])

  if (state === "loading") {
    return (
      <main className="editor-loading">
        <p className="muted">Opening the shared agent workbench…</p>
      </main>
    )
  }
  if (state === "error") {
    return (
      <main className="editor-loading">
        <h1>Workbench could not be opened</h1>
        <p className="muted">Local project storage is unavailable.</p>
      </main>
    )
  }
  return <CircuitEditorPage projectId={AGENT_WORKBENCH_PROJECT_ID} />
}
