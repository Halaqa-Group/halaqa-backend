---
name: nestjs-auth-module
description: Implement, extend, or modify the authentication and user-management modules for the school management backend (NestJS + TypeORM + MySQL). Use this whenever the user asks to add login/logout/refresh endpoints, password reset flows, session/device management, role checks, permission middleware, user CRUD, audit logging, or anything touching the `users`, `user_roles`, `refresh_tokens`, `login_attempts`, `password_reset_tokens`, or `audit_logs` tables. Also use it whenever you need to enforce the BR-USR-* or BR-AUTH-* business rules, decide which guard/decorator to use, or wire up a new protected route. Trigger even if the user does not say "auth" explicitly — anything involving JWT, bcrypt, refresh tokens, role checks, or "who can do what" in this codebase belongs here.
---

# Auth & Users Module — School Management Backend

This skill governs how authentication, authorization, user management, sessions, and audit logging are implemented in the NestJS backend. Every rule below maps to a `BR-USR-*` or `BR-AUTH-*` business requirement and to a concrete table in the schema.

## Stack & non-negotiables

- **Framework:** NestJS (modular, DI-first).
- **ORM:** TypeORM with MySQL. Migrations are the source of truth — never `synchronize: true` outside local dev.
- **Hashing:** bcrypt with cost factor **12**. Never log, return, or serialize the `password` column.
- **JWT:** HS256, single shared secret in env. Access token **15 min**, refresh token **30 days** (BR-AUTH-02).
- **Refresh delivery:** httpOnly + Secure + SameSite=Strict cookie. Never put the refresh token in JSON responses or localStorage.
- **Roles in JWT:** access tokens carry `sub` (user id), `school_id`, and a token version — **not** roles. Roles and permissions are fetched from DB on each protected request via the user's record (decoupled, see BR-AUTH and explicit user instruction).
- **Names are four parts, `name` is derived:** `users` stores `first_name` (الاسم الأول), `second_name` (اسم الأب), `third_name` (اسم الجد), `family_name` (اسم العائلة) — each `VARCHAR(50) NOT NULL`, all four required on create. `users.name` is a **STORED generated column** (`VARCHAR(203)`, `CONCAT_WS(' ', NULLIF(first_name,''), …)`) and is therefore **read-only** — never write it, write the parts. Request DTOs (`CreateUserDto`, `UpdateUserDto`, `UpdateMeDto`) use the snake_case parts and no longer accept `name`; responses (`UserResponse`, `MeResponse`) use camelCase `firstName`/`secondName`/`thirdName`/`familyName` plus the derived `name`. Helpers live in `src/common/person-name.ts`; migration `migrations/1779800000000-SplitPersonNames.ts`. The bootstrap env vars are `BOOTSTRAP_ADMIN_FIRST_NAME`, `BOOTSTRAP_ADMIN_SECOND_NAME`, `BOOTSTRAP_ADMIN_THIRD_NAME`, `BOOTSTRAP_ADMIN_FAMILY_NAME` (the old `BOOTSTRAP_ADMIN_NAME` is gone).
- **School scoping:** all queries are filtered by `school_id`. For now there is one default school (configurable via env `DEFAULT_SCHOOL_ID`), but every query must still pass `school_id` so multi-school works later without rewrites.
- **Rate limiting:** DB-based, querying `login_attempts`. No Redis.
- **Email:** Nodemailer behind a `MailService` interface so transport can be swapped.

## Module layout

```
src/
├── common/         # decorators, guards, interceptors, utils — cross-cutting
├── auth/           # login, refresh, logout, password reset, sessions, rate limiting
├── users/          # user CRUD, /me, change password, role assignment endpoints
├── roles/          # roles registry (read-only seeded data)
└── audit/          # AuditService used by other modules
```

Modules import one another in this direction only: `auth → users → roles`, and any module may import `audit` and `common`. Avoid circular imports by keeping `UsersService` free of auth concerns (it does not hash passwords or issue tokens; `AuthService` orchestrates that).

## The five fixed roles (BR-USR-02)

Seeded in `roles` table — never created at runtime:

| slug | level | notes |
|---|---|---|
| `principal` | 100 | Full school management |
| `vice_principal` | 90 | Same as principal **except** user management |
| `supervisor` | 70 | Oversees a set of halaqat |
| `teacher` | 50 | Teaches one or more halaqat |
| `parent` | 20 | Views children progress |

