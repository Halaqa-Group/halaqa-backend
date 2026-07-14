---
name: attendance
description: Implement, extend, or modify the attendance & scheduling module for the school management backend (NestJS + TypeORM + MySQL). Use this whenever the user asks to add or change anything under `/attendance/*` — recording/correcting student or staff attendance, bulk offline sync, the "present by default" seed cron, school operating days (`school_schedules`), or holidays. Trigger even when "attendance" isn't said explicitly — anything touching the `student_attendances`, `teacher_attendances`, `school_schedules`, or `holidays` tables; anything about حضور/غياب/دوام/عطل; `client_uuid` idempotent sync from an offline device; the midnight seeding job; the `present/absent/excused/late` status; who can mark whom present; or the `AttendanceQueryService` that the achievements module reads. Does NOT cover achievements/weekly plans (separate module that READS attendance via `AttendanceQueryService`), halaqa CRUD, or student/user CRUD — those are separate modules this one reads from.
---

# Attendance & Scheduling Module

Owns four tables — `student_attendances`, `teacher_attendances`, `school_schedules`, `holidays` — and enforces:

- The **"present by default"** model: a midnight cron pre-creates `present` rows for every obligated student and staff member; humans then mark only the exceptions.
- Idempotent **offline bulk sync** keyed on `client_uuid`.
- Single-row **correction** with full modification tracking.
- The **school calendar** (operating weekdays + holidays) that drives who is obligated on a given date.
- The read-only **`AttendanceQueryService`** that the achievements module depends on.

This module is **read** by achievements (one-way coupling — see "Attendance coupling"). It doesn't depend on achievements, reports, or plans.

## Stack & non-negotiables

- **Framework:** NestJS, same conventions as auth/users/students/achievements (`ResponseInterceptor` envelope, `HttpExceptionFilter`, global `JwtAuthGuard` + `ActiveUserGuard` + `RolesGuard` via `APP_GUARD`). Controllers just `return` payloads or `throw` Nest exceptions — never hand-craft envelopes. See the `api-envelopes` skill.
- **ORM:** TypeORM, MySQL. Migrations only in prod; dev runs `DB_SYNCHRONIZE=true`. Migration: [migrations/1778700000000-AttendanceCreate.ts](../../../migrations/1778700000000-AttendanceCreate.ts).
- **School scoping:** every query scopes by `school_id` from `CurrentUser`. Cross-school or out-of-scope is **404, never 403**.
- **Audit:** every mutation writes an `audit_log` row via `AuditService`. Actions listed below.
- **Cron:** `@nestjs/schedule`. One job: `AttendanceSeedService` nightly at `00:05` server tz + boot-time catch-up.
- **No soft delete** on attendance rows (there is no `deleted_at`). Schedules/holidays hard-delete.

## Module layout

```
src/modules/attendance/
├── entities/
│   ├── student-attendance.entity.ts     # + AttendanceStatus type & ATTENDANCE_STATUSES const (the shared enum)
│   ├── teacher-attendance.entity.ts
│   ├── school-schedule.entity.ts
│   └── holiday.entity.ts
├── dto/
│   ├── sync-student-attendance.dto.ts    # BulkSyncStudentAttendanceDto { records: [...] }
│   ├── sync-teacher-attendance.dto.ts
│   ├── correct-attendance.dto.ts         # shared by student & teacher correction
│   ├── list-student-attendance.query.ts
│   ├── list-teacher-attendance.query.ts
│   ├── create-school-schedule.dto.ts
│   ├── create-holiday.dto.ts
│   └── list-calendar.query.ts
├── services/
│   ├── student-attendance.service.ts     # bulk sync + correct + list
│   ├── teacher-attendance.service.ts     # bulk sync + correct + list (principal/VP only)
│   ├── school-calendar.service.ts        # schedules + holidays CRUD
│   ├── attendance-seed.service.ts        # the "present by default" cron + catch-up
│   └── attendance-query.service.ts       # read-only facade consumed by achievements
├── mappers/
│   ├── attendance.dto.ts                 # AttendanceDto (role-aware), list + bulk-sync result DTOs
│   ├── teacher-attendance.dto.ts
│   └── calendar.dto.ts
├── controllers/
│   ├── student-attendance.controller.ts  # /attendance/students
│   ├── teacher-attendance.controller.ts  # /attendance/teachers
│   └── school-calendar.controller.ts     # /attendance/schedules + /attendance/holidays
└── attendance.module.ts                  # exports AttendanceQueryService
```

`AttendanceModule` **exports `AttendanceQueryService`** and is imported by `AchievementsModule`. All routes are under the global `api` prefix (e.g. `POST /api/attendance/students/sync`).

## The tables

Day convention everywhere: **0 = Saturday … 6 = Friday**. Convert `WEEKDAY(d)` (MySQL, 0=Monday) via `(WEEKDAY(d) + 2) % 7`.

