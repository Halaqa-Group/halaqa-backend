import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { roundHalfUp } from '../../../common/rounding';
import { toInterval } from '../../../quran/range-union';
import { AchievementPlanItemLink } from '../entities/achievement-plan-item-link.entity';
import { Achievement } from '../entities/achievement.entity';
import type { TrackType } from '../entities/achievement.entity';
import type { PlanItemStatus } from '../entities/weekly-plan-item.entity';
import { WeeklyPlanItem } from '../entities/weekly-plan-item.entity';
import { WeeklyPlan } from '../entities/weekly-plan.entity';
import { settleTrack, type SettlementAchievement } from '../logic/settlement';

/**
 * Week-level "invoice + payments" reconciliation between approved achievements
 * and weekly plan items. See SKILL.md §Reconciliation.
 *
 * The whole plan (week) reconciles as a unit, not one item in isolation: an
 * approved achievement on ANY day of the week can settle ANY item in that week
 * whose range it overlaps. Each achieved verse is *consumed* by a single item —
 * the earliest one (lowest day_of_week, then `order`, then id) claims it, so a
 * verse planned in two items only credits the first. That's why an item can't be
 * reconciled alone: what an earlier item consumes changes what's left for later
 * items.
 *
 * Every run also **rewrites the plan's `achievement_plan_item_links`** — the
 * materialized "this achievement covered this part of this item" record. The link
 * rows are the plan's, not the achievement's: any edit to the plan (including
 * moving an item to another day) deletes and rebuilds the whole week's links, so
 * an achievement is never left bound to an item's old range. The daily report
 * reads these rows instead of re-matching ranges itself.
 */
@Injectable()
export class PlanReconciliationService {
  constructor(
    @InjectRepository(WeeklyPlanItem)
    private readonly items: Repository<WeeklyPlanItem>,
    @InjectRepository(Achievement)
    private readonly achievements: Repository<Achievement>,
    @InjectRepository(WeeklyPlan)
    private readonly plans: Repository<WeeklyPlan>,
    @InjectRepository(AchievementPlanItemLink)
    private readonly links: Repository<AchievementPlanItemLink>,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Add `days` days to a YYYY-MM-DD string, returns YYYY-MM-DD. Uses UTC to avoid DST shifts. */
  private addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ─── Core reconciliation ──────────────────────────────────────────────────

  /**
   * Reconciles every item in a plan (week) as a unit and rewrites the plan's
   * settlement links. Builds a per-track pool of verses achieved anywhere in the
   * week, then walks items in priority order (day_of_week asc, `order` asc, id
   * asc), letting each item consume the pool verses it covers. Consumed verses
   * are removed so a later item planning the same verse won't be credited again —
   * "priority to the earliest item in the week".
   */
  async reconcilePlan(planId: number): Promise<void> {
    // Soft-deleted plans are excluded automatically via @DeleteDateColumn.
    const plan = await this.plans.findOne({
      where: { id: planId },
      relations: ['items'],
    });
    if (!plan) {
      // The plan is gone (or soft-deleted): its links are meaningless.
      await this.links.delete({ weeklyPlanId: planId });
      return;
    }

    const weekStart = plan.weekStartDate;
    const weekEnd = this.addDays(weekStart, 6);

    // Every approved, non-deleted achievement anywhere in the plan's week.
    const candidates = await this.achievements.find({
      where: {
        studentId: plan.studentId,
        halaqaId: plan.halaqaId,
        status: 'approved',
        date: Between(weekStart, weekEnd),
      },
    });

    const byTrack = new Map<TrackType, SettlementAchievement[]>();
    for (const ach of candidates) {
      const list = byTrack.get(ach.trackType) ?? [];
      list.push({
        id: ach.id,
        date: ach.date,
        percentageScore: Number(ach.percentageScore),
        approvedAt: ach.approvedAt ? ach.approvedAt.getTime() : 0,
        interval: toInterval(ach),
      });
      byTrack.set(ach.trackType, list);
    }

    // Priority order: earliest day first, then explicit `order`, then creation
    // order (id). Settlement consumes in exactly this order.
    const ordered = [...(plan.items ?? [])].sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.order - b.order || a.id - b.id,
    );
    const itemsByTrack = new Map<TrackType, WeeklyPlanItem[]>();
    for (const item of ordered) {
      const list = itemsByTrack.get(item.trackType) ?? [];
      list.push(item);
      itemsByTrack.set(item.trackType, list);
    }

    const today = new Date().toISOString().slice(0, 10);
    const newLinks: AchievementPlanItemLink[] = [];

    // Every track that has items OR achievements needs settling: a track with
    // achievements but no items yields only outside-plan rows.
    const tracks = new Set<TrackType>([
      ...itemsByTrack.keys(),
      ...byTrack.keys(),
    ]);

    for (const track of tracks) {
      const trackItems = itemsByTrack.get(track) ?? [];
      const settlement = settleTrack(
        trackItems.map((i) => ({ planItemId: i.id, interval: toInterval(i) })),
        byTrack.get(track) ?? [],
      );

      for (const item of trackItems) {
        const segments = settlement.byItem.get(item.id) ?? [];
        const achievedVerses = segments.reduce((sum, s) => sum + s.verses, 0);

        for (const s of segments)
          newLinks.push(
            this.links.create({
              weeklyPlanId: plan.id,
              weeklyPlanItemId: item.id,
              achievementId: s.achievementId,
              studentId: plan.studentId,
              trackType: track,
              achievementDate: s.achievementDate,
              planDayOfWeek: item.dayOfWeek,
              startGlobalAyah: s.interval[0],
              endGlobalAyah: s.interval[1],
              creditedVerses: s.verses,
              creditedPages: roundHalfUp(s.pages, 4),
              percentageScore: roundHalfUp(s.percentageScore, 2),
            }),
          );

        let status: PlanItemStatus;
        if (achievedVerses >= item.totalVerses) {
          status = 'completed';
        } else if (achievedVerses > 0) {
          status = 'partial';
        } else {
          const itemDate = this.addDays(weekStart, item.dayOfWeek);
          status = itemDate < today ? 'overdue' : 'due';
        }

        await this.items.update(item.id, { achievedVerses, status });
      }

      for (const o of settlement.outside)
        newLinks.push(
          this.links.create({
            weeklyPlanId: plan.id,
            weeklyPlanItemId: null,
            achievementId: o.achievementId,
            studentId: plan.studentId,
            trackType: track,
            achievementDate: o.achievementDate,
            planDayOfWeek: null,
            startGlobalAyah: o.interval[0],
            endGlobalAyah: o.interval[1],
            creditedVerses: o.verses,
            creditedPages: roundHalfUp(o.pages, 4),
            percentageScore: roundHalfUp(o.percentageScore, 2),
          }),
        );
    }

    // Rewrite wholesale: the plan is the unit of truth, so stale links from a
    // previous shape of the week never survive.
    await this.links.delete({ weeklyPlanId: plan.id });
    if (newLinks.length) await this.links.save(newLinks);
  }