A user may hold multiple roles (BR-USR-03) — e.g. teacher + parent. Always check role membership as a set, never assume one role per user.

## Endpoints — the canonical surface

### Auth (`/auth/*`) — public unless noted

| Method | Path | Purpose | Auth | Rule |
|---|---|---|---|---|
| POST | `/auth/login` | email + password → access token + refresh cookie | public | BR-AUTH-01,05 |
| POST | `/auth/refresh` | rotate refresh token, return new access | public (cookie) | BR-AUTH-01,07 |
| POST | `/auth/logout` | revoke current refresh token | public (cookie) | BR-AUTH-04 |
| POST | `/auth/logout-all` | revoke all of the user's refresh tokens | required | BR-USR-07,BR-AUTH-08 |
| POST | `/auth/forgot-password` | issue reset token, email it | public | BR-AUTH |
| GET  | `/auth/validate-reset-token?token=…` | check a reset token without consuming it | public | BR-AUTH |
| POST | `/auth/reset-password` | consume reset token, set new password (with `password_confirmation`) | public | BR-AUTH-08 |
| GET  | `/auth/me` | current user profile + roles + permissions | required | BR-USR-06 |

### Sessions (`/auth/sessions/*`) — auth required (BR-AUTH-04)

| Method | Path | Purpose |
|---|---|---|
| GET | `/auth/sessions` | list caller's active devices |
| DELETE | `/auth/sessions/:id` | revoke a specific device |

### Users (`/users/*`) — principal only (BR-USR-04) unless noted

| Method | Path | Purpose | Allowed |
|---|---|---|---|
| POST | `/users` | create user | principal |
| GET | `/users` | list (paginated, school-scoped) | principal, vice_principal |
| GET | `/users/:id` | read | principal, vice_principal |
| PATCH | `/users/:id` | update | principal |
| DELETE | `/users/:id` | soft delete + revoke all sessions | principal |
| POST | `/users/:id/roles` | assign role | principal |
| DELETE | `/users/:id/roles/:roleId` | remove role | principal |
| POST | `/users/:id/reset-password` | admin reset (BR-USR-05) | principal |

### Self (`/me/*`) — caller only (BR-USR-06)

The **read** endpoint for the caller's own profile lives at `GET /auth/me` (above). The `/me/*` namespace is for self-mutations only.

| Method | Path | Purpose |
|---|---|---|
| PATCH | `/me` | update own profile (cannot change `email`, `school_id`, `status`, roles) |
| POST | `/me/change-password` | requires current password; revokes all other sessions (BR-AUTH-08) |

## Response envelope

All JSON responses use a uniform envelope so the frontend has one parsing path:

- **Success with payload:** `{ "code": 200, "data": { ... } }`
- **Success with message only:** `{ "code": 200, "message": "..." }` (or `201`, etc.)
- **Error:** `{ "code": <http-status>, "message": "..." }`

The `code` field mirrors the HTTP status. Validation errors may add a `details` array. This envelope is produced by a global `ResponseInterceptor` and `HttpExceptionFilter` so handlers return plain values; the wrapping is automatic.

## Auth endpoint contracts

These are the exact request/response shapes the frontend depends on. Keep them stable.

### `POST /auth/login`

Request:
```json
{ "email": "user@school.com", "password": "Passw0rd!" }
```
Response 200:
```json
{
  "code": 200,
  "data": {
    "accessToken": "eyJhbGciOi...",
    "user": { "id": 1, "name": "...", "email": "...", "roles": ["principal"] }
  }
}
```
`AuthUserResponse` deliberately exposes only the derived `name` — the four name parts are not in the login payload. Clients that need them read `GET /auth/me`.

Side effect: sets `refresh_token` cookie (HttpOnly, Secure, SameSite=Strict, Path=`/auth`). On failure, returns `401 { "code": 401, "message": "Invalid credentials" }` regardless of the actual reason (BR-AUTH-05).

### `POST /auth/refresh`

Reads the refresh token from the cookie. No request body. Response shape mirrors `/auth/login` (new `accessToken`, rotated cookie). On reuse of a revoked token, returns 401 and revokes the entire family (BR-AUTH-07).

### `POST /auth/logout`

No request body. Revokes the refresh token in the cookie. Response: `204 No Content` (no envelope).

### `POST /auth/forgot-password`

Request: `{ "email": "user@example.com" }`
Response **always** 200 — never indicate whether the email exists:
```json
{ "code": 200, "message": "A reset link has been sent." }
```

