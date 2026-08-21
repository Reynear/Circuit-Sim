import { useEditorStore } from "../../lib/schematic/editor-store"

type EditorToolbarProps = {
  onSave: () => void
  onShowMeasurements: () => void
  onShowSimulation: () => void
  onShowShortcuts: () => void
  onCopyCircuitImage: () => void
  saveDisabled?: boolean
}

export function EditorToolbar({
  onSave,
  onShowMeasurements,
  onShowSimulation,
  onShowShortcuts,
  onCopyCircuitImage,
  saveDisabled = false,
}: EditorToolbarProps) {
  const issueCount = useEditorStore((state) => state.ercIssues.length)
  const recompute = useEditorStore((state) => state.recompute)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const copySelected = useEditorStore((state) => state.copySelected)
  const pasteClipboard = useEditorStore((state) => state.pasteClipboard)
  const rotateSelected = useEditorStore((state) => state.rotateSelected)
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected)
  const alignSelected = useEditorStore((state) => state.alignSelected)
  const distributeSelected = useEditorStore((state) => state.distributeSelected)
  const deleteSelected = useEditorStore((state) => state.deleteSelected)
  const selectedObjectIds = useEditorStore((state) => state.selectedObjectIds)
  const project = useEditorStore((state) => state.project)
  const activeSheetId = useEditorStore((state) => state.activeSheetId)
  const canUndo = useEditorStore((state) => state.historyPast.length > 0)
  const canRedo = useEditorStore((state) => state.historyFuture.length > 0)
  const canPaste = useEditorStore((state) => state.clipboardObjects.length > 0)
  const selectedId = selectedObjectIds[0]
  const activeSheet = project?.sheets.find((sheet) => sheet.id === activeSheetId)

  return (
    <header className="editor-toolbar">
      <div className="editor-actionbar">
        <div className="toolbar-group">
          <span className="sheet-readout" data-testid="active-sheet-readout">
            Sheet: {activeSheet?.name ?? "None"}
          </span>
          <button className="button primary" onClick={onSave} disabled={saveDisabled}>
            Save
          </button>
          <button className="button" onClick={recompute}>
            ERC <span className="badge">{issueCount}</span>
          </button>
          <button className="button" onClick={recompute}>
            Generate
          </button>
          <button className="button" onClick={onShowMeasurements}>
            Measurements
          </button>
          <button className="button" onClick={onCopyCircuitImage}>
            Copy Image
          </button>
          <button
            className="button"
            data-testid="run-spice-simulation"
            onClick={onShowSimulation}
          >
            Run SPICE Simulation
          </button>
          <button className="button" onClick={onShowShortcuts}>
            Shortcuts
          </button>
        </div>
        <div className="toolbar-group">
          <button
            aria-label="Undo"
            className="button icon-button"
            disabled={!canUndo}
            onClick={undo}
          >
            Undo
          </button>
          <button
            aria-label="Redo"
            className="button icon-button"
            disabled={!canRedo}
            onClick={redo}
          >
            Redo
          </button>
          <button className="button" disabled={!selectedId} onClick={copySelected}>
            Copy
          </button>
          <button
            className="button"
            disabled={!canPaste}
            onClick={() => pasteClipboard()}
          >
            Paste
          </button>
          <button
            className="button"
            disabled={!selectedId}
            onClick={rotateSelected}
          >
            Rotate
          </button>
          <button
            className="button"
            disabled={!selectedId}
            onClick={() => duplicateSelected()}
          >
            Duplicate
          </button>
          <button
            className="button"
            disabled={selectedObjectIds.length < 2}
            onClick={() => alignSelected("y")}
          >
            Align H
          </button>
          <button
            className="button"
            disabled={selectedObjectIds.length < 2}
            onClick={() => alignSelected("x")}
          >
            Align V
          </button>
          <button
            className="button"
            disabled={selectedObjectIds.length < 3}
            onClick={() => distributeSelected("x")}
          >
            Dist H
          </button>
          <button
            className="button"
            disabled={selectedObjectIds.length < 3}
            onClick={() => distributeSelected("y")}
          >
            Dist V
          </button>
          <button className="button danger" disabled={!selectedId} onClick={deleteSelected}>
            Delete
          </button>
        </div>
      </div>
    </header>
  )
}
