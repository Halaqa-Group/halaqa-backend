---
name: nestjs-achievements-weekly-plans-module
description: Implement, extend, or modify the achievements and weekly plans module for the school management backend (NestJS + TypeORM + MySQL). Use this whenever the user asks to add or change endpoints under `/achievements/*` or `/weekly-plans/*`; record/approve/unapprove/delete achievements; compute `percentage_score` from raw error counts via halaqa `evaluation_settings`; handle verse-range validation across surahs; create/approve weekly plans; manage `weekly_plan_items` and the reconciliation between approved achievements and plan items; or enforce role-based visibility for principal, vice_principal, supervisor, teacher, and parent over achievement and plan data. Triggers even when "achievements" isn't said explicitly — anything touching the `achievements`, `weekly_plans`, or `weekly_plan_items` tables; anything about Hifz/Near/Far tracks; anything about percentage scoring formulas or evaluation settings; anything about plan items going `due → overdue → partial → completed`. Does NOT cover halaqa CRUD (separate module), attendance (separate module — but this module READS attendance), extra sessions (Module 8), reports (separate module that consumes data from here).
---

# Achievements & Weekly Plans Module

This module owns three tables: `achievements`, `weekly_plans`, and `weekly_plan_items`. It enforces:

- The achievement approval state machine (create → approve → unapprove → re-approve, with locks).
- The percentage-score computation from raw error counts.
- The verse-range validation across cross-surah ranges.
- The weekly plan approval state machine and structure-lock-on-approval.
- The reconciliation between approved achievements and plan items (invoice/payments model).
- The `due → overdue` daily transition.

The module **reads** from attendance (one-way coupling — see "Attendance coupling" below) but doesn't write to it. It **doesn't depend** on reports, extra sessions, or meetings.

## Stack & non-negotiables

- **Framework:** NestJS, same conventions as the auth/users/students modules (`ResponseInterceptor` envelope, `HttpExceptionFilter`, global `JwtAuthGuard`, `RolesGuard`, `ActiveUserGuard`).
- **ORM:** TypeORM, MySQL. Migrations only; no `synchronize`.
- **School scoping:** every query scopes by `school_id` derived from `CurrentUser`. Cross-school is 404, never 403.
- **Soft delete:** `achievements.deleted_at`, `weekly_plans.deleted_at`. Plan items hard-delete (no `deleted_at` column in the schema).
- **Audit:** every mutation writes an `audit_log` row. Actions listed below.
- **Cron:** uses `@nestjs/schedule`. Currently runs one job: `WeeklyPlansOverdueCron` at school-timezone midnight.
- **Service dependencies:** `AttendanceQueryService` (read-only, from attendance module), `HalaqatService` (read-only, for halaqa `evaluation_settings` and primary-teacher lookups), `StudentsService` (read-only, for student capacities and scope checks), `AuditService`, `QuranRangeValidator` (from `src/quran/`).

## Module layout

```
src/achievements/
├── entities/
│   ├── achievement.entity.ts
│   ├── weekly-plan.entity.ts
│   └── weekly-plan-item.entity.ts
├── dto/
│   ├── create-achievement.dto.ts
│   ├── update-achievement.dto.ts
│   ├── list-achievements.query.ts
│   ├── create-weekly-plan.dto.ts
│   ├── create-weekly-plan-item.dto.ts
│   └── update-weekly-plan-item.dto.ts
├── services/
│   ├── achievements.service.ts            # CRUD + approval state machine
│   ├── achievement-score.service.ts       # percentage_score computation
│   ├── weekly-plans.service.ts            # plan CRUD + approval
│   ├── plan-items.service.ts              # item CRUD + reconciliation entrypoint
│   ├── plan-reconciliation.service.ts     # the matching/union math
│   └── overdue-cron.service.ts            # daily transition
├── controllers/
│   ├── achievements.controller.ts
│   ├── weekly-plans.controller.ts
│   └── plan-items.controller.ts
├── mappers/
│   ├── achievement.dto.ts                 # role-aware mapper
│   └── plan-item.dto.ts
└── achievements.module.ts

src/quran/                                  # shared, not exclusive to this module
├── quran.constants.ts                     # SURAH_VERSES, SURAH_NAMES_AR/EN
└── quran-range.validator.ts               # range validation + verse counting
```

## The achievement approval state machine

The `status` enum has two values: `'approved'` and `'unapproved'`. Combined with `approved_at` and `approved_by`, three observable states exist:

