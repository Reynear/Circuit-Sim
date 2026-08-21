import { useMemo } from "react"
import {
  getComponentDefinition,
  getRequiredComponentDefinition,
} from "../../lib/schematic/component-definitions"
import { useEditorStore } from "../../lib/schematic/editor-store"
import { formatMeasurement } from "../../lib/simulation/measurements"
import type { SchematicObject, SymbolObject } from "../../lib/schematic/types"

export function PropertyInspector() {
  const project = useEditorStore((state) => state.project)
  const activeSheetId = useEditorStore((state) => state.activeSheetId)
  const selectedObjectIds = useEditorStore((state) => state.selectedObjectIds)
  const moveObject = useEditorStore((state) => state.moveObject)
  const rotateObject = useEditorStore((state) => state.rotateObject)
  const updateSymbolProps = useEditorStore((state) => state.updateSymbolProps)
  const updateObjectText = useEditorStore((state) => state.updateObjectText)
  const selectedObject = useMemo(() => {
    const selectedId = selectedObjectIds[0]
    const activeSheet = project?.sheets.find((sheet) => sheet.id === activeSheetId)
    return activeSheet?.objects.find((object) => object.id === selectedId)
  }, [activeSheetId, project, selectedObjectIds])

  return (
    <aside className="editor-side-panel inspector">
      <h2>Inspector</h2>
      {!selectedObject ? (
        <p className="muted">No selection</p>
      ) : selectedObjectIds.length > 1 ? (
        <MultiSelectionSummary selectedObjectIds={selectedObjectIds} />
      ) : (
        <div className="inspector-form">
          <label>
            ID
            <input value={selectedObject.id} readOnly />
          </label>
          {"position" in selectedObject ? (
            <div className="inline-fields">
              <label>
                X
                <input
                  type="number"
                  value={selectedObject.position.x}
                  onChange={(event) =>
                    moveObject(selectedObject.id, {
                      ...selectedObject.position,
                      x: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  value={selectedObject.position.y}
                  onChange={(event) =>
                    moveObject(selectedObject.id, {
                      ...selectedObject.position,
                      y: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
          ) : null}
          {selectedObject.kind === "symbol" ? (
            <SymbolInspector
              symbol={selectedObject}
              rotateObject={rotateObject}
              updateSymbolProps={updateSymbolProps}
            />
          ) : (
            <ObjectDetails object={selectedObject} updateObjectText={updateObjectText} />
          )}
          <MeasurementSummary object={selectedObject} />
        </div>
      )}
    </aside>
  )
}

function MultiSelectionSummary({
  selectedObjectIds,
}: {
  selectedObjectIds: string[]
}) {
  const project = useEditorStore((state) => state.project)
  const activeSheetId = useEditorStore((state) => state.activeSheetId)
  const activeSheet = project?.sheets.find((sheet) => sheet.id === activeSheetId)
  const selectedObjects =
    activeSheet?.objects.filter((object) =>
      selectedObjectIds.includes(object.id),
    ) ?? []
  const symbolCount = selectedObjects.filter((object) => object.kind === "symbol").length
  const wireCount = selectedObjects.filter((object) => object.kind === "wire").length

  return (
    <section className="multi-selection-summary">
      <h3>{selectedObjectIds.length} objects selected</h3>
      <p className="muted">
        {symbolCount} symbols · {wireCount} wires ·{" "}
        {selectedObjects.length - symbolCount - wireCount} annotations
      </p>
      <p className="muted">
        Drag a selected symbol, ground, or probe to move the selected positioned
        objects together. Press Delete to remove the full selection.
      </p>
      <ul>
        {selectedObjects.map((object) => (
          <li key={object.id}>
            {object.kind === "symbol"
              ? object.refdes
              : object.kind === "probe"
                ? object.name
                : object.kind}
          </li>
        ))}
      </ul>
    </section>
  )
}

function MeasurementSummary({ object }: { object: SchematicObject }) {
  const measurements = useEditorStore((state) => state.measurements)
  if (!measurements) {
    return null
  }

  if (object.kind === "symbol") {
    const measurement = measurements.componentMeasurements.find(
      (candidate) => candidate.objectId === object.id,
    )
    if (!measurement) {
      return null
    }
    return (
      <section className="inspector-measurements">
        <h3>Measurements</h3>
        <dl>
          <div>
            <dt>Voltage</dt>
            <dd>{formatMeasurement(measurement.voltage, "V")}</dd>
          </div>
          <div>
            <dt>Current</dt>
            <dd>{formatMeasurement(measurement.current, "A")}</dd>
          </div>
          <div>
            <dt>Power</dt>
            <dd>{formatMeasurement(measurement.power, "W")}</dd>
          </div>
        </dl>
      </section>
    )
  }

  if (object.kind === "probe") {
    const measurement = measurements.probeMeasurements.find(
      (candidate) => candidate.objectId === object.id,
    )
    return (
      <section className="inspector-measurements">
        <h3>Measurements</h3>
        <dl>
          <div>
            <dt>Net</dt>
            <dd>{measurement?.netName ?? "unattached"}</dd>
          </div>
          <div>
            <dt>Voltage</dt>
            <dd>{formatMeasurement(measurement?.voltage, "V")}</dd>
          </div>
          <div>
            <dt>Current</dt>
            <dd>{formatMeasurement(measurement?.current, "A")}</dd>
          </div>
        </dl>
      </section>
    )
  }

  return null
}

function SymbolInspector({
  symbol,
  rotateObject,
  updateSymbolProps,
}: {
  symbol: SymbolObject
  rotateObject: (id: string) => void
  updateSymbolProps: (id: string, props: Record<string, unknown>) => void
}) {
  const definition =
    getComponentDefinition(symbol.componentDefinitionId) ??
    getRequiredComponentDefinition("resistor")
  const fields = getEditableFields(symbol.componentDefinitionId)

  return (
    <>
      <label>
        Refdes
        <input value={symbol.refdes} readOnly />
      </label>
      <label>
        Type
        <input value={definition.displayName} readOnly />
      </label>
      <div className="inspector-actions">
        <button
          type="button"
          className="button"
          onClick={() => rotateObject(symbol.id)}
        >
          Rotate 90
        </button>
        <span>{symbol.rotation} deg</span>
      </div>
      {fields.map((field) => (
        <label key={field}>
          {field}
          <input
            value={String(symbol.props[field] ?? "")}
            onChange={(event) =>
              updateSymbolProps(symbol.id, { [field]: event.target.value })
            }
          />
        </label>
      ))}
      <section className="pin-list">
        <h3>Pins</h3>
        <ul>
          {definition.pins.map((pin) => (
            <li key={pin.id}>
              <span>{pin.name}</span>
              <small>{pin.electricalType}</small>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function ObjectDetails({
  object,
  updateObjectText,
}: {
  object: SchematicObject
  updateObjectText: (id: string, text: string) => void
}) {
  if (object.kind === "probe") {
    return (
      <>
        <label>
          Name
          <input
            value={object.name}
            onChange={(event) => updateObjectText(object.id, event.target.value)}
          />
        </label>
        <label>
          Type
          <input value={object.probeType} readOnly />
        </label>
      </>
    )
  }
  if (object.kind === "ground") {
    return (
      <label>
        Net
        <input value={object.netName} readOnly />
      </label>
    )
  }
  if (object.kind === "net-label") {
    return (
      <>
        <label>
          Net name
          <input
            value={object.text}
            onChange={(event) => updateObjectText(object.id, event.target.value)}
          />
        </label>
        <div className="net-label-presets">
          {["VIN", "VOUT", "VREF", "CLK", "GND"].map((name) => (
            <button
              key={name}
              type="button"
              className="button"
              onClick={() => updateObjectText(object.id, name)}
            >
              {name}
            </button>
          ))}
        </div>
      </>
    )
  }
  if (object.kind === "text") {
    return (
      <label>
        Text
        <input
          value={object.text}
          onChange={(event) => updateObjectText(object.id, event.target.value)}
        />
      </label>
    )
  }
  return (
    <label>
      Kind
      <input value={object.kind} readOnly />
    </label>
  )
}

function getEditableFields(componentDefinitionId: string): string[] {
  switch (componentDefinitionId) {
    case "resistor":
    case "capacitor":
    case "inductor":
      return ["value"]
    case "switch":
      return ["state"]
    case "potentiometer":
      return ["value", "wiper"]
    case "dc-voltage-source":
      return ["voltage"]
    case "sine-voltage-source":
      return ["amplitude", "frequency"]
    case "dc-current-source":
      return ["current"]
    case "diode":
      return ["model"]
    case "led":
      return ["color"]
    case "npn-transistor":
    case "pnp-transistor":
      return ["beta"]
    case "n-mosfet":
    case "p-mosfet":
      return ["thresholdVoltage"]
    case "ideal-op-amp-minus-top":
      return ["maxOutput", "minOutput", "gain"]
    case "logic-input":
      return ["position", "highLogicVoltage", "lowVoltage"]
    case "logic-output":
      return ["threshold", "currentRequired"]
    case "and-gate":
    case "or-gate":
      return ["inputCount", "highLogicVoltage"]
    case "inverter":
      return ["highLogicVoltage"]
    default:
      return []
  }
}
