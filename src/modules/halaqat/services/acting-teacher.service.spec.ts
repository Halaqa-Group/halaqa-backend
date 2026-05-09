import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { HalaqaTeacher } from '../entities/halaqa-teacher.entity';
import { ActingTeacherService } from './acting-teacher.service';
import { HalaqaActivityLogService } from './halaqa-activity-log.service';
import { HalaqatService } from './halaqat.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TODAY = '2026-05-09';

const PRINCIPAL = {
  id: 1, schoolId: 10,
  roles: [{ slug: 'principal' }],
} as never;

const BASE_ASSIGNMENT: HalaqaTeacher = {
  id: 55, halaqaId: 17, teacherUserId: 12,
  role: 'main', actingAsPrimary: false,
  actingStartsAt: null, actingEndsAt: null,
  startDate: '2026-01-01', endDate: null, endReason: null,
  assignedBy: 1, notes: null,
  createdAt: new Date(), updatedAt: new Date(),
  halaqa: {} as never, teacher: {} as never, assigner: null,
};

const ACTING_ASSIGNMENT: HalaqaTeacher = {
  ...BASE_ASSIGNMENT,
  actingAsPrimary: true,
  actingStartsAt: '2026-05-01',
  actingEndsAt: '2026-05-15',
};

const BASE_ROW = {
  id: 55, teacher_user_id: 12, teacher_name: 'أحمد',
  role: 'main', acting_as_primary: 0,
  acting_starts_at: null, acting_ends_at: null,
  start_date: '2026-01-01', end_date: null, end_reason: null,
};

// ─── Factory helpers ───────────────────────────────────────────────────────────

function makeRepo(overrides: Partial<{
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
}> = {}) {
  return {
    findOne: overrides.findOne ?? jest.fn().mockResolvedValue(null),
    save: overrides.save ?? jest.fn().mockImplementation(async (e) => ({ ...e, id: e.id ?? 55 })),
    create: overrides.create ?? jest.fn().mockImplementation((d) => ({ ...d })),
  } as never;
}

function makeDataSource(queryRows: unknown[] = [BASE_ROW]) {
  return {
    manager: { query: jest.fn().mockResolvedValue(queryRows) },
  } as never;
}

function makeHalaqatService() {
  return {
    loadAndCheckAccess: jest.fn().mockResolvedValue({ id: 17, schoolId: 10, status: 'active' }),
    verifyUserRoleInSchool: jest.fn().mockResolvedValue(undefined),
  } as never;
}

function makeActivityLog() {
  return { log: jest.fn().mockResolvedValue(undefined) } as never;
}

