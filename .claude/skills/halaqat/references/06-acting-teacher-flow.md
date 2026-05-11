# Acting Teacher Flow

This is the most nuanced flow in the module. It covers the temporary
substitution of an absent main teacher by another teacher on the
same halaqa, including the daily cron that activates and expires acting
periods automatically.

Read alongside business rules **BR-HLQ-04**, **BR-HLQ-05**, **BR-HLQ-06**,
**BR-HLQ-08**, **BR-HLQ-09**.

---

## Mental model

A halaqa has two "primary" slots that are tracked independently:

```
              ┌─────────────────────────────────────┐
              │            Halaqa H                  │
              │                                      │
              │   role = 'main' slot:                │
              │   ─────────────────                  │
              │   permanent designation              │
              │   filled when the org assigns        │
              │   a main teacher to this halaqa      │
              │                                      │
              │   acting_as_primary slot:            │
              │   ─────────────────────              │
              │   temporary cover                    │
              │   filled when the main is absent     │
              │   and someone else fills in          │
              │                                      │
              └─────────────────────────────────────┘
```

Both slots are tracked **on rows in `halaqa_teachers`** (one row per teacher,
not separate rows for "main" and "acting"). The `role` column and the
`acting_as_primary` flag together describe the row's current state.

A halaqa can have at most one row with `role='main'` active and at most
one row with `acting_as_primary=1` active (DB-level via generated columns
`primary_lock` and `acting_lock`).

---

## Effective primary

For internal uses ("who is currently running halaqa H?"), the effective
primary is the union:

```sql
WHERE end_date IS NULL
  AND (role = 'main' OR acting_as_primary = 1)
```

While acting is in effect, **two** users can match this query on the
same halaqa: the original main (still `role='main'`, but absent in
real life) and the acting teacher. This is intentional — when the
absence ends, the original main's permissions restore without any
data change (BR-HLQ-09).

For *permission* purposes, the matrix in `04-permissions-matrix.md` is
even broader: any active teacher (main, assistant, or substitute) can
edit halaqa name, evaluation_settings, and schedule. So the effective-
primary distinction matters mostly for display.

---

## The three roles in this flow

| Role | Created via | Lives until |
|---|---|---|
| `main` | `POST /halaqat` (with `primary_teacher_user_id`) or `POST /halaqat/:id/teachers` with `role='main'` | The admin ends the assignment, OR the halaqa is archived/completed |
| `assistant` | `POST /halaqat/:id/teachers` with `role='assistant'` | Same as above |
| `substitute` | `POST /halaqat/:id/teachers/acting-substitute` (created together with the acting period) | Their acting period ends — at which point the row is **closed entirely** (`end_date` set), not just demoted to a non-acting substitute (BR-HLQ-06) |

The CHECK constraint `chk_substitute_must_act` enforces that
`role='substitute' AND acting_as_primary=0 AND end_date IS NULL` cannot
exist. Substitutes can never linger in a non-acting state.

---

## Workflow A — Activating acting on a teacher already on the halaqa

The most common case: an existing assistant gets promoted to acting
while the main is absent.

```
Setup: Halaqa H has two active rows in halaqa_teachers:
  - row R1: teacher_user_id = A, role='main',      acting_as_primary=0
  - row R2: teacher_user_id = B, role='assistant', acting_as_primary=0

Trigger: Admin says "B will cover for A from May 10 to May 20."

POST /halaqat/H/teachers/R2/acting
{
  "acting_starts_at": "2026-05-10",
  "acting_ends_at":   "2026-05-20"
}

Service flow:
  1. Verify R2 is an active assignment on halaqa H (end_date IS NULL).
  2. Verify R2.role IS NOT 'substitute'. Substitutes are created fresh
     by Workflow B; you can't "activate acting" on an existing substitute
     because they already have it by definition.
  3. NO schedule conflict check (BR-HLQ-08 — acting bypasses).
  4. Decide whether to flip acting_as_primary now:
       - if acting_starts_at <= today: set acting_as_primary = 1 immediately.
       - if acting_starts_at >  today: leave acting_as_primary = 0
         and let the daily cron flip it on its start date.
  5. UPDATE row R2:
       acting_as_primary = (computed above)
       acting_starts_at  = '2026-05-10'
       acting_ends_at    = '2026-05-20'
  6. Log halaqa_activity_logs:
       action            = 'acting_started'
       halaqa_id         = H
       target_user_id    = B
       actor_user_id     = current admin
       metadata          = { acting_starts_at, acting_ends_at, takes_effect: 'now' | 'future' }

Result:
  - Halaqa H still has R1 (A, role='main') — A is the permanent main.
  - R2 (B) has acting_as_primary = 1 (or 0 if scheduled in the future).
  - The effective-primary check now matches both A and B.
```

