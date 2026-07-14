# API Endpoints — Halaqat Module

All endpoints live under `/api/v1/`. Every endpoint:

- Requires JWT authentication (handled by the global auth guard).
- Filters by `school_id` from the JWT — no `school_id` ever appears in
  request bodies or query params (BR-HLQ-01).
- Uses `snake_case` for query params, request bodies, and response fields
  (matching the `students` module convention — see api-envelopes skill).
- Returns the `{ code, data }` envelope automatically via `ResponseInterceptor`.
- Throws NestJS exceptions for errors; `HttpExceptionFilter` formats them.

Permission codes used below are defined in `04-permissions-matrix.md`.

---

## 1. Halaqat CRUD

### `POST /api/v1/halaqat`
Create a new halaqa.

**Permission:** `principal`, `vice_principal`

**Request body:**
```json
{
  "name": "حلقة الفجر للحفظ",
  "type": "Memorization",
  "evaluation_settings": null,
  "primary_teacher_user_id": 12
}
```

**Body fields:**
- `name` (string, required, 1–100 chars)
- `type` (enum, required: `Memorization` | `Tajweed` | `Aqeedah`)
- `evaluation_settings` (json, optional, nullable)
- `primary_teacher_user_id` (int, optional) — if provided, creates an
  active assignment with `role='main'`. Per BR-HLQ-07, this is optional.

**Response (201):**
```json
{
  "code": 201,
  "data": {
    "id": 17,
    "school_id": 1,
    "name": "حلقة الفجر للحفظ",
    "type": "Memorization",
    "evaluation_settings": null,
    "status": "active",
    "created_at": "2026-05-08T05:00:00.000Z"
  }
}
```

**Errors:**
- `400` — malformed `evaluation_settings`, etc.
- `404` — `primary_teacher_user_id` not found in this school or not a teacher

---

### `GET /api/v1/halaqat`
List halaqat with pagination.

**Permission:** all authenticated users (results are scoped per role —
see `04-permissions-matrix.md`).

**Query params:**
- `page` (int, default 1, min 1)
- `limit` (int, default 20, min 1, max 100)
- `type` (enum filter, optional)
- `status` (enum filter, optional: `active` | `archived` | `completed`)
- `supervisor_user_id` (int, optional)
- `teacher_user_id` (int, optional) — returns halaqat where this teacher
  has an active assignment
- `search` (string, optional) — substring match on `name`

**Response (200):**
```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "id": 17,
        "school_id": 1,
        "name": "حلقة الفجر للحفظ",
        "type": "Memorization",
        "status": "active",
        "primary_teacher": {
          "user_id": 12,
          "name": "أحمد المعلم",
          "is_acting": false
        },
        "students_count": 8,
        "created_at": "2026-05-08T05:00:00.000Z"
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 20
  }
}
```

**Notes:**
- `primary_teacher` reflects the **effective** primary: the row with
  `role='main' OR acting_as_primary=1`, `end_date IS NULL`. If acting is
  active, the acting teacher is shown with `is_acting: true`. If neither
  exists, this field is `null`.
- `students_count` counts `student_halaqa` rows with `status='active'`.

**Role-based scoping:**
- `principal`, `vice_principal` → all halaqat in the school.
- `supervisor` → only halaqat where they appear in `supervisor_halaqat`.
- `teacher` → only halaqat where they have an active `halaqa_teachers` row.
- `parent` → no access (returns 403).

---

### `GET /api/v1/halaqat/:id`
Get a single halaqa with detailed info.

**Permission:** any authenticated user with access to this halaqa
(see scoping above).

