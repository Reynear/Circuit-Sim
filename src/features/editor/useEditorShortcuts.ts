import { useMemo } from "react"
import {
  useHotkeys,
  type UseHotkeyDefinition,
  type UseHotkeyOptions,
} from "@tanstack/react-hotkeys"
import type { BottomTab } from "./BottomPanel"
import { useEditorStore } from "../../lib/schematic/editor-store"

type UseEditorShortcutsOptions = {
  editingDisabled?: boolean
  helpOpen: boolean
  onCloseHelp: () => void
  onOpenHelp: () => void
  onRunSimulation: () => void
  onSave: () => void
  onSetTab: (tab: BottomTab) => void
}

export type EditorShortcutHelpItem = {
  hotkey: string
  name: string
  group: string
}

export const editorShortcutHelp: EditorShortcutHelpItem[] = [
  { hotkey: "Mod+S", name: "Save", group: "Project" },
  { hotkey: "Mod+Z", name: "Undo schematic edit", group: "Project" },
  { hotkey: "Mod+Shift+Z", name: "Redo schematic edit", group: "Project" },
  { hotkey: "Enter", name: "Recompute ERC and code", group: "Project" },
  { hotkey: "S", name: "Select tool", group: "Tools" },
  { hotkey: "W", name: "Wire tool", group: "Tools" },
  { hotkey: "Alt+drag", name: "Drag all", group: "Tools" },
  { hotkey: "Alt+Shift+drag", name: "Drag row", group: "Tools" },
  { hotkey: "Alt+Mod+drag", name: "Drag column", group: "Tools" },
  { hotkey: "Mod+drag post", name: "Drag post", group: "Tools" },
  { hotkey: "R", name: "Place resistor", group: "Components" },
  { hotkey: "C", name: "Place capacitor", group: "Components" },
  { hotkey: "Shift+L", name: "Place inductor", group: "Components" },
  { hotkey: "D", name: "Place diode", group: "Components" },
  { hotkey: "L", name: "Place LED", group: "Components" },
  { hotkey: "V", name: "Place DC source", group: "Components" },
  { hotkey: "Shift+V", name: "Place sine source", group: "Components" },
  { hotkey: "Shift+I", name: "Place DC current source", group: "Components" },
  { hotkey: "G", name: "Place ground", group: "Components" },
  { hotkey: "P", name: "Place voltage probe", group: "Measurements" },
  { hotkey: "Shift+P", name: "Place current probe", group: "Measurements" },
  { hotkey: "N", name: "Place net label", group: "Measurements" },
  { hotkey: "E", name: "Rotate selected", group: "Edit" },
  { hotkey: "Mod+C", name: "Copy selected", group: "Edit" },
  { hotkey: "Mod+V", name: "Paste", group: "Edit" },
  { hotkey: "Shift+D", name: "Duplicate selected", group: "Edit" },
  { hotkey: "Alt+H", name: "Align selected horizontally", group: "Edit" },
  { hotkey: "Alt+Shift+H", name: "Align selected vertically", group: "Edit" },
  { hotkey: "Alt+D", name: "Distribute selected horizontally", group: "Edit" },
  { hotkey: "Alt+Shift+D", name: "Distribute selected vertically", group: "Edit" },
  { hotkey: "Arrow keys", name: "Nudge selected one grid step", group: "Edit" },
  { hotkey: "Shift+Arrow keys", name: "Nudge selected five grid steps", group: "Edit" },
  { hotkey: "Delete", name: "Delete selected", group: "Edit" },
  { hotkey: "Backspace", name: "Delete selected", group: "Edit" },
  { hotkey: "Escape", name: "Cancel / clear selection", group: "Edit" },
  { hotkey: "M", name: "Show measurements", group: "Panels" },
  { hotkey: "I", name: "Show issues", group: "Panels" },
  { hotkey: "K", name: "Show generated code", group: "Panels" },
  { hotkey: "O", name: "Show tscircuit preview", group: "Panels" },
  { hotkey: "Mod+Enter", name: "Run SPICE simulation", group: "Simulation" },
  { hotkey: "H", name: "Show shortcuts", group: "Help" },
]

