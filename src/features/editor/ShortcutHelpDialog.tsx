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

  const grouped = editorShortcutHelp.reduce<Record<string, typeof editorShortcutHelp>>(
    (groups, shortcut) => {
      const group = shortcut.group
      return {
        ...groups,
        [group]: [...(groups[group] ?? []), shortcut],
      }
    },
    {},
  )

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
          {Object.entries(grouped).map(([group, registrations]) => (
            <section key={group}>
              <h3>{group}</h3>
              <ul>
                {registrations
                  .sort((a, b) => a.hotkey.localeCompare(b.hotkey))
                  .map((shortcut) => (
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
