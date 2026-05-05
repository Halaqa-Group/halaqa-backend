import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditService } from '../../audit/audit.service';
import { StudentGuardian } from '../entities/student-guardian.entity';
import { Student } from '../entities/student.entity';
import { GuardiansService } from './guardians.service';
import { StudentsService } from './students.service';

const PRINCIPAL: AuthenticatedUser = {
  id: 1,
  schoolId: 1,
  status: 'active',
  tokenVersion: 0,
  roles: [{ slug: 'principal', level: 100 }],
};

const TEACHER: AuthenticatedUser = {
  id: 5,
  schoolId: 1,
  status: 'active',
  tokenVersion: 0,
  roles: [{ slug: 'teacher', level: 50 }],
};

const PARENT: AuthenticatedUser = {
  id: 9,
  schoolId: 1,
  status: 'active',
  tokenVersion: 0,
  roles: [{ slug: 'parent', level: 10 }],
};

const BASE_STUDENT: Student = {
  id: 10,
  schoolId: 1,
  name: 'محمد',
  gender: 'male',
  dob: null,
  joinDate: new Date('2023-09-01'),
  status: 'active',
  dailyHifzPagesCapacity: 1,
  dailyNearPagesCapacity: 5,
  dailyFarPagesCapacity: 10,
  notes: null,
  photoUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  school: {} as never,
};

function makeStudentRepo() {
  return {
    findOne: jest.fn(),
    save: jest.fn().mockImplementation((s: Student) =>
      Promise.resolve({ ...s, id: 10 }),
    ),
    create: jest.fn().mockImplementation((d: unknown) => d),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    restore: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(),
  };
}

function makeGuardianRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
  };
}

function makeAudit(): jest.Mocked<AuditService> {
  return { log: jest.fn().mockResolvedValue(undefined) } as never;
}

function makeGuardiansService(): jest.Mocked<GuardiansService> {
  return {
    linkMany: jest.fn().mockResolvedValue(undefined),
    listForStudentId: jest.fn().mockResolvedValue([]),
  } as never;
}

function makeDataSource(managerQuery: jest.Mock = jest.fn().mockResolvedValue([])) {
  const manager = { query: managerQuery, findOne: jest.fn() } as unknown as EntityManager;
  return {
    transaction: jest.fn().mockImplementation(async (cb: (m: EntityManager) => Promise<unknown>) => {
      const txManager = {
        getRepository: jest.fn().mockImplementation((cls: unknown) => {
          if (cls === Student) return makeStudentRepo();
          return { save: jest.fn(), count: jest.fn(), findOne: jest.fn(), find: jest.fn() };
        }),
      } as unknown as EntityManager;
      return cb(txManager);
    }),
    manager,
  } as unknown as DataSource;
}

function makeService(
  studentRepo = makeStudentRepo(),
  guardianRepo = makeGuardianRepo(),
  ds = makeDataSource(),
  audit = makeAudit(),
  guardians = makeGuardiansService(),
) {
  return new StudentsService(
    studentRepo as unknown as Repository<Student>,
    guardianRepo as unknown as Repository<StudentGuardian>,
    ds,
    audit,
    guardians,
  );
}

