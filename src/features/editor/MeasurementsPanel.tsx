import { useState } from "react"
import { WaveformChart } from "./WaveformChart"
import { formatMeasurement, getNetVoltageColor } from "@/browser/simulation/display"
import { useEditorState } from "@/browser/editor/editor-state"
import {
  availableSignalMetrics,
  displaySignals,
  parseSignalMetric,
  type SignalMetric,
} from "@circuit-sim/core/simulation/signals"

type ScopeLayout = "stacked" | "unstacked" | "combined" | "separate"

const defaultScopeLayout: ScopeLayout = "stacked"

export function MeasurementsPanel() {
  const report = useEditorState((state) => state.observations)
  const [metric, setMetric] = useState<SignalMetric>("voltage")

  if (!report) {
    return (
      <section className="panel-content">
        <p className="muted">
          Run a simulation to see measured values. Measurements are taken from
          the most recent simulation run.
        </p>
      </section>
    )
  }

  const metrics = availableSignalMetrics(report.signals)
  const metricOptions = metrics.length > 0 ? metrics : [metric]
  const visibleSignals = displaySignals(report.signals, metric)

  return (
    <section className="panel-content measurements-panel" data-testid="measurements-panel">
      <div className="panel-header">
        <div>
          <h2>Measurements</h2>
          <p className="muted">
            Run {report.run.id.slice(0, 8)} · {report.run.engine} · {report.run.status}
            {report.run.stale ? " · stale — circuit changed since this run" : ""}
          </p>
        </div>
      </div>

      <div className="measurement-grid">
        <section className="measurement-card">
          <h3>Nets</h3>
          <table>
            <thead>
              <tr>
                <th>Net</th>
                <th>Voltage</th>
              </tr>
            </thead>
            <tbody>
              {report.netVoltages.map((net, index) => (
                <tr key={`${net.netId}-${index}`}>
                  <td>
                    <span
                      className="net-swatch"
                      style={{ background: getNetVoltageColor(net.voltage) }}
                    />
                    {net.name}
                  </td>
                  <td>{formatMeasurement(net.voltage, "V")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="measurement-card">
          <h3>Components</h3>
          <table>
            <thead>
              <tr>
                <th>Ref</th>
                <th>V</th>
                <th>I</th>
                <th>P</th>
              </tr>
            </thead>
            <tbody>
              {report.componentMeasurements.map((component) => (
                <tr key={component.objectId}>
                  <td>{component.refdes}</td>
                  <td>{formatMeasurement(component.voltage, "V")}</td>
                  <td>{formatMeasurement(component.current, "A")}</td>
                  <td>{formatMeasurement(component.power, "W")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="measurement-card">
          <h3>Probes</h3>
          <table>
            <thead>
              <tr>
                <th>Probe</th>
                <th>Type</th>
                <th>Net</th>
                <th>Voltage</th>
                <th>Current</th>
              </tr>
            </thead>
            <tbody>
              {report.probeMeasurements.map((probe) => (
                <tr key={probe.objectId}>
                  <td>{probe.name}</td>
                  <td>{probe.probeType}</td>
                  <td>{probe.netName ?? "unattached"}</td>
                  <td>{formatMeasurement(probe.voltage, "V")}</td>
                  <td>{formatMeasurement(probe.current, "A")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="measurement-card measurement-card-wide">
          <div className="measurement-card-title-row">
            <h3>Scopes</h3>
            <div className="measurement-card-controls">
              <span data-testid="scope-layout-label">
                {scopeLayoutLabel(defaultScopeLayout)}
              </span>
              <label>
                Metric
                <select
                  value={metric}
                  onChange={(event) =>
                    setMetric(parseSignalMetric(event.target.value) ?? "voltage")
                  }
                >
                  {metricOptions.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {metricLabel(candidate)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <ScopeTraceLayout
            layout={defaultScopeLayout}
            metric={metric}
            traces={visibleSignals}
          />
        </section>
      </div>

      <ul className="notes-list measurement-notes">
        {report.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  )
}

function ScopeTraceLayout({
  layout,
  metric,
  traces,
}: {
  layout: ScopeLayout
  metric: SignalMetric
  traces: ReadonlyArray<ReturnType<typeof displaySignals>[number]>
}) {
  if (layout === "combined") {
    return (
      <div
        className="scope-trace-layout scope-trace-layout-combined"
        data-testid="scope-layout-combined"
      >
        <ScopePane title={`${metricLabel(metric)} scopes`} traces={traces} />
      </div>
    )
  }

  const className =
    layout === "stacked"
      ? "scope-trace-layout scope-trace-layout-stacked"
      : layout === "unstacked"
        ? "scope-trace-layout scope-trace-layout-unstacked"
        : "scope-trace-layout scope-trace-layout-separate"
  const testId = `scope-layout-${layout}`

  return (
    <div className={className} data-testid={testId}>
      {traces.length > 0 ? (
        traces.map((trace) => (
          <ScopePane key={trace.name} title={trace.name} traces={[trace]} />
        ))
      ) : (
        <ScopePane title={`${metricLabel(metric)} scopes`} traces={[]} />
      )}
    </div>
  )
}

function ScopePane({
  title,
  traces,
}: {
  title: string
  traces: ReadonlyArray<ReturnType<typeof displaySignals>[number]>
}) {
  return (
    <section className="scope-pane" data-testid="scope-pane">
      <div className="scope-pane-title">{title}</div>
      <WaveformChart traces={traces} />
    </section>
  )
}

function scopeLayoutLabel(layout: ScopeLayout): string {
  switch (layout) {
    case "stacked":
      return "Stacked"
    case "unstacked":
      return "Unstacked"
    case "separate":
      return "Separate"
    default:
      return "Combined"
  }
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
