export type VoltageColorOptions = {
  voltageRange: number
  positiveColor: string
  negativeColor: string
  neutralColor: string
}

export function getNetVoltageColor(
  voltage: number | undefined,
  options?: VoltageColorOptions,
): string {
  if (voltage === undefined || !Number.isFinite(voltage)) {
    return "#d7d7d7"
  }
  if (options) {
    return getScaledVoltageColor(voltage, options)
  }
  if (Math.abs(voltage) < 1e-9) {
    return "#9ca3af"
  }
  return voltage > 0 ? "#16a34a" : "#dc2626"
}

export function getComponentPowerColor(power: number | undefined): string {
  if (power === undefined || !Number.isFinite(power)) {
    return "#d7d7d7"
  }
  if (Math.abs(power) < 1e-12) {
    return "#9ca3af"
  }
  return power >= 0 ? "#f59e0b" : "#38bdf8"
}

export function formatMeasurement(
  value: number | undefined,
  unit: string,
): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "n/a"
  }
  if (Math.abs(value) < 1e-15) {
    return `0 ${unit}`
  }

  const abs = Math.abs(value)
  const prefixes = [
    { scale: 1e9, suffix: "G" },
    { scale: 1e6, suffix: "M" },
    { scale: 1e3, suffix: "k" },
    { scale: 1, suffix: "" },
    { scale: 1e-3, suffix: "m" },
    { scale: 1e-6, suffix: "u" },
    { scale: 1e-9, suffix: "n" },
    { scale: 1e-12, suffix: "p" },
  ]
  const prefix =
    prefixes.find((candidate) => abs >= candidate.scale) ??
    prefixes[prefixes.length - 1]!
  return `${formatNumber(value / prefix.scale)} ${prefix.suffix}${unit}`
}

function formatNumber(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 100) {
    return value.toFixed(0)
  }
  if (abs >= 10) {
    return value.toFixed(1)
  }
  return value.toFixed(2)
}

type RgbColor = { r: number; g: number; b: number }

function getScaledVoltageColor(
  voltage: number,
  options: VoltageColorOptions,
): string {
  const voltageRange =
    Number.isFinite(options.voltageRange) && options.voltageRange > 0
      ? options.voltageRange
      : 5
  const neutral = parseHexColor(options.neutralColor, { r: 128, g: 128, b: 128 })
  const target =
    voltage >= 0
      ? parseHexColor(options.positiveColor, { r: 0, g: 255, b: 0 })
      : parseHexColor(options.negativeColor, { r: 255, g: 0, b: 0 })
  const ratio = Math.min(1, Math.abs(voltage) / voltageRange)
  return rgbToHex({
    r: blendChannel(neutral.r, target.r, ratio),
    g: blendChannel(neutral.g, target.g, ratio),
    b: blendChannel(neutral.b, target.b, ratio),
  })
}

function parseHexColor(value: string, fallback: RgbColor): RgbColor {
  const match = value.trim().match(/^#?([0-9a-f]{6})$/i)
  if (!match) {
    return fallback
  }
  const hex = match[1]!
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  }
}

function blendChannel(start: number, end: number, ratio: number): number {
  return Math.round(start + (end - start) * ratio)
}

function rgbToHex(color: RgbColor): string {
  return `#${hexChannel(color.r)}${hexChannel(color.g)}${hexChannel(color.b)}`
}

function hexChannel(value: number): string {
  return Math.min(255, Math.max(0, value)).toString(16).padStart(2, "0")
}