---

## Workflow B — Adding a substitute (teacher NOT yet on the halaqa)

When no suitable assistant exists on the halaqa to take over, the admin
brings in a substitute teacher specifically for the acting period.

This workflow uses a **single endpoint** (`POST /halaqat/:id/teachers/acting-substitute`)
that creates the substitute row and activates acting in one atomic
operation. The constraint `chk_substitute_must_act` requires this — you
cannot insert a substitute row with `acting_as_primary=0`.

```
Setup: Halaqa H has only row R1 (A, role='main'). A is absent.
       Teacher C is on a different halaqa entirely (or available pool).

POST /halaqat/H/teachers/acting-substitute
{
  "teacher_user_id": C,
  "acting_starts_at": "2026-05-10",
  "acting_ends_at":   "2026-05-20",
  "notes": "Covering for A's annual leave"
}

Service flow (single transaction):
  1. Verify C exists in this school and has the 'teacher' role.
  2. Verify C does not already have an active assignment to halaqa H
     (otherwise this should be Workflow A, not B).
  3. NO schedule conflict check (BR-HLQ-08 — acting bypasses).
  4. INSERT halaqa_teachers:
       halaqa_id         = H
       teacher_user_id   = C
       role              = 'substitute'
       acting_as_primary = 1
       acting_starts_at  = '2026-05-10'
       acting_ends_at    = '2026-05-20'
       start_date        = today
       end_date          = NULL
       assigned_by       = current admin
       notes             = "Covering for A's annual leave"
  5. Log halaqa_activity_logs:
       action            = 'acting_started'
       halaqa_id         = H
       target_user_id    = C
       actor_user_id     = current admin
       metadata          = { role: 'substitute', acting_starts_at, acting_ends_at }

Result:
  - Halaqa H has R1 (A, role='main') — unchanged.
  - Halaqa H has new row R3 (C, role='substitute', acting_as_primary=1).
```

**Future-dated substitutes are not allowed.** The substitute row must be
created with `acting_as_primary=1` from day one (the CHECK constraint
forbids `acting_as_primary=0` on an active substitute). If the admin
needs to schedule a substitute starting next week, they create the row
on that day, not earlier.

For advance planning, use an assistant instead — assistants can have
`acting_starts_at > today` with `acting_as_primary=0`, and the cron flips
the flag when the start date arrives.

---

## Acting expiration — the daily cron job

Job name: `expire_acting_primary`. Lives in `jobs/expire-acting-primary.job.ts`.
Runs once daily, ideally just after midnight in the school's timezone.