| `status` | `approved_at` | meaning |
|---|---|---|
| `'unapproved'` | `NULL` | newly recorded, never approved |
| `'approved'` | set | currently approved |
| `'unapproved'` | set | was approved, then revoked |

**On approve:** `status = 'approved'`, `approved_by = caller`, `approved_at = now()`. Audit: `achievement.approve`.

**On unapprove (revoke):** `status = 'unapproved'`. `approved_by` and `approved_at` are **preserved** — they reflect the most recent approval. Audit: `achievement.unapprove` with the previous approver in `oldValues`.

**On re-approve:** `status = 'approved'`, `approved_by = caller` (may differ from before), `approved_at = now()`. The previous approval is overwritten in the row; audit retains history.

**Approved achievements are locked.** Any `PATCH /achievements/:id` against `status = 'approved'` returns 400 with message `"Approved achievement is locked. Unapprove it first."` This applies to all roles including principal/VP. The workflow to change an approved value is: unapprove → edit → re-approve (three API calls, three audit rows).

## Recording achievements

`POST /achievements` accepts:

```ts
{
  student_id, halaqa_id, date, track_type,         // identifiers
  start_surah, start_verse, end_surah, end_verse,  // verse range
  mistakes_count, warnings_count, tajweed_errors_count,
  teacher_notes?,
  approve?: boolean        // default false
}
```

Service flow:

1. **Authorize the create.** Caller must have scope on the halaqa (principal/VP, supervisor with the halaqa in `supervisor_halaqat`, or teacher with active `halaqa_teachers` row — primary OR non-primary, both can record).
2. **Validate the verse range** via `QuranRangeValidator`. Cross-surah ranges are allowed; see "Verse range semantics" below.
3. **Attendance check.** Look up `attendance(student_id, halaqa_id, date)`. If no row → 400 `"Attendance must be recorded for this student before achievements can be entered."`. If row exists with absent status → 400 `"Cannot record achievement: student was absent."`. See "Attendance coupling."
4. **Load the halaqa's `evaluation_settings`.** Mandatory; if NULL, that's a bug (creation/update of halaqa should have required it). Throw 500 if it happens.
5. **Compute `percentage_score`** via `AchievementScoreService.compute()`. See "Score computation."
6. **If `approve === true`:**
   - Separately authorize approval (caller is principal/VP/supervisor-in-scope/primary-teacher-or-acting). If not allowed → 403 `"You cannot approve achievements for this halaqa."` Do not silently downgrade to "just record."
   - Set `status = 'approved'`, `approved_by = caller`, `approved_at = now()`.
7. **Persist.**
8. **Audit.** Write `achievement.create` always. If approved in the same call, write a second `achievement.approve` row. Two audit rows for one API call — keeps the audit log analyzable across paths.
9. **If approved**, run reconciliation (see "Reconciliation").
10. **Response.** Return the mapped DTO via `AchievementDto.fromEntity(achievement, currentUser)`.

### Daily uniqueness — not enforced

Multiple achievements per `(student_id, date, track_type)` are allowed. The `idx_achievement_lookup` index is non-unique on purpose. Don't add a service-layer uniqueness check.

This means reports that aggregate by `(student_id, date, track_type)` must do `SUM`/`AVG`/`GROUP BY` rollups, not assume one row.

## Approving an existing achievement

`POST /achievements/:id/approve`. Allowed roles:
- principal, VP — always (within school scope).
- supervisor — only if the achievement's `halaqa_id` is in their `supervisor_halaqat`.
- teacher — only if they are primary (`is_primary = 1`) or acting (`acting_as_primary = 1`) on the halaqa, with an active `halaqa_teachers` row.

Service flow:
1. Load achievement, verify school scope (404 on miss).
2. Verify caller's approval authority.
3. If `status` is already `'approved'`, return 400 `"Achievement is already approved."` (idempotency through error, not silent success — keeps the audit clean.)
4. Set `status = 'approved'`, `approved_by`, `approved_at`. Persist.
5. Audit: `achievement.approve`.
6. Run reconciliation.

## Unapproving (revoking) an approved achievement

`POST /achievements/:id/unapprove`. Allowed roles: **principal, VP only**.

