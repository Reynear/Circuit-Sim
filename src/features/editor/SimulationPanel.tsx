import { useServerFn } from "@tanstack/react-start"
import { useEffect, useState } from "react"
import { WaveformChart } from "./WaveformChart"
import { createId } from "../../lib/ids"
import { recordSimulationRun } from "../../lib/persistence/project-store"
import type { SimulationMetric, SimulationResult } from "../../lib/simulation/types"
import { useEditorStore } from "../../lib/schematic/editor-store"
import { runSpiceSimulationOnServer } from "../../server/simulation/spice.functions"

type SpiceEnginePreference = "auto" | "ngspice" | "spicey"

export function SimulationPanel({
  projectId,
  runToken,
}: {
  projectId: string
  runToken: number
}) {
  const project = useEditorStore((state) => state.project)
  const runServerSimulation = useServerFn(runSpiceSimulationOnServer)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [metric, setMetric] = useState<SimulationMetric>("voltage")
  const [targetId, setTargetId] = useState("all")
  const [engine, setEngine] = useState<SpiceEnginePreference>("auto")
  const [running, setRunning] = useState(false)

  async function runSimulation() {
    if (!project) {
      return
    }
    setRunning(true)
    try {
      const nextResult = (await runServerSimulation({
        data: { project, engine },
      })) as SimulationResult
      setResult(nextResult)
      setMetric(firstMetric(nextResult) ?? "voltage")
      setTargetId("all")
      await recordSimulationRun({
        projectId,
        config: project.simulations[0] ?? null,
        result: nextResult,
      })
    } catch (error) {
      const failedResult = clientSimulationFailure(error, engine)
      setResult(failedResult)
      setMetric("voltage")
      setTargetId("all")
      await recordSimulationRun({
        projectId,
        config: project.simulations[0] ?? null,
        result: failedResult,
      })
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    if (runToken > 0) {
      void runSimulation()
    }
  }, [runToken])

  const metrics = result ? availableMetrics(result) : []
  const metricOptions = metrics.length > 0 ? metrics : [metric]
  const targets = result ? availableTargets(result, metric) : []
  const visibleTraces =
    result?.traces.filter(
      (trace) =>
        (trace.metric ?? "voltage") === metric &&
        (targetId === "all" || (trace.targetId ?? trace.name) === targetId),
    ) ?? []

  return (
    <section className="panel-content simulation-panel" data-testid="simulation-panel">
      <div className="panel-header">
        <div>
          <h2>SPICE Simulation</h2>
          <p className="muted">
            Engine: {result?.engine ?? engine} · status: {result?.status ?? "not run"}
          </p>
          <p className="muted">
            Production path: generate netlist, execute in the TanStack server runtime,
            parse traces/errors, and return diagnostics to the browser.
          </p>
        </div>
        <div className="simulation-run-controls">
          <label>
            Engine
            <select
              value={engine}
              onChange={(event) => setEngine(event.target.value as SpiceEnginePreference)}
            >
              <option value="auto">Auto</option>
              <option value="ngspice">ngspice</option>
              <option value="spicey">spicey fallback</option>
            </select>
          </label>
          <button
            className="button primary"
            data-testid="run-spice-simulation"
            disabled={running}
            onClick={() => void runSimulation()}
          >
            {running ? "Running..." : "Run SPICE Simulation"}
          </button>
        </div>
      </div>
      {result ? (
        <>
          <SimulationStatus result={result} />
          <div className="simulation-controls">
            <label>
              Metric
              <select
                value={metric}
                onChange={(event) => {
                  const nextMetric = event.target.value as SimulationMetric
                  setMetric(nextMetric)
                  setTargetId("all")
                }}
              >
                {metricOptions.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {metricLabel(candidate)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Component / Node
              <select
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
              >
                <option value="all">All</option>
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <WaveformChart traces={visibleTraces} />
          {result.netlist ? (
            <details className="spice-netlist">
              <summary>SPICE netlist</summary>
              <pre>{result.netlist}</pre>
            </details>
          ) : null}
          {result.diagnostics?.rawOutput ? (
            <details className="spice-netlist">
              <summary>Raw simulator output</summary>
              <pre>{result.diagnostics.rawOutput}</pre>
            </details>
          ) : null}
          <ul className="notes-list">
            {result.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">No simulation run yet.</p>
      )}
    </section>
  )
}

function clientSimulationFailure(
  error: unknown,
  engine: SpiceEnginePreference,
): SimulationResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    id: createId("sim"),
    createdAt: new Date().toISOString(),
    kind: "spice",
    engine: engine === "spicey" ? "spicey" : "ngspice",
    status: "failed",
    traces: [],
    notes: [
      "The server simulation request failed before a simulator result was returned.",
      "Check server logs, NGSPICE_BIN, runtime limits, and deployment sandbox permissions.",
    ],
    diagnostics: {
      warnings: [],
      errors: [message],
      suggestions: [
        "Retry with the spicey fallback engine to separate netlist issues from ngspice runtime issues.",
      ],
      unsupportedComponents: [],
      floatingPins: [],
    },
  }
}

function SimulationStatus({ result }: { result: SimulationResult }) {
  const diagnostics = result.diagnostics
  if (!diagnostics) {
    return null
  }
  if (
    diagnostics.errors.length === 0 &&
    diagnostics.warnings.length === 0 &&
    (diagnostics.suggestions?.length ?? 0) === 0 &&
    diagnostics.unsupportedComponents.length === 0 &&
    diagnostics.floatingPins.length === 0
  ) {
    return <p className="issue info">Simulation completed without diagnostics.</p>
  }
  return (
    <div className={result.status === "failed" ? "issue error" : "issue warning"}>
      <strong>
        {result.status === "failed" ? "Simulation failed" : "Simulation diagnostics"}
      </strong>
      <ul>
        {diagnostics.errors.map((message) => (
          <li key={`error-${message}`}>{message}</li>
        ))}
        {diagnostics.warnings.map((message) => (
          <li key={`warning-${message}`}>{message}</li>
        ))}
        {diagnostics.suggestions?.map((message) => (
          <li key={`suggestion-${message}`}>Suggestion: {message}</li>
        ))}
        {diagnostics.unsupportedComponents.length > 0 ? (
          <li>Unsupported components: {diagnostics.unsupportedComponents.join(", ")}</li>
        ) : null}
        {diagnostics.floatingPins.length > 0 ? (
          <li>Floating pins: {diagnostics.floatingPins.join(", ")}</li>
        ) : null}
      </ul>
    </div>
  )
}

function availableMetrics(result: SimulationResult): SimulationMetric[] {
  const metrics = new Set(
    result.traces.map((trace) => trace.metric ?? "voltage"),
  )
  return (["voltage", "current", "power"] as SimulationMetric[]).filter((metric) =>
    metrics.has(metric),
  )
}

function firstMetric(result: SimulationResult): SimulationMetric | null {
  return result.traces[0]?.metric ?? null
}

function availableTargets(
  result: SimulationResult,
  metric: SimulationMetric,
): Array<{ id: string; name: string }> {
  const targets = new Map<string, string>()
  for (const trace of result.traces) {
    if ((trace.metric ?? "voltage") !== metric) {
      continue
    }
    const id = trace.targetId ?? trace.name
    targets.set(id, trace.targetName ?? trace.name)
  }
  return [...targets.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function metricLabel(metric: SimulationMetric): string {
  switch (metric) {
    case "current":
      return "Current"
    case "power":
      return "Power"
    default:
      return "Voltage"
  }
}