### `student_attendances` / `teacher_attendances`
One row per `(student, date)` / `(user, date)` — enforced by a unique index. A student has **one** attendance row per day regardless of how many halaqat they're in. Columns of note:

- `status` — `enum('present','absent','excused','late')`, default `'present'`.
- `recorded_by` — **nullable** (this deviates from the raw DDL on purpose). `NULL` = the row was auto-seeded by the cron. A non-null value is the user who first recorded it.
- Offline-sync fields: `client_uuid` (unique, dedup key), `client_recorded_at`, `device_id`.
- Modification tracking: `modified_by`, `modified_at`, `modification_reason`, `original_status`. `original_status` captures the value **before the first human change** (usually the seeded `'present'`) and is set **once**.

### `school_schedules`
Effective-dated operating weekdays: `(school_id, day_of_week, effective_from, effective_to?)`. A date is a "school day" when a row's `[effective_from, effective_to]` window (NULL `effective_to` = open-ended) covers it. `created_by` nullable.

### `holidays`
`(school_id, holiday_date)` unique, plus `description`. A holiday date is never a school day.

## The "present by default" model — `AttendanceSeedService`

This is the core design decision. Instead of "no row = absent", the system **pre-creates `present` rows** and humans mark exceptions ("attendance by exception").

- **Nightly `@Cron('5 0 * * *')`** (`seedToday`) and **`onApplicationBootstrap`** (boot catch-up) both call `seedForDate(today)`. Today is read from the DB (`SELECT CURDATE()`) to stay in server/DB tz, mirroring the achievements overdue cron.
- `seedForDate` seeds **students and staff**: a single `INSERT … SELECT … WHERE NOT EXISTS` per subject type. Obligated = active + not soft-deleted + the date is a school day (`school_schedules`) + not a holiday + no existing row for that date.
- **Staff seeding is restricted to staff roles** (`principal`, `vice_principal`, `supervisor`, `teacher`) via an `EXISTS` on `user_roles`/`roles` — parents are never seeded.
- **Idempotent** by construction (`NOT EXISTS` on the attendance row), so the boot catch-up safely re-runs for a server that was down at midnight. Returns the count of rows created.

Consequences:
- On a normal school day every obligated subject already has a row, so the achievements attendance gate passes for present students without any manual step.
- The `school_schedules`/`holidays` tables are load-bearing: if they're empty, the cron seeds nothing. `DevSeeder.ensureSchoolSchedule` seeds a default **Sat–Thu** timetable so this works out of the box in dev.
- Per-school timezone is a future refinement (server tz today), same posture as the achievements cron.

## Student attendance

### Bulk offline sync — `POST /attendance/students/sync`
Roles: **principal, vice_principal, teacher** (supervisors/parents → 403). Body: `{ records: SyncAttendanceEntryDto[] }` (≤ 500), each `{ student_id, date, status, excuse_note?, client_uuid?, client_recorded_at?, device_id? }`.

Service flow (`StudentAttendanceService.bulkSync`):
1. Role gate (admin or teacher), else 403.
2. **Batch-authorize** via `accessibleStudentIds` — one query returns the subset the actor may touch (admin → all students in school; teacher → students actively enrolled in a halaqa they teach with an active `halaqa_teachers` row).
3. Per entry, `applyEntry`:
   - If `client_uuid` already exists on a row → outcome **`duplicate`** (idempotent, no write).
   - Else find the `(student_id, date)` row: exists → **`updated`** (correction; sets `modified_by`, captures `original_status` once, copies client fields); missing → **`created`** (`recorded_by = actor`).
   - Not in the accessible set → outcome **`forbidden`** (row skipped, batch continues — never throws for one bad row).
4. Returns counts `{ created, updated, duplicate, forbidden, results[] }`. Audit per applied row (`student_attendance.sync_create` / `sync_update`).

Re-syncing the same batch is a no-op — that's the whole point of `client_uuid`.

### Correction — `PATCH /attendance/students/:id`
Roles: **principal, vice_principal, teacher** (must have record scope over the student, else 404). Body `CorrectAttendanceDto { status, excuse_note?, modification_reason }` (reason required). Same-status → 400. Sets `modified_by/at`, `modification_reason`, and `original_status` (once). Audit `student_attendance.correct`.

### List — `GET /attendance/students`
Roles: **principal, vice_principal, supervisor, teacher, parent**. Filters: `student_id`, `date`, `from`, `to`, `status`, `page`, `limit` (default 20, cap 100). Role scope:
- admin → whole school; supervisor → students in supervised halaqat (read-only); teacher → students in their halaqat; parent → own children (via `student_guardians`); unknown role → nothing (`1=0`).
- Parents get a **stripped** `AttendanceDto` (no `recorded_by`/`modified_by`/`modification_reason`/`original_status`) via the role-aware mapper `AttendanceDto.fromEntity(row, actor)`. Apply the mapper everywhere; never serialize the raw entity.