Service flow:
1. Load, verify school scope, verify caller is principal or VP.
2. If `status` is `'unapproved'`, return 400.
3. Flip `status = 'unapproved'`. **Preserve** `approved_by` and `approved_at`.
4. Audit: `achievement.unapprove` with `oldValues: { approved_by, approved_at, status: 'approved' }`.
5. Run reconciliation (verses drop out of any matching plan items' coverage union).

## Editing an achievement

`PATCH /achievements/:id`. Only allowed when `status = 'unapproved'`. Approved achievements return 400 (see above).

DTO accepts the same fields as create except `student_id`, `halaqa_id`, `date` (immutable — moving an achievement to a different student/halaqa/date is a delete-and-recreate operation). The `approve` flag is **not** on the update DTO.

Allowed roles: anyone who could record the achievement in scope. Editing doesn't have a primary-authority gate.

If `mistakes_count`, `warnings_count`, or `tajweed_errors_count` change, `percentage_score` is recomputed in the same transaction.

Audit: `achievement.update`.

## Deleting an achievement

`DELETE /achievements/:id`. Soft delete via `deleted_at`.

- **Unapproved achievement:** anyone who could record can delete (principal, VP, supervisor in scope, teacher in scope — primary or non-primary). No `recorded_by` check.
- **Approved achievement:** **principal only.** VP cannot. Matches the matrix row "حذف إنجاز معتمد" — principal-only.

Audit: `achievement.delete`. If the achievement was approved at delete time, include `was_approved: true` in audit values.

If deleted while approved, run reconciliation (verses drop out).

## Score computation

`AchievementScoreService.compute(rawCounts, evaluationSettings)`:

```ts
score = Math.max(
  settings.min_score,
  settings.base_score
    - rawCounts.mistakes_count    * settings.mistake_weight
    - rawCounts.warnings_count    * settings.warning_weight
    - rawCounts.tajweed_errors_count * settings.tajweed_weight
);
return Math.round(score * 100) / 100;  // 2 decimal places
```

`evaluation_settings` is a JSON column on `halaqat`. **Mandatory at the halaqa level** — creating or updating a halaqa with NULL settings is a 400 in the halaqat module. This module assumes settings are always present when reading.

Default shape (the halaqat module enforces this):
```json
{
  "base_score": 100,
  "mistake_weight": 2.0,
  "warning_weight": 1.0,
  "tajweed_weight": 1.5,
  "min_score": 0
}
```

### Historical scores are frozen

When a halaqa's `evaluation_settings` changes, existing achievement scores are **not recomputed**. They reflect the formula in effect at the time of computation. The audit log records every settings change on the halaqa, so historical formula is recoverable from there.

No admin endpoint exists to recompute historical scores. If one is needed later, that's a separate feature.

## Verse range semantics

Achievements and plan items both use `(start_surah, start_verse, end_surah, end_verse)`. Cross-surah ranges are allowed.

All validation and verse-counting goes through `QuranRangeValidator` (in `src/quran/`). The validator is shared between achievements and plan items — never reimplement.

Validation:
- `start_surah` in `[1, 114]`, `end_surah` in `[1, 114]`.
- `end_surah >= start_surah`.
- If `start_surah == end_surah`: `end_verse >= start_verse`.
- `start_verse` in `[1, SURAH_VERSES[start_surah]]`.
- `end_verse` in `[1, SURAH_VERSES[end_surah]]`.

Verse counting:
```
if start_surah == end_surah:
  total = end_verse - start_verse + 1
else:
  total = (SURAH_VERSES[start_surah] - start_verse + 1)
        + sum(SURAH_VERSES[s] for s in (start_surah+1 ... end_surah-1))
        + end_verse
```

Constants live in `src/quran/quran.constants.ts` as 1-indexed arrays (a dummy `0` slot at index 0). See `references/quran-constants.md`.

## Weekly plans

### Create

`POST /weekly-plans` accepts:
```ts
{
  student_id, halaqa_id, week_start_date,
  items: CreatePlanItemDto[]
}
```

Allowed: principal, VP, primary (or acting) teacher of the halaqa.

Service flow:
1. Authorize. School scope, halaqa scope, primary-authority check for teachers.
2. **Conflict check.** Query `weekly_plans` for an existing non-deleted row with `(student_id, halaqa_id, week_start_date)`. If found → 409 `{ message: "Plan already exists for this student/halaqa/week.", existing_plan_id: <id> }`. To replace, the caller must `DELETE` the existing plan first.
3. Validate each item: range valid, `day_of_week` in `[0..6]` or `[1..7]` (per your existing convention), `track_type` valid.
4. Compute `total_verses` for each item via `QuranRangeValidator`. `achieved_verses` starts at `0`, `status` at `'due'`, `is_manual_override` at `0`.
5. Persist plan and items in a single transaction.
6. Audit: `weekly_plan.create` with `items_count` in `newValues`.

### Plan auto-generation: TODO

`POST /weekly-plans/generate` is **not implemented**. The endpoint should either not exist or return 501. The frontend should not expose a "generate plan" button.

When this is built, it will:
- Accept `{ halaqa_id, week_start_date, student_ids? }`.
- Allowed roles: principal, VP, primary teacher of the halaqa.
- Generation strategy is undecided (see Q5b in the design notes). Sources to consider: student capacities (`daily_*_pages_capacity`), the halaqa's meeting schedule, last approved achievement frontier per track.
- Idempotency: skip students who already have a plan for the week, or 409.

Until the spec is finalized, **manual creation via `POST /weekly-plans` is the only path.**

### Approve a plan

`POST /weekly-plans/:id/approve`. Allowed: principal, VP, primary (or acting) teacher of the halaqa.

1. Load plan, school+halaqa scope checks.
2. If already `'approved'` → 400.
3. Flip `status = 'approved'`, set `approved_by`.
4. Audit: `weekly_plan.approve`.

### Unapprove a plan

`POST /weekly-plans/:id/unapprove`. Allowed: principal, VP (mirroring achievement unapprove).

`status = 'draft'`. `approved_by` preserved. Audit: `weekly_plan.unapprove`.

### Approved-plan semantics

When `status = 'approved'`:

- **Reconciliation updates** to items (`achieved_verses`, `status`): always allowed; the service path is internal, not user-facing.
- **Manual item range edits** (`PATCH /weekly-plan-items/:id` changing range fields): allowed for principal/VP and primary teacher. Sets `is_manual_override = 1`. Triggers recompute of `total_verses` and re-runs reconciliation for that item.
- **Add new item to approved plan:** `POST /weekly-plans/:id/items` returns 400 `"Cannot add items to an approved plan. Unapprove first."`
- **Delete item from approved plan:** `DELETE /weekly-plan-items/:id` returns 400 `"Cannot delete items from an approved plan. Unapprove first."`

When `status = 'draft'`:
- All of the above are allowed without the unapprove dance.

The `is_manual_override` flag is **permanent** once set. It tracks "this item's range was edited after creation" — not "edited while approved." Unapproving and re-approving doesn't reset it.

### Plan deletion

`DELETE /weekly-plans/:id` — soft delete. Allowed: principal, VP. (Primary teachers cannot delete plans, only edit their items.) Items are not soft-deleted (no `deleted_at` column); the soft-deleted plan being un-listable is sufficient.

Audit: `weekly_plan.delete`.

## Reconciliation — achievements ↔ plan items

This is the central piece of business logic. Model it as **invoice + payments**: each plan item is an invoice with a target verse range; each approved achievement is a payment that applies to one or more invoices via verse-range overlap.

### When reconciliation runs

Triggered (synchronously, in the same transaction) on:
1. **Achievement approved** — apply its verses to matching plan items.
2. **Achievement unapproved** — remove its verses from matching plan items.
3. **Approved achievement deleted** — remove its verses (same as unapprove).
4. **Plan item range edited** — recompute the item against all approved achievements that could match.
5. **Plan approved** — recompute every item against all approved achievements that could match.

The recompute service method is:
```ts
PlanReconciliationService.reconcileItem(planItemId: number): Promise<void>
```

It loads all approved, non-deleted achievements matching the item's `(student_id, halaqa_id, week, day_of_week, track_type)`, computes the union of their verse ranges intersected with the item's range, and updates `achieved_verses` and `status`.

Trigger 1–3 above each compute the set of candidate plan items (same student, same halaqa, same week, same track, day_of_week matches the achievement's date), then call `reconcileItem` for each.

### Matching rule

An achievement matches a plan item when **all** of:
- Same `student_id`.
- Same `halaqa_id`.
- Achievement's `date` falls within the plan's week, and `day_of_week(date) === item.day_of_week`.
- Same `track_type`.
- The verse ranges overlap (any verse in common).

An achievement may match zero, one, or more plan items.

### The math

```
applied_verses = ⋃ᵢ (achievementᵢ.range ∩ item.range)
                 over all approved, non-deleted achievements matching the item

achieved_verses = |applied_verses|       // count of unique verses
total_verses    = |item.range|           // already stored; doesn't change unless range edited

status determination:
  if achieved_verses == 0:
    if today < item's date:  status = 'due'
    else:                    status = 'overdue'
  if 0 < achieved_verses < total_verses:
    status = 'partial'
  if achieved_verses == total_verses:
    status = 'completed'
```

Set union, not arithmetic addition. Two achievements covering the same verses don't double-count.

For implementation: represent the union as a sorted list of disjoint `(surah, verse)` intervals. Or, given the small ranges typical of daily Quran sessions (tens to low hundreds of verses), expand to a set of `(surah, verse)` pairs and take `Set` operations. Both work; the set approach is simpler for small N.

### Cross-day overlap

An achievement whose verse range spans into territory planned for a different day still counts only against the matching `day_of_week`. The matching is by day-of-week first, then by range overlap. An achievement on Tuesday matches only Tuesday items, regardless of what verses it covers.

### Unmatched achievements

An approved achievement that doesn't overlap any plan item still exists — it's just not linked. Reports surface this as "unmatched achievement work." The achievement isn't lost or hidden.

### Future async swap

`PlanReconciliationService.reconcileItem` is the boundary. Today it's called inside the same transaction as approve/unapprove/delete. When volume grows, the swap is:
1. Replace direct calls with publishing an event (`achievement.approved` etc.) to a queue.
2. A worker subscribes and calls `reconcileItem`.
3. The reconciliation logic itself doesn't change.

Don't bake assumptions about synchronicity into the calling code beyond the transaction boundary.

## The `due → overdue` daily cron

`WeeklyPlansOverdueCron` runs once a day at school-timezone midnight. For each school (in its timezone):

```sql
UPDATE weekly_plan_items wpi
JOIN weekly_plans wp ON wp.id = wpi.weekly_plan_id
JOIN students s ON s.id = wp.student_id
SET wpi.status = 'overdue'
WHERE s.school_id = :schoolId
  AND wp.deleted_at IS NULL
  AND wpi.status = 'due'
  AND <date-of-item> < CURRENT_DATE();
```

`<date-of-item>` is computed from `wp.week_start_date` plus `wpi.day_of_week` offset (per your week-numbering convention).

The cron only handles `due → overdue`. It never flips `partial`, `completed`, or `overdue` back to `due`. The reconciliation handles `partial` and `completed` transitions; `overdue` items that get late achievements transition to `partial` via reconciliation.

No backfill cron, no nightly recompute of `achieved_verses`. The stored values are authoritative; reconciliation keeps them current.

## Attendance coupling

The achievements module **reads** the attendance table. The dependency is:

```
AchievementsService
    └── AttendanceQueryService.findForStudentOnDate(studentId, halaqaId, date)
```

This is a read-only one-way dependency. The attendance module doesn't know about achievements.

### On achievement create

Hard coupling, attendance-first workflow. Before persisting a new achievement:

1. Query attendance for `(student_id, halaqa_id, date)`.
2. If no row exists → **400** `"Attendance must be recorded for this student before achievements can be entered."`
3. If row exists with status indicating absence → **400** `"Cannot record achievement: student was absent."`
4. Otherwise, proceed.

Record the attendance row's `id` in the achievement's audit row's `description` field — `"created against attendance row #<id>"`. This is defensive logging; reports investigating inconsistencies (see below) use this.

### Retroactive attendance changes

The attendance module is free to update past attendance records. **Existing achievements are not affected.** Pre-existing achievements stay; no cascading update, no validation, no warning.

This creates a potential inconsistency: a student may have an achievement on a day attendance now says they were absent. This is **intentional** — surfaced by reports, not by service-layer enforcement.

### On achievement edit

Editing an achievement's mutable fields (counts, range, notes) does **not** re-check attendance. Only the initial create gates on attendance.

### Bulk endpoints

If/when bulk achievement endpoints are built, attendance is checked **per row** in the batch. Rows missing attendance fail individually; the rest proceed. A bulk endpoint returns a structured result of per-row outcomes.

## Visibility — what each role sees

Same response-mapper pattern as students. `AchievementDto.fromEntity(achievement, currentUser)` is the single point of truth.

### For principal, VP, supervisor in scope, teacher in scope

Full row. Every field present. `recorded_by` and `approved_by` are resolved to `{ id, name }` objects, not just IDs.

### For parent (own children only)

Stripped response. **Omitted fields** (not present as keys, not null):
- `mistakes_count`
- `warnings_count`
- `tajweed_errors_count`
- `recorded_by`
- `approved_by`
- `approved_at`

Visible fields: `id`, `student_id`, `halaqa_id`, `date`, `track_type`, range fields, `percentage_score`, `status`, `teacher_notes`, `created_at`, `updated_at`.

The parent sees a clean "what my child did" view. They see the score, the verse range, the note. They don't see error breakdowns or which teacher handled it.

### Search and filter constraints for parents

Parents cannot filter or sort by fields they can't see. The query layer rejects:
- `?recorded_by=...` → 400
- `?approved_by=...` → 400
- `sort=mistakes_count` etc. → 400

This is the same side-channel-prevention rule as the `id_number` skill.

### Status filter

Parents can filter by `status` (e.g., `?status=approved`). The status is visible to them. This lets a parent UI show "pending teacher approval" badges.

### Visibility applied uniformly

The mapper applies wherever an achievement is serialized — direct endpoints, embeds in reports (when built), embeds in student detail responses. Apply the mapper, never serialize the raw entity.

### Plan items — same pattern

Plan items have less PII, but the mapper still gates by role for consistency. Parents see plan items for their own children's plans. Teachers see plan items in their halaqat. No field-level redaction on plan items in the current design.

## Audit actions

| Action | Trigger | Notes |
|---|---|---|
| `achievement.create` | POST /achievements | Always written, even when bundled with approve |
| `achievement.update` | PATCH /achievements/:id | Only valid for unapproved achievements |
| `achievement.approve` | POST /achievements/:id/approve or POST /achievements with `approve: true` | Separate row even when bundled |
| `achievement.unapprove` | POST /achievements/:id/unapprove | Includes prior approver in `oldValues` |
| `achievement.delete` | DELETE /achievements/:id | Include `was_approved: true` in values if applicable |
| `weekly_plan.create` | POST /weekly-plans | Include `items_count` in `newValues` |
| `weekly_plan.approve` | POST /weekly-plans/:id/approve | |
| `weekly_plan.unapprove` | POST /weekly-plans/:id/unapprove | |
| `weekly_plan.delete` | DELETE /weekly-plans/:id | |
| `weekly_plan_item.update` | PATCH /weekly-plan-items/:id when range fields change | Sets `is_manual_override = 1`; audit includes old and new ranges |
| `weekly_plan_item.create` | POST /weekly-plans/:id/items (draft plans only) | |
| `weekly_plan_item.delete` | DELETE /weekly-plan-items/:id (draft plans only) | |

Reconciliation-driven updates to `achieved_verses` and `status` on plan items are **not** audited individually. They happen continuously and would flood the log. Audit the trigger events instead (achievement approve/unapprove/delete).

## When adding a new endpoint to this module — checklist

1. Decide which roles. Default deny. Annotate with `@Roles(...)`.
2. If the operation is on `:id`, attach the appropriate scope guard (student scope, halaqa scope, or composed).
3. If the operation touches `achievements` or `weekly_plan_items`, route through the relevant service. Don't query the repos directly from the controller.
4. If the operation creates an achievement, route through the attendance check. No exceptions.
5. If the operation transitions an achievement or plan to/from approved, route through the reconciliation service.
6. Audit. Always.
7. Apply the role-aware mapper before returning. Never return raw entities.
8. Tests: cross-school 404, out-of-scope 404, wrong role 403, happy-path 200/201, audit row written.

## When NOT to use this skill

- Halaqa CRUD (`halaqat`, `halaqa_teachers`, `supervisor_halaqat`) — separate module. This module reads from them but doesn't manage them.
- Attendance — separate module. This module reads attendance to enforce the coupling but doesn't write or own it.
- Extra sessions and meetings — Module 8. They have their own attendance and don't interact with this module.
- Reports — they consume data from this module via the same mappers. Don't reinvent the visibility rules in the reports module.
- Student CRUD — separate module. This module reads `student.daily_*_pages_capacity` if/when the plan generator is implemented.

## Reference files

- `references/quran-constants.md` — full structure of `quran.constants.ts` (verse counts, names AR/EN).
- `references/score-formula.md` — worked examples of the percentage_score computation.
- `references/reconciliation-examples.md` — worked examples of the achievement ↔ plan-item matching, including cross-surah and split-day cases.
- `references/audit-actions.md` — exact audit row shapes for each action.
- `references/state-transitions.md` — full state diagram for achievements and plans.
