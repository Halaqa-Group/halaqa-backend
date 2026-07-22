---
name: nestjs-students-guardians-module
description: Implement, extend, or modify the students and guardians (bio + linking) module for the school management backend (NestJS + TypeORM + MySQL). Use this whenever the user asks to add or change endpoints under `/students/*`, `/students/:id/guardians/*`, or `/me/children/*`; create/update/soft-delete/restore/graduate students; manage daily-pages capacities; link parent `users` to students or change relation/is_primary/can_pickup; or enforce role-based visibility for principal, vice_principal, supervisor, teacher, and parent over student data. Triggers even when "students" or "guardians" isn't said explicitly — anything touching the `students` or `student_guardians` tables, scope-filtering students by halaqa/parent, or the BR rules covering daily page capacities and guardian relationships belongs here. Does NOT cover attendance, achievements, weekly plans, halaqa management, or reports — those are separate modules.
---

# Students & Guardians Module

Pure bio + relationship layer. Students are data only — they do not log in. Guardians are `users` with the `parent` role (and possibly other roles too, since users can hold multiple roles). This module owns the `students` and `student_guardians` tables and the endpoints that mutate them.

## Stack & non-negotiables

- **Framework:** NestJS, follows the same conventions as the auth/users module (`ResponseInterceptor` envelope, `HttpExceptionFilter`, global `JwtAuthGuard`, `RolesGuard`, `ActiveUserGuard`).
- **ORM:** TypeORM with MySQL. Migrations only; never `synchronize`.
- **School scoping:** every query filters by `school_id` from `CurrentUser`. Cross-school reads/writes return **404**, never 403 — never leak existence.
- **Soft delete:** `students.deleted_at`. Use TypeORM's `softDelete` + `restore`. Default queries exclude deleted rows.
- **Names are four parts, `name` is derived:** `students` stores `first_name` (الاسم الأول), `second_name` (اسم الأب), `third_name` (اسم الجد), `family_name` (اسم العائلة) — each `VARCHAR(50) NOT NULL`, all four required on create. `students.name` is a **STORED generated column** (`VARCHAR(203)`, `CONCAT_WS(' ', NULLIF(first_name,''), …)`), so it is **read-only**: never write it, write the parts. Because it is still a real column, `name LIKE` search, `ORDER BY s.name`, and every denormalized `student_name` projection keep working untouched. Shared helpers live in `src/common/person-name.ts` (`NAME_PART_MAX_LENGTH`, `FULL_NAME_MAX_LENGTH`, `FULL_NAME_EXPRESSION`, `buildFullName`, `namePartsPatch`, `toNameFields`). Migration: `migrations/1779800000000-SplitPersonNames.ts`, which backfilled legacy rows by splitting the old single `name` on spaces and padding the missing parts with `''` — that padding is why the generated expression wraps each part in `NULLIF(part, '')`.
- **Audit:** every mutation writes an `audit_log` row via the existing `AuditService`. Action names are listed below.
- **Notifications:** when a side effect should notify someone (e.g. VPs when a student loses their last guardian), call `NotificationService.notifyRole(schoolId, roleSlug, payload)`. The service is a single-method interface this module depends on; its delivery is implemented elsewhere.

## Module layout

```
src/students/
├── entities/
│   ├── student.entity.ts
│   └── student-guardian.entity.ts
├── dto/
│   ├── create-student.dto.ts
│   ├── update-student.dto.ts             # principal/VP fields
│   ├── update-student-by-teacher.dto.ts  # capacity + notes only
│   ├── list-students.query.ts
│   ├── link-guardian.dto.ts
│   └── update-guardian.dto.ts
├── services/
│   ├── students.service.ts
│   └── guardians.service.ts
├── controllers/
│   ├── students.controller.ts
│   ├── student-guardians.controller.ts   # /students/:id/guardians/*
│   └── my-children.controller.ts         # /me/children/*
├── guards/
│   └── student-scope.guard.ts            # halaqa/parent scope check, used on :id routes
└── students.module.ts
```

