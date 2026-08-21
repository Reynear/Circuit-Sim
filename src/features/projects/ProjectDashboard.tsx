import { Link, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import {
  createDemoRcLowPassProject,
  createDemoSourceToGroundProject,
  createDemoVoltageDividerProject,
  createEmptyProject,
} from "../../lib/schematic/create-default-project"
import { useProjects } from "../../lib/persistence/hooks"
import {
  createProject,
  deleteProject,
} from "../../lib/persistence/project-store"

export function ProjectDashboard() {
  const projects = useProjects()
  const navigate = useNavigate()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  async function createAndOpen(kind: "empty" | "source-ground" | "rc" | "divider") {
    const project =
      kind === "empty"
        ? createEmptyProject()
        : kind === "source-ground"
          ? createDemoSourceToGroundProject()
          : kind === "rc"
            ? createDemoRcLowPassProject()
            : createDemoVoltageDividerProject()
    await createProject(project)
    await navigate({
      to: "/projects/$projectId/editor",
      params: { projectId: project.id },
    })
  }

  return (
    <main className="projects-page" data-testid="projects-page">
      <header className="projects-header">
        <div>
          <h1>Projects</h1>
          <p>Local IndexedDB-backed circuit documents.</p>
        </div>
        <div className="button-row">
          <button
            className="button primary"
            data-testid="new-empty-project"
            disabled={!hydrated}
            onClick={() => void createAndOpen("empty")}
          >
            New Empty Project
          </button>
          <button
            className="button"
            data-testid="new-source-ground-project"
            disabled={!hydrated}
            onClick={() => void createAndOpen("source-ground")}
          >
            New Source-to-Ground Demo
          </button>
          <button
            className="button"
            data-testid="new-rc-project"
            disabled={!hydrated}
            onClick={() => void createAndOpen("rc")}
          >
            New RC Low-Pass Demo
          </button>
          <button
            className="button"
            data-testid="new-divider-project"
            disabled={!hydrated}
            onClick={() => void createAndOpen("divider")}
          >
            New Voltage Divider Demo
          </button>
        </div>
      </header>

      <section className="project-list">
        {projects === undefined ? (
          <p className="muted">Loading projects...</p>
        ) : projects.length === 0 ? (
          <p className="muted">No projects yet.</p>
        ) : (
          projects.map((project) => (
            <article className="project-row" key={project.id}>
              <div>
                <h2>{project.name}</h2>
                <p>
                  Updated {new Date(project.updatedAt).toLocaleString()} · {project.id}
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
                  onClick={() => void deleteProject(project.id)}
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
