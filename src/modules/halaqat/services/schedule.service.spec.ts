import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HalaqaSchedule } from '../entities/halaqa-schedule.entity';
import { HalaqaActivityLogService } from './halaqa-activity-log.service';
import { HalaqatService } from './halaqat.service';
import { ScheduleConflictService } from './schedule-conflict.service';
import { ScheduleService } from './schedule.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PRINCIPAL = {
  id: 1,
  schoolId: 10,
  roles: [{ slug: 'principal' }],
} as never;

const BASE_HALAQA = { id: 17, schoolId: 10, status: 'active' } as never;

const SCHEDULE_ROW = (overrides = {}): HalaqaSchedule =>
  ({
    id: 33,
    halaqaId: 17,
    dayOfWeek: 0,
    prayerSlot: 'fajr',
    startTime: '05:00:00',
    endTime: '06:00:00',
    ...overrides,
  }) as HalaqaSchedule;

// ─── Factory helpers ──────────────────────────────────────────────────────────

function makeScheduleRepo(rows: HalaqaSchedule[] = [SCHEDULE_ROW()]) {
  return {
    find: jest.fn().mockResolvedValue(rows),
    delete: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((data) => ({ ...data })),
    save: jest.fn().mockImplementation(async (entities) =>
      (Array.isArray(entities) ? entities : [entities]).map((e, i) => ({ id: 100 + i, ...e })),
    ),
  } as never;
}

function makeHalaqatService(halaqa: unknown = BASE_HALAQA) {
  return {
    loadAndCheckAccess: jest.fn().mockResolvedValue(halaqa),
  } as never;
}

function makeConflictChecker(conflicts: unknown[] = []) {
  return {
    checkTeachersForNewSchedule: jest.fn().mockResolvedValue(conflicts),
  } as never;
}

function makeActivityLog() {
  return { log: jest.fn().mockResolvedValue(undefined) } as never;
}

function makeTxEm(scheduleRepo: ReturnType<typeof makeScheduleRepo>) {
  return {
    getRepository: jest.fn().mockReturnValue(scheduleRepo),
    query: jest.fn().mockResolvedValue([]),
  } as never;
}

function makeDataSource(txEm: ReturnType<typeof makeTxEm>) {
  return {
    transaction: jest.fn().mockImplementation((cb: (em: unknown) => Promise<unknown>) => cb(txEm)),
  } as never;
}

