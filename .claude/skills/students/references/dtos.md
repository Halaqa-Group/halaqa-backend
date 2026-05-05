# DTOs — field lists & roles

All DTOs use `class-validator` and the global `whitelist: true, forbidNonWhitelisted: true` pipe. Any unlisted field in a request body is a 400.

## CreateStudentDto — principal, vice_principal

```ts
{
  name: string;                                  // required, 2..100
  gender: 'male' | 'female';                     // required
  dob?: string;                                  // ISO date, optional
  join_date: string;                             // ISO date, required
  status?: 'active' | 'inactive' | 'graduated'; // default 'active' (rarely set on create)
  daily_hifz_pages_capacity?: number;            // default 1, range MIN..MAX_HIFZ
  daily_near_pages_capacity?: number;            // default 5, range MIN..MAX_NEAR
  daily_far_pages_capacity?: number;             // default 10, range MIN..MAX_FAR
  notes?: string;
  photo_url?: string;
  guardians?: LinkGuardianDto[];                 // optional; if present, link in same tx
}
```

If `guardians` is provided on create, the first one is forced to `is_primary = true` regardless of input — same rule as the standalone link endpoint.

## UpdateStudentDto — principal, vice_principal

Partial of CreateStudentDto, **excluding** `guardians` (use the dedicated guardians endpoints) and `school_id` (immutable).

```ts
{
  name?: string;
  gender?: 'male' | 'female';
  dob?: string;
  join_date?: string;
  status?: 'active' | 'inactive' | 'graduated';
  daily_hifz_pages_capacity?: number;
  daily_near_pages_capacity?: number;
  daily_far_pages_capacity?: number;
  notes?: string;
  photo_url?: string;
}
```

> Note: `status: 'graduated'` works here, but prefer `POST /:id/graduate` so the audit action is precise (`student.graduate`, not `student.update`).

## UpdateStudentByTeacherDto — teacher (primary or acting_as_primary)

The strict subset. Anything else in the body is a 400.

```ts
{
  daily_hifz_pages_capacity?: number;
  daily_near_pages_capacity?: number;
  daily_far_pages_capacity?: number;
  notes?: string;
}
```

Controller picks this DTO when `currentUser` is a teacher (and not principal/VP). The service additionally verifies `is_primary OR acting_as_primary` for at least one halaqa containing this student. If the user is a teacher but **not** primary on any of the student's halaqat, return 403.

## ListStudentsQuery

```ts
{
  page?: number;       // default 1
  limit?: number;      // default 20, max 100
  q?: string;          // matches name (LIKE)
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