## Teacher (staff) attendance — `/attendance/teachers`

Mirrors student attendance but:
- **Recording (`POST /sync`) and correction (`PATCH /:id`) are principal/VP only** (supervisors excluded — matches the permission decision). `accessibleUserIds` = every non-deleted user in the actor's school.
- **List (`GET`)**: principal/VP see all staff in the school; any other staff role sees **only their own** rows.
- Uses its own result/response DTOs (`TeacherAttendanceDto`, `TeacherBulkSyncResultDto`) keyed on `user_id`. No parent visibility.

## School calendar — `SchoolCalendarController`

`/attendance/schedules` and `/attendance/holidays`. Mutations (`POST`/`DELETE`) are **principal/VP only**; lists are open to all staff (`principal, vice_principal, supervisor, teacher`). All school-scoped, `created_by = actor`, audited. Creating a holiday on an existing date → 409. These endpoints populate the tables the seed cron reads.

## Permissions matrix

| Action | principal | vice_principal | supervisor | teacher | parent |
|---|---|---|---|---|---|
| Record/correct **student** attendance | ✅ all school | ✅ all school | ❌ | ✅ own halaqat only | ❌ |
| Record/correct **staff** attendance | ✅ | ✅ | ❌ | ❌ | ❌ |
| List student attendance | ✅ all | ✅ all | ✅ supervised (read) | ✅ own halaqat | ✅ own children (stripped) |
| List staff attendance | ✅ all | ✅ all | own only | own only | ❌ |
| Schedules/holidays create/delete | ✅ | ✅ | ❌ | ❌ | ❌ |

Supervisors are **view-only** for attendance. Out-of-scope reads/writes are 404, not 403.

## Attendance coupling (with achievements)

The achievements module **reads** attendance through `AttendanceQueryService` — a read-only, one-way dependency. This service **replaced the old `attendance-query.stub.ts`** in achievements; do not reintroduce a stub.

```ts
AttendanceQueryService.findForStudentOnDate(studentId, halaqaId, date): Promise<{ id, status }>
```

- `halaqaId` is part of the contract but **ignored** — there is one attendance row per `(student, date)`, halaqa-independent.
- Returns the stored row's `{ id, status }`. If **no row exists** it returns `{ id: null, status: 'present' }` so the achievements gate doesn't hard-block (explicit absences always exist as rows).
- `status` includes `'late'` (the contract was widened from the stub's `present/absent/excused`). The achievements gate only blocks on `'absent'`.
- Retroactive attendance edits do **not** cascade to existing achievements — that inconsistency is surfaced by reports, not enforced here (see the achievements skill).

## Audit actions

| Action | Trigger |
|---|---|
| `student_attendance.sync_create` / `sync_update` | `POST /attendance/students/sync` (per applied row) |
| `student_attendance.correct` | `PATCH /attendance/students/:id` |
| `teacher_attendance.sync_create` / `sync_update` | `POST /attendance/teachers/sync` |
| `teacher_attendance.correct` | `PATCH /attendance/teachers/:id` |
| `school_schedule.create` / `school_schedule.delete` | schedule mutations |
| `holiday.create` / `holiday.delete` | holiday mutations |

Cron-seeded rows are **not** audited individually (they'd flood the log; the count is logged instead).

## When adding an endpoint to this module — checklist

1. Decide roles; default deny; annotate `@Roles(...)`. Recording student attendance = admin or in-scope teacher; recording staff = admin only.
2. School-scope every query; out-of-scope → 404.
3. Route through the relevant service; don't hit repos from controllers.
4. For any offline-writable path, dedup on `client_uuid` and support per-row `forbidden` outcomes (don't fail the whole batch).
5. Preserve `original_status` on the first human change; set `modified_by/at`.
6. Audit every mutation.
7. Apply the role-aware mapper before returning (parents are stripped).
8. Tests: cross-school 404, out-of-scope 404/forbidden, wrong role 403, happy path, idempotent re-sync, audit written.

## When NOT to use this skill

- Achievements / weekly plans — separate module. It **reads** attendance via `AttendanceQueryService`; it doesn't write it.
- Halaqa CRUD, teacher/supervisor assignment — the `halaqat` module. (There is no per-halaqa schedule; scheduling lives only here at the school level via `school_schedules`.)
- Student / user CRUD — separate modules this one reads from.

## Not built yet

Attendance reports/summaries (attendance rate, chronic-absence, per-halaqa rollups). When built, they should read through this module's mappers, not re-query raw rows. Also run `pnpm run docs:export` after endpoint changes to refresh [docs/openapi.json](../../../docs/openapi.json).