function makeService(overrides: {
  scheduleRepo?: ReturnType<typeof makeScheduleRepo>;
  halaqatService?: ReturnType<typeof makeHalaqatService>;
  conflictChecker?: ReturnType<typeof makeConflictChecker>;
  activityLog?: ReturnType<typeof makeActivityLog>;
  txEm?: ReturnType<typeof makeTxEm>;
} = {}) {
  const scheduleRepo = overrides.scheduleRepo ?? makeScheduleRepo();
  const halaqatService = overrides.halaqatService ?? makeHalaqatService();
  const conflictChecker = overrides.conflictChecker ?? makeConflictChecker();
  const activityLog = overrides.activityLog ?? makeActivityLog();
  const txEm = overrides.txEm ?? makeTxEm(scheduleRepo);
  const ds = makeDataSource(txEm);

  return new ScheduleService(
    scheduleRepo,
    ds as never,
    halaqatService as HalaqatService,
    conflictChecker as ScheduleConflictService,
    activityLog as HalaqaActivityLogService,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ScheduleService', () => {
  describe('getSchedule()', () => {
    it('delegates access check to HalaqatService', async () => {
      const halaqatService = makeHalaqatService();
      const svc = makeService({ halaqatService });
      await svc.getSchedule(17, PRINCIPAL);
      expect(halaqatService.loadAndCheckAccess).toHaveBeenCalledWith(17, PRINCIPAL);
    });

    it('propagates NotFoundException from loadAndCheckAccess', async () => {
      const halaqatService = {
        loadAndCheckAccess: jest.fn().mockRejectedValue(new NotFoundException()),
      } as never;
      const svc = makeService({ halaqatService });
      await expect(svc.getSchedule(17, PRINCIPAL)).rejects.toThrow(NotFoundException);
    });

    it('returns mapped schedule entries ordered by day', async () => {
      const rows = [
        SCHEDULE_ROW({ id: 1, dayOfWeek: 0, prayerSlot: 'fajr', startTime: '05:00:00', endTime: '06:00:00' }),
        SCHEDULE_ROW({ id: 2, dayOfWeek: 3, prayerSlot: null, startTime: null, endTime: null }),
      ];
      const svc = makeService({ scheduleRepo: makeScheduleRepo(rows) });
      const result = await svc.getSchedule(17, PRINCIPAL);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 1, day_of_week: 0, prayer_slot: 'fajr', start_time: '05:00:00', end_time: '06:00:00' });
      expect(result[1]).toEqual({ id: 2, day_of_week: 3, prayer_slot: null, start_time: null, end_time: null });
    });

    it('returns empty array when no schedule entries exist', async () => {
      const svc = makeService({ scheduleRepo: makeScheduleRepo([]) });
      const result = await svc.getSchedule(17, PRINCIPAL);
      expect(result).toEqual([]);
    });
  });

  describe('setSchedule()', () => {
    it('throws BadRequestException on duplicate day_of_week', async () => {
      const svc = makeService();
      const dto = {
        schedule: [
          { day_of_week: 0, prayer_slot: 'fajr' },
          { day_of_week: 0, prayer_slot: 'dhuhr' },
        ],
      } as never;
      await expect(svc.setSchedule(17, dto, PRINCIPAL)).rejects.toThrow(BadRequestException);
    });

    it('delegates access check to HalaqatService', async () => {
      const halaqatService = makeHalaqatService();
      const svc = makeService({ halaqatService });
      await svc.setSchedule(17, { schedule: [] } as never, PRINCIPAL);
      expect(halaqatService.loadAndCheckAccess).toHaveBeenCalledWith(17, PRINCIPAL);
    });

    it('deletes existing schedule rows inside transaction', async () => {
      const scheduleRepo = makeScheduleRepo([]);
      const txEm = makeTxEm(scheduleRepo);
      const svc = makeService({ scheduleRepo, txEm });
      await svc.setSchedule(17, { schedule: [] } as never, PRINCIPAL);
      expect(scheduleRepo.delete).toHaveBeenCalledWith({ halaqaId: 17 });
    });

    it('saves new schedule rows and returns mapped entries', async () => {
      const scheduleRepo = makeScheduleRepo([]);
      const txEm = makeTxEm(scheduleRepo);
      const svc = makeService({ scheduleRepo, txEm });

      const result = await svc.setSchedule(
        17,
        { schedule: [{ day_of_week: 1, prayer_slot: 'dhuhr', start_time: '12:00:00', end_time: '13:00:00' }] } as never,
        PRINCIPAL,
      );

      expect(scheduleRepo.save).toHaveBeenCalled();
      expect(result.schedule).toHaveLength(1);
      expect(result.schedule[0]).toMatchObject({
        day_of_week: 1,
        prayer_slot: 'dhuhr',
        start_time: '12:00:00',
        end_time: '13:00:00',
      });
    });

    it('returns empty schedule array when dto.schedule is empty', async () => {
      const scheduleRepo = makeScheduleRepo([]);
      const txEm = makeTxEm(scheduleRepo);
      const svc = makeService({ scheduleRepo, txEm });
      const result = await svc.setSchedule(17, { schedule: [] } as never, PRINCIPAL);
      expect(result.schedule).toEqual([]);
      expect(scheduleRepo.save).not.toHaveBeenCalled();
    });

    it('calls checkTeachersForNewSchedule with new slots and schoolId', async () => {
      const conflictChecker = makeConflictChecker([]);
      const scheduleRepo = makeScheduleRepo([]);
      const txEm = makeTxEm(scheduleRepo);
      const svc = makeService({ conflictChecker, scheduleRepo, txEm });

      const dto = {
        schedule: [
          { day_of_week: 0, prayer_slot: 'fajr' },
          { day_of_week: 2, prayer_slot: undefined },
        ],
      } as never;
      await svc.setSchedule(17, dto, PRINCIPAL);

      expect(conflictChecker.checkTeachersForNewSchedule).toHaveBeenCalledWith(
        17,
        [
          { day_of_week: 0, prayer_slot: 'fajr' },
          { day_of_week: 2, prayer_slot: undefined },
        ],
        10, // schoolId
        expect.anything(), // em
      );
    });

    it('returns empty warnings when no conflicts', async () => {
      const scheduleRepo = makeScheduleRepo([]);
      const txEm = makeTxEm(scheduleRepo);
      const svc = makeService({ conflictChecker: makeConflictChecker([]), scheduleRepo, txEm });
      const result = await svc.setSchedule(17, { schedule: [] } as never, PRINCIPAL);
      expect(result.warnings).toEqual([]);
    });

    it('populates warnings from teacher conflicts', async () => {
      const conflictChecker = makeConflictChecker([
        {
          teacher_user_id: 55,
          teacher_name: 'أحمد',
          conflicts: [
            { day_of_week: 0, prayer_slot: 'fajr', conflicting_halaqa_id: 5, conflicting_halaqa_name: 'حلقة أخرى' },
          ],
        },
      ]);
      const scheduleRepo = makeScheduleRepo([]);
      const txEm = makeTxEm(scheduleRepo);
      const svc = makeService({ conflictChecker, scheduleRepo, txEm });
      const result = await svc.setSchedule(17, { schedule: [{ day_of_week: 0, prayer_slot: 'fajr' }] } as never, PRINCIPAL);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('أحمد');
      expect(result.warnings[0]).toContain('55');
      expect(result.warnings[0]).toContain('حلقة أخرى');
    });

    it('logs schedule_updated with correct params', async () => {
      const activityLog = makeActivityLog();
      const scheduleRepo = makeScheduleRepo([]);
      const txEm = makeTxEm(scheduleRepo);
      const svc = makeService({ activityLog, scheduleRepo, txEm });
      await svc.setSchedule(17, { schedule: [] } as never, PRINCIPAL);
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'schedule_updated',
          halaqaId: 17,
          schoolId: 10,
          actorUserId: PRINCIPAL.id,
        }),
        expect.anything(),
      );
    });
  });
});