  /**
   * Reconciles the plan that owns a single item. Kept for callers that only hold
   * an item id (e.g. after a range edit); reconciliation is always plan-wide
   * because item results are interdependent.
   */
  async reconcileItem(planItemId: number): Promise<void> {
    const item = await this.items.findOne({
      where: { id: planItemId },
      relations: ['weeklyPlan'],
    });
    if (!item?.weeklyPlan) return;
    await this.reconcileStudentWeek(
      item.weeklyPlan.studentId,
      item.weeklyPlan.weekStartDate,
    );
  }

  /**
   * Rebuilds **every link the student has for that week**, across all their plans
   * — the unit the owner asked for, not just the one plan that was touched.
   *
   * A student normally has one plan per week, so this is usually a single
   * `reconcilePlan`. It matters when they hold plans in two halaqat for the same
   * week, or when two plans' 7-day windows overlap because a `week_start_date`
   * wasn't a Saturday: reconciling only the edited plan would leave the other
   * one's links pointing at a shape of the week that no longer exists.
   */
  async reconcileStudentWeek(
    studentId: number,
    weekStartDate: string,
  ): Promise<void> {
    const plans = await this.plans.find({
      where: {
        studentId,
        // Any plan whose own week overlaps this one.
        weekStartDate: Between(
          this.addDays(weekStartDate, -6),
          this.addDays(weekStartDate, 6),
        ),
      },
      select: { id: true },
    });
    // Sequential: reconcilePlan rewrites link rows and updates items.
    for (const p of plans) await this.reconcilePlan(p.id);
  }

  /**
   * Entry point called from AchievementsService after approve/unapprove/delete.
   * Reconciles every plan of that student whose week contains the achievement's
   * date. Deliberately **not** filtered by halaqa: `reconcilePlan` already only
   * credits achievements from its own halaqa, so including the student's other
   * plans costs one cheap rebuild and guarantees no stale link survives anywhere
   * in the week.
   */
  async reconcileForAchievement(achievementId: number): Promise<void> {
    // Soft-deleted achievements must still be found here: `delete` soft-removes
    // the row *before* reconciling, and skipping would leave it credited.
    const achievement = await this.achievements.findOne({
      where: { id: achievementId },
      withDeleted: true,
    });
    if (!achievement) return;

    // A plan covers the achievement's date when week_start_date ∈ [date-6, date].
    const plans = await this.plans.find({
      where: {
        studentId: achievement.studentId,
        weekStartDate: Between(
          this.addDays(achievement.date, -6),
          achievement.date,
        ),
      },
      select: { id: true },
    });

    for (const p of plans) await this.reconcilePlan(p.id);
  }
}
