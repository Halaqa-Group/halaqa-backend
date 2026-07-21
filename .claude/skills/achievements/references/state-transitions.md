# State transitions

## Achievement states

There are two underlying enum values (`approved` / `unapproved`) combined with `approved_at` to express three observable states.

```
                           ┌─────────────────────────┐
                           │      NEW (never                                       │
              ┌──────────► │      approved)                                        │
              │            │                                                       │
              │            │ status:       unapproved                              │
              │            │ approved_at:  NULL                                    │
              │            │ approved_by:  NULL                                    │
              │            └────────────┬────────────┘
              │                         │
   POST       │            approve      │
   /achievements           ──────────►  │
   (any role in scope)                  │
                                        ▼
                           ┌─────────────────────────┐
                           │   APPROVED              │
                           │                                                       │
                           │ status:      approved                                 │
        unapprove          │ approved_at: <set>                                    │
        ────────────►      │ approved_by: <set>                                    │
        (principal/VP)     │                                                       │
                           └────────────┬────────────┘
                                        │
                                        │ unapprove
                                        ▼
                           ┌─────────────────────────┐
                           │  REVOKED (was                                         │
                           │  approved, now not)                                   │
                           │                                                       │
                           │ status:      unapproved                               │
                           │ approved_at: <preserved>                              │
                           │ approved_by: <preserved>                              │
                           │                                                       │
                           │ — same as NEW for                                     │
                           │   permission purposes                                 │
                           │ — UI can show "approval                               │
                           │   revoked" badge by                                   │
                           │   checking approved_at                                │
                           │   IS NOT NULL                                         │
                           └────────────┬────────────┘
                                        │
                                        │ approve (re-approval, overwrites the
                                        │           approved_by/at fields with
                                        │           the new approver and time)
                                        ▼
                            back to APPROVED
```

### What's editable in each state

| State | Edit allowed by | Delete allowed by |
|---|---|---|
| NEW | anyone who can record in scope | anyone who can record in scope |
| APPROVED | **nobody** (must unapprove first) | anyone who can record in scope |
| REVOKED | anyone who can record in scope | anyone who can record in scope |

The REVOKED state is permission-equivalent to NEW — once a row has `status = 'unapproved'`, the system treats it the same regardless of whether `approved_at` is set. The audit log is what distinguishes the histories.

### State transition triggers

| Transition | Trigger | Roles | Audit |
|---|---|---|---|
| (none) → NEW | POST /achievements | record-in-scope | achievement.create |
| NEW → APPROVED | POST /achievements/:id/approve OR POST with `approve: true` | approve-in-scope | achievement.approve |
| APPROVED → REVOKED | POST /achievements/:id/unapprove | in-scope | achievement.unapprove |
| REVOKED → APPROVED | POST /achievements/:id/approve | in-scope | achievement.approve |
| any → deleted | DELETE /achievements/:id | in-scope | achievement.delete |

"In-scope" means: principal, VP, supervisor with the halaqa in `supervisor_halaqat`, or **any** teacher with an active `halaqa_teachers` row. Achievements have a single permission tier — record, approve, unapprove, edit and delete all use it. Primary/acting status is irrelevant here (it still matters for weekly plans).

## Weekly plan states

Plans are simpler — just `draft` ↔ `approved`.

```
                ┌─────────────────────┐
                │      DRAFT                              │
                │                                         │
                │ status: draft                           │
                │ approved_by: NULL                       │
                │                                         │
                │ Items can be:                           │
                │  - added (POST item)                    │
                │  - removed (DELETE item)                │
                │  - edited (PATCH item, any field)       │
                │                                         │
                └──────────┬──────────┘
                           │
                           │ approve
                           ▼
                ┌─────────────────────┐
                │     APPROVED                            │
                │                                         │
                │ status: approved                        │
                │ approved_by: <user>                     │
                │                                         │
                │ Items can be:                           │
                │  - edited (range fields → sets         │
                │    is_manual_override = 1)             │
                │  - updated by reconciliation           │
                │    (achieved_verses, status)            │
                │                                         │
                │ Items CANNOT be added or deleted.       │
                │                                         │
                └──────────┬──────────┘
                           │
                           │ unapprove (anyone in scope)
                           ▼
                       back to DRAFT
```

### Plan transition triggers

| Transition | Trigger | Roles | Audit |
|---|---|---|---|
| (none) → DRAFT | POST /weekly-plans | in-scope | weekly_plan.create |
| DRAFT → APPROVED | POST /weekly-plans/:id/approve | in-scope | weekly_plan.approve |
| APPROVED → DRAFT | POST /weekly-plans/:id/unapprove | in-scope | weekly_plan.unapprove |
| any → deleted (hard) | DELETE /weekly-plans/:id | in-scope | weekly_plan.delete |

Plans use the same "in-scope" definition as achievements — see above. Parents can read
plans for their own children but cannot mutate them.

## Plan item states

Item statuses are derived (mostly) — they reflect reconciliation results, not direct user input.

```
       ┌─────────┐
       │   DUE                       │ ← initial state on item creation
       └────┬────┘
            │
            ├──────────────── cron at midnight: day has passed
            │                                                                                          │
            │                                                                                          ▼
            │                                                                                ┌──────────┐
            │                                                                                │ OVERDUE                                       │
            │                                                                                └────┬─────┘
            │                                                                                    │
            │ achievement approved,                                                              │ achievement approved,
            │ partial coverage                                                                   │ partial coverage
            │                                                                                    │
            ▼                                                                                    ▼
       ┌─────────┐                                                                ┌──────────┐
       │ PARTIAL                     │                                            │ PARTIAL                                       │
       └────┬────┘                   ◄─────                                       └────┬─────┘
            │  achievement unapproved/                                                 │
            │  deleted, partial → due                                                  │
            │                                                                          │
            │  full coverage reached                                                   │
            ▼                                                                          ▼
       ┌─────────────┐
       │ COMPLETED                                              │
       └─────────────┘
            ▲
            │  full coverage reached
            │
       (any state)
```

### Transition triggers

| Transition | Trigger |
|---|---|
| DUE → OVERDUE | Daily cron at midnight when the item's date has passed |
| DUE → PARTIAL | Approved achievement with partial overlap |
| DUE → COMPLETED | Approved achievement(s) covering the full item range |
| OVERDUE → PARTIAL | Late approved achievement with partial overlap |
| OVERDUE → COMPLETED | Late approved achievement(s) covering full range |
| PARTIAL → COMPLETED | Additional approved achievement(s) covering the rest |
| PARTIAL → DUE/OVERDUE | All approved achievements covering this item are unapproved/deleted |
| COMPLETED → PARTIAL | Some (not all) approved achievements covering this item are unapproved/deleted |
| COMPLETED → DUE/OVERDUE | All approved achievements covering this item are unapproved/deleted |

DUE ↔ OVERDUE is the only time-driven transition; everything else is reconciliation-driven.

### Why item status can "go backwards"

Unapproving an achievement or deleting an approved achievement reduces the verse coverage of any matched plan items. If a plan item was `completed` because of a specific achievement, and that achievement is unapproved or deleted, the item must reflect the new (lower) coverage. This is by design — reports based on plan items should always be consistent with the current set of approved achievements.
