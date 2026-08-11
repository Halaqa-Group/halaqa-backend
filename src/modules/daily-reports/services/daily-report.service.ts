import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  EntityManager,
  In,
  IsNull,
  Repository,
  type FindOptionsWhere,
} from 'typeorm';
import { ApiMessage } from '../../../common/api-message';
import { shortNameSql } from '../../../common/person-name';
import { roundHalfUp } from '../../../common/rounding';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AchievementPlanItemLink } from '../../achievements/entities/achievement-plan-item-link.entity';
import type { TrackType } from '../../achievements/entities/achievement.entity';
import { WeeklyPlan } from '../../achievements/entities/weekly-plan.entity';
import { activeOnDate } from '../../attendance/attendance-visibility.sql';
import { StudentAttendance } from '../../attendance/entities/student-attendance.entity';
import { Halaqa } from '../../halaqat/entities/halaqa.entity';
import { StudentHalaqaEnrollment } from '../../halaqat/entities/student-halaqa-enrollment.entity';
import type {
  DailyReportResponse,
  StudentDetailResponse,
  StudentReportRow,
  StudentTrackDetail,
} from '../dto/daily-report.responses';
import { DailyHalaqaReport } from '../entities/daily-halaqa-report.entity';
import { DailyStudentEvaluation } from '../entities/daily-student-evaluation.entity';
import type { EvaluationAttendanceStatus } from '../entities/daily-student-evaluation.entity';
import { ALERTS } from '../logic/alerts';
import {
  assembleTrack,
  type PlannedItemInput,
  type ReconcileResult,
  type SettledLinkInput,
} from '../logic/reconciliation';
import { computeStudentScores } from '../logic/scoring';
import { redistributeWeights } from '../logic/weight-redistribution';
import type { SystemAlert, TrackReconciliation } from '../types/report-json';

const TRACKS: TrackType[] = ['Hifz', 'Near', 'Far'];
export const CALCULATION_VERSION = 'daily-report-v1';

/** UTC-safe date add on a YYYY-MM-DD string (v1 runs on UTC — plan §1). */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Saturday … 6 = Friday (matches weekly_plan_items.day_of_week). */
function dayOfWeek(dateStr: string): number {
  return (new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 1) % 7;
}

interface StudentComputation {
  row: StudentReportRow;
  detail: Omit<StudentDetailResponse, 'halaqa_id' | 'date' | 'source'>;
}

@Injectable()
export class DailyReportService {
  private readonly logger = new Logger(DailyReportService.name);

