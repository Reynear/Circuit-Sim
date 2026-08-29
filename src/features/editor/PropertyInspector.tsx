import { Option } from "effect"
import { useEffect, useMemo, useState } from "react"
import {
  decodeComponentPropertyEdit,
  getComponent,
  readComponentProperty,
  type AnyComponentProperty,
  type ComponentPropertyEdit,
  type ComponentPropertyValue,
} from "@circuit-sim/core/circuit/components"
import { useEditorState } from "@/browser/editor/editor-state"
import { formatMeasurement } from "@/browser/simulation/display"
import type {
  SchematicObject,
  Component,
} from "@circuit-sim/core/circuit/project"
import { parseSiValue, formatSiValue } from "@/browser/editor/values"

export function PropertyInspector() {
  const project = useEditorState((state) => state.project)
  const selectedObjectIds = useEditorState((state) => state.selectedObjectIds)
  const moveObject = useEditorState((state) => state.moveObject)
  const rotateObject = useEditorState((state) => state.rotateObject)
  const updateComponentProperty = useEditorState(
    (state) => state.updateComponentProperty,
  )
  const updateObjectText = useEditorState((state) => state.updateObjectText)
  const selectedObject = useMemo(() => {
    const selectedId = selectedObjectIds[0]
    return project
      ? project.objects.find((object) => object.id === selectedId)
      : undefined
  }, [project, selectedObjectIds])

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
          {selectedObject.kind === "component" ? (
            <ComponentInspector
              component={selectedObject}
              rotateObject={rotateObject}
              updateComponentProperty={updateComponentProperty}
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
  const project = useEditorState((state) => state.project)
  const selectedObjects = project
    ? project.objects.filter((object) =>
        selectedObjectIds.includes(object.id),
      )
    : []
  const componentCount = selectedObjects.filter(
    (object) => object.kind === "component",
  ).length
  const wireCount = selectedObjects.filter((object) => object.kind === "wire").length

  return (
    <section className="multi-selection-summary">
      <h3>{selectedObjectIds.length} objects selected</h3>
      <p className="muted">
        {componentCount} components · {wireCount} wires ·{" "}
        {selectedObjects.length - componentCount - wireCount} annotations
      </p>
      <p className="muted">
        Drag a selected component, ground, or probe to move the selected positioned
        objects together. Press Delete to remove the full selection.
      </p>
      <ul>
        {selectedObjects.map((object) => (
          <li key={object.id}>
            {object.kind === "component"
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
  const measurements = useEditorState((state) => state.observations)
  if (!measurements) {
    return null
  }

  if (object.kind === "component") {
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

function ComponentInspector({
  component,
  rotateObject,
  updateComponentProperty,
}: {
  component: Component
  rotateObject: (id: string) => void
  updateComponentProperty: (id: string, edit: ComponentPropertyEdit) => void
}) {
  const spec = getComponent(component.type)

  return (
    <>
      <label>
        Refdes
        <input value={component.refdes} readOnly />
      </label>
      <label>
        Type
        <input value={spec.name} readOnly />
      </label>
      <div className="inspector-actions">
        <button
          type="button"
          className="button"
          onClick={() => rotateObject(component.id)}
        >
          Rotate 90
        </button>
        <span>{component.rotation} deg</span>
      </div>
      {spec.propertyList.map((property) => (
        <ComponentPropertyInput
          key={`${component.id}:${property.key}`}
          component={component}
          property={property}
          onCommit={(edit) => updateComponentProperty(component.id, edit)}
        />
      ))}
      <section className="pin-list">
        <h3>Pins</h3>
        <ul>
          {spec.terminals.map((pin) => (
            <li key={pin.key}>
              <span>{pin.label}</span>
              <small>{pin.electrical}</small>
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

function ComponentPropertyInput({
  component,
  property,
  onCommit,
}: {
  component: Component
  property: AnyComponentProperty
  onCommit: (edit: ComponentPropertyEdit) => void
}) {
  const value = readComponentProperty(property, component.props)
  const [draft, setDraft] = useState(() => formatPropertyValue(value, property))
  const [invalid, setInvalid] = useState(false)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) {
      setDraft(formatPropertyValue(value, property))
      setInvalid(false)
    }
  }, [focused, property, value])

  if (property.input === "boolean") {
    return (
      <label>
        {property.label}
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => {
            const edit = decodeComponentPropertyEdit(property, event.target.checked)
            if (Option.isNone(edit)) {
              throw new Error(`${property.key} rejected its checkbox value`)
            }
            onCommit(edit.value)
          }}
        />
      </label>
    )
  }

  if (property.input === "enum") {
    return (
      <label>
        {property.label}
        <select
          value={String(value)}
          onChange={(event) => {
            const option = property.options?.find(
              (candidate) => String(candidate.value) === event.target.value,
            )
            if (!option) {
              throw new Error(`${property.key} has no matching enum option`)
            }
            const edit = decodeComponentPropertyEdit(property, option.value)
            if (Option.isNone(edit)) {
              throw new Error(`${property.key} rejected its declared enum option`)
            }
            onCommit(edit.value)
          }}
        >
          {property.options?.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  function updateDraft(nextDraft: string) {
    setDraft(nextDraft)
    const parsed = parsePropertyDraft(nextDraft, property)
    if (parsed === undefined) {
      setInvalid(true)
      return
    }
    const edit = decodeComponentPropertyEdit(property, parsed)
    if (Option.isNone(edit)) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onCommit(edit.value)
  }

  return (
    <label>
      {property.label}
      <input
        value={draft}
        aria-invalid={invalid}
        className={invalid ? "invalid-property" : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => updateDraft(event.target.value)}
      />
    </label>
  )
}

function parsePropertyDraft(
  draft: string,
  property: AnyComponentProperty,
): unknown | undefined {
  if (property.input === "text") {
    return draft.length > 0 ? draft : undefined
  }
  if (draft.trim() === "") {
    return undefined
  }
  if (property.input === "si") {
    return parseSiValue(draft) ?? undefined
  }
  if (property.input === "number") {
    const value = Number(draft)
    return Number.isFinite(value) ? value : undefined
  }
  return undefined
}

function formatPropertyValue(
  value: ComponentPropertyValue,
  property: AnyComponentProperty,
): string {
  return typeof value === "number" && property.input === "si"
    ? formatSiValue(value)
    : String(value)
}
