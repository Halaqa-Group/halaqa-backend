import { pageCoverageGlobal } from '../../../quran/page-coverage';
import {
  intersectIntervals,
  subtractIntervals,
  unionIntervals,
  type Interval,
} from '../../../quran/range-union';

/**
 * Attribution of achieved verses to the achievement that earned them. Shared by
 * the plan reconciliation (which persists the result as
 * `achievement_plan_item_links`) and, through those rows, by the daily report —
 * the report never re-derives this, it only reads.
 */

/** One approved achievement, reduced to what settlement needs. */
export interface SettlementAchievement {
  id: number;
  /** YYYY-MM-DD — the achievement's own date, which may differ from the item's day. */
  date: string;
  percentageScore: number;
  /** Epoch ms; 0 when unknown. Tie-breaker only. */
  approvedAt: number;
  interval: Interval;
}

/** A stretch of verses credited to exactly one achievement. */
export interface CreditedSegment {
  interval: Interval;
  achievementId: number;
  achievementDate: string;
  percentageScore: number;
  verses: number;
  pages: number;
}

/** Highest score, then latest approvedAt, then highest id — deterministic. */
function better(
  a: SettlementAchievement,
  b: SettlementAchievement,
): SettlementAchievement {
  if (a.percentageScore !== b.percentageScore)
    return a.percentageScore > b.percentageScore ? a : b;
  if (a.approvedAt !== b.approvedAt) return a.approvedAt > b.approvedAt ? a : b;
  return a.id > b.id ? a : b;
}

function segmentOf(
  interval: Interval,
  winner: SettlementAchievement,
): CreditedSegment {
  const [from, to] = interval;
  return {
    interval,
    achievementId: winner.id,
    achievementDate: winner.date,
    percentageScore: winner.percentageScore,
    verses: to - from + 1,
    pages: pageCoverageGlobal(from, to),
  };
}

/**
 * Splits `claimed` (already intersected with the plan item's range and with what
 * is still unconsumed) into atomic segments and credits each to the best covering
 * achievement. Segments are disjoint, so their verses and pages sum exactly.
 * Verses in `claimed` that no achievement covers are simply not returned — the
 * caller derives gaps by subtraction.
 */
export function attributeSegments(
  claimed: Interval[],
  achievements: SettlementAchievement[],
): CreditedSegment[] {
  if (!claimed.length || !achievements.length) return [];

  const cuts = new Set<number>();
  for (const [a, b] of claimed) {
    cuts.add(a);
    cuts.add(b + 1);
  }
  for (const { interval } of achievements) {
    cuts.add(interval[0]);
    cuts.add(interval[1] + 1);
  }
  const sorted = [...cuts].sort((x, y) => x - y);

  const out: CreditedSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i];
    const to = sorted[i + 1] - 1;
    if (to < from) continue;
    if (!claimed.some(([a, b]) => a <= from && b >= to)) continue;

    const covering = achievements.filter(
      ({ interval }) => interval[0] <= from && interval[1] >= to,
    );
    if (!covering.length) continue;

    const winner = covering.reduce(better);
    const last = out[out.length - 1];
    if (
      last &&
      last.achievementId === winner.id &&
      last.percentageScore === winner.percentageScore &&
      last.interval[1] + 1 === from
    ) {
      // Merge with the previous segment — same winner, contiguous.
      last.interval[1] = to;
      last.verses = last.interval[1] - last.interval[0] + 1;
      last.pages = pageCoverageGlobal(last.interval[0], last.interval[1]);
    } else {
      out.push(segmentOf([from, to], winner));
    }
  }
  return out;
}

/** A plan item reduced to what settlement needs, already in priority order. */
export interface SettlementItem {
  planItemId: number;
  interval: Interval;
}

/** What one achievement recited that no plan item of the week covered. */
export interface OutsideSegment {
  achievementId: number;
  achievementDate: string;
  percentageScore: number;
  interval: Interval;
  verses: number;
  pages: number;
}

export interface TrackSettlement {
  /** planItemId → the segments it claimed, in ascending verse order. */
  byItem: Map<number, CreditedSegment[]>;
  outside: OutsideSegment[];
}

/**
 * Settles one track of one week: walks `items` in priority order, letting each
 * consume the verses it plans out of the achievement pool, and credits every
 * consumed stretch to the best covering achievement. A verse claimed by an
 * earlier item is gone — a later item planning it again gets no credit.
 *
 * `items` MUST already be sorted (day_of_week, then `order`, then id): that order
 * *is* the priority. What is left over — verses an achievement covered that no
 * item planned — comes back as `outside`.
 */
export function settleTrack(
  items: SettlementItem[],
  achievements: SettlementAchievement[],
): TrackSettlement {
  const byItem = new Map<number, CreditedSegment[]>();
  let pool = unionIntervals(achievements.map((a) => a.interval));

  for (const item of items) {
    const claimed = intersectIntervals([item.interval], pool);
    byItem.set(item.planItemId, attributeSegments(claimed, achievements));
    if (claimed.length) pool = subtractIntervals(pool, claimed);
  }

  const planned = unionIntervals(items.map((i) => i.interval));
  const outside: OutsideSegment[] = [];
  for (const a of achievements) {
    for (const [from, to] of subtractIntervals([a.interval], planned)) {
      outside.push({
        achievementId: a.id,
        achievementDate: a.date,
        percentageScore: a.percentageScore,
        interval: [from, to],
        verses: to - from + 1,
        pages: pageCoverageGlobal(from, to),
      });
    }
  }

  return { byItem, outside };
}