function makeService(overrides: {
  repo?: ReturnType<typeof makeRepo>;
  ds?: ReturnType<typeof makeDataSource>;
  halaqatService?: ReturnType<typeof makeHalaqatService>;
  activityLog?: ReturnType<typeof makeActivityLog>;
  today?: string;
} = {}) {
  const svc = new ActingTeacherService(
    overrides.repo ?? makeRepo(),
    overrides.ds ?? makeDataSource(),
    (overrides.halaqatService ?? makeHalaqatService()) as HalaqatService,
    (overrides.activityLog ?? makeActivityLog()) as HalaqaActivityLogService,
  );
  if (overrides.today !== undefined) {
    jest.spyOn(svc as never, 'today').mockReturnValue(overrides.today);
  } else {
    jest.spyOn(svc as never, 'today').mockReturnValue(TODAY);
  }
  return svc;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('ActingTeacherService', () => {
  // ── setActing ────────────────────────────────────────────────────────────────
  describe('setActing()', () => {
    it('throws 404 when assignment not found', async () => {
      const svc = makeService({ repo: makeRepo({ findOne: jest.fn().mockResolvedValue(null) }) });
      await expect(
        svc.setActing(17, 55, { acting_starts_at: TODAY, acting_ends_at: '2026-05-20' }, PRINCIPAL),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 409 when assignment is already ended', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...BASE_ASSIGNMENT, endDate: '2026-04-01' }),
      });
      const svc = makeService({ repo });
      await expect(
        svc.setActing(17, 55, { acting_starts_at: TODAY, acting_ends_at: '2026-05-20' }, PRINCIPAL),
      ).rejects.toThrow(ConflictException);
    });

    it('throws 409 when teacher is already acting as primary', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...BASE_ASSIGNMENT, actingAsPrimary: true }),
      });
      const svc = makeService({ repo });
      await expect(
        svc.setActing(17, 55, { acting_starts_at: TODAY, acting_ends_at: '2026-05-20' }, PRINCIPAL),
      ).rejects.toThrow(ConflictException);
    });

    it('throws 400 when acting_starts_at is in the past', async () => {
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue({ ...BASE_ASSIGNMENT }) });
      const svc = makeService({ repo });
      await expect(
        svc.setActing(17, 55, { acting_starts_at: '2026-05-01', acting_ends_at: '2026-05-20' }, PRINCIPAL),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 409 when another teacher is already acting', async () => {
      const repo = makeRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce({ ...BASE_ASSIGNMENT })    // first call: load assignment
          .mockResolvedValueOnce({ ...ACTING_ASSIGNMENT, id: 99 }), // second call: findCurrentActing
      });
      const svc = makeService({ repo });
      await expect(
        svc.setActing(17, 55, { acting_starts_at: TODAY, acting_ends_at: '2026-05-20' }, PRINCIPAL),
      ).rejects.toThrow(ConflictException);
    });

    it('sets actingAsPrimary=true immediately when acting_starts_at is today', async () => {
      const repo = makeRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce({ ...BASE_ASSIGNMENT })
          .mockResolvedValueOnce(null),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const svc = makeService({ repo });
      await svc.setActing(17, 55, { acting_starts_at: TODAY, acting_ends_at: '2026-05-20' }, PRINCIPAL);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ actingAsPrimary: true }));
    });

    it('leaves actingAsPrimary=false when acting_starts_at is in the future', async () => {
      const repo = makeRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce({ ...BASE_ASSIGNMENT })
          .mockResolvedValueOnce(null),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const svc = makeService({ repo });
      await svc.setActing(17, 55, { acting_starts_at: '2026-05-15', acting_ends_at: '2026-05-25' }, PRINCIPAL);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ actingAsPrimary: false }));
    });

    it('logs acting_started', async () => {
      const activityLog = makeActivityLog();
      const repo = makeRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce({ ...BASE_ASSIGNMENT })
          .mockResolvedValueOnce(null),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const svc = makeService({ repo, activityLog });
      await svc.setActing(17, 55, { acting_starts_at: TODAY, acting_ends_at: '2026-05-20' }, PRINCIPAL);
      expect(activityLog.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'acting_started',
        halaqaId: 17,
        targetUserId: BASE_ASSIGNMENT.teacherUserId,
      }));
    });

    it('returns mapped TeacherAssignmentResponse', async () => {
      const actingRow = { ...BASE_ROW, acting_as_primary: 1, acting_starts_at: TODAY, acting_ends_at: '2026-05-20' };
      const repo = makeRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce({ ...BASE_ASSIGNMENT })
          .mockResolvedValueOnce(null),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const ds = makeDataSource([actingRow]);
      const svc = makeService({ repo, ds });
      const result = await svc.setActing(17, 55, { acting_starts_at: TODAY, acting_ends_at: '2026-05-20' }, PRINCIPAL);
      expect(result).toMatchObject({ id: 55, acting_as_primary: true, acting_starts_at: TODAY });
    });
  });

  // ── substitute ───────────────────────────────────────────────────────────────
  describe('substitute()', () => {
    const dto = { teacher_user_id: 99, acting_starts_at: TODAY, acting_ends_at: '2026-05-20' };

    it('throws 400 when acting_starts_at is in the future', async () => {
      const svc = makeService();
      await expect(
        svc.substitute(17, { ...dto, acting_starts_at: '2026-05-15' }, PRINCIPAL),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 409 when teacher already has active assignment in halaqa', async () => {
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue({ ...BASE_ASSIGNMENT }) });
      const svc = makeService({ repo });
      await expect(svc.substitute(17, dto, PRINCIPAL)).rejects.toThrow(ConflictException);
    });

    it('throws 409 when another teacher is already acting', async () => {
      const repo = makeRepo({
        findOne: jest.fn()
          .mockResolvedValueOnce(null)                              // not already assigned
          .mockResolvedValueOnce({ ...ACTING_ASSIGNMENT, id: 99 }), // acting teacher exists
      });
      const svc = makeService({ repo });
      await expect(svc.substitute(17, dto, PRINCIPAL)).rejects.toThrow(ConflictException);
    });

    it('creates row with role=substitute, actingAsPrimary=true, startDate=acting_starts_at', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue(null),
      });
      const svc = makeService({ repo });
      await svc.substitute(17, dto, PRINCIPAL);
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        halaqaId: 17,
        teacherUserId: 99,
        role: 'substitute',
        actingAsPrimary: true,
        actingStartsAt: TODAY,
        startDate: TODAY,
      }));
    });

    it('does NOT call checkForTeacher (BR-HLQ-08 bypass)', async () => {
      // There is no conflictChecker dependency on ActingTeacherService — verified structurally.
      // This test confirms substitute() resolves without any conflict-related rejection.
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const svc = makeService({ repo });
      await expect(svc.substitute(17, dto, PRINCIPAL)).resolves.toBeDefined();
    });

    it('logs acting_started', async () => {
      const activityLog = makeActivityLog();
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const svc = makeService({ repo, activityLog });
      await svc.substitute(17, dto, PRINCIPAL);
      expect(activityLog.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'acting_started',
        targetUserId: 99,
      }));
    });

    it('verifies teacher role in school', async () => {
      const halaqatService = makeHalaqatService();
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const svc = makeService({ repo, halaqatService });
      await svc.substitute(17, dto, PRINCIPAL);
      expect(halaqatService.verifyUserRoleInSchool).toHaveBeenCalledWith(99, 10, 'teacher');
    });
  });

  // ── extend ───────────────────────────────────────────────────────────────────
  describe('extend()', () => {
    it('throws 404 when no active acting teacher', async () => {
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const svc = makeService({ repo });
      await expect(svc.extend(17, { acting_ends_at: '2026-06-01' }, PRINCIPAL)).rejects.toThrow(NotFoundException);
    });

    it('throws 400 when new date is not after current acting_ends_at', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...ACTING_ASSIGNMENT }),
      });
      const svc = makeService({ repo });
      await expect(
        svc.extend(17, { acting_ends_at: '2026-05-10' }, PRINCIPAL),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 400 when new date equals current acting_ends_at', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...ACTING_ASSIGNMENT }),
      });
      const svc = makeService({ repo });
      await expect(
        svc.extend(17, { acting_ends_at: '2026-05-15' }, PRINCIPAL),
      ).rejects.toThrow(BadRequestException);
    });

    it('saves updated acting_ends_at', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...ACTING_ASSIGNMENT }),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const svc = makeService({ repo });
      await svc.extend(17, { acting_ends_at: '2026-06-01' }, PRINCIPAL);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ actingEndsAt: '2026-06-01' }));
    });

    it('logs acting_extended', async () => {
      const activityLog = makeActivityLog();
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...ACTING_ASSIGNMENT }),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const svc = makeService({ repo, activityLog });
      await svc.extend(17, { acting_ends_at: '2026-06-01' }, PRINCIPAL);
      expect(activityLog.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'acting_extended',
        halaqaId: 17,
        targetUserId: ACTING_ASSIGNMENT.teacherUserId,
      }));
    });
  });

  // ── endActing ─────────────────────────────────────────────────────────────────
  describe('endActing()', () => {
    it('throws 404 when no active acting teacher', async () => {
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const svc = makeService({ repo });
      await expect(svc.endActing(17, PRINCIPAL)).rejects.toThrow(NotFoundException);
    });

    it('clears acting fields', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...ACTING_ASSIGNMENT }),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const svc = makeService({ repo });
      await svc.endActing(17, PRINCIPAL);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
        actingAsPrimary: false,
        actingStartsAt: null,
        actingEndsAt: null,
      }));
    });

    it('ends the assignment row when teacher is substitute', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...ACTING_ASSIGNMENT, role: 'substitute' }),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const svc = makeService({ repo });
      await svc.endActing(17, PRINCIPAL);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
        endDate: TODAY,
        endReason: 'reassigned',
      }));
    });

    it('does not set endDate for non-substitute acting teacher', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...ACTING_ASSIGNMENT, role: 'main' }),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const svc = makeService({ repo });
      await svc.endActing(17, PRINCIPAL);
      const saved = (repo.save as jest.Mock).mock.calls[0][0] as HalaqaTeacher;
      expect(saved.endDate).toBeNull();
    });

    it('logs acting_ended', async () => {
      const activityLog = makeActivityLog();
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...ACTING_ASSIGNMENT }),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const svc = makeService({ repo, activityLog });
      await svc.endActing(17, PRINCIPAL);
      expect(activityLog.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'acting_ended',
        halaqaId: 17,
        targetUserId: ACTING_ASSIGNMENT.teacherUserId,
      }));
    });

    it('returns ApiMessage', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...ACTING_ASSIGNMENT }),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const svc = makeService({ repo });
      const result = await svc.endActing(17, PRINCIPAL);
      expect(result).toEqual({ message: 'Acting period ended.' });
    });
  });
});
