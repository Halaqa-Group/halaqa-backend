import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditService } from '../../audit/audit.service';
import type { NotificationService } from '../../notifications/notification.service';
import { User } from '../../users/entities/user.entity';
import type { UsersService } from '../../users/users.service';
import { Student } from '../entities/student.entity';
import { StudentGuardian } from '../entities/student-guardian.entity';
import { GuardiansService } from './guardians.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$temp'),
}));

const ACTOR: AuthenticatedUser = {
  id: 1,
  schoolId: 1,
  status: 'active',
  tokenVersion: 0,
  roles: [{ slug: 'principal', level: 100 }],
};

const GUARDIAN_USER: User = {
  id: 42,
  schoolId: 1,
  name: 'أبو محمد',
  email: 'father@x.com',
  password: '',
  phone: null,
  photoUrl: null,
  status: 'active',
  tokenVersion: 0,
  emailVerifiedAt: null,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  school: {} as never,
  userRoles: [],
};

function makeSgRow(overrides?: Partial<StudentGuardian>): StudentGuardian {
  return {
    studentId: 10,
    guardianUserId: 42,
    relation: 'father',
    isPrimary: true,
    canPickup: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    student: {} as never,
    guardian: GUARDIAN_USER,
    ...overrides,
  };
}

function makeSgRepo(rows: StudentGuardian[] = []) {
  return {
    findOne: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(rows.find((r) => r.guardianUserId === where['guardianUserId']) ?? null),
    ),
    find: jest.fn().mockResolvedValue(rows),
  };
}

function makeAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuditService>;
}

function makeNotifications() {
  return { notifyRole: jest.fn().mockResolvedValue(undefined) } as jest.Mocked<NotificationService>;
}

function makeUsersService(findByEmailResult: User | null = null) {
  return {
    findByEmail: jest.fn().mockResolvedValue(findByEmailResult),
    ensureRoleBySlug: jest.fn().mockResolvedValue(false),
  } as unknown as jest.Mocked<UsersService>;
}

interface TxMocks {
  sgRepo: { findOne: jest.Mock; count: jest.Mock; save: jest.Mock; find: jest.Mock; update: jest.Mock; delete: jest.Mock; create: jest.Mock };
  userRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  studentRepo: { findOne: jest.Mock };
}

function makeTxMocks(existingGuardians: StudentGuardian[] = []): TxMocks {
  return {
    sgRepo: {
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(existingGuardians.length),
      save: jest.fn().mockImplementation((s: StudentGuardian) => Promise.resolve({ ...s, guardian: GUARDIAN_USER })),
      find: jest.fn().mockResolvedValue(existingGuardians),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn().mockImplementation((d: unknown) => d),
    },
    userRepo: {
      findOne: jest.fn().mockResolvedValue(GUARDIAN_USER),
      save: jest.fn().mockResolvedValue({ ...GUARDIAN_USER, id: 99 }),
      create: jest.fn().mockImplementation((d: Record<string, unknown>) => ({ ...d, id: 99 })),
    },
    studentRepo: {
      findOne: jest.fn().mockResolvedValue({ id: 10, name: 'محمد' } as Student),
    },
  };
}

function makeDataSource(tx: TxMocks): { ds: DataSource; txManager: EntityManager & { update: jest.Mock; delete: jest.Mock } } {
  const savedSg: StudentGuardian = {
    studentId: 10,
    guardianUserId: 42,
    relation: 'father',
    isPrimary: true,
    canPickup: true,
    createdAt: new Date(),
    student: {} as never,
    guardian: GUARDIAN_USER,
  };

  let sgFindOneCallCount = 0;

  const txManager = {
    findOne: jest.fn().mockImplementation(
      (cls: unknown, opts: { where?: Record<string, unknown> }) => {
        if (cls === User) return tx.userRepo.findOne(opts);
        if (cls === Student) return Promise.resolve({ id: 10, name: 'محمد' } as Student);
        if (cls === StudentGuardian) {
          sgFindOneCallCount++;
          return sgFindOneCallCount === 1
            ? Promise.resolve(null)
            : Promise.resolve(savedSg);
        }
        return Promise.resolve(null);
      },
    ),
    count: jest.fn().mockImplementation(() => tx.sgRepo.count()),
    save: jest.fn().mockImplementation((entity: unknown) => {
      if (entity instanceof Object && 'guardianUserId' in (entity as Record<string, unknown>)) {
        return Promise.resolve({ ...(entity as StudentGuardian), guardian: GUARDIAN_USER });
      }
      if (entity instanceof Object && 'email' in (entity as Record<string, unknown>)) {
        return tx.userRepo.save(entity as User);
      }
      return Promise.resolve(entity);
    }),
    create: jest.fn().mockImplementation((_cls: unknown, d: unknown) => d),
    find: jest.fn().mockImplementation(() => tx.sgRepo.find()),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  } as unknown as EntityManager & { update: jest.Mock; delete: jest.Mock };

  const ds = {
    transaction: jest.fn().mockImplementation(async (cb: (m: EntityManager) => Promise<unknown>) => cb(txManager)),
    manager: txManager,
  } as unknown as DataSource;

  return { ds, txManager };
}

function makeService(
  sgRows: StudentGuardian[] = [],
  txMocks?: TxMocks,
  usersService?: jest.Mocked<UsersService>,
  notifications?: jest.Mocked<NotificationService>,
) {
  const tx = txMocks ?? makeTxMocks(sgRows);
  const { ds, txManager } = makeDataSource(tx);
  const sgRepo = makeSgRepo(sgRows);
  const audit = makeAudit();
  const notif = notifications ?? makeNotifications();
  const users = usersService ?? makeUsersService();

  const service = new GuardiansService(
    sgRepo as unknown as Repository<StudentGuardian>,
    ds,
    users,
    audit,
    notif,
  );

  return { service, audit, notif, users, tx, sgRepo, ds, txManager };
}

