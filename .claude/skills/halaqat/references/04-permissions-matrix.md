# Permissions Matrix — Halaqat Module

This document is the single source of truth for who can do what in this
module. Every guard and controller decorator must match this table —
no role-based logic should live in services.

---

## Roles in scope

The five roles defined in the auth module (`roles` table):

| Slug | Arabic | Authority |
|---|---|---|
| `principal` | مدير | Full access to everything |
| `vice_principal` | نائب مدير | Same as principal except user management (out of this module's scope) |
| `supervisor` | مشرف | Scoped to halaqat where they appear in `supervisor_halaqat` |
| `teacher` | معلم | Scoped to halaqat where they have an active `halaqa_teachers` row |
| `parent` | ولي أمر | No access to halaqat module endpoints (handled by other modules) |

---

## Active teacher of halaqa

Several rules grant edit rights to **any active teacher of halaqa H**.
The check is:

```sql
SELECT 1 FROM halaqa_teachers
WHERE halaqa_id = ?
  AND teacher_user_id = ?
  AND end_date IS NULL
LIMIT 1;
```

This intentionally includes `main`, `assistant`, and `substitute` rows
(the latter only exists when `acting_as_primary = 1` — see BR-HLQ-06).
All three have the same edit rights: name, evaluation_settings.
The distinction between roles matters for **display** and **dashboards**
("who's running this halaqa right now") but not for permission checks
in this module.

For internal queries that need "who is the effective primary right now"
(e.g. for showing a single name in a list view), the check is:

```sql
SELECT 1 FROM halaqa_teachers
WHERE halaqa_id = ?
  AND teacher_user_id = ?
  AND end_date IS NULL
  AND (role = 'main' OR acting_as_primary = 1)
LIMIT 1;
```

That returns the original main when no acting is in effect, or the
acting teacher when there is one.

---

## Full matrix

Legend: ✅ = allowed, ❌ = denied, **scoped** = only for halaqat the user
is associated with via `supervisor_halaqat` or active assignments.

| Operation | principal | vice | supervisor (his) | teacher (active on halaqa) | teacher (not on halaqa) | parent |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Halaqat CRUD** | | | | | | |
| Create halaqa | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| List halaqat | All | All | His | His | His | ❌ |
| View halaqa detail | All | All | His | His | His | ❌ |
| Update `name` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Update `evaluation_settings` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Update `type` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Archive halaqa | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Complete halaqa | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Restore halaqa | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Teachers** | | | | | | |
| Assign teacher | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View assignments | All | All | His | His | His | ❌ |
| Update assignment role | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| End assignment | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Acting** | | | | | | |
| Activate acting | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Extend acting | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| End acting | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Supervisors** | | | | | | |
| Assign supervisor | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Remove supervisor | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View supervisors | All | All | His | His | His | ❌ |
| **Students** | | | | | | |
| Enroll student | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| List students | All | All | His | His | His | ❌ |
| Remove student | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Transfer student | ✅ | ✅ | ✅ either side | ❌ | ❌ | ❌ |
| **Lookups** | | | | | | |
| Teacher's halaqat | All | All | scoped | own | own | ❌ |
| Student's halaqat | All | All | scoped | scoped | scoped | own children |
| Supervisor's halaqat | All | All | own | ❌ | ❌ | ❌ |
| **Activity log** | | | | | | |
| View activity | ✅ | ✅ | ✅ his | ❌ | ❌ | ❌ |

"His" means halaqat the user is associated with (supervisor or teacher).

---

## Guard implementation

Three guards cover the matrix above:

### 1. `@Roles(...slugs)` — basic role check

Already exists in the auth module. Used for endpoints with no per-halaqa
scoping (e.g. create halaqa).

```ts
@Post()
@Roles('principal', 'vice_principal')
create(@Body() dto: CreateHalaqaDto) { ... }
```

### 2. `HalaqaAccessGuard` — read access scoping

Resolves the `:id` route param and verifies the caller has any read
relationship with the halaqa: principal/vice (always), supervisor of it,
or active teacher in it.

```ts
@Get(':id')
@UseGuards(HalaqaAccessGuard)
findOne(@Param('id', ParseIntPipe) id: number) { ... }
```

The guard sets `req.halaqaAccess = { canEdit: bool, canEditMeta: bool, canManageStudents: bool, canManageActing: bool }`
on the request so subsequent code doesn't re-query. Each flag mirrors the
matrix:

```ts
canEdit:           true if principal/vice
canEditMeta:       true if principal/vice/supervisor-of-halaqa/active-teacher-of-halaqa
                   (used for: name, evaluation_settings)
canManageStudents: true if principal/vice/supervisor-of-halaqa
canManageActing:   true if principal/vice/supervisor-of-halaqa
```

### 3. `HalaqaEditAccessGuard` — write access enforcement

Uses the flags set by `HalaqaAccessGuard` (so it must run after it).
The decorator declares which flag is required:

```ts
@Patch(':id')
@UseGuards(HalaqaAccessGuard, HalaqaEditAccessGuard)
@RequiresHalaqaPermission('canEditMeta')
update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateHalaqaDto) { ... }
```

For endpoints that allow different permissions for different fields
(e.g. `PATCH /halaqat/:id` — `name` is `canEditMeta`, `type` is `canEdit`),
the guard checks against the strictest flag implied by the body. The
service layer also re-checks per field — defense in depth.

---

## Field-level permission for `PATCH /halaqat/:id`

This is the trickiest endpoint because the same path with different
bodies requires different permissions:

```ts
async update(halaqa, dto, access) {
  if ('type' in dto && !access.canEdit) {
    throw new ForbiddenException("Only principal/vice can change halaqa type.");
  }
  // name and evaluation_settings need canEditMeta — already enforced by guard
}
```

The guard requires `canEditMeta` (the most permissive). The service
escalates to `canEdit` if the request touches privileged fields.

---

## Multi-tenant boundary (the most important rule)

Every guard MUST resolve `:id` against `school_id` from the JWT before
doing any other check. A halaqa from a different school must look the
same as a halaqa that doesn't exist:

```ts
const halaqa = await this.halaqatRepo.findOne({
  where: { id: halaqaId, schoolId: req.user.schoolId }
});
if (!halaqa) throw new NotFoundException(); // Never ForbiddenException here.
```

Returning 403 instead of 404 leaks the existence of cross-school data.
This is enforced by `HalaqaAccessGuard` as its very first check.

---

## What does NOT live in this matrix

These permissions belong to other modules and are out of scope here:

- Recording attendance for the halaqa's students (attendance module)
- Recording achievements (achievements module)
- Approving weekly plans (achievements module)
- Creating student / parent accounts (students module, auth module)
- Editing the student's profile (students module)

The halaqat module's job ends at the boundary of the halaqa entity and
its memberships.

---

## Quick lookups for service code

When writing a service method, find the row in the matrix and ask:

1. Does this need a role check (`@Roles`)? → use the decorator.
2. Does this need halaqa-scoped access? → put `HalaqaAccessGuard` on the
   route and read `req.halaqaAccess`.
3. Does this need write permission? → add `HalaqaEditAccessGuard` with
   the appropriate `@RequiresHalaqaPermission(...)`.
4. Is the rule field-dependent (like `PATCH /halaqat/:id`)? → re-check
   inside the service for the privileged fields.

If you find yourself writing role-comparison logic inside a service,
that's a smell — extract it to a guard or move the check to the controller.
