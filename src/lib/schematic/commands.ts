import type { CircuitProject, SchematicObject } from "./types"

export function cloneProject(project: CircuitProject): CircuitProject {
  return structuredClone(project)
}

export function updateProjectObjects(
  project: CircuitProject,
  sheetId: string,
  updater: (objects: SchematicObject[]) => SchematicObject[],
): CircuitProject {
  const updatedAt = new Date().toISOString()
  return {
    ...project,
    updatedAt,
    sheets: project.sheets.map((sheet) =>
      sheet.id === sheetId
        ? { ...sheet, objects: updater(sheet.objects) }
        : sheet,
    ),
  }
}
