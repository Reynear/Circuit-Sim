import { useMemo } from "react"
import {
  useHotkeys,
  type UseHotkeyDefinition,
  type UseHotkeyOptions,
} from "@tanstack/react-hotkeys"
import type { BottomTab } from "./BottomPanel"
import { useEditorState } from "@/browser/editor/editor-state"
import { GRID_SIZE } from "@/browser/editor/interaction"
import { components } from "@circuit-sim/core/circuit/components"

type UseEditorShortcutsOptions = {
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
  { hotkey: "Enter", name: "Recompute ERC", group: "Project" },
  { hotkey: "S", name: "Select tool", group: "Tools" },
  { hotkey: "W", name: "Wire tool", group: "Tools" },
  { hotkey: "Alt+drag", name: "Drag all", group: "Tools" },
  { hotkey: "Alt+Shift+drag", name: "Drag row", group: "Tools" },
  { hotkey: "Alt+Mod+drag", name: "Drag column", group: "Tools" },
  { hotkey: "Mod+drag post", name: "Drag post", group: "Tools" },
  ...components.flatMap((component) =>
    component.shortcut
      ? [{ hotkey: component.shortcut, name: `Place ${component.name}`, group: "Components" }]
      : [],
  ),
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
  { hotkey: "Mod+Enter", name: "Run SPICE simulation", group: "Simulation" },
  { hotkey: "H", name: "Show shortcuts", group: "Help" },
]

