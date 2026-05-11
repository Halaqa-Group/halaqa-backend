# Audit actions for `id_number`

## Existing actions, expanded

`id_number` flows through `oldValues` and `newValues` of these existing actions like any other field. No new audit-row shape needed.

| Action | When `id_number` appears |
|---|---|
| `student.create` | If set on creation, appears in `newValues`. If validator returned warnings, also `newValues.id_number_warnings: [...]`. |
| `student.update` | If changed (including `null` → value), appears in both `oldValues` and `newValues`. |

## New action

### `student.id_number.force_changed`

Written **in addition to** (not instead of) the regular `student.update` whenever a PATCH overrides the lock. Two rows for one PATCH; correlate by `entity_id` and timestamp.

| Field | Value |
|---|---|
| `action` | `'student.id_number.force_changed'` (exact string) |
| `entity_type` | `'student'` |
| `entity_id` | the student's PK |
| `actor_user_id` | the principal/VP making the change |
| `actor_role` | `'principal'` or `'vice_principal'` |
| `school_id` | student's school |
| `old_values` | `{ "id_number": "<previous value, possibly null>" }` |
| `new_values` | `{ "id_number": "<new value, possibly null>" }` |
| `description` | optional: include `force_id_number_change: true` for clarity |

Trigger conditions — write this row when **all** are true:
1. The request is a PATCH on `/students/:id`.
2. The body contains `id_number`.
3. The current value is non-null (i.e., this is a re-set, not a first-set).
4. The new value differs from the current value.
5. `force_id_number_change: true` was present in the body.

Note clearing to null is also a force-change: if the current value is non-null and the body sets `id_number: null` with the flag, write the row with `newValues: { id_number: null }`.

## Sensitive-fields config (cross-module)

The audit module strips this field from non-principal audit reads:

```ts
// audit/sensitive-fields.config.ts
export const SENSITIVE_AUDIT_FIELDS = ['id_number'] as const;
```

Storage is plaintext; redaction happens at audit-read time. Principal sees full values; VP sees the audit row but with `id_number` removed from `oldValues` and `newValues`.

This means: if you tighten visibility later (e.g., VP can no longer see `id_number` in normal endpoints), the audit redaction is already enforcing the same rule for audit reads. Two coordinated changes:
- Update `StudentDto.fromEntity` so VP no longer gets the field.
- Update the audit-read condition so only principal sees plaintext (currently it's "principal sees plaintext, everyone else stripped" — already correct for that future change).

## Querying audit history for `id_number` changes

Useful queries operators may run during investigations:

```sql
-- All force-changes in the last 30 days
SELECT * FROM audit_logs
WHERE action = 'student.id_number.force_changed'
  AND created_at >= NOW() - INTERVAL 30 DAY
ORDER BY created_at DESC;

-- All students with at least one checksum-invalid warning at write time
SELECT entity_id, created_at, new_values
FROM audit_logs
WHERE action IN ('student.create', 'student.update')
  AND JSON_CONTAINS(JSON_EXTRACT(new_values, '$.id_number_warnings'),
                    '"checksum_invalid"');

-- Audit history for a specific student's id_number changes
SELECT created_at, action, actor_user_id, old_values, new_values
FROM audit_logs
WHERE entity_type = 'student'
  AND entity_id = :studentId
  AND (
    action = 'student.id_number.force_changed'
    OR JSON_EXTRACT(new_values, '$.id_number') IS NOT NULL
    OR JSON_EXTRACT(old_values, '$.id_number') IS NOT NULL
  )
ORDER BY created_at;
```

The third query catches both first-time sets (where only `new_values.id_number` is non-null) and subsequent changes.