describe('GuardiansService', () => {
  describe('is_primary invariant', () => {
    it('case 1: first guardian is forced to is_primary=true even if dto says false', async () => {
      const tx = makeTxMocks([]);
      tx.sgRepo.count.mockResolvedValue(0);
      const { service, txManager } = makeService([], tx);

      await service.link(10, { guardian_user_id: 42, relation: 'father', is_primary: false }, ACTOR);

      const saveCalls = (txManager.save as jest.Mock).mock.calls;
      const sgSaveCall = saveCalls.find(
        (args: unknown[]) =>
          typeof args[0] === 'object' &&
          args[0] !== null &&
          'guardianUserId' in (args[0] as Record<string, unknown>),
      );
      expect(sgSaveCall).toBeDefined();
      expect((sgSaveCall![0] as StudentGuardian).isPrimary).toBe(true);
    });

    it('case 2: subsequent link with is_primary=true unsets existing primary', async () => {
      const existing = makeSgRow({ guardianUserId: 99, isPrimary: true });
      const tx = makeTxMocks([existing]);
      tx.sgRepo.count.mockResolvedValue(1);
      const { service, txManager } = makeService([existing], tx);

      await service.link(10, { guardian_user_id: 42, relation: 'father', is_primary: true }, ACTOR);

      expect(txManager.update).toHaveBeenCalledWith(
        StudentGuardian,
        { studentId: 10, isPrimary: true },
        { isPrimary: false },
      );
    });

    it('case 3: subsequent link with is_primary=false leaves existing primary untouched', async () => {
      const existing = makeSgRow({ guardianUserId: 99, isPrimary: true });
      const tx = makeTxMocks([existing]);
      tx.sgRepo.count.mockResolvedValue(1);
      const { service, txManager } = makeService([existing], tx);

      await service.link(10, { guardian_user_id: 42, relation: 'mother', is_primary: false }, ACTOR);

      expect(txManager.update).not.toHaveBeenCalled();
    });

    it('case 5: PATCH setting is_primary=false throws 400', async () => {
      const primary = makeSgRow({ isPrimary: true });
      const { service } = makeService([primary]);

      await expect(
        service.update(10, 42, { is_primary: false }, ACTOR),
      ).rejects.toThrow(BadRequestException);
    });

    it('case 6: DELETE the only guardian writes student.orphaned audit and notifies VPs', async () => {
      const only = makeSgRow({ isPrimary: true });
      const tx = makeTxMocks([only]);
      tx.sgRepo.find.mockResolvedValue([]);
      const notifications = makeNotifications();
      const { service, audit, sgRepo } = makeService([only], tx, undefined, notifications);

      sgRepo.findOne.mockResolvedValue(only);

      await service.unlink(10, 42, ACTOR);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'student.orphaned', entityType: 'student', entityId: 10 }),
      );
      expect(notifications.notifyRole).toHaveBeenCalledWith(
        ACTOR.schoolId,
        'vice_principal',
        expect.objectContaining({ type: 'student.orphaned', studentId: 10 }),
      );
    });

    it('case 7: DELETE primary while others exist promotes earliest-created remaining guardian', async () => {
      const primary = makeSgRow({ guardianUserId: 42, isPrimary: true, createdAt: new Date('2024-01-01') });
      const secondary = makeSgRow({ guardianUserId: 55, isPrimary: false, createdAt: new Date('2024-01-02') });
      const tx = makeTxMocks([primary, secondary]);
      tx.sgRepo.find.mockResolvedValue([secondary]);
      const { service, audit, sgRepo, txManager } = makeService([primary, secondary], tx);

      sgRepo.findOne.mockResolvedValue(primary);

      await service.unlink(10, 42, ACTOR);

      expect(txManager.update).toHaveBeenCalledWith(
        StudentGuardian,
        { studentId: secondary.studentId, guardianUserId: secondary.guardianUserId },
        { isPrimary: true },
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'student.guardian.primary_promoted' }),
      );
    });
  });

  describe('link — by guardian_user_id', () => {
    it('throws 404 when user is cross-school', async () => {
      const tx = makeTxMocks([]);
      // findOne for User should return null (cross-school or not found)
      tx.userRepo.findOne.mockResolvedValue(Promise.resolve(null));
      const { service } = makeService([], tx);

      await expect(
        service.link(10, { guardian_user_id: 42, relation: 'father' }, ACTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 400 when both guardian_user_id and email are provided', async () => {
      const { service } = makeService();
      await expect(
        service.link(10, { guardian_user_id: 42, email: 'x@y.com', relation: 'father' }, ACTOR),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('link — by email (new parent)', () => {
    it('throws 404 when email is not found in school', async () => {
      const tx = makeTxMocks([]);
      const users = makeUsersService(null);
      const { service } = makeService([], tx, users);

      await expect(
        service.link(10, { email: 'unknown@parent.com', relation: 'father' }, ACTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('uses existing user when email is found', async () => {
      const tx = makeTxMocks([]);
      const users = makeUsersService(GUARDIAN_USER);
      const { service } = makeService([], tx, users);

      tx.sgRepo.count.mockResolvedValue(0);
      tx.sgRepo.findOne.mockResolvedValue(null);
      tx.sgRepo.save.mockImplementation((s: StudentGuardian) =>
        Promise.resolve({ ...s, guardian: GUARDIAN_USER }),
      );

      await service.link(10, { email: 'father@x.com', relation: 'father' }, ACTOR);

      expect(users.ensureRoleBySlug).toHaveBeenCalledWith(GUARDIAN_USER.id, 'parent', ACTOR, undefined);
    });
  });
});
