/**
 * Backfills `achievement_plan_item_links` for every existing weekly plan.
 *
 * The settlement links are written by `PlanReconciliationService.reconcilePlan`,
 * which only runs on a mutation. Plans that existed before the table was
 * introduced therefore have no rows, and the daily report — which now reads the
 * links instead of re-matching ranges — would show them as achieving nothing.
 * This script reconciles every plan once so the stored links catch up.
 *
 * Safe to re-run: reconciliation is idempotent and rewrites each plan's rows
 * wholesale. It also refreshes `weekly_plan_items.achieved_verses`/`status`,
 * which is the same value they already hold.
 *
 * Past-week reports served from a snapshot are unaffected either way; recalculate
 * a day explicitly if you want a stored snapshot rebuilt.
 *
 * Usage:
 *   pnpm exec ts-node scripts/backfill-plan-item-links.ts
 */
import 'dotenv/config';
import 'reflect-metadata';
import AppDataSource from '../src/config/data-source';
import { AchievementPlanItemLink } from '../src/modules/achievements/entities/achievement-plan-item-link.entity';
import { Achievement } from '../src/modules/achievements/entities/achievement.entity';
import { WeeklyPlanItem } from '../src/modules/achievements/entities/weekly-plan-item.entity';
import { WeeklyPlan } from '../src/modules/achievements/entities/weekly-plan.entity';
import { PlanReconciliationService } from '../src/modules/achievements/services/plan-reconciliation.service';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  console.log(
    `Connected to "${process.env.DB_NAME}" @ ${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? 3306}`,
  );

  const service = new PlanReconciliationService(
    AppDataSource.getRepository(WeeklyPlanItem),
    AppDataSource.getRepository(Achievement),
    AppDataSource.getRepository(WeeklyPlan),
    AppDataSource.getRepository(AchievementPlanItemLink),
  );

  const plans = await AppDataSource.getRepository(WeeklyPlan).find({
    select: { id: true },
    order: { id: 'ASC' },
  });
  console.log(`Reconciling ${plans.length} weekly plan(s)…`);

  let done = 0;
  let failed = 0;
  for (const plan of plans) {
    try {
      await service.reconcilePlan(plan.id);
      done++;
      if (done % 100 === 0) console.log(`  …${done}/${plans.length}`);
    } catch (err) {
      failed++;
      console.error(
        `  plan ${plan.id} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const links = await AppDataSource.getRepository(
    AchievementPlanItemLink,
  ).count();
  console.log(
    `Done. ${done} plan(s) reconciled, ${failed} failed, ${links} link row(s) now stored.`,
  );

  await AppDataSource.destroy();
  if (failed) process.exitCode = 1;
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
