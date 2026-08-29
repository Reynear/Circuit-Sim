import { useEditorState } from "@/browser/editor/editor-state"

export function IssuesPanel() {
  const issues = useEditorState((state) => state.ercIssues)

  return (
    <section className="panel-content">
      {issues.length === 0 ? (
        <p className="muted">No ERC issues.</p>
      ) : (
        <ul className="issues-list">
          {issues.map((issue) => (
            <li className={`issue ${issue.severity}`} key={issue.id}>
              <strong>{issue.severity}</strong>
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
