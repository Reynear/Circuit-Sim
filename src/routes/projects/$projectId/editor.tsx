import { createFileRoute } from "@tanstack/react-router"
import { CircuitEditorPage } from "../../../features/editor/CircuitEditorPage"

export const Route = createFileRoute("/projects/$projectId/editor")({
  ssr: false,
  component: EditorRoute,
})

function EditorRoute() {
  const { projectId } = Route.useParams()
  return <CircuitEditorPage projectId={projectId} />
}
