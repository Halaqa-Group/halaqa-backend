import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SURAH_VERSES } from '../../../quran/quran.constants';
import { Achievement } from '../entities/achievement.entity';
import type { PlanItemStatus } from '../entities/weekly-plan-item.entity';
import { WeeklyPlanItem } from '../entities/weekly-plan-item.entity';

/**
 * Implements the "invoice + payments" reconciliation between approved achievements
 * and weekly plan items. Each plan item is an invoice; each approved achievement
 * covering overlapping verses is a payment. See SKILL.md §Reconciliation.
 */
@Injectable()
export class PlanReconciliationService {
  constructor(
    @InjectRepository(WeeklyPlanItem) private readonly items: Repository<WeeklyPlanItem>,
    @InjectRepository(Achievement) private readonly achievements: Repository<Achievement>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Expand a verse range into a set of 'surah:verse' keys. Cross-surah aware. */
  private expandRange(startSurah: number, startVerse: number, endSurah: number, endVerse: number): Set<string> {
    const set = new Set<string>();
    if (startSurah === endSurah) {
      for (let v = startVerse; v <= endVerse; v++) set.add(`${startSurah}:${v}`);
    } else {
      for (let v = startVerse; v <= SURAH_VERSES[startSurah]; v++) set.add(`${startSurah}:${v}`);
      for (let s = startSurah + 1; s < endSurah; s++) {
        for (let v = 1; v <= SURAH_VERSES[s]; v++) set.add(`${s}:${v}`);
      }
      for (let v = 1; v <= endVerse; v++) set.add(`${endSurah}:${v}`);
    }
    return set;
  }

  /** Set intersection of two verse-key sets. */
  private intersect(a: Set<string>, b: Set<string>): Set<string> {
    const result = new Set<string>();
    for (const key of a) {
      if (b.has(key)) result.add(key);
    }
    return result;
  }

  /** Add `days` days to a YYYY-MM-DD string, returns YYYY-MM-DD. Uses UTC to avoid DST shifts. */
  private addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ─── Core reconciliation ──────────────────────────────────────────────────

  /**
   * Recomputes `achieved_verses` and `status` for a single plan item by summing
   * the union of all approved-achievement verse overlaps for that item's day.
   */
  async reconcileItem(planItemId: number): Promise<void> {
    const item = await this.items.findOne({
      where: { id: planItemId },
      relations: ['weeklyPlan'],
    });
    if (!item) return;

    const plan = item.weeklyPlan;
    const itemDate = this.addDays(plan.weekStartDate, item.dayOfWeek);

    // All approved non-deleted achievements that could contribute to this item
    const candidates = await this.achievements.find({
      where: {
        studentId: plan.studentId,
        halaqaId: plan.halaqaId,
        date: itemDate,
        trackType: item.trackType,
        status: 'approved',
      },
    });

    const itemSet = this.expandRange(item.startSurah, item.startVerse, item.endSurah, item.endVerse);
    const union = new Set<string>();

    for (const ach of candidates) {
      const achSet = this.expandRange(ach.startSurah, ach.startVerse, ach.endSurah, ach.endVerse);
      for (const key of this.intersect(achSet, itemSet)) union.add(key);
    }

    const achievedVerses = union.size;

    let status: PlanItemStatus;
    if (achievedVerses >= item.totalVerses) {
      status = 'completed';
    } else if (achievedVerses > 0) {
      status = 'partial';
    } else {
      const today = new Date().toISOString().slice(0, 10);
      status = itemDate < today ? 'overdue' : 'due';
    }

    await this.items.update(planItemId, { achievedVerses, status });
  }

  /**
   * Entry point called from AchievementsService after approve/unapprove/delete.
   * Finds every plan item whose computed date matches the achievement's date,
   * then reconciles each one.
   */
  async reconcileForAchievement(achievementId: number): Promise<void> {
    // Load without scope guard — this is an internal trigger, not an HTTP action.
    // TypeORM automatically excludes soft-deleted achievements via @DeleteDateColumn.
    const achievement = await this.achievements.findOne({ where: { id: achievementId } });
    if (!achievement) return;

    const rows: { id: number }[] = await this.dataSource.manager.query(
      `SELECT wpi.id
       FROM weekly_plan_items wpi
       JOIN weekly_plans wp ON wp.id = wpi.weekly_plan_id
       WHERE wp.student_id = ?
         AND wp.halaqa_id = ?
         AND wp.deleted_at IS NULL
         AND wpi.track_type = ?
         AND DATE_ADD(wp.week_start_date, INTERVAL wpi.day_of_week DAY) = ?`,
      [achievement.studentId, achievement.halaqaId, achievement.trackType, achievement.date],
    );

    await Promise.all(rows.map((r) => this.reconcileItem(r.id)));
  }
}
