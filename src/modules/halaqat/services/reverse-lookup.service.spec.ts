import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReverseLookupService } from './reverse-lookup.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN = { id: 1, schoolId: 10, roles: [{ slug: 'principal' }] } as never;
const TEACHER = { id: 12, schoolId: 10, roles: [{ slug: 'teacher' }] } as never;
const SUPERVISOR = {
  id: 5,
  schoolId: 10,
  roles: [{ slug: 'supervisor' }],
} as never;

const TEACHER_ROW = {
  halaqa_id: 17,
  halaqa_name: 'حلقة الفجر',
  halaqa_status: 'active',
  halaqa_type: 'Memorization',
  role: 'main',
  start_date: '2026-01-01',
};

const SUPERVISOR_ROW = {
  halaqa_id: 17,
  halaqa_name: 'حلقة الفجر',
  halaqa_status: 'active',
  halaqa_type: 'Memorization',
  assigned_at: new Date('2026-01-01T08:00:00Z'),
};

const STUDENT_ROW = {
  halaqa_id: 17,
  halaqa_name: 'حلقة الفجر',
  halaqa_status: 'active',
  halaqa_type: 'Memorization',
  enrollment_date: '2026-01-01',
  enrollment_status: 'active',
};

// ─── Factory helpers ───────────────────────────────────────────────────────────

function makeDataSource(rows: unknown[] = []) {
  return {
    manager: { query: jest.fn().mockResolvedValue(rows) },
  } as never;
}

function makeService(ds = makeDataSource()) {
  return new ReverseLookupService(ds);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('ReverseLookupService', () => {
  // ── teacherHalaqat ────────────────────────────────────────────────────────────
  describe('teacherHalaqat()', () => {
    it('throws 403 when non-admin queries another user', async () => {
      const svc = makeService(makeDataSource([TEACHER_ROW]));
      await expect(svc.teacherHalaqat(99, TEACHER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows teacher to query themselves', async () => {
      const svc = makeService(makeDataSource([TEACHER_ROW]));
      const result = await svc.teacherHalaqat(TEACHER.id, TEACHER);
      expect(result).toHaveLength(1);
    });

    it('allows admin to query any user', async () => {
      const svc = makeService(makeDataSource([TEACHER_ROW]));
      const result = await svc.teacherHalaqat(12, ADMIN);
      expect(result).toHaveLength(1);
    });

    it('throws 404 when user not in school and has no assignments (non-admin self-query)', async () => {
      const ds = makeDataSource([]);
      // first query (assignments) returns empty; second (user check) also empty
      (ds.manager.query as jest.Mock)
        .mockResolvedValueOnce([]) // assignments
        .mockResolvedValueOnce([]); // user check
      const svc = makeService(ds);
      await expect(svc.teacherHalaqat(TEACHER.id, TEACHER)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns empty array when admin queries user with no assignments', async () => {
      const svc = makeService(makeDataSource([]));
      const result = await svc.teacherHalaqat(99, ADMIN);
      expect(result).toEqual([]);
    });

    it('maps rows to TeacherHalaqaItem shape', async () => {
      const svc = makeService(makeDataSource([TEACHER_ROW]));
      const result = await svc.teacherHalaqat(TEACHER.id, TEACHER);
      expect(result[0]).toEqual({
        halaqa_id: 17,
        halaqa_name: 'حلقة الفجر',
        halaqa_status: 'active',
        halaqa_type: 'Memorization',
        role: 'main',
        start_date: '2026-01-01',
      });
    });

    it('scopes query to actor schoolId', async () => {
      const ds = makeDataSource([TEACHER_ROW]);
      const svc = makeService(ds);
      await svc.teacherHalaqat(12, ADMIN);
      const [sql, params] = (ds.manager.query as jest.Mock).mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toContain('school_id');
      expect(params).toContain(ADMIN.schoolId);
    });
  });

  // ── supervisorHalaqat ─────────────────────────────────────────────────────────
  describe('supervisorHalaqat()', () => {
    it('throws 403 when non-admin queries another user', async () => {
      const svc = makeService(makeDataSource([SUPERVISOR_ROW]));
      await expect(svc.supervisorHalaqat(99, SUPERVISOR)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows supervisor to query themselves', async () => {
      const svc = makeService(makeDataSource([SUPERVISOR_ROW]));
      const result = await svc.supervisorHalaqat(SUPERVISOR.id, SUPERVISOR);
      expect(result).toHaveLength(1);
    });

    it('allows admin to query any user', async () => {
      const svc = makeService(makeDataSource([SUPERVISOR_ROW]));
      const result = await svc.supervisorHalaqat(5, ADMIN);
      expect(result).toHaveLength(1);
    });

    it('throws 404 when user not in school and has no assignments (non-admin self-query)', async () => {
      const ds = makeDataSource([]);
      (ds.manager.query as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      const svc = makeService(ds);
      await expect(
        svc.supervisorHalaqat(SUPERVISOR.id, SUPERVISOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps rows to SupervisorHalaqaItem shape', async () => {
      const svc = makeService(makeDataSource([SUPERVISOR_ROW]));
      const result = await svc.supervisorHalaqat(SUPERVISOR.id, SUPERVISOR);
      expect(result[0]).toMatchObject({
        halaqa_id: 17,
        halaqa_name: 'حلقة الفجر',
        halaqa_status: 'active',
        halaqa_type: 'Memorization',
      });
      expect(result[0].assigned_at).toBeInstanceOf(Date);
    });
  });

  // ── studentHalaqat ────────────────────────────────────────────────────────────
  describe('studentHalaqat()', () => {
    it('throws 404 when student not in school', async () => {
      const ds = makeDataSource([]);
      (ds.manager.query as jest.Mock)
        .mockResolvedValueOnce([]) // enrollments
        .mockResolvedValueOnce([]); // student check
      const svc = makeService(ds);
      await expect(svc.studentHalaqat(99, ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns all enrollment records for admin', async () => {
      const rows = [
        STUDENT_ROW,
        { ...STUDENT_ROW, halaqa_id: 18, enrollment_status: 'transferred' },
      ];
      const svc = makeService(makeDataSource(rows));
      const result = await svc.studentHalaqat(42, ADMIN);
      expect(result).toHaveLength(2);
    });

    it('maps rows to StudentHalaqaItem shape', async () => {
      const svc = makeService(makeDataSource([STUDENT_ROW]));
      const result = await svc.studentHalaqat(42, ADMIN);
      expect(result[0]).toEqual({
        halaqa_id: 17,
        halaqa_name: 'حلقة الفجر',
        halaqa_status: 'active',
        halaqa_type: 'Memorization',
        enrollment_date: '2026-01-01',
        enrollment_status: 'active',
      });
    });

    it('scopes query to actor schoolId for both student and halaqa', async () => {
      const ds = makeDataSource([STUDENT_ROW]);
      const svc = makeService(ds);
      await svc.studentHalaqat(42, ADMIN);
      const [sql, params] = (ds.manager.query as jest.Mock).mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).toContain('school_id');
      expect(params.filter((p) => p === ADMIN.schoolId)).toHaveLength(2);
    });

    it('returns empty array when student has no enrollments in school', async () => {
      const ds = makeDataSource([]);
      (ds.manager.query as jest.Mock)
        .mockResolvedValueOnce([]) // enrollments
        .mockResolvedValueOnce([{ 1: 1 }]); // student exists
      const svc = makeService(ds);
      const result = await svc.studentHalaqat(42, ADMIN);
      expect(result).toEqual([]);
    });
  });
});
