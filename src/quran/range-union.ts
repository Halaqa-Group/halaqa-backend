import {
  pageCoverageGlobal,
  verseToGlobal,
  type VerseRangeLike,
} from './page-coverage';

/**
 * Inclusive integer interval of global (mushaf-order) verse indices: `[from, to]`
 * with from <= to. The reconciliation algorithm (§13) works entirely in this
 * space so cross-surah ranges, overlaps, and gaps are exact and a verse is never
 * counted twice (§9.4).
 */
export type Interval = [number, number];

/** A verse range → its global inclusive interval. */
export function toInterval(range: VerseRangeLike): Interval {
  return [
    verseToGlobal(range.startSurah, range.startVerse),
    verseToGlobal(range.endSurah, range.endVerse),
  ];
}

/**
 * Merge overlapping OR touching intervals into a minimal disjoint set (sorted).
 * Touching means a gap of zero verses (`cur.from <= last.to + 1`), so two
 * adjacent ranges become one contiguous block. Invalid/empty inputs are dropped.
 */
export function unionIntervals(intervals: Interval[]): Interval[] {
  const valid = intervals.filter(
    ([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a,
  );
  if (!valid.length) return [];
  valid.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out: Interval[] = [[valid[0][0], valid[0][1]]];
  for (let i = 1; i < valid.length; i++) {
    const cur = valid[i];
    const last = out[out.length - 1];
    if (cur[0] <= last[1] + 1) last[1] = Math.max(last[1], cur[1]);
    else out.push([cur[0], cur[1]]);
  }
  return out;
}

/** Total number of distinct verses covered by the union. */
export function unionVerseCount(intervals: Interval[]): number {
  return unionIntervals(intervals).reduce(
    (sum, [a, b]) => sum + (b - a + 1),
    0,
  );
}

/** Intersection (overlapping parts) of two interval sets. */
export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const A = unionIntervals(a);
  const B = unionIntervals(b);
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    const lo = Math.max(A[i][0], B[j][0]);
    const hi = Math.min(A[i][1], B[j][1]);
    if (lo <= hi) out.push([lo, hi]);
    if (A[i][1] < B[j][1]) i++;
    else j++;
  }
  return out;
}

/** `from` minus `remove` — the parts of `from` not covered by `remove`. */
export function subtractIntervals(
  from: Interval[],
  remove: Interval[],
): Interval[] {
  const F = unionIntervals(from);
  const R = unionIntervals(remove);
  const out: Interval[] = [];
  for (const [fa, fb] of F) {
    let cursor = fa;
    for (const [ra, rb] of R) {
      if (rb < cursor) continue;
      if (ra > fb) break;
      if (ra > cursor) out.push([cursor, Math.min(ra - 1, fb)]);
      cursor = Math.max(cursor, rb + 1);
      if (cursor > fb) break;
    }
    if (cursor <= fb) out.push([cursor, fb]);
  }
  return out;
}

/**
 * Fractional page coverage of the union of the given ranges — no double counting
 * (§14.1/§14.2). Because the merged intervals are disjoint, their per-page
 * overlaps are disjoint too, so summing each interval's coverage is exact.
 */
export function unionPageCoverage(ranges: VerseRangeLike[]): number {
  return unionIntervals(ranges.map(toInterval)).reduce(
    (sum, [a, b]) => sum + pageCoverageGlobal(a, b),
    0,
  );
}
