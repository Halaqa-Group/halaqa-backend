/**
 * Shared definition of the four-part Arabic personal name used by both `users`
 * and `students`: الاسم الأول (first) / اسم الأب (second) / اسم الجد (third) /
 * اسم العائلة (family).
 *
 * Each table keeps a `name` column that MySQL derives from the four parts as a
 * STORED generated column, so `name LIKE` search and `ORDER BY name` keep
 * working against the full name. Only writers changed: write the parts, never
 * `name`.
 *
 * Responses never show the full four-part name: every display field — the
 * `name` of a person's own response and the denormalized `*_name` projections
 * on other modules' responses — carries {@link buildShortName}, first / father
 * / family. Clients that need اسم الجد compose it from the parts, which every
 * person response still returns individually.
 */

/** Max length of a single name part. */
export const NAME_PART_MAX_LENGTH = 50;

/** 4 parts × 50 + 3 separating spaces. */
export const FULL_NAME_MAX_LENGTH = 203;

/**
 * The generated-column expression for `name`.
 *
 * `NULLIF(part, '')` matters for legacy rows: names migrated from the old single
 * `name` column may have fewer than four tokens, and the missing parts were
 * backfilled with `''`. `CONCAT_WS` skips NULLs but not empty strings, so
 * without `NULLIF` those rows would gain doubled spaces.
 *
 * TypeORM stores this string verbatim in `typeorm_metadata` and compares against
 * it on every schema sync. It MUST stay byte-identical to the expression written
 * by the migration that created the column, or `DB_SYNCHRONIZE=true` will drop
 * and recreate `name` on every boot.
 */
export const FULL_NAME_EXPRESSION =
  "CONCAT_WS(' ', NULLIF(first_name, ''), NULLIF(second_name, ''), NULLIF(third_name, ''), NULLIF(family_name, ''))";

export interface NameParts {
  firstName: string;
  secondName: string;
  thirdName: string;
  familyName: string;
}

/** The snake_case shape the name parts take on request DTOs. */
export interface NamePartsInput {
  first_name?: string;
  second_name?: string;
  third_name?: string;
  family_name?: string;
}

/**
 * Maps the name-part fields of an update DTO onto entity columns, omitting the
 * ones the caller did not send so a partial update leaves the rest alone.
 */
export function namePartsPatch(dto: NamePartsInput): Partial<NameParts> {
  return {
    ...(dto.first_name !== undefined && { firstName: dto.first_name }),
    ...(dto.second_name !== undefined && { secondName: dto.second_name }),
    ...(dto.third_name !== undefined && { thirdName: dto.third_name }),
    ...(dto.family_name !== undefined && { familyName: dto.family_name }),
  };
}

/**
 * snake_case projection of the four parts plus the display name, matching the
 * response convention of the students module.
 *
 * `name` is the *short* name, not the database-derived `name` column: responses
 * carry all four parts, so a client that wants اسم الجد can compose it, while
 * `name` stays the one form used for display everywhere.
 */
export function toNameFields(entity: NameParts): {
  first_name: string;
  second_name: string;
  third_name: string;
  family_name: string;
  name: string;
} {
  return {
    first_name: entity.firstName,
    second_name: entity.secondName,
    third_name: entity.thirdName,
    family_name: entity.familyName,
    name: buildShortName(entity),
  };
}

/**
 * The TypeScript mirror of {@link FULL_NAME_EXPRESSION}. The database is the
 * source of truth for the persisted `name`; use this only where a display name
 * is needed before the row is read back (notifications, logs, test fixtures).
 */
export function buildFullName(parts: NameParts): string {
  return [parts.firstName, parts.secondName, parts.thirdName, parts.familyName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(' ');
}

/**
 * Shortened display name — first / father / family, dropping اسم الجد. This is
 * the display form on every response: the denormalized `*_name` projections
 * (student_name, teacher_name, actor_name, recorded_by_name, …) and the `name`
 * field of a person's own response alike.
 */
export function buildShortName(
  parts: Pick<NameParts, 'firstName' | 'secondName' | 'familyName'>,
): string {
  return [parts.firstName, parts.secondName, parts.familyName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(' ');
}

/**
 * The SQL mirror of {@link buildShortName}, for the raw queries that project a
 * display name out of `users` or `students`. Pass the table alias used by the
 * query, or omit it for an unaliased single-table SELECT.
 *
 * The inner `NULLIF`s matter for the same reason they do in
 * {@link FULL_NAME_EXPRESSION}: legacy rows have missing parts stored as `''`,
 * and `CONCAT_WS` skips NULLs but not empty strings. The outer one restores the
 * NULL that a missed LEFT JOIN used to produce — `CONCAT_WS` over all-NULL
 * arguments yields `''`, which would turn a nullable `*_name` into an empty
 * string instead of `null`.
 */
export function shortNameSql(alias?: string): string {
  const col = (part: string) =>
    `NULLIF(${alias ? `${alias}.` : ''}${part}, '')`;
  return `NULLIF(CONCAT_WS(' ', ${col('first_name')}, ${col('second_name')}, ${col('family_name')}), '')`;
}
