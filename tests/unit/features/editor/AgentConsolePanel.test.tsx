import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import { createVoltageDividerExample } from "@/examples/circuit-projects"
import {
  defaultEditorRegistry,
  EditorAtomProvider,
  useEditorState,
} from "@/browser/editor/editor-state"
import { AgentConsolePanel } from "@/features/editor/AgentConsolePanel"

describe("AgentConsolePanel", () => {
  beforeEach(() => {
    useEditorState.getState().setProject(createVoltageDividerExample())
  })

  function renderPanel() {
    render(
      <EditorAtomProvider registry={defaultEditorRegistry}>
        <AgentConsolePanel />
      </EditorAtomProvider>,
    )
  }

  it("runs topology commands against the loaded project", async () => {
    const user = userEvent.setup()
    renderPanel()

    const input = screen.getByTestId("agent-console-input")
    await user.type(input, "circuit net VOUT")
    await user.click(screen.getByRole("button", { name: "Run" }))

    const output = screen.getByTestId("agent-console-output")
    expect(output).toHaveTextContent("NET VOUT")
    expect(output).toHaveTextContent("R1.2")
    expect(output).toHaveTextContent("R2.1")
  })

  it("shows the current circuit hash in the header", () => {
    renderPanel()
    expect(screen.getByTestId("agent-console")).toHaveTextContent(/Circuit [0-9a-f]{16}/)
  })

  it("keeps command history navigable with arrow keys", async () => {
    const user = userEvent.setup()
    renderPanel()

    const input = screen.getByTestId("agent-console-input")
    await user.type(input, "circuit show{Enter}")
    await user.type(input, "circuit islands{Enter}")
    await user.type(input, "{ArrowUp}{ArrowUp}")

    expect(input).toHaveValue("circuit show")
  })

  it("reports unknown commands honestly", async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByTestId("agent-console-input"), "bash ls{Enter}")

    expect(screen.getByTestId("agent-console-output")).toHaveTextContent(
      'ERROR: unknown command "bash"',
    )
  })
})
