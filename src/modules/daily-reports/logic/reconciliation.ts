import { roundHalfUp } from '../../../common/rounding';
import type { TrackType } from '../../achievements/entities/achievement.entity';
import {
  globalToVerse,
  pageCoverageGlobal,
  type VerseRangeLike,
} from '../../../quran/page-coverage';
import {
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
 * One `achievement_plan_item_links` row, as the report consumes it. The matching
 * was already done and persisted by `PlanReconciliationService`; the report only
 * reads. `planItemId` is null for the part of an achievement that no plan item of
 * the week covered.
 */
export interface SettledLinkInput {
  planItemId: number | null;
  achievementId: number;
  achievementDate: string;
  percentageScore: number;
  startGlobalAyah: number;
  endGlobalAyah: number;
  creditedPages: number;
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

/**
 * Assembles one track's report figures for one student/day from the day's plan
 * items and the already-persisted settlement links (§13).
 *
 * No range matching happens here: which achievement credited which part of which
 * plan item was decided once, by the plan reconciliation, and stored. That is
 * what makes an achievement spanning two plan items attributable — each link row
 * names its `planItemId` — and what keeps a plan edit from silently re-deriving
 * a different answer at report time.
 *
 * Links are disjoint by construction (each verse is consumed by exactly one plan
 * item, and credited to exactly one achievement), so pages sum without double
 * counting.
 */
export function assembleTrack(
  trackType: TrackType,
  plannedItems: PlannedItemInput[],
  links: SettledLinkInput[],
): ReconcileResult {
  const plannedIntervalsByItem = plannedItems.map(
    (p) => [p, toInterval(p)] as const,
  );
  const plannedUnion = unionIntervals(
    plannedIntervalsByItem.map(([, iv]) => iv),
  );

  const settled = links.filter((l) => l.planItemId !== null);
  const outside = links.filter((l) => l.planItemId === null);

  const plannedRanges: PlannedRange[] = plannedIntervalsByItem.map(
    ([p, iv]) => ({ ...segmentOf(iv), planItemId: p.planItemId }),
  );

  const approvedSegments: ApprovedSegment[] = settled
    .slice()
    .sort((a, b) => a.startGlobalAyah - b.startGlobalAyah)
    .map((l) => ({
      ...segmentOf([l.startGlobalAyah, l.endGlobalAyah]),
      percentageScore: roundHalfUp(l.percentageScore, RATE_DP),
      selectedAchievementId: l.achievementId,
      achievementDate: l.achievementDate,
      planItemId: l.planItemId as number,
    }));

  const approvedIntervals: Interval[] = settled.map((l) => [
    l.startGlobalAyah,
    l.endGlobalAyah,
  ]);
  const gaps: VerseSegment[] = subtractIntervals(
    plannedUnion,
    approvedIntervals,
  ).map(segmentOf);

  const outsidePlanSegments: OutsidePlanSegment[] = outside.map((l) => {
    const seg = segmentOf([l.startGlobalAyah, l.endGlobalAyah]);
    return {
      achievementId: l.achievementId,
      startSurah: seg.startSurah,
      startVerse: seg.startVerse,
      endSurah: seg.endSurah,
      endVerse: seg.endVerse,
      pageCoverage: seg.pageCoverage,
    };
  });

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
  for (const l of settled) {
    const cov = pageCoverageGlobal(l.startGlobalAyah, l.endGlobalAyah);
    weight += cov;
    weighted += cov * l.percentageScore;
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
