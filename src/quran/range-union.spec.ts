import {
  intersectIntervals,
  subtractIntervals,
  unionIntervals,
  unionVerseCount,
  type Interval,
} from './range-union';

describe('unionIntervals', () => {
  it('merges overlapping and touching intervals', () => {
    expect(
      unionIntervals([
        [1, 5],
        [4, 8],
      ]),
    ).toEqual([[1, 8]]);
    // touching (gap of 0) merges: [1,5] and [6,10] → [1,10]
    expect(
      unionIntervals([
        [6, 10],
        [1, 5],
      ]),
    ).toEqual([[1, 10]]);
  });

  it('keeps a real gap separate', () => {
    expect(
      unionIntervals([
        [1, 5],
        [8, 10],
      ]),
    ).toEqual([
      [1, 5],
      [8, 10],
    ]);
  });

  it('drops invalid/empty intervals', () => {
    expect(unionIntervals([[5, 1] as Interval, [3, 3]])).toEqual([[3, 3]]);
    expect(unionIntervals([])).toEqual([]);
  });

  it('counts distinct verses without double counting', () => {
    expect(
      unionVerseCount([
        [1, 10],
        [6, 15],
      ]),
    ).toBe(15);
  });
});

describe('intersectIntervals', () => {
  it('returns overlapping parts only', () => {
    expect(
      intersectIntervals(
        [
          [1, 10],
          [20, 30],
        ],
        [
          [5, 25],
        ],
      ),
    ).toEqual([
      [5, 10],
      [20, 25],
    ]);
  });

  it('is empty when disjoint', () => {
    expect(intersectIntervals([[1, 5]], [[6, 10]])).toEqual([]);
  });
});

describe('subtractIntervals', () => {
  it('removes covered parts, leaving the gaps (spec §33 test 6)', () => {
    // plan 1..20, achieved 1..5 and 15..20 → gap 6..14
    expect(
      subtractIntervals(
        [[1, 20]],
        [
          [1, 5],
          [15, 20],
        ],
      ),
    ).toEqual([[6, 14]]);
  });

  it('subtracting a superset yields nothing', () => {
    expect(subtractIntervals([[3, 8]], [[1, 10]])).toEqual([]);
  });

  it('subtracting nothing returns the original (merged)', () => {
    expect(subtractIntervals([[1, 5]], [])).toEqual([[1, 5]]);
  });

  it('splits an interval when a middle chunk is removed', () => {
    expect(subtractIntervals([[1, 20]], [[8, 12]])).toEqual([
      [1, 7],
      [13, 20],
    ]);
  });
});
