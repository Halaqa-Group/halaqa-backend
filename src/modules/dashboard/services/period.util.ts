export type Period = 'week' | 'month';

/** Local-time 'YYYY-MM-DD' (matches how DATE columns are stored/compared). */
function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface DateRange {
  from: string;
  to: string;
}

/** The local date `n` days before `now`, as 'YYYY-MM-DD'. Used by alert windows. */
export function daysAgo(n: number, now: Date = new Date()): string {
  return localYmd(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - n),
  );
}

/**
 * The window of the same length immediately preceding `range`, for trend deltas.
 * e.g. a 7-day week → the 7 days ending the day before `range.from`.
 */
export function previousRange(range: DateRange): DateRange {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  const lengthDays =
    Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const prevTo = new Date(from);
  prevTo.setDate(from.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevTo.getDate() - (lengthDays - 1));
  return { from: localYmd(prevFrom), to: localYmd(prevTo) };
}

/**
 * Resolves the reporting window. Explicit `from`+`to` win; otherwise `period`
 * ('month' → 1st of this month, default 'week' → most recent Saturday) … today.
 * The school week starts Saturday (day_of_week 0), matching halaqa_schedules.
 */
export function resolveRange(
  q: { period?: Period; from?: string; to?: string },
  now: Date = new Date(),
): DateRange {
  if (q.from && q.to) return { from: q.from, to: q.to };

  const to = localYmd(now);

  if (q.period === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: localYmd(first), to };
  }

  // Default: current school week, starting Saturday.
  // getDay(): 0=Sun … 6=Sat → days elapsed since the last Saturday.
  const daysSinceSaturday = (now.getDay() + 1) % 7;
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - daysSinceSaturday,
  );
  return { from: localYmd(start), to };
}
