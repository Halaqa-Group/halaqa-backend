import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Achievement } from '../entities/achievement.entity';
import { WeeklyPlan } from '../entities/weekly-plan.entity';
import { WeeklyPlanItem } from '../entities/weekly-plan-item.entity';

/**
 * Implements the "invoice + payments" reconciliation between approved achievements
 * and weekly plan items. Each plan item is an invoice; each approved achievement
 * covering overlapping verses is a payment. See SKILL.md §Reconciliation.
 *
 * Fully implemented in Task 8. Methods are stubs here so AchievementsService
 * can compile and be tested before Task 8.
 */
@Injectable()
export class PlanReconciliationService {
  constructor(
    @InjectRepository(WeeklyPlanItem) private readonly items: Repository<WeeklyPlanItem>,
    @InjectRepository(WeeklyPlan) private readonly plans: Repository<WeeklyPlan>,
    @InjectRepository(Achievement) private readonly achievements: Repository<Achievement>,
  ) {}

  async reconcileItem(_planItemId: number): Promise<void> {
    // Implemented in Task 8
  }

  async reconcileForAchievement(_achievementId: number): Promise<void> {
    // Implemented in Task 8
  }
}
