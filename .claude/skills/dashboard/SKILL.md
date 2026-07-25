---
name: dashboard
description: Implement, extend, or modify the management dashboard / home-screen KPI module for the school management backend (NestJS + TypeORM + MySQL). Use this whenever the user asks to add or change anything under `/dashboard/*` — headline KPI cards, top-students leaderboards, per-halaqa performance tables, teacher-commitment (معدل التزام المحفظين) rankings, or actionable alerts. This module is READ-ONLY: it aggregates data owned by other modules (attendance, achievements, weekly plans, halaqat, students) and never writes. Trigger even when "dashboard" isn't said explicitly — anything about الصفحة الرئيسية / لوحة التحكم / مؤشرات الإدارة / إحصائيات; "top students", "أكثر الطلاب إنجازاً"; per-halaqa or per-teacher performance summaries; attendance-rate / commitment-rate / plan-completion-rate roll-ups; or role-scoped KPI widgets for principal, vice_principal, supervisor, or teacher. Does NOT own any table and does NOT expose per-record CRUD — those live in the attendance, achievements, halaqat, and students modules. If a request needs a new stored field or a mutation, it belongs in the owning module, not here.
---

# Management Dashboard Module (`/dashboard/*`)

A **read-only aggregation layer** over data owned by other modules. It owns no
table, writes nothing, and audits nothing. Every endpoint returns KPI roll-ups
computed on the fly, **scoped to what the caller is allowed to see**.

## The one idea: scope, then aggregate

All role differences reduce to a single step — resolve the set of halaqat the
caller may see, then run the *same* metric queries against that set:

| Role | Scope (`DashboardScopeService.resolve`) | Notes |
|------|------------------------------------------|-------|
| `principal` / `vice_principal` | `{ all: true }` — whole school | admin, no halaqa filter beyond `school_id` |
| `supervisor` | `halaqa_id ∈ supervisor_halaqat` | only halaqat they supervise |
| `teacher` | `halaqa_id ∈ halaqa_teachers WHERE end_date IS NULL` | only halaqat they currently teach |
| `parent` | **not served here** | parents use `/me/children/*` in the students/achievements modules |

`resolve()` returns `{ all: true }` for admins, or `{ all: false, halaqaIds: [...] }`
otherwise. **An empty `halaqaIds` short-circuits every metric to zeros/empty** —
a teacher with no active halaqa sees an empty dashboard, never a 403.

Because scoping is centralized, "a dashboard for the teacher" and "one for the
supervisor" are the *same endpoints* — they just resolve to a narrower set. Only
`/dashboard/teachers` (teacher-commitment) is gated to admin + supervisor,
because it reports *on* teachers.

## Stack & non-negotiables

- **Framework:** NestJS, same conventions as the other modules (`ResponseInterceptor`
  envelope, `HttpExceptionFilter`, global `JwtAuthGuard` + `ActiveUserGuard` +
  `RolesGuard` via `APP_GUARD`). Controllers just `return` payloads; the envelope
  is applied globally. See the `api-envelopes` skill.
- **School scoping:** every aggregate filters by `school_id` from `CurrentUser`
  first, then by the resolved halaqa scope. There is no cross-school path.
- **Read-only:** no writes, no audit rows, no soft-delete concerns. If a request
  needs to mutate, it belongs in the owning module.
- **No new tables / entities.** This module injects `DataSource` and queries the
  existing tables directly. Do **not** add `@Entity` classes here.
