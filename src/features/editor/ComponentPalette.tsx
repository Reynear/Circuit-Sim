import {
  components,
  type ComponentGroup,
} from "@circuit-sim/core/circuit/components"
import { useEditorState, type EditorTool } from "@/browser/editor/editor-state"

type PaletteTool = {
  label: string
  shortcut?: string
  tool: EditorTool
}

const toolItems: PaletteTool[] = [
  { label: "Select", shortcut: "S", tool: { type: "select" } },
  {
    label: "Wire",
    shortcut: "W",
    tool: { type: "draw-wire", routeMode: "straight" },
  },
  { label: "Ground", shortcut: "G", tool: { type: "place-ground" } },
  {
    label: "Voltage Probe",
    shortcut: "P",
    tool: { type: "place-voltage-probe" },
  },
  {
    label: "Current Probe",
    shortcut: "Shift P",
    tool: { type: "place-current-probe" },
  },
  { label: "Net Label", shortcut: "N", tool: { type: "place-net-label" } },
  { label: "Text", shortcut: "T", tool: { type: "place-text" } },
  { label: "Box", tool: { type: "place-box" } },
  { label: "Line", tool: { type: "place-line" } },
]

const componentSections: ReadonlyArray<{
  title: string
  group: ComponentGroup
}> = [
  { title: "Passives", group: "passive" },
  { title: "Sources", group: "source" },
  { title: "Semiconductors", group: "semiconductor" },
  { title: "Active blocks", group: "active-block" },
  { title: "Logic", group: "logic" },
]

function isActive(tool: EditorTool, candidate: EditorTool): boolean {
  if (tool.type !== candidate.type) {
    return false
  }
  if (tool.type === "place-component" && candidate.type === "place-component") {
    return tool.component === candidate.component
  }
  return true
}

export function ComponentPalette() {
  const tool = useEditorState((state) => state.tool)
  const setTool = useEditorState((state) => state.setTool)

  return (
    <aside className="editor-side-panel palette">
      <h2>Add</h2>
      <div className="palette-section">
        <h3>Tools</h3>
        {toolItems.map((item) => (
          <PaletteButton
            active={isActive(tool, item.tool)}
            key={item.label}
            label={item.label}
            shortcut={item.shortcut}
            onClick={() => setTool(item.tool)}
          />
        ))}
      </div>

      {componentSections.map((section) => (
        <div className="palette-section" key={section.title}>
          <h3>{section.title}</h3>
          {components
            .filter((component) => component.group === section.group)
            .map((component) => (
              <PaletteButton
                active={isActive(tool, {
                  type: "place-component",
                  component: component.type,
                })}
                key={component.type}
                label={component.name}
                shortcut={component.shortcut}
                onClick={() =>
                  setTool({
                    type: "place-component",
                    component: component.type,
                  })
                }
              />
            ))}
        </div>
      ))}
    </aside>
  )
}

function PaletteButton({
  active,
  label,
  onClick,
  shortcut,
}: {
  active: boolean
  label: string
  onClick: () => void
  shortcut?: string | undefined
}) {
  return (
    <button
      className={active ? "tool-button active" : "tool-button"}
      onClick={onClick}
    >
      <span>{label}</span>
      {shortcut ? <kbd>{shortcut}</kbd> : null}
    </button>
  )
}
