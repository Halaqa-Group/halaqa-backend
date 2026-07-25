import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditService } from '../../audit/audit.service';
import { Achievement } from '../entities/achievement.entity';
import { AttendanceQueryService } from '../../attendance/services/attendance-query.service';
import { MemorizationService } from '../../students/services/memorization.service';
import {
  AchievementsService,
  CreateAchievementInput,
} from './achievements.service';
import { PlanReconciliationService } from './plan-reconciliation.service';
import { QuranRangeValidator } from '../../../quran/quran-range.validator';

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

const makeAchievement = (overrides: Partial<Achievement> = {}): Achievement =>
  Object.assign(new Achievement(), {
    id: 1,
    schoolId: 10,
    studentId: 5,
    halaqaId: 3,
    recordedBy: 1,
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
    status: 'unapproved',
    approvedBy: null,
    approvedAt: null,
    teacherNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

const EVAL_SETTINGS = {
  evaluation_settings: JSON.stringify({
    base_score: 100,
    mistake_weight: 2,
    warning_weight: 1,
    tajweed_weight: 1.5,
    min_score: 0,
  }),
};

const CREATE_INPUT: CreateAchievementInput = {
  studentId: 5,
  halaqaId: 3,
  date: '2026-05-11',
  trackType: 'Hifz',
  startSurah: 1,
  startVerse: 1,
  endSurah: 1,
  endVerse: 7,
  percentageScore: 100,
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

const makeRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  softRemove: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  }),
});

let positionIdSeq = 1;
const makePositionsRepo = () => ({
  delete: jest.fn().mockResolvedValue(undefined),
  create: jest.fn().mockImplementation((x) => x),
  // save returns the row with an id so replacePositions can attach error rows.
  save: jest
    .fn()
    .mockImplementation((x) => Promise.resolve({ id: positionIdSeq++, ...x })),
  find: jest.fn().mockResolvedValue([]),
});

const makePositionErrorsRepo = () => ({
  create: jest.fn().mockImplementation((x) => x),
  save: jest.fn().mockResolvedValue(undefined),
});

const makeDataSource = (
  queryResults: unknown[][] = [[{ 1: 1 }], [EVAL_SETTINGS]],
) => {
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
    reconcileForAchievement: jest.fn().mockResolvedValue(undefined),
    reconcileItem: jest.fn().mockResolvedValue(undefined),
  }) as unknown as PlanReconciliationService;
const makeAttendance = () =>
  ({
    findForStudentOnDate: jest
      .fn()
      .mockResolvedValue({ id: 1, status: 'present' }),
  }) as unknown as AttendanceQueryService;
const makeRangeValidator = () => new QuranRangeValidator();
const makeMemorization = () =>
  ({
    enqueueRecompute: jest.fn().mockResolvedValue(undefined),
  }) as unknown as MemorizationService;

