# Reconciliation — worked examples

The model is **invoice + payments**. Each plan item is an invoice with a target verse range. Each approved achievement is a payment that applies to one or more invoices via verse-range overlap. Multiple achievements can accumulate against one item over time. The item is `completed` when its planned verse range is fully covered by the union of applied achievements.

## Notation

Verse ranges are written `S:V` for `surah:verse`. A range like `2:1–2:20` covers surah 2, verses 1 through 20 (20 verses total).

`U(R₁, R₂, ...)` denotes the set union of ranges.

## Example 1 — single achievement fully covers item

**Plan item:** Tuesday, Hifz, `2:1–2:20`. Total: 20 verses.

**Achievement A (approved):** Tuesday, Hifz, `2:1–2:20`. Range: 20 verses.

Reconciliation:
- Applied = `A.range ∩ item.range` = `2:1–2:20`.
- `achieved_verses` = 20.
- `total_verses` = 20.
- `status` = **completed**.

## Example 2 — single achievement partially covers item

**Plan item:** Tuesday, Hifz, `2:1–2:20`. Total: 20.

**Achievement A:** Tuesday, Hifz, `2:1–2:15`. Range: 15.

Reconciliation:
- Applied = `2:1–2:15` (intersection with item range).
- `achieved_verses` = 15.
- `status` = **partial**.

## Example 3 — two achievements union to cover the item

**Plan item:** Tuesday, Hifz, `2:1–2:20`. Total: 20.

**Achievement A:** Tuesday, Hifz, `2:1–2:10`. Range: 10.
**Achievement B:** Tuesday, Hifz, `2:11–2:20`. Range: 10.

Reconciliation:
- Applied = U(A.range ∩ item, B.range ∩ item) = U(`2:1–2:10`, `2:11–2:20`) = `2:1–2:20`.
- `achieved_verses` = 20.
- `status` = **completed**.

This is why we accept multiple achievements per `(student, date, track)` — it's the right model for split sessions.

## Example 4 — overlapping achievements (no double-count)

**Plan item:** Tuesday, Hifz, `2:1–2:20`. Total: 20.

**Achievement A:** Tuesday, Hifz, `2:1–2:15`. Range: 15.
**Achievement B:** Tuesday, Hifz, `2:10–2:20`. Range: 11.

Note A and B overlap on verses 10–15.

Reconciliation:
- A.range ∩ item = `2:1–2:15`.
- B.range ∩ item = `2:10–2:20`.
- Union = `2:1–2:20` = 20 verses.
- `achieved_verses` = 20 (not 26 — the overlap doesn't double-count).
- `status` = **completed**.

## Example 5 — achievement extends beyond item range

**Plan item:** Tuesday, Hifz, `2:1–2:20`. Total: 20.

**Achievement A:** Tuesday, Hifz, `2:1–2:30`. Range: 30.

Reconciliation:
- A.range ∩ item.range = `2:1–2:20` (clipped at the item's end).
- `achieved_verses` = 20.
- `status` = **completed**.

The student's extra work on verses 21–30 doesn't apply to this item. It might apply to *another* item for the same day with a range covering 21–30, if one exists. Otherwise it's "unmatched" achievement work — recorded but not credited against any plan target. Reports surface this.

## Example 6 — achievement on wrong day doesn't match

**Plan item:** Tuesday (day_of_week=2), Hifz, `2:1–2:20`.

**Achievement A:** Wednesday (day_of_week=3), Hifz, `2:1–2:20`. Range matches but day doesn't.

Reconciliation:
- A does not match (day_of_week mismatch).
- No change to the item.

The student did Hifz work on Wednesday covering Tuesday's plan content, but the plan tracks day-by-day execution. The achievement is unmatched against the Tuesday item. It may match a Wednesday item if one exists with overlapping range.

## Example 7 — cross-surah achievement

**Plan item:** Tuesday, Hifz, `2:280–3:15`. Total = (286−280+1) + 15 = 7 + 15 = 22 verses.

**Achievement A:** Tuesday, Hifz, `2:285–3:5`. Range = (286−285+1) + 5 = 2 + 5 = 7 verses.

Reconciliation:
- A.range ∩ item.range = `2:285–3:5` (lies entirely within item range).
- `achieved_verses` = 7.
- `total_verses` = 22.
- `status` = **partial**.

## Example 8 — student covers different verses than planned

**Plan item:** Tuesday, Hifz, `2:1–2:20`. Total: 20.

**Achievement A:** Tuesday, Hifz, `2:100–2:120`. Range: 21.

Reconciliation:
- A.range ∩ item.range = ∅ (no overlap).
- `achieved_verses` = 0.
- `status` = **due** (if today ≤ Tuesday) or **overdue** (if today > Tuesday).

The achievement is unmatched. The student did Hifz work, just not the planned content. The item stays uncompleted.

## Example 9 — unapproval removes verses

**Plan item:** Tuesday, Hifz, `2:1–2:20`. Total: 20.

**Achievement A:** Tuesday, Hifz, `2:1–2:20`, approved.

State before unapproval:
- `achieved_verses` = 20.
- `status` = **completed**.

Principal unapproves A.

Reconciliation re-runs:
- A is no longer approved; excluded from the union.
- No other achievements match.
- `achieved_verses` = 0.
- `status` = **due** (if today ≤ Tuesday) or **overdue** (if today > Tuesday).

## Example 10 — re-approval restores

Continuing example 9. The achievement is edited (it was unapproved, so editable), then re-approved.

Reconciliation runs again on the re-approval:
- A is approved; included in the union.
- `achieved_verses` = 20.
- `status` = **completed**.

The item's history shows the round-trip in the audit log (unapprove, update, approve), but the item's current state is identical to before unapproval.

## Implementation note

For the typical session size (10–200 verses), a simple `Set<string>` of `"S:V"` strings works:

```ts
function applyAchievementsToItem(item, achievements) {
  const itemVerses = new Set<string>();
  for (const v of quranValidator.iterateVerses(item.range)) {
    itemVerses.add(`${v.surah}:${v.verse}`);
  }

  const covered = new Set<string>();
  for (const a of achievements) {
    for (const v of quranValidator.iterateVerses(a.range)) {
      const key = `${v.surah}:${v.verse}`;
      if (itemVerses.has(key)) covered.add(key);
    }
  }

  return {
    achieved_verses: covered.size,
    total_verses: itemVerses.size,
  };
}
```

For 100-verse sessions, this is microseconds. Don't optimize until profiling shows otherwise.