export function useEditorShortcuts({
  helpOpen,
  onCloseHelp,
  onOpenHelp,
  onRunSimulation,
  onSave,
  onSetTab,
}: UseEditorShortcutsOptions) {
  const project = useEditorState((state) => state.project)
  const setTool = useEditorState((state) => state.setTool)
  const selectObject = useEditorState((state) => state.selectObject)
  const undo = useEditorState((state) => state.undo)
  const redo = useEditorState((state) => state.redo)
  const copySelected = useEditorState((state) => state.copySelected)
  const pasteClipboard = useEditorState((state) => state.pasteClipboard)
  const rotateSelected = useEditorState((state) => state.rotateSelected)
  const duplicateSelected = useEditorState((state) => state.duplicateSelected)
  const alignSelected = useEditorState((state) => state.alignSelected)
  const distributeSelected = useEditorState((state) => state.distributeSelected)
  const nudgeSelected = useEditorState((state) => state.nudgeSelected)
  const deleteSelected = useEditorState((state) => state.deleteSelected)
  const recompute = useEditorState((state) => state.recompute)

  const hotkeys = useMemo<Array<UseHotkeyDefinition>>(
    () => [
      {
        hotkey: "Mod+S",
        callback: onSave,
        options: shortcutOptions("Save", "Project", { ignoreInputs: false }),
      },
      {
        hotkey: "Mod+Z",
        callback: undo,
        options: shortcutOptions("Undo schematic edit", "Project"),
      },
      {
        hotkey: "Mod+Shift+Z",
        callback: redo,
        options: shortcutOptions("Redo schematic edit", "Project"),
      },
      {
        hotkey: "S",
        callback: () => setTool({ type: "select" }),
        options: shortcutOptions("Select tool", "Tools"),
      },
      {
        hotkey: "W",
        callback: () => setTool({ type: "draw-wire", routeMode: "straight" }),
        options: shortcutOptions("Wire tool", "Tools"),
      },
      ...components.flatMap((component) =>
        component.shortcut
          ? [
              {
                hotkey: component.shortcut,
                callback: () =>
                  setTool({ type: "place-component", component: component.type }),
                options: shortcutOptions(`Place ${component.name}`, "Components"),
              },
            ]
          : [],
      ),
      {
        hotkey: "G",
        callback: () => setTool({ type: "place-ground" }),
        options: shortcutOptions("Place ground", "Components"),
      },
      {
        hotkey: "P",
        callback: () => setTool({ type: "place-voltage-probe" }),
        options: shortcutOptions("Place voltage probe", "Measurements"),
      },
      {
        hotkey: "Shift+P",
        callback: () => setTool({ type: "place-current-probe" }),
        options: shortcutOptions("Place current probe", "Measurements"),
      },
      {
        hotkey: "N",
        callback: () => setTool({ type: "place-net-label" }),
        options: shortcutOptions("Place net label", "Measurements"),
      },
      {
        hotkey: "T",
        callback: () => setTool({ type: "place-text" }),
        options: shortcutOptions("Place text note", "Measurements"),
      },
      {
        hotkey: "E",
        callback: rotateSelected,
        options: shortcutOptions("Rotate selected", "Edit"),
      },
      {
        hotkey: "Mod+C",
        callback: copySelected,
        options: shortcutOptions("Copy selected", "Edit"),
      },
      {
        hotkey: "Mod+V",
        callback: () => pasteClipboard(),
        options: shortcutOptions("Paste", "Edit"),
      },
      {
        hotkey: "Shift+D",
        callback: () => duplicateSelected(),
        options: shortcutOptions("Duplicate selected", "Edit"),
      },
      {
        hotkey: "Alt+H",
        callback: () => alignSelected("y"),
        options: shortcutOptions("Align selected horizontally", "Edit"),
      },
      {
        hotkey: "Alt+Shift+H",
        callback: () => alignSelected("x"),
        options: shortcutOptions("Align selected vertically", "Edit"),
      },
      {
        hotkey: "Alt+D",
        callback: () => distributeSelected("x"),
        options: shortcutOptions("Distribute selected horizontally", "Edit"),
      },
      {
        hotkey: "Alt+Shift+D",
        callback: () => distributeSelected("y"),
        options: shortcutOptions("Distribute selected vertically", "Edit"),
      },
      {
        hotkey: "ArrowUp",
        callback: () => nudgeSelected({ x: 0, y: -GRID_SIZE }),
        options: shortcutOptions("Nudge up", "Edit"),
      },
      {
        hotkey: "ArrowDown",
        callback: () => nudgeSelected({ x: 0, y: GRID_SIZE }),
        options: shortcutOptions("Nudge down", "Edit"),
      },
      {
        hotkey: "ArrowLeft",
        callback: () => nudgeSelected({ x: -GRID_SIZE, y: 0 }),
        options: shortcutOptions("Nudge left", "Edit"),
      },
      {
        hotkey: "ArrowRight",
        callback: () => nudgeSelected({ x: GRID_SIZE, y: 0 }),
        options: shortcutOptions("Nudge right", "Edit"),
      },
      {
        hotkey: "Shift+ArrowUp",
        callback: () => nudgeSelected({ x: 0, y: -GRID_SIZE * 5 }),
        options: shortcutOptions("Nudge up five grid steps", "Edit"),
      },
      {
        hotkey: "Shift+ArrowDown",
        callback: () => nudgeSelected({ x: 0, y: GRID_SIZE * 5 }),
        options: shortcutOptions("Nudge down five grid steps", "Edit"),
      },
      {
        hotkey: "Shift+ArrowLeft",
        callback: () => nudgeSelected({ x: -GRID_SIZE * 5, y: 0 }),
        options: shortcutOptions("Nudge left five grid steps", "Edit"),
      },
      {
        hotkey: "Shift+ArrowRight",
        callback: () => nudgeSelected({ x: GRID_SIZE * 5, y: 0 }),
        options: shortcutOptions("Nudge right five grid steps", "Edit"),
      },
      {
        hotkey: "Delete",
        callback: deleteSelected,
        options: shortcutOptions("Delete selected", "Edit"),
      },
      {
        hotkey: "Backspace",
        callback: deleteSelected,
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
        hotkey: "Mod+Enter",
        callback: onRunSimulation,
        options: shortcutOptions("Run SPICE simulation", "Simulation", {
          ignoreInputs: false,
        }),
      },
      {
        hotkey: "Enter",
        callback: recompute,
        options: shortcutOptions("Recompute ERC", "Project"),
      },
      {
        hotkey: "H",
        callback: onOpenHelp,
        options: shortcutOptions("Show shortcuts", "Help"),
      },
    ],
    [
      deleteSelected,
      duplicateSelected,
      distributeSelected,
      copySelected,
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
