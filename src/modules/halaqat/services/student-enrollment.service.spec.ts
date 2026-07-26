import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { StudentHalaqa } from '../entities/student-halaqa.entity';
import { HalaqaActivityLogService } from './halaqa-activity-log.service';
import { HalaqatService } from './halaqat.service';
import { StudentEnrollmentService } from './student-enrollment.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TODAY = '2026-05-09';

const PRINCIPAL = {
  id: 1,
  schoolId: 10,
  roles: [{ slug: 'principal' }],
} as never;

const ACTIVE_HALAQA = { id: 17, schoolId: 10, status: 'active' };
const ARCHIVED_HALAQA = { id: 17, schoolId: 10, status: 'archived' };

const BASE_ENROLLMENT: StudentHalaqa = {
  studentId: 42,
  halaqaId: 17,
  enrollmentDate: '2026-01-01',
  status: 'active',
  student: {} as never,
  halaqa: {} as never,
};

const BASE_ROW = {
  student_id: 42,
  student_name: 'محمد علي',
  enrollment_date: '2026-01-01',
  status: 'active',
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
    save: overrides.save ?? jest.fn().mockImplementation(async (e) => e),
    create: overrides.create ?? jest.fn().mockImplementation((d) => ({ ...d })),
  } as never;
}

function makeDataSource(queryRows: unknown[] = [BASE_ROW]) {
  return {
    manager: {
      query: jest.fn().mockImplementation(async (sql: string) => {
        // student verification query returns a truthy row by default
        if (sql.includes('FROM students')) return [{ 1: 1 }];
        return queryRows;
      }),
    },
  } as never;
}

