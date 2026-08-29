import { lazy, Suspense } from "react"
import { IssuesPanel } from "./IssuesPanel"
import { MeasurementsPanel } from "./MeasurementsPanel"
import { AgentConsolePanel } from "./AgentConsolePanel"

const loadSimulationPanel = () =>
  import("./SimulationPanel").then((module) => ({ default: module.SimulationPanel }))

const LazySimulationPanel = lazy(loadSimulationPanel)

export type BottomTab =
  | "issues"
  | "measurements"
  | "simulation"
  | "console"

type BottomPanelProps = {
  activeTab: BottomTab
  onActiveTabChange: (tab: BottomTab) => void
  simulationRunToken: number
}

const tabs: Array<{
  id: BottomTab
  label: string
  prefetch?: () => Promise<unknown>
}> = [
  { id: "issues", label: "Issues" },
  { id: "measurements", label: "Measurements" },
  { id: "simulation", label: "Simulation", prefetch: loadSimulationPanel },
  { id: "console", label: "Console" },
]

export function BottomPanel({
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
            onFocus={() => void tab.prefetch?.()}
            onMouseEnter={() => void tab.prefetch?.()}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="bottom-panel-body">
        {activeTab === "issues" ? <IssuesPanel /> : null}
        {activeTab === "measurements" ? <MeasurementsPanel /> : null}
        {activeTab === "console" ? <AgentConsolePanel /> : null}
        {activeTab === "simulation" ? (
          <Suspense fallback={<PanelLoading label="Loading simulator..." />}>
            <LazySimulationPanel runToken={simulationRunToken} />
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