  constructor(
    @InjectRepository(Halaqa)
    private readonly halaqat: Repository<Halaqa>,
    @InjectRepository(StudentHalaqaEnrollment)
    private readonly enrollments: Repository<StudentHalaqaEnrollment>,
    @InjectRepository(StudentAttendance)
    private readonly attendances: Repository<StudentAttendance>,
    @InjectRepository(WeeklyPlan)
    private readonly plans: Repository<WeeklyPlan>,
    @InjectRepository(AchievementPlanItemLink)
    private readonly links: Repository<AchievementPlanItemLink>,
    @InjectRepository(DailyHalaqaReport)
    private readonly reports: Repository<DailyHalaqaReport>,
    @InjectRepository(DailyStudentEvaluation)
    private readonly evaluations: Repository<DailyStudentEvaluation>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  async getDailyReport(
    halaqaId: number,
    date: string,
    actor: AuthenticatedUser,
  ): Promise<DailyReportResponse> {
    const halaqa = await this.loadHalaqa(halaqaId, actor.schoolId);

    // Past weeks: serve the saved snapshot (§28.1/§28.3). The current week is
    // always computed live. Until a snapshot exists (before the weekly job runs)
    // we fall back to a live recompute rather than error, since source data is
    // intact and reproducible.
    if (date < this.currentWeekStart()) {
      const snapshot = await this.loadSnapshot(halaqa, date);
      if (snapshot) return snapshot;
    }

    const weights = this.weightsOf(halaqa);

    if (!(await this.isWorkingDay(halaqa.schoolId, date))) {
      return {
        halaqa_id: halaqaId,
        date,
        source: 'live',
        day_status: 'non_working_day',
        report_status: 'complete',
        weights,
        students: [],
      };
    }

    const computed = await this.computeStudents(halaqa, date);
    const anyMissing = computed.some(
      (c) => c.row.attendance_status === 'missing_attendance',
    );

    return {
      halaqa_id: halaqaId,
      date,
      source: 'live',
      day_status: 'working_day',
      report_status: anyMissing ? 'partial' : 'complete',
      weights,
      students: computed.map((c) => c.row),
    };
  }

  async getStudentDetail(
    halaqaId: number,
    date: string,
    studentId: number,
    actor: AuthenticatedUser,
  ): Promise<StudentDetailResponse> {
    const halaqa = await this.loadHalaqa(halaqaId, actor.schoolId);
    const computed = await this.computeStudents(halaqa, date, studentId);
    const one = computed[0];
    if (!one) throw new NotFoundException();
    return { halaqa_id: halaqaId, date, source: 'live', ...one.detail };
  }

  // ─── Data loading ───────────────────────────────────────────────────────────

  private async loadHalaqa(id: number, schoolId: number): Promise<Halaqa> {
    const halaqa = await this.halaqat.findOne({
      where: { id, schoolId },
      withDeleted: true,
    });
    if (!halaqa) throw new NotFoundException();
    return halaqa;
  }

  private weightsOf(halaqa: Halaqa) {
    return {
      hifz: Number(halaqa.hifzWeight),
      near: Number(halaqa.nearWeight),
      far: Number(halaqa.farWeight),
      ethics: Number(halaqa.ethicsWeight),
    };
  }

  /** Saturday (0=Sat convention) of the current week, YYYY-MM-DD, UTC (§28.1). */
  private currentWeekStart(): string {
    const today = new Date().toISOString().slice(0, 10);
    return addDays(today, -dayOfWeek(today));
  }

  // ─── Persistence (weekly snapshot + recalculation) ──────────────────────────

  /**
   * Computes one day for a halaqa and writes it to the report tables, replacing
   * any existing report for (halaqa, date) in place — never a second version
   * (§28.4). `generatedBy`/`reason` are set on first write; a re-run updates
   * `recalculated_*`. Used by both the weekly snapshot cron and recalculation.
   */
  async persistDay(
    halaqa: Halaqa,
    date: string,
    actorId: number | null,
    reason: string | null,
  ): Promise<void> {
    const working = await this.isWorkingDay(halaqa.schoolId, date);
    const weights = this.weightsOf(halaqa);
    const academicWeight = 100 - weights.ethics;
    const now = new Date();

    const computed = working ? await this.computeStudents(halaqa, date) : [];
    const anyMissing = computed.some(
      (c) => c.row.attendance_status === 'missing_attendance',
    );
    const dayStatus = working ? 'working_day' : 'non_working_day';
    const reportStatus = anyMissing ? 'partial' : 'complete';

    await this.dataSource.transaction(async (em) => {
      let header = await em.findOne(DailyHalaqaReport, {
        where: { halaqaId: halaqa.id, reportDate: date },
      });
      if (header) {
        Object.assign(header, {
          schoolId: halaqa.schoolId,
          dayStatus,
          reportStatus,
          hifzWeight: weights.hifz,
          nearWeight: weights.near,
          farWeight: weights.far,
          ethicsWeight: weights.ethics,
          academicWeight,
          calculationVersion: CALCULATION_VERSION,
          recalculatedAt: now,
          recalculatedBy: actorId,
          recalculationReason: reason,
        });
        await em.save(header);
        await em.delete(DailyStudentEvaluation, { dailyReportId: header.id });
      } else {
        header = em.create(DailyHalaqaReport, {
          schoolId: halaqa.schoolId,
          halaqaId: halaqa.id,
          reportDate: date,
          dayStatus,
          reportStatus,
          hifzWeight: weights.hifz,
          nearWeight: weights.near,
          farWeight: weights.far,
          ethicsWeight: weights.ethics,
          academicWeight,
          calculationVersion: CALCULATION_VERSION,
          generatedAt: now,
          generatedBy: actorId,
          recalculationReason: reason,
        });
        await em.save(header);
      }

      if (computed.length) {
        const rows = computed.map((c) =>
          this.toEvaluationEntity(em, header.id, academicWeight, c),
        );
        await em.save(rows);
      }
    });
  }

  private toEvaluationEntity(
    em: EntityManager,
    dailyReportId: number,
    academicWeight: number,
    c: StudentComputation,
  ): DailyStudentEvaluation {
    const d = c.detail;
    return em.create(DailyStudentEvaluation, {
      dailyReportId,
      studentId: d.student_id,
      attendanceStatus: d.attendance_status,
      teacherNote: d.teacher_note,
      systemAlerts: d.system_alerts,
      calculationDetails: {
        version: CALCULATION_VERSION,
        academicWeight,
        effectiveWeights: {
          hifz: d.hifz.effective_weight,
          near: d.near.effective_weight,
          far: d.far.effective_weight,
        },
      },
      hifzBaseWeight: d.hifz.base_weight,
      hifzEffectiveWeight: d.hifz.effective_weight,
      hifzPlannedPages: d.hifz.planned_pages,
      hifzAchievedPages: d.hifz.achieved_pages,
      hifzCompletionRate: d.hifz.completion_rate,
      hifzQualityRate: d.hifz.quality_rate,
      hifzScore: d.hifz.score,
      hifzReconciliation: d.hifz.reconciliation,
      nearBaseWeight: d.near.base_weight,
      nearEffectiveWeight: d.near.effective_weight,
      nearPlannedPages: d.near.planned_pages,
      nearAchievedPages: d.near.achieved_pages,
      nearCompletionRate: d.near.completion_rate,
      nearQualityRate: d.near.quality_rate,
      nearScore: d.near.score,
      nearReconciliation: d.near.reconciliation,
      farBaseWeight: d.far.base_weight,
      farEffectiveWeight: d.far.effective_weight,
      farPlannedPages: d.far.planned_pages,
      farAchievedPages: d.far.achieved_pages,
      farCompletionRate: d.far.completion_rate,
      farQualityRate: d.far.quality_rate,
      farScore: d.far.score,
      farReconciliation: d.far.reconciliation,
      ethicsRating: d.ethics_rating,
      ethicsScore: d.ethics_score,
      overallPlanCompletionRate: d.plan_completion_rate,
      totalScore: d.total_score,
    });
  }

  /** Reads a saved report for (halaqa, date) as a response, or null if none. */
  private async loadSnapshot(
    halaqa: Halaqa,
    date: string,
  ): Promise<DailyReportResponse | null> {
    const header = await this.reports.findOne({
      where: { halaqaId: halaqa.id, reportDate: date },
    });
    if (!header) return null;

    const rows = await this.evaluations.find({
      where: { dailyReportId: header.id },
      order: { id: 'ASC' },
    });
    const names = await this.resolveNames(
      rows.map((r) => r.studentId),
      halaqa.schoolId,
    );

    const numOrNull = (v: number | null) => (v == null ? null : Number(v));
    return {
      halaqa_id: halaqa.id,
      date,
      source: 'snapshot',
      day_status: header.dayStatus,
      report_status: header.reportStatus,
      weights: {
        hifz: Number(header.hifzWeight),
        near: Number(header.nearWeight),
        far: Number(header.farWeight),
        ethics: Number(header.ethicsWeight),
      },
      students: rows.map((r) => ({
        student_id: r.studentId,
        student_name: names.get(r.studentId) ?? '',
        attendance_status: r.attendanceStatus,
        hifz_score: Number(r.hifzScore),
        near_score: Number(r.nearScore),
        far_score: Number(r.farScore),
        ethics_score: numOrNull(r.ethicsScore),
        plan_completion_rate: numOrNull(r.overallPlanCompletionRate),
        total_score: numOrNull(r.totalScore),
        teacher_note: r.teacherNote,
        system_alerts: r.systemAlerts ?? [],
      })),
    };
  }

  /** Manual recalculation of one day (§29.3): replaces the saved report + audit. */
  async recalculateDay(
    halaqaId: number,
    date: string,
    reason: string | null,
    actor: AuthenticatedUser,
  ): Promise<ApiMessage> {
    const halaqa = await this.loadHalaqa(halaqaId, actor.schoolId);
    await this.persistDay(halaqa, date, actor.id, reason);
    return new ApiMessage('Daily report recalculated.');
  }

  /**
   * Snapshots every active halaqa for the 7 days of the week starting `weekStart`
   * (§28.2). Each (halaqa, day) is isolated: a failure is logged and skipped so
   * one bad day never aborts the run.
   */
  async persistWeek(
    weekStart: string,
  ): Promise<{ halaqat: number; failures: number }> {
    const halaqat = await this.halaqat.find({ where: { status: 'active' } });
    let failures = 0;
    for (const halaqa of halaqat) {
      for (let i = 0; i < 7; i++) {
        const date = addDays(weekStart, i);
        try {
          await this.persistDay(halaqa, date, null, null);
        } catch (err) {
          failures++;
          this.logger.error(
            `snapshot failed for halaqa ${halaqa.id} on ${date}`,
            err instanceof Error ? err.stack : String(err),
          );
        }
      }
    }
    return { halaqat: halaqat.length, failures };
  }

  /** The week-start date of the most recently finished week (previous Saturday). */
  previousWeekStart(): string {
    return addDays(this.currentWeekStart(), -7);
  }

  private async resolveNames(
    studentIds: number[],
    schoolId: number,
  ): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    if (!studentIds.length) return map;
    const rows: { id: number; name: string }[] = await this.dataSource.query(
      `SELECT id, ${shortNameSql()} AS name FROM students WHERE id IN (${studentIds
        .map(() => '?')
        .join(',')}) AND school_id = ?`,
      [...studentIds, schoolId],
    );
    for (const r of rows) map.set(Number(r.id), r.name);
    return map;
  }

