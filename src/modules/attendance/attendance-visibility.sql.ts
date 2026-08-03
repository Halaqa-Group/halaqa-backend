/**
 * The single soft-delete rule for attendance rows — used by every list and every
 * aggregation (dashboard today, reports later) so a deleted subject is counted
 * the same way everywhere.
 *
 * A row counts only for the days its subject was still active: rows dated on or
 * after `deleted_at` are dropped (the midnight seed may already have created a
 * `present` row on the morning of the deletion — counting it would inflate the
 * rate), while earlier days stay as history. Restoring the subject clears
 * `deleted_at` and brings every row back.
 *
 * Both helpers return a bare `EXISTS (...)` predicate with no bound parameters,
 * so they can be dropped into a raw WHERE clause or a QueryBuilder `andWhere`
 * without disturbing the caller's parameter order.
 */

/**
 * The rule itself: subject table `alias` (students / users) counts on the day
 * `dateExpr` evaluates to. `dateExpr` may be a column or a bound parameter.
 */
export function activeOnDate(alias: string, dateExpr: string): string {
  return `(${alias}.deleted_at IS NULL OR ${dateExpr} < DATE(${alias}.deleted_at))`;
}

/** Cut-off for `student_attendances` rows. `alias` is the table alias in scope. */
export function activeStudentAttendance(alias: string): string {
  return `EXISTS (
    SELECT 1 FROM students del_s
    WHERE del_s.id = ${alias}.student_id
      AND ${activeOnDate('del_s', `${alias}.attendance_date`)}
  )`;
}

/** Cut-off for `teacher_attendances` rows. `alias` is the table alias in scope. */
export function activeStaffAttendance(alias: string): string {
  return `EXISTS (
    SELECT 1 FROM users del_u
    WHERE del_u.id = ${alias}.user_id
      AND ${activeOnDate('del_u', `${alias}.attendance_date`)}
  )`;
}