export function useEditorShortcuts({
  editingDisabled = false,
  helpOpen,
  onCloseHelp,
  onOpenHelp,
  onRunSimulation,
  onSave,
  onSetTab,
}: UseEditorShortcutsOptions) {
  const project = useEditorStore((state) => state.project)
  const activeSheetId = useEditorStore((state) => state.activeSheetId)
  const setTool = useEditorStore((state) => state.setTool)
  const selectObject = useEditorStore((state) => state.selectObject)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const copySelected = useEditorStore((state) => state.copySelected)
  const pasteClipboard = useEditorStore((state) => state.pasteClipboard)
  const rotateSelected = useEditorStore((state) => state.rotateSelected)
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected)
  const alignSelected = useEditorStore((state) => state.alignSelected)
  const distributeSelected = useEditorStore((state) => state.distributeSelected)
  const nudgeSelected = useEditorStore((state) => state.nudgeSelected)
  const deleteSelected = useEditorStore((state) => state.deleteSelected)
  const gridSize =
    project?.sheets.find((sheet) => sheet.id === activeSheetId)?.gridSize ?? 20
  const recompute = useEditorStore((state) => state.recompute)

  const hotkeys = useMemo<Array<UseHotkeyDefinition>>(
    () => {
      const edit = (callback: () => void) => () => {
        if (!editingDisabled) {
          callback()
        }
      }
      return [
      {
        hotkey: "Mod+S",
        callback: () => onSave(),
        options: shortcutOptions("Save", "Project", { ignoreInputs: false }),
      },
      {
        hotkey: "Mod+Z",
        callback: edit(() => undo()),
        options: shortcutOptions("Undo schematic edit", "Project"),
      },
      {
        hotkey: "Mod+Shift+Z",
        callback: edit(() => redo()),
        options: shortcutOptions("Redo schematic edit", "Project"),
      },
      {
        hotkey: "S",
        callback: edit(() => setTool({ type: "select" })),
        options: shortcutOptions("Select tool", "Tools"),
      },
      {
        hotkey: "W",
        callback: edit(() => setTool({ type: "draw-wire", routeMode: "straight" })),
        options: shortcutOptions("Wire tool", "Tools"),
      },
      {
        hotkey: "R",
        callback: edit(() =>
          setTool({ type: "place-symbol", componentDefinitionId: "resistor" }),
        ),
        options: shortcutOptions("Place resistor", "Components"),
      },
      {
        hotkey: "C",
        callback: edit(() =>
          setTool({ type: "place-symbol", componentDefinitionId: "capacitor" }),
        ),
        options: shortcutOptions("Place capacitor", "Components"),
      },
      {
        hotkey: "Shift+L",
        callback: edit(() =>
          setTool({ type: "place-symbol", componentDefinitionId: "inductor" }),
        ),
        options: shortcutOptions("Place inductor", "Components"),
      },
      {
        hotkey: "D",
        callback: edit(() =>
          setTool({ type: "place-symbol", componentDefinitionId: "diode" }),
        ),
        options: shortcutOptions("Place diode", "Components"),
      },
      {
        hotkey: "L",
        callback: edit(() =>
          setTool({ type: "place-symbol", componentDefinitionId: "led" }),
        ),
        options: shortcutOptions("Place LED", "Components"),
      },
      {
        hotkey: "V",
        callback: edit(() =>
          setTool({
            type: "place-symbol",
            componentDefinitionId: "dc-voltage-source",
          }),
        ),
        options: shortcutOptions("Place DC source", "Components"),
      },
      {
        hotkey: "Shift+V",
        callback: edit(() =>
          setTool({
            type: "place-symbol",
            componentDefinitionId: "sine-voltage-source",
          }),
        ),
        options: shortcutOptions("Place sine source", "Components"),
      },
      {
        hotkey: "Shift+I",
        callback: edit(() =>
          setTool({
            type: "place-symbol",
            componentDefinitionId: "dc-current-source",
          }),
        ),
        options: shortcutOptions("Place DC current source", "Components"),
      },
      {
        hotkey: "G",
        callback: edit(() => setTool({ type: "place-ground" })),
        options: shortcutOptions("Place ground", "Components"),
      },
      {
        hotkey: "P",
        callback: edit(() => setTool({ type: "place-voltage-probe" })),
        options: shortcutOptions("Place voltage probe", "Measurements"),
      },
      {
        hotkey: "Shift+P",
        callback: edit(() => setTool({ type: "place-current-probe" })),
        options: shortcutOptions("Place current probe", "Measurements"),
      },
      {
        hotkey: "N",
        callback: edit(() => setTool({ type: "place-net-label" })),
        options: shortcutOptions("Place net label", "Measurements"),
      },
      {
        hotkey: "T",
        callback: edit(() => setTool({ type: "place-text" })),
        options: shortcutOptions("Place text note", "Measurements"),
      },
      {
        hotkey: "E",
        callback: edit(() => rotateSelected()),
        options: shortcutOptions("Rotate selected", "Edit"),
      },
      {
        hotkey: "Mod+C",
        callback: () => copySelected(),
        options: shortcutOptions("Copy selected", "Edit"),
      },
      {
        hotkey: "Mod+V",
        callback: edit(() => pasteClipboard()),
        options: shortcutOptions("Paste", "Edit"),
      },
      {
        hotkey: "Shift+D",
        callback: edit(() => duplicateSelected()),
        options: shortcutOptions("Duplicate selected", "Edit"),
      },
      {
        hotkey: "Alt+H",
        callback: edit(() => alignSelected("y")),
        options: shortcutOptions("Align selected horizontally", "Edit"),
      },
      {
        hotkey: "Alt+Shift+H",
        callback: edit(() => alignSelected("x")),
        options: shortcutOptions("Align selected vertically", "Edit"),
      },
      {
        hotkey: "Alt+D",
        callback: edit(() => distributeSelected("x")),
        options: shortcutOptions("Distribute selected horizontally", "Edit"),
      },
      {
        hotkey: "Alt+Shift+D",
        callback: edit(() => distributeSelected("y")),
        options: shortcutOptions("Distribute selected vertically", "Edit"),
      },
      {
        hotkey: "ArrowUp",
        callback: edit(() => nudgeSelected({ x: 0, y: -gridSize })),
        options: shortcutOptions("Nudge up", "Edit"),
      },
      {
        hotkey: "ArrowDown",
        callback: edit(() => nudgeSelected({ x: 0, y: gridSize })),
        options: shortcutOptions("Nudge down", "Edit"),
      },
      {
        hotkey: "ArrowLeft",
        callback: edit(() => nudgeSelected({ x: -gridSize, y: 0 })),
        options: shortcutOptions("Nudge left", "Edit"),
      },
      {
        hotkey: "ArrowRight",
        callback: edit(() => nudgeSelected({ x: gridSize, y: 0 })),
        options: shortcutOptions("Nudge right", "Edit"),
      },
      {
        hotkey: "Shift+ArrowUp",
        callback: edit(() => nudgeSelected({ x: 0, y: -gridSize * 5 })),
        options: shortcutOptions("Nudge up five grid steps", "Edit"),
      },
      {
        hotkey: "Shift+ArrowDown",
        callback: edit(() => nudgeSelected({ x: 0, y: gridSize * 5 })),
        options: shortcutOptions("Nudge down five grid steps", "Edit"),
      },
      {
        hotkey: "Shift+ArrowLeft",
        callback: edit(() => nudgeSelected({ x: -gridSize * 5, y: 0 })),
        options: shortcutOptions("Nudge left five grid steps", "Edit"),
      },
      {
        hotkey: "Shift+ArrowRight",
        callback: edit(() => nudgeSelected({ x: gridSize * 5, y: 0 })),
        options: shortcutOptions("Nudge right five grid steps", "Edit"),
      },
      {
        hotkey: "Delete",
        callback: edit(() => deleteSelected()),
        options: shortcutOptions("Delete selected", "Edit"),
      },
      {
        hotkey: "Backspace",
        callback: edit(() => deleteSelected()),
        options: shortcutOptions("Delete selected", "Edit"),
      },
      {
        hotkey: "Escape",
        callback: () => {
          if (helpOpen) {
            onCloseHelp()
            return
          }
          selectObject(null)
          setTool({ type: "select" })
        },
        options: shortcutOptions("Cancel / clear selection", "Edit"),
      },
      {
        hotkey: "M",
        callback: () => onSetTab("measurements"),
        options: shortcutOptions("Show measurements", "Panels"),
      },
      {
        hotkey: "I",
        callback: () => onSetTab("issues"),
        options: shortcutOptions("Show issues", "Panels"),
      },
      {
        hotkey: "K",
        callback: () => onSetTab("code"),
        options: shortcutOptions("Show generated code", "Panels"),
      },
      {
        hotkey: "O",
        callback: () => onSetTab("preview"),
        options: shortcutOptions("Show tscircuit preview", "Panels"),
      },
      {
        hotkey: "Mod+Enter",
        callback: () => onRunSimulation(),
        options: shortcutOptions("Run SPICE simulation", "Simulation", {
          ignoreInputs: false,
        }),
      },
      {
        hotkey: "Enter",
        callback: () => recompute(),
        options: shortcutOptions("Recompute ERC and code", "Project"),
      },
      {
        hotkey: "H",
        callback: () => onOpenHelp(),
        options: shortcutOptions("Show shortcuts", "Help"),
      },
      ]
    },
    [
      deleteSelected,
      duplicateSelected,
      distributeSelected,
      copySelected,
      editingDisabled,
      gridSize,
      helpOpen,
      alignSelected,
      nudgeSelected,
      onCloseHelp,
      onOpenHelp,
      onRunSimulation,
      onSave,
      onSetTab,
      recompute,
      redo,
      rotateSelected,
      selectObject,
      setTool,
      pasteClipboard,
      undo,
    ],
  )

  useHotkeys(hotkeys, {
    enabled: Boolean(project),
    preventDefault: true,
    stopPropagation: true,
    conflictBehavior: "replace",
  })
}

function shortcutOptions(
  name: string,
  group: string,
  options: { ignoreInputs?: boolean } = {},
): UseHotkeyOptions {
  const shortcut: UseHotkeyOptions = {
    meta: {
      name,
      description: group,
    },
  }
  if (options.ignoreInputs !== undefined) {
    shortcut.ignoreInputs = options.ignoreInputs
  }
  return shortcut
}
