import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditService } from '../../audit/audit.service';
import { Achievement } from '../entities/achievement.entity';
import type {
  AchievementStatus,
  CompletionMethod,
  RecitationMethod,
  TrackType,
} from '../entities/achievement.entity';
import { AchievementRecitationPosition } from '../entities/achievement-recitation-position.entity';
import { AchievementPositionError } from '../entities/achievement-position-error.entity';
import type { ErrorType } from '../entities/achievement-position-error.entity';
import { AttendanceQueryService } from '../../attendance/services/attendance-query.service';
import { MemorizationService } from '../../students/services/memorization.service';
import { PlanReconciliationService } from './plan-reconciliation.service';
import { QuranRangeValidator } from '../../../quran/quran-range.validator';
import { SURAH_VERSES } from '../../../quran/quran.constants';

export interface VerseRangeInput {
  startSurah: number;
  startVerse: number;
  endSurah: number;
  endVerse: number;
}

/** A single error occurrence at a QUL word span, located via client-supplied QUL data. */
export interface PositionErrorInput {
  errorType: ErrorType;
  startWordId: number;
  endWordId: number;
  surah: number;
  ayah: number;
  juz: number;
  hizb: number;
}

/** A recitation position: a verse range plus the itemized errors made there. */
export type PositionInput = VerseRangeInput & { errors?: PositionErrorInput[] };

/** The four error types, all weighted by the halaqa's `evaluation_settings`. */
export interface ErrorCounts {
  mistakesCount: number;
  warningsCount: number;
  tajweedErrorsCount: number;
  harakatErrorsCount: number;
}

/** Denormalized fields copied onto every error row from the owning achievement. */
interface AchievementErrorContext {
  schoolId: number;
  studentId: number;
  date: string;
}

const ZERO_COUNTS: ErrorCounts = {
  mistakesCount: 0,
  warningsCount: 0,
  tajweedErrorsCount: 0,
  harakatErrorsCount: 0,
};

const ERROR_TYPE_TO_COUNT: Record<ErrorType, keyof ErrorCounts> = {
  mistake: 'mistakesCount',
  warning: 'warningsCount',
  tajweed: 'tajweedErrorsCount',
  harakat: 'harakatErrorsCount',
};

/** Counts a set of errors into the four per-type totals. */
function countErrors(errors: PositionErrorInput[] = []): ErrorCounts {
  const counts = { ...ZERO_COUNTS };
  for (const e of errors) counts[ERROR_TYPE_TO_COUNT[e.errorType]]++;
  return counts;
}

/** Rolls the four per-type totals up across a set of positions. */
function sumPositionCounts(positions: PositionInput[]): ErrorCounts {
  return countErrors(positions.flatMap((p) => p.errors ?? []));
}

// ─── Input shapes (DTOs in Task 7 will satisfy these interfaces) ──────────────

export interface CreateAchievementInput {
  studentId: number;
  halaqaId: number;
  date: string;
  trackType: TrackType;
  startSurah: number;
  startVerse: number;
  endSurah: number;
  endVerse: number;
  completionMethod?: CompletionMethod;
  recitationMethod?: RecitationMethod;
  testPositions?: PositionInput[];
  // `full` only — these errors attach to the single auto-created position.
  errors?: PositionErrorInput[];
  percentageScore: number;
  teacherNotes?: string | null;
  approve?: boolean;
}

export interface UpdateAchievementInput {
  trackType?: TrackType;
  startSurah?: number;
  startVerse?: number;
  endSurah?: number;
  endVerse?: number;
  completionMethod?: CompletionMethod;
  recitationMethod?: RecitationMethod;
  testPositions?: PositionInput[];
  // `full` only — see CreateAchievementInput.
  errors?: PositionErrorInput[];
  percentageScore?: number;
  teacherNotes?: string | null;
}

