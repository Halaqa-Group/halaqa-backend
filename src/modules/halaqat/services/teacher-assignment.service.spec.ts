import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { HalaqaTeacher } from '../entities/halaqa-teacher.entity';
import { TeacherAssignmentService } from './teacher-assignment.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PRINCIPAL = {
  id: 1,
  schoolId: 10,
  roles: [{ slug: 'principal' }],
} as never;

const BASE_ASSIGNMENT: HalaqaTeacher = {
  id: 55,
  halaqaId: 17,
  teacherUserId: 12,
  role: 'main',
  actingAsPrimary: false,
  actingStartsAt: null,
  actingEndsAt: null,
  startDate: '2026-01-01',
  endDate: null,
  endReason: null,
  assignedBy: 1,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  halaqa: {} as never,
  teacher: {} as never,
  assigner: null,
};

const BASE_ROW = {
  id: 55,
  teacher_user_id: 12,
  teacher_name: 'أحمد',
  role: 'main',
  acting_as_primary: 0,
  acting_starts_at: null,
  acting_ends_at: null,
  start_date: '2026-01-01',
  end_date: null,
  end_reason: null,
};

// ─── Factory helpers ───────────────────────────────────────────────────────────

function makeRepo(
  overrides: Partial<{
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  }> = {},
) {
  return {
    findOne: overrides.findOne ?? jest.fn().mockResolvedValue(null),
    save:
      overrides.save ??
      jest.fn().mockImplementation(async (e) => ({ ...e, id: e.id ?? 55 })),
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
  return new TeacherAssignmentService(
    overrides.repo ?? makeRepo(),
    overrides.ds ?? makeDataSource(),
    overrides.halaqatService ?? makeHalaqatService(),
    overrides.activityLog ?? makeActivityLog(),
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('TeacherAssignmentService', () => {
  // ── assign ──────────────────────────────────────────────────────────────────
  describe('assign()', () => {
    it('verifies halaqa access and teacher role in school', async () => {
      const halaqatService = makeHalaqatService();
      const svc = makeService({ halaqatService });
      await svc.assign(
        17,
        { teacher_user_id: 12, role: 'main', start_date: '2026-05-01' },
        PRINCIPAL,
      );
      expect(halaqatService.loadAndCheckAccess).toHaveBeenCalledWith(
        17,
        PRINCIPAL,
      );
      expect(halaqatService.verifyUserRoleInSchool).toHaveBeenCalledWith(
        12,
        10,
        'teacher',
      );
    });

    it('throws 409 when teacher already has active assignment', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue(BASE_ASSIGNMENT),
      });
      const svc = makeService({ repo });
      await expect(
        svc.assign(
          17,
          { teacher_user_id: 12, role: 'main', start_date: '2026-05-01' },
          PRINCIPAL,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('saves assignment with correct fields', async () => {
      const repo = makeRepo();
      const svc = makeService({ repo });
      await svc.assign(
        17,
        {
          teacher_user_id: 12,
          role: 'assistant',
          start_date: '2026-05-01',
          notes: 'test',
        },
        PRINCIPAL,
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          halaqaId: 17,
          teacherUserId: 12,
          role: 'assistant',
          actingAsPrimary: false,
          startDate: '2026-05-01',
          notes: 'test',
          assignedBy: PRINCIPAL.id,
        }),
      );
    });

    it('logs teacher_assigned', async () => {
      const activityLog = makeActivityLog();
      const svc = makeService({ activityLog });
      await svc.assign(
        17,
        { teacher_user_id: 12, role: 'main', start_date: '2026-05-01' },
        PRINCIPAL,
      );
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'teacher_assigned',
          halaqaId: 17,
          targetUserId: 12,
          actorUserId: PRINCIPAL.id,
        }),
      );
    });

    it('returns mapped TeacherAssignmentResponse', async () => {
      const svc = makeService();
      const result = await svc.assign(
        17,
        { teacher_user_id: 12, role: 'main', start_date: '2026-05-01' },
        PRINCIPAL,
      );
      expect(result).toMatchObject({
        id: 55,
        teacher_user_id: 12,
        teacher_name: 'أحمد',
        role: 'main',
        acting_as_primary: false,
      });
    });
  });

  // ── findAll ─────────────────────────────────────────────────────────────────
  describe('findAll()', () => {
    it('delegates access check to HalaqatService', async () => {
      const halaqatService = makeHalaqatService();
      const svc = makeService({ halaqatService });
      await svc.findAll(17, PRINCIPAL);
      expect(halaqatService.loadAndCheckAccess).toHaveBeenCalledWith(
        17,
        PRINCIPAL,
      );
    });

    it('returns active assignments mapped to response shape', async () => {
      const ds = makeDataSource([
        BASE_ROW,
        {
          ...BASE_ROW,
          id: 56,
          teacher_user_id: 13,
          teacher_name: 'محمد',
          role: 'assistant',
        },
      ]);
      const svc = makeService({ ds });
      const result = await svc.findAll(17, PRINCIPAL);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 55, role: 'main' });
      expect(result[1]).toMatchObject({ id: 56, role: 'assistant' });
    });

    it('returns empty array when no active assignments', async () => {
      const svc = makeService({ ds: makeDataSource([]) });
      expect(await svc.findAll(17, PRINCIPAL)).toEqual([]);
    });
  });

  // ── updateAssignment ─────────────────────────────────────────────────────────
  describe('updateAssignment()', () => {
    it('throws 404 when assignment not found', async () => {
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const svc = makeService({ repo });
      await expect(
        svc.updateAssignment(17, 55, { role: 'assistant' }, PRINCIPAL),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 409 when assignment is already ended', async () => {
      const repo = makeRepo({
        findOne: jest
          .fn()
          .mockResolvedValue({ ...BASE_ASSIGNMENT, endDate: '2026-04-01' }),
      });
      const svc = makeService({ repo });
      await expect(
        svc.updateAssignment(17, 55, { role: 'assistant' }, PRINCIPAL),
      ).rejects.toThrow(ConflictException);
    });

    it('throws 409 when trying to update a substitute assignment', async () => {
      const repo = makeRepo({
        findOne: jest
          .fn()
          .mockResolvedValue({ ...BASE_ASSIGNMENT, role: 'substitute' }),
      });
      const svc = makeService({ repo });
      await expect(
        svc.updateAssignment(17, 55, { role: 'main' }, PRINCIPAL),
      ).rejects.toThrow(ConflictException);
    });

    it('saves updated role and notes', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...BASE_ASSIGNMENT }),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const svc = makeService({ repo });
      await svc.updateAssignment(
        17,
        55,
        { role: 'assistant', notes: 'stepped down' },
        PRINCIPAL,
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'assistant', notes: 'stepped down' }),
      );
    });

    it('logs teacher_role_changed only when role actually changes', async () => {
      const activityLog = makeActivityLog();
      const repo = makeRepo({
        findOne: jest
          .fn()
          .mockResolvedValue({ ...BASE_ASSIGNMENT, role: 'main' }),
      });
      const svc = makeService({ repo, activityLog });

      await svc.updateAssignment(17, 55, { role: 'assistant' }, PRINCIPAL);
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'teacher_role_changed' }),
      );
    });

    it('does not log when role is unchanged', async () => {
      const activityLog = makeActivityLog();
      const repo = makeRepo({
        findOne: jest
          .fn()
          .mockResolvedValue({ ...BASE_ASSIGNMENT, role: 'main' }),
      });
      const svc = makeService({ repo, activityLog });

      await svc.updateAssignment(
        17,
        55,
        { role: 'main', notes: 'updated notes' },
        PRINCIPAL,
      );
      expect(activityLog.log).not.toHaveBeenCalled();
    });
  });

  // ── endAssignment ────────────────────────────────────────────────────────────
  describe('endAssignment()', () => {
    const dto = { end_date: '2026-05-15', end_reason: 'vacation' as const };

    it('throws 404 when assignment not found', async () => {
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const svc = makeService({ repo });
      await expect(svc.endAssignment(17, 55, dto, PRINCIPAL)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 409 when assignment is already ended', async () => {
      const repo = makeRepo({
        findOne: jest
          .fn()
          .mockResolvedValue({ ...BASE_ASSIGNMENT, endDate: '2026-04-01' }),
      });
      const svc = makeService({ repo });
      await expect(svc.endAssignment(17, 55, dto, PRINCIPAL)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws 400 when end_date is before start_date', async () => {
      const repo = makeRepo({
        findOne: jest
          .fn()
          .mockResolvedValue({ ...BASE_ASSIGNMENT, startDate: '2026-06-01' }),
      });
      const svc = makeService({ repo });
      await expect(
        svc.endAssignment(
          17,
          55,
          { end_date: '2026-05-01', end_reason: 'vacation' },
          PRINCIPAL,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('saves end_date and end_reason', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...BASE_ASSIGNMENT }),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const svc = makeService({ repo });
      await svc.endAssignment(17, 55, dto, PRINCIPAL);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          endDate: '2026-05-15',
          endReason: 'vacation',
        }),
      );
    });

    it('clears acting fields when teacher was acting as primary', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({
          ...BASE_ASSIGNMENT,
          actingAsPrimary: true,
          actingStartsAt: '2026-04-01',
          actingEndsAt: '2026-05-01',
        }),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const svc = makeService({ repo });
      await svc.endAssignment(17, 55, dto, PRINCIPAL);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          actingAsPrimary: false,
          actingStartsAt: null,
          actingEndsAt: null,
        }),
      );
    });

    it('logs teacher_unassigned', async () => {
      const activityLog = makeActivityLog();
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...BASE_ASSIGNMENT }),
      });
      const svc = makeService({ repo, activityLog });
      await svc.endAssignment(17, 55, dto, PRINCIPAL);
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'teacher_unassigned',
          halaqaId: 17,
          targetUserId: BASE_ASSIGNMENT.teacherUserId,
        }),
      );
    });

    it('returns ApiMessage', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...BASE_ASSIGNMENT }),
      });
      const svc = makeService({ repo });
      const result = await svc.endAssignment(17, 55, dto, PRINCIPAL);
      expect(result).toEqual({ message: 'Assignment ended.' });
    });
  });
});
