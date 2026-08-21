import { Link } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { BottomPanel, type BottomTab } from "./BottomPanel"
import { ComponentPalette } from "./ComponentPalette"
import { EditorToolbar } from "./EditorToolbar"
import { PropertyInspector } from "./PropertyInspector"
import { SchematicCanvas } from "./SchematicCanvas"
import { ShortcutHelpDialog } from "./ShortcutHelpDialog"
import { useEditorShortcuts } from "./useEditorShortcuts"
import { useLatestProject } from "../../lib/persistence/hooks"
import { saveProjectSnapshot } from "../../lib/persistence/project-store"
import {
  copyPngBlobToClipboard,
  renderSchematicSvgToPngBlob,
  schematicBackgroundColor,
} from "../../lib/schematic/image-export"
import { useEditorStore } from "../../lib/schematic/editor-store"
import type { CircuitProject } from "../../lib/schematic/types"

type CircuitEditorPageProps = {
  projectId: string
}

declare global {
  interface Window {
    __circuitSimTestApi?: {
      setProject(project: CircuitProject): void
      getProject(): CircuitProject | null
    }
  }
}

export function CircuitEditorPage({ projectId }: CircuitEditorPageProps) {
  const latestProject = useLatestProject(projectId)
  const loadedProjectId = useRef<string | null>(null)
  const project = useEditorStore((state) => state.project)
  const activeSheetId = useEditorStore((state) => state.activeSheetId)
  const dirty = useEditorStore((state) => state.dirty)
  const setProject = useEditorStore((state) => state.setProject)
  const markSaved = useEditorStore((state) => state.markSaved)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<BottomTab>("issues")
  const [simulationRunToken, setSimulationRunToken] = useState(0)
  const [imageCopyStatus, setImageCopyStatus] = useState<
    "copied" | "error" | null
  >(null)
  const [showShortcuts, setShowShortcuts] = useState(false)

  useEffect(() => {
    loadedProjectId.current = null
  }, [projectId])

  useEffect(() => {
    if (latestProject && loadedProjectId.current !== latestProject.id) {
      setProject(latestProject)
      loadedProjectId.current = latestProject.id
    }
  }, [latestProject, setProject])

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    window.__circuitSimTestApi = {
      setProject(nextProject) {
        loadedProjectId.current = nextProject.id
        setProject(nextProject, { dirty: true })
      },
      getProject() {
        return useEditorStore.getState().project
      },
    }

    return () => {
      delete window.__circuitSimTestApi
    }
  }, [setProject])

  useEffect(() => {
    if (!project || !dirty) {
      return
    }
    const timeout = window.setTimeout(() => {
      void saveProjectSnapshot(project, "autosave").then(() => markSaved())
    }, 900)
    return () => window.clearTimeout(timeout)
  }, [dirty, markSaved, project])

  async function saveNow() {
    if (!project) {
      return
    }
    setSaving(true)
    try {
      await saveProjectSnapshot(project, "manual")
      markSaved()
    } finally {
      setSaving(false)
    }
  }

  function runDemoSimulation() {
    setActiveTab("simulation")
    setSimulationRunToken((value) => value + 1)
  }

  async function copyCircuitImageToClipboard() {
    const svg = document.querySelector("svg.schematic-canvas")
    if (!(svg instanceof SVGSVGElement)) {
      showImageCopyStatus("error")
      return
    }
    const activeSheet = project?.sheets.find((sheet) => sheet.id === activeSheetId)
    const title = activeSheet
      ? `${project?.name ?? "Circuit"} - ${activeSheet.name}`
      : project?.name
    try {
      const blob = await renderSchematicSvgToPngBlob(svg, {
        backgroundColor: schematicBackgroundColor(svg),
        scale: 2,
        ...(title ? { title } : {}),
      })
      await copyPngBlobToClipboard(blob)
      showImageCopyStatus("copied")
    } catch {
      showImageCopyStatus("error")
    }
  }

  function showImageCopyStatus(status: "copied" | "error") {
    setImageCopyStatus(status)
    window.setTimeout(() => setImageCopyStatus(null), 1600)
  }

  useEditorShortcuts({
    helpOpen: showShortcuts,
    onCloseHelp: () => setShowShortcuts(false),
    onOpenHelp: () => setShowShortcuts(true),
    onRunSimulation: runDemoSimulation,
    onSave: () => void saveNow(),
    onSetTab: setActiveTab,
  })

  if (latestProject === undefined && !project) {
    return (
      <main className="editor-loading">
        <p className="muted">Loading project...</p>
      </main>
    )
  }

  if (latestProject === null && !project) {
    return (
      <main className="editor-loading">
        <h1>Project not found</h1>
        <Link className="primary-link" to="/projects">
          Back to projects
        </Link>
      </main>
    )
  }

  return (
    <main className="editor-page" data-testid="editor-page">
      <EditorToolbar
        onSave={() => void saveNow()}
        saveDisabled={!dirty || saving}
        onShowMeasurements={() => setActiveTab("measurements")}
        onShowSimulation={runDemoSimulation}
        onCopyCircuitImage={() => void copyCircuitImageToClipboard()}
        onShowShortcuts={() => setShowShortcuts(true)}
      />
      <section className="editor-main">
        <ComponentPalette />
        <SchematicCanvas />
        <PropertyInspector />
      </section>
      <BottomPanel
        projectId={projectId}
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        simulationRunToken={simulationRunToken}
      />
      <ShortcutHelpDialog
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
      {imageCopyStatus ? (
        <div className="status-toast" role="status">
          {imageCopyStatus === "copied"
            ? "Image copied to clipboard."
            : "Image clipboard export is not available."}
        </div>
      ) : null}
    </main>
  )
}
