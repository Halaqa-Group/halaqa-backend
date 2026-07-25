import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { TrackType } from '../../achievements/entities/achievement.entity';
import type {
  AlertsDto,
  HalaqaPerformanceDto,
  HalaqatPerformanceDto,
  HalaqaWithoutTeacherDto,
  HighAbsenceTeacherDto,
  OverviewComparisonDto,
  OverviewDto,
  StalledStudentDto,
  TeacherCommitmentDto,
  TeachersCommitmentDto,
  TopStudentDto,
  TopStudentsDto,
} from '../dto/dashboard-response.dto';
import { DashboardScopeService, HalaqaScope } from './dashboard-scope.service';
import {
  DateRange,
  daysAgo,
  Period,
  previousRange,
  resolveRange,
} from './period.util';

/** Whole days between an ISO 'YYYY-MM-DD' date and today (>= 0). */
function daysSince(isoDate: string, now: Date = new Date()): number {
  const then = Date.parse(`${isoDate}T00:00:00`);
  const today = Date.parse(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}T00:00:00`,
  );
  return Math.max(0, Math.round((today - then) / 86_400_000));
}

function ratio(present: number, total: number): number {
  return total > 0 ? Number((present / total).toFixed(4)) : 0;
}

/** Dashboard page figures are aggregates of DECIMAL(8,4) columns; show 2dp. */
function round2(value: number): number {
  return Number(value.toFixed(2));
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly scopeService: DashboardScopeService,
  ) {}

  // ─── Caching ────────────────────────────────────────────────────────────────
  // These aggregates are read-heavy and tolerate short staleness, so each entry
  // point is memoized for CACHE_TTL_MS keyed by (endpoint, actor, query). Keying
  // on actor.id keeps role-scoping correct — two callers never share an entry.

  private readonly cache = new Map<string, { exp: number; val: unknown }>();
  private static readonly CACHE_TTL_MS = 30_000;

  private async memo<T>(
    name: string,
    actor: AuthenticatedUser,
    query: unknown,
    fn: () => Promise<T>,
  ): Promise<T> {
    const now = Date.now();
    const key = `${name}:${actor.id}:${actor.schoolId}:${JSON.stringify(query)}`;
    const hit = this.cache.get(key);
    if (hit && hit.exp > now) return hit.val as T;
    const val = await fn();
    this.cache.set(key, { exp: now + DashboardService.CACHE_TTL_MS, val });
    if (this.cache.size > 500) {
      for (const [k, v] of this.cache) if (v.exp <= now) this.cache.delete(k);
    }
    return val;
  }

  // ─── Public entry points (cached) ─────────────────────────────────────────────

  overview(
    actor: AuthenticatedUser,
    query: { period?: Period; from?: string; to?: string; compare?: boolean },
  ): Promise<OverviewDto> {
    return this.memo('overview', actor, query, () =>
      this.computeOverview(actor, query),
    );
  }

  topStudents(
    actor: AuthenticatedUser,
    query: {
      period?: Period;
      from?: string;
      to?: string;
      track?: TrackType;
      limit?: number;
    },
  ): Promise<TopStudentsDto> {
    return this.memo('top-students', actor, query, () =>
      this.computeTopStudents(actor, query),
    );
  }

  halaqatPerformance(
    actor: AuthenticatedUser,
    query: { period?: Period; from?: string; to?: string },
  ): Promise<HalaqatPerformanceDto> {
    return this.memo('halaqat', actor, query, () =>
      this.computeHalaqatPerformance(actor, query),
    );
  }

  teacherCommitment(
    actor: AuthenticatedUser,
    query: { period?: Period; from?: string; to?: string },
  ): Promise<TeachersCommitmentDto> {
    return this.memo('teachers', actor, query, () =>
      this.computeTeacherCommitment(actor, query),
    );
  }

  alerts(
    actor: AuthenticatedUser,
    query: {
      period?: Period;
      from?: string;
      to?: string;
      stalledDays?: number;
      absenceThreshold?: number;
    },
  ): Promise<AlertsDto> {
    return this.memo('alerts', actor, query, () =>
      this.computeAlerts(actor, query),
    );
  }

  // ─── Scope helpers ──────────────────────────────────────────────────────────

  /** True when the scope resolves to no halaqat at all (short-circuit to empty). */
  private isEmpty(scope: HalaqaScope): boolean {
    return !scope.all && scope.halaqaIds.length === 0;
  }

  private inList(ids: number[]): string {
    return ids.map(() => '?').join(',');
  }

  /** `AND <column> IN (...)` for tables that carry `halaqa_id` directly. */
  private halaqaClause(
    scope: HalaqaScope,
    column: string,
  ): { clause: string; params: number[] } {
    if (scope.all) return { clause: '', params: [] };
    return {
      clause: ` AND ${column} IN (${this.inList(scope.halaqaIds)})`,
      params: scope.halaqaIds,
    };
  }

  /** `AND <studentColumn> IN (active students of scoped halaqat)`. */
  private studentClause(
    scope: HalaqaScope,
    studentColumn: string,
  ): { clause: string; params: number[] } {
    if (scope.all) return { clause: '', params: [] };
    return {
      clause:
        ` AND ${studentColumn} IN (` +
        `SELECT DISTINCT student_id FROM student_halaqa ` +
        `WHERE status = 'active' AND halaqa_id IN (${this.inList(scope.halaqaIds)}))`,
      params: scope.halaqaIds,
    };
  }

  // ─── Overview ───────────────────────────────────────────────────────────────

  private async computeOverview(
    actor: AuthenticatedUser,
    query: { period?: Period; from?: string; to?: string; compare?: boolean },
  ): Promise<OverviewDto> {
    const range = resolveRange(query);
    const scope = await this.scopeService.resolve(actor);
    const showTeacherRate =
      this.scopeService.isAdmin(actor) ||
      actor.roles.some((r) => r.slug === 'supervisor');

    if (this.isEmpty(scope)) {
      return {
        range,
        student_attendance_rate: 0,
        teacher_attendance_rate: null,
        ethics_average: 0,
        new_memorization_pages: 0,
        plan_completion_rate: 0,
        average_score: 0,
        active_students: 0,
        active_halaqat: 0,
        previous: null,
      };
    }

    const [
      studentAtt,
      teacherRate,
      hifzPages,
      planRate,
      avgScore,
      activeStudents,
      activeHalaqat,
      previous,
    ] = await Promise.all([
      this.studentAttendanceAgg(actor.schoolId, scope, range),
      showTeacherRate
        ? this.teacherAttendanceRate(actor.schoolId, scope, range)
        : Promise.resolve(null),
      this.newMemorizationPages(actor.schoolId, scope, range),
      this.planCompletionRate(actor.schoolId, scope, range),
      this.averageScore(actor.schoolId, scope, range),
      this.countActiveStudents(actor.schoolId, scope),
      this.countActiveHalaqat(actor.schoolId, scope),
      query.compare
        ? this.overviewKpis(
            actor.schoolId,
            scope,
            previousRange(range),
            showTeacherRate,
          )
        : Promise.resolve(null),
    ]);

    return {
      range,
      student_attendance_rate: studentAtt.rate,
      teacher_attendance_rate: teacherRate,
      ethics_average: studentAtt.ethics,
      new_memorization_pages: hifzPages,
      plan_completion_rate: planRate,
      average_score: avgScore,
      active_students: activeStudents,
      active_halaqat: activeHalaqat,
      previous,
    };
  }

  /** The headline KPIs over an arbitrary window — reused for the trend comparison. */
  private async overviewKpis(
    schoolId: number,
    scope: HalaqaScope,
    range: DateRange,
    showTeacherRate: boolean,
  ): Promise<OverviewComparisonDto> {
    const [att, teacherRate, pages, planRate, avgScore] = await Promise.all([
      this.studentAttendanceAgg(schoolId, scope, range),
      showTeacherRate
        ? this.teacherAttendanceRate(schoolId, scope, range)
        : Promise.resolve(null),
      this.newMemorizationPages(schoolId, scope, range),
      this.planCompletionRate(schoolId, scope, range),
      this.averageScore(schoolId, scope, range),
    ]);
    return {
      range,
      student_attendance_rate: att.rate,
      teacher_attendance_rate: teacherRate,
      ethics_average: att.ethics,
      new_memorization_pages: pages,
      plan_completion_rate: planRate,
      average_score: avgScore,
    };
  }

  /** SUM(total_pages) of approved Hifz achievements in scope/period. */
  private async newMemorizationPages(
    schoolId: number,
    scope: HalaqaScope,
    range: DateRange,
  ): Promise<number> {
    const filter = this.halaqaClause(scope, 'halaqa_id');
    const rows: Array<{ pages: string }> = await this.dataSource.query(
      `SELECT COALESCE(SUM(total_pages),0) AS pages
         FROM achievements
        WHERE school_id = ?
          AND status = 'approved'
          AND deleted_at IS NULL
          AND track_type = 'Hifz'
          AND date BETWEEN ? AND ?${filter.clause}`,
      [schoolId, range.from, range.to, ...filter.params],
    );
    return round2(Number(rows[0].pages));
  }

  private async studentAttendanceAgg(
    schoolId: number,
    scope: HalaqaScope,
    range: DateRange,
  ): Promise<{ rate: number; ethics: number }> {
    const s = this.studentClause(scope, 'sa.student_id');
    const rows: Array<{ present: string; total: string; ethics: string }> =
      await this.dataSource.query(
        `SELECT COALESCE(SUM(sa.status IN ('present','late')),0) AS present,
                COUNT(*) AS total,
                COALESCE(AVG(sa.ethics_rating),0) AS ethics
           FROM student_attendances sa
          WHERE sa.school_id = ?
            AND sa.attendance_date BETWEEN ? AND ?${s.clause}`,
        [schoolId, range.from, range.to, ...s.params],
      );
    const r = rows[0];
    return {
      rate: ratio(Number(r.present), Number(r.total)),
      ethics: Number(Number(r.ethics).toFixed(2)),
    };
  }

  /** Distinct user ids of teachers currently assigned to the scoped halaqat. */
  private async teacherIdsInScope(
    schoolId: number,
    scope: HalaqaScope,
  ): Promise<number[]> {
    const filter = this.halaqaClause(scope, 'ht.halaqa_id');
    const rows: Array<{ id: number }> = await this.dataSource.query(
      `SELECT DISTINCT ht.teacher_user_id AS id
         FROM halaqa_teachers ht
         JOIN halaqat h ON h.id = ht.halaqa_id
        WHERE ht.end_date IS NULL
          AND h.school_id = ?
          AND h.status = 'active'
          AND h.deleted_at IS NULL${filter.clause}`,
      [schoolId, ...filter.params],
    );
    return rows.map((r) => Number(r.id));
  }

  private async teacherAttendanceRate(
    schoolId: number,
    scope: HalaqaScope,
    range: DateRange,
  ): Promise<number | null> {
    const teacherIds = await this.teacherIdsInScope(schoolId, scope);
    if (teacherIds.length === 0) return null;
    const rows: Array<{ present: string; total: string }> =
      await this.dataSource.query(
        `SELECT COALESCE(SUM(status IN ('present','late')),0) AS present,
                COUNT(*) AS total
           FROM teacher_attendances
          WHERE school_id = ?
            AND attendance_date BETWEEN ? AND ?
            AND user_id IN (${this.inList(teacherIds)})`,
        [schoolId, range.from, range.to, ...teacherIds],
      );
    const total = Number(rows[0].total);
    return total > 0 ? ratio(Number(rows[0].present), total) : null;
  }

  private async planCompletionRate(
    schoolId: number,
    scope: HalaqaScope,
    range: DateRange,
  ): Promise<number> {
    const filter = this.halaqaClause(scope, 'wp.halaqa_id');
    const rows: Array<{ completed: string; total: string }> =
      await this.dataSource.query(
        `SELECT COALESCE(SUM(wpi.status = 'completed'),0) AS completed,
                COUNT(*) AS total
           FROM weekly_plan_items wpi
           JOIN weekly_plans wp ON wp.id = wpi.weekly_plan_id
          WHERE wp.school_id = ?
            AND wp.deleted_at IS NULL
            AND wp.week_start_date BETWEEN ? AND ?${filter.clause}`,
        [schoolId, range.from, range.to, ...filter.params],
      );
    return ratio(Number(rows[0].completed), Number(rows[0].total));
  }

  private async averageScore(
    schoolId: number,
    scope: HalaqaScope,
    range: DateRange,
  ): Promise<number> {
    const filter = this.halaqaClause(scope, 'halaqa_id');
    const rows: Array<{ avg: string }> = await this.dataSource.query(
      `SELECT COALESCE(AVG(percentage_score),0) AS avg
         FROM achievements
        WHERE school_id = ?
          AND status = 'approved'
          AND deleted_at IS NULL
          AND date BETWEEN ? AND ?${filter.clause}`,
      [schoolId, range.from, range.to, ...filter.params],
    );
    return Number(Number(rows[0].avg).toFixed(2));
  }

  private async countActiveStudents(
    schoolId: number,
    scope: HalaqaScope,
  ): Promise<number> {
    if (scope.all) {
      const rows: Array<{ c: string }> = await this.dataSource.query(
        `SELECT COUNT(*) AS c FROM students
          WHERE school_id = ? AND status = 'active' AND deleted_at IS NULL`,
        [schoolId],
      );
      return Number(rows[0].c);
    }
    const rows: Array<{ c: string }> = await this.dataSource.query(
      `SELECT COUNT(DISTINCT sh.student_id) AS c
         FROM student_halaqa sh
         JOIN students s ON s.id = sh.student_id
        WHERE sh.status = 'active'
          AND sh.halaqa_id IN (${this.inList(scope.halaqaIds)})
          AND s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL`,
      [...scope.halaqaIds, schoolId],
    );
    return Number(rows[0].c);
  }

  private async countActiveHalaqat(
    schoolId: number,
    scope: HalaqaScope,
  ): Promise<number> {
    if (scope.all) {
      const rows: Array<{ c: string }> = await this.dataSource.query(
        `SELECT COUNT(*) AS c FROM halaqat
          WHERE school_id = ? AND status = 'active' AND deleted_at IS NULL`,
        [schoolId],
      );
      return Number(rows[0].c);
    }
    const rows: Array<{ c: string }> = await this.dataSource.query(
      `SELECT COUNT(*) AS c FROM halaqat
        WHERE id IN (${this.inList(scope.halaqaIds)})
          AND school_id = ? AND status = 'active' AND deleted_at IS NULL`,
      [...scope.halaqaIds, schoolId],
    );
    return Number(rows[0].c);
  }

  // ─── Top students ───────────────────────────────────────────────────────────

  private async computeTopStudents(
    actor: AuthenticatedUser,
    query: {
      period?: Period;
      from?: string;
      to?: string;
      track?: TrackType;
      limit?: number;
    },
  ): Promise<TopStudentsDto> {
    const range = resolveRange(query);
    const track: TrackType = query.track ?? 'Hifz';
    const limit = Math.min(50, Math.max(1, query.limit ?? 10));
    const scope = await this.scopeService.resolve(actor);

    if (this.isEmpty(scope)) return { range, track, items: [] };

    const filter = this.halaqaClause(scope, 'halaqa_id');
    const rows: Array<{
      studentId: number;
      totalPages: string;
      positionsPages: string;
      cnt: string;
      avgScore: string;
    }> = await this.dataSource.query(
      `SELECT student_id AS studentId,
              COALESCE(SUM(total_pages),0) AS totalPages,
              COALESCE(SUM(positions_pages),0) AS positionsPages,
              COUNT(*) AS cnt,
              COALESCE(AVG(percentage_score),0) AS avgScore
         FROM achievements
        WHERE school_id = ?
          AND status = 'approved'
          AND deleted_at IS NULL
          AND track_type = ?
          AND date BETWEEN ? AND ?${filter.clause}
        GROUP BY student_id
        ORDER BY totalPages DESC
        LIMIT ?`,
      [actor.schoolId, track, range.from, range.to, ...filter.params, limit],
    );

    const names = await this.resolveStudentNames(
      rows.map((r) => Number(r.studentId)),
      actor.schoolId,
    );

    const items: TopStudentDto[] = rows.map((r) => ({
      student_id: Number(r.studentId),
      student_name: names.get(Number(r.studentId)) ?? `#${r.studentId}`,
      total_pages: round2(Number(r.totalPages)),
      positions_pages: round2(Number(r.positionsPages)),
      achievements_count: Number(r.cnt),
      average_score: Number(Number(r.avgScore).toFixed(2)),
    }));

    return { range, track, items };
  }

  private async resolveStudentNames(
    ids: number[],
    schoolId: number,
  ): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    if (ids.length === 0) return map;
    const rows: Array<{ id: number; name: string }> =
      await this.dataSource.query(
        `SELECT id, name FROM students
          WHERE id IN (${this.inList(ids)}) AND school_id = ?`,
        [...ids, schoolId],
      );
    for (const r of rows) map.set(Number(r.id), r.name);
    return map;
  }

  // ─── Per-halaqa performance ─────────────────────────────────────────────────

  private async computeHalaqatPerformance(
    actor: AuthenticatedUser,
    query: { period?: Period; from?: string; to?: string },
  ): Promise<HalaqatPerformanceDto> {
    const range = resolveRange(query);
    const scope = await this.scopeService.resolve(actor);

    if (this.isEmpty(scope)) return { range, items: [] };

    // 1. The active halaqat in scope (id + name).
    const halaqat: Array<{ id: number; name: string }> = scope.all
      ? await this.dataSource.query(
          `SELECT id, name FROM halaqat
            WHERE school_id = ? AND status = 'active' AND deleted_at IS NULL`,
          [actor.schoolId],
        )
      : await this.dataSource.query(
          `SELECT id, name FROM halaqat
            WHERE id IN (${this.inList(scope.halaqaIds)})
              AND school_id = ? AND status = 'active' AND deleted_at IS NULL`,
          [...scope.halaqaIds, actor.schoolId],
        );

    if (halaqat.length === 0) return { range, items: [] };
    const halaqaIds = halaqat.map((h) => Number(h.id));
    const idList = this.inList(halaqaIds);

    // 2. Students per halaqa.
    const studentRows: Array<{ halaqaId: number; c: string }> =
      await this.dataSource.query(
        `SELECT halaqa_id AS halaqaId, COUNT(DISTINCT student_id) AS c
           FROM student_halaqa
          WHERE status = 'active' AND halaqa_id IN (${idList})
          GROUP BY halaqa_id`,
        halaqaIds,
      );

    // 3. Attendance per halaqa (via active enrollment bridge).
    const attRows: Array<{ halaqaId: number; present: string; total: string }> =
      await this.dataSource.query(
        `SELECT sh.halaqa_id AS halaqaId,
                COALESCE(SUM(sa.status IN ('present','late')),0) AS present,
                COUNT(*) AS total
           FROM student_halaqa sh
           JOIN student_attendances sa ON sa.student_id = sh.student_id
          WHERE sh.status = 'active'
            AND sh.halaqa_id IN (${idList})
            AND sa.school_id = ?
            AND sa.attendance_date BETWEEN ? AND ?
          GROUP BY sh.halaqa_id`,
        [...halaqaIds, actor.schoolId, range.from, range.to],
      );

    // 4. Plan completion per halaqa.
    const planRows: Array<{
      halaqaId: number;
      completed: string;
      total: string;
    }> = await this.dataSource.query(
      `SELECT wp.halaqa_id AS halaqaId,
              COALESCE(SUM(wpi.status = 'completed'),0) AS completed,
              COUNT(*) AS total
         FROM weekly_plan_items wpi
         JOIN weekly_plans wp ON wp.id = wpi.weekly_plan_id
        WHERE wp.school_id = ?
          AND wp.deleted_at IS NULL
          AND wp.week_start_date BETWEEN ? AND ?
          AND wp.halaqa_id IN (${idList})
        GROUP BY wp.halaqa_id`,
      [actor.schoolId, range.from, range.to, ...halaqaIds],
    );

    // 5. Hifz pages + avg score per halaqa (approved achievements).
    const achRows: Array<{
      halaqaId: number;
      pages: string;
      avgScore: string;
    }> = await this.dataSource.query(
      `SELECT halaqa_id AS halaqaId,
                COALESCE(SUM(CASE WHEN track_type = 'Hifz' THEN total_pages ELSE 0 END),0) AS pages,
                COALESCE(AVG(percentage_score),0) AS avgScore
           FROM achievements
          WHERE school_id = ?
            AND status = 'approved'
            AND deleted_at IS NULL
            AND date BETWEEN ? AND ?
            AND halaqa_id IN (${idList})
          GROUP BY halaqa_id`,
      [actor.schoolId, range.from, range.to, ...halaqaIds],
    );

    const students = new Map(
      studentRows.map((r) => [Number(r.halaqaId), Number(r.c)]),
    );
    const att = new Map(
      attRows.map((r) => [
        Number(r.halaqaId),
        { present: Number(r.present), total: Number(r.total) },
      ]),
    );
    const plans = new Map(
      planRows.map((r) => [
        Number(r.halaqaId),
        { completed: Number(r.completed), total: Number(r.total) },
      ]),
    );
    const ach = new Map(
      achRows.map((r) => [
        Number(r.halaqaId),
        { pages: Number(r.pages), avgScore: Number(r.avgScore) },
      ]),
    );

    const items: HalaqaPerformanceDto[] = halaqat.map((h) => {
      const id = Number(h.id);
      const a = att.get(id);
      const p = plans.get(id);
      const ac = ach.get(id);
      return {
        halaqa_id: id,
        halaqa_name: h.name,
        students: students.get(id) ?? 0,
        attendance_rate: a ? ratio(a.present, a.total) : 0,
        pages: ac ? round2(ac.pages) : 0,
        average_score: ac ? Number(ac.avgScore.toFixed(2)) : 0,
        plan_completion_rate: p ? ratio(p.completed, p.total) : 0,
      };
    });

    items.sort((x, y) => y.pages - x.pages);
    return { range, items };
  }

  // ─── Teacher commitment ─────────────────────────────────────────────────────

  private async computeTeacherCommitment(
    actor: AuthenticatedUser,
    query: { period?: Period; from?: string; to?: string },
  ): Promise<TeachersCommitmentDto> {
    const range = resolveRange(query);
    const scope = await this.scopeService.resolve(actor);

    if (this.isEmpty(scope)) return { range, items: [] };

    // teacher ↔ halaqa map for current assignments in scope.
    const filter = this.halaqaClause(scope, 'ht.halaqa_id');
    const assignments: Array<{ teacherId: number; halaqaId: number }> =
      await this.dataSource.query(
        `SELECT ht.teacher_user_id AS teacherId, ht.halaqa_id AS halaqaId
           FROM halaqa_teachers ht
           JOIN halaqat h ON h.id = ht.halaqa_id
          WHERE ht.end_date IS NULL
            AND h.school_id = ?
            AND h.status = 'active'
            AND h.deleted_at IS NULL${filter.clause}`,
        [actor.schoolId, ...filter.params],
      );

    if (assignments.length === 0) return { range, items: [] };

    const teacherHalaqat = new Map<number, Set<number>>();
    const allHalaqaIds = new Set<number>();
    for (const a of assignments) {
      const tid = Number(a.teacherId);
      const hid = Number(a.halaqaId);
      if (!teacherHalaqat.has(tid)) teacherHalaqat.set(tid, new Set());
      teacherHalaqat.get(tid)!.add(hid);
      allHalaqaIds.add(hid);
    }
    const teacherIds = [...teacherHalaqat.keys()];
    const halaqaIds = [...allHalaqaIds];

    // Students per halaqa (active).
    const enrollRows: Array<{ halaqaId: number; studentId: number }> =
      await this.dataSource.query(
        `SELECT halaqa_id AS halaqaId, student_id AS studentId
           FROM student_halaqa
          WHERE status = 'active' AND halaqa_id IN (${this.inList(halaqaIds)})`,
        halaqaIds,
      );
    const halaqaStudents = new Map<number, number[]>();
    const allStudentIds = new Set<number>();
    for (const r of enrollRows) {
      const hid = Number(r.halaqaId);
      const sid = Number(r.studentId);
      if (!halaqaStudents.has(hid)) halaqaStudents.set(hid, []);
      halaqaStudents.get(hid)!.push(sid);
      allStudentIds.add(sid);
    }

    // Teacher own attendance, student attendance, student pages, names.
    const [ownAtt, studentAtt, studentPages, names] = await Promise.all([
      this.attendanceByUser(actor.schoolId, teacherIds, range),
      this.attendanceByStudent(actor.schoolId, [...allStudentIds], range),
      this.hifzPagesByStudent(actor.schoolId, [...allStudentIds], range),
      this.resolveUserNames(teacherIds, actor.schoolId),
    ]);

    const items: TeacherCommitmentDto[] = teacherIds.map((tid) => {
      const halaqaSet = teacherHalaqat.get(tid)!;
      const studentSet = new Set<number>();
      for (const hid of halaqaSet)
        for (const sid of halaqaStudents.get(hid) ?? []) studentSet.add(sid);

      let sPresent = 0;
      let sTotal = 0;
      let pages = 0;
      for (const sid of studentSet) {
        const a = studentAtt.get(sid);
        if (a) {
          sPresent += a.present;
          sTotal += a.total;
        }
        pages += studentPages.get(sid) ?? 0;
      }

      const own = ownAtt.get(tid);
      return {
        teacher_id: tid,
        teacher_name: names.get(tid) ?? `#${tid}`,
        attendance_rate:
          own && own.total > 0 ? ratio(own.present, own.total) : null,
        halaqat: halaqaSet.size,
        students: studentSet.size,
        student_attendance_rate: ratio(sPresent, sTotal),
        student_pages: round2(pages),
      };
    });

    items.sort(
      (x, y) =>
        (y.attendance_rate ?? -1) - (x.attendance_rate ?? -1) ||
        y.student_pages - x.student_pages,
    );
    return { range, items };
  }

  private async attendanceByUser(
    schoolId: number,
    userIds: number[],
    range: DateRange,
  ): Promise<Map<number, { present: number; total: number }>> {
    const map = new Map<number, { present: number; total: number }>();
    if (userIds.length === 0) return map;
    const rows: Array<{ id: number; present: string; total: string }> =
      await this.dataSource.query(
        `SELECT user_id AS id,
                COALESCE(SUM(status IN ('present','late')),0) AS present,
                COUNT(*) AS total
           FROM teacher_attendances
          WHERE school_id = ?
            AND attendance_date BETWEEN ? AND ?
            AND user_id IN (${this.inList(userIds)})
          GROUP BY user_id`,
        [schoolId, range.from, range.to, ...userIds],
      );
    for (const r of rows)
      map.set(Number(r.id), {
        present: Number(r.present),
        total: Number(r.total),
      });
    return map;
  }

  private async attendanceByStudent(
    schoolId: number,
    studentIds: number[],
    range: DateRange,
  ): Promise<Map<number, { present: number; total: number }>> {
    const map = new Map<number, { present: number; total: number }>();
    if (studentIds.length === 0) return map;
    const rows: Array<{ id: number; present: string; total: string }> =
      await this.dataSource.query(
        `SELECT student_id AS id,
                COALESCE(SUM(status IN ('present','late')),0) AS present,
                COUNT(*) AS total
           FROM student_attendances
          WHERE school_id = ?
            AND attendance_date BETWEEN ? AND ?
            AND student_id IN (${this.inList(studentIds)})
          GROUP BY student_id`,
        [schoolId, range.from, range.to, ...studentIds],
      );
    for (const r of rows)
      map.set(Number(r.id), {
        present: Number(r.present),
        total: Number(r.total),
      });
    return map;
  }

  /** SUM(total_pages) of approved Hifz achievements per student, in the period. */
  private async hifzPagesByStudent(
    schoolId: number,
    studentIds: number[],
    range: DateRange,
  ): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (studentIds.length === 0) return map;
    const rows: Array<{ id: number; pages: string }> =
      await this.dataSource.query(
        `SELECT student_id AS id, COALESCE(SUM(total_pages),0) AS pages
           FROM achievements
          WHERE school_id = ?
            AND status = 'approved'
            AND deleted_at IS NULL
            AND track_type = 'Hifz'
            AND date BETWEEN ? AND ?
            AND student_id IN (${this.inList(studentIds)})
          GROUP BY student_id`,
        [schoolId, range.from, range.to, ...studentIds],
      );
    for (const r of rows) map.set(Number(r.id), Number(r.pages));
    return map;
  }

  private async resolveUserNames(
    ids: number[],
    schoolId: number,
  ): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    if (ids.length === 0) return map;
    const rows: Array<{ id: number; name: string }> =
      await this.dataSource.query(
        `SELECT id, name FROM users
          WHERE id IN (${this.inList(ids)}) AND school_id = ?`,
        [...ids, schoolId],
      );
    for (const r of rows) map.set(Number(r.id), r.name);
    return map;
  }

  // ─── Alerts ─────────────────────────────────────────────────────────────────

  private async computeAlerts(
    actor: AuthenticatedUser,
    query: {
      period?: Period;
      from?: string;
      to?: string;
      stalledDays?: number;
      absenceThreshold?: number;
    },
  ): Promise<AlertsDto> {
    const range = resolveRange(query);
    const scope = await this.scopeService.resolve(actor);
    const stalledDays = Math.min(90, Math.max(1, query.stalledDays ?? 7));
    const absenceThreshold = Math.min(
      90,
      Math.max(1, query.absenceThreshold ?? 2),
    );

    const empty: AlertsDto = {
      range,
      stalled_days: stalledDays,
      stalled_students: [],
      halaqat_without_teacher: [],
      high_absence_teachers: [],
    };
    if (this.isEmpty(scope)) return empty;

    // Staff commitment (other teachers' absences) is above the teacher role —
    // same rule as overview's teacher_attendance_rate and /dashboard/teachers.
    const showStaff =
      this.scopeService.isAdmin(actor) ||
      actor.roles.some((r) => r.slug === 'supervisor');

    const [stalled, noTeacher, highAbsence] = await Promise.all([
      this.stalledStudents(actor.schoolId, scope, daysAgo(stalledDays)),
      this.halaqatWithoutTeacher(actor.schoolId, scope),
      showStaff
        ? this.highAbsenceTeachers(
            actor.schoolId,
            scope,
            range,
            absenceThreshold,
          )
        : Promise.resolve([] as typeof empty.high_absence_teachers),
    ]);

    return {
      range,
      stalled_days: stalledDays,
      stalled_students: stalled,
      halaqat_without_teacher: noTeacher,
      high_absence_teachers: highAbsence,
    };
  }

  private async stalledStudents(
    schoolId: number,
    scope: HalaqaScope,
    cutoff: string,
  ): Promise<StalledStudentDto[]> {
    const filter = scope.all
      ? { clause: '', params: [] as number[] }
      : {
          clause: ` AND sh.halaqa_id IN (${this.inList(scope.halaqaIds)})`,
          params: scope.halaqaIds,
        };
    // NOTE: the ORDER BY repeats `MAX(a.date)` instead of reusing the `lastDate`
    // alias. MySQL/MariaDB accept a *bare* aggregate alias in ORDER BY, but
    // reject one nested in an expression ("Reference 'lastDate' not supported
    // (reference to group function)"), which `lastDate IS NOT NULL` is. The
    // sort puts never-achieved students first, then the longest-stalled.
    const rows: Array<{
      studentId: number;
      studentName: string;
      lastDate: string | null;
    }> = await this.dataSource.query(
      `SELECT s.id AS studentId, s.name AS studentName, MAX(a.date) AS lastDate
         FROM students s
         JOIN student_halaqa sh ON sh.student_id = s.id AND sh.status = 'active'
         LEFT JOIN achievements a
                ON a.student_id = s.id
               AND a.status = 'approved'
               AND a.deleted_at IS NULL
        WHERE s.school_id = ?
          AND s.status = 'active'
          AND s.deleted_at IS NULL${filter.clause}
        GROUP BY s.id, s.name
       HAVING lastDate IS NULL OR lastDate < ?
        ORDER BY MAX(a.date) IS NOT NULL, MAX(a.date) ASC
        LIMIT 100`,
      [schoolId, ...filter.params, cutoff],
    );
    return rows.map((r) => ({
      student_id: Number(r.studentId),
      student_name: r.studentName,
      last_achievement_date: r.lastDate,
      days_since: r.lastDate === null ? null : daysSince(r.lastDate),
    }));
  }

  private async halaqatWithoutTeacher(
    schoolId: number,
    scope: HalaqaScope,
  ): Promise<HalaqaWithoutTeacherDto[]> {
    const filter = this.halaqaClause(scope, 'h.id');
    const rows: Array<{ halaqaId: number; halaqaName: string }> =
      await this.dataSource.query(
        `SELECT h.id AS halaqaId, h.name AS halaqaName
           FROM halaqat h
          WHERE h.school_id = ?
            AND h.status = 'active'
            AND h.deleted_at IS NULL${filter.clause}
            AND NOT EXISTS (
              SELECT 1 FROM halaqa_teachers ht
               WHERE ht.halaqa_id = h.id
                 AND ht.role = 'main'
                 AND ht.end_date IS NULL
            )
          ORDER BY h.name`,
        [schoolId, ...filter.params],
      );
    return rows.map((r) => ({
      halaqa_id: Number(r.halaqaId),
      halaqa_name: r.halaqaName,
    }));
  }

  private async highAbsenceTeachers(
    schoolId: number,
    scope: HalaqaScope,
    range: DateRange,
    threshold: number,
  ): Promise<HighAbsenceTeacherDto[]> {
    const teacherIds = await this.teacherIdsInScope(schoolId, scope);
    if (teacherIds.length === 0) return [];
    const rows: Array<{
      teacherId: number;
      absentDays: string;
      present: string;
      total: string;
    }> = await this.dataSource.query(
      `SELECT ta.user_id AS teacherId,
              COALESCE(SUM(ta.status = 'absent'),0) AS absentDays,
              COALESCE(SUM(ta.status IN ('present','late')),0) AS present,
              COUNT(*) AS total
         FROM teacher_attendances ta
        WHERE ta.school_id = ?
          AND ta.attendance_date BETWEEN ? AND ?
          AND ta.user_id IN (${this.inList(teacherIds)})
        GROUP BY ta.user_id
       HAVING absentDays >= ?
        ORDER BY absentDays DESC`,
      [schoolId, range.from, range.to, ...teacherIds, threshold],
    );
    const names = await this.resolveUserNames(
      rows.map((r) => Number(r.teacherId)),
      schoolId,
    );
    return rows.map((r) => ({
      teacher_id: Number(r.teacherId),
      teacher_name: names.get(Number(r.teacherId)) ?? `#${r.teacherId}`,
      absent_days: Number(r.absentDays),
      attendance_rate: ratio(Number(r.present), Number(r.total)),
    }));
  }
}
