import {
  settleTrack,
  type SettlementAchievement,
} from '../../achievements/logic/settlement';
import { pageCoverage } from '../../../quran/page-coverage';
import { toInterval } from '../../../quran/range-union';
import {
  assembleTrack,
  type PlannedItemInput,
  type SettledLinkInput,
} from './reconciliation';

// The report never matches ranges itself: the plan reconciliation settles once
// and persists `achievement_plan_item_links`, and the report reads them. These
// tests drive that whole path — settle, then assemble from the resulting rows —
// so the report's figures stay pinned to what actually gets stored.

type Range = [number, number, number, number];

function ach(
  id: number,
  range: Range,
  score: number,
  approvedAt = id,
  date = '2026-05-11',
): SettlementAchievement {
  const [startSurah, startVerse, endSurah, endVerse] = range;
  return {
    id,
    date,
    percentageScore: score,
    approvedAt,
    interval: toInterval({ startSurah, startVerse, endSurah, endVerse }),
  };
}

function plan(planItemId: number, range: Range): PlannedItemInput {
  const [startSurah, startVerse, endSurah, endVerse] = range;
  return { planItemId, startSurah, startVerse, endSurah, endVerse };
}

/** Runs the real settlement and returns the link rows it would persist. */
function linksFor(
  items: PlannedItemInput[],
  achievements: SettlementAchievement[],
): SettledLinkInput[] {
  const settlement = settleTrack(
    items.map((i) => ({ planItemId: i.planItemId, interval: toInterval(i) })),
    achievements,
  );
  const rows: SettledLinkInput[] = [];
  for (const [planItemId, segments] of settlement.byItem)
    for (const s of segments)
      rows.push({
        planItemId,
        achievementId: s.achievementId,
        achievementDate: s.achievementDate,
        percentageScore: s.percentageScore,
        startGlobalAyah: s.interval[0],
        endGlobalAyah: s.interval[1],
        creditedPages: s.pages,
      });
  for (const o of settlement.outside)
    rows.push({
      planItemId: null,
      achievementId: o.achievementId,
      achievementDate: o.achievementDate,
      percentageScore: o.percentageScore,
      startGlobalAyah: o.interval[0],
      endGlobalAyah: o.interval[1],
      creditedPages: o.pages,
    });
  return rows;
}

function run(items: PlannedItemInput[], achievements: SettlementAchievement[]) {
  return assembleTrack('Hifz', items, linksFor(items, achievements));
}