```ts
async run() {
  // Phase 1: ACTIVATE pending actings on assistants (acting_starts_at = today,
  // but the flag was left at 0 because the start was in the future when created).
  // This phase only applies to assistant rows — substitutes can never
  // exist with acting_as_primary=0 (CHECK constraint).
  await this.qb
    .update('halaqa_teachers')
    .set({ acting_as_primary: 1 })
    .where('acting_as_primary = 0')
    .andWhere('acting_starts_at <= CURDATE()')
    .andWhere('(acting_ends_at IS NULL OR acting_ends_at >= CURDATE())')
    .andWhere('end_date IS NULL')
    .andWhere('role = \'assistant\'');

  // Phase 2a: EXPIRE acting on assistants — clear the flags only.
  // The assistant assignment continues as a regular assistant.
  const expiredAssistants = await this.qb('halaqa_teachers')
    .select(['id', 'halaqa_id', 'teacher_user_id'])
    .where('acting_as_primary = 1')
    .andWhere('acting_ends_at < CURDATE()')
    .andWhere('end_date IS NULL')
    .andWhere('role = \'assistant\'')
    .getMany();

  if (expiredAssistants.length > 0) {
    await this.qb
      .update('halaqa_teachers')
      .set({
        acting_as_primary: 0,
        acting_starts_at:  null,
        acting_ends_at:    null,
      })
      .whereIn('id', expiredAssistants.map(r => r.id));
  }

  // Phase 2b: EXPIRE acting on substitutes — close the row entirely.
  // Substitutes only exist while acting (BR-HLQ-06); when their acting
  // ends, so does their assignment. The CHECK constraint requires this:
  // we cannot leave a substitute row with acting_as_primary=0 and
  // end_date IS NULL.
  const expiredSubstitutes = await this.qb('halaqa_teachers')
    .select(['id', 'halaqa_id', 'teacher_user_id'])
    .where('acting_as_primary = 1')
    .andWhere('acting_ends_at < CURDATE()')
    .andWhere('end_date IS NULL')
    .andWhere('role = \'substitute\'')
    .getMany();

  if (expiredSubstitutes.length > 0) {
    await this.qb
      .update('halaqa_teachers')
      .set({
        end_date:          this.today(),
        end_reason:        'other',
        notes:             // append: 'Auto-ended by cron: substitute acting period expired'
        acting_as_primary: 0,  // safe to clear once end_date is set (CHECK exempts ended rows)
        acting_starts_at:  null,
        acting_ends_at:    null,
      })
      .whereIn('id', expiredSubstitutes.map(r => r.id));
  }

  // Phase 3: log everything (assistants ended + substitutes closed).
  // Use distinct messages so reading the audit log clearly explains
  // which flow happened.
  for (const r of expiredAssistants) {
    await this.activityLog.record({
      school_id:      ...,
      halaqa_id:      r.halaqa_id,
      action:         'acting_ended',
      actor_user_id:  null,
      target_user_id: r.teacher_user_id,
      notes: 'Auto-ended by daily cron — assistant acting period reached acting_ends_at.',
    });
  }
  for (const r of expiredSubstitutes) {
    await this.activityLog.record({
      school_id:      ...,
      halaqa_id:      r.halaqa_id,
      action:         'acting_ended',
      actor_user_id:  null,
      target_user_id: r.teacher_user_id,
      notes: 'Auto-ended by daily cron — substitute closed at end of acting period.',
    });
  }

  // Phase 4 (advisory): warn admins about active halaqat with no
  // effective primary. See BR-HLQ-11 and notify_no_primary.job.ts —
  // that's a SEPARATE cron, not part of this one.
}
```

**Idempotence:** running twice in the same day is safe.
- Phase 1's WHERE excludes rows already at `acting_as_primary=1`.
- Phase 2a's WHERE selects only assistant rows; second run finds nothing
  because we just cleared their flags.
- Phase 2b's WHERE selects only substitute rows with `end_date IS NULL`;
  second run finds nothing because we just set `end_date`.

**Race with manual operations:** if an admin ends acting manually
(`DELETE .../acting`) between the SELECT and UPDATE in phase 2, the
UPDATE just becomes a no-op. The activity log will record both events.

---

## What happens when the original main returns

This is the magic of BR-HLQ-09: **nothing happens at the data layer**.
The original main's row (`role='main'`, `end_date IS NULL`) was
never touched while acting was in effect. When the acting teacher's
`acting_as_primary` flag goes back to 0 (or their substitute row is
closed), the effective-primary check immediately stops matching the
acting teacher and keeps matching the original main. No restore step
is needed.

---

## When `acting_ends_at` arrives but the original main is still absent

Per the user's decision: the acting expires on schedule, the original
main stays `role='main'`. Halaqa H now has an effective primary on
paper (A) but A is in fact absent.

The system's job at this point is **not** to reassign automatically.
What the system does:

1. Phase 2 of the cron expires acting (assistant clears flags / substitute
   closes) → halaqa H has no effective acting.
2. The separate `notify_no_primary` cron (BR-HLQ-11) starts the 7-day
   countdown from the moment the acting ended.
3. Admins see the warning in their dashboard and can:
   a) For an assistant whose acting just expired: reactivate via
      `POST .../acting` if extending coverage is needed.
   b) For a substitute whose row just closed: open a new
      `POST /halaqat/H/teachers/acting-substitute`.
   c) Re-assign the main entirely by ending A's row and assigning a new main.
   d) Do nothing and let the warning persist.

