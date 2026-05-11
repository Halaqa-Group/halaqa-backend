---
name: nestjs-halaqat-module
description: |
  Implement, extend, or modify the Halaqat & Teacher Assignment module
  for the Quran Schools Management System (NestJS + TypeORM + MySQL).
  Use whenever the user asks to add, fix, or change anything related to:
  halaqat CRUD, teacher assignments, primary/acting teacher logic,
  student enrollment in halaqat, schedule management (prayer slots),
  supervisor assignments, schedule conflict detection, or student transfers.
  Trigger keywords: halaqa, halaqat, حلقة, حلقات, teacher assignment,
  تعيين معلم, primary teacher, محفظ رئيسي, acting teacher, نائب بالوكالة,
  acting_as_primary, halaqa_teachers, supervisor_halaqat, halaqa_schedules,
  student_halaqa, prayer_slot, schedule conflict, تعارض جدول, نقل طالب,
  student transfer, enroll student, halaqa archive.
---

# Halaqat & Teacher Assignment Module

This skill builds and maintains **Module 4** of the Quran Schools Management
System: halaqat (study circles), teacher assignments with primary/acting
roles, supervisor assignments, schedule management, and student enrollment.

## When to use this skill

Use this skill when the request touches any of these tables or concepts:

- `halaqat` — the study circles themselves (CRUD, archive, complete)
- `halaqa_teachers` — teacher assignments with `role` (main/assistant/substitute) and `acting_as_primary` flag
- `halaqa_schedules` — weekly schedule using `prayer_slot`
- `student_halaqa` — student enrollment in halaqat
- `supervisor_halaqat` — supervisor-to-halaqa relationships
- `halaqa_activity_logs` — domain-specific audit log for sensitive operations

Also trigger when the user asks about:
- Schedule conflict detection (teacher assigned to multiple halaqat)
- Student transfers between halaqat
- Acting teacher activation when primary is absent
- The daily cron jobs (`expire_acting_primary`, `notify_no_primary`)

## Workflow — read in this order

Before writing or modifying any code in this module, read these files in order:

1. **`references/00-migrations.md`** — the halaqat tables exist in the DB
   only as bootstrap stubs (placeholders to unblock earlier modules). This
   file lists the `ALTER`s needed to bring them to the target schema.
   **Run these first** before writing any service code.
2. **`references/01-database-schema.md`** — the target table structures.
   This is what the entities mirror, after migrations run.
3. **`references/02-business-rules.md`** — the 12 BR-HLQ rules. Every service
   method should reference the rule it enforces.
4. **`references/04-permissions-matrix.md`** — who can do what. Critical for
   guards and controller decorators.
5. **`references/03-api-endpoints.md`** — full endpoint list with DTOs.

Then for specific tasks:

- Schedule conflict logic → `references/05-conflict-detection.md`
- Acting teacher work → `references/06-acting-teacher-flow.md`
- Student transfer / re-enrollment → `references/07-student-transfer-flow.md`
- Halaqa archival → `references/08-halaqa-archival-flow.md`

For code, copy from `templates/` and adjust — do not rewrite from scratch.

## Project context — non-negotiable conventions

This module lives inside a NestJS backend with established conventions.
**Always** follow these — they are not opinions, they are the codebase rules:

- **Response envelope**: handled globally by `ResponseInterceptor` and
  `HttpExceptionFilter`. Read `halaqa-backend/.claude/skills/api-envelopes/SKILL.md`
  before writing any controller. Never hand-craft `{ code, data }`.
- **JSON casing in this module**: `snake_case` for DTOs, query params, and
  response fields — match the `students` module, not `users` or `auth`.
- **Multi-tenant**: every query MUST filter by `school_id` from the JWT.
  No exceptions, no shortcuts.
- **Errors**: `throw new ConflictException('clear English message')` etc.
  Never build error JSON manually. English-only messages.
- **Pagination**: `{ items, total, page, limit }` — defaults `page=1`,
  `limit=20`, max `100`. See api-envelopes skill for the exact DTO.

## Critical rules — do not violate

These are the rules most easily broken. Read them every time:

