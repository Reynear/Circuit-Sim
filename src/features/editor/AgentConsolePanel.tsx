import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react"
import { buildAgentWorkspace, type AgentWorkspace } from "@circuit-sim/core/agent/workspace"
import { interpretAgentCommand } from "@circuit-sim/core/agent/interpreter"
import { useEditorState } from "@/browser/editor/editor-state"

type ConsoleEntry = {
  id: number
  command: string
  output: string
}

/**
 * Deterministic CLI front over the agent command core. The same commands and
 * byte-for-byte the same output an agent receives through MCP; typing here is
 * the verification loop.
 */
export function AgentConsolePanel() {
  const project = useEditorState((state) => state.project)
  const workspace = useMemo(
    () => (project ? buildAgentWorkspace(project) : null),
    [project],
  )

  if (!workspace) {
    return (
      <section className="panel-content">
        <p className="muted">No circuit is loaded.</p>
      </section>
    )
  }
  return <Console workspace={workspace} />
}

function Console({ workspace }: { workspace: AgentWorkspace }) {
  const [entries, setEntries] = useState<ConsoleEntry[]>([])
  const [input, setInput] = useState("")
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const nextIdRef = useRef(1)
  const outputEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ block: "nearest" })
  }, [entries])

  const history = entries
    .map((entry) => entry.command)
    .filter((command) => command.trim().length > 0)

  function submit(event: FormEvent) {
    event.preventDefault()
    const command = input.trim()
    if (!command) {
      return
    }
    const output = interpretAgentCommand(command, { workspace })
    setEntries((current) => [
      ...current,
      { id: nextIdRef.current++, command, output },
    ])
    setInput("")
    setHistoryIndex(null)
  }

  function navigateHistory(event: KeyboardEvent<HTMLInputElement>) {
    if (history.length === 0) {
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      const nextIndex =
        historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(nextIndex)
      setInput(history[nextIndex] ?? "")
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      if (historyIndex === null) {
        return
      }
      const nextIndex = historyIndex + 1
      if (nextIndex >= history.length) {
        setHistoryIndex(null)
        setInput("")
      } else {
        setHistoryIndex(nextIndex)
        setInput(history[nextIndex] ?? "")
      }
    }
  }

  return (
    <section className="panel-content agent-console" data-testid="agent-console">
      <div className="panel-header">
        <div>
          <h2>Agent Console</h2>
          <p className="muted">
            Circuit {workspace.circuitHash} · read-only circuit commands · try
            `circuit help`
          </p>
        </div>
      </div>

      <div className="agent-console-output" data-testid="agent-console-output">
        {entries.length === 0 ? (
          <p className="muted">
            No commands yet. Read /README.md or /circuit.txt, then query
            topology with `circuit` commands.
          </p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="agent-console-entry">
              <pre className="agent-console-command">{entry.command}</pre>
              <pre className="agent-console-result">{entry.output}</pre>
            </div>
          ))
        )}
        <div ref={outputEndRef} />
      </div>

      <form className="agent-console-form" onSubmit={submit}>
        <input
          data-testid="agent-console-input"
          type="text"
          value={input}
          placeholder="circuit help"
          aria-label="Agent command"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={navigateHistory}
        />
        <button type="submit">Run</button>
      </form>
    </section>
  )
}
