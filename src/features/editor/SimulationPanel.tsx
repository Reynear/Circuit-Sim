import { useServerFn } from "@tanstack/react-start"
import { Cause, Option, Schema } from "effect"
import { useAtom } from "@effect/atom-react"
import { useEffect, useMemo, useState } from "react"
import { WaveformChart } from "./WaveformChart"
import type {
  SimulationOutput,
  SpiceEnginePreference,
} from "@circuit-sim/core/simulation/result"
import {
  simulationStatus,
  SpiceEnginePreferenceSchema,
} from "@circuit-sim/core/simulation/result"
import {
  availableSignalMetrics,
  availableSignalTargets,
  displaySignals,
  firstSignalMetric,
  parseSignalMetric,
  signalTarget,
  type SignalMetric,
} from "@circuit-sim/core/simulation/signals"
import { useEditorState } from "@/browser/editor/editor-state"
import { runSpiceSimulationOnServer } from "../../server/simulation/spice.functions"
import {
  makeSimulationRunAtom,
  simulationRequestErrorMessage,
} from "@/browser/simulation/run-atom"

export function SimulationPanel({ runToken }: { runToken: number }) {
  const project = useEditorState((state) => state.project)
  const runServerSimulation = useServerFn(runSpiceSimulationOnServer)
  const simulationRunAtom = useMemo(
    () => makeSimulationRunAtom(runServerSimulation),
    [runServerSimulation],
  )
  const [simulationRun, executeSimulation] = useAtom(simulationRunAtom, {
    mode: "promiseExit",
  })
  const outcome =
    simulationRun._tag === "Success" ? simulationRun.value : null
  const requestError =
    simulationRun._tag === "Failure"
      ? Option.getOrUndefined(Cause.findErrorOption(simulationRun.cause))
      : undefined
  const savedRun = outcome?._tag === "Saved" ? outcome.run : null
  const result = outcome
    ? outcome._tag === "Saved"
      ? outcome.run
      : outcome.output
    : null
  const [metric, setMetric] = useState<SignalMetric>("voltage")
  const [target, setTarget] = useState("all")
  const [engine, setEngine] = useState<SpiceEnginePreference>("ngspice")
  const setLatestRun = useEditorState((state) => state.setLatestRun)

  async function runSimulation() {
    if (!project) {
      return
    }
    await executeSimulation({ project, engine })
  }

  useEffect(() => {
    if (runToken > 0) {
      void runSimulation()
    }
  }, [runToken])

  useEffect(() => {
    if (savedRun) {
      setMetric(firstSignalMetric(savedRun.signals) ?? "voltage")
      setTarget("all")
      setLatestRun(savedRun)
    }
  }, [savedRun?.id])

  const metrics = result ? availableSignalMetrics(result.signals) : []
  const metricOptions = metrics.length > 0 ? metrics : [metric]
  const targets = result ? availableSignalTargets(result.signals, metric) : []
  const visibleSignals = result
    ? displaySignals(result.signals, metric).filter((signal) =>
        target === "all" ? true : signalTarget(signal.name) === target,
      )
    : []

  return (
    <section className="panel-content simulation-panel" data-testid="simulation-panel">
      <div className="panel-header">
        <div>
          <h2>SPICE Simulation</h2>
          <p className="muted">
            Engine: {result?.engine ?? engine} · status: {result ? simulationStatus(result) : "not run"}
            {result ? ` · circuit ${result.circuitHash.slice(0, 8)}` : ""}
          </p>
        </div>
        <div className="simulation-run-controls">
          <label>
            Engine
            <select
              value={engine}
              onChange={(event) =>
                setEngine(
                  Schema.decodeUnknownSync(SpiceEnginePreferenceSchema)(
                    event.target.value,
                  ),
                )
              }
            >
              <option value="ngspice">ngspice</option>
              <option value="spicey">spicey</option>
            </select>
          </label>
          <button
            className="button primary"
            data-testid="run-spice-simulation"
            disabled={simulationRun.waiting}
            onClick={() => void runSimulation()}
          >
            {simulationRun.waiting ? "Running..." : "Run SPICE Simulation"}
          </button>
        </div>
      </div>
      {requestError ? (
        <p className="issue error" role="alert">
          {simulationRequestErrorMessage(requestError)}
        </p>
      ) : null}
      {outcome?._tag === "PersistenceFailure" ? (
        <p className="issue warning" role="alert">
          The simulation result could not be saved: {outcome.error.operation}.
        </p>
      ) : null}
      {result ? (
        <>
          <SimulationStatus result={result} />
          <div className="simulation-controls">
            <label>
              Metric
              <select
                value={metric}
                onChange={(event) => {
                  setMetric(parseSignalMetric(event.target.value) ?? "voltage")
                  setTarget("all")
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
              Component / Net
              <select
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              >
                <option value="all">All</option>
                {targets.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {candidate}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <WaveformChart traces={visibleSignals} />
          {result.netlist ? (
            <details className="spice-netlist">
              <summary>SPICE netlist</summary>
              <pre>{result.netlist}</pre>
            </details>
          ) : null}
          {result.diagnostics.rawOutput ? (
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

function SimulationStatus({ result }: { result: SimulationOutput }) {
  const diagnostics = result.diagnostics
  const status = simulationStatus(result)
  if (
    diagnostics.errors.length === 0 &&
    diagnostics.warnings.length === 0 &&
    diagnostics.suggestions.length === 0 &&
    diagnostics.unsupportedComponents.length === 0 &&
    diagnostics.floatingPins.length === 0
  ) {
    return <p className="issue info">Simulation completed without diagnostics.</p>
  }
  return (
    <div className={status === "failed" ? "issue error" : "issue warning"}>
      <strong>
        {status === "failed" ? "Simulation failed" : "Simulation diagnostics"}
      </strong>
      <ul>
        {diagnostics.errors.map((message) => (
          <li key={`error-${message}`}>{message}</li>
        ))}
        {diagnostics.warnings.map((message) => (
          <li key={`warning-${message}`}>{message}</li>
        ))}
        {diagnostics.suggestions.map((message) => (
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

function metricLabel(metric: SignalMetric): string {
  switch (metric) {
    case "current":
      return "Current"
    case "power":
      return "Power"
    default:
      return "Voltage"
  }
}
