# Business Rules — Halaqat Module

Every service method in this module enforces one or more of these rules.
When writing a service, cite the rule code in a comment so reviewers can
trace the requirement.

---

## BR-HLQ-01 — Multi-tenant isolation

**Rule:** Every query, insert, update, and delete MUST filter by
`school_id` derived from the authenticated user's JWT.

**Why:** Schools share the same database. A leak between schools is the
single most damaging defect this system can have.

**Enforcement:**
- Service methods accept `schoolId` as the first non-context parameter,
  not from a DTO.
- For tables without `school_id` (e.g. `halaqa_teachers`), join through
  `halaqat`: `JOIN halaqat h ON h.id = halaqa_teachers.halaqa_id WHERE h.school_id = ?`.
- A halaqa lookup that returns a halaqa from a different school MUST throw
  `NotFoundException` — never `ForbiddenException`. We don't disclose existence.

**Test:** Create halaqa in school A, call any endpoint as a school B user,
must get 404 — not 403, not 200.

---

## BR-HLQ-02 — (removed)

Teacher schedule conflict prevention was removed along with the
per-halaqa schedule concept. Scheduling now lives only at the school
level in the attendance module; halaqat no longer carry meeting times,
and there is no teacher time-conflict detection.

---

## BR-HLQ-03 — Student type-based multi-enrollment

**Rule:** A student can be actively enrolled in multiple halaqat at the
same time, but only if each halaqa has a different `type`.

**Allowed:** Memorization + Tajweed + Aqeedah simultaneously (3 halaqat).

**Forbidden:** Two Memorization halaqat at the same time.

**Check:** Before enrolling student S in halaqa H of type T, query:

```sql
SELECT COUNT(*)
FROM student_halaqa sh
JOIN halaqat h ON h.id = sh.halaqa_id
WHERE sh.student_id = ?
  AND sh.status = 'active'
  AND h.type = ?
  AND h.school_id = ?
```

If the count is non-zero, throw `ConflictException`.

**Error:** `ConflictException("Student already enrolled in another '<type>' halaqa.")`

---

## BR-HLQ-04 — At most one active main teacher per halaqa

**Rule:** A halaqa can have at most one active row with `role = 'main'`.

**Enforcement:** Database-level via the generated column `primary_lock`.
The unique index `idx_one_main_per_halaqa` will reject inserts/updates
that would create a second active main row.

**At creation:** the main teacher is **optional** (BR-HLQ-07).
A halaqa may exist with zero main teachers.

**Service responsibility:** when assigning a teacher with `role='main'`,
the DB will fail if another active main row already exists for that
halaqa. Surface that as `ConflictException`.

---

## BR-HLQ-05 — At most one active acting per halaqa

**Rule:** A halaqa can have at most one active row with `acting_as_primary = 1`.

**Enforcement:** Database-level via the generated column `acting_lock`.

**Service responsibility:** before activating acting on assignment row R,
check if any other active assignment in the same halaqa has
`acting_as_primary = 1` and end it first or refuse the operation.

---

## BR-HLQ-06 — Substitute role must always be acting

**Rule:** An active row (`end_date IS NULL`) with `role = 'substitute'`
MUST have `acting_as_primary = 1`. A substitute teacher exists *only* to
cover for an absent primary; they cannot exist in the active state
without an acting period in effect.

**Enforcement:**

1. **DB-level CHECK constraint** `chk_substitute_must_act`:

   ```sql
   CHECK (NOT (role = 'substitute' AND acting_as_primary = 0 AND end_date IS NULL))
   ```

2. **Application-level validation** in the teacher-assignment service —
   provides clearer error messages before reaching the DB.

**Implications across the lifecycle:**

| Event | What the service does |
|---|---|
| Add a substitute (regular assignment endpoint) | Reject — substitutes can only be created via the acting endpoint, which sets `acting_as_primary=1` simultaneously |
| End a substitute's acting (cron, `acting_ends_at < today`) | Close the row entirely (`end_date = today`, `end_reason = 'other'`). Do NOT set `acting_as_primary = 0` while the row is still active — the CHECK would reject it. |
| Manually end a substitute's acting (DELETE acting endpoint) | Same as above: close the row. The substitute's existence is bound to the acting period. |
| Convert a substitute to a permanent staff member | Close the substitute row and create a new row with `role='assistant'` (or `'main'` if applicable). Don't UPDATE the role in place. |

**Compare to `assistant`:** when an assistant has acting and the acting
ends, the row's `acting_as_primary` flag goes back to 0 and the assignment
continues as a regular assistant. Substitutes don't have this fallback.

---

## BR-HLQ-07 — Primary teacher is optional at halaqa creation

**Rule:** A halaqa may be created without specifying a primary teacher.
The primary can be assigned later.

**Why:** schools sometimes plan halaqat ahead of staffing.

**Companion rule:** BR-HLQ-11 — the system warns about halaqat without an
effective primary for too long.

---

## BR-HLQ-08 — (removed)

The "acting bypasses schedule conflict check" rule was removed along with
schedule conflict detection. There is no per-halaqa schedule and no
teacher time-conflict check, so nothing needs to be bypassed.

---

## BR-HLQ-09 — Original main stays main during acting

**Rule:** When acting is activated for halaqa H, the original main
teacher's `role = 'main'` row is **not** modified. They remain the main.

**Why:** acting is a temporary cover, not a transfer of authority.
When the acting period ends, the original main's permissions restore
without any data change.

**Implication:** during an active acting period, halaqa H may have:
- One row with `role = 'main'` (the absent original main)
- One row with `acting_as_primary = 1` (the substitute teacher who is
  covering — `role` is either `'assistant'` or `'substitute'`)