`students.module.ts` imports `UsersModule` (for `UsersService.findById`), `RolesModule`, and the `AuditModule` / `NotificationModule` (the latter is global). It does **not** depend on auth internals — only on `CurrentUser` from the request.

## The five roles, applied to this module

| Role | Sees students | Mutates bio | Mutates capacities/notes | Manages guardians |
|---|---|---|---|---|
| `principal` | all in school | yes | yes | yes |
| `vice_principal` | all in school | yes | yes | yes |
| `supervisor` | only in own halaqat (read) | no | no | no |
| `teacher` | only in own halaqat (read) | **no** name parts/dob/etc. | yes if **primary or acting_as_primary** for that halaqa | no |
| `parent` | only own children (read) | no | no | no |

The teacher's "edit student" permission is a **field-level allow-list**, not a row-level toggle. Two DTOs enforce this: `UpdateStudentDto` for principal/VP, `UpdateStudentByTeacherDto` for primary teachers. The controller picks which DTO to use based on the caller's role; you do not merge them.

### Teacher field allow-list

`UpdateStudentByTeacherDto` accepts only:
- `daily_hifz_pages_capacity`
- `daily_near_pages_capacity`
- `daily_far_pages_capacity`
- `notes`

Any other key in the body causes a 400 (`forbidNonWhitelisted: true` is already on globally).

## Endpoints — the canonical surface

All routes under `/students/*` and `/students/:id/guardians/*` require auth, active status, and pass through `RolesGuard` + `StudentScopeGuard` (the latter on `:id` routes).

### Students

| Method | Path | Purpose | Allowed |
|---|---|---|---|
| GET | `/students` | list (paginated, filtered, school-scoped) | principal, vice_principal, supervisor (own halaqat), teacher (own halaqat), parent (own children) |
| GET | `/students/:id` | read with guardians inline | principal, VP, supervisor in scope, teacher in scope, parent in scope |
| POST | `/students` | create | principal, vice_principal |
| PATCH | `/students/:id` | update bio | principal, vice_principal (full DTO); teacher with primary/acting on a halaqa containing this student (capacity+notes DTO) |
| DELETE | `/students/:id` | soft delete | principal, vice_principal |
| POST | `/students/:id/restore` | restore from soft delete | principal, vice_principal |
| POST | `/students/:id/graduate` | set `status = 'graduated'` | principal, vice_principal |

### Memorization bitmap

| Method | Path | Purpose | Allowed |
|---|---|---|---|
| GET | `/students/:id/memorization` | read memorized-ayat count + base64 bitmap | principal, VP, supervisor in scope, teacher in scope, parent in scope |
| PUT | `/students/:id/memorization` | manual edit — apply `set` then `clear` verse ranges | principal, VP, supervisor in scope, teacher in scope (**not** parent) |

See "Memorization" below.

### Student → Guardians

| Method | Path | Purpose | Allowed |
|---|---|---|---|
| GET | `/students/:id/guardians` | list a student's guardians | principal, VP, supervisor in scope, teacher in scope, parent in scope |
| POST | `/students/:id/guardians` | link a guardian (by `guardian_user_id` OR by `email`) | principal, vice_principal |
| PATCH | `/students/:id/guardians/:guardianUserId` | edit `relation` / `is_primary` / `can_pickup` | principal, vice_principal |
| DELETE | `/students/:id/guardians/:guardianUserId` | unlink | principal, vice_principal |

### Parent self-service

| Method | Path | Purpose | Allowed |
|---|---|---|---|
| GET | `/me/children` | list of caller's children | parent |
| GET | `/me/children/:id` | one child (full bio + guardians) | parent |

`my-children.controller.ts` enforces the parent scope by joining through `student_guardians` where `guardian_user_id = currentUser.id`. It does not delegate to `StudentScopeGuard` because the scope rule here is "must be the caller's child" with no other roles allowed.

## Linking a guardian — the dual flow

`POST /students/:id/guardians` body shape:

