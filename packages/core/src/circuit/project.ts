import { DateTime, Schema } from "effect"
import { IdSchema, newId } from "../ids"
import {
  andGate,
  capacitor,
  dcCurrentSource,
  dcVoltageSource,
  diode,
  idealOpAmp,
  inductor,
  inverter,
  led,
  logicInput,
  logicOutput,
  nMosfet,
  npnTransistor,
  orGate,
  pMosfet,
  pnpTransistor,
  resistor,
  sineVoltageSource,
  switchComponent,
  type ComponentSpec,
  type ComponentType,
} from "./components"
import type { ComponentPropertyDefinitions } from "./components"

export const PointSchema = Schema.Struct({
  x: Schema.Int,
  y: Schema.Int,
})
export type Point = typeof PointSchema.Type

export const RotationSchema = Schema.Literals([0, 90, 180, 270])
export type Rotation = typeof RotationSchema.Type

const ComponentBase = {
  kind: Schema.Literal("component"),
  id: IdSchema,
  refdes: Schema.NonEmptyString,
  position: PointSchema,
  rotation: RotationSchema,
  flipped: Schema.Boolean,
}

function componentSchema<
  const Type extends string,
  const Definitions extends ComponentPropertyDefinitions,
>(spec: ComponentSpec<Type, Definitions>) {
  return Schema.Struct({
    ...ComponentBase,
    type: Schema.Literal(spec.type),
    props: spec.props,
  })
}

const ComponentUnion = Schema.Union([
  componentSchema(resistor),
  componentSchema(capacitor),
  componentSchema(inductor),
  componentSchema(switchComponent),
  componentSchema(dcVoltageSource),
  componentSchema(sineVoltageSource),
  componentSchema(dcCurrentSource),
  componentSchema(diode),
  componentSchema(led),
  componentSchema(npnTransistor),
  componentSchema(pnpTransistor),
  componentSchema(nMosfet),
  componentSchema(pMosfet),
  componentSchema(idealOpAmp),
  componentSchema(logicInput),
  componentSchema(logicOutput),
  componentSchema(andGate),
  componentSchema(orGate),
  componentSchema(inverter),
])

export const ComponentSchema = ComponentUnion
export type Component = typeof ComponentSchema.Type

export function isComponent<Type extends ComponentType>(
  component: Component,
  type: Type,
): component is Extract<Component, { readonly type: Type }> {
  return component.type === type
}

export function makeComponent(input: unknown): Component {
  return Schema.decodeUnknownSync(ComponentSchema)(input)
}

export const WireObjectSchema = Schema.Struct({
  kind: Schema.Literal("wire"),
  id: IdSchema,
  points: Schema.Array(PointSchema).check(Schema.isMinLength(2)),
})
export type WireObject = typeof WireObjectSchema.Type

export const NetLabelObjectSchema = Schema.Struct({
  kind: Schema.Literal("net-label"),
  id: IdSchema,
  text: Schema.String,
  position: PointSchema,
})
export type NetLabelObject = typeof NetLabelObjectSchema.Type

export const GroundObjectSchema = Schema.Struct({
  kind: Schema.Literal("ground"),
  id: IdSchema,
  position: PointSchema,
  netName: Schema.Literal("GND"),
})
export type GroundObject = typeof GroundObjectSchema.Type

export const ProbeObjectSchema = Schema.Struct({
  kind: Schema.Literal("probe"),
  id: IdSchema,
  probeType: Schema.Literals(["voltage", "current"]),
  name: Schema.NonEmptyString,
  position: PointSchema,
})
export type ProbeObject = typeof ProbeObjectSchema.Type

export const TextObjectSchema = Schema.Struct({
  kind: Schema.Literal("text"),
  id: IdSchema,
  text: Schema.String,
  fontSize: Schema.optionalKey(
    Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0)),
  ),
  position: PointSchema,
})
export type TextObject = typeof TextObjectSchema.Type

export const LineObjectSchema = Schema.Struct({
  kind: Schema.Literal("line"),
  id: IdSchema,
  start: PointSchema,
  end: PointSchema,
})
export type LineObject = typeof LineObjectSchema.Type

export const BoxObjectSchema = Schema.Struct({
  kind: Schema.Literal("box"),
  id: IdSchema,
  start: PointSchema,
  end: PointSchema,
})
export type BoxObject = typeof BoxObjectSchema.Type

export const SchematicObjectSchema = Schema.Union([
  ComponentSchema,
  WireObjectSchema,
  NetLabelObjectSchema,
  GroundObjectSchema,
  ProbeObjectSchema,
  TextObjectSchema,
  LineObjectSchema,
  BoxObjectSchema,
])
export type SchematicObject = typeof SchematicObjectSchema.Type

export const TransientAnalysisSchema = Schema.Struct({
  durationMs: Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0)),
  timeStepMs: Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0)),
}).check(
  Schema.makeFilter((analysis) =>
    analysis.timeStepMs <= analysis.durationMs
      ? undefined
      : "Transient time step cannot exceed duration",
  ),
)
export type TransientAnalysis = typeof TransientAnalysisSchema.Type

const CircuitProjectDataSchema = Schema.Struct({
  id: IdSchema,
  name: Schema.NonEmptyString,
  objects: Schema.Array(SchematicObjectSchema),
  analysis: TransientAnalysisSchema,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
})

export const CircuitProjectSchema = CircuitProjectDataSchema.check(
  Schema.makeFilter((project) => {
    const objectIds = project.objects.map((object) => object.id)
    if (new Set(objectIds).size !== objectIds.length) {
      return "Schematic object ids must be unique"
    }

    const refdes = project.objects.flatMap((object) =>
      object.kind === "component" ? [object.refdes] : [],
    )
    return new Set(refdes).size === refdes.length
      ? undefined
      : "Component reference designators must be unique"
  }),
)
export type CircuitProject = typeof CircuitProjectSchema.Type
export type EncodedCircuitProject = typeof CircuitProjectSchema.Encoded

export function newCircuitProject(name = "Untitled Circuit"): CircuitProject {
  const timestamp = DateTime.nowUnsafe()
  return {
    id: newId(),
    name,
    objects: [],
    analysis: { durationMs: 10, timeStepMs: 0.1 },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
