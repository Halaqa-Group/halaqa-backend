import { pageCoverageGlobal } from '../../../quran/page-coverage';
import {
  intersectIntervals,
  subtractIntervals,
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

/**
 * Chronological spending order: earliest date, then earliest approval, then
 * lowest id — deterministic. The first achievement of the week settles the first
 * item that plans those verses; a repeat of the same range is spent on the next
 * item. Score does **not** decide attribution: when the same verses are recited
 * twice, the teacher expects the Monday recitation on the Monday item, not the
 * best-scoring one.
 */
function chronologically(
  a: SettlementAchievement,
  b: SettlementAchievement,
): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.approvedAt !== b.approvedAt) return a.approvedAt - b.approvedAt;
  return a.id - b.id;
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

/** Contiguous segments credited to the same achievement collapse into one row. */
function mergeAdjacent(segments: CreditedSegment[]): CreditedSegment[] {
  const out: CreditedSegment[] = [];
  for (const s of segments) {
    const last = out[out.length - 1];
    if (
      last &&
      last.achievementId === s.achievementId &&
      last.interval[1] + 1 === s.interval[0]
    ) {
      last.interval[1] = s.interval[1];
      last.verses = last.interval[1] - last.interval[0] + 1;
      last.pages = pageCoverageGlobal(last.interval[0], last.interval[1]);
    } else {
      out.push(s);
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
 * Settles one track of one week. Each achievement is an **independent payment**:
 * it carries its own unspent verses, and every verse of it can be credited to at
 * most one item. Items are walked in priority order and each one spends the
 * oldest achievements that cover what it plans.
 *
 * That is what makes repetition count. Two items planning the same range and two
 * recitations of it settle one item each — the Monday recitation pays the Monday
 * item, the Wednesday repeat pays the Wednesday item. (A single recitation still
 * pays only the first of them; the later item stays unsettled, since nothing was
 * recited for it.) Collapsing the achievements into one union pool, as this used
 * to, made the repeat invisible.
 *
 * `items` MUST already be sorted (day_of_week, then `order`, then id): that order
 * *is* the priority. Whatever stays unspent after the last item — verses no item
 * planned, and repeats beyond the number of items that planned them — comes back
 * as `outside`.
 */
export function settleTrack(
  items: SettlementItem[],
  achievements: SettlementAchievement[],
): TrackSettlement {
  const byItem = new Map<number, CreditedSegment[]>();
  const ordered = [...achievements].sort(chronologically);
  const unspent = new Map<number, Interval[]>(
    ordered.map((a) => [a.id, [[a.interval[0], a.interval[1]] as Interval]]),
  );

  for (const item of items) {
    const segments: CreditedSegment[] = [];
    // What the item still wants; shrinks as achievements pay into it, so no
    // verse of the item is credited twice.
    let want: Interval[] = [item.interval];

    for (const a of ordered) {
      if (!want.length) break;
      const rest = unspent.get(a.id) ?? [];
      if (!rest.length) continue;

      const paid = intersectIntervals(want, rest);
      if (!paid.length) continue;

      for (const interval of paid) segments.push(segmentOf(interval, a));
      want = subtractIntervals(want, paid);
      unspent.set(a.id, subtractIntervals(rest, paid));
    }

    segments.sort((x, y) => x.interval[0] - y.interval[0]);
    byItem.set(item.planItemId, mergeAdjacent(segments));
  }

  const outside: OutsideSegment[] = [];
  for (const a of ordered) {
    for (const [from, to] of unspent.get(a.id) ?? []) {
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
