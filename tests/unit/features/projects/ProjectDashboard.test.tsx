import { Effect } from "effect"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ProjectDashboard } from "@/features/projects/ProjectDashboard"

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  listProjects: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => mocks.navigate,
}))

vi.mock("@/browser/persistence/project-store", () => ({
  createProject: mocks.createProject,
  deleteProject: mocks.deleteProject,
  listProjects: mocks.listProjects,
}))

describe("ProjectDashboard", () => {
  beforeEach(() => {
    mocks.createProject.mockReset()
    mocks.createProject.mockReturnValue(Effect.succeed({}))
    mocks.deleteProject.mockReset()
    mocks.deleteProject.mockReturnValue(Effect.void)
    mocks.listProjects.mockReset()
    mocks.listProjects.mockReturnValue(Effect.succeed([]))
    mocks.navigate.mockReset()
  })

  it("shows project-list loading failures", async () => {
    mocks.listProjects.mockReturnValue(
      Effect.fail({ _tag: "ProjectPersistenceError" }),
    )

    render(<ProjectDashboard />)

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Projects could not be loaded",
    )
  })

  it("shows invalid project-index data", async () => {
    mocks.listProjects.mockReturnValue(
      Effect.fail({ _tag: "InvalidProjectSummary", details: "SchemaError" }),
    )

    render(<ProjectDashboard />)

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "project index contains invalid data",
    )
  })

  it("shows project creation failures", async () => {
    mocks.createProject.mockReturnValue(
      Effect.fail({ _tag: "ProjectPersistenceError" }),
    )
    const user = userEvent.setup()
    render(<ProjectDashboard />)

    await user.click(await screen.findByTestId("new-empty-project"))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Project could not be created",
    )
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
