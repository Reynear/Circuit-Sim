import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router"
import { ProjectDashboard } from "../features/projects/ProjectDashboard"

export const Route = createFileRoute("/projects")({
  component: ProjectsRoute,
})

function ProjectsRoute() {
  const location = useLocation()
  return location.pathname === "/projects" ? <ProjectDashboard /> : <Outlet />
}
