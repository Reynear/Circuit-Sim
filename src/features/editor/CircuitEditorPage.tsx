import { Link } from "@tanstack/react-router"
import { Cause, Exit, Option } from "effect"
import { useContext, useEffect, useRef, useState } from "react"
import { RegistryContext, useAtom, useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { BottomPanel, type BottomTab } from "./BottomPanel"
import { ComponentPalette } from "./ComponentPalette"
import { EditorToolbar } from "./EditorToolbar"
import { PropertyInspector } from "./PropertyInspector"
import { SchematicCanvas } from "./SchematicCanvas"
import { ShortcutHelpDialog } from "./ShortcutHelpDialog"
import { useEditorShortcuts } from "./useEditorShortcuts"
import {
  projectAtom,
  saveProjectAtom,
} from "@/browser/persistence/atoms"
import {
  copyPngBlobToClipboard,
  renderSchematicSvgToPngBlob,
  schematicBackgroundColor,
} from "@/browser/export/image-export"
import {
  EditorAtomProvider,
  getEditorState,
  useEditorState,
} from "@/browser/editor/editor-state"
import {
  useCircuitWebMcp,
  type WebMcpRegistrationState,
} from "@/browser/webmcp/use-circuit-webmcp"
import type { CircuitProject } from "@circuit-sim/core/circuit/project"

type CircuitEditorPageProps = {
  projectId: string
  registry?: import("effect/unstable/reactivity/AtomRegistry").AtomRegistry
}

declare global {
  interface Window {
    __circuitSimTestApi?: {
      setProject(project: CircuitProject): void
      getProject(): CircuitProject | null
    }
  }
}

export function CircuitEditorPage({ registry, ...props }: CircuitEditorPageProps) {
  return (
    <EditorAtomProvider {...(registry ? { registry } : {})}>
      <CircuitEditorPageContent {...props} />
    </EditorAtomProvider>
  )
}

function CircuitEditorPageContent({ projectId }: CircuitEditorPageProps) {
  const registry = useContext(RegistryContext)
  const latestProject = useAtomValue(projectAtom(projectId))
  const [saveResult, saveProject] = useAtom(saveProjectAtom, {
    mode: "promiseExit",
  })
  const loadedProjectId = useRef<string | null>(null)
  const project = useEditorState((state) => state.project)
  const dirty = useEditorState((state) => state.dirty)
  const setProject = useEditorState((state) => state.setProject)
  const clearProject = useEditorState((state) => state.clearProject)
  const markSaved = useEditorState((state) => state.markSaved)
  const [activeTab, setActiveTab] = useState<BottomTab>("issues")
  const [simulationRunToken, setSimulationRunToken] = useState(0)
  const [imageCopyStatus, setImageCopyStatus] = useState<
    "copied" | "error" | null
  >(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [agentActivity, setAgentActivity] = useState<string | null>(null)
  const webMcpState = useCircuitWebMcp({
    registry,
    onActivity(activity) {
      setAgentActivity(activity.message)
      if (activity.panel) setActiveTab(activity.panel)
    },
  })

  useEffect(() => {
    loadedProjectId.current = null
    clearProject()
  }, [clearProject, projectId])

  useEffect(() => {
    if (
      latestProject._tag === "Success" &&
      Option.isSome(latestProject.value) &&
      loadedProjectId.current !== latestProject.value.value.id
    ) {
      setProject(latestProject.value.value)
      loadedProjectId.current = latestProject.value.value.id
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
        return getEditorState(registry).project
      },
    }

    return () => {
      delete window.__circuitSimTestApi
    }
  }, [registry, setProject])

  useEffect(() => {
    if (!project || !dirty) {
      return
    }
    void saveProject({
      project,
      reason: "autosave",
      delayMillis: 900,
    }).then((saved) => {
      if (Exit.isSuccess(saved)) {
        markSaved(project)
      }
    })
  }, [dirty, markSaved, project, saveProject])

  useEffect(() => {
    if (!agentActivity) return
    const timeout = window.setTimeout(() => setAgentActivity(null), 2600)
    return () => window.clearTimeout(timeout)
  }, [agentActivity])

  async function saveNow() {
    if (!project) {
      return
    }
    const saved = await saveProject({ project, reason: "manual" })
    if (Exit.isSuccess(saved)) {
      markSaved(project)
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
    const title = project
      ? project.name
      : undefined
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

  const loadError =
    latestProject._tag === "Failure"
      ? Option.getOrUndefined(Cause.findErrorOption(latestProject.cause))
      : undefined

  if (latestProject._tag === "Initial" && project?.id !== projectId) {
    return (
      <main className="editor-loading">
        <p className="muted">Loading project...</p>
      </main>
    )
  }

  if (
    latestProject._tag === "Success" &&
    Option.isNone(latestProject.value)
  ) {
    return (
      <main className="editor-loading">
        <h1>Project not found</h1>
        <Link className="primary-link" to="/projects">
          Back to projects
        </Link>
      </main>
    )
  }

  if (loadError?._tag === "InvalidProjectDocument") {
    return (
      <main className="editor-loading">
        <h1>Project document is invalid</h1>
        <p className="muted">
          This project was saved in an incompatible or malformed format.
        </p>
        <details>
          <summary>Validation details</summary>
          <pre>{loadError.details}</pre>
        </details>
        <Link className="primary-link" to="/projects">
          Back to projects
        </Link>
      </main>
    )
  }

  if (loadError?._tag === "InvalidProjectSummary") {
    return (
      <main className="editor-loading">
        <h1>Project metadata is invalid</h1>
        <p className="muted">
          This project has a malformed local-storage index record.
        </p>
        <details>
          <summary>Validation details</summary>
          <pre>{loadError.details}</pre>
        </details>
        <Link className="primary-link" to="/projects">
          Back to projects
        </Link>
      </main>
    )
  }

  if (latestProject._tag === "Failure") {
    return (
      <main className="editor-loading">
        <h1>Project could not be loaded</h1>
        <p className="muted">Local storage is unavailable.</p>
        <Link className="primary-link" to="/projects">
          Back to projects
        </Link>
      </main>
    )
  }

  return (
    <main
      className="editor-page"
      data-testid="editor-page"
      data-save-state={saveResult.waiting ? "saving" : dirty ? "dirty" : "saved"}
    >
      <EditorToolbar
        onSave={() => void saveNow()}
        saveDisabled={!dirty || saveResult.waiting}
        onShowMeasurements={() => setActiveTab("measurements")}
        onShowSimulation={runDemoSimulation}
        onCopyCircuitImage={() => void copyCircuitImageToClipboard()}
        onShowShortcuts={() => setShowShortcuts(true)}
      />
      <WebMcpStatus state={webMcpState} />
      {saveResult._tag === "Failure" &&
      !AsyncResult.isInterrupted(saveResult) ? (
        <p className="issue error persistence-alert" role="alert">
          Project could not be saved. Local storage is unavailable.
        </p>
      ) : null}
      <section className="editor-main">
        <ComponentPalette />
        <SchematicCanvas />
        <PropertyInspector />
      </section>
      <BottomPanel
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
      {agentActivity ? (
        <div className="status-toast agent-activity-toast" role="status">
          {agentActivity}
        </div>
      ) : null}
    </main>
  )
}

function WebMcpStatus({ state }: { state: WebMcpRegistrationState }) {
  if (state === "unsupported" || state === "checking") return null
  return (
    <div
      className={`webmcp-status ${state}`}
      data-testid="webmcp-status"
      role="status"
    >
      {state === "ready"
        ? "Agent-ready · 4 WebMCP site tools are live on this circuit"
        : "WebMCP site tools could not be registered in this browser"}
    </div>
  )
}
