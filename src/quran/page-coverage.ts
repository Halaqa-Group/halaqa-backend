import { PAGE_STARTS } from './quran-page-starts';
import { SURAH_VERSES } from './quran.constants';

/**
 * Fractional mushaf-page coverage of a verse range. A verbatim port of the
 * frontend's `app/composables/useVerseToPage.ts` + `app/utils/quran-structure.ts`
 * — it MUST produce identical results (see `page-coverage.parity.spec.ts`, which
 * checks against golden vectors generated from the frontend source). Any change
 * here must be mirrored there, per §36 of the daily-report spec.
 *
 * Everything works in a 1-based "global" verse index (mushaf order): the first
 * ayah of Al-Fatihah is 1, the last ayah of An-Nas is TOTAL_VERSES (6236).
 */

// SURAH_OFFSETS[s] = number of verses before surah `s`. Index 0/1 both 0.
const SURAH_OFFSETS: number[] = (() => {
  const offsets = [0, 0];
  let acc = 0;
  for (let s = 1; s <= 114; s++) {
    offsets[s] = acc;
    acc += SURAH_VERSES[s];
  }
  return offsets;
})();

export const TOTAL_VERSES = SURAH_OFFSETS[114] + SURAH_VERSES[114];

export function verseToGlobal(surah: number, verse: number): number {
  return SURAH_OFFSETS[surah] + verse;
}

/** Inverse of verseToGlobal: a global index → { surah, verse } (clamped 1..TOTAL). */
export function globalToVerse(global: number): {
  surah: number;
  verse: number;
} {
  const g = Math.min(Math.max(global, 1), TOTAL_VERSES);
  for (let s = 114; s >= 1; s--) {
    if (SURAH_OFFSETS[s] < g) return { surah: s, verse: g - SURAH_OFFSETS[s] };
  }
  return { surah: 1, verse: 1 };
}

function verseKeyToGlobal(key: string): number {
  const [s, v] = key.split(':').map(Number);
  return verseToGlobal(s, v);
}

const PAGE_START_GLOBALS: number[] = PAGE_STARTS.map(verseKeyToGlobal);

/** 1-based mushaf page a global index sits on, or undefined if before page 1. */
function pageForGlobal(global: number): number | undefined {
  const starts = PAGE_START_GLOBALS;
  if (!starts.length || global < starts[0]) return undefined;
  let lo = 0;
  let hi = starts.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= global) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans + 1;
}

/** First and last global verse index of a mushaf page. */
function pageBounds(page: number): { start: number; end: number } | null {
  const start = PAGE_START_GLOBALS[page - 1];
  if (start === undefined) return null;
  const next = PAGE_START_GLOBALS[page];
  return { start, end: (next ?? TOTAL_VERSES + 1) - 1 };
}

export interface VerseRangeLike {
  startSurah: number;
  startVerse: number;
  endSurah: number;
  endVerse: number;
}

/**
 * How much of the mushaf a verse range covers, in pages, allowed to be
 * fractional. Each touched page contributes its share = (verses of the range on
 * that page) ÷ (total verses on that page), since verse counts are the only
 * granularity the page map gives us. Cross-surah ranges are handled transparently
 * because all math is in the global index space.
 */
export function pageCoverage(range: VerseRangeLike): number {
  return pageCoverageGlobal(
    verseToGlobal(range.startSurah, range.startVerse),
    verseToGlobal(range.endSurah, range.endVerse),
  );
}

/**
 * Same coverage math on an already-global inclusive interval [from, to]. Used by
 * the reconciliation range-union helpers, which work in global-index space.
 * `pageCoverage(range)` delegates here, so both stay identical to the frontend.
 */
export function pageCoverageGlobal(from: number, to: number): number {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;

  const firstPage = pageForGlobal(from);
  const lastPage = pageForGlobal(to);
  if (!firstPage || !lastPage) return 0;

  let total = 0;
  for (let p = firstPage; p <= lastPage; p++) {
    const b = pageBounds(p);
    if (!b) continue;
    const versesOnPage = b.end - b.start + 1;
    const overlap = Math.min(to, b.end) - Math.max(from, b.start) + 1;
    if (versesOnPage > 0 && overlap > 0) total += overlap / versesOnPage;
  }
  return total;
}

/**
 * Pages actually recited — the divisor for the recitation-quality score. For a
 * partial test (recited at chosen positions) it is the SUM of each position's
 * coverage, NOT the span they were drawn from; for a full lesson it is the range
 * coverage. Falls back to 1 so it is always safe to divide by (§15.3).
 */
export function pagesRecited(
  range: VerseRangeLike,
  positions?: readonly VerseRangeLike[] | null,
): number {
  const total = positions?.length
    ? positions.reduce((sum, p) => sum + pageCoverage(p), 0)
    : pageCoverage(range);
  return Number.isFinite(total) && total > 0 ? total : 1;
}
