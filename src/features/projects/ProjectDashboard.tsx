import { Link, useNavigate } from "@tanstack/react-router"
import { Cause, DateTime, Exit, Option } from "effect"
import { RegistryProvider, useAtom, useAtomValue } from "@effect/atom-react"
import { useEffect, useState } from "react"
import {
  createProjectAtom,
  deleteProjectAtom,
  projectListAtom,
} from "@/browser/persistence/atoms"
import {
  createRcLowPassExample,
  createSourceToGroundExample,
  createVoltageDividerExample,
} from "@/examples/circuit-projects"
import { newCircuitProject } from "@circuit-sim/core/circuit/project"

export function ProjectDashboard() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  if (!hydrated) {
    return <ProjectDashboardLoading />
  }

  return (
    <RegistryProvider>
      <ProjectDashboardContent />
    </RegistryProvider>
  )
}

function ProjectDashboardLoading() {
  return (
    <main className="projects-page" data-testid="projects-page">
      <p className="muted">Loading projects...</p>
    </main>
  )
}

function ProjectDashboardContent() {
  const projectList = useAtomValue(projectListAtom)
  const [createResult, runCreate] = useAtom(createProjectAtom, {
    mode: "promiseExit",
  })
  const [deleteResult, runDelete] = useAtom(deleteProjectAtom, {
    mode: "promiseExit",
  })
  const navigate = useNavigate()
  const [navigationError, setNavigationError] = useState(false)
  const busy = createResult.waiting || deleteResult.waiting

  async function createAndOpen(kind: "empty" | "source-ground" | "rc" | "divider") {
    const project =
      kind === "empty"
        ? newCircuitProject()
        : kind === "source-ground"
          ? createSourceToGroundExample()
          : kind === "rc"
            ? createRcLowPassExample()
            : createVoltageDividerExample()
    setNavigationError(false)
    const created = await runCreate(project)
    if (Exit.isFailure(created)) {
      return
    }
    try {
      await navigate({
        to: "/projects/$projectId/editor",
        params: { projectId: project.id },
      })
    } catch {
      setNavigationError(true)
    }
  }

  async function removeProject(projectId: string) {
    await runDelete(projectId)
  }

  const projectListError =
    projectList._tag === "Failure"
      ? Option.getOrUndefined(Cause.findErrorOption(projectList.cause))
      : undefined
  const mutationError =
    createResult._tag === "Failure"
      ? "Project could not be created. Local storage is unavailable."
      : deleteResult._tag === "Failure"
        ? "Project could not be deleted. Local storage is unavailable."
        : navigationError
          ? "Project was created, but the editor could not be opened."
          : null

  return (
    <main className="projects-page" data-testid="projects-page">
      <header className="projects-header">
        <div>
          <h1>Projects</h1>
          <p>Local IndexedDB-backed circuit documents.</p>
        </div>
        <div className="button-row">
          <Link className="button primary" to="/workbench">
            Agent Workbench
          </Link>
          <button
            className="button primary"
            data-testid="new-empty-project"
            disabled={busy}
            onClick={() => void createAndOpen("empty")}
          >
            New Empty Project
          </button>
          <button
            className="button"
            data-testid="new-source-ground-project"
            disabled={busy}
            onClick={() => void createAndOpen("source-ground")}
          >
            New Source-to-Ground Demo
          </button>
          <button
            className="button"
            data-testid="new-rc-project"
            disabled={busy}
            onClick={() => void createAndOpen("rc")}
          >
            New RC Low-Pass Demo
          </button>
          <button
            className="button"
            data-testid="new-divider-project"
            disabled={busy}
            onClick={() => void createAndOpen("divider")}
          >
            New Voltage Divider Demo
          </button>
        </div>
      </header>

      {mutationError ? (
        <p className="issue error persistence-alert" role="alert">
          {mutationError}
        </p>
      ) : null}

      <section className="project-list">
        {projectList._tag === "Initial" ? (
          <p className="muted">Loading projects...</p>
        ) : projectList._tag === "Failure" ? (
          <p className="issue error" role="alert">
            {projectListError?._tag === "InvalidProjectSummary"
              ? "The local project index contains invalid data."
              : "Projects could not be loaded. Local storage is unavailable."}
          </p>
        ) : projectList.value.length === 0 ? (
          <p className="muted">No projects yet.</p>
        ) : (
          projectList.value.map((project) => (
            <article className="project-row" key={project.id}>
              <div>
                <h2>{project.name}</h2>
                <p>
                  Updated {DateTime.toDate(project.updatedAt).toLocaleString()} ·{" "}
                  {project.id}
                </p>
              </div>
              <div className="button-row">
                <Link
                  className="button primary"
                  to="/projects/$projectId/editor"
                  params={{ projectId: project.id }}
                >
                  Open
                </Link>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() => void removeProject(project.id)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  )
}