### `GET /auth/validate-reset-token?token=…`

Response valid:
```json
{ "code": 200, "data": { "email": "user@example.com" } }
```
Response invalid/expired/used:
```json
{ "code": 400, "message": "Invalid or expired token" }
```
This endpoint **does not** consume the token — it's for the reset-password page to render the email and gate the form.

### `POST /auth/reset-password`

Request:
```json
{
  "token": "xxxxx",
  "password": "newPassword123",
  "password_confirmation": "newPassword123"
}
```
The DTO must reject the request when `password !== password_confirmation` with a 400 validation error before any DB work. Response on success:
```json
{ "code": 200, "message": "Password has been reset successfully" }
```
Side effect: bumps `tokenVersion`, revokes all refresh tokens, marks the reset token `used_at`.

### `GET /auth/me`

Response:
```json
{
  "code": 200,
  "data": {
    "id": 1,
    "firstName": "أحمد",
    "secondName": "محمد",
    "thirdName": "علي",
    "familyName": "المدير",
    "name": "أحمد محمد علي المدير",
    "email": "admin@school.com",
    "phone": "+970599123456",
    "roles": ["principal"],
    "permissions": "*"
  }
}
```

Notes on the `me` payload:
- The four name parts are camelCase here (`firstName`/`secondName`/`thirdName`/`familyName`); `name` is the read-only value MySQL derives from them. `PATCH /me` accepts the **snake_case** parts (`first_name`, …, all optional) — sending `name` is a 400.
- `roles` is a **flat array of slugs**, not the role objects. Convert in the controller.
- `permissions` follows this rule:
  - `"*"` if the user has the `principal` role.
  - Otherwise, an **array of permission strings** (e.g. `["users.read", "halaqat.update"]`) computed from the user's roles. Until a fine-grained permission map exists, return `[]` for non-principals and let role checks gate access.
- Never include `password`, `tokenVersion`, or any token in this payload.

## Permission decision tree (apply in this order in guards)

1. Authenticated? → no = 401
2. `user.status === 'active'`? → no = 403
3. Resource's `school_id` matches caller's `school_id`? → no = **404** (do not leak existence)
4. Caller's role allowed for this action? → no = 403
5. Scope check (supervisor/teacher/parent) → out of scope = 403
6. Primary-authority check if mutation requires it → no = 403
7. Execute + write `audit_log` if action is sensitive

This is implemented as a guard chain: `JwtAuthGuard → ActiveUserGuard → SchoolScopeGuard → RolesGuard → ScopeGuard`. Never short-circuit a step; a missing guard is a security bug.

## Tokens — the rules

### Access token (JWT, HS256)

```
{ sub: <userId>, school_id: <schoolId>, tv: <tokenVersion>, iat, exp }
```

- `tv` (token version) is incremented on password change and on admin "revoke all". Existing access tokens with stale `tv` are rejected by `JwtStrategy` on next request — this is how BR-AUTH-08 / BR-USR-07 cut access in real time without a blocklist.
- 15 min lifetime. No refresh logic in the strategy — clients call `/auth/refresh` when expired.

### Refresh token (opaque, 256-bit random)

- Stored in `refresh_tokens` as **SHA-256 of the raw token** (never plaintext). The raw value lives only in the cookie.
- Each row belongs to a `family_id` (UUID). On rotation, the old row gets `revoked_at = now`, `revoked_reason = 'rotation'`, `replaced_by_id = newRow.id`, and the new row inherits `family_id`.
- **Theft detection (BR-AUTH-07):** if a request presents a refresh token whose row is already revoked, revoke the entire family (`UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = 'suspicious_activity' WHERE family_id = ?`) and return 401. Optionally email the user.
- Cleanup job: a cron deletes rows where `expires_at < NOW() - INTERVAL 7 DAY`.

### Password reset token

- 256-bit random, SHA-256 stored in `password_reset_tokens.token_hash`. Raw value goes in the email link only.
- 1 hour TTL. Single-use: set `used_at` on consumption.
- `GET /auth/validate-reset-token` is a **read-only** check — it must NOT set `used_at`, NOT bump `tokenVersion`, and NOT revoke anything. It only returns whether the token is currently usable plus the associated email.
- `POST /auth/reset-password` consumes the token: validates `password === password_confirmation`, hashes with bcrypt, calls `UsersService.setPasswordAndBumpVersion` (which bumps `tokenVersion` and revokes all refresh tokens), then sets `used_at`.

