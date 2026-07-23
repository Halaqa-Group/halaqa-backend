/**
 * ROUND_HALF_UP to a fixed number of decimals (§27 of the daily-report spec).
 * Used only for final display/storage values; intermediate math keeps full
 * precision. For the non-negative domain of the report (scores, rates, pages)
 * this matches the frontend's `Math.round(x * 100) / 100`.
 *
 * A small absolute nudge corrects binary-FP representation so exact halves round
 * up (e.g. 2.675 → 2.68, which naive `Math.round(2.675*100)` gets wrong because
 * 2.675*100 is stored as 267.4999…).
 */
export function roundHalfUp(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  const scaled = value * factor;
  const nudged = scaled + (scaled >= 0 ? 1e-9 : -1e-9);
  return Math.round(nudged) / factor;
}
