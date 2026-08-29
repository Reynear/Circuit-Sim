import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"
import {
  defaultEditorRegistry,
  EditorAtomProvider,
  useEditorState,
} from "@/browser/editor/editor-state"
import { PropertyInspector } from "@/features/editor/PropertyInspector"

describe("PropertyInspector", () => {
  beforeEach(() => {
    const store = useEditorState.getState()
    store.setProject(newCircuitProject("Inspector Test"))
    store.placeComponent("resistor", { x: 100, y: 100 })
    const resistor = useEditorState
      .getState()
      .project?.objects.find((object) => object.kind === "component")
    if (!resistor) {
      throw new Error("Expected a resistor")
    }
    store.selectObject(resistor.id)
  })

  it("keeps invalid drafts out of the project and commits valid values immediately", async () => {
    const user = userEvent.setup()
    render(
      <EditorAtomProvider registry={defaultEditorRegistry}>
        <PropertyInspector />
      </EditorAtomProvider>,
    )

    const input = screen.getByLabelText("Resistance")
    expect(input).toHaveValue("1k")

    await user.clear(input)
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveClass("invalid-property")
    expect(resistance()).toBe(1_000)

    await user.type(input, "2.2k")
    expect(input).toHaveAttribute("aria-invalid", "false")
    expect(input).not.toHaveClass("invalid-property")
    expect(resistance()).toBe(2_200)
  })
})

function resistance(): number | undefined {
  const resistor = useEditorState
    .getState()
    .project?.objects.find((object) => object.kind === "component")
  return resistor?.kind === "component" && resistor.type === "resistor"
    ? resistor.props.resistanceOhms
    : undefined
}