export interface ListAchievementsFilter {
  studentId?: number;
  halaqaId?: number;
  date?: string;
  trackType?: TrackType;
  status?: AchievementStatus;
  recordedBy?: number;
  approvedBy?: number;
  page?: number;
  limit?: number;
}

export interface AchievementListResult {
  items: Achievement[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class AchievementsService {
  constructor(
    @InjectRepository(Achievement)
    private readonly repo: Repository<Achievement>,
    @InjectRepository(AchievementRecitationPosition)
    private readonly positions: Repository<AchievementRecitationPosition>,
    @InjectRepository(AchievementPositionError)
    private readonly positionErrors: Repository<AchievementPositionError>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly attendanceQuery: AttendanceQueryService,
    private readonly auditService: AuditService,
    private readonly reconciliation: PlanReconciliationService,
    private readonly rangeValidator: QuranRangeValidator,
    private readonly memorization: MemorizationService,
  ) {}

  private readonly logger = new Logger(AchievementsService.name);

  /**
   * Best-effort: enqueue a memorization-bitmap recompute for a Hifz achievement
   * change. Non-Hifz tracks don't affect memorization. A queue hiccup must not
   * fail the user's approve/unapprove/delete, so failures are logged, not thrown.
   */
  private async enqueueMemorization(achievement: Achievement): Promise<void> {
    if (achievement.trackType !== 'Hifz') return;
    try {
      await this.memorization.enqueueRecompute(achievement.studentId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to enqueue memorization recompute for student ${achievement.studentId}: ${message}`,
      );
    }
  }

  // ─── Recitation positions ─────────────────────────────────────────────────

  /** True if `inner` lies entirely within `outer` in Quran order (surah, then verse). */
  private isRangeWithin(
    inner: VerseRangeInput,
    outer: VerseRangeInput,
  ): boolean {
    const gte = (s: number, v: number, s2: number, v2: number) =>
      s > s2 || (s === s2 && v >= v2);
    const lte = (s: number, v: number, s2: number, v2: number) =>
      s < s2 || (s === s2 && v <= v2);
    return (
      gte(
        inner.startSurah,
        inner.startVerse,
        outer.startSurah,
        outer.startVerse,
      ) && lte(inner.endSurah, inner.endVerse, outer.endSurah, outer.endVerse)
    );
  }

  /** Validates a single error's location against its position range and QUL sanity. */
  private validatePositionError(
    e: PositionErrorInput,
    positionRange: VerseRangeInput,
  ): void {
    if (e.endWordId < e.startWordId) {
      throw new BadRequestException('end_word_id must be >= start_word_id.');
    }
    if (
      e.surah < 1 ||
      e.surah > 114 ||
      e.ayah < 1 ||
      e.ayah > SURAH_VERSES[e.surah]
    ) {
      throw new BadRequestException(
        `Invalid error location: surah ${e.surah}, ayah ${e.ayah}.`,
      );
    }
    // The error's ayah must fall within the position's verse range (Quran order).
    const point: VerseRangeInput = {
      startSurah: e.surah,
      startVerse: e.ayah,
      endSurah: e.surah,
      endVerse: e.ayah,
    };
    if (!this.isRangeWithin(point, positionRange)) {
      throw new BadRequestException(
        'Each error must fall within its position verse range.',
      );
    }
  }

  /**
   * Resolves the recitation positions for an achievement, each carrying its own
   * itemized errors:
   * - `full` → one position spanning the whole range, holding the top-level errors.
   * - `test` → the supplied positions (>=1), each valid, within the range, and
   *   holding its own errors; top-level errors are rejected.
   * Validates fully before any DB write. Does not persist.
   */
  private buildPositions(
    method: RecitationMethod,
    range: VerseRangeInput,
    testPositions?: PositionInput[],
    topLevelErrors?: PositionErrorInput[],
  ): PositionInput[] {
    if (method === 'test') {
      if (!testPositions || testPositions.length === 0) {
        throw new BadRequestException(
          'test_positions is required when recitation_method is "test".',
        );
      }
      if (topLevelErrors !== undefined) {
        throw new BadRequestException(
          'Errors are per-position when recitation_method is "test". Send them inside each test_positions entry.',
        );
      }
      for (const p of testPositions) {
        this.rangeValidator.validate(p);
        if (!this.isRangeWithin(p, range)) {
          throw new BadRequestException(
            'Each test position must fall within the achievement verse range.',
          );
        }
        for (const e of p.errors ?? []) this.validatePositionError(e, p);
      }
      return testPositions;
    }

    // full — one position over the whole range, holding the top-level errors
    if (testPositions !== undefined) {
      throw new BadRequestException(
        'test_positions is only valid when recitation_method is "test".',
      );
    }
    const position: PositionInput = { ...range, errors: topLevelErrors ?? [] };
    for (const e of position.errors ?? [])
      this.validatePositionError(e, position);
    return [position];
  }

  /**
   * Deletes existing positions for the achievement (cascading their error rows)
   * and inserts the given positions with derived counts and their error rows.
   */
  private async replacePositions(
    achievementId: number,
    positions: PositionInput[],
    ctx: AchievementErrorContext,
  ): Promise<void> {
    await this.positions.delete({ achievementId });

    for (const p of positions) {
      const counts = countErrors(p.errors);
      const positionRow = await this.positions.save(
        this.positions.create({
          achievementId,
          startSurah: p.startSurah,
          startVerse: p.startVerse,
          endSurah: p.endSurah,
          endVerse: p.endVerse,
          ...counts,
        }),
      );

      if (p.errors && p.errors.length) {
        await this.positionErrors.save(
          p.errors.map((e) =>
            this.positionErrors.create({
              positionId: positionRow.id,
              errorType: e.errorType,
              startWordId: e.startWordId,
              endWordId: e.endWordId,
              surah: e.surah,
              ayah: e.ayah,
              juz: e.juz,
              hizb: e.hizb,
              schoolId: ctx.schoolId,
              studentId: ctx.studentId,
              date: ctx.date,
            }),
          ),
        );
      }
    }
  }

  /** Loads recitation positions (with their error rows) grouped by achievement id. */
  async resolvePositions(
    achievementIds: number[],
  ): Promise<Map<number, AchievementRecitationPosition[]>> {
    const map = new Map<number, AchievementRecitationPosition[]>();
    const unique = [...new Set(achievementIds)];
    if (!unique.length) return map;
    const rows = await this.positions.find({
      where: unique.map((id) => ({ achievementId: id })),
      relations: { errors: true },
      order: { id: 'ASC', errors: { id: 'ASC' } },
    });
    for (const row of rows) {
      const list = map.get(row.achievementId) ?? [];
      list.push(row);
      map.set(row.achievementId, list);
    }
    return map;
  }

  // ─── Authorization helpers ────────────────────────────────────────────────

  private isAdmin(actor: AuthenticatedUser): boolean {
    return actor.roles.some(
      (r) => r.slug === 'principal' || r.slug === 'vice_principal',
    );
  }

  /**
   * Any role that can act on a halaqa's achievements (incl. non-primary teachers).
   * Record, approve, unapprove, edit and delete all gate on this single check —
   * there is no separate "approval authority" tier.
   */
  private async hasHalaqaScope(
    halaqaId: number,
    actor: AuthenticatedUser,
  ): Promise<boolean> {
    if (this.isAdmin(actor)) return true;

    if (actor.roles.some((r) => r.slug === 'supervisor')) {
      const rows: unknown[] = await this.dataSource.manager.query(
        'SELECT 1 FROM supervisor_halaqat WHERE supervisor_user_id = ? AND halaqa_id = ? LIMIT 1',
        [actor.id, halaqaId],
      );
      if (rows.length > 0) return true;
    }

    if (actor.roles.some((r) => r.slug === 'teacher')) {
      const rows: unknown[] = await this.dataSource.manager.query(
        'SELECT 1 FROM halaqa_teachers WHERE teacher_user_id = ? AND halaqa_id = ? AND end_date IS NULL LIMIT 1',
        [actor.id, halaqaId],
      );
      if (rows.length > 0) return true;
    }

    return false;
  }

  /** Read access: includes parents reading their own children's achievements. */
  private async hasReadScope(
    halaqaId: number,
    studentId: number,
    actor: AuthenticatedUser,
  ): Promise<boolean> {
    if (await this.hasHalaqaScope(halaqaId, actor)) return true;

    if (actor.roles.some((r) => r.slug === 'parent')) {
      const rows: unknown[] = await this.dataSource.manager.query(
        'SELECT 1 FROM student_guardians WHERE guardian_user_id = ? AND student_id = ? LIMIT 1',
        [actor.id, studentId],
      );
      return rows.length > 0;
    }

    return false;
  }

  /** Verify the student is actively enrolled in the halaqa (within the actor's school). */
  private async assertStudentEnrolledInHalaqa(
    studentId: number,
    halaqaId: number,
    schoolId: number,
  ): Promise<void> {
    const rows: unknown[] = await this.dataSource.manager.query(
      `SELECT 1 FROM student_halaqa sh
       JOIN students s ON s.id = sh.student_id
       WHERE sh.student_id = ? AND sh.halaqa_id = ?
         AND sh.status = 'active'
         AND s.school_id = ?
       LIMIT 1`,
      [studentId, halaqaId, schoolId],
    );
    if (!rows.length) {
      throw new BadRequestException(
        'Student is not actively enrolled in the selected halaqa.',
      );
    }
  }

  /** Load achievement by id, enforce school scope, throw 404 on miss or cross-school. */
  private async loadOrFail(id: number, schoolId: number): Promise<Achievement> {
    const a = await this.repo.findOne({ where: { id, schoolId } });
    if (!a) throw new NotFoundException();
    return a;
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(
    input: CreateAchievementInput,
    actor: AuthenticatedUser,
  ): Promise<Achievement> {
    // 1. Validate verse range (cheap, fail fast before any DB hit)
    const range: VerseRangeInput = {
      startSurah: input.startSurah,
      startVerse: input.startVerse,
      endSurah: input.endSurah,
      endVerse: input.endVerse,
    };
    this.rangeValidator.validate(range);

    // 1b. Resolve methods + recitation positions (validates positions & errors up front)
    const completionMethod: CompletionMethod =
      input.completionMethod ?? 'quick';
    const recitationMethod: RecitationMethod = input.recitationMethod ?? 'full';
    // New memorization (Hifz) must always be a full recitation — no partial testing.
    if (input.trackType === 'Hifz' && recitationMethod === 'test') {
      throw new BadRequestException(
        'New memorization (Hifz) must be a full recitation, not a partial test.',
      );
    }
    const positions = this.buildPositions(
      recitationMethod,
      range,
      input.testPositions,
      input.errors,
    );
    // The achievement's counts are the roll-up of its positions' errors, never client-set.
    const totals = sumPositionCounts(positions);

    // 2. Scope check
    if (!(await this.hasHalaqaScope(input.halaqaId, actor))) {
      throw new ForbiddenException('You do not have access to this halaqa.');
    }

    // 3. Student must be actively enrolled in the selected halaqa
    await this.assertStudentEnrolledInHalaqa(
      input.studentId,
      input.halaqaId,
      actor.schoolId,
    );

    // 4. Attendance check
    const attendance = await this.attendanceQuery.findForStudentOnDate(
      input.studentId,
      input.halaqaId,
      input.date,
    );
    if (attendance.id === null && attendance.status !== 'present') {
      throw new BadRequestException(
        'Attendance must be recorded for this student before achievements can be entered.',
      );
    }
    if (attendance.status === 'absent') {
      throw new BadRequestException(
        'Cannot record achievement: student was absent.',
      );
    }

    // 5. Score is computed on the frontend and supplied in the request — stored as-is.
    const percentageScore = Math.round(input.percentageScore * 100) / 100;

    // 6. Approve authority check (before persisting)
    const shouldApprove = input.approve === true;
    if (shouldApprove && !(await this.hasHalaqaScope(input.halaqaId, actor))) {
      throw new ForbiddenException(
        'You cannot approve achievements for this halaqa.',
      );
    }

    // 7. Persist
    const now = new Date();
    const achievement = this.repo.create({
      schoolId: actor.schoolId,
      studentId: input.studentId,
      halaqaId: input.halaqaId,
      recordedBy: actor.id,
      date: input.date,
      trackType: input.trackType,
      completionMethod,
      recitationMethod,
      startSurah: input.startSurah,
      startVerse: input.startVerse,
      endSurah: input.endSurah,
      endVerse: input.endVerse,
      ...totals,
      percentageScore,
      status: shouldApprove ? 'approved' : 'unapproved',
      approvedBy: shouldApprove ? actor.id : null,
      approvedAt: shouldApprove ? now : null,
      teacherNotes: input.teacherNotes ?? null,
    });
    await this.repo.save(achievement);

    // 7b. Persist recitation positions and their error rows
    await this.replacePositions(achievement.id, positions, {
      schoolId: achievement.schoolId,
      studentId: achievement.studentId,
      date: achievement.date,
    });

    // 8. Audit (always write create; write approve separately if bundled)
    await this.auditService.log({
      actor,
      action: 'achievement.create',
      entityType: 'achievement',
      entityId: achievement.id,
      newValues: {
        studentId: achievement.studentId,
        halaqaId: achievement.halaqaId,
        date: achievement.date,
        trackType: achievement.trackType,
        percentageScore: achievement.percentageScore,
      },
      description: attendance.id
        ? `created against attendance row #${attendance.id}`
        : undefined,
    });

    if (shouldApprove) {
      await this.auditService.log({
        actor,
        action: 'achievement.approve',
        entityType: 'achievement',
        entityId: achievement.id,
        newValues: { approvedBy: actor.id, approvedAt: now },
      });
    }

    // 9. Reconcile + enqueue memorization recompute if approved
    if (shouldApprove) {
      await this.reconciliation.reconcileForAchievement(achievement.id);
      await this.enqueueMemorization(achievement);
    }

    return achievement;
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findAll(
    filter: ListAchievementsFilter,
    actor: AuthenticatedUser,
  ): Promise<AchievementListResult> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));

    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.schoolId = :schoolId', { schoolId: actor.schoolId });

    // Role-based scope
    if (this.isAdmin(actor)) {
      // full school visibility — no extra constraint
    } else if (actor.roles.some((r) => r.slug === 'supervisor')) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM supervisor_halaqat sh
          WHERE sh.halaqa_id = a.halaqaId AND sh.supervisor_user_id = :actorId
        )`,
        { actorId: actor.id },
      );
    } else if (actor.roles.some((r) => r.slug === 'teacher')) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM halaqa_teachers ht
          WHERE ht.halaqa_id = a.halaqaId AND ht.teacher_user_id = :actorId AND ht.end_date IS NULL
        )`,
        { actorId: actor.id },
      );
    } else if (actor.roles.some((r) => r.slug === 'parent')) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM student_guardians sg
          WHERE sg.student_id = a.studentId AND sg.guardian_user_id = :actorId
        )`,
        { actorId: actor.id },
      );
    }

    // Optional filters
    if (filter.studentId !== undefined)
      qb.andWhere('a.studentId = :studentId', { studentId: filter.studentId });
    if (filter.halaqaId !== undefined)
      qb.andWhere('a.halaqaId = :halaqaId', { halaqaId: filter.halaqaId });
    if (filter.date !== undefined)
      qb.andWhere('a.date = :date', { date: filter.date });
    if (filter.trackType !== undefined)
      qb.andWhere('a.trackType = :trackType', { trackType: filter.trackType });
    if (filter.status !== undefined)
      qb.andWhere('a.status = :status', { status: filter.status });
    if (filter.recordedBy !== undefined)
      qb.andWhere('a.recordedBy = :recordedBy', {
        recordedBy: filter.recordedBy,
      });
    if (filter.approvedBy !== undefined)
      qb.andWhere('a.approvedBy = :approvedBy', {
        approvedBy: filter.approvedBy,
      });

    qb.orderBy('a.date', 'DESC').addOrderBy('a.id', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: number, actor: AuthenticatedUser): Promise<Achievement> {
    const achievement = await this.loadOrFail(id, actor.schoolId);

    if (
      !(await this.hasReadScope(
        achievement.halaqaId,
        achievement.studentId,
        actor,
      ))
    ) {
      throw new NotFoundException();
    }

    return achievement;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(
    id: number,
    input: UpdateAchievementInput,
    actor: AuthenticatedUser,
  ): Promise<Achievement> {
    const achievement = await this.loadOrFail(id, actor.schoolId);

    if (achievement.status === 'approved') {
      throw new BadRequestException(
        'Approved achievement is locked. Unapprove it first.',
      );
    }

    if (!(await this.hasHalaqaScope(achievement.halaqaId, actor))) {
      throw new NotFoundException();
    }

    if (input.trackType !== undefined) achievement.trackType = input.trackType;
    if (input.startSurah !== undefined)
      achievement.startSurah = input.startSurah;
    if (input.startVerse !== undefined)
      achievement.startVerse = input.startVerse;
    if (input.endSurah !== undefined) achievement.endSurah = input.endSurah;
    if (input.endVerse !== undefined) achievement.endVerse = input.endVerse;
    if (input.percentageScore !== undefined) {
      achievement.percentageScore =
        Math.round(input.percentageScore * 100) / 100;
    }
    if (input.completionMethod !== undefined)
      achievement.completionMethod = input.completionMethod;
    if (input.recitationMethod !== undefined)
      achievement.recitationMethod = input.recitationMethod;
    if ('teacherNotes' in input)
      achievement.teacherNotes = input.teacherNotes ?? null;

    // New memorization (Hifz) must always be a full recitation — no partial testing.
    if (
      achievement.trackType === 'Hifz' &&
      achievement.recitationMethod === 'test'
    ) {
      throw new BadRequestException(
        'New memorization (Hifz) must be a full recitation, not a partial test.',
      );
    }

    if (input.startSurah !== undefined || input.endSurah !== undefined) {
      this.rangeValidator.validate({
        startSurah: achievement.startSurah,
        startVerse: achievement.startVerse,
        endSurah: achievement.endSurah,
        endVerse: achievement.endVerse,
      });
    }

    // Regenerate positions when the method, the positions, or the errors are
    // sent. Sending errors replaces the position's errors wholesale (and thus
    // the derived counts). A bare range edit leaves existing positions untouched
    // (client's responsibility to resend them).
    let newPositions: PositionInput[] | null = null;
    if (
      input.recitationMethod !== undefined ||
      input.testPositions !== undefined ||
      input.errors !== undefined
    ) {
      newPositions = this.buildPositions(
        achievement.recitationMethod,
        {
          startSurah: achievement.startSurah,
          startVerse: achievement.startVerse,
          endSurah: achievement.endSurah,
          endVerse: achievement.endVerse,
        },
        input.testPositions,
        input.errors,
      );
      Object.assign(achievement, sumPositionCounts(newPositions));
    }

    await this.repo.save(achievement);

    if (newPositions) {
      await this.replacePositions(achievement.id, newPositions, {
        schoolId: achievement.schoolId,
        studentId: achievement.studentId,
        date: achievement.date,
      });
    }

    await this.auditService.log({
      actor,
      action: 'achievement.update',
      entityType: 'achievement',
      entityId: achievement.id,
      newValues: { ...input },
    });

    return achievement;
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async softDelete(id: number, actor: AuthenticatedUser): Promise<void> {
    const achievement = await this.loadOrFail(id, actor.schoolId);
    const wasApproved = achievement.status === 'approved';

    // Approved or not, any in-scope role may delete. Gating the approved case
    // harder would be theatre: an in-scope actor can unapprove then delete.
    if (!(await this.hasHalaqaScope(achievement.halaqaId, actor))) {
      throw new NotFoundException();
    }

    await this.repo.softRemove(achievement);

    await this.auditService.log({
      actor,
      action: 'achievement.delete',
      entityType: 'achievement',
      entityId: id,
      newValues: { was_approved: wasApproved },
    });

    if (wasApproved) {
      await this.reconciliation.reconcileForAchievement(id);
      await this.enqueueMemorization(achievement);
    }
  }

  // ─── Approve ──────────────────────────────────────────────────────────────

  async approve(id: number, actor: AuthenticatedUser): Promise<Achievement> {
    const achievement = await this.loadOrFail(id, actor.schoolId);

    if (!(await this.hasHalaqaScope(achievement.halaqaId, actor))) {
      throw new ForbiddenException(
        'You cannot approve achievements for this halaqa.',
      );
    }

    if (achievement.status === 'approved') {
      throw new BadRequestException('Achievement is already approved.');
    }

    const now = new Date();
    achievement.status = 'approved';
    achievement.approvedBy = actor.id;
    achievement.approvedAt = now;
    await this.repo.save(achievement);

    await this.auditService.log({
      actor,
      action: 'achievement.approve',
      entityType: 'achievement',
      entityId: id,
      newValues: { approvedBy: actor.id, approvedAt: now },
    });

    await this.reconciliation.reconcileForAchievement(id);
    await this.enqueueMemorization(achievement);

    return achievement;
  }

  // ─── User name resolution (for mapper) ───────────────────────────────────

  async resolveUserNames(
    ids: number[],
    schoolId: number,
  ): Promise<Map<number, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const ph = unique.map(() => '?').join(', ');
    const rows: { id: number; name: string }[] =
      await this.dataSource.manager.query(
        `SELECT id, name FROM users WHERE id IN (${ph}) AND school_id = ? LIMIT ${unique.length}`,
        [...unique, schoolId],
      );
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /** studentId → name, for display denormalization on achievement responses. */
  async resolveStudentNames(
    ids: number[],
    schoolId: number,
  ): Promise<Map<number, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const ph = unique.map(() => '?').join(', ');
    const rows: { id: number; name: string }[] =
      await this.dataSource.manager.query(
        `SELECT id, name FROM students WHERE id IN (${ph}) AND school_id = ? LIMIT ${unique.length}`,
        [...unique, schoolId],
      );
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  // ─── Unapprove ────────────────────────────────────────────────────────────

  async unapprove(id: number, actor: AuthenticatedUser): Promise<Achievement> {
    const achievement = await this.loadOrFail(id, actor.schoolId);

    if (!(await this.hasHalaqaScope(achievement.halaqaId, actor))) {
      throw new ForbiddenException(
        'You cannot unapprove achievements for this halaqa.',
      );
    }

    if (achievement.status === 'unapproved') {
      throw new BadRequestException('Achievement is not currently approved.');
    }

    const oldApprovedBy = achievement.approvedBy;
    const oldApprovedAt = achievement.approvedAt;

    // Flip status; preserve approved_by and approved_at per SKILL.md
    achievement.status = 'unapproved';
    await this.repo.save(achievement);

    await this.auditService.log({
      actor,
      action: 'achievement.unapprove',
      entityType: 'achievement',
      entityId: id,
      oldValues: {
        approvedBy: oldApprovedBy,
        approvedAt: oldApprovedAt,
        status: 'approved',
      },
    });

    await this.reconciliation.reconcileForAchievement(id);
    await this.enqueueMemorization(achievement);

    return achievement;
  }
}
