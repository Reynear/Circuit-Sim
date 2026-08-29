import { formatForDisplay } from "@tanstack/react-hotkeys"
import { editorShortcutHelp } from "./useEditorShortcuts"

type ShortcutHelpDialogProps = {
  open: boolean
  onClose: () => void
}

export function ShortcutHelpDialog({ open, onClose }: ShortcutHelpDialogProps) {
  if (!open) {
    return null
  }

  const groups = [...new Set(editorShortcutHelp.map((shortcut) => shortcut.group))]
    .map((name) => ({
      name,
      shortcuts: editorShortcutHelp
        .filter((shortcut) => shortcut.group === name)
        .sort((a, b) => a.hotkey.localeCompare(b.hotkey)),
    }))

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="shortcut-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="shortcut-grid">
          {groups.map((group) => (
            <section key={group.name}>
              <h3>{group.name}</h3>
              <ul>
                {group.shortcuts.map((shortcut) => (
                    <li key={`${shortcut.group}-${shortcut.hotkey}`}>
                      <kbd>{displayHotkey(shortcut.hotkey)}</kbd>
                      <span>{shortcut.name}</span>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  )
}

function displayHotkey(hotkey: string): string {
  return hotkey.includes("drag") ? hotkey : formatForDisplay(hotkey)
}
