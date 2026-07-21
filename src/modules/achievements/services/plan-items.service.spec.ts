import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditService } from '../../audit/audit.service';
import { QuranRangeValidator } from '../../../quran/quran-range.validator';
import { WeeklyPlanItem } from '../entities/weekly-plan-item.entity';
import { WeeklyPlan } from '../entities/weekly-plan.entity';
import { AddItemInput, PlanItemsService } from './plan-items.service';
import { PlanReconciliationService } from './plan-reconciliation.service';

// ─── Factories ────────────────────────────────────────────────────────────────

const makeActor = (
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser => ({
  id: 1,
  schoolId: 10,
  status: 'active',
  tokenVersion: 1,
  roles: [{ slug: 'principal', level: 5 }],
  ...overrides,
});

const makeTeacherActor = (): AuthenticatedUser =>
  makeActor({ id: 2, roles: [{ slug: 'teacher', level: 2 }] });

const makeSupervisorActor = (): AuthenticatedUser =>
  makeActor({ id: 4, roles: [{ slug: 'supervisor', level: 3 }] });

const makePlan = (overrides: Partial<WeeklyPlan> = {}): WeeklyPlan =>
  Object.assign(new WeeklyPlan(), {
    id: 1,
    schoolId: 10,
    studentId: 5,
    halaqaId: 3,
    weekStartDate: '2026-05-10',
    status: 'draft',
    approvedBy: null,
    ...overrides,
  });

const makeItem = (
  overrides: Partial<WeeklyPlanItem> = {},
  plan: WeeklyPlan = makePlan(),
): WeeklyPlanItem =>
  Object.assign(new WeeklyPlanItem(), {
    id: 20,
    weeklyPlanId: plan.id,
    weeklyPlan: plan,
    trackType: 'Hifz',
    dayOfWeek: 1,
    order: 0,
    startSurah: 1,
    startVerse: 1,
    endSurah: 1,
    endVerse: 7,
    totalVerses: 7,
    achievedVerses: 0,
    status: 'due',
    isManualOverride: 0,
    ...overrides,
  });

const ADD_INPUT: AddItemInput = {
  trackType: 'Hifz',
  dayOfWeek: 2,
  startSurah: 2,
  startVerse: 1,
  endSurah: 2,
  endVerse: 5,
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

const HIT = [{ 1: 1 }];
const MISS: unknown[] = [];

const makePlansRepo = () => ({ findOne: jest.fn() });

const makeItemsRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn().mockImplementation((x: unknown) => x),
  save: jest.fn().mockImplementation((x: unknown) => Promise.resolve(x)),
  delete: jest.fn().mockResolvedValue(undefined),
});

const makeDataSource = (queryResults: unknown[][] = [HIT]) => {
  let callIndex = 0;
  return {
    manager: {
      query: jest.fn().mockImplementation(() => {
        const result =
          queryResults[callIndex] ?? queryResults[queryResults.length - 1];
        callIndex++;
        return Promise.resolve(result);
      }),
    },
  } as unknown as DataSource;
};

const makeAudit = () =>
  ({ log: jest.fn().mockResolvedValue(undefined) }) as unknown as AuditService;

const makeReconciliation = () =>
  ({
    reconcilePlan: jest.fn().mockResolvedValue(undefined),
    reconcileItem: jest.fn().mockResolvedValue(undefined),
  }) as unknown as PlanReconciliationService;

