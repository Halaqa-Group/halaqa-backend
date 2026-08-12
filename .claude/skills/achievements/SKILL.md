---
name: nestjs-achievements-weekly-plans-module
description: Implement, extend, or modify the achievements and weekly plans module for the school management backend (NestJS + TypeORM + MySQL). Use this whenever the user asks to add or change endpoints under `/achievements/*` or `/weekly-plans/*`; record/approve/unapprove/delete achievements; compute `percentage_score` from raw error counts via halaqa `evaluation_settings`; handle verse-range validation across surahs; create/approve weekly plans; manage `weekly_plan_items` and the reconciliation between approved achievements and plan items; or enforce role-based visibility for principal, vice_principal, supervisor, teacher, and parent over achievement and plan data. Triggers even when "achievements" isn't said explicitly — anything touching the `achievements`, `weekly_plans`, or `weekly_plan_items` tables; anything about Hifz/Near/Far tracks; anything about percentage scoring formulas or evaluation settings; anything about plan items going `due → overdue → partial → completed`. Does NOT cover halaqa CRUD (separate module), attendance (separate module — but this module READS attendance), extra sessions (Module 8), reports (separate module that consumes data from here).
---

# Achievements & Weekly Plans Module

This module owns five tables: `achievements`, `achievement_recitation_positions`, `weekly_plans`, `weekly_plan_items`, and `achievement_plan_item_links`. It enforces:

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
- **Soft delete:** `achievements.deleted_at` only. Weekly plans and plan items hard-delete (the plan entity has a `deleted_at` column but the service never uses it).
- **One permission tier per module:** both achievements and plans gate every mutation on `hasHalaqaScope` — principal, VP, supervisor in `supervisor_halaqat`, or **any** teacher with an active `halaqa_teachers` row. Primary/acting teacher status carries no extra rights here. Parents are read-only.
- **Audit:** every mutation writes an `audit_log` row. Actions listed below.
- **Cron:** uses `@nestjs/schedule`. Currently runs one job: `WeeklyPlansOverdueCron` at school-timezone midnight.
- **Service dependencies:** `AttendanceQueryService` (read-only, from attendance module), `HalaqatService` (read-only, for halaqa `evaluation_settings` and primary-teacher lookups), `StudentsService` (read-only, for student capacities and scope checks), `MemorizationService` (from students module — enqueue-only, see below), `AuditService`, `QuranRangeValidator` (from `src/quran/`).

### Memorization bitmap coupling (students module)

