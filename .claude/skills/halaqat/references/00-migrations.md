# Migrations — From bootstrap schema to target schema

The Halaqat module tables already exist in the database, but only as
**bootstrap stubs** to unblock parallel development on earlier modules.
This module's first job is to migrate them to the target schema described
in `01-database-schema.md`.

This file lists every `ALTER`, `CREATE`, and `DROP` needed. Run them in
order inside a single transaction per table where possible.

---

## Current bootstrap schema (what's in the DB right now)

```sql
-- Bootstrap halaqat (minimal)
CREATE TABLE `halaqat` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `school_id` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `status` ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_halaqa_school` (`school_id`),
  CONSTRAINT `fk_halaqa_school` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bootstrap halaqa_teachers (minimal, composite PK, no audit)
CREATE TABLE `halaqa_teachers` (
  `halaqa_id` INT NOT NULL,
  `teacher_user_id` INT NOT NULL,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `acting_as_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `start_date` DATE NOT NULL,
  `end_date` DATE DEFAULT NULL,
  PRIMARY KEY (`halaqa_id`, `teacher_user_id`),
  ...
);

-- Bootstrap student_halaqa (minimal)
CREATE TABLE `student_halaqa` (
  `student_id` INT NOT NULL,
  `halaqa_id` INT NOT NULL,
  `assigned_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`student_id`, `halaqa_id`),
  ...
);
```

The other halaqat-module tables (`halaqa_schedules`, `supervisor_halaqat`)
also exist as bootstrap stubs. Inspect them before migrating and adjust
the statements below if their starting state differs from what's assumed.

---

## Migration 1 — `halaqat`

**Goal:** add `type`, `evaluation_settings`, expand `status` enum,
add `deleted_at` for soft delete.

```sql
ALTER TABLE `halaqat`
  ADD COLUMN `type` ENUM('Memorization','Tajweed','Aqeedah')
    NOT NULL DEFAULT 'Memorization' AFTER `name`,
  ADD COLUMN `evaluation_settings` JSON DEFAULT NULL AFTER `type`,
  MODIFY COLUMN `status` ENUM('active','archived','completed')
    NOT NULL DEFAULT 'active',
  ADD COLUMN `deleted_at` DATETIME(6) DEFAULT NULL AFTER `updated_at`,
  ADD INDEX `idx_halaqa_school_status` (`school_id`, `status`);

-- Drop the now-redundant single-column index
ALTER TABLE `halaqat` DROP INDEX `idx_halaqa_school`;
```

**Existing-data check:** any rows with `status='inactive'` in the
bootstrap need a deliberate decision:

```sql
-- Pick ONE of these mappings before running the MODIFY above:
UPDATE `halaqat` SET `status` = 'archived' WHERE `status` = 'inactive';
-- or
UPDATE `halaqat` SET `status` = 'completed' WHERE `status` = 'inactive';
```

If the bootstrap has zero rows, skip the UPDATE.

---

## Migration 2 — `halaqa_teachers`

**Goal:** restructure to add `id` PK, `role`, acting period dates,
audit columns, the three generated-column unique constraints, and the
`chk_substitute_must_act` CHECK constraint. Drop `is_primary` (replaced
by deriving "primary" status from `role='main'`).

This is the biggest migration. Run inside a transaction.

```sql
START TRANSACTION;

