# Audit action shapes

All audit rows go to the `audit_logs` table via `AuditService.log()`. The shapes below show what each action writes.

## Achievements

### `achievement.create`

Written on every `POST /achievements`. If the request bundles `approve: true`, this row is **still written**, and a separate `achievement.approve` row is written too — two rows per bundled call.

```json
{
  "action": "achievement.create",
  "entity_type": "achievement",
  "entity_id": <new_id>,
  "actor_user_id": <caller>,
  "actor_role": "<caller's role>",
  "school_id": <school>,
  "new_values": {
    "student_id": 17, "halaqa_id": 3, "date": "2026-05-12",
    "track_type": "Hifz",
    "start_surah": 2, "start_verse": 1, "end_surah": 2, "end_verse": 20,
    "mistakes_count": 2, "warnings_count": 1, "tajweed_errors_count": 0,
    "percentage_score": 95.00,
    "status": "unapproved"
  },
  "description": "created against attendance row #<id>"
}
```

The `description` field carries the attendance row id used for the gate-check. Defensive logging; helps later forensics if attendance gets edited.

### `achievement.update`

Only valid when the achievement is `unapproved`. Includes only changed fields in `old_values` and `new_values`.

```json
{
  "action": "achievement.update",
  "entity_type": "achievement",
  "entity_id": <id>,
  "old_values": { "mistakes_count": 2, "percentage_score": 95.00 },
  "new_values": { "mistakes_count": 3, "percentage_score": 93.00 }
}
```

### `achievement.approve`

Written for both the dedicated endpoint and the bundled `approve: true` flow.

```json
{
  "action": "achievement.approve",
  "entity_type": "achievement",
  "entity_id": <id>,
  "new_values": {
    "status": "approved",
    "approved_by": <caller>,
    "approved_at": "<iso timestamp>"
  }
}
```

### `achievement.unapprove`

Includes the prior approver in `old_values`, so the audit captures who was the latest approver before revocation. The row data preserves `approved_by`/`approved_at` per Q1a; the audit shows the transition.

```json
{
  "action": "achievement.unapprove",
  "entity_type": "achievement",
  "entity_id": <id>,
  "old_values": {
    "status": "approved",
    "approved_by": <previous approver>,
    "approved_at": "<previous timestamp>"
  },
  "new_values": { "status": "unapproved" }
}
```

### `achievement.delete`

Soft delete (sets `deleted_at`). The audit row's `new_values` notes whether the achievement was approved at deletion time.

```json
{
  "action": "achievement.delete",
  "entity_type": "achievement",
  "entity_id": <id>,
  "old_values": { "deleted_at": null },
  "new_values": {
    "deleted_at": "<iso>",
    "was_approved": true
  }
}
```

`was_approved` is `true` if the achievement had `status = 'approved'` at delete time; this matters because only principal can delete approved ones.

## Weekly plans

### `weekly_plan.create`

```json
{
  "action": "weekly_plan.create",
  "entity_type": "weekly_plan",
  "entity_id": <new_id>,
  "new_values": {
    "student_id": 17, "halaqa_id": 3, "week_start_date": "2026-05-11",
    "status": "draft",
    "items_count": 6
  }
}
```

`items_count` is convenient for reports without joining the items table.

### `weekly_plan.approve`

```json
{
  "action": "weekly_plan.approve",
  "entity_type": "weekly_plan",
  "entity_id": <id>,
  "new_values": { "status": "approved", "approved_by": <caller> }
}
```

### `weekly_plan.unapprove`

```json
{
  "action": "weekly_plan.unapprove",
  "entity_type": "weekly_plan",
  "entity_id": <id>,
  "old_values": { "status": "approved", "approved_by": <previous> },
  "new_values": { "status": "draft" }
}
```

### `weekly_plan.delete`

```json
{
  "action": "weekly_plan.delete",
  "entity_type": "weekly_plan",
  "entity_id": <id>,
  "new_values": { "deleted_at": "<iso>", "was_approved": <bool> }
}
```

## Plan items

### `weekly_plan_item.create`

Only valid on draft plans (Q6). The plan's `entity_id` is referenced via the item's `weekly_plan_id` — useful for queries.

```json
{
  "action": "weekly_plan_item.create",
  "entity_type": "weekly_plan_item",
  "entity_id": <new_item_id>,
  "new_values": {
    "weekly_plan_id": <plan_id>,
    "day_of_week": 2,
    "track_type": "Hifz",
    "start_surah": 2, "start_verse": 1, "end_surah": 2, "end_verse": 20,
    "total_verses": 20
  }
}
```

### `weekly_plan_item.update`

Written when range fields are manually edited. Always sets `is_manual_override = 1`. Range edits trigger reconciliation, which updates `achieved_verses` and `status` — these are NOT audited as separate item-update rows (would flood the log).

```json
{
  "action": "weekly_plan_item.update",
  "entity_type": "weekly_plan_item",
  "entity_id": <id>,
  "old_values": {
    "start_verse": 1, "end_verse": 20, "total_verses": 20,
    "is_manual_override": 0
  },
  "new_values": {
    "start_verse": 1, "end_verse": 25, "total_verses": 25,
    "is_manual_override": 1
  }
}
```

### `weekly_plan_item.delete`

Only valid on draft plans.

```json
{
  "action": "weekly_plan_item.delete",
  "entity_type": "weekly_plan_item",
  "entity_id": <id>,
  "old_values": { /* full snapshot of the item */ }
}
```

Hard delete (no `deleted_at` column on items). The audit row's `old_values` is the only trace.

## What is NOT audited

- **Reconciliation updates** to `achieved_verses` and `status` on plan items. Continuous, high-volume, derived from achievement events that ARE audited. Auditing them separately would flood the log.
- **`due → overdue` transitions** from the daily cron. Same reasoning.
- **Reads.** Audit log is for mutations.
- **Failed mutations.** A request that errors out (400, 403, 409) doesn't write an audit row. The error is captured at the HTTP/application log layer instead.

## Querying the audit log for this module

Useful queries:

```sql
-- All approvals in the last 30 days
SELECT * FROM audit_logs
WHERE action = 'achievement.approve'
  AND created_at >= NOW() - INTERVAL 30 DAY
ORDER BY created_at DESC;

-- All unapprovals (high-signal events worth reviewing)
SELECT * FROM audit_logs
WHERE action = 'achievement.unapprove'
ORDER BY created_at DESC;

-- Full history of a single achievement
SELECT created_at, action, actor_user_id, old_values, new_values
FROM audit_logs
WHERE entity_type = 'achievement'
  AND entity_id = :achievementId
ORDER BY created_at;

-- All items in a plan that were manually overridden
SELECT al.*
FROM audit_logs al
WHERE al.action = 'weekly_plan_item.update'
  AND JSON_EXTRACT(al.new_values, '$.is_manual_override') = 1
  AND JSON_EXTRACT(al.new_values, '$.weekly_plan_id') = :planId;
```
