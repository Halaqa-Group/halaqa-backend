import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { DomainEvents } from '../../../common/events/domain-events';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditService } from '../../audit/audit.service';
import { QuranRangeValidator } from '../../../quran/quran-range.validator';
import type { TrackType } from '../entities/achievement.entity';
import { WeeklyPlanItem } from '../entities/weekly-plan-item.entity';
import type { WeeklyPlanStatus } from '../entities/weekly-plan.entity';
import { WeeklyPlan } from '../entities/weekly-plan.entity';
import { PlanReconciliationService } from './plan-reconciliation.service';

/** UTC-safe date add on YYYY-MM-DD (v1 runs on UTC). */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface CreateWeeklyPlanItemInput {
  trackType: TrackType;
  dayOfWeek: number;
  order?: number;
  startSurah: number;
  startVerse: number;
  endSurah: number;
  endVerse: number;
}

export interface CreateWeeklyPlanInput {
  studentId: number;
  halaqaId: number;
  weekStartDate: string;
  items: CreateWeeklyPlanItemInput[];
}

export interface ListWeeklyPlansFilter {
  studentId?: number;
  halaqaId?: number;
  weekStartDate?: string;
  status?: WeeklyPlanStatus;
  page?: number;
  limit?: number;
}

export interface WeeklyPlanListResult {
  items: WeeklyPlan[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class WeeklyPlansService {
  constructor(
    @InjectRepository(WeeklyPlan)
    private readonly plans: Repository<WeeklyPlan>,
    @InjectRepository(WeeklyPlanItem)
    private readonly planItems: Repository<WeeklyPlanItem>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly reconciliation: PlanReconciliationService,
    private readonly rangeValidator: QuranRangeValidator,
    private readonly domainEvents: DomainEvents,
  ) {}

  /**
   * Signals that an approved plan's presence changed (approve/unapprove/delete),
   * invalidating saved reports for each weekday the plan has items (§28.4).
   */
  private async emitForPlanDays(plan: WeeklyPlan): Promise<void> {
    const items = await this.planItems.find({
      where: { weeklyPlanId: plan.id },
      select: { dayOfWeek: true },
    });
    const days = [...new Set(items.map((i) => i.dayOfWeek))];
    for (const day of days) {
      this.domainEvents.emitReportSourceChanged({
        studentId: plan.studentId,
        halaqaId: plan.halaqaId,
        date: addDays(plan.weekStartDate, day),
      });
    }
  }

  // ─── Authorization helpers ────────────────────────────────────────────────

  private isAdmin(actor: AuthenticatedUser): boolean {
    return actor.roles.some(
      (r) => r.slug === 'principal' || r.slug === 'vice_principal',
    );
  }

  /**
   * Any role that can act on a halaqa's plans (incl. non-primary teachers).
   * Create, approve, unapprove and delete all gate on this one check — there is
   * no separate primary-teacher tier.
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

  /** Read access: halaqa scope, or parent of the student (read-only). */
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

  private async loadOrFail(id: number, schoolId: number): Promise<WeeklyPlan> {
    const plan = await this.plans.findOne({
      where: { id, schoolId },
      relations: ['items'],
    });
    if (!plan) throw new NotFoundException();
    return plan;
  }

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

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(
    input: CreateWeeklyPlanInput,
    actor: AuthenticatedUser,
  ): Promise<WeeklyPlan> {
    if (!(await this.hasHalaqaScope(input.halaqaId, actor))) {
      throw new ForbiddenException(
        'You do not have permission to create plans for this halaqa.',
      );
    }

    // Student must be actively enrolled in the selected halaqa
    await this.assertStudentEnrolledInHalaqa(
      input.studentId,
      input.halaqaId,
      actor.schoolId,
    );

    // Conflict check — returns existing_plan_id so caller can reference it
    const existing = await this.plans.findOne({
      where: {
        schoolId: actor.schoolId,
        studentId: input.studentId,
        halaqaId: input.halaqaId,
        weekStartDate: input.weekStartDate,
      },
    });
    if (existing) {
      throw new ConflictException({
        message: 'Plan already exists for this student/halaqa/week.',
        existing_plan_id: existing.id,
      });
    }

    // Validate all item ranges before persisting anything
    for (const item of input.items) {
      this.rangeValidator.validate({
        startSurah: item.startSurah,
        startVerse: item.startVerse,
        endSurah: item.endSurah,
        endVerse: item.endVerse,
      });
    }

    // Build plan with items; cascade: ['insert'] on the relation handles item inserts
    const plan = this.plans.create({
      schoolId: actor.schoolId,
      studentId: input.studentId,
      halaqaId: input.halaqaId,
      weekStartDate: input.weekStartDate,
      status: 'draft',
      approvedBy: null,
      items: input.items.map((item) =>
        this.planItems.create({
          trackType: item.trackType,
          dayOfWeek: item.dayOfWeek,
          order: item.order ?? 0,
          startSurah: item.startSurah,
          startVerse: item.startVerse,
          endSurah: item.endSurah,
          endVerse: item.endVerse,
          totalVerses: this.rangeValidator.countVerses({
            startSurah: item.startSurah,
            startVerse: item.startVerse,
            endSurah: item.endSurah,
            endVerse: item.endVerse,
          }),
          achievedVerses: 0,
          status: 'due',
          isManualOverride: 0,
        }),
      ),
    });

    try {
      await this.plans.save(plan);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as any).driverError?.code === 'ER_DUP_ENTRY'
      ) {
        const dup = await this.plans.findOne({
          where: {
            schoolId: actor.schoolId,
            studentId: input.studentId,
            halaqaId: input.halaqaId,
            weekStartDate: input.weekStartDate,
          },
        });
        throw new ConflictException({
          message: 'Plan already exists for this student/halaqa/week.',
          existing_plan_id: dup?.id ?? null,
        });
      }
      throw err;
    }

    await this.auditService.log({
      actor,
      action: 'weekly_plan.create',
      entityType: 'weekly_plan',
      entityId: plan.id,
      newValues: {
        studentId: plan.studentId,
        halaqaId: plan.halaqaId,
        weekStartDate: plan.weekStartDate,
        items_count: input.items.length,
      },
    });

    // Items are seeded at achieved_verses = 0 / 'due'. If approved achievements
    // already exist in this week (plan created mid-week or backdated), those
    // seeds are wrong the moment they are written — reconcile before returning.
    await this.reconciliation.reconcileStudentWeek(
      plan.studentId,
      plan.weekStartDate,
    );
    plan.items = await this.planItems.find({
      where: { weeklyPlanId: plan.id },
      order: { id: 'ASC' },
    });

    return plan;
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findAll(
    filter: ListWeeklyPlansFilter,
    actor: AuthenticatedUser,
  ): Promise<WeeklyPlanListResult> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));

    const qb = this.plans
      .createQueryBuilder('wp')
      .leftJoinAndSelect('wp.items', 'items')
      .where('wp.schoolId = :schoolId', { schoolId: actor.schoolId });

    if (this.isAdmin(actor)) {
      // full school visibility
    } else if (actor.roles.some((r) => r.slug === 'supervisor')) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM supervisor_halaqat sh WHERE sh.halaqa_id = wp.halaqaId AND sh.supervisor_user_id = :actorId)`,
        { actorId: actor.id },
      );
    } else if (actor.roles.some((r) => r.slug === 'teacher')) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM halaqa_teachers ht WHERE ht.halaqa_id = wp.halaqaId AND ht.teacher_user_id = :actorId AND ht.end_date IS NULL)`,
        { actorId: actor.id },
      );
    } else if (actor.roles.some((r) => r.slug === 'parent')) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM student_guardians sg WHERE sg.student_id = wp.studentId AND sg.guardian_user_id = :actorId)`,
        { actorId: actor.id },
      );
    }

    if (filter.studentId !== undefined)
      qb.andWhere('wp.studentId = :studentId', { studentId: filter.studentId });
    if (filter.halaqaId !== undefined)
      qb.andWhere('wp.halaqaId = :halaqaId', { halaqaId: filter.halaqaId });
    if (filter.weekStartDate !== undefined)
      qb.andWhere('wp.weekStartDate = :weekStartDate', {
        weekStartDate: filter.weekStartDate,
      });
    if (filter.status !== undefined)
      qb.andWhere('wp.status = :status', { status: filter.status });

    qb.orderBy('wp.weekStartDate', 'DESC').addOrderBy('wp.id', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: number, actor: AuthenticatedUser): Promise<WeeklyPlan> {
    const plan = await this.loadOrFail(id, actor.schoolId);
    if (!(await this.hasReadScope(plan.halaqaId, plan.studentId, actor))) {
      throw new NotFoundException();
    }
    return plan;
  }

  // ─── Approve ──────────────────────────────────────────────────────────────

  async approve(id: number, actor: AuthenticatedUser): Promise<WeeklyPlan> {
    const plan = await this.loadOrFail(id, actor.schoolId);

    if (!(await this.hasHalaqaScope(plan.halaqaId, actor))) {
      throw new ForbiddenException(
        'You do not have permission to approve plans for this halaqa.',
      );
    }

    if (plan.status === 'approved') {
      throw new BadRequestException('Plan is already approved.');
    }

    plan.status = 'approved';
    plan.approvedBy = actor.id;
    await this.plans.save(plan);

    await this.auditService.log({
      actor,
      action: 'weekly_plan.approve',
      entityType: 'weekly_plan',
      entityId: id,
      newValues: { approvedBy: actor.id },
    });

    // Reconcile the student's whole week now that this plan is approved.
    await this.reconciliation.reconcileStudentWeek(
      plan.studentId,
      plan.weekStartDate,
    );
    await this.emitForPlanDays(plan);

    return this.loadOrFail(id, actor.schoolId);
  }

  // ─── Unapprove ────────────────────────────────────────────────────────────

  async unapprove(id: number, actor: AuthenticatedUser): Promise<WeeklyPlan> {
    const plan = await this.loadOrFail(id, actor.schoolId);

    if (!(await this.hasHalaqaScope(plan.halaqaId, actor))) {
      throw new ForbiddenException(
        'You do not have permission to unapprove plans for this halaqa.',
      );
    }

    if (plan.status === 'draft') {
      throw new BadRequestException('Plan is not currently approved.');
    }

    const oldApprovedBy = plan.approvedBy;
    plan.status = 'draft';
    // approved_by preserved per SKILL.md (only status flipped)
    await this.plans.save(plan);

    await this.auditService.log({
      actor,
      action: 'weekly_plan.unapprove',
      entityType: 'weekly_plan',
      entityId: id,
      oldValues: { approvedBy: oldApprovedBy, status: 'approved' },
    });

    // Was approved (fed the report), now draft (does not) — recalc affected days.
    await this.emitForPlanDays(plan);

    return this.loadOrFail(id, actor.schoolId);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  async hardDelete(id: number, actor: AuthenticatedUser): Promise<void> {
    const plan = await this.loadOrFail(id, actor.schoolId);

    if (!(await this.hasHalaqaScope(plan.halaqaId, actor))) {
      throw new ForbiddenException(
        'You do not have permission to delete plans for this halaqa.',
      );
    }

    const wasApproved = plan.status === 'approved';

    // Capture affected days before the items cascade-delete with the plan.
    if (wasApproved) await this.emitForPlanDays(plan);

    // Hard delete: the row is permanently removed. weekly_plan_items cascade-delete
    // via their ON DELETE CASCADE foreign key.
    await this.plans.remove(plan);

    await this.auditService.log({
      actor,
      action: 'weekly_plan.delete',
      entityType: 'weekly_plan',
      entityId: id,
      newValues: { was_approved: wasApproved },
    });
  }
}
