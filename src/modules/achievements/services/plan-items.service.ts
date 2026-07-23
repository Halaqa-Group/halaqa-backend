import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DomainEvents } from '../../../common/events/domain-events';
import { roundHalfUp } from '../../../common/rounding';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditService } from '../../audit/audit.service';
import { pageCoverage, verseToGlobal } from '../../../quran/page-coverage';
import { QuranRangeValidator } from '../../../quran/quran-range.validator';
import type { TrackType } from '../entities/achievement.entity';
import { WeeklyPlanItem } from '../entities/weekly-plan-item.entity';
import { WeeklyPlan } from '../entities/weekly-plan.entity';
import { PlanReconciliationService } from './plan-reconciliation.service';

/** UTC-safe date add on YYYY-MM-DD (v1 runs on UTC). */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface AddItemInput {
  trackType: TrackType;
  dayOfWeek: number;
  order?: number;
  startSurah: number;
  startVerse: number;
  endSurah: number;
  endVerse: number;
}

export interface UpdateItemInput {
  trackType?: TrackType;
  dayOfWeek?: number;
  order?: number;
  startSurah?: number;
  startVerse?: number;
  endSurah?: number;
  endVerse?: number;
}

@Injectable()
export class PlanItemsService {
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
   * Recomputes the daily-report helper columns from the item's range (§10.2,
   * §32): global ayah indices and the fractional planned page count. Kept in the
   * backend so `planned_pages` never diverges from the page-coverage algorithm.
   */
  private applyPageFields(item: WeeklyPlanItem): void {
    item.startGlobalAyah = verseToGlobal(item.startSurah, item.startVerse);
    item.endGlobalAyah = verseToGlobal(item.endSurah, item.endVerse);
    item.plannedPages = roundHalfUp(
      pageCoverage({
        startSurah: item.startSurah,
        startVerse: item.startVerse,
        endSurah: item.endSurah,
        endVerse: item.endVerse,
      }),
      4,
    );
  }

  /** Signals that an approved plan's items changed for a given weekday (§28.4). */
  private emitForItemDay(plan: WeeklyPlan, dayOfWeek: number): void {
    this.domainEvents.emitReportSourceChanged({
      studentId: plan.studentId,
      halaqaId: plan.halaqaId,
      date: addDays(plan.weekStartDate, dayOfWeek),
    });
  }

  // ─── Authorization helpers ────────────────────────────────────────────────

  private isAdmin(actor: AuthenticatedUser): boolean {
    return actor.roles.some(
      (r) => r.slug === 'principal' || r.slug === 'vice_principal',
    );
  }

  /**
   * Any role that can act on a halaqa's plan items (incl. non-primary teachers).
   * Add, edit and delete all gate on this one check — no separate authority tier.
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

  private async loadPlanOrFail(
    planId: number,
    schoolId: number,
  ): Promise<WeeklyPlan> {
    const plan = await this.plans.findOne({ where: { id: planId, schoolId } });
    if (!plan) throw new NotFoundException();
    return plan;
  }

  private async loadItemOrFail(
    itemId: number,
    schoolId: number,
  ): Promise<WeeklyPlanItem> {
    const item = await this.planItems.findOne({
      where: { id: itemId },
      relations: ['weeklyPlan'],
    });
    if (!item || item.weeklyPlan.schoolId !== schoolId)
      throw new NotFoundException();
    return item;
  }

  // ─── Add item ─────────────────────────────────────────────────────────────

  async addItem(
    planId: number,
    input: AddItemInput,
    actor: AuthenticatedUser,
  ): Promise<WeeklyPlanItem> {
    const plan = await this.loadPlanOrFail(planId, actor.schoolId);

    if (plan.status === 'approved') {
      throw new BadRequestException(
        'Cannot add items to an approved plan. Unapprove first.',
      );
    }

    if (!(await this.hasHalaqaScope(plan.halaqaId, actor))) {
      throw new ForbiddenException(
        'You do not have permission to add items to this plan.',
      );
    }

    this.rangeValidator.validate({
      startSurah: input.startSurah,
      startVerse: input.startVerse,
      endSurah: input.endSurah,
      endVerse: input.endVerse,
    });

    const item = this.planItems.create({
      weeklyPlanId: planId,
      trackType: input.trackType,
      dayOfWeek: input.dayOfWeek,
      order: input.order ?? 0,
      startSurah: input.startSurah,
      startVerse: input.startVerse,
      endSurah: input.endSurah,
      endVerse: input.endVerse,
      totalVerses: this.rangeValidator.countVerses({
        startSurah: input.startSurah,
        startVerse: input.startVerse,
        endSurah: input.endSurah,
        endVerse: input.endVerse,
      }),
      achievedVerses: 0,
      status: 'due',
      isManualOverride: 0,
    });
    this.applyPageFields(item);

    await this.planItems.save(item);

    await this.auditService.log({
      actor,
      action: 'weekly_plan_item.create',
      entityType: 'weekly_plan_item',
      entityId: item.id,
      newValues: {
        weeklyPlanId: planId,
        trackType: input.trackType,
        dayOfWeek: input.dayOfWeek,
        totalVerses: item.totalVerses,
      },
    });

    return item;
  }

  // ─── Delete item ──────────────────────────────────────────────────────────

  async deleteItem(itemId: number, actor: AuthenticatedUser): Promise<void> {
    const item = await this.loadItemOrFail(itemId, actor.schoolId);
    const plan = item.weeklyPlan;

    if (plan.status === 'approved') {
      throw new BadRequestException(
        'Cannot delete items from an approved plan. Unapprove first.',
      );
    }

    if (!(await this.hasHalaqaScope(plan.halaqaId, actor))) {
      throw new ForbiddenException(
        'You do not have permission to delete items from this plan.',
      );
    }

    await this.planItems.delete(itemId); // hard delete — no deleted_at on weekly_plan_items

    await this.auditService.log({
      actor,
      action: 'weekly_plan_item.delete',
      entityType: 'weekly_plan_item',
      entityId: itemId,
      newValues: {
        weeklyPlanId: plan.id,
        trackType: item.trackType,
        dayOfWeek: item.dayOfWeek,
      },
    });
  }

  // ─── Update item ──────────────────────────────────────────────────────────

  async updateItem(
    itemId: number,
    input: UpdateItemInput,
    actor: AuthenticatedUser,
  ): Promise<WeeklyPlanItem> {
    const item = await this.loadItemOrFail(itemId, actor.schoolId);
    const plan = item.weeklyPlan;

    // Range edits are allowed even on approved plans, but still need halaqa scope.
    if (!(await this.hasHalaqaScope(plan.halaqaId, actor))) {
      throw new ForbiddenException(
        'You do not have permission to edit items in this plan.',
      );
    }

    const oldRange = {
      startSurah: item.startSurah,
      startVerse: item.startVerse,
      endSurah: item.endSurah,
      endVerse: item.endVerse,
    };
    const oldDayOfWeek = item.dayOfWeek;

    // Determine which changes are happening
    const rangeChanged =
      input.startSurah !== undefined ||
      input.startVerse !== undefined ||
      input.endSurah !== undefined ||
      input.endVerse !== undefined;

    // Apply changes
    if (input.trackType !== undefined) item.trackType = input.trackType;
    if (input.dayOfWeek !== undefined) item.dayOfWeek = input.dayOfWeek;
    if (input.order !== undefined) item.order = input.order;
    if (input.startSurah !== undefined) item.startSurah = input.startSurah;
    if (input.startVerse !== undefined) item.startVerse = input.startVerse;
    if (input.endSurah !== undefined) item.endSurah = input.endSurah;
    if (input.endVerse !== undefined) item.endVerse = input.endVerse;

    if (rangeChanged) {
      this.rangeValidator.validate({
        startSurah: item.startSurah,
        startVerse: item.startVerse,
        endSurah: item.endSurah,
        endVerse: item.endVerse,
      });
      item.totalVerses = this.rangeValidator.countVerses({
        startSurah: item.startSurah,
        startVerse: item.startVerse,
        endSurah: item.endSurah,
        endVerse: item.endVerse,
      });
      item.isManualOverride = 1; // permanent — never reset even after unapprove/re-approve
    }

    // Recompute page helper columns whenever the range moved (§32).
    if (rangeChanged) this.applyPageFields(item);

    await this.planItems.save(item);

    await this.auditService.log({
      actor,
      action: 'weekly_plan_item.update',
      entityType: 'weekly_plan_item',
      entityId: itemId,
      oldValues: rangeChanged ? oldRange : undefined,
      newValues: {
        ...input,
        ...(rangeChanged
          ? { totalVerses: item.totalVerses, is_manual_override: 1 }
          : {}),
      },
    });

    // Reconcile whenever the matching criteria or priority (range, track_type,
    // day_of_week, order) change — order affects consumption priority in the week.
    if (
      rangeChanged ||
      input.trackType !== undefined ||
      input.dayOfWeek !== undefined ||
      input.order !== undefined
    ) {
      await this.reconciliation.reconcileItem(itemId);
    }

    // Only approved plans feed the report (§7). Editing one may invalidate a
    // saved report for the affected day(s) — old and new if the item moved.
    if (plan.status === 'approved') {
      this.emitForItemDay(plan, item.dayOfWeek);
      if (item.dayOfWeek !== oldDayOfWeek)
        this.emitForItemDay(plan, oldDayOfWeek);
    }

    return item;
  }
}
