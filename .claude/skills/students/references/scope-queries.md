# Scope queries — the canonical SQL

These are the visibility filters per role for the **list** endpoint. The service builds the query off `currentUser.roles`, picking the most permissive role the user holds (principal > vice_principal > supervisor > teacher > parent for read scope).

A user with multiple roles (e.g. teacher + parent) gets the **union** of their scopes — they see students from their halaqat AND their children. The service handles this by branching on the highest-level role; for the teacher+parent edge case, use a `UNION` subquery.

## principal / vice_principal — full school

```sql
SELECT s.*
FROM students s
WHERE s.school_id = :schoolId
  AND s.deleted_at IS NULL;
```

## supervisor — only halaqat they supervise

```sql
SELECT s.*
FROM students s
WHERE s.school_id = :schoolId
  AND s.deleted_at IS NULL
  AND s.id IN (
    SELECT sh.student_id
    FROM student_halaqa sh
    WHERE sh.halaqa_id IN (
      SELECT supl.halaqa_id
      FROM supervisor_halaqat supl
      WHERE supl.supervisor_user_id = :userId
    )
  );
```

## teacher — only halaqat they currently teach

```sql
SELECT s.*
FROM students s
WHERE s.school_id = :schoolId
  AND s.deleted_at IS NULL
  AND s.id IN (
    SELECT sh.student_id
    FROM student_halaqa sh
    WHERE sh.halaqa_id IN (
      SELECT ht.halaqa_id
      FROM halaqa_teachers ht
      WHERE ht.teacher_user_id = :userId
        AND ht.end_date IS NULL
    )
  );
```

## parent — own children, across schools

> No `school_id` filter — this is the only deliberate exception. Parents can have children registered in different schools.

```sql
SELECT s.*
FROM students s
WHERE s.deleted_at IS NULL
  AND s.id IN (
    SELECT sg.student_id
    FROM student_guardians sg
    WHERE sg.guardian_user_id = :userId
  );
```

## teacher + parent (multi-role)

```sql
SELECT s.*
FROM students s
WHERE s.deleted_at IS NULL
  AND s.id IN (
    -- their halaqat (school-scoped)
    SELECT sh.student_id
    FROM student_halaqa sh
    JOIN students st ON st.id = sh.student_id AND st.school_id = :schoolId
    WHERE sh.halaqa_id IN (
      SELECT ht.halaqa_id FROM halaqa_teachers ht
      WHERE ht.teacher_user_id = :userId AND ht.end_date IS NULL
    )
    UNION
    -- their children (any school)
    SELECT sg.student_id FROM student_guardians sg
    WHERE sg.guardian_user_id = :userId
  );
```

## Single-student scope check (used by `StudentScopeGuard`)

For `:id` routes, after the school check passes:

```sql
-- supervisor
SELECT 1
FROM supervisor_halaqat sup
JOIN student_halaqa sh ON sh.halaqa_id = sup.halaqa_id
WHERE sup.supervisor_user_id = :userId
  AND sh.student_id = :studentId
LIMIT 1;

-- teacher
SELECT 1
FROM halaqa_teachers ht
JOIN student_halaqa sh ON sh.halaqa_id = ht.halaqa_id
WHERE ht.teacher_user_id = :userId
  AND ht.end_date IS NULL
  AND sh.student_id = :studentId
LIMIT 1;

-- teacher with primary authority (used for the teacher-edit DTO path)
SELECT 1
FROM halaqa_teachers ht
JOIN student_halaqa sh ON sh.halaqa_id = ht.halaqa_id
WHERE ht.teacher_user_id = :userId
  AND ht.end_date IS NULL
  AND (ht.is_primary = 1 OR ht.acting_as_primary = 1)
  AND sh.student_id = :studentId
LIMIT 1;

-- parent
SELECT 1
FROM student_guardians sg
WHERE sg.guardian_user_id = :userId
  AND sg.student_id = :studentId
LIMIT 1;
```

A miss on any of these from a role that requires it returns **404**, not 403.
