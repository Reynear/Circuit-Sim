const suffixes = [
  ["G", 1e9],
  ["M", 1e6],
  ["k", 1e3],
  ["", 1],
  ["m", 1e-3],
  ["u", 1e-6],
  ["n", 1e-9],
  ["p", 1e-12],
] as const

/** Stable engineering notation shared by electrical projections and netlists. */
export function formatSiValue(value: number, unit = ""): string {
  if (value === 0) return `0${unit}`
  const absolute = Math.abs(value)
  const display = suffixes.find(([, multiplier]) => absolute >= multiplier) ?? suffixes.at(-1)!
  const rounded = Number((value / display[1]).toPrecision(3))
  return `${Object.is(rounded, -0) ? 0 : rounded}${display[0]}${unit}`
}