describe('assembleTrack', () => {
  it('test 7 — overlap keeps the higher score per segment, no double count', () => {
    const res = run(
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
      planItemId: 1,
    });
    expect(segs[1]).toMatchObject({
      startSurah: 2,
      startVerse: 6,
      endSurah: 2,
      endVerse: 15,
      percentageScore: 95,
      selectedAchievementId: 2,
      planItemId: 1,
    });
    expect(res.reconciliation.gaps).toHaveLength(0);
  });

  it('attributes one achievement across the two plan items it spans', () => {
    const res = run(
      [plan(1, [1, 1, 1, 3]), plan(2, [1, 4, 1, 7])],
      [ach(1, [1, 1, 1, 7], 90)],
    );
    const segs = res.reconciliation.approvedSegments;
    expect(segs).toHaveLength(2);
    expect(segs.map((s) => s.planItemId).sort()).toEqual([1, 2]);
    // Both segments name the same achievement — the split is by plan item.
    expect(segs.every((s) => s.selectedAchievementId === 1)).toBe(true);
    expect(res.completionRate).toBeCloseTo(100, 9);
  });

  it('carries the achievement date, which may differ from the item day', () => {
    const res = run(
      [plan(1, [1, 1, 1, 7])],
      [ach(1, [1, 1, 1, 7], 90, 1, '2026-05-13')],
    );
    expect(res.reconciliation.approvedSegments[0].achievementDate).toBe(
      '2026-05-13',
    );
  });

  it('test 6 — detects the gap between two achieved chunks', () => {
    const res = run(
      [plan(1, [2, 1, 2, 20])],
      [ach(1, [2, 1, 2, 5], 90), ach(2, [2, 16, 2, 20], 90)],
    );
    const gaps = res.reconciliation.gaps;
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      startSurah: 2,
      startVerse: 6,
      endSurah: 2,
      endVerse: 15,
    });
    expect(res.completionRate).toBeLessThan(100);
  });

  it('test 8 — records out-of-plan recitation, excludes it from completion', () => {
    const res = run([plan(1, [2, 1, 2, 10])], [ach(1, [2, 1, 2, 20], 90)]);
    const outside = res.reconciliation.outsidePlanSegments;
    expect(outside).toHaveLength(1);
    expect(outside[0]).toMatchObject({
      achievementId: 1,
      startSurah: 2,
      startVerse: 11,
      endSurah: 2,
      endVerse: 20,
    });
    // Completion counts only the planned part.
    expect(res.completionRate).toBeCloseTo(100, 9);
    expect(res.achievedPages).toBeCloseTo(
      pageCoverage(plan(1, [2, 1, 2, 10])),
      9,
    );
  });

  it('test 5 — overachievement caps completion at 100', () => {
    const res = run([plan(1, [2, 1, 2, 10])], [ach(1, [2, 1, 2, 30], 90)]);
    expect(res.completionRate).toBe(100);
    expect(res.reconciliation.completionRate).toBe(100);
  });

  it('fully-achieved plan → 100% completion and quality equals the score', () => {
    const res = run([plan(1, [1, 1, 1, 7])], [ach(1, [1, 1, 1, 7], 87.5)]);
    expect(res.completionRate).toBeCloseTo(100, 9);
    expect(res.qualityRate).toBeCloseTo(87.5, 9);
  });

  it('quality is page-coverage-weighted across mixed-score segments', () => {
    const items = [plan(1, [2, 1, 2, 20])];
    const res = run(items, [
      ach(1, [2, 1, 2, 10], 60),
      ach(2, [2, 11, 2, 20], 100),
    ]);

    const firstPages = pageCoverage({
      startSurah: 2,
      startVerse: 1,
      endSurah: 2,
      endVerse: 10,
    });
    const secondPages = pageCoverage({
      startSurah: 2,
      startVerse: 11,
      endSurah: 2,
      endVerse: 20,
    });
    const expected =
      (firstPages * 60 + secondPages * 100) / (firstPages + secondPages);
    expect(res.qualityRate).toBeCloseTo(expected, 9);
  });

  it('tie on score → latest approvedAt wins, then highest id', () => {
    const res = run(
      [plan(1, [1, 1, 1, 7])],
      [ach(1, [1, 1, 1, 7], 90, 500), ach(2, [1, 1, 1, 7], 90, 100)],
    );
    expect(res.reconciliation.approvedSegments[0].selectedAchievementId).toBe(
      1,
    );

    const sameTime = run(
      [plan(1, [1, 1, 1, 7])],
      [ach(1, [1, 1, 1, 7], 90, 500), ach(2, [1, 1, 1, 7], 90, 500)],
    );
    expect(
      sameTime.reconciliation.approvedSegments[0].selectedAchievementId,
    ).toBe(2);
  });

  it('no achievements → whole plan is a gap, zero completion', () => {
    const res = run([plan(1, [1, 1, 1, 7])], []);
    expect(res.reconciliation.approvedSegments).toHaveLength(0);
    expect(res.reconciliation.gaps).toHaveLength(1);
    expect(res.completionRate).toBe(0);
    expect(res.qualityRate).toBe(0);
  });

  it('a partially covered plan credits only the recited parts', () => {
    const res = run([plan(1, [2, 1, 2, 20])], [ach(1, [2, 1, 2, 10], 90)]);
    expect(res.achievedPages).toBeLessThan(res.plannedPages);
    expect(res.completionRate).toBeGreaterThan(0);
    expect(res.completionRate).toBeLessThan(100);
  });

  it('an earlier item consumes a shared verse; the later one gets no credit', () => {
    // Both items plan Al-Fatiha 1-7; only one achievement exists.
    const res = run(
      [plan(1, [1, 1, 1, 7]), plan(2, [1, 1, 1, 7])],
      [ach(1, [1, 1, 1, 7], 90)],
    );
    const segs = res.reconciliation.approvedSegments;
    expect(segs).toHaveLength(1);
    expect(segs[0].planItemId).toBe(1);
    // The plan union is still one range, so completion is full.
    expect(res.completionRate).toBeCloseTo(100, 9);
  });
});
