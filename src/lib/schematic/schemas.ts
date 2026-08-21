import { z } from "zod"

export const Vec2Schema = z.object({
  x: z.number(),
  y: z.number(),
})

export const RotationSchema = z.number().finite()

export const SymbolObjectSchema = z.object({
  kind: z.literal("symbol"),
  id: z.string(),
  componentDefinitionId: z.string(),
  symbolDefinitionId: z.string(),
  refdes: z.string(),
  position: Vec2Schema,
  rotation: RotationSchema,
  pinSpacing: z.number().positive().optional(),
  pinSpread: z.number().finite().optional(),
  mirrored: z.boolean().optional(),
  props: z.record(z.unknown()),
})

export const WireObjectSchema = z.object({
  kind: z.literal("wire"),
  id: z.string(),
  points: z.array(Vec2Schema).min(2),
})

export const JunctionObjectSchema = z.object({
  kind: z.literal("junction"),
  id: z.string(),
  position: Vec2Schema,
})

export const NetLabelObjectSchema = z.object({
  kind: z.literal("net-label"),
  id: z.string(),
  text: z.string(),
  position: Vec2Schema,
  leadEnd: Vec2Schema.optional(),
})

export const GroundObjectSchema = z.object({
  kind: z.literal("ground"),
  id: z.string(),
  position: Vec2Schema,
  leadEnd: Vec2Schema.optional(),
  netName: z.literal("GND"),
})

export const ProbeObjectSchema = z.object({
  kind: z.literal("probe"),
  id: z.string(),
  probeType: z.union([z.literal("voltage"), z.literal("current")]),
  name: z.string(),
  position: Vec2Schema,
  leadEnd: Vec2Schema.optional(),
})

export const TextObjectSchema = z.object({
  kind: z.literal("text"),
  id: z.string(),
  text: z.string(),
  fontSize: z.number().positive().optional(),
  position: Vec2Schema,
})

export const LineObjectSchema = z.object({
  kind: z.literal("line"),
  id: z.string(),
  start: Vec2Schema,
  end: Vec2Schema,
})

export const BoxObjectSchema = z.object({
  kind: z.literal("box"),
  id: z.string(),
  start: Vec2Schema,
  end: Vec2Schema,
})

export const SchematicObjectSchema = z.discriminatedUnion("kind", [
  SymbolObjectSchema,
  WireObjectSchema,
  JunctionObjectSchema,
  NetLabelObjectSchema,
  GroundObjectSchema,
  ProbeObjectSchema,
  TextObjectSchema,
  LineObjectSchema,
  BoxObjectSchema,
])

export const SimulationConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.literal("transient"),
  durationMs: z.number().positive(),
  timeStepMs: z.number().positive(),
  probeIds: z.array(z.string()),
})

export const SchematicSheetSchema = z.object({
  id: z.string(),
  name: z.string(),
  gridSize: z.number().positive(),
  objects: z.array(SchematicObjectSchema),
})

export const CircuitProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number().int().positive(),
  sheets: z.array(SchematicSheetSchema).min(1),
  simulations: z.array(SimulationConfigSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})
