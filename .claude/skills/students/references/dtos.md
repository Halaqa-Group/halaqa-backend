# DTOs — field lists & roles

All DTOs use `class-validator` and the global `whitelist: true, forbidNonWhitelisted: true` pipe. Any unlisted field in a request body is a 400.

> **Names.** A person's name is four snake_case fields on every request DTO — `first_name` (الاسم الأول), `second_name` (اسم الأب), `third_name` (اسم الجد), `family_name` (اسم العائلة), each `1..NAME_PART_MAX_LENGTH` (50). The single `name` field is **no longer accepted on any request** — `students.name` is a stored generated column derived from the four parts, so sending `name` is a 400 by `forbidNonWhitelisted`. Responses still return the derived `name` alongside the four parts. Constants and helpers: `src/common/person-name.ts`.

## CreateStudentDto — principal, vice_principal

```ts
{
  first_name: string;                            // required, 1..50 — الاسم الأول
  second_name: string;                           // required, 1..50 — اسم الأب
  third_name: string;                            // required, 1..50 — اسم الجد
  family_name: string;                           // required, 1..50 — اسم العائلة
  gender: 'male' | 'female';                     // required
  dob?: string;                                  // ISO date, optional
  join_date: string;                             // ISO date, required
  status?: 'active' | 'inactive' | 'graduated'; // default 'active' (rarely set on create)
  daily_hifz_pages_capacity?: number;            // default 1, range MIN..MAX_HIFZ
  daily_near_pages_capacity?: number;            // default 5, range MIN..MAX_NEAR
  daily_far_pages_capacity?: number;             // default 10, range MIN..MAX_FAR
  memorization_direction?: 'ascending' | 'descending'; // اتجاه الحفظ, default 'descending'
  notes?: string;
  photo_url?: string;
  phone_country_code?: string;                   // dial code, e.g. '+970'
  phone?: string;                                // national number, no dial code
  guardians?: LinkGuardianDto[];                 // optional; if present, link in same tx
}
```

If `guardians` is provided on create, the first one is forced to `is_primary = true` regardless of input — same rule as the standalone link endpoint.

## UpdateStudentDto — principal, vice_principal

Partial of CreateStudentDto, **excluding** `guardians` (use the dedicated guardians endpoints) and `school_id` (immutable).

```ts
{
  first_name?: string;
  second_name?: string;
  third_name?: string;
  family_name?: string;
  gender?: 'male' | 'female';
  dob?: string;
  join_date?: string;
  status?: 'active' | 'inactive' | 'graduated';
  daily_hifz_pages_capacity?: number;
  daily_near_pages_capacity?: number;
  daily_far_pages_capacity?: number;
  memorization_direction?: 'ascending' | 'descending';
  notes?: string;
  photo_url?: string;
  phone_country_code?: string | null;
  phone?: string | null;
}
```

### The WhatsApp number — `phone_country_code` + `phone`

Stored as two columns so the country picker round-trips exactly; splitting a
joined E.164 string back into (country, number) is ambiguous outside the +9xx
range. Rules, all enforced in `StudentsService.resolvePhone`:

- Both halves are set and cleared **together**. Sending one while the other is
  unset is a 400; `null` (or `''`) on either half clears both.
- Patching one half while the other is already stored keeps the stored half.
- The service normalizes before storing: Arabic-Indic/Persian digits → ASCII,
  separators dropped, the national trunk `0` stripped, `00970`/`970` → `+970`.
  Then `+\d{1,4}` and `\d{4,15}` are enforced — a miss is a 400.
- Bio field: principal/VP only. Teachers get a 400 from the field allow-list.
- Responses carry all three of `phone_country_code`, `phone` and the derived
  `phone_e164` (null unless both halves are set). The audit entry records the
  joined number, not the split.

> Note: `status: 'graduated'` works here, but prefer `POST /:id/graduate` so the audit action is precise (`student.graduate`, not `student.update`).

## UpdateStudentByTeacherDto — teacher (primary or acting_as_primary)

The strict subset. Anything else in the body is a 400.

```ts
{
  daily_hifz_pages_capacity?: number;
  daily_near_pages_capacity?: number;
  daily_far_pages_capacity?: number;
  memorization_direction?: 'ascending' | 'descending';
  notes?: string;
}
```

Controller picks this DTO when `currentUser` is a teacher (and not principal/VP). The service additionally verifies `is_primary OR acting_as_primary` for at least one halaqa containing this student. If the user is a teacher but **not** primary on any of the student's halaqat, return 403.

## ListStudentsQuery

```ts
{
  page?: number;       // default 1
  limit?: number;      // default 20, max 100
  q?: string;          // matches the derived `name` column (LIKE) — still works, it is a real stored column
  status?: 'active' | 'inactive' | 'graduated';
  gender?: 'male' | 'female';
  halaqa_id?: number;  // restrict to one halaqa (still passes scope filter)
  include_deleted?: boolean; // principal/VP only; ignored otherwise
}
```

## LinkGuardianDto — principal, vice_principal

```ts
{
  // exactly one of these two:
  guardian_user_id?: number;
  email?: string;

  // when email is used and the user does not exist yet:
  name?: string;   // required if creating a new user
  phone?: string;  // optional

  relation: 'father' | 'mother' | 'grandfather' | 'grandmother'
          | 'uncle' | 'aunt' | 'sibling' | 'other';
  is_primary?: boolean;   // default false unless first guardian, see is_primary invariant
  can_pickup?: boolean;   // default true
}
```

Custom validator: exactly one of `guardian_user_id` / `email`. If `email` is provided and the user doesn't exist, `name` is required.

## UpdateGuardianDto — principal, vice_principal

```ts
{
  relation?: 'father' | 'mother' | ...;
  is_primary?: boolean;   // true triggers auto-unset of others; false is rejected (400)
  can_pickup?: boolean;
}
```

## GraduateStudentDto

`POST /students/:id/graduate` accepts an optional body:

```ts
{ graduation_date?: string; notes?: string; }
```

Both are stored in the audit entry's `newValues`. The students table itself only flips `status` to `'graduated'` — there is no dedicated `graduated_at` column unless you add one (not required by the schema).