- **`ManyToOne`/relations:** N/A — no entities. When reading other modules'
  entities keep `Relation<T>` in mind only if you ever import them (we don't).

## Data sources (owned elsewhere — read only)

| Table | Owner module | Used for |
|-------|--------------|----------|
| `student_attendances` | attendance | student attendance rate, ethics avg. **No `halaqa_id`** — one row per (student, date); scope via `student_halaqa`. |
| `teacher_attendances` | attendance | teacher commitment rate. Keyed by `user_id`, **no `halaqa_id`** — map halaqa→teacher via `halaqa_teachers`. |
| `achievements` | achievements | new-memorization volume, avg `percentage_score`. Has `halaqa_id`, `status`, `track_type`, `date`. Count **approved** only. |
| `weekly_plans` + `weekly_plan_items` | achievements | plan-completion rate. `weekly_plans.halaqa_id` + `week_start_date`; item `status ∈ due|overdue|partial|completed`. |
| `halaqat` | halaqat | halaqa names, active set (`status='active'`, `deleted_at IS NULL`). |
| `halaqa_teachers` | halaqat | current teacher of a halaqa (`end_date IS NULL`). |
| `supervisor_halaqat` | halaqat | supervisor scope. |
| `student_halaqa` | halaqat | active enrollment (`status='active'`) — the student↔halaqa bridge. |
| `students` / `users` | students / users | display names (generated `name` column — never construct it, select it). |

### Metric definitions (keep these stable — the frontend depends on them)

- **Attendance rate** = `(present + late) / total_rows` over the period. The
  "present by default" seed cron guarantees one row per obligated (student|staff)
  per operating day, so the denominator is the obligation count. `excused` counts
  in the denominator (reported separately as its own tally).
- **Ethics average** = `AVG(ethics_rating)` over student rows in the period (1..5).
- **New-memorization volume** = **pages** (الصفحات), `SUM(total_pages)` of *approved*
  achievements in the period. Pages live on the achievement as client-supplied
  `DECIMAL(8,4)` columns (`total_pages` = الصفحات الكلية, `positions_pages` = صفحات
  المواضع = the amount actually recited); the achievements module stores them as-is
  (like `percentage_score`) — the dashboard just `SUM`s them, no verse math. Default
  track = `Hifz` (الحفظ الجديد); `Near`/`Far` are review. Rank leaderboards by
  `total_pages`; `positions_pages` is surfaced alongside. `NULL` pages count as 0.
- **Plan-completion rate** = `completed_items / total_items` for plan items whose
  plan `week_start_date` falls in the period and whose `halaqa_id` is in scope.
- **Avg score** = `AVG(percentage_score)` over approved achievements in scope/period.

### Period handling (`services/period.util.ts`)

`resolveRange({ period?, from?, to? })` → `{ from, to }` (both `'YYYY-MM-DD'`):
- explicit `from`+`to` win (used by tests and custom ranges);
- `period='month'` → 1st of current month … today;
- default / `period='week'` → most recent **Saturday** … today (school week starts
  Saturday = `day_of_week` 0, matching `halaqa_schedules`).

## Module layout

```
src/modules/dashboard/
├── dashboard.module.ts              # imports TypeOrmModule (DataSource only), no forFeature entities needed
├── controllers/
│   └── dashboard.controller.ts      # GET /dashboard/{overview,top-students,halaqat,teachers}
├── services/
│   ├── dashboard-scope.service.ts   # resolve(actor) → HalaqaScope; isAdmin()
│   ├── dashboard.service.ts         # the metric aggregations (all read-only)
│   └── period.util.ts               # resolveRange(), Period type
└── dto/
    ├── dashboard.query.ts           # DashboardQuery (period|from|to), TopStudentsQuery (+track, +limit)
    └── dashboard-response.dto.ts     # Swagger response shapes (OverviewDto, HalaqaPerfDto, ...)
```

## Endpoints

| Method & path | Roles | Returns |
|---------------|-------|---------|
| `GET /dashboard/overview` | principal, vice_principal, supervisor, teacher | Headline KPI cards: student attendance rate, teacher attendance rate (null for teacher role), new-memorization pages, plan-completion rate, ethics avg, active students/halaqat counts. |
| `GET /dashboard/top-students` | principal, vice_principal, supervisor, teacher | Leaderboard of students by new-memorization pages — `total_pages` + `positions_pages` (`track` default `Hifz`, `limit` default 10, max 50). |
| `GET /dashboard/halaqat` | principal, vice_principal, supervisor, teacher | Per-halaqa performance rows: students, attendance rate, pages, avg score, plan completion. |
| `GET /dashboard/teachers` | principal, vice_principal, supervisor | Teacher-commitment rows: own attendance rate, #halaqat, #students, their students' pages + attendance rate. |
| `GET /dashboard/alerts` | principal, vice_principal, supervisor, teacher | Actionable cards: stalled_students (no approved achievement in `stalled_days`, default 7), halaqat_without_teacher (no active main teacher), high_absence_teachers (≥ `absence_threshold` absent days, default 2). **high_absence_teachers is empty for the teacher role** (staff commitment is above their level). |

All accept the period query (`?period=week|month` or `?from=&to=`).

### Response envelope

Controllers return the raw DTO; the global `ResponseInterceptor` wraps it as
`{ code, data }`. List-shaped endpoints return `{ items: [...], range: {from,to} }`
inside `data` so the frontend always knows which window it's looking at.

## Role-specific reads (answering "one for the teacher, one for the supervisor")

- **Teacher home** = `overview` + `top-students` + `halaqat`, all auto-scoped to
  their own halaqat. No teacher-commitment widget.
- **Supervisor home** = the same three **plus** `/dashboard/teachers` scoped to the
  teachers of their supervised halaqat.
- **Principal / VP home** = everything, school-wide.

The frontend picks which widgets to render per role; the backend enforces scope so
a teacher hitting `/dashboard/halaqat` simply gets only their halaqat.

## Gotchas

- `student_attendances` and `teacher_attendances` have **no `halaqa_id`**. Scope
  student attendance through `student_halaqa` (active); scope teacher attendance
  by mapping scoped halaqat → `teacher_user_id` via `halaqa_teachers`.
- A student in two of the scoped halaqat can be **double-counted** in per-halaqa
  rollups (correct per-halaqa) but must be **de-duped** (via a `Set`) for
  school-/teacher-level totals. `overview` counts distinct students.
- Empty `IN ()` is a SQL error — always short-circuit when `halaqaIds` is empty,
  and build placeholders as `ids.map(() => '?').join(',')` (mysql2 does not
  auto-expand a single `?` into an array).
- Page volume is a plain `SUM(total_pages)` / `SUM(positions_pages)` over the
  stored `DECIMAL(8,4)` columns — no verse math, no page-coverage call in the
  dashboard. The achievements module owns page computation/storage.
- `halaqat` uses soft-delete for archival; filter `status='active' AND deleted_at IS NULL`
  for "current performance" views.

## Backlog / phase 2 (documented, not yet built)

1. **Trend deltas** — compare current period to previous (▲/▼ %) on each KPI card.
2. **Caching** — these aggregates are read-heavy and tolerate staleness; add a
   short TTL cache keyed by (schoolId, role-scope hash, range) if load warrants.
3. **`/dashboard/alerts` extra cards** — students near completing a juz/khatma
   (needs the memorization bitmap), plan items overdue this week.
4. **Attendance-rate denominator refinement** — subtract holidays/non-operating
   days explicitly instead of relying on seed-row presence.
