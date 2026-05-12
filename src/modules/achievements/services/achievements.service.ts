import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditService } from '../../audit/audit.service';
import { Achievement } from '../entities/achievement.entity';
import type { AchievementStatus, TrackType } from '../entities/achievement.entity';
import { AttendanceQueryService } from '../stubs/attendance-query.stub';
import { PlanReconciliationService } from './plan-reconciliation.service';
import { QuranRangeValidator } from '../../../quran/quran-range.validator';

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
  mistakesCount?: number;
  warningsCount?: number;
  tajweedErrorsCount?: number;
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
  mistakesCount?: number;
  warningsCount?: number;
  tajweedErrorsCount?: number;
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
    @InjectRepository(Achievement) private readonly repo: Repository<Achievement>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly attendanceQuery: AttendanceQueryService,
    private readonly auditService: AuditService,
    private readonly reconciliation: PlanReconciliationService,
    private readonly rangeValidator: QuranRangeValidator,
  ) {}

  // ─── Authorization helpers ────────────────────────────────────────────────

  private isAdmin(actor: AuthenticatedUser): boolean {
    return actor.roles.some((r) => r.slug === 'principal' || r.slug === 'vice_principal');
  }

  private isPrincipal(actor: AuthenticatedUser): boolean {
    return actor.roles.some((r) => r.slug === 'principal');
  }

  /** Any role that can record achievements for a halaqa (incl. non-primary teachers). */
  private async hasHalaqaScope(halaqaId: number, actor: AuthenticatedUser): Promise<boolean> {
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

  /** Principal/VP, supervisor in scope, or primary/acting teacher. */
  private async hasApprovalAuthority(halaqaId: number, actor: AuthenticatedUser): Promise<boolean> {
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
        `SELECT 1 FROM halaqa_teachers
         WHERE teacher_user_id = ? AND halaqa_id = ? AND end_date IS NULL
           AND (role = 'main' OR acting_as_primary = 1) LIMIT 1`,
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
      throw new BadRequestException('Student is not actively enrolled in the selected halaqa.');
    }
  }

  /** Load achievement by id, enforce school scope, throw 404 on miss or cross-school. */
  private async loadOrFail(id: number, schoolId: number): Promise<Achievement> {
    const a = await this.repo.findOne({ where: { id, schoolId } });
    if (!a) throw new NotFoundException();
    return a;
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(input: CreateAchievementInput, actor: AuthenticatedUser): Promise<Achievement> {
    // 1. Validate verse range (cheap, fail fast before any DB hit)
    this.rangeValidator.validate({
      startSurah: input.startSurah,
      startVerse: input.startVerse,
      endSurah: input.endSurah,
      endVerse: input.endVerse,
    });

    // 2. Scope check
    if (!(await this.hasHalaqaScope(input.halaqaId, actor))) {
      throw new ForbiddenException('You do not have access to this halaqa.');
    }

    // 3. Student must be actively enrolled in the selected halaqa
    await this.assertStudentEnrolledInHalaqa(input.studentId, input.halaqaId, actor.schoolId);

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
      throw new BadRequestException('Cannot record achievement: student was absent.');
    }

    // 5. Score is computed on the frontend and supplied in the request — stored as-is.
    const percentageScore = Math.round(input.percentageScore * 100) / 100;

    // 6. Approve authority check (before persisting)
    const shouldApprove = input.approve === true;
    if (shouldApprove && !(await this.hasApprovalAuthority(input.halaqaId, actor))) {
      throw new ForbiddenException('You cannot approve achievements for this halaqa.');
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
      startSurah: input.startSurah,
      startVerse: input.startVerse,
      endSurah: input.endSurah,
      endVerse: input.endVerse,
      mistakesCount: input.mistakesCount ?? 0,
      warningsCount: input.warningsCount ?? 0,
      tajweedErrorsCount: input.tajweedErrorsCount ?? 0,
      percentageScore,
      status: shouldApprove ? 'approved' : 'unapproved',
      approvedBy: shouldApprove ? actor.id : null,
      approvedAt: shouldApprove ? now : null,
      teacherNotes: input.teacherNotes ?? null,
    });
    await this.repo.save(achievement);

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
      description: attendance.id ? `created against attendance row #${attendance.id}` : undefined,
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

    // 9. Reconcile if approved
    if (shouldApprove) {
      await this.reconciliation.reconcileForAchievement(achievement.id);
    }

    return achievement;
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findAll(filter: ListAchievementsFilter, actor: AuthenticatedUser): Promise<AchievementListResult> {
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

    // Parents cannot filter/sort by fields they cannot see
    const isParent = actor.roles.some((r) => r.slug === 'parent') && !this.isAdmin(actor);
    if (isParent && (filter.recordedBy !== undefined || filter.approvedBy !== undefined)) {
      throw new BadRequestException('Filter not available for this role.');
    }

    // Optional filters
    if (filter.studentId !== undefined) qb.andWhere('a.studentId = :studentId', { studentId: filter.studentId });
    if (filter.halaqaId !== undefined) qb.andWhere('a.halaqaId = :halaqaId', { halaqaId: filter.halaqaId });
    if (filter.date !== undefined) qb.andWhere('a.date = :date', { date: filter.date });
    if (filter.trackType !== undefined) qb.andWhere('a.trackType = :trackType', { trackType: filter.trackType });
    if (filter.status !== undefined) qb.andWhere('a.status = :status', { status: filter.status });
    if (filter.recordedBy !== undefined) qb.andWhere('a.recordedBy = :recordedBy', { recordedBy: filter.recordedBy });
    if (filter.approvedBy !== undefined) qb.andWhere('a.approvedBy = :approvedBy', { approvedBy: filter.approvedBy });

    qb.orderBy('a.date', 'DESC').addOrderBy('a.id', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: number, actor: AuthenticatedUser): Promise<Achievement> {
    const achievement = await this.loadOrFail(id, actor.schoolId);

    if (!(await this.hasReadScope(achievement.halaqaId, achievement.studentId, actor))) {
      throw new NotFoundException();
    }

    return achievement;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(id: number, input: UpdateAchievementInput, actor: AuthenticatedUser): Promise<Achievement> {
    const achievement = await this.loadOrFail(id, actor.schoolId);

    if (achievement.status === 'approved') {
      throw new BadRequestException('Approved achievement is locked. Unapprove it first.');
    }

    if (!(await this.hasHalaqaScope(achievement.halaqaId, actor))) {
      throw new NotFoundException();
    }

    if (input.trackType !== undefined) achievement.trackType = input.trackType;
    if (input.startSurah !== undefined) achievement.startSurah = input.startSurah;
    if (input.startVerse !== undefined) achievement.startVerse = input.startVerse;
    if (input.endSurah !== undefined) achievement.endSurah = input.endSurah;
    if (input.endVerse !== undefined) achievement.endVerse = input.endVerse;
    if (input.mistakesCount !== undefined) achievement.mistakesCount = input.mistakesCount;
    if (input.warningsCount !== undefined) achievement.warningsCount = input.warningsCount;
    if (input.tajweedErrorsCount !== undefined) achievement.tajweedErrorsCount = input.tajweedErrorsCount;
    if (input.percentageScore !== undefined) {
      achievement.percentageScore = Math.round(input.percentageScore * 100) / 100;
    }
    if ('teacherNotes' in input) achievement.teacherNotes = input.teacherNotes ?? null;

    if (input.startSurah !== undefined || input.endSurah !== undefined) {
      this.rangeValidator.validate({
        startSurah: achievement.startSurah,
        startVerse: achievement.startVerse,
        endSurah: achievement.endSurah,
        endVerse: achievement.endVerse,
      });
    }

    await this.repo.save(achievement);

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

    if (wasApproved) {
      // Approved achievements: principal ONLY (VP cannot delete)
      if (!this.isPrincipal(actor)) {
        throw new ForbiddenException('Only the principal can delete approved achievements.');
      }
    } else {
      // Unapproved: any in-scope role
      if (!(await this.hasHalaqaScope(achievement.halaqaId, actor))) {
        throw new NotFoundException();
      }
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
    }
  }

  // ─── Approve ──────────────────────────────────────────────────────────────

  async approve(id: number, actor: AuthenticatedUser): Promise<Achievement> {
    const achievement = await this.loadOrFail(id, actor.schoolId);

    if (!(await this.hasApprovalAuthority(achievement.halaqaId, actor))) {
      throw new ForbiddenException('You cannot approve achievements for this halaqa.');
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

    return achievement;
  }

  // ─── User name resolution (for mapper) ───────────────────────────────────

  async resolveUserNames(ids: number[], schoolId: number): Promise<Map<number, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const ph = unique.map(() => '?').join(', ');
    const rows: { id: number; name: string }[] = await this.dataSource.manager.query(
      `SELECT id, name FROM users WHERE id IN (${ph}) AND school_id = ? LIMIT ${unique.length}`,
      [...unique, schoolId],
    );
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  // ─── Unapprove ────────────────────────────────────────────────────────────

  async unapprove(id: number, actor: AuthenticatedUser): Promise<Achievement> {
    const achievement = await this.loadOrFail(id, actor.schoolId);

    if (!this.isAdmin(actor)) {
      throw new ForbiddenException('Only principal or vice_principal can unapprove achievements.');
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
      oldValues: { approvedBy: oldApprovedBy, approvedAt: oldApprovedAt, status: 'approved' },
    });

    await this.reconciliation.reconcileForAchievement(id);

    return achievement;
  }
}