-- 1. Drop the composite PK (we're switching to a surrogate id)
ALTER TABLE `halaqa_teachers` DROP PRIMARY KEY;

-- 2. Add the new columns (note: we keep is_primary for now so we can
--    backfill role from it; it's dropped at the end of this migration)
ALTER TABLE `halaqa_teachers`
  ADD COLUMN `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST,
  ADD COLUMN `role` ENUM('main','assistant','substitute')
    NOT NULL DEFAULT 'main' AFTER `teacher_user_id`,
  ADD COLUMN `acting_starts_at` DATE DEFAULT NULL AFTER `acting_as_primary`,
  ADD COLUMN `acting_ends_at` DATE DEFAULT NULL AFTER `acting_starts_at`,
  ADD COLUMN `end_reason` ENUM('reassigned','left_school','vacation','retired','other')
    DEFAULT NULL AFTER `end_date`,
  ADD COLUMN `assigned_by` INT DEFAULT NULL AFTER `end_reason`,
  ADD COLUMN `notes` VARCHAR(255) DEFAULT NULL AFTER `assigned_by`,
  ADD COLUMN `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  ADD COLUMN `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6);

-- 3. Backfill role from is_primary for any existing rows
--    (is_primary still exists at this point — it's the only data we have
--     to populate role with)
UPDATE `halaqa_teachers`
  SET `role` = IF(`is_primary` = 1, 'main', 'assistant');
-- Note: there is no migration path that produces 'substitute' — those
-- only appear via new application writes after the migration runs.

-- 4. Now drop is_primary (the source of truth is role from this point)
ALTER TABLE `halaqa_teachers` DROP COLUMN `is_primary`;

-- 5. Add the three generated columns + their unique constraints.
--    primary_lock now derives from role='main' (not is_primary=1).
ALTER TABLE `halaqa_teachers`
  ADD COLUMN `active_lock` VARCHAR(30) GENERATED ALWAYS AS (
    IF(`end_date` IS NULL, CONCAT(`halaqa_id`, '-', `teacher_user_id`), NULL)
  ) VIRTUAL,
  ADD COLUMN `primary_lock` INT GENERATED ALWAYS AS (
    IF(`role` = 'main' AND `end_date` IS NULL, `halaqa_id`, NULL)
  ) VIRTUAL,
  ADD COLUMN `acting_lock` INT GENERATED ALWAYS AS (
    IF(`acting_as_primary` = 1 AND `end_date` IS NULL, `halaqa_id`, NULL)
  ) VIRTUAL,
  ADD UNIQUE KEY `idx_one_active_assignment` (`active_lock`),
  ADD UNIQUE KEY `idx_one_main_per_halaqa` (`primary_lock`),
  ADD UNIQUE KEY `idx_one_acting_per_halaqa` (`acting_lock`),
  ADD INDEX `idx_ht_halaqa_active` (`halaqa_id`, `end_date`),
  ADD INDEX `idx_ht_teacher_active` (`teacher_user_id`, `end_date`);

-- 6. Add the substitute-must-act CHECK constraint.
--    Enforces: a substitute row cannot exist active without acting_as_primary=1.
ALTER TABLE `halaqa_teachers`
  ADD CONSTRAINT `chk_substitute_must_act` CHECK (
    NOT (`role` = 'substitute' AND `acting_as_primary` = 0 AND `end_date` IS NULL)
  );

-- 7. Add the assigned_by FK (only after the column exists)
ALTER TABLE `halaqa_teachers`
  ADD CONSTRAINT `fk_ht_assigner` FOREIGN KEY (`assigned_by`)
    REFERENCES `users` (`id`) ON DELETE SET NULL;

-- 8. Adjust the existing FK on teacher_user_id from CASCADE to RESTRICT
-- (target schema requires RESTRICT to prevent accidental teacher deletion
--  when assignments exist)
ALTER TABLE `halaqa_teachers` DROP FOREIGN KEY `fk_ht_teacher`;
ALTER TABLE `halaqa_teachers`
  ADD CONSTRAINT `fk_ht_teacher` FOREIGN KEY (`teacher_user_id`)
    REFERENCES `users` (`id`) ON DELETE RESTRICT;

COMMIT;
```

**Pre-flight checks before running this migration:**

1. Look for any rows that would violate the new unique constraints:

```sql
-- Detect duplicate active assignments (same halaqa + same teacher, both active):
SELECT halaqa_id, teacher_user_id, COUNT(*) c
FROM halaqa_teachers
WHERE end_date IS NULL
GROUP BY halaqa_id, teacher_user_id
HAVING c > 1;

-- Detect multiple active primaries on the same halaqa
-- (run this BEFORE step 4 drops is_primary):
SELECT halaqa_id, COUNT(*) c
FROM halaqa_teachers
WHERE is_primary = 1 AND end_date IS NULL
GROUP BY halaqa_id
HAVING c > 1;

-- Detect multiple active actings on the same halaqa:
SELECT halaqa_id, COUNT(*) c
FROM halaqa_teachers
WHERE acting_as_primary = 1 AND end_date IS NULL
GROUP BY halaqa_id
HAVING c > 1;
```

If any of these return rows, fix the data manually before running step 4.

---

## Migration 3 — `student_halaqa`

**Goal:** rename `assigned_at` to `enrollment_date` (DATE not DATETIME),
add `status` enum.

```sql
ALTER TABLE `student_halaqa`
  CHANGE COLUMN `assigned_at` `enrollment_date` DATE NOT NULL DEFAULT (CURRENT_DATE),
  ADD COLUMN `status` ENUM('active','transferred','completed','archived')
    NOT NULL DEFAULT 'active' AFTER `enrollment_date`;
```

**Caveat on the `CHANGE COLUMN` from DATETIME(6) to DATE:** MySQL will
truncate the time portion of any existing rows. If the bootstrap is empty,
that's fine. If it has data, decide first whether the truncation is
acceptable or whether you need to copy-then-drop instead.

---

## Migration 4 — `halaqa_schedules`

**Goal:** add `prayer_slot` enum (the primary scheduling unit). The
existing `start_time` / `end_time` (if present in the bootstrap) stay as
optional precision fields used for display only — schedule conflict
detection runs on `prayer_slot`.

```sql
ALTER TABLE `halaqa_schedules`
  ADD COLUMN `prayer_slot` ENUM('fajr','dhuhr','asr','maghrib','isha')
    DEFAULT NULL AFTER `day_of_week`;
```

**Verify before running:** check the bootstrap state of this table.
If it doesn't have `start_time` / `end_time` yet, the target schema
expects them as nullable TIME columns — add them in the same ALTER:

```sql
-- Only if start_time / end_time are missing in the bootstrap:
ALTER TABLE `halaqa_schedules`
  ADD COLUMN `start_time` TIME DEFAULT NULL AFTER `prayer_slot`,
  ADD COLUMN `end_time` TIME DEFAULT NULL AFTER `start_time`;
```

The unique key `(halaqa_id, day_of_week)` should already exist from the
bootstrap. If not:

```sql
ALTER TABLE `halaqa_schedules`
  ADD UNIQUE KEY `idx_halaqa_day` (`halaqa_id`, `day_of_week`);
```

---

## Migration 5 — `supervisor_halaqat`

**Goal:** the bootstrap already covers everything the target schema
needs. Verify the table has the expected columns:

```sql
-- Expected columns:
-- supervisor_user_id INT NOT NULL,
-- halaqa_id INT NOT NULL,
-- assigned_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
-- PRIMARY KEY (supervisor_user_id, halaqa_id)
```

If `assigned_at` is missing:

```sql
ALTER TABLE `supervisor_halaqat`
  ADD COLUMN `assigned_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);
```

No structural changes otherwise.

---

## Migration 6 — Create `halaqa_activity_logs` (new table)

```sql
CREATE TABLE `halaqa_activity_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `school_id` INT NOT NULL,
  `halaqa_id` INT DEFAULT NULL,
  `action` ENUM(
    'halaqa_created','halaqa_updated','halaqa_archived',
    'halaqa_completed','halaqa_restored',
    'teacher_assigned','teacher_unassigned','teacher_role_changed',
    'acting_started','acting_extended','acting_ended',
    'student_enrolled','student_re_enrolled','student_unenrolled',
    'student_transferred_in','student_transferred_out','student_completed',
    'supervisor_assigned','supervisor_unassigned',
    'schedule_updated'
  ) NOT NULL,
  `actor_user_id` INT DEFAULT NULL,
  `target_user_id` INT DEFAULT NULL,
  `target_student_id` INT DEFAULT NULL,
  `from_halaqa_id` INT DEFAULT NULL,
  `to_halaqa_id` INT DEFAULT NULL,
  `metadata` JSON DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_hal_school_time` (`school_id`, `created_at`),
  KEY `idx_hal_halaqa_time` (`halaqa_id`, `created_at`),
  KEY `idx_hal_student_time` (`target_student_id`, `created_at`),
  KEY `idx_hal_action_time` (`action`, `created_at`),
  CONSTRAINT `fk_hal_school` FOREIGN KEY (`school_id`)
    REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_hal_halaqa` FOREIGN KEY (`halaqa_id`)
    REFERENCES `halaqat` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_hal_actor` FOREIGN KEY (`actor_user_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_hal_target_user` FOREIGN KEY (`target_user_id`)
    REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_hal_target_student` FOREIGN KEY (`target_student_id`)
    REFERENCES `students` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_hal_from` FOREIGN KEY (`from_halaqa_id`)
    REFERENCES `halaqat` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_hal_to` FOREIGN KEY (`to_halaqa_id`)
    REFERENCES `halaqat` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## Run order

```
1. halaqat
2. halaqa_teachers       ← biggest one; run inside a transaction
3. student_halaqa
4. halaqa_schedules
5. supervisor_halaqat    ← usually a no-op, just verify
6. halaqa_activity_logs  ← create new table
```

If using NestJS migrations / TypeORM migrations, generate one migration
file per table for clarity, in the order above. Do **not** auto-generate
a single sweeping migration — each of these has data-safety considerations
that benefit from being a separate, reviewable file.
