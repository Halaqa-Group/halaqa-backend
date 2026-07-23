import { roundHalfUp } from '../../../common/rounding';
import type { TrackType } from '../../achievements/entities/achievement.entity';
import {
  globalToVerse,
  pageCoverageGlobal,
  type VerseRangeLike,
} from '../../../quran/page-coverage';
import {
  intersectIntervals,
  subtractIntervals,
  toInterval,
  unionIntervals,
  type Interval,
} from '../../../quran/range-union';
import type {
  ApprovedSegment,
  OutsidePlanSegment,
  PlannedRange,
  TrackReconciliation,
  VerseSegment,
} from '../types/report-json';

/** A planned range for one track/day, tagged with its plan-item id. */
export interface PlannedItemInput extends VerseRangeLike {
  planItemId: number;
}

/**
 * An approved achievement for one track/day. `covered` is the verse set the
 * student actually recited: the tested positions for a `test` recitation, or the
 * whole range for a `full` one (the caller decides). `approvedAt` is epoch ms;
 * `percentageScore` is `achievements.percentage_score` used as-is (§15.1).
 */
export interface AchievementInput {
  id: number;
  percentageScore: number;
  approvedAt: number;
  covered: VerseRangeLike[];
}

export interface ReconcileResult {
  /** Rounded snapshot for storage (§12, §27). */
  reconciliation: TrackReconciliation;
  /** Full-precision figures for the scoring step (§27 — no intermediate rounding). */
  plannedPages: number;
  achievedPages: number;
  completionRate: number;
  qualityRate: number;
}

const PAGE_DP = 4;
const RATE_DP = 2;

function segmentOf(interval: Interval): VerseSegment {
  const [a, b] = interval;
  const start = globalToVerse(a);
  const end = globalToVerse(b);
  return {
    startSurah: start.surah,
    startVerse: start.verse,
    endSurah: end.surah,
    endVerse: end.verse,
    startGlobalAyah: a,
    endGlobalAyah: b,
    pageCoverage: roundHalfUp(pageCoverageGlobal(a, b), PAGE_DP),
  };
}

/** Highest score, then latest approvedAt, then highest id — deterministic (§13.2). */
function betterAchievement(
  a: AchievementInput,
  b: AchievementInput,
): AchievementInput {
  if (a.percentageScore !== b.percentageScore)
    return a.percentageScore > b.percentageScore ? a : b;
  if (a.approvedAt !== b.approvedAt) return a.approvedAt > b.approvedAt ? a : b;
  return a.id > b.id ? a : b;
}

/**
 * Reconciles one track for one student on one day (§13). Splits the plan into
 * atomic segments, credits each to the highest-scoring covering achievement,
 * records gaps and out-of-plan recitation, and computes page/completion/quality
 * without counting a verse twice.
 */
