import { componentDefinitions } from "../../lib/schematic/component-definitions"
import { useEditorStore, type EditorTool } from "../../lib/schematic/editor-store"

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

const componentSections = [
  {
    title: "Passives",
    ids: ["resistor", "capacitor", "inductor", "switch", "potentiometer"],
  },
  {
    title: "Sources",
    ids: ["dc-voltage-source", "sine-voltage-source", "dc-current-source"],
  },
  {
    title: "Semiconductors",
    ids: ["diode", "led", "npn-transistor", "pnp-transistor", "n-mosfet", "p-mosfet"],
  },
].map((section) => ({
  ...section,
  definitions: section.ids
    .map((id) => componentDefinitions.find((definition) => definition.id === id))
    .filter((definition): definition is (typeof componentDefinitions)[number] =>
      Boolean(definition),
    ),
}))

function isActive(tool: EditorTool, candidate: EditorTool): boolean {
  if (tool.type !== candidate.type) {
    return false
  }
  if (tool.type === "place-symbol" && candidate.type === "place-symbol") {
    return tool.componentDefinitionId === candidate.componentDefinitionId
  }
  return true
}

export function ComponentPalette() {
  const tool = useEditorStore((state) => state.tool)
  const setTool = useEditorStore((state) => state.setTool)

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
          {section.definitions.map((definition) => (
            <PaletteButton
              active={isActive(tool, {
                type: "place-symbol",
                componentDefinitionId: definition.id,
              })}
              key={definition.id}
              label={definition.displayName}
              shortcut={shortcutForComponent(definition.id)}
              onClick={() =>
                setTool({
                  type: "place-symbol",
                  componentDefinitionId: definition.id,
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
  shortcut?: string | null | undefined
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

function shortcutForComponent(componentDefinitionId: string): string | null {
  switch (componentDefinitionId) {
    case "resistor":
      return "R"
    case "capacitor":
      return "C"
    case "inductor":
      return "Shift L"
    case "diode":
      return "D"
    case "led":
      return "L"
    case "dc-voltage-source":
      return "V"
    case "sine-voltage-source":
      return "Shift V"
    case "dc-current-source":
      return "Shift I"
    default:
      return null
  }
}
