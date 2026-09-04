export function netLabelFlagWidth(text: string): number {
  return Math.max(54, 21 + text.length * 7)
}