**Response (200):**
```json
{
  "code": 200,
  "data": {
    "id": 17,
    "school_id": 1,
    "name": "حلقة الفجر للحفظ",
    "type": "Memorization",
    "evaluation_settings": null,
    "status": "active",
    "teachers": [
      {
        "id": 55,
        "teacher_user_id": 12,
        "teacher_name": "أحمد المعلم",
        "role": "main",
        "acting_as_primary": false,
        "acting_starts_at": null,
        "acting_ends_at": null,
        "start_date": "2026-01-01",
        "end_date": null
      }
    ],
    "supervisors": [
      { "user_id": 5, "name": "محمد المشرف", "assigned_at": "2026-01-01T08:00:00.000Z" }
    ],
    "students_count": 8,
    "created_at": "2026-05-08T05:00:00.000Z",
    "updated_at": "2026-05-08T05:00:00.000Z"
  }
}
```

**Errors:**
- `404` — not found, or in a different school, or user has no access
  (we don't disclose which — BR-HLQ-01).

---

### `PATCH /api/v1/halaqat/:id`
Update halaqa fields.

**Permission:** depends on which fields are being updated:

| Field | Allowed roles |
|---|---|
| `name` | `principal`, `vice_principal`, supervisor of halaqa, active teacher of halaqa |
| `evaluation_settings` | same as `name` |
| `type` | `principal`, `vice_principal` only |
| `status` | NOT updatable here — use `/archive`, `/complete`, `/restore` |

**Request body** (any subset):
```json
{
  "name": "حلقة الفجر للحفظ - متقدم",
  "type": "Memorization",
  "evaluation_settings": { "weights": { "mistake": 1.0 } }
}
```

**Response (200):** same shape as `GET /halaqat/:id`.

**Errors:**
- `403` — caller is allowed to edit some fields but not the ones in the body.
- `409` — changing `type` while the halaqa has active students of a
  conflicting type (would violate BR-HLQ-03 retroactively).

---

### `POST /api/v1/halaqat/:id/archive`
Archive a halaqa (soft delete).

**Permission:** `principal`, `vice_principal`

**Request body:** empty.

**Behavior:** see `08-halaqa-archival-flow.md`. Sets `status='archived'`,
`deleted_at=NOW()`, ends all active teacher assignments, and updates
active student enrollments to `status='archived'`. Refuses if any student
is `status='active'` (BR-HLQ-10).

**Response (200):**
```json
{ "code": 200, "message": "Halaqa archived." }
```

**Errors:**
- `409 HLQ_HAS_ACTIVE_STUDENTS` — has active students. Message includes count.

---

### `POST /api/v1/halaqat/:id/complete`
Mark a halaqa as completed (finished its mission).

**Permission:** `principal`, `vice_principal`

**Request body:** empty.

**Behavior:** sets `status='completed'`. End all active teacher
assignments (`end_date=today`, `end_reason='other'`, `notes='Halaqa completed on YYYY-MM-DD'`).
Updates active student enrollments to `status='completed'`.

**Response (200):**
```json
{ "code": 200, "message": "Halaqa marked as completed." }
```

---

### `POST /api/v1/halaqat/:id/restore`
Restore an archived halaqa.

**Permission:** `principal`, `vice_principal`

**Request body:** empty.

**Behavior:** sets `status='active'`, `deleted_at=NULL`. Does NOT restore
teacher assignments or student enrollments — those are left as the user
must re-assign explicitly. Logs `action='halaqa_restored'`.

**Response (200):**
```json
{ "code": 200, "message": "Halaqa restored." }
```

**Errors:**
- `409` — halaqa is already `active` (no-op).
- `404` — halaqa is not archived (only `archived` rows can be restored).

---

## 2. Teacher Assignments

### `POST /api/v1/halaqat/:id/teachers`
Assign a teacher to a halaqa.

**Permission:** `principal`, `vice_principal`

**Request body:**
```json
{
  "teacher_user_id": 12,
  "role": "main",
  "start_date": "2026-05-08",
  "notes": "Replacing the previous main teacher"
}
```

**Body fields:**
- `teacher_user_id` (int, required) — must be a user in the same school
  with the `teacher` role (BR-USR-02).
- `role` (enum, required: `main` | `assistant`).
  Note: `substitute` is **not** allowed via this endpoint — substitutes
  exist only as part of an acting activation (BR-HLQ-06). Use the acting
  endpoint to create a substitute.
- `start_date` (date, required, `<= today`)
- `notes` (string, optional, ≤255 chars)

**Behavior:**
1. Verify teacher exists in the school and has `teacher` role.
2. Reject if `role='substitute'` (must go through the acting endpoint).
3. Insert the row. The DB-level unique constraints enforce BR-HLQ-04
   (one active main per halaqa) and BR-HLQ-05 / no duplicate active
   assignment.
4. Log `action='teacher_assigned'`.

**Response (201):**
```json
{
  "code": 201,
  "data": {
    "id": 56,
    "halaqa_id": 17,
    "teacher_user_id": 12,
    "role": "main",
    "acting_as_primary": false,
    "start_date": "2026-05-08",
    "end_date": null
  }
}
```

**Errors:**
- `404` — teacher not found in this school.
- `400` — teacher does not have the `teacher` role.
- `400` — `role='substitute'` (use acting endpoint).
- `409` — DB-level: would create a second active main, or duplicate
  active assignment.

---

### `GET /api/v1/halaqat/:id/teachers`
List teacher assignments for a halaqa.

**Permission:** any user with access to the halaqa.

**Query params:**
- `active_only` (bool, default `true`) — when `true`, only rows with
  `end_date IS NULL`. When `false`, include the full history.

**Response (200):**
```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "id": 55,
        "teacher_user_id": 12,
        "teacher_name": "أحمد المعلم",
        "role": "main",
        "acting_as_primary": false,
        "acting_starts_at": null,
        "acting_ends_at": null,
        "start_date": "2026-01-01",
        "end_date": null,
        "end_reason": null
      }
    ]
  }
}
```

Note: this list endpoint does **not** paginate — a halaqa rarely has more
than a handful of teacher assignments active at once. Historical view
(`active_only=false`) can grow over years; if a halaqa exceeds 100 historical
assignments, add pagination later.

---

### `PATCH /api/v1/halaqat/:id/teachers/:assignment_id`
Modify an active assignment (change `role`, `notes`).

**Permission:** `principal`, `vice_principal`

**Request body** (any subset):
```json
{
  "role": "assistant",
  "notes": "Stepping down to assistant role"
}
```

**Behavior:**
- Only `role` and `notes` are editable. Other fields require ending the
  assignment and creating a new one.
- `role` can be changed between `main` and `assistant` only. Switching to
  `substitute` (or away from it) is not allowed via this endpoint —
  substitutes have a strict lifecycle bound to acting (BR-HLQ-06).
- Setting `role='main'` triggers the DB unique constraint on
  `idx_one_main_per_halaqa` — fails if another active main exists.
- Logs `action='teacher_role_changed'` if `role` changed.

**Response (200):** the updated assignment row, same shape as POST.

---

### `DELETE /api/v1/halaqat/:id/teachers/:assignment_id`
End a teacher assignment.

**Permission:** `principal`, `vice_principal`

**Request body:**
```json
{
  "end_date": "2026-05-15",
  "end_reason": "vacation",
  "notes": "On Hajj leave"
}
```

**Body fields:**
- `end_date` (date, required, `>= start_date`, `<= today + 30 days`)
- `end_reason` (enum, required: `reassigned` | `left_school` | `vacation` | `retired` | `other`)
- `notes` (string, optional, ≤255 chars)

**Behavior:** sets `end_date` and `end_reason`. The row is now historical;
no further updates are allowed. Logs `action='teacher_unassigned'`.

**Response (200):**
```json
{ "code": 200, "message": "Teacher assignment ended." }
```

**Errors:**
- `409` — assignment is already ended.
- `400` — `end_date < start_date`.

---

## 3. Acting Primary

See `06-acting-teacher-flow.md` for the full workflow. There are two
ways to put a halaqa under acting coverage:

- **Workflow A** — the acting teacher is already on the halaqa as an
  assistant. Use `POST /halaqat/:id/teachers/:assignment_id/acting`
  to flip on the acting flags on the existing assignment row.
- **Workflow B** — the acting teacher is brand new to the halaqa, brought
  in specifically as a substitute. Use
  `POST /halaqat/:id/teachers/acting-substitute` to create the substitute
  row with acting flags atomically.

### `POST /api/v1/halaqat/:id/teachers/:assignment_id/acting`
Activate acting on an existing assignment (Workflow A).

**Permission:** `principal`, `vice_principal`, supervisor of halaqa.

**Request body:**
```json
{
  "acting_starts_at": "2026-05-10",
  "acting_ends_at": "2026-05-20",
  "notes": "Covering for sister halaqa during main's absence"
}
```

**Body fields:**
- `acting_starts_at` (date, required, `>= today`) — when acting takes effect.
  If `today`, set `acting_as_primary=1` immediately. If future, leave
  `acting_as_primary=0` and let the daily cron flip it (see flow doc).
- `acting_ends_at` (date, required, `>= acting_starts_at`).
- `notes` (string, optional).

**Behavior:**
- Reject if the assignment row's `role` is `'substitute'` — substitutes
  cannot be re-activated; they are created with acting from day one and
  closed when their acting ends. Use a new acting-substitute call instead.
- Original main's `role='main'` row stays untouched (BR-HLQ-09).
- DB unique constraint `acting_lock` ensures only one active acting per
  halaqa (BR-HLQ-05).

**Response (201):**
```json
{
  "code": 201,
  "data": {
    "id": 56,
    "acting_as_primary": true,
    "acting_starts_at": "2026-05-10",
    "acting_ends_at": "2026-05-20"
  }
}
```

**Errors:**
- `400` — assignment row has `role='substitute'` (use acting-substitute endpoint)
- `404` — assignment not found / different school
- `409` — DB acting_lock fail: another acting is already active on this halaqa

---

### `POST /api/v1/halaqat/:id/teachers/acting-substitute`
Create a substitute teacher row with acting activated atomically (Workflow B).

**Permission:** `principal`, `vice_principal`, supervisor of halaqa.

**Request body:**
```json
{
  "teacher_user_id": 18,
  "acting_starts_at": "2026-05-10",
  "acting_ends_at": "2026-05-20",
  "notes": "Substitute for A's annual leave"
}
```

**Body fields:**
- `teacher_user_id` (int, required) — must be a user in the same school
  with the `teacher` role and not already actively assigned to this halaqa.
- `acting_starts_at` (date, required, `<= today`) — substitutes cannot be
  future-dated; the row is created with `acting_as_primary=1` immediately
  (CHECK constraint forbids non-acting active substitute).
- `acting_ends_at` (date, required, `>= acting_starts_at`).
- `notes` (string, optional, ≤255 chars).

**Behavior:**
- Verify teacher exists in this school and has the `teacher` role.
- Verify teacher is not already actively assigned to this halaqa
  (otherwise this should go through Workflow A).
- INSERT halaqa_teachers row:
  `role='substitute'`, `acting_as_primary=1`,
  `acting_starts_at`, `acting_ends_at`, `start_date=today`,
  `end_date=NULL`, `assigned_by=current admin`.
- DB CHECK `chk_substitute_must_act` is satisfied (acting_as_primary=1).
- DB unique constraint `acting_lock` ensures only one active acting per
  halaqa (BR-HLQ-05).

**Response (201):**
```json
{
  "code": 201,
  "data": {
    "id": 78,
    "halaqa_id": 17,
    "teacher_user_id": 18,
    "role": "substitute",
    "acting_as_primary": true,
    "acting_starts_at": "2026-05-10",
    "acting_ends_at": "2026-05-20",
    "start_date": "2026-05-10",
    "end_date": null
  }
}
```

**Errors:**
- `400` — teacher does not have the `teacher` role
- `400` — `acting_starts_at` is in the future
- `404` — teacher not found in this school
- `409` — teacher is already actively assigned to this halaqa
- `409` — DB acting_lock fail: another acting is already active

---

### `PATCH /api/v1/halaqat/:id/teachers/:assignment_id/acting`
Extend or shorten an active acting period.

**Permission:** same as POST.

**Request body:**
```json
{ "acting_ends_at": "2026-05-30" }
```

**Behavior:** updates `acting_ends_at` only. `acting_starts_at` is immutable
once set. Logs `action='acting_extended'`.

---

### `DELETE /api/v1/halaqat/:id/teachers/:assignment_id/acting`
End acting manually (before `acting_ends_at`).

**Permission:** same as POST.

**Behavior:** sets `acting_as_primary=0`, `acting_starts_at=NULL`,
`acting_ends_at=NULL`. The teacher's regular assignment row is otherwise
unchanged. Logs `action='acting_ended'`.

**Response (200):**
```json
{ "code": 200, "message": "Acting period ended." }
```

---

## 4. Supervisors

### `POST /api/v1/halaqat/:id/supervisors`
Assign a supervisor to a halaqa.

**Permission:** `principal`, `vice_principal`

**Request body:**
```json
{ "supervisor_user_id": 5 }
```

**Behavior:** verify the user has the `supervisor` role and is in the
same school. Insert into `supervisor_halaqat`. Logs
`action='supervisor_assigned'`.

**Response (201):**
```json
{
  "code": 201,
  "data": {
    "supervisor_user_id": 5,
    "halaqa_id": 17,
    "assigned_at": "2026-05-08T05:00:00.000Z"
  }
}
```

**Errors:**
- `409` — supervisor is already assigned to this halaqa.
- `400` — user does not have the `supervisor` role.

---

### `DELETE /api/v1/halaqat/:id/supervisors/:user_id`
Remove a supervisor from a halaqa.

**Permission:** `principal`, `vice_principal`

**Behavior:** delete row from `supervisor_halaqat`. (No soft delete here —
the activity log preserves the record.) Logs
`action='supervisor_unassigned'`.

**Response (200):**
```json
{ "code": 200, "message": "Supervisor removed." }
```

---

## 5. Student Enrollment

See `07-student-transfer-flow.md` for the full transfer flow.

### `POST /api/v1/halaqat/:id/students`
Enroll a student in a halaqa.

**Permission:** `principal`, `vice_principal`, supervisor of halaqa.

**Request body:**
```json
{
  "student_id": 42,
  "enrollment_date": "2026-05-08"
}
```

**Body fields:**
- `student_id` (int, required) — must be in the same school.
- `enrollment_date` (date, optional, default today).

**Behavior:**
1. Verify student exists in this school and `students.status='active'`.
2. Check BR-HLQ-03 — student must not be `active` in another halaqa of
   the same `type`.
3. Look up existing `student_halaqa` row by `(student_id, halaqa_id)`:
   - If none → INSERT, log `action='student_enrolled'`.
   - If `status='active'` → 409 ConflictException.
   - If `status` is anything else (transferred/completed/archived) →
     UPDATE the row to `status='active'`, set new `enrollment_date`.
     Log `action='student_re_enrolled'` with the previous status in
     `metadata` (BR-HLQ-12).

**Response (201):**
```json
{
  "code": 201,
  "data": {
    "student_id": 42,
    "halaqa_id": 17,
    "enrollment_date": "2026-05-08",
    "status": "active"
  }
}
```

**Errors:**
- `409` — student already enrolled in another `Memorization` halaqa.
- `409` — student already actively enrolled in this halaqa.
- `404` — student not found / different school / inactive.

---

### `GET /api/v1/halaqat/:id/students`
List students in a halaqa.

**Permission:** any user with access to the halaqa.

**Query params:**
- `status` (enum filter, optional). Default: `active`.
- `page`, `limit` (standard pagination).

**Response (200):**
```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "student_id": 42,
        "student_name": "عبدالله الطالب",
        "enrollment_date": "2026-05-08",
        "status": "active"
      }
    ],
    "total": 8,
    "page": 1,
    "limit": 20
  }
}
```

---

### `DELETE /api/v1/halaqat/:id/students/:student_id`
Remove a student from a halaqa.

**Permission:** `principal`, `vice_principal`, supervisor of halaqa.

**Request body:**
```json
{
  "outcome": "completed",
  "notes": "Finished the assigned juz"
}
```

**Body fields:**
- `outcome` (enum, required: `completed` | `unenrolled`) — determines the
  resulting `status` on `student_halaqa`. `completed` sets `status='completed'`;
  `unenrolled` is the catch-all for "no longer in this halaqa, not transferred,
  not finished" (e.g. dropped out, parent decision) — also sets
  `status='completed'` (we use the same column, distinguished by the
  activity log action).
- `notes` (string, optional).

**Behavior:** updates the row's `status`. Logs
`action='student_completed'` or `action='student_unenrolled'`.

**Response (200):**
```json
{ "code": 200, "message": "Student removed from halaqa." }
```

---

### `POST /api/v1/halaqat/students/transfer`
Transfer a student between halaqat in one transactional operation.

**Permission:** `principal`, `vice_principal`, supervisor of EITHER the
source halaqa OR the destination halaqa (whichever is more permissive
the caller has). See `07-student-transfer-flow.md` for the rule details.

**Request body:**
```json
{
  "student_id": 42,
  "from_halaqa_id": 17,
  "to_halaqa_id": 19,
  "transfer_date": "2026-05-10",
  "reason": "Student moved to advanced level"
}
```

**Body fields:**
- `student_id` (int, required)
- `from_halaqa_id` (int, required) — student must be `active` here.
- `to_halaqa_id` (int, required) — different from `from_halaqa_id`,
  same school, `status='active'`.
- `transfer_date` (date, optional, default today).
- `reason` (string, required, ≤255 chars).

**Behavior:** see `07-student-transfer-flow.md` for the full algorithm.
In one transaction:
1. UPDATE `student_halaqa` (from row): `status='transferred'`.
2. UPSERT `student_halaqa` (to row): `status='active'` (BR-HLQ-12 logic).
3. Check BR-HLQ-03 against `to_halaqa.type` (excluding the from row,
   which is now `transferred`).
4. Log two actions: `student_transferred_out` on `from_halaqa_id`,
   `student_transferred_in` on `to_halaqa_id`. Include `reason` in metadata.

**Response (200):**
```json
{
  "code": 200,
  "data": {
    "student_id": 42,
    "from_halaqa_id": 17,
    "to_halaqa_id": 19,
    "transfer_date": "2026-05-10"
  }
}
```

**Errors:**
- `404` — student not active in `from_halaqa_id`.
- `409` — destination would violate BR-HLQ-03 (same-type conflict).
- `400` — `from_halaqa_id == to_halaqa_id`.

---

## 6. Helpers / Reverse-lookup queries

### `GET /api/v1/teachers/:user_id/halaqat`
List halaqat where this user has assignments (active by default).

**Permission:** the teacher themselves, OR principal/vice/supervisor (with
the usual scoping).

**Query params:**
- `active_only` (bool, default `true`)
- `page`, `limit`

**Response (200):**
```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "halaqa_id": 17,
        "halaqa_name": "حلقة الفجر للحفظ",
        "halaqa_type": "Memorization",
        "halaqa_status": "active",
        "role": "main",
        "acting_as_primary": false,
        "start_date": "2026-01-01",
        "end_date": null
      }
    ],
    "total": 3,
    "page": 1,
    "limit": 20
  }
}
```

---

### `GET /api/v1/students/:student_id/halaqat`
List halaqat where this student is or has been enrolled.

**Permission:** principal/vice/supervisor (with scoping), the student's
parents, or the student's current teachers.

**Query params:**
- `status` (enum filter, optional). Default: `active`.
- `page`, `limit`

**Response (200):**
```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "halaqa_id": 17,
        "halaqa_name": "حلقة الفجر للحفظ",
        "halaqa_type": "Memorization",
        "enrollment_date": "2026-05-08",
        "status": "active"
      }
    ],
    "total": 2,
    "page": 1,
    "limit": 20
  }
}
```

---

### `GET /api/v1/supervisors/:user_id/halaqat`
List halaqat this user supervises.

**Permission:** the supervisor themselves, OR principal/vice.

**Response (200):**
```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "halaqa_id": 17,
        "halaqa_name": "حلقة الفجر للحفظ",
        "halaqa_type": "Memorization",
        "halaqa_status": "active",
        "assigned_at": "2026-01-01T08:00:00.000Z"
      }
    ],
    "total": 5,
    "page": 1,
    "limit": 20
  }
}
```

---

## 7. Activity log

### `GET /api/v1/halaqat/:id/activity`
Domain-specific audit trail for this halaqa.

**Permission:** `principal`, `vice_principal`, supervisor of halaqa.

**Query params:**
- `action` (enum filter, optional)
- `from_date` (date, optional)
- `to_date` (date, optional)
- `page`, `limit`

**Response (200):**
```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "id": 1024,
        "action": "student_transferred_in",
        "actor_user_id": 5,
        "actor_name": "محمد المشرف",
        "target_student_id": 42,
        "target_student_name": "عبدالله الطالب",
        "from_halaqa_id": 19,
        "to_halaqa_id": 17,
        "metadata": { "reason": "Student moved to advanced level" },
        "notes": null,
        "created_at": "2026-05-10T08:30:00.000Z"
      }
    ],
    "total": 47,
    "page": 1,
    "limit": 20
  }
}
```

---

## Endpoint summary table

| # | Method | Path | Permission |
|---|---|---|---|
| 1 | POST | `/halaqat` | principal, vice |
| 2 | GET | `/halaqat` | all (scoped) |
| 3 | GET | `/halaqat/:id` | scoped |
| 4 | PATCH | `/halaqat/:id` | varies by field |
| 5 | POST | `/halaqat/:id/archive` | principal, vice |
| 6 | POST | `/halaqat/:id/complete` | principal, vice |
| 7 | POST | `/halaqat/:id/restore` | principal, vice |
| 8 | POST | `/halaqat/:id/teachers` | principal, vice |
| 9 | GET | `/halaqat/:id/teachers` | scoped |
| 10 | PATCH | `/halaqat/:id/teachers/:aid` | principal, vice |
| 11 | DELETE | `/halaqat/:id/teachers/:aid` | principal, vice |
| 12 | POST | `/halaqat/:id/teachers/:aid/acting` | principal, vice, supervisor |
| 13 | POST | `/halaqat/:id/teachers/acting-substitute` | principal, vice, supervisor |
| 14 | PATCH | `/halaqat/:id/teachers/:aid/acting` | principal, vice, supervisor |
| 15 | DELETE | `/halaqat/:id/teachers/:aid/acting` | principal, vice, supervisor |
| 16 | POST | `/halaqat/:id/supervisors` | principal, vice |
| 17 | DELETE | `/halaqat/:id/supervisors/:uid` | principal, vice |
| 18 | POST | `/halaqat/:id/students` | principal, vice, supervisor |
| 19 | GET | `/halaqat/:id/students` | scoped |
| 20 | DELETE | `/halaqat/:id/students/:sid` | principal, vice, supervisor |
| 21 | POST | `/halaqat/students/transfer` | principal, vice, supervisor (of either side) |
| 22 | GET | `/teachers/:uid/halaqat` | scoped |
| 23 | GET | `/students/:sid/halaqat` | scoped |
| 24 | GET | `/supervisors/:uid/halaqat` | scoped |
| 25 | GET | `/halaqat/:id/activity` | principal, vice, supervisor |

25 endpoints across 4 controllers (the activity-log endpoint can live on
the main `halaqat.controller.ts`).