On any **Hifz** achievement approve / unapprove / delete-while-approved (and create-with-approve), `AchievementsService` calls `MemorizationService.enqueueRecompute(studentId)` — a durable, best-effort upsert into `memorization_jobs` (failures are logged, never thrown, so the queue can't fail the mutation). A cron worker (`MemorizationCron`, students module) later rebuilds the student's `students.memorized_ayat` bitmap from the **union of their approved, non-deleted Hifz achievement ranges**. Non-Hifz tracks don't touch memorization. The bitmap logic lives entirely in the students module; achievements only enqueues. See the students skill for the bitmap format and the manual-edit endpoint.

## Module layout

```
src/achievements/
├── entities/
│   ├── achievement.entity.ts
│   ├── achievement-recitation-position.entity.ts
│   ├── weekly-plan.entity.ts
│   ├── weekly-plan-item.entity.ts
│   └── achievement-plan-item-link.entity.ts
├── logic/
│   └── settlement.ts                       # pure: consume + credit-to-best-achievement
├── dto/
│   ├── create-achievement.dto.ts
│   ├── update-achievement.dto.ts
│   ├── list-achievements.query.ts
│   ├── create-weekly-plan.dto.ts
│   ├── create-weekly-plan-item.dto.ts
│   └── update-weekly-plan-item.dto.ts
├── services/
│   ├── achievements.service.ts            # CRUD + approval state machine + count roll-up
│   ├── weekly-plans.service.ts            # plan CRUD + approval
│   ├── plan-items.service.ts              # item CRUD + reconciliation entrypoint
│   ├── plan-reconciliation.service.ts     # matching math + rewrites the settlement links
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
  completion_method?,      // 'quick' | 'mushaf'  — default 'quick'
  recitation_method?,      // 'full' | 'test' | 'untracked' — default 'full'
  test_positions?,         // [{start_surah,start_verse,end_surah,end_verse, pages?, errors[]}] — required when recitation_method='test'
  start_surah, start_verse, end_surah, end_verse,  // verse range
  errors?,                 // [{error_type,start_word_id,end_word_id,surah,ayah,juz,hizb}] — 'full' only; see "Errors"
  error_counts?,           // {mistakes?,warnings?,tajweed?,harakat?} — 'untracked' only; see "Errors"
  percentage_score,        // computed on the frontend, stored as-is
  total_pages?,            // optional — derived from the range when omitted; see "Pages"
  teacher_notes?,
  approve?: boolean        // default false
}
```

### Errors — itemized rows; counts are derived

There are **four** error types: `mistake`, `warning`, `tajweed`, and `harakat` (حركات). Each is weighted by the halaqa's `evaluation_settings` (see "Score computation").

Errors are **itemized**, one row per occurrence in `achievement_position_errors`, each tied to a recitation position and located at a QUL word span:

```ts
{ error_type, start_word_id, end_word_id, surah, ayah, juz, hizb }
```

- `start_word_id/end_word_id` — QUL word ids (sequential in mushaf order).
- `surah/ayah/juz/hizb` — **supplied by the client from QUL** at capture time. The backend has **no QUL dataset** to resolve a word id into a location, so it stores what the client sends. `juz/hizb` are the canonical values for reporting.
- `school_id/student_id/date` — **denormalized by the backend** from the owning achievement (constant, no FK). The client never sends these.

**Counts are derived by COUNT, with exactly one exception:**
- `achievement_recitation_positions.{mistakes,warnings,tajweed_errors,harakat_errors}_count` = COUNT of that position's error rows per type.
- `achievements.{...}_count` = SUM across its positions = COUNT across all its error rows.
- **`untracked` only:** there are no positions and no error rows, so the achievement's four columns hold the teacher's aggregate `error_counts` verbatim. Any future backfill that re-derives counts from `achievement_position_errors` **must exclude `untracked` rows** or it silently zeroes them.

The columns are a denormalized cache the service fills on every create/update; for `full`/`test` the error rows are the source of truth.

How the client sends errors depends on `recitation_method`:

| method | where errors come from | violation |
|---|---|---|
| `'full'` | top-level `errors[]`; they attach to the single auto-created position | sending `test_positions` → 400 |
| `'test'` | `errors[]` inside each entry of `test_positions` | sending top-level `errors` → 400 `"Errors are per-position when recitation_method is "test"..."` |
| `'untracked'` | top-level `error_counts` — how many, not where | sending `errors` or `test_positions` → 400 |

Sending `error_counts` with `full` or `test` → 400 (their counts are derived; a client value would contradict them). The frontend still computes `percentage_score` from these counts and `evaluation_settings` exactly as it does for a documented recitation — `untracked` loses the locations, not the score math.

**Validation.** Each error's `(surah, ayah)` must fall within its position's verse range (Quran order), `end_word_id >= start_word_id`, and `(surah, ayah)` must be a real location (`ayah <= SURAH_VERSES[surah]`) — else 400.

On update, sending `errors` (or `test_positions`, or `recitation_method`) **regenerates the positions wholesale** — the new errors fully replace the old, and the counts re-derive. There is no partial-count merge; the unit of edit is the error list. Regeneration is delete-all-then-insert; error rows cascade-delete with their position.

### Completion & recitation methods

Two independent enums describe **how** the achievement was captured:

- **`completion_method`** — `'quick'` (a fast tap) or `'mushaf'` (picked on the mushaf). Descriptive only; no downstream effect. Defaults to `'quick'`.
- **`recitation_method`** — `'full'` (recited the whole range in one go), `'test'` (examined at chosen positions), or `'untracked'` (recited and scored without documenting where). Defaults to `'full'`. Drives the `achievement_recitation_positions` rows (below).

**Hifz is always `full`.** New memorization can be neither partially tested nor left undocumented — `test` and `untracked` are review-only (`Near`/`Far`), enforced on create *and* update with a 400.

### Recitation positions (`achievement_recitation_positions`)

A position is a verse range (`start_surah/start_verse/end_surah/end_verse`) with **derived error counts** and **itemized `errors[]`** (see "Errors"). The position **ranges** are descriptive only — they do **not** affect `percentage_score` or reconciliation, which use the achievement's own range. Documenting them is a bonus, not a guarantee: an achievement is complete without them.

- `recitation_method = 'full'` → the service auto-creates **exactly one** position spanning the whole achievement range, holding the top-level `errors[]`. `test_positions` in the payload is rejected (400, on create and update alike).
- `recitation_method = 'test'` → the client supplies `test_positions` (**≥1**, else 400). Each must be a valid range **within** the achievement's range (Quran order), and holds its own `errors[]`.
- `recitation_method = 'untracked'` → **zero positions**, and therefore zero error rows. Both `test_positions` and `errors` are rejected (400); the counts arrive as aggregate `error_counts`. `recitation_positions[]` comes back empty, so every consumer must tolerate an empty array.

On **create**: positions and their errors are validated up front, then inserted after the achievement is saved.
On **update** (unapproved only): positions are regenerated when `recitation_method`, `test_positions`, **or `errors`** is sent — a bare range edit leaves existing positions untouched (client's responsibility to resend). Setting `recitation_method='test'` requires `test_positions`; `='full'` replaces with a single full-range row; `='untracked'` deletes them all and resets the counts to `error_counts` (zeros when omitted). Sending `error_counts` alone on an already-`untracked` achievement replaces just the counts. Regeneration is delete-all-then-insert; error rows cascade with their positions (neither is individually audited).

### Pages (`total_pages`, `positions_pages`)

**`total_pages` (الصفحات الكلية) is the volume metric** — the breadth of the whole `[start, end]` range, and what every dashboard KPI sums (`SUM(total_pages)` for the Hifz volume, `ORDER BY total_pages DESC` for the leaderboards). The client's value is stored as-is; **when the client omits it the backend derives it from the range** via `pageCoverage()` (`src/quran/page-coverage.ts`, parity-tested against the frontend's page math). It is therefore never NULL on new rows — important, because every dashboard query wraps it in `COALESCE(SUM(...),0)`, where a NULL would read as "memorised nothing" rather than "unknown". On update it survives untouched unless the range moves, in which case the stored number describes the old range and is re-derived.

**`positions_pages` (صفحات المواضع) is documentation, not a metric.** It is the SUM of the positions' `pages` — a position that omits `pages` gets them derived from its own range. Equal to `total_pages` for `full`, the tested subset for `test`, and **NULL for `untracked`** (no positions → the recited amount is genuinely unknown). Nothing but a single display column in the dashboard's top-students list reads it; the daily report computes its own page coverage from the ranges and never touches either column.

Historical NULLs were filled by `1781000000000-BackfillAchievementPages`, which is deliberately irreversible: a backfilled value is indistinguishable from a client-supplied one.

Positions are returned in every achievement response as `recitation_positions[]`. All roles see the ranges; **parents do not see the per-position counts or the itemized `errors[]`** (same redaction as the achievement-level counts).

Service flow:

1. **Authorize the create.** Caller must have scope on the halaqa (principal/VP, supervisor with the halaqa in `supervisor_halaqat`, or teacher with active `halaqa_teachers` row — primary OR non-primary, both can record).
2. **Validate the verse range** via `QuranRangeValidator`. Cross-surah ranges are allowed; see "Verse range semantics" below.
3. **Attendance check.** Look up `attendance(student_id, halaqa_id, date)`. If no row → 400 `"Attendance must be recorded for this student before achievements can be entered."`. If row exists with absent status → 400 `"Cannot record achievement: student was absent."`. See "Attendance coupling."
4. **Resolve the recitation positions** and their itemized `errors[]`; derive each position's counts and roll them up into the achievement's four totals. See "Errors."
5. **Store `percentage_score`** from the request, rounded to 2dp. The backend does not compute it — see "Score computation."
6. **If `approve === true`:**
   - Re-check halaqa scope. If not allowed → 403 `"You cannot approve achievements for this halaqa."` Do not silently downgrade to "just record."
   - Set `status = 'approved'`, `approved_by = caller`, `approved_at = now()`.
7. **Persist.**
8. **Audit.** Write `achievement.create` always. If approved in the same call, write a second `achievement.approve` row. Two audit rows for one API call — keeps the audit log analyzable across paths.
9. **If approved**, run reconciliation (see "Reconciliation").
10. **Response.** Return the mapped DTO via `AchievementDto.fromEntity(achievement, userMap, positions, studentMap)`.

### Daily uniqueness — not enforced

Multiple achievements per `(student_id, date, track_type)` are allowed. The `idx_achievement_lookup` index is non-unique on purpose. Don't add a service-layer uniqueness check.

This means reports that aggregate by `(student_id, date, track_type)` must do `SUM`/`AVG`/`GROUP BY` rollups, not assume one row.

## Approving an existing achievement

`POST /achievements/:id/approve`. Allowed roles — **anyone with halaqa scope**:
- principal, VP — always (within school scope).
- supervisor — only if the achievement's `halaqa_id` is in their `supervisor_halaqat`.
- teacher — any active `halaqa_teachers` row on the halaqa. **Primary/acting status is not required.**

There is no separate "approval authority" tier: record, approve, unapprove, edit and
delete all gate on the same `hasHalaqaScope` check. Weekly plans use the identical
rule.

Service flow:
1. Load achievement, verify school scope (404 on miss).
2. Verify caller's halaqa scope.
3. If `status` is already `'approved'`, return 400 `"Achievement is already approved."` (idempotency through error, not silent success — keeps the audit clean.)
4. Set `status = 'approved'`, `approved_by`, `approved_at`. Persist.
5. Audit: `achievement.approve`.
6. Run reconciliation.

## Unapproving (revoking) an approved achievement

`POST /achievements/:id/unapprove`. Allowed roles: **anyone with halaqa scope** — same
set as approve. A teacher who approved by mistake can revoke it without escalating to
the principal.

Service flow:
1. Load, verify school scope, verify caller's halaqa scope (403 on miss).
2. If `status` is `'unapproved'`, return 400.
3. Flip `status = 'unapproved'`. **Preserve** `approved_by` and `approved_at`.
4. Audit: `achievement.unapprove` with `oldValues: { approved_by, approved_at, status: 'approved' }`.
5. Run reconciliation (verses drop out of any matching plan items' coverage union).

## Editing an achievement

`PATCH /achievements/:id`. Only allowed when `status = 'unapproved'`. Approved achievements return 400 (see above).

DTO accepts the same fields as create except `student_id`, `halaqa_id`, `date` (immutable — moving an achievement to a different student/halaqa/date is a delete-and-recreate operation). The `approve` flag is **not** on the update DTO.

Allowed roles: anyone who could record the achievement in scope. Editing doesn't have a primary-authority gate.

If any error count changes, the positions are regenerated and the achievement's count totals are recomputed from them (see "Error counts"). `percentage_score` is **not** recomputed — the frontend must send the new value alongside the counts.

Audit: `achievement.update`.

## Deleting an achievement

`DELETE /achievements/:id`. Soft delete via `deleted_at`.

Anyone who could record can delete — principal, VP, supervisor in scope, teacher in
scope (primary or non-primary) — **whether or not the achievement is approved**. No
`recorded_by` check. Gating the approved case harder would be theatre: the same actor
can unapprove and then delete.

Audit: `achievement.delete`. If the achievement was approved at delete time, include `was_approved: true` in audit values.

If deleted while approved, run reconciliation (verses drop out).

## Score computation

**`percentage_score` is computed on the frontend and sent in the request; the backend stores it as-is** (rounded to 2dp). There is no `AchievementScoreService` — the backend does not derive the score from the counts, and does not validate that it agrees with them.

The frontend computes it from the raw counts and the halaqa's per-error-type weights, which it reads off `evaluation_settings` in any halaqa response.

### `evaluation_settings` — the per-halaqa weights

A JSON column on `halaqat`, owned by the halaqat module (`src/modules/halaqat/dto/evaluation-settings.dto.ts`). Each weight is the score **deducted per single error** of that type:

```json
{
  "mistake_weight": 4,
  "warning_weight": 2,
  "tajweed_weight": 1,
  "harakat_weight": 2
}
```

Those values are also the **defaults**. The column is **nullable and optional** — teachers configure it from the halaqa settings screen (`PATCH /halaqat/:id`), and any weight left unset falls back to its default. `resolveEvaluationSettings()` merges stored values over the defaults, so **every halaqa read returns all four weights populated** and the frontend never has to hardcode a fallback.

The shape is closed: `forbidNonWhitelisted` rejects unknown keys with a 400. `PATCH` replaces the object wholesale — send every weight you want to keep; `null` resets to defaults.

### Historical scores are frozen

When a halaqa's `evaluation_settings` changes, existing achievement scores are **not recomputed**. They reflect the weights in effect when the frontend computed them. The halaqa activity log records every settings change, so the historical weights are recoverable from there.

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

Allowed: **anyone with halaqa scope** — principal, VP, supervisor in scope, or any
teacher with an active `halaqa_teachers` row. Primary/acting status is not required.

Service flow:
1. Authorize. School scope, then `hasHalaqaScope`.
2. **Conflict check.** Query `weekly_plans` for an existing non-deleted row with `(student_id, halaqa_id, week_start_date)`. If found → 409 `{ message: "Plan already exists for this student/halaqa/week.", existing_plan_id: <id> }`. To replace, the caller must `DELETE` the existing plan first.
3. Validate each item: range valid, `day_of_week` in `[0..6]` or `[1..7]` (per your existing convention), `track_type` valid.
4. Compute `total_verses` for each item via `QuranRangeValidator`. `achieved_verses` starts at `0`, `status` at `'due'`, `is_manual_override` at `0`, `order` from the item (default `0`).
5. Persist plan and items in a single transaction.
6. Audit: `weekly_plan.create` with `items_count` in `newValues`.

### Plan auto-generation: TODO

`POST /weekly-plans/generate` is **not implemented**. The endpoint should either not exist or return 501. The frontend should not expose a "generate plan" button.

When this is built, it will:
- Accept `{ halaqa_id, week_start_date, student_ids? }`.
- Allowed roles: anyone with halaqa scope.
- Generation strategy is undecided (see Q5b in the design notes). Sources to consider: student capacities (`daily_*_pages_capacity`), the halaqa's meeting schedule, last approved achievement frontier per track.
- Idempotency: skip students who already have a plan for the week, or 409.

Until the spec is finalized, **manual creation via `POST /weekly-plans` is the only path.**

### Approve a plan

`POST /weekly-plans/:id/approve`. Allowed: anyone with halaqa scope.

1. Load plan, school+halaqa scope checks.
2. If already `'approved'` → 400.
3. Flip `status = 'approved'`, set `approved_by`.
4. Audit: `weekly_plan.approve`.

### Unapprove a plan

`POST /weekly-plans/:id/unapprove`. Allowed: anyone with halaqa scope (mirroring achievement unapprove).

`status = 'draft'`. `approved_by` preserved. Audit: `weekly_plan.unapprove`.

### Approved-plan semantics

When `status = 'approved'`:

- **Reconciliation updates** to items (`achieved_verses`, `status`): always allowed; the service path is internal, not user-facing.
- **Manual item range edits** (`PATCH /weekly-plan-items/:id` changing range fields): allowed for anyone with halaqa scope. Sets `is_manual_override = 1`. Triggers recompute of `total_verses` and re-runs reconciliation for that item.
- **Add new item to approved plan:** `POST /weekly-plans/:id/items` returns 400 `"Cannot add items to an approved plan. Unapprove first."`
- **Delete item from approved plan:** `DELETE /weekly-plan-items/:id` returns 400 `"Cannot delete items from an approved plan. Unapprove first."`

When `status = 'draft'`:
- All of the above are allowed without the unapprove dance.

The `is_manual_override` flag is **permanent** once set. It tracks "this item's range was edited after creation" — not "edited while approved." Unapproving and re-approving doesn't reset it.

### Plan item `order`

`weekly_plan_items.order` (int, default `0`) is the **reconciliation priority tie-breaker** when two items share the same `day_of_week` and `track_type` (e.g. two Monday-Hifz items). Reconciliation walks items by `day_of_week → order → id`; the lower `order` claims shared verses first (consumption model). It's supplied on item create (`POST /weekly-plans` items and `POST /weekly-plans/:id/items`) and editable via `PATCH /weekly-plan-items/:id` — editing it re-runs reconciliation because it changes consumption priority. It has no effect across different days or tracks.

### Plan deletion

`DELETE /weekly-plans/:id` — **hard delete**. Allowed: anyone with halaqa scope. The row is
removed permanently and its items cascade via `ON DELETE CASCADE`; nothing is recoverable.

Note the entity still declares a `deleted_at` `@DeleteDateColumn`, but `hardDelete()` calls
`repo.remove()`, so the column is never populated for plans. Achievements, by contrast, really
are soft-deleted.

Audit: `weekly_plan.delete`.

## Reconciliation — achievements ↔ plan items

This is the central piece of business logic. Model it as **invoice + payments**: each plan item is an invoice with a target verse range; each approved achievement is a payment. Reconciliation is **week-scoped, not day-scoped**: a payment made on *any* day of the plan's week settles the week's items, and each verse of a payment is spent on exactly one item — the earliest in the week is paid first.

**Repetition counts.** Payments are *not* deduplicated into one pool: reciting the same range twice is two payments, so two items planning that range settle one each (the older recitation pays the earlier item). One recitation of a twice-planned range still pays only the first item.

### When reconciliation runs

Triggered (synchronously, in the same transaction) on:
1. **Achievement approved** — recompute the plan(s) covering its week.
2. **Achievement unapproved** — recompute (its verses drop out of the pool).
3. **Approved achievement deleted** — recompute (same as unapprove).
4. **Plan item range/track/day/order edited** — recompute the whole owning plan (item results are interdependent).
5. **Plan approved** — recompute every item in the plan.
6. **Plan created** — items are persisted at `achieved_verses = 0` / `'due'`; if the week already holds approved achievements (mid-week or backdated creation) that seed is wrong on arrival.
7. **Item added to a draft plan** — same seeding problem, plus the new item consumes from the same week pool as its siblings.
8. **Item deleted from a draft plan** — the deleted item releases the verses it had consumed, so later items in the week can now claim them.

The rule behind the list: **anything that changes either side of the match — the achievement pool or the set/shape/priority of items — re-runs reconciliation.** Plan `status` is not part of the match, so approve/unapprove of a plan doesn't invalidate stored values (approve still reconciles, as a safety net for plans left stale). `reconcilePlan` works on draft plans too — plan items carry live `achieved_verses` regardless of approval state.

Because reconciliation writes `achieved_verses`/`status` straight to the DB with `repo.update`, any in-memory entity held by the caller is stale afterwards. Every mutation that reconciles **re-reads** the affected rows before mapping the response — otherwise the API reports `0` for work that was just credited.

The core service method reconciles a **whole plan (week)** as a unit, because items are interdependent — what an earlier item consumes changes what remains for later ones:
```ts
PlanReconciliationService.reconcilePlan(planId: number): Promise<void>
```

Entry points delegate to it. **All of them are student-week-scoped, never single-plan** — the owner's rule is "any change re-links that student's whole week":
- `reconcileStudentWeek(studentId, weekStartDate)` — reconciles *every* plan of that student whose week overlaps. This is what the plan-side mutations call (plan create/approve, item add/edit/delete). Usually one plan; it matters when the student holds plans in two halaqat for the same week, or when two `week_start_date`s aren't Saturdays and their 7-day windows overlap — reconciling only the edited plan would leave the other's links describing a shape of the week that no longer exists.
- `reconcileItem(planItemId)` — resolves the item's plan, then delegates to `reconcileStudentWeek`. For callers that only hold an item id (e.g. after a range edit).
- `reconcileForAchievement(achievementId)` — every plan of that student whose week contains the achievement's `date`. Deliberately **not** filtered by halaqa: `reconcilePlan` only ever credits achievements from its own halaqa, so including the student's other plans costs one cheap rebuild and guarantees no stale link survives. It loads the achievement `withDeleted`, because `delete` soft-removes the row *before* reconciling — skipping would leave a deleted achievement still credited.

### Matching rule

An achievement contributes to a plan item when **all** of:
- Same `student_id`.
- Same `halaqa_id`.
- Same `track_type`.
- Achievement's `date` falls **anywhere within the plan's week** (`week_start_date … week_start_date + 6`). The achievement's day-of-week does **not** need to equal the item's `day_of_week`.
- The verse ranges overlap (any verse in common) **and** the achievement's overlapping verses haven't already been spent on an earlier item.

An achievement may contribute to zero, one, or more plan items.

### The math

For each plan, per `track_type`, take the approved, non-deleted achievements recorded anywhere in the week; **each keeps its own unspent verses** (`unspentₐ`, initially its whole range). Walk items in **priority order** (`day_of_week` ascending, then `order` ascending, then `id` ascending); each item is paid by the achievements in **chronological order** (`date`, then `approved_at`, then `id`):

```
for each item (ordered by day_of_week asc, then order asc, then id asc):
    want = item.range
    for each achievement a of item.track (ordered by date asc, approved_at asc, id asc):
        paid    = want ∩ unspentₐ
        credit  paid to (item, a)          // one achievement_plan_item_links row per stretch
        want   -= paid                     // no verse of the item is credited twice
        unspentₐ -= paid                   // a spent payment can't settle another item

    achieved_verses = |item.range| - |want|
    total_verses    = |item.range|          // stored; changes only on range edit

    status:
      if achieved_verses >= total_verses:  'completed'
      elif achieved_verses > 0:            'partial'
      elif today < item's date:            'due'
      else:                                'overdue'
```

Two consequences to keep straight:

- **Within one item**, overlapping achievements never double-count — `want` shrinks as each pays in, so `achieved_verses ≤ total_verses` always.
- **Across items**, a payment is spent once. One recitation of a range planned on both Monday and Wednesday settles Monday only; a **second** recitation settles Wednesday. This is the difference from the old union-pool model, where the repeat was invisible and the Wednesday item stayed at 0 forever.

All of it is interval arithmetic over **global ayah indices** (`src/quran/range-union.ts`), shared with the report's page math — never re-expand ranges into per-verse `Set`s.

### The settlement links (`achievement_plan_item_links`)

Counting verses isn't enough: the report needs to know *which* achievement covered *which part* of *which item*. `reconcilePlan` therefore also materializes the match, in `src/modules/achievements/logic/settlement.ts`:

```ts
settleTrack(items /* already in priority order */, achievements): {
  byItem: Map<planItemId, CreditedSegment[]>,   // disjoint, each credited to one achievement
  outside: OutsideSegment[],                    // recited but planned by no item that week
}
```

Each item is paid by the **oldest** achievements first — `date`, then `approved_at`, then `id`. `percentage_score` does **not** select the payer: when a range is recited twice, the Monday recitation belongs on the Monday item, not the better-scoring one. Adjacent segments credited to the same achievement merge.

Each segment becomes one `achievement_plan_item_links` row (`weekly_plan_item_id` NULL for `outside`), carrying the credited global-ayah span, verses, pages, and the paying achievement's score.

Two rules make this safe:

- **The plan owns its links.** Every `reconcilePlan` run deletes the plan's rows and re-inserts them. There is no incremental update and no frozen link — editing an item (including moving it to another day) reshapes the whole week's linkage, so an achievement is never left bound to an item's old range.
- **The report only reads them.** `daily-reports/logic/reconciliation.ts` exposes `assembleTrack(track, plannedItems, links)`, which sums and formats. It performs no range matching, so the report and the plan items can never disagree.

Because the link rows are the report's input, **any new reconciliation trigger must reconcile, not just recompute counts** — a trigger that updates `achieved_verses` without re-running `reconcilePlan` leaves the report reading stale links.

### Cross-day / cross-week

Within a week, day-of-week is irrelevant to *matching* — it only sets **priority order** for payment. An achievement on Wednesday can complete a Monday item (and vice-versa), as long as ranges overlap and the achievement isn't already spent on an earlier-ordered item. An achievement outside the plan's `[week_start, week_start+6]` window doesn't contribute.

### Unmatched achievements

An approved achievement whose verses overlap no plan item still exists — it's just not credited. So does a **surplus repeat**: recite a range three times where only two items plan it, and the third recitation is unspent. Either way the unspent part is stored as an `achievement_plan_item_links` row with a NULL `weekly_plan_item_id`, which is what the report renders as `outsidePlanSegments`. Note that a surplus repeat therefore produces an outside-plan row whose verses *are* inside a planned range — that's intended: it's extra work beyond what the week planned, and it's never lost or hidden.

### Future async swap

`PlanReconciliationService.reconcilePlan` is the boundary. Today it's called inside the same transaction as approve/unapprove/delete. When volume grows, the swap is:
1. Replace direct calls with publishing an event (`achievement.approved` etc.) to a queue.
2. A worker subscribes and calls `reconcilePlan`.
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

`AchievementDto.fromEntity(achievement, userMap, positions, studentMap)` is the single point of truth. It does **not** take the actor — the payload is identical for every role.

### Visibility is scope-only, not field-level

Whoever can read an achievement reads all of it: the four error counts, every `recitation_positions[]` entry, and the itemized `errors[]` with their QUL word spans and surah/ayah/juz/hizb locations, plus `recorded_by_name`, `approved_by_name`, and `approved_at`.

Access control lives entirely in *which rows* a role can reach (see the scope rules above) — principal/VP see the school, supervisor sees supervised halaqat, teacher sees assigned halaqat, parent sees their linked students. Parents are read-only: they have no create/update/approve/unapprove/delete route.

Do not reintroduce per-role field stripping here. A parent seeing where their child stumbled is the point of the feature.

### Filters

All roles may use every filter, including `?recorded_by=` and `?approved_by=`. There is no side-channel to protect, since the corresponding names are in the response.

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
