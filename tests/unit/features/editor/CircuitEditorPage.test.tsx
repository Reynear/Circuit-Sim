import { Effect, Option } from "effect"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"
import {
  defaultEditorRegistry,
  useEditorState,
} from "@/browser/editor/editor-state"
import { CircuitEditorPage } from "@/features/editor/CircuitEditorPage"

const mocks = vi.hoisted(() => ({
  latestProject: undefined as unknown,
  saveProjectSnapshot: vi.fn(),
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))

vi.mock("@/browser/persistence/project-store", () => ({
  listProjects: () => Effect.succeed([]),
  loadLatestProject: () => Effect.succeed(mocks.latestProject),
  saveProjectSnapshot: mocks.saveProjectSnapshot,
}))

vi.mock("@/features/editor/EditorToolbar", () => ({
  EditorToolbar: ({ onSave }: { onSave: () => void }) => (
    <button onClick={onSave}>Save</button>
  ),
}))
vi.mock("@/features/editor/BottomPanel", () => ({ BottomPanel: () => null }))
vi.mock("@/features/editor/ComponentPalette", () => ({ ComponentPalette: () => null }))
vi.mock("@/features/editor/PropertyInspector", () => ({ PropertyInspector: () => null }))
vi.mock("@/features/editor/SchematicCanvas", () => ({ SchematicCanvas: () => null }))
vi.mock("@/features/editor/ShortcutHelpDialog", () => ({ ShortcutHelpDialog: () => null }))
vi.mock("@/features/editor/useEditorShortcuts", () => ({ useEditorShortcuts: () => undefined }))

describe("CircuitEditorPage persistence", () => {
  beforeEach(() => {
    const project = newCircuitProject("Persistence Test")
    mocks.latestProject = Option.some(project)
    mocks.saveProjectSnapshot.mockReset()
    mocks.saveProjectSnapshot.mockReturnValue(Effect.succeed({}))
    useEditorState.getState().clearProject()
  })

  it("keeps newer project changes dirty when manual saving fails", async () => {
    mocks.saveProjectSnapshot.mockReturnValueOnce(
      Effect.fail({ _tag: "ProjectPersistenceError" }),
    )
    const user = userEvent.setup()
    render(
      <CircuitEditorPage
        projectId="prj_test"
        registry={defaultEditorRegistry}
      />,
    )

    await waitFor(() => expect(useEditorState.getState().project).not.toBeNull())
    act(() => useEditorState.getState().placeText({ x: 20, y: 20 }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Project could not be saved",
    )
    expect(useEditorState.getState().dirty).toBe(true)
  })
})
