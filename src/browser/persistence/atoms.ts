import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { CircuitProject } from "@circuit-sim/core/circuit/project"
import {
  createProject,
  deleteProject,
  listProjects,
  loadLatestProject,
  saveProjectSnapshot,
} from "./project-store"
import type { SnapshotReason } from "./db"

export const projectListAtom = Atom.make(() => listProjects())

export const projectAtom = Atom.family((projectId: string) =>
  Atom.make(loadLatestProject(projectId)),
)

export const createProjectAtom = Atom.fn<CircuitProject>()((project, get) =>
  createProject(project).pipe(
    Effect.tap(() => Effect.sync(() => get.refresh(projectListAtom))),
  ),
)

export const deleteProjectAtom = Atom.fn<string>()((projectId, get) =>
  deleteProject(projectId).pipe(
    Effect.tap(() => Effect.sync(() => get.refresh(projectListAtom))),
  ),
)

export type SaveProjectRequest = {
  readonly project: CircuitProject
  readonly reason: SnapshotReason
  readonly delayMillis?: number
}

export const saveProjectAtom = Atom.fn<SaveProjectRequest>()((request) =>
  Effect.gen(function*() {
    if (request.delayMillis !== undefined) {
      yield* Effect.sleep(`${request.delayMillis} millis`)
    }
    return yield* saveProjectSnapshot(request.project, request.reason)
  }),
)
