# Database Schema — Halaqat Module (Target State)

This file describes the **target** schema this module operates against —
after the migrations in `00-migrations.md` have been applied.

The module owns 5 existing tables (currently in the DB as minimal
bootstrap stubs from earlier development) plus 1 new audit table
(`halaqa_activity_logs`). Run `00-migrations.md` first to bring the
existing tables up to the structure shown here.

---

## Tables

### `halaqat` — the study circles

```sql
CREATE TABLE `halaqat` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `school_id` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `type` ENUM('Memorization', 'Tajweed', 'Aqeedah') NOT NULL DEFAULT 'Memorization',
  `evaluation_settings` JSON DEFAULT NULL,
  `status` ENUM('active', 'archived', 'completed') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `deleted_at` DATETIME(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_halaqa_school_status` (`school_id`, `status`),
  CONSTRAINT `fk_halaqa_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Field notes:**
- `type` — fixed enum, only 3 values. Cannot be changed after halaqa has students.
- `evaluation_settings` — JSON for Achievements module weights/thresholds.
  This module stores it as opaque JSON; the Achievements module defines its shape.
- `status`:
  - `active` — operational
  - `completed` — finished its mission successfully
  - `archived` — soft-deleted / retired (used together with `deleted_at`)

### `halaqa_teachers` — teacher assignment history

```sql
CREATE TABLE `halaqa_teachers` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `halaqa_id` INT NOT NULL,
  `teacher_user_id` INT NOT NULL,
  `role` ENUM('main','assistant','substitute') NOT NULL DEFAULT 'main',
  `acting_as_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `acting_starts_at` DATE DEFAULT NULL,
  `acting_ends_at` DATE DEFAULT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE DEFAULT NULL,
  `end_reason` ENUM('reassigned','left_school','vacation','retired','other') DEFAULT NULL,
  `assigned_by` INT DEFAULT NULL,
  `notes` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  -- Generated columns for unique constraints
  `active_lock` VARCHAR(30) GENERATED ALWAYS AS (
    IF(`end_date` IS NULL, CONCAT(`halaqa_id`, '-', `teacher_user_id`), NULL)
  ) VIRTUAL,
  `primary_lock` INT GENERATED ALWAYS AS (
    IF(`role` = 'main' AND `end_date` IS NULL, `halaqa_id`, NULL)
  ) VIRTUAL,
  `acting_lock` INT GENERATED ALWAYS AS (
    IF(`acting_as_primary` = 1 AND `end_date` IS NULL, `halaqa_id`, NULL)
  ) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_one_active_assignment` (`active_lock`),
  UNIQUE KEY `idx_one_main_per_halaqa` (`primary_lock`),
  UNIQUE KEY `idx_one_acting_per_halaqa` (`acting_lock`),
  KEY `idx_ht_halaqa_active` (`halaqa_id`, `end_date`),
  KEY `idx_ht_teacher_active` (`teacher_user_id`, `end_date`),
  CONSTRAINT `chk_substitute_must_act` CHECK (
    NOT (`role` = 'substitute' AND `acting_as_primary` = 0 AND `end_date` IS NULL)
  ),
  CONSTRAINT `fk_ht_halaqa` FOREIGN KEY (`halaqa_id`) REFERENCES `halaqat` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ht_teacher` FOREIGN KEY (`teacher_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ht_assigner` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Critical structural decisions baked into the schema:**

Three generated columns enforce three invariants at the **database level** —
they cannot be bypassed by the application:

| Generated column | Enforces |
|---|---|
| `active_lock` | A single teacher cannot have two active (`end_date IS NULL`) assignments to the same halaqa |
| `primary_lock` | A halaqa cannot have two active rows with `role='main'` |
| `acting_lock` | A halaqa cannot have two active rows with `acting_as_primary = 1` |

A fourth invariant is enforced by a **CHECK constraint** (`chk_substitute_must_act`):

> A `substitute` row cannot exist in the active state (`end_date IS NULL`)
> with `acting_as_primary = 0`. Substitutes exist *only* to cover an
> absent primary; once their acting period ends, the row must be closed
> (`end_date` set), never demoted to a non-acting substitute.

**Field semantics:**
- `role` — administrative designation for the teacher within the halaqa:
  - `main` — the permanent primary teacher (one active per halaqa)
  - `assistant` — a permanent secondary teacher (any number active)
  - `substitute` — a teacher added specifically to cover for an absent primary
    (their existence is bound to an active acting period — see above)
- `acting_as_primary` — temporary operational flag: this teacher is acting
  in place of an absent primary right now. Independent of `role` for
  `main`/`assistant`; mandatory for active `substitute`.
- `acting_starts_at` / `acting_ends_at` — bound the acting period
- `start_date` / `end_date` — bound the assignment lifetime; `end_date IS NULL` means active
- `end_reason` — why the assignment ended (used together with `end_date`)

**The historical record is sacred:** `end_date` and `end_reason` close
out an assignment. Never DELETE a row from `halaqa_teachers`.

### `halaqa_schedules` — weekly schedule (MODIFIED)

```sql
CREATE TABLE `halaqa_schedules` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `halaqa_id` INT NOT NULL,
  `day_of_week` TINYINT NOT NULL COMMENT '0=Saturday ... 6=Friday',
  `prayer_slot` ENUM('fajr','dhuhr','asr','maghrib','isha') DEFAULT NULL,
  `start_time` TIME DEFAULT NULL,
  `end_time` TIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_halaqa_day` (`halaqa_id`, `day_of_week`),
  CONSTRAINT `fk_hs_halaqa` FOREIGN KEY (`halaqa_id`) REFERENCES `halaqat` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Field notes:**
- `day_of_week` — numeric day, **0=Saturday through 6=Friday** (Arab calendar order)
- `prayer_slot` — primary scheduling unit. Conflict detection runs on this.
- `start_time` / `end_time` — optional precision for display/reports only.
  Never used for conflict detection.
- The unique constraint allows only **one schedule entry per (halaqa, day)** —
  a halaqa cannot meet twice in the same day.

### `student_halaqa` — student enrollment (MODIFIED)

```sql
CREATE TABLE `student_halaqa` (
  `student_id` INT NOT NULL,
  `halaqa_id` INT NOT NULL,
  `enrollment_date` DATE NOT NULL,
  `status` ENUM('active', 'transferred', 'completed', 'archived') NOT NULL DEFAULT 'active',
  PRIMARY KEY (`student_id`, `halaqa_id`),
  KEY `idx_sh2_halaqa` (`halaqa_id`),
  CONSTRAINT `fk_sh2_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sh2_halaqa` FOREIGN KEY (`halaqa_id`) REFERENCES `halaqat` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**The composite PK `(student_id, halaqa_id)` is intentional.** It means
each (student, halaqa) pair has exactly one row, ever. The row's `status`
reflects the **current** state. Re-enrollment updates this row, never
inserts a new one.

**Status semantics:**
- `active` — currently enrolled
- `transferred` — moved to another halaqa (by student-transfer flow)
- `completed` — finished the halaqa successfully
- `archived` — the halaqa itself was archived (cascading status, not chosen by the student)

**Why no `id` column:** keeping the composite PK keeps queries trivial.
`SELECT * FROM student_halaqa WHERE student_id=? AND halaqa_id=?` always
returns at most one row — no need for `ORDER BY` or `LIMIT 1` to find
"the current state".

**The history of transfers, re-enrollments, and status changes lives in
`halaqa_activity_logs`** (see below), not in `student_halaqa`.

### `supervisor_halaqat` — supervisor assignments

```sql
CREATE TABLE `supervisor_halaqat` (
  `supervisor_user_id` INT NOT NULL,
  `halaqa_id` INT NOT NULL,
  `assigned_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`supervisor_user_id`, `halaqa_id`),
  KEY `idx_sh_halaqa` (`halaqa_id`),
  CONSTRAINT `fk_sh_supervisor` FOREIGN KEY (`supervisor_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sh_halaqa` FOREIGN KEY (`halaqa_id`) REFERENCES `halaqat` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Notes:**
- A supervisor can supervise multiple halaqat (and a halaqa can have
  multiple supervisors).
- Supervisor assignments are **not** historically tracked here —
  `halaqa_activity_logs` records the assign/unassign events.
- When a halaqa is archived, supervisor rows **stay** to preserve historical
  permission lookups.

---

## New table

### `halaqa_activity_logs` — domain audit trail

This table is **specific to this module**. The general `audit_logs` table
(in the auth module) covers cross-cutting concerns; this one captures
fine-grained halaqa-related events with structured fields for reporting.

```sql
CREATE TABLE `halaqa_activity_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `school_id` INT NOT NULL,
  `halaqa_id` INT DEFAULT NULL,
  `action` ENUM(
    -- Halaqa lifecycle
    'halaqa_created', 'halaqa_updated', 'halaqa_archived',
    'halaqa_completed', 'halaqa_restored',
    -- Teacher operations
    'teacher_assigned', 'teacher_unassigned', 'teacher_role_changed',
    'acting_started', 'acting_extended', 'acting_ended',
    -- Student operations
    'student_enrolled', 'student_re_enrolled', 'student_unenrolled',
    'student_transferred_in', 'student_transferred_out', 'student_completed',
    -- Supervisor operations
    'supervisor_assigned', 'supervisor_unassigned',
    -- Schedule operations
    'schedule_updated'
  ) NOT NULL,
  `actor_user_id` INT DEFAULT NULL,
  `target_user_id` INT DEFAULT NULL COMMENT 'teacher/supervisor involved',
  `target_student_id` INT DEFAULT NULL COMMENT 'when action involves a student',
  `from_halaqa_id` INT DEFAULT NULL COMMENT 'for transfers',
  `to_halaqa_id` INT DEFAULT NULL COMMENT 'for transfers',
  `metadata` JSON DEFAULT NULL COMMENT 'old/new values, reasons, etc.',
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_hal_school_time` (`school_id`, `created_at`),
  KEY `idx_hal_halaqa_time` (`halaqa_id`, `created_at`),
  KEY `idx_hal_student_time` (`target_student_id`, `created_at`),
  KEY `idx_hal_action_time` (`action`, `created_at`),
  CONSTRAINT `fk_hal_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_hal_halaqa` FOREIGN KEY (`halaqa_id`) REFERENCES `halaqat` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_hal_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_hal_target_user` FOREIGN KEY (`target_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_hal_target_student` FOREIGN KEY (`target_student_id`) REFERENCES `students` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_hal_from` FOREIGN KEY (`from_halaqa_id`) REFERENCES `halaqat` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_hal_to` FOREIGN KEY (`to_halaqa_id`) REFERENCES `halaqat` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Why a dedicated audit table instead of `audit_logs`?**

`audit_logs` stores generic CRUD with `entity_type`/`entity_id`/`old_values`/`new_values`.
For halaqat, we need structured columns (`from_halaqa_id`, `to_halaqa_id`,
`target_student_id`) to answer questions like "show me all halaqat this
student has ever been in" or "list all transfers in March 2026" with
indexed lookups, not JSON parsing.

**The two coexist:** sensitive cross-cutting events (e.g. role changes,
account deletion) still go to `audit_logs`. Halaqa-domain events go here.

---

## Getting from bootstrap to target

The migrations needed to bring the existing bootstrap tables to the
schema shown above are documented in `00-migrations.md`. Read that file
before running any DDL — several of the migrations (especially the one
on `halaqa_teachers`) require pre-flight data checks.

---

## Multi-tenant invariant

Every read or write to any of these tables MUST filter or set `school_id`
explicitly. The application layer cannot rely on database-level isolation
because the FKs cross schools (e.g. `users.school_id` is checked separately).

For tables that don't have their own `school_id` column
(`halaqa_teachers`, `halaqa_schedules`, `student_halaqa`, `supervisor_halaqat`),
you reach `school_id` through a `JOIN halaqat h ON h.id = ... WHERE h.school_id = ?`.

This is enforced in every service method — see `references/02-business-rules.md`
rule **BR-HLQ-01**.
