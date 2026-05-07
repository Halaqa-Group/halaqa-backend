---
name: student-id-number
description: Implement, modify, or extend the national-ID-number field (`id_number`) on students. Use this whenever the user mentions adding, validating, displaying, locking, force-changing, searching by, or auditing student ID numbers; whenever they ask about Palestinian/Jordanian/Saudi/etc. national ID handling for students; whenever they touch the `IdNumberValidator` interface or its implementations; whenever they edit `CreateStudentDto`, `UpdateStudentDto`, `ListStudentsQuery`, or `StudentDto.fromEntity` for ID-number reasons; or whenever they discuss why a teacher cannot edit student identity fields. Also use it when handling the audit `student.id_number.force_changed` action or the `sensitive-fields.config.ts` strip behavior. Trigger even if the request says "national ID", "هوية", "ID number", "identification", or just "ID" in the context of students. Does NOT cover: ID numbers for users/guardians (separate decision, different rules), school-internal student numbers (e.g. `STU-2025-0001` — that's a different field), or any non-students entity.
---

# Student ID Number (`id_number`)

Optional national ID number on the `students` entity. Country-agnostic via a swappable validator (Palestinian implementation today). This skill governs everything about the field: schema, validation, locking, visibility, search, audit, and cross-module touchpoints.

## What this field is and is not

**Is:** an external, real-world identifier issued by a government (e.g., Palestinian ID = 9 digits with checksum). Identity data, treated as PII.

**Is not:** a school-internal student number (e.g., `STU-2025-0001`). That's a separate field and a separate feature, not implemented yet. Don't conflate them.

## Decision summary

These are settled. Don't relitigate them in code review without a documented product decision behind it.

| # | Rule |
|---|---|
| Optionality | `NULL`-able forever. No backfill. Optional in DTOs. |
| Uniqueness | `UNIQUE (id_number, school_id)`. Constraint applies to soft-deleted rows too — restoring is always safe; creating a duplicate isn't. |
| Format | Country-specific via validator interface. Palestinian default: 9 ASCII digits. |
| Normalization | Always normalize before storing or comparing: strip whitespace and `-`, convert Arabic-Indic and Persian digits to ASCII. |
| Checksum | Run after format check. Failure = **warning, not rejection.** Stored row is still created/updated; response includes `warnings: ['id_number.checksum_invalid']`. |
| Locking | Once set (`null` → value), the field is locked. Subsequent change requires explicit `force_id_number_change: true` in the body. |
| Force-change audit | Emits an extra audit row: `student.id_number.force_changed`, alongside the normal `student.update`. |
| Visibility | principal/VP: full. Parent: full **for own children only**. Supervisor/teacher: field omitted from response entirely. No masking. |
| Search via `q` | Matches `id_number` only for roles that can see it. Supervisor/teacher: `q` matches name only. |
| Dedicated `?id_number=` filter | principal/VP and parent (own children only). Supervisor/teacher → 400 if used. |
| Sort | Not sortable by `id_number`. |
| Teacher edit | **Never.** `UpdateStudentByTeacherDto` does not list this field. Including it in a teacher request is a 400 by `forbidNonWhitelisted`. |
| Audit storage | Plaintext in `audit_logs.old_values` / `new_values`. Strip happens at audit-**read** time for non-principal readers. |

## Schema

```sql
ALTER TABLE students
  ADD COLUMN id_number VARCHAR(20) NULL AFTER name,
  ADD UNIQUE KEY idx_student_idnum_school (id_number, school_id);
```

`VARCHAR(20)` (not `CHAR(9)`) so other countries' formats work without a migration. MySQL's `UNIQUE` allows multiple `NULL`s — that's required for "optional" to coexist with the unique index.

## Validator architecture (the swap point)

A single interface, one implementation per country. Bound by DI in `students.module.ts`. Swapping countries = changing one binding.

```ts
// students/validators/id-number-validator.interface.ts
export interface IdNumberValidator {
  /** Pure function. Strip whitespace and dashes, convert Arabic-Indic
   *  (U+0660–U+0669) and Persian (U+06F0–U+06F9) digits to ASCII. */
  normalize(input: string): string;

  /** Validate format strictly; checksum is a warning, not a failure. */
  validate(normalized: string): {
    ok: boolean;            // false ONLY when format is wrong
    warnings: string[];     // e.g. ['checksum_invalid']
  };
}
```

Palestinian implementation:
- `normalize`: strip `\s` and `-`, map `٠-٩` and `۰-۹` to `0-9`.
- `validate`: `ok = /^\d{9}$/.test(normalized)`. If `ok`, run the standard Palestinian ID checksum; if it fails, push `'checksum_invalid'` to warnings but keep `ok: true`.

To deploy in Jordan/Saudi/Egypt later: write a new class implementing the same interface and change the binding. Do not branch inside the existing class.

```ts
// students.module.ts
{ provide: 'ID_NUMBER_VALIDATOR', useClass: PalestinianIdValidator }
```

Inject into `StudentsService` as `@Inject('ID_NUMBER_VALIDATOR') validator: IdNumberValidator`.

## Service flow — every mutation that touches `id_number`

The following sequence runs on both `POST /students` and `PATCH /students/:id` whenever `id_number` is present in the request body:

1. **Normalize** the input via `validator.normalize()`. This is what gets stored, compared, and searched.
2. **Format-validate** via `validator.validate()`. If `ok === false` → `400 Bad Request` with the field name. Stop here.
3. **Lock check** (PATCH only). Load the current student. If `current.id_number` is non-null, the incoming value differs, and `force_id_number_change !== true` → `400 Bad Request` with message `"ID number is locked. Use force_id_number_change: true to override."`. Stop here.
4. **Uniqueness check.** Query `students` for `(id_number, school_id)` match excluding the current row. If a match exists → `409 Conflict` with message `"ID number already in use."`. The DB unique index is the safety net, but checking explicitly gives a clean error before the insert.
5. **Persist** the normalized value.
6. **Audit:**
   - Always: `student.update` (or `student.create`) with the field in `newValues`. If the validator returned warnings, include them in `newValues` as `id_number_warnings: [...]`.
   - If a force-change occurred (PATCH where current was non-null and value changed): write a second row, `student.id_number.force_changed`, with `oldValues: { id_number: <old> }` and `newValues: { id_number: <new> }`. Two audit rows for one PATCH — they correlate via `entity_id` and timestamp.
7. **Response:** include `warnings: ['id_number.checksum_invalid']` (or whatever the validator returned) at the top level alongside `data`. The response envelope grows an optional `warnings` array; existing endpoints without warnings stay unchanged.

The `force_id_number_change` flag is **transient**. It lives in the DTO, not the entity. It's not persisted anywhere.

## DTOs — what's allowed where

### `CreateStudentDto`

```ts
@IsOptional()
@IsString()
@MaxLength(20)
id_number?: string;
```

No format regex on the DTO — leave format checking to the validator (different countries, different rules; the DTO would lie). The DTO is just "is it a string of acceptable length."

### `UpdateStudentDto` (principal/VP)

Same field as create, plus the override flag:

```ts
@IsOptional()
@IsString()
@MaxLength(20)
id_number?: string;

@IsOptional()
@IsBoolean()
force_id_number_change?: boolean;
```

### `UpdateStudentByTeacherDto` (teacher path)

**Does not list `id_number` and does not list `force_id_number_change`.** Both fields in a teacher request → 400 from `forbidNonWhitelisted`. This is the sole gate keeping teachers off the field; do not weaken it for any reason.

### `ListStudentsQuery`

```ts
@IsOptional()
@IsString()
@MaxLength(20)
id_number?: string;       // exact-match filter, role-gated in service
```

The existing `q` field remains a free-text matcher; behavior depends on caller's role (see "Search behavior").

## Response shape — `StudentDto.fromEntity(student, currentUser)`

Single mapper applied **everywhere a student is serialized** — top-level (`GET /students/:id`), in lists (`GET /students`), nested under guardians (`GET /students/:id/guardians`), under halaqa endpoints, anywhere. The visibility rule is per-student-per-viewer, applied uniformly.

Rule:

```ts
function fromEntity(student, currentUser) {
  const base = { /* id, name, gender, dob, ... */ };
  if (canSeeIdNumber(student, currentUser)) {
    base.id_number = student.id_number;  // may be null
  }
  // else: key omitted entirely (not null, not "***", not present)
  return base;
}

function canSeeIdNumber(student, currentUser) {
  if (currentUser.hasAnyRole('principal', 'vice_principal')) return true;
  if (currentUser.hasRole('parent')) {
    return isParentOf(currentUser.id, student.id);  // student_guardians lookup
  }
  return false;  // supervisor, teacher
}
```

The `id_number` key is **omitted**, not set to `null`, when the viewer can't see it. This avoids the ambiguity of "is it null because unset, or null because hidden?". Frontends that need to know the difference check key presence.

When a viewer who can see the field looks at a student where `id_number` is unset, the key is present with value `null`. That's the "I'm allowed to see, and there is no value" case.

## Search behavior

The same data, but the query branches on role. Build the WHERE clause in the service, not the controller.

| Role | `q` matches | `?id_number=` exact filter |
|---|---|---|
| principal / VP | `name LIKE` OR `id_number LIKE` | allowed, exact match |
| supervisor | `name LIKE` only | 400 (`Filtering by id_number is not allowed for your role.`) |
| teacher | `name LIKE` only | 400 (same) |
| parent (on `/me/children`) | `name LIKE` OR `id_number LIKE`, scoped to own children | allowed, exact match within own children |

Supervisor/teacher get an **explicit 400** when they pass `?id_number=`, not a silent ignore. Silent ignore would let a teacher discover whether a value matches by side-channel (compare row counts).

The `q` matcher uses `LIKE` with `%value%` — a partial-match search. The `?id_number=` filter uses exact equality. Both run against the **normalized** form, so a search for `300-123-456` should normalize the input first before LIKE-comparing against the stored canonical value.

## Audit

Two actions, two write patterns.

### Normal updates

`student.create`, `student.update` — existing actions, no schema changes. The `id_number` (if changed) appears in `oldValues`/`newValues` like any other field. Validator warnings appear as `id_number_warnings` in `newValues`.

### Force-change

`student.id_number.force_changed` — **new action**. Written in addition to (not instead of) the regular `student.update`. Use this exact action string; downstream tooling will key on it.

```json
{
  "action": "student.id_number.force_changed",
  "entity_type": "student",
  "entity_id": 17,
  "old_values": { "id_number": "300123456" },
  "new_values": { "id_number": "300999888" },
  "actor_user_id": 1,
  "actor_role": "principal"
}
```

Two rows for one PATCH is intentional. The `student.update` row is the routine record; the `student.id_number.force_changed` row is the high-signal alert that someone overrode the lock. They correlate by `entity_id` and timestamp.

### Audit-read redaction (cross-module dependency)

Storage is plaintext. **Read-time** stripping for non-principal audit readers is implemented in the audit module:

```ts
// audit/sensitive-fields.config.ts
export const SENSITIVE_AUDIT_FIELDS = ['id_number'] as const;
```

The audit-read endpoint (wherever it lives — typically `audit.controller.ts`) strips these fields from `old_values` and `new_values` when the caller is not a principal. Principal sees plaintext. VP sees the audit row but with `id_number` removed from values.

This skill **expects this audit-module behavior to exist**. If it doesn't, that's a parallel implementation task; this skill alone doesn't make audit-read safe for non-principals.

## Cross-module touchpoints

The vast majority of work stays in `src/students/`. The exceptions:

| Module | Touchpoint |
|---|---|
| `audit/` | `sensitive-fields.config.ts` (new) and the audit-read strip (new behavior, one place). |
| Response envelope | If the global `ResponseInterceptor` doesn't already support an optional top-level `warnings` array, add it once. After that, every endpoint can produce warnings without changes to the interceptor. |
| Reports (future) | Reports that include student data must call `StudentDto.fromEntity(student, reportingUser)` to get visibility right. The mapper is the single point of truth — don't reach into the entity directly in report assembly. |

Files that explicitly **don't** change: anything under `auth/`, `halaqat/`, `attendance/`, `achievements/`, `plans/`, `sessions/`, the guardian-linking flow inside the students module. Students still flow through these modules by primary key; nothing about the new field affects them.

## Edge cases & precedents this skill sets

- **`id_number` survives soft-delete.** Soft-deleting a student does not clear `id_number`. The unique constraint applies to soft-deleted rows. Restoring is always safe; creating a duplicate while one is soft-deleted is a 409. If a real-world conflict ever occurs, hard-delete the old row.
- **Cross-school is fine.** The same physical child enrolled in two schools = two rows, same `id_number`, different `school_id`. No conflict. This matches the `(email, school_id)` pattern on users.
- **Empty string is not allowed.** Treat `""` as a 400. Use `null` for "not set." This is enforced by the validator's format check (`/^\d{9}$/` rejects empty) but worth being explicit.
- **Setting to `null` via PATCH.** Currently the lock rule is "non-null → other non-null requires force." Setting a previously-set value back to `null` (clearing it) is also a change. Treat it the same — requires `force_id_number_change: true`. Audit it as `student.id_number.force_changed` with `newValues: { id_number: null }`.
- **Bulk import (future).** Will reuse the validator's `normalize` and `validate`. The interface as specified handles this without changes when import lands.

## Test cases this skill expects

Any implementation must pass at minimum:

| Case | Expected |
|---|---|
| Create with valid id_number | 201, persisted normalized, no warnings |
| Create with `300-123-456` | 201, stored as `300123456` |
| Create with `٣٠٠١٢٣٤٥٦` | 201, stored as `300123456` |
| Create with non-9-digit value | 400 |
| Create with valid format, bad checksum | 201 + `warnings: ['id_number.checksum_invalid']` |
| Create with id_number used in same school | 409 |
| Create with id_number used in different school | 201 |
| Create with id_number matching a soft-deleted student in same school | 409 |
| PATCH set id_number where current is null | 200, no flag needed |
| PATCH change id_number without flag | 400 |
| PATCH change id_number with `force_id_number_change: true` | 200, two audit rows (`student.update` + `student.id_number.force_changed`) |
| PATCH clear id_number (set to null) without flag | 400 |
| PATCH clear id_number with flag | 200, force-change audit row written |
| Teacher PATCH including id_number | 400 (forbidNonWhitelisted) |
| Teacher PATCH including force_id_number_change | 400 (forbidNonWhitelisted) |
| Principal `GET /students/:id` | response has `id_number` key (value or null) |
| Teacher `GET /students/:id` | response has NO `id_number` key |
| Parent `GET /me/children/:id` (own child) | response has `id_number` key |
| Teacher `GET /students?id_number=300...` | 400 |
| Teacher `GET /students?q=300123456` | matches name only, no id_number leak |
| Principal `GET /students?q=300123456` | matches both name and id_number |
| Audit-read by principal on force_changed row | sees plaintext old/new |
| Audit-read by VP on force_changed row | id_number stripped from old/new |

## When NOT to use this skill

- Adding ID numbers to **users/guardians** — that's a different decision with potentially different rules (a parent editing their own profile, for instance, might not need an admin-override flag). Open a separate spec.
- School-internal student numbers (`STU-2025-0001`) — different field, different generator, different visibility (typically public within the school). Don't merge them.
- Anything about how the `id_number` is *displayed* on PDFs/exports — those are report/export concerns. They consume `StudentDto.fromEntity`; they don't make new visibility decisions.
- Tightening visibility (e.g., "VP can no longer see id_number") — would touch this skill **and** the audit `sensitive-fields` config (since redaction depends on who's principal-only). Plan it as a coordinated change.

## Reference files

- `references/validator-spec.md` — exact spec for the `IdNumberValidator` interface and the Palestinian implementation, including the checksum algorithm.
- `references/dto-fields.md` — exact field lists per DTO, with copy-pasteable decorators.
- `references/audit-actions.md` — the new `student.id_number.force_changed` action and how it co-exists with `student.update`.