1. ⚠️ **Schema bootstrap → target.** The tables `halaqat`, `halaqa_teachers`,
   `student_halaqa`, `halaqa_schedules`, `supervisor_halaqat` exist in the
   DB **as minimal bootstrap stubs** so earlier modules could compile and
   insert data. They do NOT yet match what this module needs. The first
   step is running `references/00-migrations.md` to bring them up.
   The new table `halaqa_activity_logs` is created by the same migrations.

2. ⚠️ **Substitutes must always be acting.** A row with `role='substitute'`
   AND `end_date IS NULL` MUST have `acting_as_primary=1`. Enforced by
   `chk_substitute_must_act` at the DB level and validated again in the
   service. When a substitute's acting period ends, the row is closed
   (`end_date` set), never demoted to non-acting. See BR-HLQ-06.

3. ⚠️ **Acting bypasses schedule conflict check.** When activating
   `acting_as_primary`, do NOT check schedule conflicts — by design, the
   acting teacher covers two halaqat at the same prayer slot.

4. ⚠️ **The original main teacher's `role='main'` stays during absence.**
   Acting is added on top via `acting_as_primary` on a different row;
   the main is never demoted.

5. ⚠️ **Student re-enrollment uses UPDATE, not INSERT.** The composite PK
   `(student_id, halaqa_id)` means a student returning to a halaqa updates
   the existing row's status back to `'active'`. The history goes into
   `halaqa_activity_logs`, not into `student_halaqa`.

6. ⚠️ **Cannot delete a halaqa with active students.** Throw
   `ConflictException` — do not soft-delete cascade silently.

7. ⚠️ **Permission scope: any active teacher and supervisor** can edit halaqa
   `name`, `evaluation_settings`, and `schedule` — but never `type` or
   `status`. "Active teacher" means any row in `halaqa_teachers` for this
   user with `end_date IS NULL` (main, assistant, or substitute-with-acting
   all qualify). See `04-permissions-matrix.md`.

## Module structure (NestJS)

When adding code to the actual backend, the layout under
`src/modules/halaqat/` is:

```
src/modules/halaqat/
├── halaqat.module.ts
├── entities/
│   ├── halaqa.entity.ts
│   ├── halaqa-teacher.entity.ts
│   ├── halaqa-schedule.entity.ts
│   ├── student-halaqa.entity.ts
│   ├── supervisor-halaqa.entity.ts
│   └── halaqa-activity-log.entity.ts
├── dto/
│   ├── create-halaqa.dto.ts
│   ├── update-halaqa.dto.ts
│   ├── list-halaqat.query.ts
│   ├── set-schedule.dto.ts
│   ├── assign-teacher.dto.ts
│   ├── set-acting.dto.ts
│   ├── enroll-student.dto.ts
│   └── transfer-student.dto.ts
├── controllers/
│   ├── halaqat.controller.ts
│   ├── halaqa-teachers.controller.ts
│   ├── halaqa-students.controller.ts
│   └── halaqa-supervisors.controller.ts
├── services/
│   ├── halaqat.service.ts
│   ├── teacher-assignment.service.ts
│   ├── student-enrollment.service.ts
│   ├── supervisor-assignment.service.ts
│   ├── schedule-conflict.service.ts
│   └── halaqa-activity-log.service.ts
├── guards/
│   └── halaqa-edit-access.guard.ts
└── jobs/
    ├── expire-acting-primary.job.ts
    └── notify-no-primary.job.ts
```

## Background jobs

This module owns two cron jobs (see `references/06-acting-teacher-flow.md`
and `references/02-business-rules.md` BR-HLQ-11):

- `expire_acting_primary` — daily; activates pending acting assignments
  whose `acting_starts_at <= today`, and ends those whose `acting_ends_at < today`.
- `notify_no_primary` — daily; flags active halaqat without an effective
  primary teacher for more than 7 days (warning only, no automatic action).

## Out of scope for this skill

This module does NOT cover:
- Attendance logging (separate module — `attendance` and `teacher_attendance`)
- Achievements / weekly plans (separate modules)
- Authentication, users, roles (handled by the auth module)
- The school-level work schedule / holidays (separate module)

If the request crosses into those areas, stop and check whether a different
skill should handle it.