**Effective primary** for permission checks is the union:
`role = 'main' OR acting_as_primary = 1` on rows with `end_date IS NULL`.

---

## BR-HLQ-10 — Cannot delete a halaqa with active students

**Rule:** Attempting to archive/soft-delete a halaqa that has any
`student_halaqa` row with `status = 'active'` fails.

**Resolution path:** the user must first transfer or remove the active
students; only then can the halaqa be archived.

**Error:** `ConflictException("Cannot archive halaqa: it has <N> active student(s). Transfer or remove them first.")`

**Behavior on archive of a halaqa with no active students** (i.e. all
students are already in `transferred` / `completed`):
1. Halaqa: `status = 'archived'`, `deleted_at = NOW()`.
2. All `halaqa_teachers` with `end_date IS NULL` get
   `end_date = today`, `end_reason = 'other'`,
   `notes = 'Halaqa archived on YYYY-MM-DD'`.
3. `halaqa_activity_logs.action = 'halaqa_archived'`.

See `references/08-halaqa-archival-flow.md` for the full transactional flow.

---

## BR-HLQ-11 — Warn about halaqat without an effective primary

**Rule:** A daily cron job flags any halaqa where:
- `status = 'active'`, `deleted_at IS NULL`, AND
- No `halaqa_teachers` row with `end_date IS NULL` AND
  (`role = 'main'` OR `acting_as_primary = 1`)
- For longer than **7 days**.

**Action:** **warning only.** Notify principal/vice-principal. Do not
auto-archive, auto-pause, or otherwise change halaqa state.

**Detection of "longer than 7 days":** look at the most recent
`halaqa_activity_logs` row with `action = 'teacher_unassigned'` (or
`acting_ended`) for that halaqa, OR if none, the halaqa's `created_at`.

---

## BR-HLQ-12 — Student re-enrollment uses UPDATE, not INSERT

**Rule:** When a student returns to a halaqa they were previously in
(`status` was `transferred` / `completed` / `archived`), the existing row
in `student_halaqa` is updated back to `status = 'active'` with a fresh
`enrollment_date`. A new row is **not** inserted.

**Why:** the composite PK `(student_id, halaqa_id)` makes inserting a
duplicate impossible. The history is preserved in `halaqa_activity_logs`
with `action = 'student_re_enrolled'` and the previous status in
`metadata`.

**Service flow:**
```
existing = SELECT * FROM student_halaqa WHERE student_id=? AND halaqa_id=?
if existing is null:
    INSERT student_halaqa (..., status='active')
    log action='student_enrolled'
elif existing.status == 'active':
    throw ConflictException("Student already enrolled in this halaqa.")
else:
    UPDATE student_halaqa SET status='active', enrollment_date=today
    log action='student_re_enrolled', metadata={ previous_status, previous_date }
```

---

## State transitions reference

### `halaqat.status`
```
       ┌─────────────┐
       │             ▼
[active] ─────→ [archived]
   │     ←──────────┘  (restore)
   │
   └────→ [completed] ─────→ [archived]
```

| From | To | Action | Allowed by |
|---|---|---|---|
| `active` | `completed` | Complete | Principal/Vice |
| `active` | `archived` | Archive (soft delete) | Principal/Vice |
| `archived` | `active` | Restore | Principal/Vice |
| `completed` | `archived` | Archive after completion | Principal/Vice |
| `completed` | `active` | ❌ not allowed |  |
| `archived` | `completed` | ❌ not allowed |  |

### `student_halaqa.status`
```
[active] ───→ [transferred]   (via transfer-student)
[active] ───→ [completed]     (student finished the halaqa)
[active] ───→ [archived]      (the halaqa was archived; not student-driven)
[any]    ───→ [active]        (re-enrollment, see BR-HLQ-12)
```

### `halaqa_teachers` — assignment lifecycle
```
[active]  (end_date IS NULL)
   │
   └──── set end_date + end_reason ────→ [ended]   (cannot be reactivated; create a new row instead)
```

### Acting on a teacher row
```
acting_as_primary=0 ───── activate ─────→ acting_as_primary=1 (with acting_starts_at, acting_ends_at)
                                                   │
                                                   ├── extend acting_ends_at
                                                   │
                                                   └─ daily cron, acting_ends_at < today ─→
                                                       if role IN ('main','assistant'):
                                                         acting_as_primary = 0
                                                         acting_starts_at  = NULL
                                                         acting_ends_at    = NULL
                                                       if role = 'substitute':
                                                         end_date    = today
                                                         end_reason  = 'other'
                                                         (acting flags cleared too)
```

---

## Permission rules quick-reference

The full matrix is in `references/04-permissions-matrix.md`. The most
commonly-checked rules:

| Operation | Who |
|---|---|
| Update halaqa `name` / `evaluation_settings` | Principal, Vice, Supervisor of halaqa, Active teacher of halaqa |
| Update halaqa `type` | Principal, Vice |
| Update halaqa `status` (archive/complete) | Principal, Vice |
| Assign / remove teachers | Principal, Vice |
| Activate / end acting | Principal, Vice, Supervisor of halaqa |
| Enroll / transfer / remove students | Principal, Vice, Supervisor of halaqa |

"Active teacher of halaqa" = any row in `halaqa_teachers` for this
(`user_id`, `halaqa_id`) with `end_date IS NULL`. This covers `main`,
`assistant`, and `substitute` (the substitute is by definition acting,
which gives them the same edit rights as the main).

"Effective primary" (used internally in the codebase, e.g. for tagging
who is currently running the halaqa in dashboards and reports) =
`role = 'main' OR acting_as_primary = 1`, with `end_date IS NULL`.

"Supervisor of halaqa" = row exists in `supervisor_halaqat` for
(`user_id`, `halaqa_id`).
