import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ApiMessage } from '../../../common/api-message';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { HalaqaSchedule } from '../entities/halaqa-schedule.entity';
import { HalaqaTeacher } from '../entities/halaqa-teacher.entity';
import { Halaqa } from '../entities/halaqa.entity';
import { SupervisorHalaqa } from '../entities/supervisor-halaqa.entity';
import { HalaqaActivityLogService } from './halaqa-activity-log.service';
import { HalaqatService } from './halaqat.service';
import { ScheduleConflictService } from './schedule-conflict.service';

// ─── Actor fixtures ────────────────────────────────────────────────────────

const PRINCIPAL: AuthenticatedUser = {
  id: 1, schoolId: 1, status: 'active', tokenVersion: 0,
  roles: [{ slug: 'principal', level: 100 }],
};
const SUPERVISOR: AuthenticatedUser = {
  id: 3, schoolId: 1, status: 'active', tokenVersion: 0,
  roles: [{ slug: 'supervisor', level: 50 }],
};
const TEACHER: AuthenticatedUser = {
  id: 4, schoolId: 1, status: 'active', tokenVersion: 0,
  roles: [{ slug: 'teacher', level: 40 }],
};
const PARENT: AuthenticatedUser = {
  id: 9, schoolId: 1, status: 'active', tokenVersion: 0,
  roles: [{ slug: 'parent', level: 10 }],
};

// ─── Entity fixtures ───────────────────────────────────────────────────────

const NOW = new Date('2026-05-08T05:00:00.000Z');

const BASE_HALAQA: Halaqa = {
  id: 17,
  schoolId: 1,
  name: 'حلقة الفجر للحفظ',
  type: 'Memorization',
  evaluationSettings: null,
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  school: {} as never,
};

// ─── Mock factories ────────────────────────────────────────────────────────

function makeQb(halaqat: Halaqa[] = [BASE_HALAQA], total = 1) {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['where', 'andWhere', 'innerJoin', 'orderBy', 'skip', 'take', 'withDeleted']) {
    qb[m] = jest.fn().mockReturnValue(qb);
  }
  qb['getManyAndCount'] = jest.fn().mockResolvedValue([halaqat, total]);
  return qb;
}

function makeHalaqaRepo(overrides?: Partial<ReturnType<typeof makeHalaqaRepo>>): jest.Mocked<Partial<Repository<Halaqa>>> {
  return {
    findOne: jest.fn().mockResolvedValue(BASE_HALAQA),
    findOneOrFail: jest.fn().mockResolvedValue(BASE_HALAQA),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue(makeQb()),
    ...overrides,
  } as never;
}

function makeScheduleRepo(): jest.Mocked<Partial<Repository<HalaqaSchedule>>> {
  return {
    find: jest.fn().mockResolvedValue([]),
  } as never;
}

function makeSupervisorRepo(row: SupervisorHalaqa | null = null): jest.Mocked<Partial<Repository<SupervisorHalaqa>>> {
  return { findOne: jest.fn().mockResolvedValue(row) } as never;
}

function makeActivityLog(): jest.Mocked<HalaqaActivityLogService> {
  return { log: jest.fn().mockResolvedValue(undefined) } as never;
}

function makeConflictChecker(conflicts: unknown[] = []): jest.Mocked<ScheduleConflictService> {
  return { checkForTeacher: jest.fn().mockResolvedValue(conflicts) } as never;
}

function makeTxEm(emQuery: jest.Mock = jest.fn().mockResolvedValue([])): EntityManager {
  const mkRepo = (extra: object = {}) => ({
    create: jest.fn().mockImplementation((d: unknown) => ({ ...d as object })),
    save: jest.fn().mockImplementation((d: unknown) => Promise.resolve({ ...d as object, id: 17, createdAt: NOW, updatedAt: NOW })),
    ...extra,
  });
  return {
    getRepository: jest.fn().mockImplementation((cls: unknown) => {
      if (cls === Halaqa)         return mkRepo();
      if (cls === HalaqaSchedule) return mkRepo();
      if (cls === HalaqaTeacher)  return mkRepo();
      return mkRepo();
    }),
    query: emQuery,
  } as unknown as EntityManager;
}