## Rate limiting (BR-AUTH-06) — DB-based

Implemented as `RateLimitService` that queries `login_attempts`. Rules enforced in `AuthService.login` **before** password verification:

- **Per-IP:** more than **20** attempts in last **15 min** → `rate_limited`, return 429.
- **Per-email:** more than **10** failed attempts in last **15 min** → `rate_limited`, return 429.
- **Per-account lockout:** **5** consecutive failures → block that email for **30 min** (still log new attempts as `rate_limited`).

Every login attempt — successful or not — writes a row to `login_attempts` with the matching `status` enum. Constants live in `auth/rate-limit.config.ts` so they can be tuned without touching service logic.

## Audit logging (BR-AUTH-09)

`AuditService.log({ actor, action, entity, oldValues?, newValues?, ... })` writes to `audit_logs`. Sensitive operations that **must** be audited:

- `user.create`, `user.update`, `user.delete`, `user.restore`
- `user.role.assign`, `user.role.remove`
- `user.password.reset_by_admin`, `user.password.changed_by_self`
- `auth.login.success` (only — failures are in `login_attempts`)
- `auth.session.revoked_by_admin`
- `auth.suspicious_activity` (token reuse)

Use the `@Audit('action.name')` decorator + `AuditInterceptor` for declarative auditing on controllers. For service-level events with rich diffs, call `AuditService.log()` directly.

## Guards & decorators (in `common/`)

- `@Public()` — opt-out of `JwtAuthGuard` (which is a global guard).
- `@CurrentUser()` — param decorator extracting the authenticated user (already loaded with roles).
- `@Roles('principal', 'vice_principal')` — used with `RolesGuard`. Checks role slugs, not levels.
- `@MinRoleLevel(70)` — alternative when "any role at this level or above" is the intent.
- `@Audit('user.update')` — declarative audit, captures req params and response.

`JwtAuthGuard` is registered globally in `auth.module.ts` via `APP_GUARD`. Public routes opt out with `@Public()`. `RolesGuard` is also global but no-ops when no `@Roles()` metadata is present.

## How user deactivation cuts sessions instantly (BR-USR-07)

When a principal sets a user to `inactive` or `suspended`, or deletes them:

1. `users.status` updated (or `deleted_at` set).
2. Increment `tokenVersion` (in users table — add column or derive from `password_reset_tokens` history; recommended: add `token_version INT NOT NULL DEFAULT 0`).
3. `UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = 'admin_action' WHERE user_id = ? AND revoked_at IS NULL`.

Step 2 invalidates outstanding access tokens; step 3 prevents new access tokens from being issued via refresh.

> Note: `token_version` is **not** in the original schema — adding it is required to satisfy BR-AUTH-08 and BR-USR-07. The migration file is part of this module.

## Error responses — never leak existence

- Wrong email, wrong password, locked account → all return the same shape: `401 { message: "Invalid credentials" }`. The real reason goes only into `login_attempts.status`.
- Resource in another school → `404`, never `403`.
- Disabled account on a valid token → `403 { message: "Account inactive" }` (the token was real; the user knows their own status).

## When adding a new protected endpoint — checklist

1. Decide which roles. If unsure, default to deny and ask.
2. Add `@Roles(...)` (or `@MinRoleLevel(...)`).
3. If the endpoint touches a school-scoped entity, ensure the service filters by `school_id` from `CurrentUser`, not from the request body.
4. If it mutates a sensitive entity, add `@Audit('domain.action')` or call `AuditService.log` in the service.
5. If it changes auth state (password, status, roles), revoke sessions and bump `token_version` as appropriate.
6. Write a controller-level e2e test that asserts a non-allowed role gets 403 and a cross-school request gets 404.

## When NOT to use this skill

- Pure schema/migration questions outside the auth tables → use the general DB skill.
- Frontend auth/login UI → this skill is backend-only.
- Halaqa, attendance, memorization domain logic — those are separate modules. They *use* `@CurrentUser`, `@Roles`, and the guards from here, but their business rules belong elsewhere.

## Reference files

- `references/file-tree.md` — the exact file layout to generate when scaffolding from scratch.
- `references/migrations.md` — DDL deltas this module needs on top of the provided schema (`token_version` column, indexes).
- `references/curl-examples.md` — request/response shapes for every endpoint, useful for writing tests or a Postman collection.
