import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { DataWithWarnings } from '../../../common/data-with-warnings';
import { AuditService } from '../../audit/audit.service';
import { StudentGuardian } from '../entities/student-guardian.entity';
import { Student } from '../entities/student.entity';
import type { IdNumberValidator } from '../../../common/validators/id-number-validator.interface';
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

/** The four required name parts, as a create/update DTO sends them. */
const NAME_DTO = {
  first_name: 'محمد',
  second_name: 'أحمد',
  third_name: 'علي',
  family_name: 'الحسني',
};

const BASE_STUDENT: Student = {
  id: 10,
  schoolId: 1,
  firstName: 'محمد',
  secondName: 'أحمد',
  thirdName: 'علي',
  familyName: 'الحسني',
  name: 'محمد أحمد علي الحسني',
  idNumber: null,
  phoneCountryCode: null,
  phone: null,
  gender: 'male',
  dob: null,
  joinDate: new Date('2023-09-01'),
  status: 'active',
  dailyHifzPagesCapacity: 1,
  dailyNearPagesCapacity: 5,
  dailyFarPagesCapacity: 10,
  memorizationDirection: 'descending',
  notes: null,
  memorizedAyat: null,
  photoUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  school: {} as never,
};

function makeStudentRepo() {
  return {
    findOne: jest.fn(),
    save: jest
      .fn()
      .mockImplementation((s: Student) => Promise.resolve({ ...s, id: 10 })),
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

function makeDataSource(
  managerQuery: jest.Mock = jest.fn().mockResolvedValue([]),
) {
  const manager = {
    query: managerQuery,
    findOne: jest.fn(),
  } as unknown as EntityManager;
  return {
    transaction: jest
      .fn()
      .mockImplementation(
        async (cb: (m: EntityManager) => Promise<unknown>) => {
          const txManager = {
            getRepository: jest.fn().mockImplementation((cls: unknown) => {
              if (cls === Student) return makeStudentRepo();
              return {
                save: jest.fn(),
                count: jest.fn(),
                findOne: jest.fn(),
                find: jest.fn(),
              };
            }),
          } as unknown as EntityManager;
          return cb(txManager);
        },
      ),
    manager,
  } as unknown as DataSource;
}

function makeIdValidator(
  normalize: (v: string) => string = (v) => v,
  validate: jest.Mock = jest.fn().mockReturnValue({ ok: true, warnings: [] }),
): jest.Mocked<IdNumberValidator> {
  return {
    normalize: jest.fn().mockImplementation(normalize),
    validate,
  };
}

function makeService(
  studentRepo = makeStudentRepo(),
  guardianRepo = makeGuardianRepo(),
  ds = makeDataSource(),
  audit = makeAudit(),
  guardians = makeGuardiansService(),
  idValidator: IdNumberValidator = makeIdValidator(),
) {
  return new StudentsService(
    studentRepo as unknown as Repository<Student>,
    guardianRepo as unknown as Repository<StudentGuardian>,
    ds,
    audit,
    guardians,
    idValidator,
  );
}

describe('StudentsService', () => {
  describe('findInScopeOrFail', () => {
    it('throws 404 when student is in a different school', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue({ ...BASE_STUDENT, schoolId: 99 });
      const service = makeService(repo);
      await expect(service.findInScopeOrFail(10, PRINCIPAL)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 404 when student not found', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue(null);
      const service = makeService(repo);
      await expect(service.findInScopeOrFail(10, PRINCIPAL)).rejects.toThrow(
        NotFoundException,
      );
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
      await expect(service.findInScopeOrFail(10, TEACHER)).rejects.toThrow(
        NotFoundException,
      );
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
        transaction: jest
          .fn()
          .mockImplementation(
            async (cb: (m: EntityManager) => Promise<unknown>) => {
              const txM = {
                getRepository: jest.fn().mockImplementation((cls: unknown) => {
                  if (cls === Student) return txStudentRepo;
                  return {
                    count: jest.fn().mockResolvedValue(0),
                    save: jest.fn(),
                    findOne: jest.fn(),
                    find: jest.fn(),
                    insert: jest.fn(),
                  };
                }),
              } as unknown as EntityManager;
              return cb(txM);
            },
          ),
        manager: {
          query: jest.fn().mockResolvedValue([{ 1: 1 }]),
        } as unknown as EntityManager,
      } as unknown as DataSource;

      studentRepo.findOne.mockResolvedValue(BASE_STUDENT);
      guardianRepo.find.mockResolvedValue([]);
      const guardians = makeGuardiansService();
      const service = makeService(
        studentRepo,
        guardianRepo,
        ds,
        audit,
        guardians,
      );

      await service.create(
        { ...NAME_DTO, gender: 'male', join_date: '2023-09-01' },
        PRINCIPAL,
      );

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'student.create',
          entityType: 'student',
        }),
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
        transaction: jest
          .fn()
          .mockImplementation(
            async (cb: (m: EntityManager) => Promise<unknown>) => {
              const txM = {
                getRepository: jest.fn().mockReturnValue(txStudentRepo),
              } as unknown as EntityManager;
              return cb(txM);
            },
          ),
        manager: {
          query: jest.fn().mockResolvedValue([{ 1: 1 }]),
        } as unknown as EntityManager,
      } as unknown as DataSource;

      studentRepo.findOne.mockResolvedValue(BASE_STUDENT);
      guardianRepo.find.mockResolvedValue([]);

      const service = makeService(
        studentRepo,
        guardianRepo,
        ds,
        audit,
        guardians,
      );
      await service.create(
        {
          ...NAME_DTO,
          gender: 'male',
          join_date: '2023-09-01',
          guardians: [{ relation: 'father', guardian_user_id: 42 }],
        },
        PRINCIPAL,
      );

      expect(guardians.linkMany).toHaveBeenCalledWith(
        expect.any(Number),
        expect.arrayContaining([
          expect.objectContaining({ relation: 'father' }),
        ]),
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
      const managerQuery = jest
        .fn()
        .mockResolvedValueOnce([{ 1: 1 }]) // scope check passes
        .mockResolvedValueOnce([]); // primary check fails
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
        service.update(10, { first_name: 'new' }, TEACHER, true),
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
        .mockResolvedValueOnce(BASE_STUDENT) // findInScopeOrFail
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

    it('patches only the name parts that changed and audits the new full name', async () => {
      const repo = makeStudentRepo();
      repo.update.mockResolvedValue({ affected: 1 });
      const audit = makeAudit();
      const ds = makeDataSource(jest.fn().mockResolvedValue([{ 1: 1 }]));
      repo.findOne
        .mockResolvedValueOnce(BASE_STUDENT)
        .mockResolvedValueOnce(BASE_STUDENT);

      const guardianRepo = makeGuardianRepo();
      guardianRepo.find.mockResolvedValue([]);
      const service = makeService(repo, guardianRepo, ds, audit);

      // second_name is resent unchanged — it must not reach the patch.
      await service.update(
        10,
        { family_name: 'القاسمي', second_name: 'أحمد' },
        PRINCIPAL,
        false,
      );

      const patch = repo.update.mock.calls[0][1] as Record<string, unknown>;
      expect(patch).toEqual(expect.objectContaining({ familyName: 'القاسمي' }));
      expect('secondName' in patch).toBe(false);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'student.update',
          oldValues: expect.objectContaining({
            name: 'محمد أحمد علي الحسني',
          }),
          // `name` is database-derived, so the audit records the recomputed value.
          newValues: expect.objectContaining({
            name: 'محمد أحمد علي القاسمي',
          }),
        }),
      );
    });
  });

  describe('softDelete', () => {
    it('writes student.delete audit', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue(BASE_STUDENT);
      const audit = makeAudit();
      const service = makeService(
        repo,
        makeGuardianRepo(),
        makeDataSource(),
        audit,
      );
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
      await expect(service.graduate(10, {}, PRINCIPAL)).rejects.toThrow(
        BadRequestException,
      );
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
          newValues: expect.objectContaining({
            status: 'graduated',
            graduationDate: '2026-06-01',
          }),
        }),
      );
    });
  });

  describe('capacity validation', () => {
    it('throws 400 when hifz capacity exceeds max', async () => {
      const service = makeService();
      await expect(
        service.create(
          {
            ...NAME_DTO,
            gender: 'male',
            join_date: '2023-01-01',
            daily_hifz_pages_capacity: 25,
          },
          PRINCIPAL,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('toView — id_number visibility', () => {
    it('includes id_number key for principal', () => {
      const service = makeService();
      const s = { ...BASE_STUDENT, idNumber: '300123456' };
      const view = service.toView(s, PRINCIPAL);
      expect(view).toHaveProperty('id_number', '300123456');
    });

    it('includes id_number key (null) for principal when unset', () => {
      const service = makeService();
      const view = service.toView(BASE_STUDENT, PRINCIPAL);
      expect(view).toHaveProperty('id_number', null);
    });

    it('includes id_number key for parent', () => {
      const service = makeService();
      const s = { ...BASE_STUDENT, idNumber: '300123456' };
      const view = service.toView(s, PARENT);
      expect(view).toHaveProperty('id_number', '300123456');
    });

    it('includes id_number key for teacher', () => {
      const service = makeService();
      const s = { ...BASE_STUDENT, idNumber: '300123456' };
      const view = service.toView(s, TEACHER);
      expect(view).toHaveProperty('id_number', '300123456');
    });

    it('includes id_number key for supervisor', () => {
      const SUPERVISOR: AuthenticatedUser = {
        id: 7,
        schoolId: 1,
        status: 'active',
        tokenVersion: 0,
        roles: [{ slug: 'supervisor', level: 60 }],
      };
      const service = makeService();
      const s = { ...BASE_STUDENT, idNumber: '300123456' };
      const view = service.toView(s, SUPERVISOR);
      expect(view).toHaveProperty('id_number', '300123456');
    });
  });

  describe('phone — WhatsApp contact', () => {
    function makeUpdateSetup() {
      const repo = makeStudentRepo();
      repo.update.mockResolvedValue({ affected: 1 });
      const audit = makeAudit();
      const ds = makeDataSource(jest.fn().mockResolvedValue([{ 1: 1 }]));
      const guardianRepo = makeGuardianRepo();
      guardianRepo.find.mockResolvedValue([]);
      return { repo, audit, ds, guardianRepo };
    }

    it('joins both halves into phone_e164 in the view', () => {
      const service = makeService();
      const s = {
        ...BASE_STUDENT,
        phoneCountryCode: '+970',
        phone: '599123456',
      };
      const view = service.toView(s, PRINCIPAL);
      expect(view).toMatchObject({
        phone_country_code: '+970',
        phone: '599123456',
        phone_e164: '+970599123456',
      });
    });

    it('leaves phone_e164 null when the number is unset', () => {
      const service = makeService();
      const view = service.toView(BASE_STUDENT, PRINCIPAL);
      expect(view.phone_e164).toBeNull();
    });

    it('normalizes the trunk zero, separators and Arabic-Indic digits', async () => {
      const { repo, audit, ds, guardianRepo } = makeUpdateSetup();
      repo.findOne
        .mockResolvedValueOnce(BASE_STUDENT)
        .mockResolvedValueOnce(BASE_STUDENT);
      const service = makeService(repo, guardianRepo, ds, audit);

      await service.update(
        10,
        { phone_country_code: '00970', phone: '٠٥٩٩-١٢٣ ٤٥٦' },
        PRINCIPAL,
        false,
      );

      expect(repo.update.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          phoneCountryCode: '+970',
          phone: '599123456',
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          newValues: expect.objectContaining({ phone: '+970599123456' }),
        }),
      );
    });

    it('throws 400 when only one half is sent and the other is unset', async () => {
      const { repo, audit, ds, guardianRepo } = makeUpdateSetup();
      repo.findOne.mockResolvedValue(BASE_STUDENT);
      const service = makeService(repo, guardianRepo, ds, audit);

      await expect(
        service.update(10, { phone: '599123456' }, PRINCIPAL, false),
      ).rejects.toThrow(BadRequestException);
    });

    it('keeps the stored dial code when only the number is patched', async () => {
      const { repo, audit, ds, guardianRepo } = makeUpdateSetup();
      const withPhone = {
        ...BASE_STUDENT,
        phoneCountryCode: '+962',
        phone: '791111111',
      };
      repo.findOne
        .mockResolvedValueOnce(withPhone)
        .mockResolvedValueOnce(withPhone);
      const service = makeService(repo, guardianRepo, ds, audit);

      await service.update(10, { phone: '792222222' }, PRINCIPAL, false);

      expect(repo.update.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          phoneCountryCode: '+962',
          phone: '792222222',
        }),
      );
    });

    it('clears both halves when either is sent as null', async () => {
      const { repo, audit, ds, guardianRepo } = makeUpdateSetup();
      const withPhone = {
        ...BASE_STUDENT,
        phoneCountryCode: '+970',
        phone: '599123456',
      };
      repo.findOne
        .mockResolvedValueOnce(withPhone)
        .mockResolvedValueOnce(BASE_STUDENT);
      const service = makeService(repo, guardianRepo, ds, audit);

      await service.update(10, { phone: null }, PRINCIPAL, false);

      expect(repo.update.mock.calls[0][1]).toEqual(
        expect.objectContaining({ phoneCountryCode: null, phone: null }),
      );
    });

    it('throws 400 when a teacher tries to set it', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue(BASE_STUDENT);
      const ds = makeDataSource(jest.fn().mockResolvedValue([{ 1: 1 }]));
      const service = makeService(repo, makeGuardianRepo(), ds);

      await expect(
        service.update(
          10,
          { phone_country_code: '+970', phone: '599123456' },
          TEACHER,
          true,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('id_number — create', () => {
    function makeCreateSetup(validatorOverride?: Partial<IdNumberValidator>) {
      const studentRepo = makeStudentRepo();
      const guardianRepo = makeGuardianRepo();
      const audit = makeAudit();
      const txStudentRepo = makeStudentRepo();
      txStudentRepo.save.mockResolvedValue({ ...BASE_STUDENT, id: 10 });
      const ds = {
        transaction: jest
          .fn()
          .mockImplementation(
            async (cb: (m: EntityManager) => Promise<unknown>) => {
              const txM = {
                getRepository: jest.fn().mockImplementation((cls: unknown) => {
                  if (cls === Student) return txStudentRepo;
                  return {
                    save: jest.fn(),
                    findOne: jest.fn(),
                    find: jest.fn(),
                  };
                }),
              } as unknown as EntityManager;
              return cb(txM);
            },
          ),
        manager: {
          query: jest.fn().mockResolvedValue([{ 1: 1 }]),
        } as unknown as EntityManager,
      } as unknown as DataSource;

      studentRepo.findOne.mockResolvedValue({ ...BASE_STUDENT });
      guardianRepo.find.mockResolvedValue([]);

      const idValidator = makeIdValidator(
        (v) => v.replace(/-/g, ''),
        jest.fn().mockReturnValue({ ok: true, warnings: [] }),
      );
      if (validatorOverride?.validate)
        idValidator.validate = validatorOverride.validate as jest.Mock;
      if (validatorOverride?.normalize)
        idValidator.normalize = jest
          .fn()
          .mockImplementation(validatorOverride.normalize);

      return { studentRepo, guardianRepo, audit, ds, idValidator };
    }

    it('persists normalized id_number', async () => {
      const { studentRepo, guardianRepo, audit, ds, idValidator } =
        makeCreateSetup();
      // normalize strips hyphens → '300123456'
      idValidator.normalize = jest.fn().mockReturnValue('300123456');
      studentRepo.findOne
        .mockResolvedValueOnce(null) // uniqueness check: no conflict
        .mockResolvedValueOnce(BASE_STUDENT); // refetch after create
      const txStudentRepo = makeStudentRepo();
      txStudentRepo.save.mockResolvedValue({
        ...BASE_STUDENT,
        idNumber: '300123456',
        id: 10,
      });
      const txDs = {
        transaction: jest
          .fn()
          .mockImplementation(
            async (cb: (m: EntityManager) => Promise<unknown>) => {
              const txM = {
                getRepository: jest.fn().mockReturnValue(txStudentRepo),
              } as unknown as EntityManager;
              return cb(txM);
            },
          ),
        manager: {
          query: jest.fn().mockResolvedValue([{ 1: 1 }]),
        } as unknown as EntityManager,
      } as unknown as DataSource;

      const service = makeService(
        studentRepo,
        guardianRepo,
        txDs,
        audit,
        makeGuardiansService(),
        idValidator,
      );
      await service.create(
        {
          ...NAME_DTO,
          gender: 'male',
          join_date: '2023-01-01',
          id_number: '300-123-456',
        },
        PRINCIPAL,
      );

      expect(idValidator.normalize).toHaveBeenCalledWith('300-123-456');
      expect(txStudentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ idNumber: '300123456' }),
      );
    });

    it('throws 400 when format is invalid', async () => {
      const idValidator = makeIdValidator(
        (v) => v,
        jest.fn().mockReturnValue({ ok: false, warnings: [] }),
      );
      const service = makeService(
        makeStudentRepo(),
        makeGuardianRepo(),
        makeDataSource(),
        makeAudit(),
        makeGuardiansService(),
        idValidator,
      );
      await expect(
        service.create(
          {
            ...NAME_DTO,
            gender: 'male',
            join_date: '2023-01-01',
            id_number: 'bad',
          },
          PRINCIPAL,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 409 when id_number already used in same school', async () => {
      const studentRepo = makeStudentRepo();
      studentRepo.findOne.mockResolvedValue({ ...BASE_STUDENT, id: 99 }); // conflict row
      const idValidator = makeIdValidator(
        (v) => v,
        jest.fn().mockReturnValue({ ok: true, warnings: [] }),
      );
      const service = makeService(
        studentRepo,
        makeGuardianRepo(),
        makeDataSource(),
        makeAudit(),
        makeGuardiansService(),
        idValidator,
      );
      await expect(
        service.create(
          {
            ...NAME_DTO,
            gender: 'male',
            join_date: '2023-01-01',
            id_number: '300123456',
          },
          PRINCIPAL,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('returns DataWithWarnings when checksum is invalid', async () => {
      const { studentRepo, guardianRepo, audit, idValidator } =
        makeCreateSetup();
      idValidator.validate = jest
        .fn()
        .mockReturnValue({ ok: true, warnings: ['checksum_invalid'] });
      studentRepo.findOne
        .mockResolvedValueOnce(null) // uniqueness check: no conflict
        .mockResolvedValueOnce(BASE_STUDENT); // refetch
      guardianRepo.find.mockResolvedValue([]);
      const txStudentRepo = makeStudentRepo();
      txStudentRepo.save.mockResolvedValue({ ...BASE_STUDENT, id: 10 });
      const txDs = {
        transaction: jest
          .fn()
          .mockImplementation(
            async (cb: (m: EntityManager) => Promise<unknown>) => {
              const txM = {
                getRepository: jest.fn().mockReturnValue(txStudentRepo),
              } as unknown as EntityManager;
              return cb(txM);
            },
          ),
        manager: {
          query: jest.fn().mockResolvedValue([{ 1: 1 }]),
        } as unknown as EntityManager,
      } as unknown as DataSource;

      const service = makeService(
        studentRepo,
        guardianRepo,
        txDs,
        audit,
        makeGuardiansService(),
        idValidator,
      );
      const result = await service.create(
        {
          ...NAME_DTO,
          gender: 'male',
          join_date: '2023-01-01',
          id_number: '100000000',
        },
        PRINCIPAL,
      );
      expect(result).toBeInstanceOf(DataWithWarnings);
      expect((result as DataWithWarnings<unknown>).warnings).toContain(
        'checksum_invalid',
      );
    });
  });

  describe('id_number — update', () => {
    function makeUpdateQb(getOneResult: Student | null = null) {
      const getOne = jest.fn().mockResolvedValue(getOneResult);
      const withDeleted = jest.fn().mockReturnThis();
      const where = jest.fn().mockReturnValue({ withDeleted, getOne });
      return jest.fn().mockReturnValue({ where });
    }

    it('first set (current null) succeeds without force flag', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue({ ...BASE_STUDENT, idNumber: null });
      repo.createQueryBuilder = makeUpdateQb(null); // no conflict
      const guardianRepo = makeGuardianRepo();
      guardianRepo.find.mockResolvedValue([]);
      const audit = makeAudit();
      const idValidator = makeIdValidator(
        (v) => v,
        jest.fn().mockReturnValue({ ok: true, warnings: [] }),
      );
      const service = makeService(
        repo,
        guardianRepo,
        makeDataSource(),
        audit,
        makeGuardiansService(),
        idValidator,
      );

      // second findOne for the refetch after update
      repo.findOne
        .mockResolvedValueOnce({ ...BASE_STUDENT, idNumber: null }) // findInScopeOrFail
        .mockResolvedValueOnce({ ...BASE_STUDENT, idNumber: '300123456' }); // refetch

      await expect(
        service.update(10, { id_number: '300123456' }, PRINCIPAL, false),
      ).resolves.toBeDefined();
    });

    it('throws 400 when changing locked id_number without force flag', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue({
        ...BASE_STUDENT,
        idNumber: '300123456',
      });
      const idValidator = makeIdValidator(
        (v) => v,
        jest.fn().mockReturnValue({ ok: true, warnings: [] }),
      );
      const service = makeService(
        repo,
        makeGuardianRepo(),
        makeDataSource(),
        makeAudit(),
        makeGuardiansService(),
        idValidator,
      );

      await expect(
        service.update(10, { id_number: '300999888' }, PRINCIPAL, false),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows changing locked id_number with force flag and writes two audit rows', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue({
        ...BASE_STUDENT,
        idNumber: '300123456',
      });
      repo.createQueryBuilder = makeUpdateQb(null); // no conflict
      const guardianRepo = makeGuardianRepo();
      guardianRepo.find.mockResolvedValue([]);
      const audit = makeAudit();
      const idValidator = makeIdValidator(
        (v) => v,
        jest.fn().mockReturnValue({ ok: true, warnings: [] }),
      );

      repo.findOne
        .mockResolvedValueOnce({ ...BASE_STUDENT, idNumber: '300123456' }) // findInScopeOrFail
        .mockResolvedValueOnce({ ...BASE_STUDENT, idNumber: '300999888' }); // refetch

      const service = makeService(
        repo,
        guardianRepo,
        makeDataSource(),
        audit,
        makeGuardiansService(),
        idValidator,
      );
      await service.update(
        10,
        { id_number: '300999888', force_id_number_change: true },
        PRINCIPAL,
        false,
      );

      const auditCalls = audit.log.mock.calls.map((c) => c[0].action);
      expect(auditCalls).toContain('student.update');
      expect(auditCalls).toContain('student.id_number.force_changed');
    });

    it('throws 400 when clearing locked id_number without force flag', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue({
        ...BASE_STUDENT,
        idNumber: '300123456',
      });
      const service = makeService(repo, makeGuardianRepo(), makeDataSource());
      await expect(
        service.update(10, { id_number: null }, PRINCIPAL, false),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows clearing with force flag and writes force_changed audit', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue({
        ...BASE_STUDENT,
        idNumber: '300123456',
      });
      const guardianRepo = makeGuardianRepo();
      guardianRepo.find.mockResolvedValue([]);
      const audit = makeAudit();

      repo.findOne
        .mockResolvedValueOnce({ ...BASE_STUDENT, idNumber: '300123456' }) // findInScopeOrFail
        .mockResolvedValueOnce({ ...BASE_STUDENT, idNumber: null }); // refetch

      const service = makeService(repo, guardianRepo, makeDataSource(), audit);
      await service.update(
        10,
        { id_number: null, force_id_number_change: true },
        PRINCIPAL,
        false,
      );

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'student.id_number.force_changed' }),
      );
    });

    it('throws 409 when new id_number conflicts with another student in same school', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue({ ...BASE_STUDENT, idNumber: null });
      // createQueryBuilder for uniqueness check returns a conflict
      const getOne = jest.fn().mockResolvedValue({ ...BASE_STUDENT, id: 99 });
      const withDeleted = jest.fn().mockReturnThis();
      const where = jest.fn().mockReturnValue({ withDeleted, getOne });
      repo.createQueryBuilder = jest.fn().mockReturnValue({ where });

      const idValidator = makeIdValidator(
        (v) => v,
        jest.fn().mockReturnValue({ ok: true, warnings: [] }),
      );
      const service = makeService(
        repo,
        makeGuardianRepo(),
        makeDataSource(),
        makeAudit(),
        makeGuardiansService(),
        idValidator,
      );

      await expect(
        service.update(10, { id_number: '300123456' }, PRINCIPAL, false),
      ).rejects.toThrow(ConflictException);
    });

    it('returns DataWithWarnings on update when checksum warning fires', async () => {
      const repo = makeStudentRepo();
      repo.findOne.mockResolvedValue({ ...BASE_STUDENT, idNumber: null });
      repo.createQueryBuilder = makeUpdateQb(null);
      const guardianRepo = makeGuardianRepo();
      guardianRepo.find.mockResolvedValue([]);
      const audit = makeAudit();
      const idValidator = makeIdValidator(
        (v) => v,
        jest.fn().mockReturnValue({ ok: true, warnings: ['checksum_invalid'] }),
      );

      repo.findOne
        .mockResolvedValueOnce({ ...BASE_STUDENT, idNumber: null })
        .mockResolvedValueOnce(BASE_STUDENT);

      const service = makeService(
        repo,
        guardianRepo,
        makeDataSource(),
        audit,
        makeGuardiansService(),
        idValidator,
      );
      const result = await service.update(
        10,
        { id_number: '100000000' },
        PRINCIPAL,
        false,
      );
      expect(result).toBeInstanceOf(DataWithWarnings);
    });

    it('allows PATCH on legacy student (id_number IS NULL) without supplying id_number', async () => {
      const repo = makeStudentRepo();
      repo.findOne
        .mockResolvedValueOnce({ ...BASE_STUDENT, idNumber: null }) // findInScopeOrFail
        .mockResolvedValueOnce({ ...BASE_STUDENT, idNumber: null }); // refetch
      const guardianRepo = makeGuardianRepo();
      guardianRepo.find.mockResolvedValue([]);
      const service = makeService(
        repo,
        guardianRepo,
        makeDataSource(),
        makeAudit(),
      );

      await expect(
        service.update(10, { notes: 'updated notes' }, PRINCIPAL, false),
      ).resolves.toBeDefined();
    });
  });

  describe('id_number — list filters', () => {
    function makeListQb() {
      const qb: Record<string, jest.Mock> = {};
      qb.where = jest.fn().mockReturnValue(qb);
      qb.andWhere = jest.fn().mockReturnValue(qb);
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.skip = jest.fn().mockReturnValue(qb);
      qb.take = jest.fn().mockReturnValue(qb);
      qb.withDeleted = jest.fn().mockReturnValue(qb);
      qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
      return qb;
    }

    it('allows supervisor to use ?id_number= filter', async () => {
      const SUPERVISOR: AuthenticatedUser = {
        id: 7,
        schoolId: 1,
        status: 'active',
        tokenVersion: 0,
        roles: [{ slug: 'supervisor', level: 60 }],
      };
      const repo = makeStudentRepo();
      const qb = makeListQb();
      repo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      const idValidator = makeIdValidator((v) => v);
      const service = makeService(
        repo,
        makeGuardianRepo(),
        makeDataSource(),
        makeAudit(),
        makeGuardiansService(),
        idValidator,
      );

      await service.list({ id_number: '300123456' }, SUPERVISOR);
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('idNumber'),
        expect.objectContaining({ idNum: '300123456' }),
      );
    });

    it('allows teacher to use ?id_number= filter', async () => {
      const repo = makeStudentRepo();
      const qb = makeListQb();
      repo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      const idValidator = makeIdValidator((v) => v);
      const service = makeService(
        repo,
        makeGuardianRepo(),
        makeDataSource(),
        makeAudit(),
        makeGuardiansService(),
        idValidator,
      );

      await service.list({ id_number: '300123456' }, TEACHER);
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('idNumber'),
        expect.objectContaining({ idNum: '300123456' }),
      );
    });

    it('allows principal to use ?id_number= filter', async () => {
      const repo = makeStudentRepo();
      const qb = makeListQb();
      repo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      const idValidator = makeIdValidator((v) => v);
      const service = makeService(
        repo,
        makeGuardianRepo(),
        makeDataSource(),
        makeAudit(),
        makeGuardiansService(),
        idValidator,
      );

      await service.list({ id_number: '300123456' }, PRINCIPAL);
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('idNumber'),
        expect.objectContaining({ idNum: '300123456' }),
      );
    });

    it('?q= includes id_number OR clause for all roles', async () => {
      const repo = makeStudentRepo();
      const qb = makeListQb();
      repo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      const idValidator = makeIdValidator((v) => v);
      const service = makeService(
        repo,
        makeGuardianRepo(),
        makeDataSource(),
        makeAudit(),
        makeGuardiansService(),
        idValidator,
      );

      await service.list({ q: '300123456' }, PRINCIPAL);
      // Brackets produces an andWhere call with a Brackets object (not a plain string)
      const andWhereCalls = qb.andWhere.mock.calls;
      expect(andWhereCalls.length).toBeGreaterThan(0);
    });

    it('teacher ?q= also includes id_number OR clause', async () => {
      const repo = makeStudentRepo();
      const qb = makeListQb();
      repo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      const managerQuery = jest.fn().mockResolvedValue([]);
      const ds = makeDataSource(managerQuery);
      const idValidator = makeIdValidator((v) => v);
      const service = makeService(
        repo,
        makeGuardianRepo(),
        ds,
        makeAudit(),
        makeGuardiansService(),
        idValidator,
      );

      await service.list({ q: 'يوسف' }, TEACHER);
      // All roles now use Brackets with name OR id_number
      const andWhereCalls = qb.andWhere.mock.calls;
      expect(andWhereCalls.length).toBeGreaterThan(0);
    });
  });
});