function makeDataSource(
  managerQuery: jest.Mock = jest.fn().mockResolvedValue([{ '1': 1 }]),
  txEm?: EntityManager,
): jest.Mocked<DataSource> {
  return {
    manager: { query: managerQuery },
    transaction: jest.fn().mockImplementation(
      async (cb: (em: EntityManager) => Promise<unknown>) => cb(txEm ?? makeTxEm()),
    ),
  } as never;
}

function makeService({
  halaqaRepo = makeHalaqaRepo(),
  scheduleRepo = makeScheduleRepo(),
  supervisorRepo = makeSupervisorRepo(),
  ds = makeDataSource(),
  activityLog = makeActivityLog(),
  conflictChecker = makeConflictChecker(),
} = {}) {
  return new HalaqatService(
    halaqaRepo as unknown as Repository<Halaqa>,
    scheduleRepo as unknown as Repository<HalaqaSchedule>,
    supervisorRepo as unknown as Repository<SupervisorHalaqa>,
    ds as unknown as DataSource,
    activityLog,
    conflictChecker,
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('HalaqatService', () => {

  // ── loadAndCheckAccess ───────────────────────────────────────────────────
  describe('loadAndCheckAccess()', () => {
    it('throws NotFoundException when halaqa not found', async () => {
      const repo = makeHalaqaRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const svc = makeService({ halaqaRepo: repo });
      await expect(svc.loadAndCheckAccess(99, PRINCIPAL)).rejects.toThrow(NotFoundException);
    });

    it('returns halaqa for principal without any further checks', async () => {
      const svc = makeService();
      const h = await svc.loadAndCheckAccess(17, PRINCIPAL);
      expect(h.id).toBe(17);
    });

    it('returns halaqa for supervisor who has a supervisor_halaqat row', async () => {
      const svRow = { supervisorUserId: 3, halaqaId: 17 } as SupervisorHalaqa;
      const svc = makeService({ supervisorRepo: makeSupervisorRepo(svRow) });
      const h = await svc.loadAndCheckAccess(17, SUPERVISOR);
      expect(h.id).toBe(17);
    });

    it('throws NotFoundException for supervisor with no supervisor_halaqat row', async () => {
      const svc = makeService({ supervisorRepo: makeSupervisorRepo(null) });
      // query for teacher active assignment must also return nothing
      const ds = makeDataSource(jest.fn().mockResolvedValue([]));
      const svc2 = makeService({ supervisorRepo: makeSupervisorRepo(null), ds });
      await expect(svc2.loadAndCheckAccess(17, SUPERVISOR)).rejects.toThrow(NotFoundException);
    });

    it('returns halaqa for teacher with an active assignment', async () => {
      const ds = makeDataSource(jest.fn().mockResolvedValue([{ '1': 1 }]));
      const svc = makeService({ ds });
      const h = await svc.loadAndCheckAccess(17, TEACHER);
      expect(h.id).toBe(17);
    });

    it('throws NotFoundException for teacher with no active assignment', async () => {
      const ds = makeDataSource(jest.fn().mockResolvedValue([]));
      const svc = makeService({ ds });
      await expect(svc.loadAndCheckAccess(17, TEACHER)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for parent (never ForbiddenException — BR-HLQ-01)', async () => {
      const ds = makeDataSource(jest.fn().mockResolvedValue([]));
      const svc = makeService({ ds });
      await expect(svc.loadAndCheckAccess(17, PARENT)).rejects.toThrow(NotFoundException);
      // Must NOT throw ForbiddenException
      await expect(svc.loadAndCheckAccess(17, PARENT)).rejects.not.toThrow(ForbiddenException);
    });
  });

  // ── create ───────────────────────────────────────────────────────────────
  describe('create()', () => {
    it('calls verifyUserRoleInSchool (manager.query) when primary_teacher_user_id is provided', async () => {
      const managerQuery = jest.fn()
        .mockResolvedValueOnce([{ '1': 1 }]) // verifyUserRoleInSchool → found
        .mockResolvedValue([]);               // any further queries
      const ds = makeDataSource(managerQuery);
      const svc = makeService({ ds });

      await svc.create(
        { name: 'ح', type: 'Memorization', primary_teacher_user_id: 12 },
        PRINCIPAL,
      );

      expect(managerQuery).toHaveBeenCalledWith(
        expect.stringContaining("r.slug = ?"),
        [12, 1, 'teacher'],
      );
    });

    it('throws NotFoundException when primary_teacher_user_id not found in school', async () => {
      const managerQuery = jest.fn().mockResolvedValue([]); // verifyUserRoleInSchool → not found
      const ds = makeDataSource(managerQuery);
      const svc = makeService({ ds });

      await expect(
        svc.create({ name: 'ح', type: 'Memorization', primary_teacher_user_id: 99 }, PRINCIPAL),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when schedule has duplicate day_of_week values', async () => {
      const svc = makeService();
      await expect(
        svc.create(
          {
            name: 'ح', type: 'Memorization',
            schedule: [
              { day_of_week: 0, prayer_slot: 'fajr' },
              { day_of_week: 0, prayer_slot: 'asr' },
            ],
          },
          PRINCIPAL,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when conflictChecker finds a conflict', async () => {
      const managerQuery = jest.fn().mockResolvedValue([{ '1': 1 }]); // teacher found
      const ds = makeDataSource(managerQuery);
      const conflictChecker = makeConflictChecker([
        { day_of_week: 0, prayer_slot: 'fajr', conflicting_halaqa_id: 19, conflicting_halaqa_name: 'ح-2' },
      ]);
      const svc = makeService({ ds, conflictChecker });

      await expect(
        svc.create(
          {
            name: 'ح', type: 'Memorization',
            primary_teacher_user_id: 12,
            schedule: [{ day_of_week: 0, prayer_slot: 'fajr' }],
          },
          PRINCIPAL,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('does NOT call conflictChecker when schedule has no prayer_slot entries', async () => {
      const managerQuery = jest.fn().mockResolvedValue([{ '1': 1 }]);
      const ds = makeDataSource(managerQuery);
      const conflictChecker = makeConflictChecker([]);
      const svc = makeService({ ds, conflictChecker });

      await svc.create(
        {
          name: 'ح', type: 'Memorization',
          primary_teacher_user_id: 12,
          schedule: [{ day_of_week: 0 }], // no prayer_slot
        },
        PRINCIPAL,
      );

      expect(conflictChecker.checkForTeacher).not.toHaveBeenCalled();
    });

    it('logs halaqa_created and returns the created halaqa response', async () => {
      const activityLog = makeActivityLog();
      const svc = makeService({ activityLog });

      const result = await svc.create({ name: 'ح', type: 'Memorization' }, PRINCIPAL);

      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'halaqa_created', actorUserId: PRINCIPAL.id }),
        expect.anything(),
      );
      expect(result).toMatchObject({ name: 'ح', type: 'Memorization', status: 'active' });
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────
  describe('findAll()', () => {
    it('throws ForbiddenException when caller has no relevant role (e.g. parent)', async () => {
      const svc = makeService();
      await expect(svc.findAll({}, PARENT)).rejects.toThrow(ForbiddenException);
    });

    it('defaults page=1 and limit=20 when not provided', async () => {
      const qb = makeQb([], 0);
      const repo = makeHalaqaRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      const ds = makeDataSource(jest.fn().mockResolvedValue([]));
      const svc = makeService({ halaqaRepo: repo, ds });

      const result = await svc.findAll({}, PRINCIPAL);

      expect(qb['skip']).toHaveBeenCalledWith(0);   // (1-1) * 20
      expect(qb['take']).toHaveBeenCalledWith(20);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('returns primary_teacher=null when no primary teacher exists for a halaqa', async () => {
      const qb = makeQb([BASE_HALAQA], 1);
      const repo = makeHalaqaRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      // manager.query: first call = batchLoadPrimaryTeachers (returns []), second = batchLoadStudentCounts (returns [])
      const ds = makeDataSource(jest.fn().mockResolvedValue([]));
      const svc = makeService({ halaqaRepo: repo, ds });

      const result = await svc.findAll({}, PRINCIPAL);

      expect(result.items[0].primary_teacher).toBeNull();
    });

    it('returns students_count=0 when no active students exist', async () => {
      const qb = makeQb([BASE_HALAQA], 1);
      const repo = makeHalaqaRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      const ds = makeDataSource(jest.fn().mockResolvedValue([]));
      const svc = makeService({ halaqaRepo: repo, ds });

      const result = await svc.findAll({}, PRINCIPAL);

      expect(result.items[0].students_count).toBe(0);
    });

    it('merges primary teacher from batch query into the list item', async () => {
      const qb = makeQb([BASE_HALAQA], 1);
      const repo = makeHalaqaRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      const primaryRow = { halaqa_id: 17, teacher_user_id: 12, teacher_name: 'أحمد', is_acting: 0 };
      const managerQuery = jest.fn()
        .mockResolvedValueOnce([primaryRow]) // batchLoadPrimaryTeachers
        .mockResolvedValueOnce([]);          // batchLoadStudentCounts
      const ds = makeDataSource(managerQuery);
      const svc = makeService({ halaqaRepo: repo, ds });

      const result = await svc.findAll({}, PRINCIPAL);

      expect(result.items[0].primary_teacher).toEqual({
        user_id: 12,
        name: 'أحمد',
        is_acting: false,
      });
    });

    it('prefers acting teacher over main teacher when both exist for the same halaqa', async () => {
      const qb = makeQb([BASE_HALAQA], 1);
      const repo = makeHalaqaRepo({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
      // batchLoadPrimaryTeachers query is ordered by acting_as_primary DESC, so acting comes first
      const actingRow = { halaqa_id: 17, teacher_user_id: 55, teacher_name: 'النائب', is_acting: 1 };
      const mainRow   = { halaqa_id: 17, teacher_user_id: 12, teacher_name: 'الرئيسي', is_acting: 0 };
      const managerQuery = jest.fn()
        .mockResolvedValueOnce([actingRow, mainRow]) // acting first due to ORDER BY
        .mockResolvedValueOnce([]);
      const ds = makeDataSource(managerQuery);
      const svc = makeService({ halaqaRepo: repo, ds });

      const result = await svc.findAll({}, PRINCIPAL);

      expect(result.items[0].primary_teacher?.user_id).toBe(55);
      expect(result.items[0].primary_teacher?.is_acting).toBe(true);
    });
  });

  // ── update ───────────────────────────────────────────────────────────────
  describe('update()', () => {
    it('throws ForbiddenException when non-admin tries to change type', async () => {
      const svc = makeService({ supervisorRepo: makeSupervisorRepo({ halaqaId: 17 } as never) });
      await expect(
        svc.update(17, { type: 'Tajweed' }, SUPERVISOR),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when type change would violate BR-HLQ-03', async () => {
      // Principal skips the teacher-assignment check in loadAndCheckAccess,
      // so manager.query is called exactly once: the BR-HLQ-03 count.
      const managerQuery = jest.fn()
        .mockResolvedValueOnce([{ cnt: '2' }]); // BR-HLQ-03 → conflict found
      const ds = makeDataSource(managerQuery);
      const svc = makeService({ ds });

      await expect(
        svc.update(17, { type: 'Tajweed' }, PRINCIPAL),
      ).rejects.toThrow(ConflictException);
    });

    it('logs halaqa_updated when name is changed', async () => {
      const managerQuery = jest.fn().mockResolvedValue([{ cnt: '0' }]);
      const ds = makeDataSource(managerQuery);
      const activityLog = makeActivityLog();
      const svc = makeService({ ds, activityLog });

      await svc.update(17, { name: 'اسم جديد' }, PRINCIPAL);

      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'halaqa_updated', actorUserId: PRINCIPAL.id }),
      );
    });

    it('does not call activityLog when dto is empty (no changes)', async () => {
      const activityLog = makeActivityLog();
      const svc = makeService({ activityLog });

      await svc.update(17, {}, PRINCIPAL);

      expect(activityLog.log).not.toHaveBeenCalled();
    });
  });

  // ── archive ──────────────────────────────────────────────────────────────
  describe('archive()', () => {
    it('throws NotFoundException when halaqa not found', async () => {
      const repo = makeHalaqaRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const svc = makeService({ halaqaRepo: repo });
      await expect(svc.archive(99, PRINCIPAL)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when halaqa is already archived', async () => {
      const archived = { ...BASE_HALAQA, status: 'archived' } as Halaqa;
      const repo = makeHalaqaRepo({ findOne: jest.fn().mockResolvedValue(archived) });
      const svc = makeService({ halaqaRepo: repo });
      await expect(svc.archive(17, PRINCIPAL)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when halaqa has active students — BR-HLQ-10', async () => {
      const managerQuery = jest.fn().mockResolvedValue([{ cnt: '3' }]);
      const ds = makeDataSource(managerQuery);
      const svc = makeService({ ds });

      await expect(svc.archive(17, PRINCIPAL)).rejects.toThrow(ConflictException);
    });

    it('returns ApiMessage and logs halaqa_archived on success', async () => {
      const managerQuery = jest.fn().mockResolvedValue([{ cnt: '0' }]); // no active students
      const txEm = makeTxEm(jest.fn().mockResolvedValue([]));
      const ds = makeDataSource(managerQuery, txEm);
      const activityLog = makeActivityLog();
      const svc = makeService({ ds, activityLog });

      const result = await svc.archive(17, PRINCIPAL);

      expect(result).toBeInstanceOf(ApiMessage);
      expect(result.message).toBe('Halaqa archived.');
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'halaqa_archived' }),
        expect.anything(),
      );
    });
  });

  // ── complete ─────────────────────────────────────────────────────────────
  describe('complete()', () => {
    it('throws NotFoundException when halaqa not found', async () => {
      const repo = makeHalaqaRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const svc = makeService({ halaqaRepo: repo });
      await expect(svc.complete(99, PRINCIPAL)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when halaqa is not active', async () => {
      const completed = { ...BASE_HALAQA, status: 'completed' } as Halaqa;
      const repo = makeHalaqaRepo({ findOne: jest.fn().mockResolvedValue(completed) });
      const svc = makeService({ halaqaRepo: repo });
      await expect(svc.complete(17, PRINCIPAL)).rejects.toThrow(ConflictException);
    });

    it('returns ApiMessage and logs halaqa_completed on success', async () => {
      const activityLog = makeActivityLog();
      const svc = makeService({ activityLog });

      const result = await svc.complete(17, PRINCIPAL);

      expect(result).toBeInstanceOf(ApiMessage);
      expect(result.message).toBe('Halaqa marked as completed.');
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'halaqa_completed' }),
        expect.anything(),
      );
    });
  });

  // ── restore ──────────────────────────────────────────────────────────────
  describe('restore()', () => {
    it('throws NotFoundException when halaqa is not archived (or not found)', async () => {
      // findOne with status='archived' filter returns null → not archived
      const repo = makeHalaqaRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const svc = makeService({ halaqaRepo: repo });
      await expect(svc.restore(17, PRINCIPAL)).rejects.toThrow(NotFoundException);
    });

    it('returns ApiMessage and logs halaqa_restored on success', async () => {
      const archived = { ...BASE_HALAQA, status: 'archived', deletedAt: NOW } as Halaqa;
      const repo = makeHalaqaRepo({ findOne: jest.fn().mockResolvedValue(archived) });
      const activityLog = makeActivityLog();
      const svc = makeService({ halaqaRepo: repo, activityLog });

      const result = await svc.restore(17, PRINCIPAL);

      expect(result).toBeInstanceOf(ApiMessage);
      expect(result.message).toBe('Halaqa restored.');
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'halaqa_restored' }),
        expect.anything(),
      );
    });
  });
});