  /** A school day = an operating weekday (school_schedules) that is not a holiday. */
  private async isWorkingDay(schoolId: number, date: string): Promise<boolean> {
    const rows: { ok: number }[] = await this.dataSource.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM school_schedules ss
           WHERE ss.school_id = ?
             AND ss.day_of_week = (WEEKDAY(?) + 2) % 7
             AND ss.effective_from <= ?
             AND (ss.effective_to IS NULL OR ss.effective_to >= ?)
         )
         AND NOT EXISTS (
           SELECT 1 FROM holidays h
           WHERE h.school_id = ? AND h.holiday_date = ?
         ) AS ok`,
      [schoolId, date, date, date, schoolId, date],
    );
    return Boolean(Number(rows[0]?.ok ?? 0));
  }

  /** Active members of the halaqa on `date` (§8.2), with short display name. */
  private async loadStudents(
    halaqaId: number,
    date: string,
  ): Promise<{ id: number; name: string }[]> {
    const rows = await this.enrollments
      .createQueryBuilder('e')
      .innerJoin('students', 's', 's.id = e.studentId')
      .select('e.studentId', 'id')
      .addSelect(shortNameSql('s'), 'name')
      .where('e.halaqaId = :halaqaId', { halaqaId })
      .andWhere('e.startDate <= :date', { date })
      .andWhere('(e.endDate IS NULL OR e.endDate >= :date)', { date })
      .andWhere('e.status = :status', { status: 'active' })
      // A soft-deleted student stays in the reports of the days they attended
      // and drops out from their deletion date onward — same cut-off the
      // attendance lists and dashboard aggregations use.
      .andWhere(activeOnDate('s', ':date'))
      .orderBy('s.name', 'ASC')
      .getRawMany<{ id: number; name: string }>();
    return rows.map((r) => ({ id: Number(r.id), name: r.name }));
  }

  // ─── Core computation ───────────────────────────────────────────────────────

  private async computeStudents(
    halaqa: Halaqa,
    date: string,
    onlyStudentId?: number,
  ): Promise<StudentComputation[]> {
    let students = await this.loadStudents(halaqa.id, date);
    if (onlyStudentId !== undefined)
      students = students.filter((s) => s.id === onlyStudentId);
    if (!students.length) return [];

    const studentIds = students.map((s) => s.id);
    const dow = dayOfWeek(date);

    // Attendance rows (missing row → missing_attendance).
    const attendanceRows = await this.attendances.find({
      where: { studentId: In(studentIds), attendanceDate: date },
    });
    const attendanceByStudent = new Map<number, StudentAttendance>(
      attendanceRows.map((a) => [a.studentId, a]),
    );

    // Approved plan items for this weekday, grouped by student → track → items.
    const plans = await this.plans.find({
      where: {
        halaqaId: halaqa.id,
        studentId: In(studentIds),
        status: 'approved',
        weekStartDate: Between(addDays(date, -6), date),
      },
      relations: ['items'],
    });
    const plannedByStudent = new Map<
      number,
      Map<TrackType, PlannedItemInput[]>
    >();
    const studentOfItem = new Map<number, number>();
    for (const plan of plans) {
      for (const item of plan.items ?? []) {
        if (item.dayOfWeek !== dow) continue;
        studentOfItem.set(item.id, plan.studentId);
        let byTrack = plannedByStudent.get(plan.studentId);
        if (!byTrack) {
          byTrack = new Map();
          plannedByStudent.set(plan.studentId, byTrack);
        }
        const list = byTrack.get(item.trackType) ?? [];
        list.push({
          planItemId: item.id,
          startSurah: item.startSurah,
          startVerse: item.startVerse,
          endSurah: item.endSurah,
          endVerse: item.endVerse,
        });
        byTrack.set(item.trackType, list);
      }
    }

    // The settlement links, computed and stored once by the plan reconciliation.
    // The report does no range matching of its own — it reads which achievement
    // credited which part of which plan item.
    //
    // Two sets are loaded: the links of the items planned for THIS weekday (an
    // achievement anywhere in the plan's week may settle them — reconciliation is
    // week-scoped), and the outside-plan links recorded ON this date (recitation
    // that no item of the week planned).
    const linkedByStudent = await this.loadLinks(
      plans.map((p) => p.id),
      [...studentOfItem.keys()],
      studentOfItem,
      date,
    );

    const base = this.weightsOf(halaqa);

    const emptyPlanned = new Map<TrackType, PlannedItemInput[]>();
    const emptyLinks = new Map<TrackType, SettledLinkInput[]>();
    return students.map((student) =>
      this.computeOne(
        student,
        base,
        attendanceByStudent.get(student.id),
        plannedByStudent.get(student.id) ?? emptyPlanned,
        linkedByStudent.get(student.id) ?? emptyLinks,
      ),
    );
  }

  /**
   * Settlement links for the day, grouped student → track. Returns nothing when
   * the day has no planned items (there is then nothing to attribute against).
   */
  private async loadLinks(
    planIds: number[],
    dayItemIds: number[],
    studentOfItem: Map<number, number>,
    date: string,
  ): Promise<Map<number, Map<TrackType, SettledLinkInput[]>>> {
    const byStudent = new Map<number, Map<TrackType, SettledLinkInput[]>>();
    if (!planIds.length) return byStudent;

    const where: FindOptionsWhere<AchievementPlanItemLink>[] = [
      {
        weeklyPlanId: In(planIds),
        weeklyPlanItemId: IsNull(),
        achievementDate: date,
      },
    ];
    if (dayItemIds.length) where.push({ weeklyPlanItemId: In(dayItemIds) });

    const rows = await this.links.find({ where });

    for (const r of rows) {
      // Outside-plan rows carry no item, so their student comes off the row.
      const studentId =
        r.weeklyPlanItemId != null
          ? (studentOfItem.get(r.weeklyPlanItemId) ?? r.studentId)
          : r.studentId;
      let byTrack = byStudent.get(studentId);
      if (!byTrack) {
        byTrack = new Map();
        byStudent.set(studentId, byTrack);
      }
      const list = byTrack.get(r.trackType) ?? [];
      list.push({
        planItemId: r.weeklyPlanItemId,
        // achievement_id is BIGINT — coerce so it never reaches the stored JSON
        // as a string if the driver ever switches to bigNumberStrings.
        achievementId: Number(r.achievementId),
        achievementDate: r.achievementDate,
        percentageScore: Number(r.percentageScore),
        startGlobalAyah: r.startGlobalAyah,
        endGlobalAyah: r.endGlobalAyah,
        creditedPages: Number(r.creditedPages),
      });
      byTrack.set(r.trackType, list);
    }
    return byStudent;
  }

  private computeOne(
    student: { id: number; name: string },
    base: { hifz: number; near: number; far: number; ethics: number },
    attendance: StudentAttendance | undefined,
    planned: Map<TrackType, PlannedItemInput[]>,
    links: Map<TrackType, SettledLinkInput[]>,
  ): StudentComputation {
    const attendanceStatus: EvaluationAttendanceStatus = attendance
      ? attendance.status
      : 'missing_attendance';

    const plannedTracks = new Set<TrackType>(
      TRACKS.filter((t) => (planned.get(t)?.length ?? 0) > 0),
    );
    const eff = redistributeWeights(base, plannedTracks);
    const effByTrack: Record<TrackType, number> = {
      Hifz: eff.hifz,
      Near: eff.near,
      Far: eff.far,
    };
    const baseByTrack: Record<TrackType, number> = {
      Hifz: base.hifz,
      Near: base.near,
      Far: base.far,
    };

    // Assemble each planned track from its stored links; absent achievements are
    // handled by the scorer.
    const recon: Record<TrackType, ReconcileResult | null> = {
      Hifz: null,
      Near: null,
      Far: null,
    };
    for (const t of TRACKS) {
      if (!plannedTracks.has(t)) continue;
      recon[t] = assembleTrack(t, planned.get(t) ?? [], links.get(t) ?? []);
    }

    const trackInput = (t: TrackType) => ({
      effectiveWeight: effByTrack[t],
      completionRate: recon[t]?.completionRate ?? 0,
      qualityRate: recon[t]?.qualityRate ?? 0,
    });

    const ethicsRating =
      attendance && attendance.ethicsRating != null
        ? Number(attendance.ethicsRating)
        : null;

    const scores = computeStudentScores({
      attendance: attendanceStatus,
      academicWeight: eff.academicWeight,
      ethicsWeight: base.ethics,
      ethicsRating,
      hifz: trackInput('Hifz'),
      near: trackInput('Near'),
      far: trackInput('Far'),
    });

    const alerts = this.buildAlerts(attendanceStatus, plannedTracks, recon);

    const round = (v: number | null) => (v == null ? null : roundHalfUp(v, 2));
    const teacherNote = attendance?.dailyNote ?? null;

    const row: StudentReportRow = {
      student_id: student.id,
      student_name: student.name,
      attendance_status: attendanceStatus,
      hifz_score: roundHalfUp(scores.hifzScore, 2),
      near_score: roundHalfUp(scores.nearScore, 2),
      far_score: roundHalfUp(scores.farScore, 2),
      ethics_score: round(scores.ethicsScore),
      plan_completion_rate: round(scores.overallPlanCompletionRate),
      total_score: round(scores.totalScore),
      teacher_note: teacherNote,
      system_alerts: alerts,
    };

    const trackDetail = (t: TrackType): StudentTrackDetail => {
      const r = recon[t];
      const trackScoreValue =
        t === 'Hifz'
          ? scores.hifzScore
          : t === 'Near'
            ? scores.nearScore
            : scores.farScore;
      return {
        base_weight: roundHalfUp(baseByTrack[t], 2),
        effective_weight: roundHalfUp(effByTrack[t], 2),
        planned_pages: roundHalfUp(r?.plannedPages ?? 0, 4),
        achieved_pages: roundHalfUp(r?.achievedPages ?? 0, 4),
        completion_rate: roundHalfUp(r?.completionRate ?? 0, 2),
        quality_rate: roundHalfUp(r?.qualityRate ?? 0, 2),
        score: roundHalfUp(trackScoreValue, 2),
        reconciliation: (r?.reconciliation as TrackReconciliation) ?? null,
      };
    };

    return {
      row,
      detail: {
        student_id: student.id,
        student_name: student.name,
        attendance_status: attendanceStatus,
        hifz: trackDetail('Hifz'),
        near: trackDetail('Near'),
        far: trackDetail('Far'),
        ethics_rating: ethicsRating,
        ethics_score: round(scores.ethicsScore),
        plan_completion_rate: round(scores.overallPlanCompletionRate),
        total_score: round(scores.totalScore),
        teacher_note: teacherNote,
        system_alerts: alerts,
      },
    };
  }

  private buildAlerts(
    attendanceStatus: EvaluationAttendanceStatus,
    plannedTracks: Set<TrackType>,
    recon: Record<TrackType, ReconcileResult | null>,
  ): SystemAlert[] {
    const alerts: SystemAlert[] = [];
    if (attendanceStatus === 'missing_attendance')
      alerts.push(ALERTS.missingAttendance());
    if (plannedTracks.size === 0) alerts.push(ALERTS.noApprovedPlan());
    else if (plannedTracks.size < TRACKS.length)
      alerts.push(ALERTS.weightsRedistributed());

    let hasGaps = false;
    let hasOutside = false;
    for (const t of TRACKS) {
      const r = recon[t]?.reconciliation;
      if (!r) continue;
      if (r.gaps.length) hasGaps = true;
      if (r.outsidePlanSegments.length) hasOutside = true;
    }
    if (hasGaps) alerts.push(ALERTS.planGaps());
    if (hasOutside) alerts.push(ALERTS.outsidePlan());
    return alerts;
  }
}
