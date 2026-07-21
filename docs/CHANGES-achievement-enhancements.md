# Change set — `achievement-enhansments`

Pre-commit review document for the uncommitted work on branch **`achievement-enhansments`** (base: `main`).

- **Scope:** 67 tracked files changed (**+3168 / −869**), plus **22 new files** (5 migrations, new entities/DTOs/services, the Quran-bitmap helper, moved validators, one script).
- **Tests:** 478 unit tests passing (40 suites). New migrations verified `up` **and** `down` on a clean database. `docs/openapi.json` regenerated.
- **DB:** 5 new migrations. `DB_SYNCHRONIZE=false` + `pnpm migration:run` required before/at deploy.

> This branch bundles several features developed across sessions. They are grouped by area below. **Breaking API/DB changes are flagged 🚨.**

---

## 1. Migrations (apply in order)

| # | Migration | What it does |
|---|---|---|
| 1 | `1779100000000-AchievementMethodsAndPlanItemOrder` | Adds `achievements.completion_method` + `recitation_method` enums; creates `achievement_recitation_positions`; adds `weekly_plan_items.order` (reconciliation tie-breaker). |
| 2 | `1779200000000-UserIdNumber` | Adds `users.id_number` (VARCHAR(20), unique per school). Seeds placeholders onto existing rows. |
| 3 | `1779300000000-HarakatErrorsAndPositionCounts` | Adds `harakat_errors_count` to `achievements`; adds the 4 per-type count columns to `achievement_recitation_positions`; backfills `full` positions from achievement totals. |
| 4 | `1779400000000-CreateAchievementPositionErrors` | Creates `achievement_position_errors` (itemized errors at QUL word spans). |
| 5 | `1779500000000-StudentMemorizationAndJobs` | Adds `students.memorized_ayat` (**VARBINARY(780)**); creates `memorization_jobs` (recompute queue, one row per student). |

All five are reversible (`down` tested). No data-destructive operations except the intended column/table drops on rollback.

---

## 2. Auth & identity — login by national ID

**Files:** `users/entities/user.entity.ts`, `users/dto/create-user.dto.ts`, `users/dto/user.responses.ts`, `users/users.service.ts`, `users/users.module.ts`, `auth/dto/login.dto.ts`, `auth/services/auth.service.ts`, `auth/auth.controller.ts`, `auth/auth.module.ts`, `dev/dev-seeder.ts`, `scripts/reset-user-password.ts`, `package.json`; validators moved `students/validators/*` → `common/validators/*`.

- 🚨 **`users.id_number` is now required** on user creation (`POST` create-user). VARCHAR(20), **unique per school**, normalized. A bad Palestinian-ID checksum is **stored with a warning, not rejected**.
- 🚨 **Login accepts `email` OR `id_number`** (`login.dto`): exactly one identifier is required (`@ValidateIf` on each). `email` is now optional in the DTO. The supplied identifier becomes the rate-limit / `login_attempts` key (id_number normalized first).
- The **Palestinian ID validator** moved from the students module to `src/common/validators/` and is now shared by both users and students via the `ID_NUMBER_VALIDATOR` token.
- New CLI: `pnpm reset-password` (`scripts/reset-user-password.ts`) — interactive, school-scoped password reset by id_number; bcrypt-hashes, bumps `token_version`, revokes refresh tokens.
- `dev-seeder` backfills canonical demo id_numbers so login-by-id_number works after the migration.

**Students `id_number` policy** (`students/dto/*`, `students/services/students.service.ts`, `students/guards/student-scope.guard.ts`): required for newly created students (legacy NULLs tolerated), visible within school scope, checksum warnings surfaced in the response envelope’s `warnings[]`.

---

## 3. Halaqa evaluation weights (typed)

**Files:** `halaqat/dto/evaluation-settings.dto.ts` (new), `halaqat/dto/create-halaqa.dto.ts`, `halaqat/dto/update-halaqa.dto.ts`, `halaqat/dto/halaqa.responses.ts`, `halaqat/entities/halaqa.entity.ts`, `halaqat/services/halaqat.service.ts`.