const makeService = (
  overrides: {
    repo?: ReturnType<typeof makeRepo>;
    positions?: ReturnType<typeof makePositionsRepo>;
    positionErrors?: ReturnType<typeof makePositionErrorsRepo>;
    ds?: DataSource;
    audit?: AuditService;
    recon?: PlanReconciliationService;
    attendance?: AttendanceQueryService;
  } = {},
) => {
  const repo = overrides.repo ?? makeRepo();
  const positions = overrides.positions ?? makePositionsRepo();
  const positionErrors = overrides.positionErrors ?? makePositionErrorsRepo();
  const ds = overrides.ds ?? makeDataSource();
  const audit = overrides.audit ?? makeAudit();
  const recon = overrides.recon ?? makeReconciliation();
  const attendance = overrides.attendance ?? makeAttendance();

  return new AchievementsService(
    repo as any,
    positions as any,
    positionErrors as any,
    ds,
    attendance,
    audit,
    recon,
    makeRangeValidator(),
    makeMemorization(),
    { emitReportSourceChanged: jest.fn() } as any,
  );
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AchievementsService', () => {
  // The scope mock ignores the SQL text, so "a teacher was allowed" would pass even
  // under the old primary-teacher rule. Pin the policy by inspecting the SQL itself.
  it.each(['approve', 'unapprove'] as const)(
    '%s authorizes teachers without a primary-teacher filter',
    async (method) => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(makeAchievement({ status: 'approved' }));
      const ds = makeDataSource([[{ 1: 1 }]]);

      // The scope query runs before any status guard — only the SQL is under test.
      await makeService({ repo, ds })
        [method](1, makeTeacherActor())
        .catch(() => undefined);

      const sql = (ds.manager.query as jest.Mock).mock.calls
        .map((c) => String(c[0]))
        .filter((q) => q.includes('halaqa_teachers'));

      expect(sql.length).toBeGreaterThan(0);
      for (const q of sql) {
        expect(q).not.toMatch(/acting_as_primary/);
        expect(q).not.toMatch(/role\s*=\s*'main'/);
      }
    },
  );

  // ─── create() ─────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates and returns an achievement (principal — no scope SQL)', async () => {
      const repo = makeRepo();
      const saved = makeAchievement();
      repo.create.mockReturnValue(saved);
      repo.save.mockResolvedValue(saved);
      // Principal skips scope/approval SQL; only eval-settings query fires
      const ds = makeDataSource([[EVAL_SETTINGS]]);
      const recon = makeReconciliation();

      const service = makeService({ repo, ds, recon });
      const result = await service.create(CREATE_INPUT, makeActor());

      expect(result.status).toBe('unapproved');
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(recon.reconcileForAchievement).not.toHaveBeenCalled();
    });

    it('approves in the same call when approve=true (principal)', async () => {
      const repo = makeRepo();
      const saved = makeAchievement({
        status: 'approved',
        approvedBy: 1,
        approvedAt: new Date(),
      });
      repo.create.mockReturnValue(saved);
      repo.save.mockResolvedValue(saved);
      // Principal: only eval-settings query fires (scope+approval use isAdmin fast-path)
      const ds = makeDataSource([[EVAL_SETTINGS]]);
      const recon = makeReconciliation();
      const audit = makeAudit();

      const service = makeService({ repo, ds, recon, audit });
      await service.create({ ...CREATE_INPUT, approve: true }, makeActor());

      // Two audit rows: create + approve
      expect(audit.log).toHaveBeenCalledTimes(2);
      expect((audit.log as jest.Mock).mock.calls[0][0].action).toBe(
        'achievement.create',
      );
      expect((audit.log as jest.Mock).mock.calls[1][0].action).toBe(
        'achievement.approve',
      );
      expect(recon.reconcileForAchievement).toHaveBeenCalledTimes(1);
    });

    it('creates via teacher with halaqa scope', async () => {
      const repo = makeRepo();
      const saved = makeAchievement();
      repo.create.mockReturnValue(saved);
      repo.save.mockResolvedValue(saved);
      // Teacher: scope SQL (returns row) then eval-settings SQL
      const ds = makeDataSource([[{ 1: 1 }], [EVAL_SETTINGS]]);

      const service = makeService({ repo, ds });
      const result = await service.create(CREATE_INPUT, makeTeacherActor());

      expect(result).toBe(saved);
    });

    it('throws ForbiddenException when teacher has no halaqa scope', async () => {
      // Teacher scope query returns empty
      const ds = makeDataSource([[]]);
      const service = makeService({ ds });

      await expect(
        service.create(CREATE_INPUT, makeTeacherActor()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets a non-primary in-scope teacher create with approve=true', async () => {
      const repo = makeRepo();
      const saved = makeAchievement({ status: 'approved' });
      repo.create.mockReturnValue(saved);
      repo.save.mockResolvedValue(saved);
      const ds = makeDataSource([[{ 1: 1 }]]); // halaqa scope passes
      const audit = makeAudit();

      const service = makeService({ repo, ds, audit });
      const result = await service.create(
        { ...CREATE_INPUT, approve: true },
        makeTeacherActor(),
      );

      expect(result.status).toBe('approved');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'achievement.approve' }),
      );
    });

    it('throws BadRequestException when student is absent', async () => {
      // Principal: only eval-settings query, but attendance stub is overridden
      const ds = makeDataSource([[EVAL_SETTINGS]]);
      const attendance = {
        findForStudentOnDate: jest
          .fn()
          .mockResolvedValue({ id: 1, status: 'absent' }),
      } as unknown as AttendanceQueryService;

      const service = makeService({ ds, attendance });

      await expect(service.create(CREATE_INPUT, makeActor())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for invalid verse range', async () => {
      // Range validation fires before any DB call (no scope SQL for principal)
      const service = makeService({ ds: makeDataSource([]) });

      await expect(
        service.create(
          { ...CREATE_INPUT, startSurah: 5, endSurah: 2 },
          makeActor(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when Hifz is recited as a partial test', async () => {
      // Hifz⇒full guard fires after range validation, before any DB call.
      const service = makeService({ ds: makeDataSource([]) });

      await expect(
        service.create(
          {
            ...CREATE_INPUT,
            trackType: 'Hifz',
            recitationMethod: 'test',
            testPositions: [
              { startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 3 },
            ],
          },
          makeActor(),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── approve() ────────────────────────────────────────────────────────────

  describe('approve()', () => {
    it('approves an unapproved achievement', async () => {
      const repo = makeRepo();
      const achievement = makeAchievement({ status: 'unapproved' });
      repo.findOne.mockResolvedValue(achievement);
      repo.save.mockResolvedValue(achievement);
      const ds = makeDataSource([[{ 1: 1 }]]);
      const recon = makeReconciliation();
      const audit = makeAudit();

      const service = makeService({ repo, ds, recon, audit });
      const result = await service.approve(1, makeActor());

      expect(result.status).toBe('approved');
      expect(result.approvedBy).toBe(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'achievement.approve' }),
      );
      expect(recon.reconcileForAchievement).toHaveBeenCalledWith(1);
    });

    it('throws BadRequestException when already approved', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(makeAchievement({ status: 'approved' }));
      const ds = makeDataSource([[{ 1: 1 }]]);

      const service = makeService({ repo, ds });

      await expect(service.approve(1, makeActor())).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows a non-primary in-scope teacher to approve', async () => {
      const repo = makeRepo();
      const achievement = makeAchievement({ status: 'unapproved' });
      repo.findOne.mockResolvedValue(achievement);
      repo.save.mockResolvedValue(achievement);
      const ds = makeDataSource([[{ 1: 1 }]]);

      const service = makeService({ repo, ds });
      const result = await service.approve(1, makeTeacherActor());

      expect(result.status).toBe('approved');
      expect(result.approvedBy).toBe(2);
    });

    it('throws ForbiddenException when teacher is not assigned to the halaqa', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(makeAchievement());
      const ds = makeDataSource([[]]); // no halaqa_teachers row

      const service = makeService({ repo, ds });

      await expect(service.approve(1, makeTeacherActor())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when achievement not found', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(null);

      const service = makeService({ repo });

      await expect(service.approve(99, makeActor())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── unapprove() ──────────────────────────────────────────────────────────

  describe('unapprove()', () => {
    it('unapproves and preserves approved_by and approved_at', async () => {
      const approvedAt = new Date('2026-05-10');
      const repo = makeRepo();
      const achievement = makeAchievement({
        status: 'approved',
        approvedBy: 99,
        approvedAt,
      });
      repo.findOne.mockResolvedValue(achievement);
      repo.save.mockResolvedValue(achievement);
      const audit = makeAudit();

      const service = makeService({ repo, audit });
      const result = await service.unapprove(1, makeActor());

      expect(result.status).toBe('unapproved');
      expect(result.approvedBy).toBe(99);
      expect(result.approvedAt).toEqual(approvedAt);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'achievement.unapprove',
          oldValues: expect.objectContaining({
            approvedBy: 99,
            status: 'approved',
          }),
        }),
      );
    });

    it('allows an in-scope supervisor to unapprove', async () => {
      const repo = makeRepo();
      const achievement = makeAchievement({
        status: 'approved',
        approvedBy: 99,
      });
      repo.findOne.mockResolvedValue(achievement);
      repo.save.mockResolvedValue(achievement);
      const ds = makeDataSource([[{ 1: 1 }]]); // supervisor_halaqat row exists

      const service = makeService({ repo, ds });

      expect((await service.unapprove(1, makeSupervisorActor())).status).toBe(
        'unapproved',
      );
    });

    it('allows a non-primary in-scope teacher to unapprove', async () => {
      const repo = makeRepo();
      const achievement = makeAchievement({
        status: 'approved',
        approvedBy: 99,
      });
      repo.findOne.mockResolvedValue(achievement);
      repo.save.mockResolvedValue(achievement);
      const ds = makeDataSource([[{ 1: 1 }]]);

      const service = makeService({ repo, ds });

      expect((await service.unapprove(1, makeTeacherActor())).status).toBe(
        'unapproved',
      );
    });

    it('throws ForbiddenException when the teacher has no halaqa scope', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(makeAchievement({ status: 'approved' }));
      const ds = makeDataSource([[]]);

      const service = makeService({ repo, ds });

      await expect(service.unapprove(1, makeTeacherActor())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when achievement is already unapproved', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(makeAchievement({ status: 'unapproved' }));

      const service = makeService({ repo });

      await expect(service.unapprove(1, makeActor())).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── update() ─────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('throws BadRequestException for approved achievement', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(makeAchievement({ status: 'approved' }));

      const service = makeService({ repo });

      await expect(
        service.update(1, { percentageScore: 90 }, makeActor()),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores percentage_score from the request, rounded to 2dp', async () => {
      const repo = makeRepo();
      const achievement = makeAchievement({
        status: 'unapproved',
        percentageScore: 100,
      });
      repo.findOne.mockResolvedValue(achievement);
      repo.save.mockResolvedValue(achievement);

      const service = makeService({ repo });
      await service.update(1, { percentageScore: 87.456 }, makeActor());

      expect(achievement.percentageScore).toBe(87.46);
    });

    it('throws NotFoundException when actor has no halaqa scope', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(makeAchievement({ status: 'unapproved' }));
      const ds = makeDataSource([[]]); // no scope

      const service = makeService({ repo, ds });

      await expect(service.update(1, {}, makeTeacherActor())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── error counts & positions ─────────────────────────────────────────────

  describe('error counts (derived from itemized errors)', () => {
    const err = (
      errorType: 'mistake' | 'warning' | 'tajweed' | 'harakat',
      surah: number,
      ayah: number,
    ) => ({
      errorType,
      startWordId: 1,
      endWordId: 1,
      surah,
      ayah,
      juz: 1,
      hizb: 1,
    });

    it('full: top-level errors attach to the single position with derived counts', async () => {
      const repo = makeRepo();
      const positions = makePositionsRepo();
      const positionErrors = makePositionErrorsRepo();
      repo.create.mockImplementation((x) => x);
      repo.save.mockImplementation((x) =>
        Promise.resolve(Object.assign(x, { id: 9 })),
      );

      const service = makeService({
        repo,
        positions,
        positionErrors,
        ds: makeDataSource([[EVAL_SETTINGS]]),
      });
      await service.create(
        {
          ...CREATE_INPUT,
          recitationMethod: 'full',
          errors: [
            err('mistake', 1, 1),
            err('mistake', 1, 2),
            err('harakat', 1, 3),
          ],
        },
        makeActor(),
      );

      // Position row gets counts derived from its errors.
      expect(positions.save).toHaveBeenCalledWith(
        expect.objectContaining({
          startSurah: 1,
          endVerse: 7,
          mistakesCount: 2,
          warningsCount: 0,
          tajweedErrorsCount: 0,
          harakatErrorsCount: 1,
        }),
      );
      // Three error rows persisted, denormalized with student/school/date.
      const savedErrors = positionErrors.save.mock.calls[0][0];
      expect(savedErrors).toHaveLength(3);
      expect(savedErrors[0]).toMatchObject({
        studentId: 5,
        date: '2026-05-11',
        positionId: expect.any(Number),
      });
    });

    it('test: achievement counts are the sum across positions', async () => {
      const repo = makeRepo();
      repo.create.mockImplementation((x) => x);
      repo.save.mockImplementation((x) =>
        Promise.resolve(Object.assign(x, { id: 9 })),
      );

      const service = makeService({
        repo,
        ds: makeDataSource([[EVAL_SETTINGS]]),
      });
      await service.create(
        {
          ...CREATE_INPUT,
          trackType: 'Near',
          recitationMethod: 'test',
          testPositions: [
            {
              startSurah: 1,
              startVerse: 1,
              endSurah: 1,
              endVerse: 3,
              errors: [
                err('mistake', 1, 1),
                err('harakat', 1, 2),
                err('harakat', 1, 3),
              ],
            },
            {
              startSurah: 1,
              startVerse: 5,
              endSurah: 1,
              endVerse: 7,
              errors: [
                err('mistake', 1, 5),
                err('mistake', 1, 6),
                err('warning', 1, 5),
                err('warning', 1, 6),
                err('warning', 1, 7),
                err('warning', 1, 7),
                err('harakat', 1, 5),
              ],
            },
          ],
        },
        makeActor(),
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mistakesCount: 3,
          warningsCount: 4,
          tajweedErrorsCount: 0,
          harakatErrorsCount: 3,
        }),
      );
    });

    it('test: rejects top-level errors (they belong on the positions)', async () => {
      const service = makeService({ ds: makeDataSource([[EVAL_SETTINGS]]) });

      await expect(
        service.create(
          {
            ...CREATE_INPUT,
            trackType: 'Near',
            recitationMethod: 'test',
            testPositions: [
              { startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 3 },
            ],
            errors: [err('mistake', 1, 1)],
          },
          makeActor(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('full: rejects test_positions', async () => {
      const service = makeService({ ds: makeDataSource([[EVAL_SETTINGS]]) });

      await expect(
        service.create(
          {
            ...CREATE_INPUT,
            recitationMethod: 'full',
            testPositions: [
              { startSurah: 1, startVerse: 1, endSurah: 1, endVerse: 3 },
            ],
          },
          makeActor(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an error whose ayah falls outside its position range', async () => {
      const service = makeService({ ds: makeDataSource([[EVAL_SETTINGS]]) });

      await expect(
        service.create(
          {
            ...CREATE_INPUT,
            startSurah: 1,
            startVerse: 1,
            endSurah: 1,
            endVerse: 7,
            recitationMethod: 'full',
            errors: [err('mistake', 2, 1)], // surah 2 is outside the achievement's surah-1 range
          },
          makeActor(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('update full: sending errors replaces the position and derives totals', async () => {
      const repo = makeRepo();
      const positions = makePositionsRepo();
      const achievement = makeAchievement({
        status: 'unapproved',
        recitationMethod: 'full',
      });
      repo.findOne.mockResolvedValue(achievement);
      repo.save.mockResolvedValue(achievement);

      const service = makeService({ repo, positions });
      await service.update(
        1,
        {
          errors: [
            err('warning', 1, 1),
            err('warning', 1, 2),
            err('tajweed', 1, 3),
          ],
        },
        makeActor(),
      );

      expect(achievement.mistakesCount).toBe(0);
      expect(achievement.warningsCount).toBe(2);
      expect(achievement.tajweedErrorsCount).toBe(1);
      expect(achievement.harakatErrorsCount).toBe(0);
    });
  });

  // ─── softDelete() ─────────────────────────────────────────────────────────

  describe('softDelete()', () => {
    it('allows principal to delete approved achievement', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(makeAchievement({ status: 'approved' }));
      repo.softRemove.mockResolvedValue(undefined);
      const recon = makeReconciliation();

      const service = makeService({ repo, recon });
      await expect(service.softDelete(1, makeActor())).resolves.not.toThrow();
      expect(recon.reconcileForAchievement).toHaveBeenCalledWith(1);
    });

    it('allows VP to delete approved achievement', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(makeAchievement({ status: 'approved' }));
      repo.softRemove.mockResolvedValue(undefined);

      const service = makeService({ repo });

      await expect(service.softDelete(1, makeVpActor())).resolves.not.toThrow();
    });

    it('allows an in-scope teacher to delete approved achievement', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(makeAchievement({ status: 'approved' }));
      repo.softRemove.mockResolvedValue(undefined);
      const ds = makeDataSource([[{ 1: 1 }]]);

      const service = makeService({ repo, ds });

      await expect(
        service.softDelete(1, makeTeacherActor()),
      ).resolves.not.toThrow();
    });

    it('throws NotFoundException when out-of-scope teacher deletes approved achievement', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(makeAchievement({ status: 'approved' }));
      const ds = makeDataSource([[]]);

      const service = makeService({ repo, ds });

      await expect(service.softDelete(1, makeTeacherActor())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('allows in-scope teacher to delete unapproved achievement', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(makeAchievement({ status: 'unapproved' }));
      repo.softRemove.mockResolvedValue(undefined);
      const ds = makeDataSource([[{ 1: 1 }]]); // teacher has scope

      const service = makeService({ repo, ds });
      await expect(
        service.softDelete(1, makeTeacherActor()),
      ).resolves.not.toThrow();
    });

    it('throws NotFoundException when out-of-scope teacher deletes unapproved achievement', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(makeAchievement({ status: 'unapproved' }));
      const ds = makeDataSource([[]]); // no scope

      const service = makeService({ repo, ds });

      await expect(service.softDelete(1, makeTeacherActor())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not reconcile when deleting unapproved achievement', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(makeAchievement({ status: 'unapproved' }));
      repo.softRemove.mockResolvedValue(undefined);
      const recon = makeReconciliation();

      const service = makeService({ repo, recon });
      await service.softDelete(1, makeActor());

      expect(recon.reconcileForAchievement).not.toHaveBeenCalled();
    });
  });

  // ─── findOne() ────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('throws NotFoundException for unknown id', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(null);

      const service = makeService({ repo });

      await expect(service.findOne(99, makeActor())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns achievement for admin without scope check', async () => {
      const repo = makeRepo();
      const achievement = makeAchievement();
      repo.findOne.mockResolvedValue(achievement);

      const service = makeService({ repo });
      const result = await service.findOne(1, makeActor());

      expect(result).toBe(achievement);
    });
  });
});
