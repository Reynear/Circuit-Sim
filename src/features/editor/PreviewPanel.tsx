import { useEditorStore } from "../../lib/schematic/editor-store"

export function PreviewPanel() {
  const generatedTsx = useEditorStore((state) => state.generatedTsx)

  if (!generatedTsx.trim()) {
    return (
      <section className="panel-content">
        <p className="muted">Generate a circuit before previewing.</p>
      </section>
    )
  }

  return (
    <section className="panel-content preview-panel">
      <div className="panel-header">
        <div>
          <h2>Preview</h2>
          <p className="muted">
            Generated tscircuit TSX is kept as an artifact of the CircuitProject
            source of truth.
          </p>
        </div>
      </div>
      <pre>{generatedTsx}</pre>
    </section>
  )
}
