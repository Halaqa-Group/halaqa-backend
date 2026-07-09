import { ConflictException, NotFoundException } from '@nestjs/common';
import { SupervisorHalaqa } from '../entities/supervisor-halaqa.entity';
import { HalaqaActivityLogService } from './halaqa-activity-log.service';
import { HalaqatService } from './halaqat.service';
import { SupervisorAssignmentService } from './supervisor-assignment.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PRINCIPAL = {
  id: 1,
  schoolId: 10,
  roles: [{ slug: 'principal' }],
} as never;

const BASE_ASSIGNMENT: SupervisorHalaqa = {
  supervisorUserId: 5,
  halaqaId: 17,
  assignedAt: new Date('2026-01-01T08:00:00Z'),
  supervisor: {} as never,
  halaqa: {} as never,
};

const BASE_ROW = {
  user_id: 5,
  name: 'محمد المشرف',
  assigned_at: new Date('2026-01-01T08:00:00Z'),
};

// ─── Factory helpers ───────────────────────────────────────────────────────────

function makeRepo(
  overrides: Partial<{
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  }> = {},
) {
  return {
    findOne: overrides.findOne ?? jest.fn().mockResolvedValue(null),
    save: overrides.save ?? jest.fn().mockImplementation(async (e) => e),
    create: overrides.create ?? jest.fn().mockImplementation((d) => ({ ...d })),
    delete: overrides.delete ?? jest.fn().mockResolvedValue({ affected: 1 }),
  } as never;
}

function makeDataSource(queryRows: unknown[] = [BASE_ROW]) {
  return {
    manager: { query: jest.fn().mockResolvedValue(queryRows) },
  } as never;
}

function makeHalaqatService() {
  return {
    loadAndCheckAccess: jest
      .fn()
      .mockResolvedValue({ id: 17, schoolId: 10, status: 'active' }),
    verifyUserRoleInSchool: jest.fn().mockResolvedValue(undefined),
  } as never;
}

function makeActivityLog() {
  return { log: jest.fn().mockResolvedValue(undefined) } as never;
}

function makeService(
  overrides: {
    repo?: ReturnType<typeof makeRepo>;
    ds?: ReturnType<typeof makeDataSource>;
    halaqatService?: ReturnType<typeof makeHalaqatService>;
    activityLog?: ReturnType<typeof makeActivityLog>;
  } = {},
) {
  return new SupervisorAssignmentService(
    overrides.repo ?? makeRepo(),
    overrides.ds ?? makeDataSource(),
    overrides.halaqatService ?? makeHalaqatService(),
    overrides.activityLog ?? makeActivityLog(),
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('SupervisorAssignmentService', () => {
  // ── assign ───────────────────────────────────────────────────────────────────
  describe('assign()', () => {
    it('verifies halaqa access and supervisor role in school', async () => {
      const halaqatService = makeHalaqatService();
      const svc = makeService({ halaqatService });
      await svc.assign(17, { supervisor_user_id: 5 }, PRINCIPAL);
      expect(halaqatService.loadAndCheckAccess).toHaveBeenCalledWith(
        17,
        PRINCIPAL,
      );
      expect(halaqatService.verifyUserRoleInSchool).toHaveBeenCalledWith(
        5,
        10,
        'supervisor',
      );
    });

    it('throws 409 when supervisor already assigned', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue(BASE_ASSIGNMENT),
      });
      const svc = makeService({ repo });
      await expect(
        svc.assign(17, { supervisor_user_id: 5 }, PRINCIPAL),
      ).rejects.toThrow(ConflictException);
    });

    it('saves new assignment', async () => {
      const repo = makeRepo();
      const svc = makeService({ repo });
      await svc.assign(17, { supervisor_user_id: 5 }, PRINCIPAL);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          halaqaId: 17,
          supervisorUserId: 5,
        }),
      );
      expect(repo.save).toHaveBeenCalled();
    });

    it('logs supervisor_assigned', async () => {
      const activityLog = makeActivityLog();
      const svc = makeService({ activityLog });
      await svc.assign(17, { supervisor_user_id: 5 }, PRINCIPAL);
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'supervisor_assigned',
          halaqaId: 17,
          targetUserId: 5,
          actorUserId: 1,
        }),
      );
    });

    it('returns mapped SupervisorSummaryResponse', async () => {
      const svc = makeService();
      const result = await svc.assign(17, { supervisor_user_id: 5 }, PRINCIPAL);
      expect(result).toMatchObject({ user_id: 5, name: 'محمد المشرف' });
      expect(result.assigned_at).toBeInstanceOf(Date);
    });
  });

  // ── listSupervisors ───────────────────────────────────────────────────────────
  describe('listSupervisors()', () => {
    it('delegates access check to HalaqatService', async () => {
      const halaqatService = makeHalaqatService();
      const svc = makeService({ halaqatService });
      await svc.listSupervisors(17, PRINCIPAL);
      expect(halaqatService.loadAndCheckAccess).toHaveBeenCalledWith(
        17,
        PRINCIPAL,
      );
    });

    it('returns all supervisors mapped to response shape', async () => {
      const rows = [
        BASE_ROW,
        {
          user_id: 6,
          name: 'فاطمة المشرفة',
          assigned_at: new Date('2026-02-01T08:00:00Z'),
        },
      ];
      const svc = makeService({ ds: makeDataSource(rows) });
      const result = await svc.listSupervisors(17, PRINCIPAL);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ user_id: 5, name: 'محمد المشرف' });
      expect(result[1]).toMatchObject({ user_id: 6, name: 'فاطمة المشرفة' });
    });

    it('returns empty array when no supervisors assigned', async () => {
      const svc = makeService({ ds: makeDataSource([]) });
      expect(await svc.listSupervisors(17, PRINCIPAL)).toEqual([]);
    });
  });

  // ── unassign ──────────────────────────────────────────────────────────────────
  describe('unassign()', () => {
    it('throws 404 when supervisor is not assigned', async () => {
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const svc = makeService({ repo });
      await expect(svc.unassign(17, 5, PRINCIPAL)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes the assignment', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue(BASE_ASSIGNMENT),
      });
      const svc = makeService({ repo });
      await svc.unassign(17, 5, PRINCIPAL);
      expect(repo.delete).toHaveBeenCalledWith({
        halaqaId: 17,
        supervisorUserId: 5,
      });
    });

    it('logs supervisor_unassigned', async () => {
      const activityLog = makeActivityLog();
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue(BASE_ASSIGNMENT),
      });
      const svc = makeService({ repo, activityLog });
      await svc.unassign(17, 5, PRINCIPAL);
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'supervisor_unassigned',
          halaqaId: 17,
          targetUserId: 5,
        }),
      );
    });

    it('returns ApiMessage', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue(BASE_ASSIGNMENT),
      });
      const svc = makeService({ repo });
      const result = await svc.unassign(17, 5, PRINCIPAL);
      expect(result).toEqual({ message: 'Supervisor unassigned.' });
    });
  });
});
