import { useState } from "react"
import { useEditorStore } from "../../lib/schematic/editor-store"

export function GeneratedCodePanel() {
  const generatedTsx = useEditorStore((state) => state.generatedTsx)
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    await navigator.clipboard.writeText(generatedTsx)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <section className="panel-content code-panel">
      <div className="panel-header">
        <h2>Generated tscircuit TSX</h2>
        <button className="button" onClick={() => void copyCode()} disabled={!generatedTsx}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{generatedTsx || "No generated TSX yet."}</pre>
    </section>
  )
}
