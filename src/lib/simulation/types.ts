export type SimulationMetric = "voltage" | "current" | "power"

export type WaveformTrace = {
  id: string
  name: string
  metric?: SimulationMetric
  unit?: string
  targetId?: string
  targetName?: string
  points: Array<{ t: number; v: number }>
}

export type SimulationResult = {
  id: string
  createdAt: string
  kind: "simple-demo-solver" | "spice"
  engine?: "spicey" | "ngspice"
  status?: "success" | "partial" | "failed"
  netlist?: string
  traces: WaveformTrace[]
  notes: string[]
  diagnostics?: {
    warnings: string[]
    errors: string[]
    suggestions?: string[]
    unsupportedComponents: string[]
    floatingPins: string[]
    rawOutput?: string
  }
}
