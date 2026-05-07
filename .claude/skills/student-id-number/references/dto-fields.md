# DTO fields — copy-pasteable

All decorators assume `class-validator` and the global `whitelist: true, forbidNonWhitelisted: true` pipe.

## CreateStudentDto — add this field

```ts
@IsOptional()
@IsString()
@MaxLength(20)
id_number?: string;
```

No `@Matches` regex. Format checking belongs to the validator (different countries, different rules).

## UpdateStudentDto — add these two fields

```ts
@IsOptional()
@IsString()
@MaxLength(20)
id_number?: string;

@IsOptional()
@IsBoolean()
force_id_number_change?: boolean;
```

`force_id_number_change` is **transient** — never written to the entity. Read it in the service, then drop it.

## UpdateStudentByTeacherDto — DO NOT ADD

The teacher DTO must not list `id_number` or `force_id_number_change`. A teacher request containing either is a 400 by `forbidNonWhitelisted`. This is the only mechanism keeping teachers off the field. Don't weaken it.

## ListStudentsQuery — add this filter

```ts
@IsOptional()
@IsString()
@MaxLength(20)
id_number?: string;       // exact-match filter, role-gated in service
```

The service rejects this filter with 400 for supervisor/teacher (silent ignore is a side-channel).

## Where the role branch lives

The DTO is the same for all callers (NestJS doesn't pick DTOs based on role). The service checks the caller's role before applying the filter:

```ts
if (query.id_number !== undefined) {
  if (!user.hasAnyRole('principal', 'vice_principal') && !isParentScope) {
    throw new BadRequestException(
      'Filtering by id_number is not allowed for your role.',
    );
  }
  qb.andWhere('s.id_number = :idNumber',
              { idNumber: validator.normalize(query.id_number) });
}
```

Same pattern for `q` matching `id_number`:

```ts
if (query.q) {
  const q = `%${query.q}%`;
  const qNorm = `%${validator.normalize(query.q)}%`;
  if (canSearchById(user)) {
    qb.andWhere(new Brackets(b => b
      .where('s.name LIKE :q', { q })
      .orWhere('s.id_number LIKE :qNorm', { qNorm })));
  } else {
    qb.andWhere('s.name LIKE :q', { q });
  }
}
```

The matcher uses normalized form on both sides — search input is normalized before the LIKE, stored values are already normalized at write time.