- 🚨 `evaluation_settings` changed from **free-form JSON** to a **closed, typed object** of four per-error-type weights: `mistake_weight` (4), `warning_weight` (2), `tajweed_weight` (1), `harakat_weight` (2) — values shown are the defaults. Unknown keys are now **rejected (400)** by `forbidNonWhitelisted`.
- The column stays JSON/nullable; `resolveEvaluationSettings()` merges stored values over the defaults, so **every halaqa read returns all four weights populated** (no frontend fallback needed). `PATCH` replaces the object wholesale; `null` resets to defaults.
- No migration — reuses the existing `halaqat.evaluation_settings` column.
- **Scoring is unchanged in ownership:** `percentage_score` is still computed on the frontend from the raw counts and these weights, and stored as-is. The backend does not recompute it.

---

## 4. Achievements — four error types + itemized, located errors

**Files:** `achievements/entities/achievement.entity.ts`, `achievements/entities/achievement-recitation-position.entity.ts`, `achievements/entities/achievement-position-error.entity.ts` (new), `achievements/dto/create-achievement.dto.ts`, `achievements/dto/update-achievement.dto.ts`, `achievements/dto/achievement-test-position.dto.ts`, `achievements/dto/position-error.dto.ts` (new), `achievements/services/achievements.service.ts`, `achievements/mappers/achievement.dto.ts`, `achievements/controllers/achievements.controller.ts`.

### Model
- **Four error types:** `mistake`, `warning`, `tajweed`, and the new **`harakat`** (حركات), each weighted by `evaluation_settings`.
- **Errors are itemized** — one row per occurrence in `achievement_position_errors`, tied to a recitation position, located at a QUL word span: `{ error_type, start_word_id, end_word_id, surah, ayah, juz, hizb }`.
  - `surah/ayah/juz/hizb` are **supplied by the client from QUL** at capture time (the backend has no QUL dataset). `school_id/student_id/date` are **denormalized by the backend** from the parent achievement (no FK).
- **All counts are derived** (never client-set): a position’s four count columns = COUNT of its error rows per type; an achievement’s four totals = SUM across its positions.

### API shape 🚨 (breaking for achievement create/update)
- Removed the top-level `mistakes_count` / `warnings_count` / `tajweed_errors_count` **inputs**.
- `recitation_method = 'full'` → send `errors[]` at the top level (attach to the single auto-created position). Sending `test_positions` → 400.
- `recitation_method = 'test'` → send `errors[]` inside each `test_positions[]` entry. Sending top-level `errors` → 400.
- Validation: each error’s `(surah, ayah)` must fall within its position range; `end_word_id ≥ start_word_id`; location must be real.
- Update regenerates positions wholesale when `errors` / `test_positions` / `recitation_method` is sent (delete-all-then-insert; error rows cascade).
- **Response:** positions now include the derived `*_count` fields (incl. `harakat_errors_count`) and the itemized `errors[]`. **Parents** see neither the counts nor `errors[]` (extends existing redaction).

---

## 5. Students — memorized-ayat bitmap + recompute queue

**Files:** `quran/quran-bitmap.ts` (new) + spec, `students/entities/student.entity.ts`, `students/entities/memorization-job.entity.ts` (new), `students/services/memorization.service.ts` (new) + spec, `students/services/memorization-cron.service.ts` (new), `students/controllers/student-memorization.controller.ts` (new), `students/dto/memorization.dto.ts` (new), `students/students.module.ts`; enqueue hook in `achievements/services/achievements.service.ts`; `achievements/achievements.module.ts` now imports `StudentsModule`.

