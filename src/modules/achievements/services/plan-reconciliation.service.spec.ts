import { Achievement } from '../entities/achievement.entity';
import { WeeklyPlanItem } from '../entities/weekly-plan-item.entity';
import { WeeklyPlan } from '../entities/weekly-plan.entity';
import { PlanReconciliationService } from './plan-reconciliation.service';

function makeItem(overrides: Partial<WeeklyPlanItem> = {}): WeeklyPlanItem {
  return {
    id: 1,
    weeklyPlanId: 1,
    trackType: 'Hifz',
    dayOfWeek: 2, // week_start + 2 = 2026-05-11
    order: 0,
    startSurah: 1,
    startVerse: 1,
    endSurah: 1,
    endVerse: 7,
    totalVerses: 7,
    achievedVerses: 0,
    status: 'due',
    isManualOverride: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as WeeklyPlanItem;
}

function makePlan(overrides: Partial<WeeklyPlan> & { items?: WeeklyPlanItem[] } = {}): WeeklyPlan {
  const { items, ...rest } = overrides;
  return {
    id: 1,
    studentId: 10,
    halaqaId: 5,
    weekStartDate: '2026-05-09', // Saturday
    status: 'approved',
    deletedAt: null,
    items: items ?? [makeItem()],
    ...rest,
  } as WeeklyPlan;
}

function makeAchievement(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 100,
    schoolId: 1,
    studentId: 10,
    halaqaId: 5,
    recordedBy: 3,
    date: '2026-05-11',
    trackType: 'Hifz',
    startSurah: 1,
    startVerse: 1,
    endSurah: 1,
    endVerse: 7,
    mistakesCount: 0,
    warningsCount: 0,
    tajweedErrorsCount: 0,
    percentageScore: 100,
    status: 'approved',
    approvedBy: 2,
    approvedAt: new Date(),
    teacherNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as Achievement;
}

describe('PlanReconciliationService', () => {
  let service: PlanReconciliationService;
  let itemsRepo: jest.Mocked<{ findOne: jest.Mock; update: jest.Mock }>;
  let achievementsRepo: jest.Mocked<{ findOne: jest.Mock; find: jest.Mock }>;
  let plansRepo: jest.Mocked<{ findOne: jest.Mock; find: jest.Mock }>;

  beforeEach(() => {
    itemsRepo = { findOne: jest.fn(), update: jest.fn().mockResolvedValue(undefined) };
    achievementsRepo = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    plansRepo = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };

    service = new PlanReconciliationService(
      itemsRepo as any,
      achievementsRepo as any,
      plansRepo as any,
    );
  });

  // ─── reconcilePlan ────────────────────────────────────────────────────────

  describe('reconcilePlan', () => {
    it('marks completed when a single achievement covers the full item range', async () => {
      plansRepo.findOne.mockResolvedValue(makePlan());
      achievementsRepo.find.mockResolvedValue([
        makeAchievement({ startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 7 }),
      ]);

      await service.reconcilePlan(1);

      expect(itemsRepo.update).toHaveBeenCalledWith(1, { achievedVerses: 7, status: 'completed' });
    });

    it('marks partial when achievement covers a subset of the item range', async () => {
      plansRepo.findOne.mockResolvedValue(makePlan());
      achievementsRepo.find.mockResolvedValue([
        makeAchievement({ startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 4 }),
      ]);

      await service.reconcilePlan(1);

      expect(itemsRepo.update).toHaveBeenCalledWith(1, { achievedVerses: 4, status: 'partial' });
    });

    it('does not double-count overlapping achievements (union deduplication)', async () => {
      plansRepo.findOne.mockResolvedValue(makePlan());
      // 1:1–1:4 and 1:3–1:7 overlap at 1:3 and 1:4
      achievementsRepo.find.mockResolvedValue([
        makeAchievement({ id: 100, startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 4 }),
        makeAchievement({ id: 101, startSurah: 1, startVerse: 3, endSurah: 1, endVerse: 7 }),
      ]);

      await service.reconcilePlan(1);

      expect(itemsRepo.update).toHaveBeenCalledWith(1, { achievedVerses: 7, status: 'completed' });
    });

    it('credits an achievement recorded on a different day of the same week', async () => {
      // Item is day 2 (2026-05-11); achievement is on 2026-05-13 (day 4). Same week.
      plansRepo.findOne.mockResolvedValue(makePlan());
      achievementsRepo.find.mockResolvedValue([makeAchievement({ date: '2026-05-13' })]);

      await service.reconcilePlan(1);

      expect(itemsRepo.update).toHaveBeenCalledWith(1, { achievedVerses: 7, status: 'completed' });
    });

    it('does not credit an achievement of a different track', async () => {
      plansRepo.findOne.mockResolvedValue(makePlan({ items: [makeItem({ trackType: 'Hifz' })] }));
      achievementsRepo.find.mockResolvedValue([makeAchievement({ trackType: 'Near' })]);

      await service.reconcilePlan(1);

      expect(itemsRepo.update).toHaveBeenCalledWith(1, { achievedVerses: 0, status: 'overdue' });
    });

    it('consumes verses so the earliest item claims them (priority within the week)', async () => {
      // Two items plan the SAME verses; one achievement covers them once.
      const early = makeItem({ id: 1, dayOfWeek: 1, startVerse: 1, endVerse: 7, totalVerses: 7 });
      const late = makeItem({ id: 2, dayOfWeek: 3, startVerse: 1, endVerse: 7, totalVerses: 7 });
      plansRepo.findOne.mockResolvedValue(makePlan({ items: [late, early] })); // unsorted on purpose
      achievementsRepo.find.mockResolvedValue([
        makeAchievement({ startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 7 }),
      ]);

      await service.reconcilePlan(1);

      // Earliest (day 1) gets the verses; later (day 3) gets nothing left.
      expect(itemsRepo.update).toHaveBeenCalledWith(1, { achievedVerses: 7, status: 'completed' });
      expect(itemsRepo.update).toHaveBeenCalledWith(2, { achievedVerses: 0, status: 'overdue' });
    });

    it('uses order (not id) to break priority ties on the same day', async () => {
      // Same day + same verses; the lower `order` wins regardless of id.
      const highId = makeItem({ id: 9, dayOfWeek: 1, order: 0, startVerse: 1, endVerse: 7, totalVerses: 7 });
      const lowId = makeItem({ id: 2, dayOfWeek: 1, order: 1, startVerse: 1, endVerse: 7, totalVerses: 7 });
      plansRepo.findOne.mockResolvedValue(makePlan({ items: [lowId, highId] }));
      achievementsRepo.find.mockResolvedValue([
        makeAchievement({ startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 7 }),
      ]);

      await service.reconcilePlan(1);

      // order=0 (id 9) claims the verses even though id 2 is lower.
      expect(itemsRepo.update).toHaveBeenCalledWith(9, { achievedVerses: 7, status: 'completed' });
      expect(itemsRepo.update).toHaveBeenCalledWith(2, { achievedVerses: 0, status: 'overdue' });
    });

    it('marks overdue when no achievements and item date is in the past', async () => {
      plansRepo.findOne.mockResolvedValue(makePlan());
      achievementsRepo.find.mockResolvedValue([]);

      await service.reconcilePlan(1);

      expect(itemsRepo.update).toHaveBeenCalledWith(1, { achievedVerses: 0, status: 'overdue' });
    });

    it('marks due when no achievements and item date is in the future', async () => {
      const future = new Date();
      future.setUTCDate(future.getUTCDate() + 14);
      const weekStart = new Date(future);
      weekStart.setUTCDate(weekStart.getUTCDate() - 2);
      plansRepo.findOne.mockResolvedValue(
        makePlan({ weekStartDate: weekStart.toISOString().slice(0, 10) }),
      );
      achievementsRepo.find.mockResolvedValue([]);

      await service.reconcilePlan(1);

      expect(itemsRepo.update).toHaveBeenCalledWith(1, { achievedVerses: 0, status: 'due' });
    });

    it('handles cross-surah item ranges correctly', async () => {
      // Item 1:3 → 2:5 (1:3..1:7 = 5 + 2:1..2:5 = 5 → 10 verses)
      plansRepo.findOne.mockResolvedValue(
        makePlan({ items: [makeItem({ startSurah: 1, startVerse: 3, endSurah: 2, endVerse: 5, totalVerses: 10 })] }),
      );
      // Achievement 1:5 → 2:3 overlaps at 1:5 1:6 1:7 2:1 2:2 2:3 = 6 verses
      achievementsRepo.find.mockResolvedValue([
        makeAchievement({ startSurah: 1, startVerse: 5, endSurah: 2, endVerse: 3 }),
      ]);

      await service.reconcilePlan(1);

      expect(itemsRepo.update).toHaveBeenCalledWith(1, { achievedVerses: 6, status: 'partial' });
    });

    it('handles achievement range outside item range (no overlap)', async () => {
      plansRepo.findOne.mockResolvedValue(
        makePlan({ items: [makeItem({ startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 3, totalVerses: 3 })] }),
      );
      achievementsRepo.find.mockResolvedValue([
        makeAchievement({ startSurah: 1, startVerse: 5, endSurah: 1, endVerse: 7 }),
      ]);

      await service.reconcilePlan(1);

      expect(itemsRepo.update).toHaveBeenCalledWith(1, { achievedVerses: 0, status: 'overdue' });
    });

    it('returns without updating when plan is not found', async () => {
      plansRepo.findOne.mockResolvedValue(null);

      await service.reconcilePlan(999);

      expect(itemsRepo.update).not.toHaveBeenCalled();
    });
  });

  // ─── reconcileItem ────────────────────────────────────────────────────────

  describe('reconcileItem', () => {
    it('reconciles the plan that owns the item', async () => {
      itemsRepo.findOne.mockResolvedValue({ id: 7, weeklyPlanId: 42 });
      const spy = jest.spyOn(service, 'reconcilePlan').mockResolvedValue(undefined);

      await service.reconcileItem(7);

      expect(spy).toHaveBeenCalledWith(42);
    });

    it('returns without reconciling when the item is not found', async () => {
      itemsRepo.findOne.mockResolvedValue(null);
      const spy = jest.spyOn(service, 'reconcilePlan').mockResolvedValue(undefined);

      await service.reconcileItem(999);

      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ─── reconcileForAchievement ──────────────────────────────────────────────

  describe('reconcileForAchievement', () => {
    it('reconciles each plan whose week contains the achievement date', async () => {
      achievementsRepo.findOne.mockResolvedValue(makeAchievement({ id: 100 }));
      plansRepo.find.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const spy = jest.spyOn(service, 'reconcilePlan').mockResolvedValue(undefined);

      await service.reconcileForAchievement(100);

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith(1);
      expect(spy).toHaveBeenCalledWith(2);
    });

    it('does nothing when no plan covers the achievement week', async () => {
      achievementsRepo.findOne.mockResolvedValue(makeAchievement({ id: 100 }));
      plansRepo.find.mockResolvedValue([]);
      const spy = jest.spyOn(service, 'reconcilePlan').mockResolvedValue(undefined);

      await service.reconcileForAchievement(100);

      expect(spy).not.toHaveBeenCalled();
    });

    it('does nothing when achievement is not found', async () => {
      achievementsRepo.findOne.mockResolvedValue(null);
      const spy = jest.spyOn(service, 'reconcilePlan').mockResolvedValue(undefined);

      await service.reconcileForAchievement(999);

      expect(spy).not.toHaveBeenCalled();
      expect(plansRepo.find).not.toHaveBeenCalled();
    });
  });
});
