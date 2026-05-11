import { DataSource } from 'typeorm';
import { Achievement } from '../entities/achievement.entity';
import { WeeklyPlanItem } from '../entities/weekly-plan-item.entity';
import { WeeklyPlan } from '../entities/weekly-plan.entity';
import { PlanReconciliationService } from './plan-reconciliation.service';

function makeItem(
  overrides: Partial<WeeklyPlanItem> & { plan?: Partial<WeeklyPlan> } = {},
): WeeklyPlanItem {
  const { plan: planOverrides, ...itemOverrides } = overrides;
  const plan = {
    id: 1,
    studentId: 10,
    halaqaId: 5,
    weekStartDate: '2026-05-09', // Saturday
    status: 'approved',
    deletedAt: null,
    ...planOverrides,
  } as WeeklyPlan;

  return {
    id: 1,
    weeklyPlanId: 1,
    trackType: 'Hifz',
    dayOfWeek: 2, // Monday: week_start + 2 = 2026-05-11
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
    weeklyPlan: plan,
    ...itemOverrides,
  } as WeeklyPlanItem;
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
  let dataSource: { manager: { query: jest.Mock } };

  beforeEach(() => {
    itemsRepo = { findOne: jest.fn(), update: jest.fn().mockResolvedValue(undefined) };
    achievementsRepo = { findOne: jest.fn(), find: jest.fn() };
    dataSource = { manager: { query: jest.fn() } };

    service = new PlanReconciliationService(
      itemsRepo as any,
      achievementsRepo as any,
      dataSource as unknown as DataSource,
    );
  });

  // ─── reconcileItem ────────────────────────────────────────────────────────

  describe('reconcileItem', () => {
    it('marks completed when a single achievement covers the full item range', async () => {
      itemsRepo.findOne.mockResolvedValue(makeItem());
      achievementsRepo.find.mockResolvedValue([
        makeAchievement({ startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 7 }),
      ]);

      await service.reconcileItem(1);

      expect(itemsRepo.update).toHaveBeenCalledWith(1, { achievedVerses: 7, status: 'completed' });
    });

    it('marks partial when achievement covers a subset of the item range', async () => {
      itemsRepo.findOne.mockResolvedValue(
        makeItem({ startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 7, totalVerses: 7 }),
      );
      achievementsRepo.find.mockResolvedValue([
        makeAchievement({ startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 4 }),
      ]);

      await service.reconcileItem(1);

      expect(itemsRepo.update).toHaveBeenCalledWith(1, { achievedVerses: 4, status: 'partial' });
    });

    it('does not double-count overlapping achievements (union deduplication)', async () => {
      itemsRepo.findOne.mockResolvedValue(
        makeItem({ startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 7, totalVerses: 7 }),
      );
      // Achievements 1:1–1:4 and 1:3–1:7 overlap at 1:3 and 1:4
      achievementsRepo.find.mockResolvedValue([
        makeAchievement({ id: 100, startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 4 }),
        makeAchievement({ id: 101, startSurah: 1, startVerse: 3, endSurah: 1, endVerse: 7 }),
      ]);

      await service.reconcileItem(1);

      // Union of {1:1..1:4} ∪ {1:3..1:7} = {1:1..1:7} = 7 verses
      expect(itemsRepo.update).toHaveBeenCalledWith(1, { achievedVerses: 7, status: 'completed' });
    });

    it('marks overdue when no achievements and item date is in the past', async () => {
      itemsRepo.findOne.mockResolvedValue(
        makeItem({ dayOfWeek: 2, plan: { weekStartDate: '2020-01-04' } }), // 2020-01-06 — past
      );
      achievementsRepo.find.mockResolvedValue([]);

      await service.reconcileItem(1);

      expect(itemsRepo.update).toHaveBeenCalledWith(1, { achievedVerses: 0, status: 'overdue' });
    });

    it('marks due when no achievements and item date is in the future', async () => {
      const future = new Date();
      future.setUTCDate(future.getUTCDate() + 14);
      const weekStart = new Date(future);
      weekStart.setUTCDate(weekStart.getUTCDate() - 2);

      itemsRepo.findOne.mockResolvedValue(
        makeItem({ dayOfWeek: 2, plan: { weekStartDate: weekStart.toISOString().slice(0, 10) } }),
      );
      achievementsRepo.find.mockResolvedValue([]);

      await service.reconcileItem(1);

      expect(itemsRepo.update).toHaveBeenCalledWith(1, { achievedVerses: 0, status: 'due' });
    });

    it('handles cross-surah item ranges correctly', async () => {
      // Item 1:3 → 2:5 (surah 1 has 7 verses → 1:3..1:7 = 5 + 2:1..2:5 = 5 → 10 verses)
      itemsRepo.findOne.mockResolvedValue(
        makeItem({ startSurah: 1, startVerse: 3, endSurah: 2, endVerse: 5, totalVerses: 10 }),
      );
      // Achievement 1:5 → 2:3 overlaps at 1:5 1:6 1:7 2:1 2:2 2:3 = 6 verses
      achievementsRepo.find.mockResolvedValue([
        makeAchievement({ startSurah: 1, startVerse: 5, endSurah: 2, endVerse: 3 }),
      ]);

      await service.reconcileItem(1);

      expect(itemsRepo.update).toHaveBeenCalledWith(1, { achievedVerses: 6, status: 'partial' });
    });

    it('handles achievement range outside item range (no overlap)', async () => {
      // Item 1:1 → 1:3 (3 verses). Achievement 1:5 → 1:7 — no overlap.
      itemsRepo.findOne.mockResolvedValue(
        makeItem({ startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 3, totalVerses: 3 }),
      );
      achievementsRepo.find.mockResolvedValue([
        makeAchievement({ startSurah: 1, startVerse: 5, endSurah: 1, endVerse: 7 }),
      ]);

      await service.reconcileItem(1);

      const today = new Date().toISOString().slice(0, 10);
      const itemDate = '2026-05-11';
      const expectedStatus = itemDate < today ? 'overdue' : 'due';
      expect(itemsRepo.update).toHaveBeenCalledWith(1, { achievedVerses: 0, status: expectedStatus });
    });

    it('returns without updating when plan item is not found', async () => {
      itemsRepo.findOne.mockResolvedValue(null);

      await service.reconcileItem(999);

      expect(itemsRepo.update).not.toHaveBeenCalled();
    });
  });

  // ─── reconcileForAchievement ──────────────────────────────────────────────

  describe('reconcileForAchievement', () => {
    it('calls reconcileItem for each matching plan item', async () => {
      achievementsRepo.findOne.mockResolvedValue(makeAchievement({ id: 100 }));
      dataSource.manager.query.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const spy = jest.spyOn(service, 'reconcileItem').mockResolvedValue(undefined);

      await service.reconcileForAchievement(100);

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith(1);
      expect(spy).toHaveBeenCalledWith(2);
    });

    it('does nothing when no plan items match', async () => {
      achievementsRepo.findOne.mockResolvedValue(makeAchievement({ id: 100 }));
      dataSource.manager.query.mockResolvedValue([]);
      const spy = jest.spyOn(service, 'reconcileItem').mockResolvedValue(undefined);

      await service.reconcileForAchievement(100);

      expect(spy).not.toHaveBeenCalled();
    });

    it('does nothing when achievement is not found', async () => {
      achievementsRepo.findOne.mockResolvedValue(null);
      const spy = jest.spyOn(service, 'reconcileItem').mockResolvedValue(undefined);

      await service.reconcileForAchievement(999);

      expect(spy).not.toHaveBeenCalled();
      expect(dataSource.manager.query).not.toHaveBeenCalled();
    });
  });
});
