import { useLiveQuery } from "dexie-react-hooks"
import { listProjects, loadLatestProjectDocument } from "./project-store"

export function useProjects() {
  return useLiveQuery(() => listProjects(), [], undefined)
}

export function useLatestProject(projectId: string) {
  return useLiveQuery(
    () => loadLatestProjectDocument(projectId),
    [projectId],
    undefined,
  )
}
