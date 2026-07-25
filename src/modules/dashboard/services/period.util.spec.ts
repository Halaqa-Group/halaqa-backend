import { previousRange, resolveRange } from './period.util';

describe('resolveRange', () => {
  // 2026-07-25 is a Saturday; 2026-07-22 a Wednesday.
  const wed = new Date(2026, 6, 22); // month is 0-based → July
  const sat = new Date(2026, 6, 25);

  it('honours an explicit from+to over everything else', () => {
    expect(
      resolveRange(
        { period: 'month', from: '2026-01-01', to: '2026-01-31' },
        wed,
      ),
    ).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });

  it('month → first of the current month … today', () => {
    expect(resolveRange({ period: 'month' }, wed)).toEqual({
      from: '2026-07-01',
      to: '2026-07-22',
    });
  });

  it('week (default) → most recent Saturday … today', () => {
    // Wednesday 2026-07-22 → the school week started Saturday 2026-07-18.
    expect(resolveRange({}, wed)).toEqual({
      from: '2026-07-18',
      to: '2026-07-22',
    });
  });

  it('week starting exactly on a Saturday is that same day', () => {
    expect(resolveRange({ period: 'week' }, sat)).toEqual({
      from: '2026-07-25',
      to: '2026-07-25',
    });
  });

  it('ignores a lone from without to (falls back to period)', () => {
    expect(resolveRange({ from: '2026-07-01' }, wed)).toEqual({
      from: '2026-07-18',
      to: '2026-07-22',
    });
  });
});

describe('previousRange', () => {
  it('returns the same-length window ending the day before from', () => {
    // A 5-day window (18th–22nd) → the 5 days before it (13th–17th).
    expect(previousRange({ from: '2026-07-18', to: '2026-07-22' })).toEqual({
      from: '2026-07-13',
      to: '2026-07-17',
    });
  });

  it('handles a single-day window', () => {
    expect(previousRange({ from: '2026-07-25', to: '2026-07-25' })).toEqual({
      from: '2026-07-24',
      to: '2026-07-24',
    });
  });

  it('spans a month boundary correctly', () => {
    // 7-day window 2026-07-01…07-07 → the previous 7 days 06-24…06-30.
    expect(previousRange({ from: '2026-07-01', to: '2026-07-07' })).toEqual({
      from: '2026-06-24',
      to: '2026-06-30',
    });
  });
});
