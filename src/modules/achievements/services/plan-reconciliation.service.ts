import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { SURAH_VERSES } from '../../../quran/quran.constants';
import { Achievement } from '../entities/achievement.entity';
import type { PlanItemStatus } from '../entities/weekly-plan-item.entity';
import { WeeklyPlanItem } from '../entities/weekly-plan-item.entity';
import { WeeklyPlan } from '../entities/weekly-plan.entity';

/**
 * Week-level "invoice + payments" reconciliation between approved achievements
 * and weekly plan items. See SKILL.md §Reconciliation.
 *
 * The whole plan (week) reconciles as a unit, not one item in isolation: an
 * approved achievement on ANY day of the week can settle ANY item in that week
 * whose range it overlaps. Each achieved verse is *consumed* by a single item —
 * the earliest one (lowest day_of_week, then lowest id) claims it, so a verse
 * planned in two items only credits the first. That's why an item can't be
 * reconciled alone: what an earlier item consumes changes what's left for later
 * items.
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
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Expand a verse range into a set of 'surah:verse' keys. Cross-surah aware. */
  private expandRange(
    startSurah: number,
    startVerse: number,
    endSurah: number,
    endVerse: number,
  ): Set<string> {
    const set = new Set<string>();
    if (startSurah === endSurah) {
      for (let v = startVerse; v <= endVerse; v++)
        set.add(`${startSurah}:${v}`);
    } else {
      for (let v = startVerse; v <= SURAH_VERSES[startSurah]; v++)
        set.add(`${startSurah}:${v}`);
      for (let s = startSurah + 1; s < endSurah; s++) {
        for (let v = 1; v <= SURAH_VERSES[s]; v++) set.add(`${s}:${v}`);
      }
      for (let v = 1; v <= endVerse; v++) set.add(`${endSurah}:${v}`);
    }
    return set;
  }

  /** Add `days` days to a YYYY-MM-DD string, returns YYYY-MM-DD. Uses UTC to avoid DST shifts. */
  private addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ─── Core reconciliation ──────────────────────────────────────────────────

  /**
   * Reconciles every item in a plan (week) as a unit. Builds a per-track pool of
   * verses achieved anywhere in the week, then walks items in priority order
   * (day_of_week asc, then id asc), letting each item consume the pool verses it
   * covers. Consumed verses are removed so a later item planning the same verse
   * won't be credited again — "priority to the earliest item in the week".
   */
  async reconcilePlan(planId: number): Promise<void> {
    // Soft-deleted plans are excluded automatically via @DeleteDateColumn.
    const plan = await this.plans.findOne({
      where: { id: planId },
      relations: ['items'],
    });
    if (!plan) return;

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

    // Per-track pool of achieved verse keys. Mutable — items consume from it.
    const poolByTrack = new Map<string, Set<string>>();
    for (const ach of candidates) {
      let pool = poolByTrack.get(ach.trackType);
      if (!pool) {
        pool = new Set<string>();
        poolByTrack.set(ach.trackType, pool);
      }
      for (const key of this.expandRange(
        ach.startSurah,
        ach.startVerse,
        ach.endSurah,
        ach.endVerse,
      )) {
        pool.add(key);
      }
    }

    // Priority order: earliest day first, then explicit `order`, then creation order (id).
    const ordered = [...(plan.items ?? [])].sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.order - b.order || a.id - b.id,
    );
    const today = new Date().toISOString().slice(0, 10);

    for (const item of ordered) {
      const pool = poolByTrack.get(item.trackType);
      const itemSet = this.expandRange(
        item.startSurah,
        item.startVerse,
        item.endSurah,
        item.endVerse,
      );

      let achievedVerses = 0;
      if (pool) {
        for (const key of itemSet) {
          if (pool.has(key)) {
            achievedVerses++;
            pool.delete(key); // consume — earliest item claims the verse
          }
        }
      }

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
  }

  /**
   * Reconciles the plan that owns a single item. Kept for callers that only hold
   * an item id (e.g. after a range edit); reconciliation is always plan-wide
   * because item results are interdependent.
   */
  async reconcileItem(planItemId: number): Promise<void> {
    const item = await this.items.findOne({
      where: { id: planItemId },
      select: { id: true, weeklyPlanId: true },
    });
    if (!item) return;
    await this.reconcilePlan(item.weeklyPlanId);
  }

  /**
   * Entry point called from AchievementsService after approve/unapprove/delete.
   * Finds every plan whose week contains the achievement's date and reconciles
   * each one whole.
   */
  async reconcileForAchievement(achievementId: number): Promise<void> {
    // TypeORM automatically excludes soft-deleted achievements via @DeleteDateColumn.
    const achievement = await this.achievements.findOne({
      where: { id: achievementId },
    });
    if (!achievement) return;

    // A plan covers the achievement's date when week_start_date ∈ [date-6, date].
    const plans = await this.plans.find({
      where: {
        studentId: achievement.studentId,
        halaqaId: achievement.halaqaId,
        weekStartDate: Between(
          this.addDays(achievement.date, -6),
          achievement.date,
        ),
      },
      select: { id: true },
    });

    await Promise.all(plans.map((p) => this.reconcilePlan(p.id)));
  }
}
