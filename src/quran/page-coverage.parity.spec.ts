import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  pageCoverage,
  pagesRecited,
  TOTAL_VERSES,
  verseToGlobal,
  type VerseRangeLike,
} from './page-coverage';

/**
 * Parity guard: the backend page-coverage port MUST produce identical results to
 * the frontend `useVerseToPage.ts`. The golden vectors in `__fixtures__` are
 * generated from the frontend source (scripts/gen-golden — see docs). If either
 * the algorithm or the SURAH_VERSES table drifts from the frontend, this fails.
 */
interface CoverageVector extends VerseRangeLike {
  expected: number;
}
interface PagesRecitedVector {
  range: VerseRangeLike;
  positions: VerseRangeLike[] | null;
  expected: number;
}
interface GoldenFixture {
  totalVerses: number;
  pageCount: number;
  coverage: CoverageVector[];
  pagesRecited: PagesRecitedVector[];
}

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, '__fixtures__/page-coverage.golden.json'),
    'utf8',
  ),
) as GoldenFixture;

describe('page-coverage parity with the frontend', () => {
  it('agrees on TOTAL_VERSES and the mushaf page count', () => {
    expect(TOTAL_VERSES).toBe(6236);
    expect(TOTAL_VERSES).toBe(fixture.totalVerses);
    expect(fixture.pageCount).toBe(604);
  });

  it('indexes global verses 1-based (first ayah = 1, last = TOTAL_VERSES)', () => {
    expect(verseToGlobal(1, 1)).toBe(1);
    expect(verseToGlobal(114, 6)).toBe(TOTAL_VERSES);
  });

  it(`matches all ${fixture.coverage.length} pageCoverage golden vectors`, () => {
    for (const v of fixture.coverage) {
      expect(pageCoverage(v)).toBeCloseTo(v.expected, 9);
    }
  });

  it(`matches all ${fixture.pagesRecited.length} pagesRecited golden vectors`, () => {
    for (const v of fixture.pagesRecited) {
      expect(pagesRecited(v.range, v.positions)).toBeCloseTo(v.expected, 9);
    }
  });
});