function makeHalaqatService(halaqa: unknown = ACTIVE_HALAQA) {
  return {
    loadAndCheckAccess: jest.fn().mockResolvedValue(halaqa),
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
    enrollments?: ReturnType<typeof makeRepo>;
    today?: string;
  } = {},
) {
  const svc = new StudentEnrollmentService(
    overrides.repo ?? makeRepo(),
    overrides.ds ?? makeDataSource(),
    overrides.halaqatService ?? makeHalaqatService(),
    overrides.activityLog ?? makeActivityLog(),
    overrides.enrollments ?? makeRepo(),
  );
  jest.spyOn(svc as never, 'today').mockReturnValue(overrides.today ?? TODAY);
  return svc;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('StudentEnrollmentService', () => {
  // ── enroll ───────────────────────────────────────────────────────────────────
  describe('enroll()', () => {
    it('throws 409 when halaqa is not active', async () => {
      const svc = makeService({
        halaqatService: makeHalaqatService(ARCHIVED_HALAQA),
      });
      await expect(
        svc.enroll(17, { student_id: 42 }, PRINCIPAL),
      ).rejects.toThrow(ConflictException);
    });

    it('opens a historical enrollment interval (dual-write)', async () => {
      const enrollments = makeRepo();
      const svc = makeService({ enrollments });
      await svc.enroll(17, { student_id: 42 }, PRINCIPAL);
      expect(
        (enrollments as unknown as { save: jest.Mock }).save,
      ).toHaveBeenCalled();
    });

    it('throws 404 when student not found in school', async () => {
      const ds = makeDataSource([]);
      // override query to return empty for student check
      (ds.manager.query as jest.Mock).mockImplementation(
        async (sql: string) => {
          if (sql.includes('FROM students')) return [];
          return [BASE_ROW];
        },
      );
      const svc = makeService({ ds });
      await expect(
        svc.enroll(17, { student_id: 99 }, PRINCIPAL),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 409 when student is already actively enrolled', async () => {
      const repo = makeRepo({
        findOne: jest
          .fn()
          .mockResolvedValue({ ...BASE_ENROLLMENT, status: 'active' }),
      });
      const svc = makeService({ repo });
      await expect(
        svc.enroll(17, { student_id: 42 }, PRINCIPAL),
      ).rejects.toThrow(ConflictException);
    });

    it('creates new enrollment with provided date', async () => {
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const svc = makeService({ repo });
      await svc.enroll(
        17,
        { student_id: 42, enrollment_date: '2026-06-01' },
        PRINCIPAL,
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 42,
          halaqaId: 17,
          enrollmentDate: '2026-06-01',
          status: 'active',
        }),
      );
    });

    it('defaults enrollment_date to today', async () => {
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const svc = makeService({ repo });
      await svc.enroll(17, { student_id: 42 }, PRINCIPAL);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ enrollmentDate: TODAY }),
      );
    });

    it('logs student_enrolled for new enrollment', async () => {
      const activityLog = makeActivityLog();
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const svc = makeService({ repo, activityLog });
      await svc.enroll(17, { student_id: 42 }, PRINCIPAL);
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'student_enrolled',
          halaqaId: 17,
          targetStudentId: 42,
        }),
      );
    });

    it('logs student_re_enrolled when prior enrollment exists', async () => {
      const activityLog = makeActivityLog();
      const repo = makeRepo({
        findOne: jest
          .fn()
          .mockResolvedValue({ ...BASE_ENROLLMENT, status: 'completed' }),
      });
      const svc = makeService({ repo, activityLog });
      await svc.enroll(17, { student_id: 42 }, PRINCIPAL);
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'student_re_enrolled',
        }),
      );
    });

    it('returns mapped StudentEnrollmentResponse', async () => {
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const svc = makeService({ repo });
      const result = await svc.enroll(17, { student_id: 42 }, PRINCIPAL);
      expect(result).toMatchObject({
        student_id: 42,
        student_name: 'محمد علي',
        status: 'active',
      });
    });
  });

  // ── listStudents ─────────────────────────────────────────────────────────────
  describe('listStudents()', () => {
    it('delegates access check to HalaqatService', async () => {
      const halaqatService = makeHalaqatService();
      const svc = makeService({ halaqatService });
      await svc.listStudents(17, PRINCIPAL);
      expect(halaqatService.loadAndCheckAccess).toHaveBeenCalledWith(
        17,
        PRINCIPAL,
      );
    });

    it('returns mapped list of active students', async () => {
      const rows = [
        BASE_ROW,
        {
          student_id: 43,
          student_name: 'أحمد',
          enrollment_date: '2026-02-01',
          status: 'active',
        },
      ];
      const ds = makeDataSource(rows);
      (ds.manager.query as jest.Mock).mockResolvedValue(rows);
      const svc = makeService({ ds });
      const result = await svc.listStudents(17, PRINCIPAL);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        student_id: 42,
        student_name: 'محمد علي',
      });
    });

    it('returns empty array when no active students', async () => {
      const ds = makeDataSource([]);
      (ds.manager.query as jest.Mock).mockResolvedValue([]);
      const svc = makeService({ ds });
      expect(await svc.listStudents(17, PRINCIPAL)).toEqual([]);
    });
  });

  // ── removeStudent ─────────────────────────────────────────────────────────────
  describe('removeStudent()', () => {
    it('throws 409 when halaqa is not active', async () => {
      const svc = makeService({
        halaqatService: makeHalaqatService(ARCHIVED_HALAQA),
      });
      await expect(
        svc.removeStudent(17, 42, { outcome: 'completed' }, PRINCIPAL),
      ).rejects.toThrow(ConflictException);
    });

    it('throws 404 when student is not actively enrolled', async () => {
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const svc = makeService({ repo });
      await expect(
        svc.removeStudent(17, 42, { outcome: 'completed' }, PRINCIPAL),
      ).rejects.toThrow(NotFoundException);
    });

    it('sets status=completed when outcome is completed', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...BASE_ENROLLMENT }),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const svc = makeService({ repo });
      await svc.removeStudent(17, 42, { outcome: 'completed' }, PRINCIPAL);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' }),
      );
    });

    it('sets status=archived when outcome is unenrolled', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...BASE_ENROLLMENT }),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const svc = makeService({ repo });
      await svc.removeStudent(17, 42, { outcome: 'unenrolled' }, PRINCIPAL);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'archived' }),
      );
    });

    it('logs student_completed for completed outcome', async () => {
      const activityLog = makeActivityLog();
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...BASE_ENROLLMENT }),
      });
      const svc = makeService({ repo, activityLog });
      await svc.removeStudent(17, 42, { outcome: 'completed' }, PRINCIPAL);
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'student_completed',
          targetStudentId: 42,
        }),
      );
    });

    it('logs student_unenrolled for unenrolled outcome', async () => {
      const activityLog = makeActivityLog();
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...BASE_ENROLLMENT }),
      });
      const svc = makeService({ repo, activityLog });
      await svc.removeStudent(
        17,
        42,
        { outcome: 'unenrolled', notes: 'dropped out' },
        PRINCIPAL,
      );
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'student_unenrolled',
          notes: 'dropped out',
        }),
      );
    });

    it('returns ApiMessage', async () => {
      const repo = makeRepo({
        findOne: jest.fn().mockResolvedValue({ ...BASE_ENROLLMENT }),
      });
      const svc = makeService({ repo });
      const result = await svc.removeStudent(
        17,
        42,
        { outcome: 'completed' },
        PRINCIPAL,
      );
      expect(result).toEqual({ message: 'Student marked as completed.' });
    });
  });

  // ── transferStudent ───────────────────────────────────────────────────────────
  describe('transferStudent()', () => {
    const dto = {
      student_id: 42,
      from_halaqa_id: 17,
      to_halaqa_id: 19,
      reason: 'Advanced to next level',
    };

    it('throws 400 when from and to are the same halaqa', async () => {
      const svc = makeService();
      await expect(
        svc.transferStudent({ ...dto, to_halaqa_id: 17 }, PRINCIPAL),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 409 when source halaqa is not active', async () => {
      const halaqatService = makeHalaqatService();
      (halaqatService.loadAndCheckAccess as jest.Mock).mockResolvedValueOnce(
        ARCHIVED_HALAQA,
      );
      const svc = makeService({ halaqatService });
      await expect(svc.transferStudent(dto, PRINCIPAL)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws 409 when destination halaqa is not active', async () => {
      const halaqatService = makeHalaqatService();
      (halaqatService.loadAndCheckAccess as jest.Mock)
        .mockResolvedValueOnce(ACTIVE_HALAQA)
        .mockResolvedValueOnce(ARCHIVED_HALAQA);
      const svc = makeService({ halaqatService });
      await expect(svc.transferStudent(dto, PRINCIPAL)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws 404 when student not actively enrolled in source', async () => {
      const repo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
      const halaqatService = makeHalaqatService();
      (halaqatService.loadAndCheckAccess as jest.Mock)
        .mockResolvedValueOnce(ACTIVE_HALAQA)
        .mockResolvedValueOnce(ACTIVE_HALAQA);
      const svc = makeService({ repo, halaqatService });
      await expect(svc.transferStudent(dto, PRINCIPAL)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 409 when student already enrolled in destination', async () => {
      const repo = makeRepo({
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ ...BASE_ENROLLMENT, halaqaId: 17 }) // source
          .mockResolvedValueOnce({ ...BASE_ENROLLMENT, halaqaId: 19 }), // destination
      });
      const halaqatService = makeHalaqatService();
      (halaqatService.loadAndCheckAccess as jest.Mock)
        .mockResolvedValueOnce(ACTIVE_HALAQA)
        .mockResolvedValueOnce(ACTIVE_HALAQA);
      const svc = makeService({ repo, halaqatService });
      await expect(svc.transferStudent(dto, PRINCIPAL)).rejects.toThrow(
        ConflictException,
      );
    });

    it('marks source enrollment as transferred and creates destination enrollment', async () => {
      const sourceEnrollment = { ...BASE_ENROLLMENT, halaqaId: 17 };
      const repo = makeRepo({
        findOne: jest
          .fn()
          .mockResolvedValueOnce(sourceEnrollment) // source active
          .mockResolvedValueOnce(null), // destination not enrolled
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const halaqatService = makeHalaqatService();
      (halaqatService.loadAndCheckAccess as jest.Mock)
        .mockResolvedValueOnce(ACTIVE_HALAQA)
        .mockResolvedValueOnce({ ...ACTIVE_HALAQA, id: 19 });
      const svc = makeService({ repo, halaqatService });
      await svc.transferStudent(dto, PRINCIPAL);

      const saveCalls = (repo.save as jest.Mock).mock.calls;
      expect(saveCalls[0][0]).toMatchObject({ status: 'transferred' });
      expect(saveCalls[1][0]).toMatchObject({
        halaqaId: 19,
        studentId: 42,
        status: 'active',
      });
    });

    it('uses transfer_date from dto when provided', async () => {
      const repo = makeRepo({
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ ...BASE_ENROLLMENT })
          .mockResolvedValueOnce(null),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const halaqatService = makeHalaqatService();
      (halaqatService.loadAndCheckAccess as jest.Mock).mockResolvedValue(
        ACTIVE_HALAQA,
      );
      const svc = makeService({ repo, halaqatService });
      await svc.transferStudent(
        { ...dto, transfer_date: '2026-06-01' },
        PRINCIPAL,
      );
      const saveCalls = (repo.save as jest.Mock).mock.calls;
      expect(saveCalls[1][0]).toMatchObject({ enrollmentDate: '2026-06-01' });
    });

    it('defaults transfer_date to today', async () => {
      const repo = makeRepo({
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ ...BASE_ENROLLMENT })
          .mockResolvedValueOnce(null),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const halaqatService = makeHalaqatService();
      (halaqatService.loadAndCheckAccess as jest.Mock).mockResolvedValue(
        ACTIVE_HALAQA,
      );
      const svc = makeService({ repo, halaqatService });
      await svc.transferStudent(dto, PRINCIPAL);
      const saveCalls = (repo.save as jest.Mock).mock.calls;
      expect(saveCalls[1][0]).toMatchObject({ enrollmentDate: TODAY });
    });

    it('logs student_transferred_out and student_transferred_in', async () => {
      const activityLog = makeActivityLog();
      const repo = makeRepo({
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ ...BASE_ENROLLMENT })
          .mockResolvedValueOnce(null),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const halaqatService = makeHalaqatService();
      (halaqatService.loadAndCheckAccess as jest.Mock).mockResolvedValue(
        ACTIVE_HALAQA,
      );
      const svc = makeService({ repo, halaqatService, activityLog });
      await svc.transferStudent(dto, PRINCIPAL);

      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'student_transferred_out',
          halaqaId: 17,
          targetStudentId: 42,
        }),
      );
      expect(activityLog.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'student_transferred_in',
          halaqaId: 19,
          targetStudentId: 42,
        }),
      );
    });

    it('returns ApiMessage', async () => {
      const repo = makeRepo({
        findOne: jest
          .fn()
          .mockResolvedValueOnce({ ...BASE_ENROLLMENT })
          .mockResolvedValueOnce(null),
        save: jest.fn().mockImplementation(async (e) => e),
      });
      const halaqatService = makeHalaqatService();
      (halaqatService.loadAndCheckAccess as jest.Mock).mockResolvedValue(
        ACTIVE_HALAQA,
      );
      const svc = makeService({ repo, halaqatService });
      const result = await svc.transferStudent(dto, PRINCIPAL);
      expect(result).toEqual({ message: 'Student transferred successfully.' });
    });
  });
});