- `students.memorized_ayat` = **`VARBINARY(780)`** bitmap over all 6236 ayat (one bit each; bit *i* = the *i*-th ayah in mushaf order). **Not `BIT(6236)`** (MySQL caps `BIT` at 64) and **not `BINARY(780)`** (fixed `BINARY` caps at 255 bytes). All bit math lives in `src/quran/quran-bitmap.ts`.
- **Derivation:** the bitmap is rebuilt from the **union of the student’s approved, non-deleted Hifz achievement ranges**. Any Hifz achievement approve/unapprove/delete-while-approved enqueues a recompute. Non-Hifz tracks never touch it.
- **Queue:** `memorization_jobs`, DB-backed, **one row per student** (`INSERT … ON DUPLICATE KEY UPDATE` upsert coalesces bursts). Enqueue is **best-effort** (failures logged, never thrown — a queue hiccup can’t fail the achievement mutation).
- **Worker:** `MemorizationCron` (every minute) claims `pending → processing` (CAS), recomputes, settles `processing → done` (second CAS so a concurrent enqueue survives). Retries up to 5, then `failed`.
- **Endpoints:**
  - `GET /students/:id/memorization` → `{ memorized_ayah_count, bitmap_base64 }` (all in-scope roles incl. parent).
  - `PUT /students/:id/memorization` → manual `set`/`clear` verse ranges applied directly (principal/VP/supervisor/teacher; **not** parent). ⚠️ Manual edits are overwritten by the next recompute (accepted trade-off — no manual overlay layer).
- **Coupling:** this is the one place `AchievementsModule` imports `StudentsModule` (to inject `MemorizationService`). One-way; students never imports achievements (the worker reads the `achievements` table via raw SQL).

---

## 6. Weekly-plan reconciliation (week-level)

**Files:** `achievements/services/plan-reconciliation.service.ts` (+spec), `achievements/services/plan-items.service.ts`, `achievements/services/weekly-plans.service.ts`, `achievements/dto/{create,update}-weekly-plan-item.dto.ts`, `achievements/entities/weekly-plan-item.entity.ts`, `achievements/mappers/plan-item.dto.ts`, `common/validators/is-after-field.decorator.ts`.

- Reconciliation now runs at the **whole-plan (week) level**: an approved achievement on **any** day of the week can settle **any** item in that week whose range it overlaps. Each achieved verse is **consumed** by exactly one item — the earliest (by `day_of_week`, then `order`, then `id`) claims it, so two items planning the same verse don’t double-credit.
- `weekly_plan_items.order` added as the consumption tie-breaker.

---

## 7. Cross-cutting

- **`src/config/data-source.ts`** registers the new entities (`AchievementRecitationPosition`, `AchievementPositionError`, `MemorizationJob`) for the migration CLI. Runtime uses `autoLoadEntities`.
- **`docs/openapi.json`** regenerated (new endpoints + DTO shapes; also proves the app boots with the new cross-module wiring and cron).
- **Skill docs** updated: `achievements/SKILL.md` (+ `score-formula.md`, `reconciliation-examples.md`) and `students/SKILL.md` now describe the itemized errors, typed weights, and memorization feature.
- Line-ending note: Git warns LF→CRLF on a few files (cosmetic, matches repo convention).

---

## 8. Breaking-change summary (client impact)

| Area | Change | Action for clients |
|---|---|---|
| Create user | `id_number` now **required** | Send `id_number` |
| Login | `email` OR `id_number` | No change if using email |
| Halaqa `evaluation_settings` | Closed 4-weight object; unknown keys → 400 | Send only the 4 weights |
| Achievement create/update | Raw count inputs removed; send itemized `errors[]`; `harakat` added | Migrate payloads to `errors[]` |
| Achievement response | Positions carry derived counts + `errors[]`; parents redacted | Read new fields |

---

## 9. Deployment steps

1. `DB_SYNCHRONIZE=false`
2. `pnpm migration:run` (applies migrations 1779100000000 → 1779500000000)
3. Deploy app (cron `MemorizationCron` starts draining `memorization_jobs` automatically).
4. Optional backfill: enqueue a recompute per student, or let it populate as Hifz achievements are next approved. (No automatic full backfill is run.)

---

## 10. Pre-commit review checklist

- [ ] Existing users need real `id_number`s — the migration seeds placeholders; confirm the backfill/uniqueness story for production data.
- [ ] Confirm frontend is ready for the achievement `errors[]` payload shape (breaking).
- [ ] Confirm frontend reads `evaluation_settings` as the typed 4-weight object.
- [ ] Memorization: accept that manual edits are transient (overwritten by recompute).
- [ ] Single-instance cron assumption for `MemorizationCron` (fine today; revisit if the app scales horizontally).
- [ ] `docs:check` in CI to keep `openapi.json` from drifting.
