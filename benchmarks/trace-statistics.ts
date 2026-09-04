export type TracePoint = {
  readonly t: number
  readonly v: number
}

/**
 * Approximate a signal's mean over elapsed time rather than over the simulator's
 * adaptive sample count. Trapezoidal integration keeps the result stable when
 * two ngspice builds choose different internal timesteps for the same waveform.
 */
export function timeWeightedAverage(
  points: ReadonlyArray<TracePoint>,
): number | undefined {
  if (points.length === 0) return undefined

  const valuesByTime = new Map<number, number>()
  for (const point of points) valuesByTime.set(point.t, point.v)
  const ordered = [...valuesByTime]
    .sort(([leftTime], [rightTime]) => leftTime - rightTime)
    .map(([t, v]) => ({ t, v }))
  if (ordered.length === 1) return ordered[0]!.v

  let area = 0
  let duration = 0
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!
    const current = ordered[index]!
    const interval = current.t - previous.t
    if (interval <= 0) continue
    area += interval * (previous.v + current.v) / 2
    duration += interval
  }
  return duration === 0 ? ordered[0]!.v : area / duration
}