export function reconcileTrack(
  trackType: TrackType,
  plannedItems: PlannedItemInput[],
  achievements: AchievementInput[],
): ReconcileResult {
  const plannedIntervalsByItem = plannedItems.map(
    (p) => [p, toInterval(p)] as const,
  );
  const plannedUnion = unionIntervals(
    plannedIntervalsByItem.map(([, iv]) => iv),
  );

  // Each achievement's covered set, and its portion inside/outside the plan.
  const enriched = achievements.map((a) => {
    const covered = unionIntervals(a.covered.map(toInterval));
    return {
      a,
      covered,
      inPlan: intersectIntervals(covered, plannedUnion),
      outside: subtractIntervals(covered, plannedUnion),
    };
  });

  // Cut points → atomic segments fully inside the plan (§13.2 steps 5–6).
  const cuts = new Set<number>();
  for (const [pa, pb] of plannedUnion) {
    cuts.add(pa);
    cuts.add(pb + 1);
  }
  for (const e of enriched)
    for (const [ra, rb] of e.inPlan) {
      cuts.add(ra);
      cuts.add(rb + 1);
    }
  const sortedCuts = [...cuts].sort((x, y) => x - y);

  type Credited = {
    interval: Interval;
    score: number;
    selectedId: number;
    candidateIds: number[];
  };
  const credited: Credited[] = [];

  for (let i = 0; i < sortedCuts.length - 1; i++) {
    const s = sortedCuts[i];
    const e = sortedCuts[i + 1] - 1;
    if (e < s) continue;
    if (!plannedUnion.some(([pa, pb]) => pa <= s && pb >= e)) continue; // outside plan

    const covering = enriched.filter((x) =>
      x.inPlan.some(([ra, rb]) => ra <= s && rb >= e),
    );
    if (!covering.length) continue; // gap — derived later via subtraction

    const winner = covering.map((x) => x.a).reduce(betterAchievement);
    credited.push({
      interval: [s, e],
      score: winner.percentageScore,
      selectedId: winner.id,
      candidateIds: covering.map((x) => x.a.id).sort((m, n) => m - n),
    });
  }

  // Merge adjacent segments with the same winner and score (§13.2 step 9).
  const mergedApproved: Credited[] = [];
  for (const c of credited) {
    const last = mergedApproved[mergedApproved.length - 1];
    if (
      last &&
      last.selectedId === c.selectedId &&
      last.score === c.score &&
      last.interval[1] + 1 === c.interval[0]
    ) {
      last.interval[1] = c.interval[1];
      last.candidateIds = [
        ...new Set([...last.candidateIds, ...c.candidateIds]),
      ].sort((m, n) => m - n);
    } else {
      mergedApproved.push({
        interval: [c.interval[0], c.interval[1]],
        score: c.score,
        selectedId: c.selectedId,
        candidateIds: [...c.candidateIds],
      });
    }
  }

  // ── Assemble output pieces ──────────────────────────────────────────────────
  const plannedRanges: PlannedRange[] = plannedIntervalsByItem.map(
    ([p, iv]) => ({ ...segmentOf(iv), planItemId: p.planItemId }),
  );

  const approvedSegments: ApprovedSegment[] = mergedApproved.map((c) => ({
    ...segmentOf(c.interval),
    percentageScore: roundHalfUp(c.score, RATE_DP),
    selectedAchievementId: c.selectedId,
    candidateAchievementIds: c.candidateIds,
  }));

  const approvedIntervals = mergedApproved.map((c) => c.interval);
  const gaps: VerseSegment[] = subtractIntervals(
    plannedUnion,
    approvedIntervals,
  ).map(segmentOf);

  const outsidePlanSegments: OutsidePlanSegment[] = [];
  for (const e of enriched) {
    for (const iv of e.outside) {
      const seg = segmentOf(iv);
      outsidePlanSegments.push({
        achievementId: e.a.id,
        startSurah: seg.startSurah,
        startVerse: seg.startVerse,
        endSurah: seg.endSurah,
        endVerse: seg.endVerse,
        pageCoverage: seg.pageCoverage,
      });
    }
  }

  // ── Full-precision figures (§27) ────────────────────────────────────────────
  const plannedPages = plannedUnion.reduce(
    (sum, [a, b]) => sum + pageCoverageGlobal(a, b),
    0,
  );
  const achievedPages = unionIntervals(approvedIntervals).reduce(
    (sum, [a, b]) => sum + pageCoverageGlobal(a, b),
    0,
  );
  const completionRate =
    plannedPages > 0 ? Math.min((achievedPages / plannedPages) * 100, 100) : 0;

  let weight = 0;
  let weighted = 0;
  for (const c of mergedApproved) {
    const cov = pageCoverageGlobal(c.interval[0], c.interval[1]);
    weight += cov;
    weighted += cov * c.score;
  }
  const qualityRate = weight > 0 ? weighted / weight : 0;

  const reconciliation: TrackReconciliation = {
    version: 1,
    trackType,
    plannedPages: roundHalfUp(plannedPages, PAGE_DP),
    achievedPages: roundHalfUp(achievedPages, PAGE_DP),
    completionRate: roundHalfUp(completionRate, RATE_DP),
    qualityRate: roundHalfUp(qualityRate, RATE_DP),
    plannedRanges,
    approvedSegments,
    gaps,
    outsidePlanSegments,
  };

  return {
    reconciliation,
    plannedPages,
    achievedPages,
    completionRate,
    qualityRate,
  };
}