const makeService = (
  overrides: {
    plans?: ReturnType<typeof makePlansRepo>;
    items?: ReturnType<typeof makeItemsRepo>;
    ds?: DataSource;
    audit?: AuditService;
    recon?: PlanReconciliationService;
  } = {},
) =>
  new PlanItemsService(
    (overrides.plans ?? makePlansRepo()) as never,
    (overrides.items ?? makeItemsRepo()) as never,
    overrides.ds ?? makeDataSource(),
    overrides.audit ?? makeAudit(),
    overrides.recon ?? makeReconciliation(),
    new QuranRangeValidator(),
  );

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PlanItemsService', () => {
  // The scope mock ignores the SQL text, so "a teacher was allowed" would pass even
  // under the old primary-teacher rule. Pin the policy by inspecting the SQL itself.
  it('authorizes teachers without a primary-teacher filter', async () => {
    const items = makeItemsRepo();
    items.findOne.mockResolvedValue(makeItem());
    const ds = makeDataSource([HIT]);

    await makeService({ items, ds }).updateItem(
      20,
      { order: 1 },
      makeTeacherActor(),
    );

    const sql = (ds.manager.query as jest.Mock).mock.calls
      .map((c) => String(c[0]))
      .filter((q) => q.includes('halaqa_teachers'));

    expect(sql.length).toBeGreaterThan(0);
    for (const q of sql) {
      expect(q).not.toMatch(/acting_as_primary/);
      expect(q).not.toMatch(/role\s*=\s*'main'/);
    }
  });

  describe('addItem()', () => {
    it('allows a non-primary in-scope teacher to add an item to a draft plan', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(makePlan({ status: 'draft' }));
      const items = makeItemsRepo();

      const service = makeService({ plans, items, ds: makeDataSource([HIT]) });
      const item = await service.addItem(1, ADD_INPUT, makeTeacherActor());

      expect(item.totalVerses).toBe(5);
      expect(items.save).toHaveBeenCalledTimes(1);
    });

    it('throws ForbiddenException when the teacher is out of scope', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(makePlan({ status: 'draft' }));
      const items = makeItemsRepo();

      const service = makeService({ plans, items, ds: makeDataSource([MISS]) });

      await expect(
        service.addItem(1, ADD_INPUT, makeTeacherActor()),
      ).rejects.toThrow(ForbiddenException);
      expect(items.save).not.toHaveBeenCalled();
    });

    it('rejects an approved plan before checking scope', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(makePlan({ status: 'approved' }));
      const ds = makeDataSource([HIT]);

      const service = makeService({ plans, ds });

      await expect(service.addItem(1, ADD_INPUT, makeActor())).rejects.toThrow(
        BadRequestException,
      );
      expect(ds.manager.query).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown plan', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(null);

      const service = makeService({ plans });

      await expect(service.addItem(99, ADD_INPUT, makeActor())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteItem()', () => {
    it('allows a non-primary in-scope teacher to delete an item from a draft plan', async () => {
      const items = makeItemsRepo();
      items.findOne.mockResolvedValue(makeItem());

      const service = makeService({ items, ds: makeDataSource([HIT]) });
      await service.deleteItem(20, makeTeacherActor());

      expect(items.delete).toHaveBeenCalledWith(20);
    });

    it('throws ForbiddenException when the teacher is out of scope', async () => {
      const items = makeItemsRepo();
      items.findOne.mockResolvedValue(makeItem());

      const service = makeService({ items, ds: makeDataSource([MISS]) });

      await expect(service.deleteItem(20, makeTeacherActor())).rejects.toThrow(
        ForbiddenException,
      );
      expect(items.delete).not.toHaveBeenCalled();
    });

    it('rejects deletion from an approved plan', async () => {
      const items = makeItemsRepo();
      items.findOne.mockResolvedValue(
        makeItem({}, makePlan({ status: 'approved' })),
      );

      const service = makeService({ items });

      await expect(service.deleteItem(20, makeActor())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException for an item in another school', async () => {
      const items = makeItemsRepo();
      items.findOne.mockResolvedValue(makeItem({}, makePlan({ schoolId: 99 })));

      const service = makeService({ items });

      await expect(service.deleteItem(20, makeActor())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateItem()', () => {
    it('allows a non-primary in-scope teacher to edit a range on an APPROVED plan', async () => {
      const items = makeItemsRepo();
      items.findOne.mockResolvedValue(
        makeItem({}, makePlan({ status: 'approved' })),
      );
      const recon = makeReconciliation();

      const service = makeService({ items, ds: makeDataSource([HIT]), recon });
      const item = await service.updateItem(
        20,
        { endVerse: 5 },
        makeTeacherActor(),
      );

      expect(item.endVerse).toBe(5);
      expect(item.totalVerses).toBe(5);
      expect(item.isManualOverride).toBe(1);
      expect(recon.reconcileItem).toHaveBeenCalledWith(20);
    });

    it('allows an in-scope supervisor to edit an item', async () => {
      const items = makeItemsRepo();
      items.findOne.mockResolvedValue(makeItem());

      const service = makeService({ items, ds: makeDataSource([HIT]) });

      await expect(
        service.updateItem(20, { order: 3 }, makeSupervisorActor()),
      ).resolves.toBeDefined();
    });

    it('throws ForbiddenException when the teacher is out of scope', async () => {
      const items = makeItemsRepo();
      items.findOne.mockResolvedValue(makeItem());

      const service = makeService({ items, ds: makeDataSource([MISS]) });

      await expect(
        service.updateItem(20, { endVerse: 5 }, makeTeacherActor()),
      ).rejects.toThrow(ForbiddenException);
      expect(items.save).not.toHaveBeenCalled();
    });

    it('does not reconcile when only non-matching fields change', async () => {
      const items = makeItemsRepo();
      items.findOne.mockResolvedValue(makeItem());
      const recon = makeReconciliation();

      const service = makeService({ items, recon });
      await service.updateItem(20, {}, makeActor());

      expect(recon.reconcileItem).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for an invalid range', async () => {
      const items = makeItemsRepo();
      items.findOne.mockResolvedValue(makeItem());

      const service = makeService({ items });

      await expect(
        service.updateItem(20, { startSurah: 5, endSurah: 2 }, makeActor()),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