describe('StudentsService', () => {
  describe('findInScopeOrFail', () => {
    it('throws 404 when student is in a different school', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue({ ...BASE_STUDENT, schoolId: 99 });
      const service = makeService(repo);
      await expect(service.findInScopeOrFail(10, PRINCIPAL)).rejects.toThrow(NotFoundException);
    });

    it('throws 404 when student not found', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue(null);
      const service = makeService(repo);
      await expect(service.findInScopeOrFail(10, PRINCIPAL)).rejects.toThrow(NotFoundException);
    });

    it('returns student for principal without scope query', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue(BASE_STUDENT);
      const service = makeService(repo);
      const result = await service.findInScopeOrFail(10, PRINCIPAL);
      expect(result.id).toBe(10);
    });

    it('throws 404 when teacher has no halaqa containing the student', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue(BASE_STUDENT);
      const managerQuery = jest.fn().mockResolvedValue([]);
      const ds = makeDataSource(managerQuery);
      const service = makeService(repo, makeGuardianRepo(), ds);
      await expect(service.findInScopeOrFail(10, TEACHER)).rejects.toThrow(NotFoundException);
    });

    it('returns student when parent is linked', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue(BASE_STUDENT);
      const managerQuery = jest.fn().mockResolvedValue([{ 1: 1 }]);
      const ds = makeDataSource(managerQuery);
      const service = makeService(repo, makeGuardianRepo(), ds);
      const result = await service.findInScopeOrFail(10, PARENT);
      expect(result.id).toBe(10);
    });
  });

  describe('create', () => {
    it('writes a student.create audit entry', async () => {
      const studentRepo = makeStudentRepo();
      const guardianRepo = makeGuardianRepo();
      const audit = makeAudit();

      const txStudentRepo = makeStudentRepo();
      txStudentRepo.save.mockResolvedValue({ ...BASE_STUDENT, id: 10 });

      const ds = {
        transaction: jest.fn().mockImplementation(async (cb: (m: EntityManager) => Promise<unknown>) => {
          const txM = {
            getRepository: jest.fn().mockImplementation((cls: unknown) => {
              if (cls === Student) return txStudentRepo;
              return { count: jest.fn().mockResolvedValue(0), save: jest.fn(), findOne: jest.fn(), find: jest.fn(), insert: jest.fn() };
            }),
          } as unknown as EntityManager;
          return cb(txM);
        }),
        manager: { query: jest.fn().mockResolvedValue([{ 1: 1 }]) } as unknown as EntityManager,
      } as unknown as DataSource;

      studentRepo.findOne.mockResolvedValue(BASE_STUDENT);
      guardianRepo.find.mockResolvedValue([]);
      const guardians = makeGuardiansService();
      const service = makeService(studentRepo, guardianRepo, ds, audit, guardians);

      await service.create(
        { name: 'محمد', gender: 'male', join_date: '2023-09-01' },
        PRINCIPAL,
      );

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'student.create', entityType: 'student' }),
      );
    });

    it('delegates to guardians.linkMany when guardians are provided', async () => {
      const studentRepo = makeStudentRepo();
      const guardianRepo = makeGuardianRepo();
      const audit = makeAudit();
      const guardians = makeGuardiansService();

      const txStudentRepo = makeStudentRepo();
      txStudentRepo.save.mockResolvedValue({ ...BASE_STUDENT, id: 10 });

      const ds = {
        transaction: jest.fn().mockImplementation(async (cb: (m: EntityManager) => Promise<unknown>) => {
          const txM = {
            getRepository: jest.fn().mockReturnValue(txStudentRepo),
          } as unknown as EntityManager;
          return cb(txM);
        }),
        manager: { query: jest.fn().mockResolvedValue([{ 1: 1 }]) } as unknown as EntityManager,
      } as unknown as DataSource;

      studentRepo.findOne.mockResolvedValue(BASE_STUDENT);
      guardianRepo.find.mockResolvedValue([]);

      const service = makeService(studentRepo, guardianRepo, ds, audit, guardians);
      await service.create(
        {
          name: 'محمد',
          gender: 'male',
          join_date: '2023-09-01',
          guardians: [{ relation: 'father', guardian_user_id: 42 }],
        },
        PRINCIPAL,
      );

      expect(guardians.linkMany).toHaveBeenCalledWith(
        expect.any(Number),
        expect.arrayContaining([expect.objectContaining({ relation: 'father' })]),
        PRINCIPAL,
        expect.any(Object),
      );
    });
  });

  describe('update', () => {
    it('throws 403 when teacher is in scope but not primary on any of student halaqat', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue(BASE_STUDENT);
      // First query: scope check returns rows (teacher is in scope)
      // Second query: primary check returns empty (not primary)
      const managerQuery = jest.fn()
        .mockResolvedValueOnce([{ 1: 1 }])  // scope check passes
        .mockResolvedValueOnce([]);           // primary check fails
      const ds = makeDataSource(managerQuery);
      const service = makeService(repo, makeGuardianRepo(), ds);

      await expect(
        service.update(10, { notes: 'x' }, TEACHER, true),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws 400 when teacher sends a bio field', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue(BASE_STUDENT);
      // teacher has primary on this student
      const ds = makeDataSource(jest.fn().mockResolvedValue([{ 1: 1 }]));
      const service = makeService(repo, makeGuardianRepo(), ds);

      await expect(
        service.update(10, { name: 'new name' } as never, TEACHER, true),
      ).rejects.toThrow(BadRequestException);
    });

    it('writes student.update audit with changed fields only', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue(BASE_STUDENT);
      repo.update.mockResolvedValue({ affected: 1 });
      const audit = makeAudit();
      const ds = makeDataSource(jest.fn().mockResolvedValue([{ 1: 1 }]));
      // refetch after update
      repo.findOne
        .mockResolvedValueOnce(BASE_STUDENT)   // findInScopeOrFail
        .mockResolvedValueOnce({ ...BASE_STUDENT, notes: 'updated' }); // findOne after

      const guardianRepo = makeGuardianRepo();
      guardianRepo.find.mockResolvedValue([]);
      const service = makeService(repo, guardianRepo, ds, audit);

      await service.update(10, { notes: 'updated' }, PRINCIPAL, false);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'student.update',
          newValues: expect.objectContaining({ notes: 'updated' }),
        }),
      );
    });
  });

  describe('softDelete', () => {
    it('writes student.delete audit', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue(BASE_STUDENT);
      const audit = makeAudit();
      const service = makeService(repo, makeGuardianRepo(), makeDataSource(), audit);
      await service.softDelete(10, PRINCIPAL);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'student.delete', entityId: 10 }),
      );
    });
  });

  describe('graduate', () => {
    it('throws 400 when student is already graduated', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue({ ...BASE_STUDENT, status: 'graduated' });
      const service = makeService(repo);
      await expect(service.graduate(10, {}, PRINCIPAL)).rejects.toThrow(BadRequestException);
    });

    it('writes student.graduate audit', async () => {
      const repo = makeStudentRepo();
      repo.findOne
        .mockResolvedValueOnce(BASE_STUDENT)
        .mockResolvedValueOnce({ ...BASE_STUDENT, status: 'graduated' });
      const guardianRepo = makeGuardianRepo();
      guardianRepo.find.mockResolvedValue([]);
      const audit = makeAudit();
      const service = makeService(repo, guardianRepo, makeDataSource(), audit);
      await service.graduate(10, { graduation_date: '2026-06-01' }, PRINCIPAL);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'student.graduate',
          newValues: expect.objectContaining({ status: 'graduated', graduationDate: '2026-06-01' }),
        }),
      );
    });
  });

  describe('capacity validation', () => {
    it('throws 400 when hifz capacity exceeds max', async () => {
      const service = makeService();
      await expect(
        service.create(
          { name: 'x', gender: 'male', join_date: '2023-01-01', daily_hifz_pages_capacity: 25 },
          PRINCIPAL,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
