---
name: student-id-number-policy-update
description: Apply the policy update that makes `students.id_number` required for newly created students (legacy NULLs allowed), removes role-based visibility restrictions on the field within school scope, and removes id_number from audit sensitive-fields stripping. Use this skill when modifying any code, DTOs, dtos.md / SKILL.md / reference docs, audit config, or response mappers related to student id_number visibility, requiredness, or audit redaction. Triggers on phrases like "make student id required", "show id_number to teachers", "everyone in the school should see the id", or any request that changes who sees `id_number` or whether it's optional. This skill REPLACES the visibility, optionality, and audit-redaction sections of the original `student-id-number` skill — those rules are now superseded.
---

# Student ID Number — policy update

This skill records the policy change applied on top of the original `student-id-number` skill. It supersedes specific sections of that skill while leaving everything else (validator architecture, lock-after-set, force-change audit, normalization, checksum-as-warning, search side-channel rules) in place.

If you're implementing or reviewing `id_number` behavior, **read the original skill first, then apply the diffs in this document.** Where they conflict, this document wins.

## What changed

| Aspect | Before | After |
|---|---|---|
| Optionality | Optional forever | **Required for new students; legacy NULLs allowed** |
| Visibility | principal/VP full; parent own-children only; supervisor/teacher hidden | **Anyone with scope to see the student sees the field** |
| Audit redaction | `id_number` stripped from audit reads for non-principal | **No stripping; field flows through audit reads like any other field** |
| Lock + force-change | unchanged | unchanged |
| Validator + checksum | unchanged | unchanged |
| Uniqueness | unchanged | unchanged |
| Normalization | unchanged | unchanged |
| Sort | unchanged (not sortable) | unchanged |

## Required for new, NULL allowed for legacy

The DB column **stays `NULL`-able**. We do not run a `NOT NULL` migration. Existing rows with `id_number IS NULL` remain valid; they're "legacy."

Requiredness is enforced at the **application layer**:

- `CreateStudentDto`: `id_number` is `@IsNotEmpty()` + `@IsString()` + `@MaxLength(20)`. No `@IsOptional()`. Missing or empty in the request body → 400.
- `UpdateStudentDto`: `id_number` remains `@IsOptional()` (you can submit a PATCH that doesn't touch the field). However, when a legacy student (current `id_number IS NULL`) is updated through any endpoint, the controller path that handles the update **does not auto-require** the field — admins fix legacy data deliberately, not as a side effect.

This split (DB nullable, DTO required-on-create) is intentional. Reading the schema alone gives the wrong impression — anyone confused should read this skill.

### Why not flip to `NOT NULL`?

Flipping the column would require backfilling every legacy student before deploy. Some legacy students may genuinely never get an `id_number` (foreign students, lost paperwork, etc.). Keeping the column nullable lets us enforce the policy going forward without a forced data-cleanup project.

### Tightening later

If you later decide to flip to `NOT NULL`:

1. Run a report: `SELECT id, name FROM students WHERE id_number IS NULL`.
2. Backfill those rows manually (or accept that they'll be hard-deleted).
3. Run `ALTER TABLE students MODIFY id_number VARCHAR(20) NOT NULL`.
4. Update this skill to remove the "legacy NULLs allowed" exception.

Don't do this unless you have a specific reason. The current policy is fine indefinitely.

## Visibility — anyone with scope sees the field

The field is no longer restricted by role within the school. The rule is now simply: **if a viewer can see the student, they see the `id_number`**.

`StudentDto.fromEntity(student, currentUser)` no longer branches on role for this field. The mapper unconditionally includes `id_number`:

```ts
function fromEntity(student, currentUser) {
  return {
    id: student.id,
    id_number: student.id_number,   // always present (may be null for legacy)
    name: student.name,
    // ...other fields
  };
}
```

The `currentUser` parameter is still passed in (other fields may use it), but `id_number` itself doesn't read from it.

### Why this is safe

The student object only reaches a viewer if scope filters / `StudentScopeGuard` already allowed it. A teacher only gets students from their halaqat in responses; a parent only gets their own children; a supervisor only gets students in their supervised halaqat; principal/VP get everyone in the school. Cross-school is still 404, untouched. Adding `id_number` to all those responses doesn't change *which* students each viewer sees — only that the field appears.

### Key always present

`id_number` is now **always present** in the student response when the viewer can see the student. Value may be `null` (legacy student) or a string. The earlier "key omitted vs. key null" distinction goes away — there is no "hidden by role" case anymore.

Frontends that previously checked for `id_number` key presence to detect role-based hiding can simplify: just read the value.

## Search & filter — symmetric with visibility

Search behavior follows visibility one-to-one. Now that everyone in scope sees the field, everyone in scope can search by it.

| Role | `q` matches | `?id_number=` filter |
|---|---|---|
| principal / VP | `name LIKE` OR `id_number LIKE` | allowed |
| supervisor | `name LIKE` OR `id_number LIKE` (within scope) | allowed (within scope) |
| teacher | `name LIKE` OR `id_number LIKE` (within scope) | allowed (within scope) |
| parent (`/me/children`) | `name LIKE` OR `id_number LIKE` (own children) | allowed (own children) |

The earlier "supervisor/teacher get 400 if `?id_number=` is used" behavior is removed. The 400 existed to prevent a side-channel leak when those roles couldn't see the field; the side-channel concern is gone.

The service simplification:

```ts
// Before
if (query.id_number !== undefined) {
  if (!user.hasAnyRole('principal', 'vice_principal') && !isParentScope) {
    throw new BadRequestException('Filtering by id_number is not allowed for your role.');
  }
  qb.andWhere('s.id_number = :idNumber', { idNumber: validator.normalize(query.id_number) });
}

// After
if (query.id_number !== undefined) {
  qb.andWhere('s.id_number = :idNumber', { idNumber: validator.normalize(query.id_number) });
}
```

The scope filters that already restrict *which students* a query returns continue to work — they don't need changes. A teacher searching `?id_number=300...` still only matches students within their halaqat scope.

## Audit redaction — removed

`id_number` is removed from `audit/sensitive-fields.config.ts`:

```ts
// Before
export const SENSITIVE_AUDIT_FIELDS = ['id_number'] as const;

// After
export const SENSITIVE_AUDIT_FIELDS = [] as const;
// (or whatever other fields belong; just no id_number)
```

If the array becomes empty, **leave the file in place**. The infrastructure (the read-time strip logic that consumes this config) stays. We're just not stripping anything right now. Future sensitive fields go here.

The audit-read logic itself doesn't need a code change — it iterates over `SENSITIVE_AUDIT_FIELDS` and strips matches. An empty array means no stripping.

### What this changes for audit consumers

- VP / supervisor / teacher / parent audit readers (whoever can read audit per your role matrix) now see `id_number` plaintext in `old_values` and `new_values`.
- Principal still sees everything (unchanged).
- The `student.id_number.force_changed` action continues to be written and read; consumers see the full old/new values.

## What stays unchanged

Listed explicitly to prevent accidental edits when reviewing this change:

- **Validator interface and Palestinian implementation** — same.
- **Normalization** (strip whitespace/dashes, convert Arabic-Indic & Persian digits to ASCII) — same.
- **Format check is a hard fail; checksum is a warning** — same.
- **Uniqueness:** `UNIQUE (id_number, school_id)`. Constraint applies to soft-deleted rows. Cross-school duplicates are fine. Same.
- **Lock-after-set + `force_id_number_change` flag** — same.
- **`student.id_number.force_changed` audit action** — same. Two audit rows on force-change PATCH (the regular `student.update` plus the force-change row).
- **Teacher cannot edit `id_number`.** `UpdateStudentByTeacherDto` still doesn't list the field. Visibility changed; edit-permission did not. A teacher can now *see* the field but cannot *change* it.
- **Sort by `id_number`** is still not supported.
- **Empty string in body** is still a 400 (handled by `@IsNotEmpty()` on create now; on update it's still rejected as malformed).

## Files to change

Concrete change list. Everything not listed stays as-is.

### `students/dto/create-student.dto.ts`

Replace `@IsOptional()` with `@IsNotEmpty()` on `id_number`. Keep the other decorators.

### `students/dto/update-student.dto.ts`

No change. `id_number` and `force_id_number_change` stay as before.

### `students/dto/update-student-by-teacher.dto.ts`

No change. Still does not list the field.

### `students/dto/student.dto.ts` (the response mapper)

Remove the role-based visibility check. Always include `id_number` in the output.

### `students/services/students.service.ts`

Remove the role-gated rejection on `?id_number=` filter. The filter applies for all roles; scope filters still bound the result set.

### `students/controllers/*` and `users.controller.ts` and `me/children.controller.ts`

No structural changes. The mapper change handles visibility; controllers don't need to know about it.

### `audit/sensitive-fields.config.ts`

Remove `'id_number'` from the array. If empty, leave the file in place.

### Tests to update

| Old behavior | New behavior |
|---|---|
| Teacher `GET /students/:id` → no `id_number` key | Teacher `GET /students/:id` → `id_number` key present (value or null) |
| Teacher `GET /students?id_number=...` → 400 | Teacher `GET /students?id_number=...` → 200, results filtered by scope |
| Teacher `GET /students?q=300...` → matches name only | Teacher `GET /students?q=300...` → matches name OR id_number, within scope |
| VP audit-read on force_changed row → id_number stripped | VP audit-read on force_changed row → id_number plaintext |
| Create student without id_number → 201 | Create student without id_number → 400 |
| Create student with empty id_number → 400 (was already) | Create student with empty id_number → 400 |

Add: a test asserting that legacy students (where `id_number IS NULL` because they were created before this change) can be PATCHed without supplying `id_number`.

## What this change does not enable

- **Required on update.** The policy is "required on create." A PATCH that doesn't touch `id_number` is fine, even on a legacy student. Admins fix legacy data when they get to it; the system doesn't force the issue at every update.
- **Requiring all existing students to have id_number.** If you want this, see "Tightening later" above. Out of scope here.
- **Showing id_number outside of student responses.** The visibility rule is "if you see the student, you see the field." Other endpoints that happen to mention a student's id (e.g., audit log entry text) follow their own rules.

## Cross-references

- Original feature spec: `student-id-number/SKILL.md` — read first. This skill applies as a diff on top of it.
- Validator interface: original `references/validator-spec.md` — unchanged.
- DTO field decorators: original `references/dto-fields.md` — see "Files to change" above for the diff.
- Audit actions: original `references/audit-actions.md` — `student.id_number.force_changed` action is unchanged. The "Sensitive-fields config (cross-module)" subsection of that document is now obsolete; the field is no longer in the array.

## When to update the original skill instead of layering this one

If this policy holds for at least 6 months and no further changes seem likely, fold this skill into the original `student-id-number/SKILL.md`:

- Replace the "Decision summary" rows for optionality, visibility, and audit redaction.
- Update the "Visibility — `StudentDto.fromEntity`" section with the simplified mapper.
- Update the "Search behavior" table.
- Delete the "Sensitive-fields config (cross-module)" reference subsection.
- Then archive this edit-skill (or delete it).

Until that consolidation happens, both skills together describe the current behavior. New developers should read the original first, then this one.