```ts
// Either:
{ "guardian_user_id": 42, "relation": "father", "is_primary": true, "can_pickup": true }

// Or:
{ "email": "parent@school.com", "name": "...", "phone": "...",
  "relation": "father", "is_primary": true, "can_pickup": true }
```

DTO validates that **exactly one** of `guardian_user_id` or `email` is present.

Service flow:
1. Load the student in the caller's school or 404.
2. **Branch A — `guardian_user_id` provided:**
   - Load the user by id. If not found, or their `school_id` doesn't match the student's, return 404 (don't reveal cross-school existence).
   - If the user does not yet hold the `parent` role, assign it (this also writes a `user.role.assign` audit entry via `UsersService`).
3. **Branch B — `email` provided:**
   - `findByEmail(email, schoolId)`.
   - If found: same as branch A from "ensure parent role".
   - If not found: create a new user with a random temporary password, the `parent` role, status `active`, and trigger an invite email (`MailService.sendParentInvite(email, resetUrl)` — uses the same one-shot token the password-reset flow uses, scoped to onboarding). The new user must change their password on first login.
4. Insert into `student_guardians`. If `is_primary = true`, run the primary-uniqueness logic (next section) inside the same transaction.

Audit: `student.guardian.link` with `newValues: { studentId, guardianUserId, relation, isPrimary, canPickup, createdParent: boolean }`.

## `is_primary` invariant

> A student with at least one guardian has **exactly one** primary guardian. `is_primary` is auto-managed by the service.

Rules enforced inside `GuardiansService` (always in a single transaction):

1. **First guardian linked:** ignore the request's `is_primary`; force `is_primary = true`.
2. **Subsequent link with `is_primary = true`:** set the existing primary's `is_primary = 0`, then insert.
3. **Subsequent link with `is_primary = false` or omitted:** insert as-is; the existing primary stays.
4. **PATCH setting `is_primary = true`:** unset all others for the same student first.
5. **PATCH setting `is_primary = false`:** reject with 400 (`At least one guardian must be primary`). To switch primaries, the client PATCHes the new primary; the previous one is auto-unset.
6. **DELETE the only guardian:** allowed. Audit + notify VPs (see below).
7. **DELETE the primary while others exist:** auto-promote the **earliest-created** remaining guardian to primary. Audit notes the promotion.

## When a student loses their last guardian

A `student.guardian.unlink` event that leaves the student with zero guardians is **not** an error. The service:

1. Writes the `student.guardian.unlink` audit entry.
2. Writes an additional `student.orphaned` audit entry with `entityId = studentId`.
3. Calls `NotificationService.notifyRole(schoolId, 'vice_principal', { type: 'student.orphaned', studentId, studentName })`. The principal also receives this if the notification service fans out by minimum-level.

This is the only outbound notification this module triggers. Do not add others without an entry in the matrix.

## Visibility — the scope rules

`StudentScopeGuard` runs after `RolesGuard` on `:id` routes. It loads the student (school-checked, 404 on miss), then verifies the caller's scope:

- `principal` / `vice_principal` → always allowed (no further check).
- `supervisor` → at least one row in `supervisor_halaqat` for a halaqa that contains this student, via `student_halaqa`.
- `teacher` → at least one row in `halaqa_teachers` (with `end_date IS NULL`) for a halaqa that contains this student.
- `parent` → at least one row in `student_guardians` where `guardian_user_id = caller.id` and `student_id = :id`.

A scope miss returns **404** (consistent with cross-school misses; never reveal that the student exists).

For list endpoints, scope is applied as a `WHERE` filter, not a guard — guards can't filter rows. The service builds the query based on `currentUser.roles`:

```sql
-- principal/vice_principal: WHERE school_id = :schoolId
-- supervisor: school_id = :schoolId AND id IN (
--   SELECT student_id FROM student_halaqa
--   WHERE halaqa_id IN (SELECT halaqa_id FROM supervisor_halaqat WHERE supervisor_user_id = :userId))
-- teacher: school_id = :schoolId AND id IN (
--   SELECT student_id FROM student_halaqa
--   WHERE halaqa_id IN (SELECT halaqa_id FROM halaqa_teachers
--                       WHERE teacher_user_id = :userId AND end_date IS NULL))
-- parent: id IN (SELECT student_id FROM student_guardians WHERE guardian_user_id = :userId)
```

Note the parent query has no `school_id` filter — parents can have children in multiple schools (per product decision), and their children's `school_id` is whatever's on the student row. This is a deliberate exception to the school-scoping rule and is the only one in this module.

## Capacity validation

Validated in the service, not just the DTO, because the bounds are business rules that may evolve:

```ts
const MIN = 0;
const MAX_HIFZ = 20;     // pages of new memorization per day
const MAX_NEAR = 50;     // pages of recent review per day
const MAX_FAR  = 100;    // pages of distant review per day
```

Out-of-range → 400 with the field name and allowed range. These constants live in `students/capacity.config.ts` so they can be tuned without touching service logic. The DECIMAL(5,2) column already permits up to 999.99; the service is the actual gatekeeper.

## Soft delete vs status

Two separate concepts that frequently get confused — keep them distinct:

- `deleted_at` → administrative removal. Hidden by default queries. Restorable via `POST /:id/restore`.
- `status = 'graduated'` → student finished the program. Visible in lists when `status` filter allows it. Set via `POST /:id/graduate`. Graduating does **not** soft-delete.
- `status = 'inactive'` → temporary withdrawal. Set via `PATCH /:id { status: 'inactive' }`.

Graduating and soft-deleting are independent: a graduated student can still be soft-deleted, and a soft-deleted student retains whatever status they had.

## Response shapes

Follow the existing global envelope (`{ code, data }` / `{ code, message }`). Specific to this module:

### `GET /students/:id` — guardians inline

```json
{
  "code": 200,
  "data": {
    "id": 17,
    "first_name": "محمد",
    "second_name": "أحمد",
    "third_name": "سالم",
    "family_name": "الحسني",
    "name": "محمد أحمد سالم الحسني",
    "gender": "male",
    "dob": "2014-03-12",
    "join_date": "2023-09-01",
    "status": "active",
    "daily_hifz_pages_capacity": "1.00",
    "daily_near_pages_capacity": "5.00",
    "daily_far_pages_capacity": "10.00",
    "notes": "...",
    "photo_url": null,
    "guardians": [
      {
        "user": {
          "id": 42,
          "first_name": "أحمد",
          "second_name": "سالم",
          "third_name": "علي",
          "family_name": "الحسني",
          "name": "أحمد سالم علي الحسني",
          "email": "father@x.com",
          "phone": "..."
        },
        "relation": "father",
        "is_primary": true,
        "can_pickup": true
      }
    ]
  }
}
```

### `GET /students` — list, no guardians

Each item has the bio fields above without `guardians`. Adding it would N+1 every list page.

### `GET /students/:id/guardians`

```json
{
  "code": 200,
  "data": [ /* same guardian objects as above */ ]
}
```

## Memorization

`students.memorized_ayat` is a **`VARBINARY(780)`** bitmap over every ayah of the mushaf — 6236 ayat, one bit each (780 bytes; the last 4 bits are unused). Bit `i` (MSB-first within each byte) is the `i`-th ayah in mushaf order, starting at Al-Fatihah:1 = index 0. **Do not use `BINARY(780)`** — MySQL's fixed `BINARY` caps at 255 bytes. All bitmap logic lives in `src/quran/quran-bitmap.ts` (`ayahIndex`, `applyRange`, `countBits`, `toBitmap`, `createEmptyBitmap`); never hand-roll bit math elsewhere. The surah→offset map is derived from `SURAH_VERSES`.

Two write paths, both owned by `MemorizationService`:

1. **Recompute (authoritative).** The bitmap is *derived* from the union of the student's **approved, non-deleted Hifz achievement ranges**. Any Hifz achievement approve/unapprove/delete enqueues a recompute (see below); the worker rebuilds the whole bitmap. Non-Hifz tracks never touch it.
2. **Manual edit.** `PUT /students/:id/memorization` applies `set` (mark) then `clear` (unmark) verse ranges directly onto the stored bitmap. **Manual edits are overwritten by the next recompute** (accepted trade-off — there is no manual overlay layer). Parents cannot edit.

### The recompute queue

`memorization_jobs` is a durable, DB-backed queue — **one row per student** (unique `student_id`). Enqueue is an `INSERT … ON DUPLICATE KEY UPDATE status='pending'` upsert, so a burst of achievement changes coalesces into a single pending job and the table stays bounded by the student count. `AchievementsService` enqueues **best-effort** (failures logged, never thrown — a queue hiccup must not fail the approve/unapprove/delete).

`MemorizationCron` (`@nestjs/schedule`, every minute) drains it: claim `pending → processing` with a compare-and-set, recompute, then settle `processing → done` with a second CAS so a concurrent enqueue that re-flags the row `pending` survives for the next tick. Failed jobs retry up to `MAX_ATTEMPTS` (5) then park at `failed`.

This is the one place `AchievementsModule` imports `StudentsModule` (to inject `MemorizationService`). The dependency is one-way; the students module never imports achievements — the worker reads the `achievements` table via raw SQL.

## Audit actions

Every mutation writes one of these. Action name is the literal string passed to `AuditService.log`.

| Action | Trigger | `entityType` | `entityId` |
|---|---|---|---|
| `student.create` | POST /students | `student` | new id |
| `student.update` | PATCH /students/:id (any DTO) | `student` | :id |
| `student.delete` | DELETE /students/:id | `student` | :id |
| `student.restore` | POST /:id/restore | `student` | :id |
| `student.graduate` | POST /:id/graduate | `student` | :id |
| `student.guardian.link` | POST /:id/guardians | `student_guardian` | studentId (use `entityId`) |
| `student.guardian.update` | PATCH /:id/guardians/:gid | `student_guardian` | studentId |
| `student.guardian.unlink` | DELETE /:id/guardians/:gid | `student_guardian` | studentId |
| `student.guardian.primary_promoted` | auto-promotion on primary delete | `student_guardian` | studentId |
| `student.orphaned` | unlink leaving 0 guardians | `student` | studentId |

For PATCH actions, always populate `oldValues` and `newValues` with the changed fields only — never the full row.

## When adding a new student-related endpoint — checklist

1. Pick the controller: bio routes go in `students.controller.ts`, guardian routes in `student-guardians.controller.ts`, parent self-service in `my-children.controller.ts`.
2. Add `@Roles(...)` listing every role allowed. Default-deny.
3. If it accepts an `:id` and is not a parent self-service route, attach `StudentScopeGuard`.
4. Use the service helper `findInScopeOrFail(id, currentUser)` rather than a raw repo query — it encapsulates the school + scope check and returns 404 on miss.
5. Pick the right DTO. If teachers are allowed to mutate, you need a separate teacher-DTO that whitelists the allowed fields.
6. Wrap mutations in a transaction when they touch both `students` and `student_guardians`.
7. Audit. Always.
8. If a side effect orphans a student or violates an invariant, fire the corresponding notification.
9. Write an e2e test asserting: (a) cross-school request returns 404, (b) out-of-scope request returns 404, (c) wrong role returns 403, (d) the happy path writes the expected audit row.

## When NOT to use this skill

- Attendance, achievements, weekly plans, additional sessions — separate modules. They read student data via `StudentsService.findInScopeOrFail`, but their business rules live elsewhere.
- Halaqa CRUD and teacher assignment (`halaqat`, `halaqa_teachers`, `supervisor_halaqat`) — separate halaqa module. This module **reads** those tables for scope filters but does not write to them.
- Reports — the reports module composes data from this module + others; it doesn't belong here.
- Student authentication — students do not log in. Anything resembling student credentials is a bug.

## Reference files

- `references/dtos.md` — exact field lists for each DTO and which roles use which.
- `references/scope-queries.md` — the canonical SQL for each role's visibility filter.
- `references/curl-examples.md` — request/response shapes for every endpoint.
