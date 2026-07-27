import { pageCoverage } from '../../../quran/page-coverage';
import {
  reconcileTrack,
  type AchievementInput,
  type PlannedItemInput,
} from './reconciliation';

// Helper: a `full`-recitation achievement covers its whole range.
function ach(
  id: number,
  range: [number, number, number, number],
  score: number,
  approvedAt = id,
): AchievementInput {
  const [startSurah, startVerse, endSurah, endVerse] = range;
  return {
    id,
    percentageScore: score,
    approvedAt,
    covered: [{ startSurah, startVerse, endSurah, endVerse }],
  };
}
function plan(
  planItemId: number,
  range: [number, number, number, number],
): PlannedItemInput {
  const [startSurah, startVerse, endSurah, endVerse] = range;
  return { planItemId, startSurah, startVerse, endSurah, endVerse };
}

describe('reconcileTrack', () => {
  it('test 7 — overlap keeps the higher score per segment, no double count', () => {
    const res = reconcileTrack(
      'Hifz',
      [plan(1, [2, 1, 2, 15])],
      [ach(1, [2, 1, 2, 10], 80), ach(2, [2, 6, 2, 15], 95)],
    );
    const segs = res.reconciliation.approvedSegments;
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({
      startSurah: 2,
      startVerse: 1,
      endSurah: 2,
      endVerse: 5,
      percentageScore: 80,
      selectedAchievementId: 1,
      candidateAchievementIds: [1],
    });
    expect(segs[1]).toMatchObject({
      startSurah: 2,
      startVerse: 6,
      endSurah: 2,
      endVerse: 15,
      percentageScore: 95,
      selectedAchievementId: 2,
      candidateAchievementIds: [1, 2],
    });
    expect(res.reconciliation.gaps).toHaveLength(0);
  });

  it('test 6 — detects the gap between two achieved chunks', () => {
    const res = reconcileTrack(
      'Hifz',
      [plan(1, [2, 1, 2, 20])],
      [ach(1, [2, 1, 2, 5], 90), ach(2, [2, 15, 2, 20], 90)],
    );
    expect(res.reconciliation.gaps).toEqual([
      expect.objectContaining({
        startSurah: 2,
        startVerse: 6,
        endSurah: 2,
        endVerse: 14,
      }),
    ]);
    expect(res.reconciliation.approvedSegments).toHaveLength(2);
    expect(res.completionRate).toBeLessThan(100);
  });

  it('test 8 — records out-of-plan recitation, excludes it from completion', () => {
    const res = reconcileTrack(
      'Near',
      [plan(1, [2, 1, 2, 10])],
      [ach(1, [2, 1, 2, 15], 88)],
    );
    expect(res.reconciliation.outsidePlanSegments).toEqual([
      expect.objectContaining({
        achievementId: 1,
        startSurah: 2,
        startVerse: 11,
        endSurah: 2,
        endVerse: 15,
      }),
    ]);
    // approved part is only the in-plan 2:1–2:10
    expect(res.reconciliation.approvedSegments[0]).toMatchObject({
      startVerse: 1,
      endVerse: 10,
    });
  });

  it('test 5 — overachievement caps completion at 100', () => {
    const res = reconcileTrack(
      'Far',
      [plan(1, [2, 1, 2, 10])],
      [ach(1, [2, 1, 2, 20], 100)],
    );
    expect(res.completionRate).toBe(100);
    expect(res.reconciliation.completionRate).toBe(100);
  });

  it('fully-achieved plan → 100% completion and quality equals the score', () => {
    const res = reconcileTrack(
      'Hifz',
      [plan(1, [2, 1, 2, 20])],
      [ach(1, [2, 1, 2, 20], 90)],
    );
    expect(res.completionRate).toBeCloseTo(100, 9);
    expect(res.qualityRate).toBeCloseTo(90, 9);
    expect(res.reconciliation.gaps).toHaveLength(0);
    expect(res.achievedPages).toBeCloseTo(res.plannedPages, 9);
  });

  it('quality is page-coverage-weighted across mixed-score segments', () => {
    const res = reconcileTrack(
      'Hifz',
      [plan(1, [2, 1, 2, 15])],
      [ach(1, [2, 1, 2, 10], 80), ach(2, [2, 6, 2, 15], 95)],
    );
    const cov1 = pageCoverage({
      startSurah: 2,
      startVerse: 1,
      endSurah: 2,
      endVerse: 5,
    });
    const cov2 = pageCoverage({
      startSurah: 2,
      startVerse: 6,
      endSurah: 2,
      endVerse: 15,
    });
    const expected = (cov1 * 80 + cov2 * 95) / (cov1 + cov2);
    expect(res.qualityRate).toBeCloseTo(expected, 9);
    expect(res.qualityRate).toBeGreaterThan(80);
    expect(res.qualityRate).toBeLessThan(95);
  });

  it('tie on score → latest approvedAt wins, then highest id', () => {
    const byTime = reconcileTrack(
      'Hifz',
      [plan(1, [2, 1, 2, 5])],
      [ach(1, [2, 1, 2, 5], 90, 100), ach(2, [2, 1, 2, 5], 90, 200)],
    );
    expect(
      byTime.reconciliation.approvedSegments[0].selectedAchievementId,
    ).toBe(2);

    const byId = reconcileTrack(
      'Hifz',
      [plan(1, [2, 1, 2, 5])],
      [ach(3, [2, 1, 2, 5], 90, 500), ach(7, [2, 1, 2, 5], 90, 500)],
    );
    expect(byId.reconciliation.approvedSegments[0].selectedAchievementId).toBe(
      7,
    );
  });

  it('no achievements → whole plan is a gap, zero completion', () => {
    const res = reconcileTrack('Hifz', [plan(1, [2, 1, 2, 10])], []);
    expect(res.reconciliation.approvedSegments).toHaveLength(0);
    expect(res.reconciliation.gaps).toHaveLength(1);
    expect(res.completionRate).toBe(0);
    expect(res.qualityRate).toBe(0);
  });

  it('a partially covered plan credits only the recited parts', () => {
    // Plan 2:1–2:20; the covered set reaches only 2:1–2:2 and 2:19–2:20.
    const res = reconcileTrack(
      'Near',
      [plan(1, [2, 1, 2, 20])],
      [
        {
          id: 1,
          percentageScore: 92,
          approvedAt: 1,
          covered: [
            { startSurah: 2, startVerse: 1, endSurah: 2, endVerse: 2 },
            { startSurah: 2, startVerse: 19, endSurah: 2, endVerse: 20 },
          ],
        },
      ],
    );
    // The middle 2:3–2:18 was never recited → gap.
    expect(res.reconciliation.approvedSegments).toHaveLength(2);
    expect(res.reconciliation.gaps).toEqual([
      expect.objectContaining({ startVerse: 3, endVerse: 18 }),
    ]);
  });
});
