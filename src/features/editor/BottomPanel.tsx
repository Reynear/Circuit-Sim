import { lazy, Suspense } from "react"
import { GeneratedCodePanel } from "./GeneratedCodePanel"
import { IssuesPanel } from "./IssuesPanel"
import { MeasurementsPanel } from "./MeasurementsPanel"

const loadPreviewPanel = () =>
  import("./PreviewPanel").then((module) => ({ default: module.PreviewPanel }))
const loadSimulationPanel = () =>
  import("./SimulationPanel").then((module) => ({ default: module.SimulationPanel }))

const LazyPreviewPanel = lazy(loadPreviewPanel)
const LazySimulationPanel = lazy(loadSimulationPanel)

export type BottomTab =
  | "issues"
  | "measurements"
  | "code"
  | "preview"
  | "simulation"

type BottomPanelProps = {
  projectId: string
  activeTab: BottomTab
  onActiveTabChange: (tab: BottomTab) => void
  simulationRunToken: number
}

const tabs: Array<{ id: BottomTab; label: string }> = [
  { id: "issues", label: "Issues" },
  { id: "measurements", label: "Measurements" },
  { id: "code", label: "Code" },
  { id: "preview", label: "Preview" },
  { id: "simulation", label: "Simulation" },
]

const panelPrefetchers: Partial<Record<BottomTab, () => Promise<unknown>>> = {
  preview: loadPreviewPanel,
  simulation: loadSimulationPanel,
}

export function BottomPanel({
  projectId,
  activeTab,
  onActiveTabChange,
  simulationRunToken,
}: BottomPanelProps) {
  return (
    <section className="bottom-panel">
      <nav className="bottom-tabs" aria-label="Editor panels">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-testid={`bottom-tab-${tab.id}`}
            className={tab.id === activeTab ? "tab active" : "tab"}
            onClick={() => onActiveTabChange(tab.id)}
            onFocus={() => void panelPrefetchers[tab.id]?.()}
            onMouseEnter={() => void panelPrefetchers[tab.id]?.()}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="bottom-panel-body">
        {activeTab === "issues" ? <IssuesPanel /> : null}
        {activeTab === "measurements" ? <MeasurementsPanel /> : null}
        {activeTab === "code" ? <GeneratedCodePanel /> : null}
        {activeTab === "preview" ? (
          <Suspense fallback={<PanelLoading label="Loading preview..." />}>
            <LazyPreviewPanel />
          </Suspense>
        ) : null}
        {activeTab === "simulation" ? (
          <Suspense fallback={<PanelLoading label="Loading simulator..." />}>
            <LazySimulationPanel projectId={projectId} runToken={simulationRunToken} />
          </Suspense>
        ) : null}
      </div>
    </section>
  )
}

function PanelLoading({ label }: { label: string }) {
  return (
    <section className="panel-content">
      <p className="muted">{label}</p>
    </section>
  )
}
