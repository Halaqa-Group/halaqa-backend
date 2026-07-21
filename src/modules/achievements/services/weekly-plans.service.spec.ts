import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditService } from '../../audit/audit.service';
import { QuranRangeValidator } from '../../../quran/quran-range.validator';
import { WeeklyPlan } from '../entities/weekly-plan.entity';
import { PlanReconciliationService } from './plan-reconciliation.service';
import {
  CreateWeeklyPlanInput,
  WeeklyPlansService,
} from './weekly-plans.service';

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

const makeVpActor = (): AuthenticatedUser =>
  makeActor({ id: 3, roles: [{ slug: 'vice_principal', level: 4 }] });

const makeSupervisorActor = (): AuthenticatedUser =>
  makeActor({ id: 4, roles: [{ slug: 'supervisor', level: 3 }] });

const makeParentActor = (): AuthenticatedUser =>
  makeActor({ id: 5, roles: [{ slug: 'parent', level: 1 }] });

const makePlan = (overrides: Partial<WeeklyPlan> = {}): WeeklyPlan =>
  Object.assign(new WeeklyPlan(), {
    id: 1,
    schoolId: 10,
    studentId: 5,
    halaqaId: 3,
    weekStartDate: '2026-05-10',
    status: 'draft',
    approvedBy: null,
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

const CREATE_INPUT: CreateWeeklyPlanInput = {
  studentId: 5,
  halaqaId: 3,
  weekStartDate: '2026-05-10',
  items: [
    {
      trackType: 'Hifz',
      dayOfWeek: 1,
      startSurah: 1,
      startVerse: 1,
      endSurah: 1,
      endVerse: 7,
    },
  ],
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

const HIT = [{ 1: 1 }]; // a scope/enrolment query that matched
const MISS: unknown[] = []; // a scope/enrolment query that found nothing

const makePlansRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn().mockImplementation((x: unknown) => x),
  save: jest.fn().mockImplementation((x: unknown) => Promise.resolve(x)),
  remove: jest.fn().mockResolvedValue(undefined),
  createQueryBuilder: jest.fn(),
});

const makeItemsRepo = () => ({
  create: jest.fn().mockImplementation((x: unknown) => x),
});

/** Returns query results in call order; the last entry repeats once exhausted. */
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
  new WeeklyPlansService(
    (overrides.plans ?? makePlansRepo()) as never,
    (overrides.items ?? makeItemsRepo()) as never,
    overrides.ds ?? makeDataSource(),
    overrides.audit ?? makeAudit(),
    overrides.recon ?? makeReconciliation(),
    new QuranRangeValidator(),
  );

// ─── Tests ────────────────────────────────────────────────────────────────────

/**
 * The scope mock can't tell one SQL string from another, so "a teacher was allowed"
 * alone would still pass against the old primary-teacher rule. Assert on the emitted
 * SQL instead: no `role = 'main'` / `acting_as_primary` filter means any assigned
 * teacher qualifies.
 */
const expectNoPrimaryTeacherFilter = (ds: DataSource) => {
  const sql = (ds.manager.query as jest.Mock).mock.calls
    .map((c) => String(c[0]))
    .filter((q) => q.includes('halaqa_teachers'));

  expect(sql.length).toBeGreaterThan(0);
  for (const q of sql) {
    expect(q).not.toMatch(/acting_as_primary/);
    expect(q).not.toMatch(/role\s*=\s*'main'/);
  }
};

describe('WeeklyPlansService', () => {
  // Permissions are the focus: every mutation gates on hasHalaqaScope, which
  // accepts ANY teacher with an active halaqa_teachers row (no primary tier).

  it.each([
    ['approve', (s: WeeklyPlansService) => s.approve(1, makeTeacherActor())],
    [
      'unapprove',
      (s: WeeklyPlansService) => s.unapprove(1, makeTeacherActor()),
    ],
    [
      'hardDelete',
      (s: WeeklyPlansService) => s.hardDelete(1, makeTeacherActor()),
    ],
  ])(
    '%s authorizes teachers without a primary-teacher filter',
    async (_name, call) => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(makePlan({ status: 'approved' }));
      const ds = makeDataSource([HIT]);

      // The scope query runs before any status guard, so ignore whatever the call
      // itself resolves or rejects with — only the emitted SQL is under test here.
      await call(makeService({ plans, ds })).catch(() => undefined);

      expectNoPrimaryTeacherFilter(ds);
    },
  );

  describe('create()', () => {
    it('allows a non-primary in-scope teacher to create a plan', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(null); // no conflicting plan
      const ds = makeDataSource([HIT, HIT]); // scope, then enrolment

      const service = makeService({ plans, ds });
      const plan = await service.create(CREATE_INPUT, makeTeacherActor());

      expect(plan.status).toBe('draft');
      expect(plans.save).toHaveBeenCalledTimes(1);
    });

    it('throws ForbiddenException when the teacher is not assigned to the halaqa', async () => {
      const ds = makeDataSource([MISS]);
      const service = makeService({ ds });

      await expect(
        service.create(CREATE_INPUT, makeTeacherActor()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows an in-scope supervisor to create a plan', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(null);
      const ds = makeDataSource([HIT, HIT]);

      const service = makeService({ plans, ds });

      await expect(
        service.create(CREATE_INPUT, makeSupervisorActor()),
      ).resolves.toBeDefined();
    });

    it('skips the scope query entirely for a principal', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(null);
      const ds = makeDataSource([HIT]); // enrolment only

      const service = makeService({ plans, ds });
      await service.create(CREATE_INPUT, makeActor());

      // isAdmin short-circuits hasHalaqaScope, so only the enrolment query runs
      expect(ds.manager.query).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException when the student is not enrolled in the halaqa', async () => {
      const ds = makeDataSource([HIT, MISS]); // scope ok, enrolment misses

      const service = makeService({ ds });

      await expect(
        service.create(CREATE_INPUT, makeTeacherActor()),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when a plan already exists for the week', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(makePlan({ id: 77 }));

      const service = makeService({ plans, ds: makeDataSource([HIT]) });

      await expect(service.create(CREATE_INPUT, makeActor())).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('approve()', () => {
    it('allows a non-primary in-scope teacher to approve', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(makePlan({ status: 'draft' }));
      const recon = makeReconciliation();

      const service = makeService({ plans, ds: makeDataSource([HIT]), recon });
      const plan = await service.approve(1, makeTeacherActor());

      expect(plan.status).toBe('approved');
      expect(plan.approvedBy).toBe(2);
      expect(recon.reconcilePlan).toHaveBeenCalledWith(1);
    });

    it('throws ForbiddenException when the teacher is out of scope', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(makePlan({ status: 'draft' }));

      const service = makeService({ plans, ds: makeDataSource([MISS]) });

      await expect(service.approve(1, makeTeacherActor())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when already approved', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(makePlan({ status: 'approved' }));

      const service = makeService({ plans });

      await expect(service.approve(1, makeActor())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException for an unknown plan', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(null);

      const service = makeService({ plans });

      await expect(service.approve(99, makeActor())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('unapprove()', () => {
    it('allows a non-primary in-scope teacher to unapprove', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(
        makePlan({ status: 'approved', approvedBy: 99 }),
      );

      const service = makeService({ plans, ds: makeDataSource([HIT]) });
      const plan = await service.unapprove(1, makeTeacherActor());

      expect(plan.status).toBe('draft');
    });

    it('allows an in-scope supervisor to unapprove', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(
        makePlan({ status: 'approved', approvedBy: 99 }),
      );

      const service = makeService({ plans, ds: makeDataSource([HIT]) });

      expect((await service.unapprove(1, makeSupervisorActor())).status).toBe(
        'draft',
      );
    });

    it('allows the VP to unapprove', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(
        makePlan({ status: 'approved', approvedBy: 99 }),
      );

      const service = makeService({ plans });

      expect((await service.unapprove(1, makeVpActor())).status).toBe('draft');
    });

    it('throws ForbiddenException when the teacher is out of scope', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(makePlan({ status: 'approved' }));

      const service = makeService({ plans, ds: makeDataSource([MISS]) });

      await expect(service.unapprove(1, makeTeacherActor())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('preserves approved_by and audits the previous approver', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(
        makePlan({ status: 'approved', approvedBy: 99 }),
      );
      const audit = makeAudit();

      const service = makeService({ plans, audit });
      const plan = await service.unapprove(1, makeActor());

      expect(plan.approvedBy).toBe(99);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'weekly_plan.unapprove',
          oldValues: expect.objectContaining({
            approvedBy: 99,
            status: 'approved',
          }),
        }),
      );
    });

    it('throws BadRequestException when the plan is already a draft', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(makePlan({ status: 'draft' }));

      const service = makeService({ plans });

      await expect(service.unapprove(1, makeActor())).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('hardDelete()', () => {
    it('allows a non-primary in-scope teacher to delete a plan', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(makePlan());

      const service = makeService({ plans, ds: makeDataSource([HIT]) });
      await service.hardDelete(1, makeTeacherActor());

      expect(plans.remove).toHaveBeenCalledTimes(1);
    });

    it('allows an in-scope supervisor to delete a plan', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(makePlan());

      const service = makeService({ plans, ds: makeDataSource([HIT]) });
      await service.hardDelete(1, makeSupervisorActor());

      expect(plans.remove).toHaveBeenCalledTimes(1);
    });

    it('throws ForbiddenException when the teacher is out of scope', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(makePlan());

      const service = makeService({ plans, ds: makeDataSource([MISS]) });

      await expect(service.hardDelete(1, makeTeacherActor())).rejects.toThrow(
        ForbiddenException,
      );
      expect(plans.remove).not.toHaveBeenCalled();
    });

    it('records was_approved in the audit row', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(makePlan({ status: 'approved' }));
      const audit = makeAudit();

      const service = makeService({ plans, audit });
      await service.hardDelete(1, makeActor());

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'weekly_plan.delete',
          newValues: { was_approved: true },
        }),
      );
    });
  });

  describe('findOne()', () => {
    it('lets a parent read their own child’s plan', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(makePlan());
      // hasHalaqaScope misses for a parent, then the guardian query hits
      const ds = makeDataSource([HIT]);

      const service = makeService({ plans, ds });

      await expect(
        service.findOne(1, makeParentActor()),
      ).resolves.toBeDefined();
    });

    it('throws NotFoundException for a parent of a different student', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(makePlan());
      const ds = makeDataSource([MISS]);

      const service = makeService({ plans, ds });

      await expect(service.findOne(1, makeParentActor())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for an out-of-scope teacher', async () => {
      const plans = makePlansRepo();
      plans.findOne.mockResolvedValue(makePlan());
      const ds = makeDataSource([MISS]);

      const service = makeService({ plans, ds });

      await expect(service.findOne(1, makeTeacherActor())).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