This is the correct shape: the cron handles deterministic expiration,
humans handle the decisions about coverage gaps.

---

## Activating acting that creates a same-slot overlap

Allowed (BR-HLQ-08), but should produce a warning:

```ts
async activateActing(...) {
  // ... validation ...

  const overlaps = await this.findActingOverlaps(teacherId, schoolId, halaqaId);

  // overlaps = list of {halaqa_id, halaqa_name, day_of_week, prayer_slot}
  // where the same teacher has another active assignment at the same slot

  if (overlaps.length === 0) {
    return new DataWithWarnings(updatedRow, []);
  }

  const warnings = overlaps.map(o =>
    `Acting teacher will simultaneously cover halaqa '${o.halaqa_name}' on ${dayName(o.day_of_week)}/${o.prayer_slot}.`
  );
  return new DataWithWarnings(updatedRow, warnings);
}
```

`DataWithWarnings` is the `api-envelopes` helper. See `api-envelopes/SKILL.md`.

---

## Sequence diagram — Workflow A (assistant-as-acting)

```
Day 0:
  Admin: POST .../acting  (acting_starts_at: Day 5, acting_ends_at: Day 15)
    → service writes row with acting_as_primary=0,
      acting_starts_at=Day 5, acting_ends_at=Day 15
    → log: 'acting_started' (takes_effect: future)

Day 5 (cron run):
  Phase 1 finds the row, flips acting_as_primary to 1.
  No log entry — implicit activation.

Day 8:
  Admin extends: PATCH .../acting { acting_ends_at: Day 20 }
    → service updates acting_ends_at to Day 20
    → log: 'acting_extended' with metadata.previous_ends_at = Day 15

Day 20 (cron run):
  Phase 2a finds the row (assistant, acting_as_primary=1, acting_ends_at < today).
  Updates: acting_as_primary=0, all acting_* dates → NULL.
  → log: 'acting_ended'

Day 21+:
  Original main's role='main' row was never touched.
  The assistant continues as a regular assistant.
```

## Sequence diagram — Workflow B (substitute lifecycle)

```
Day 0:
  Admin: POST .../acting-substitute (acting_starts_at: today, acting_ends_at: Day 10)
    → service inserts row:
        role='substitute', acting_as_primary=1,
        acting_starts_at=today, acting_ends_at=Day 10
    → log: 'acting_started' with metadata.role='substitute'

Day 5:
  Admin extends: PATCH .../acting { acting_ends_at: Day 15 }
    → log: 'acting_extended'

Day 16 (cron run):
  Phase 2b finds the row (substitute, acting_as_primary=1, acting_ends_at < today).
  Updates: end_date=today, end_reason='other', notes appended.
  Acting flags cleared.
  → log: 'acting_ended'

Day 17+:
  Substitute row is now historical (end_date set). No longer an active
  teacher of the halaqa for any purpose.
```

---

## Common mistakes to avoid

1. ❌ Setting `role` to anything else on the original main when activating
   acting. **Never.** BR-HLQ-09. The original stays `role='main'` throughout.

2. ❌ Inserting a `role='substitute'` row through the regular assignment
   endpoint (`POST /halaqat/:id/teachers`). The CHECK constraint will
   reject it; the regular endpoint should reject it even earlier with a
   400 message pointing to the acting-substitute endpoint.

3. ❌ Running the conflict check during acting activation. BR-HLQ-08.
   The whole point is to allow same-slot coverage.

4. ❌ Demoting a substitute to non-acting. The CHECK forbids it.
   Either close the substitute (set `end_date`) or convert: close the
   substitute row and create a fresh `role='assistant'` row.

5. ❌ Trying to expire acting by checking `acting_ends_at` on the request
   side. The cron is the single source of truth for time-based state
   changes — don't replicate the logic in user-facing endpoints.

6. ❌ Treating Phase 2a (assistant) and Phase 2b (substitute) as
   interchangeable. They have different post-conditions:
   - Assistant after expiration: still active, just not acting.
   - Substitute after expiration: closed (`end_date` set), no longer active.

7. ❌ Future-dating a substitute. Substitutes must have `acting_as_primary=1`
   from creation, which means `acting_starts_at <= today`. For advance
   planning, use an assistant instead.
