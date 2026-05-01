import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Role } from '../roles/role.entity';
import { UserRole } from '../roles/user-role.entity';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

jest.mock('bcrypt');
const mockedHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>;

const ACTOR: AuthenticatedUser = {
  id: 1,
  schoolId: 1,
  status: 'active',
  tokenVersion: 0,
  roles: [{ slug: 'principal', level: 100 }],
};

interface MockBuilder {
  update: jest.Mock;
  set: jest.Mock;
  where: jest.Mock;
  execute: jest.Mock;
}

function makeBuilder(): MockBuilder {
  const b: MockBuilder = {
    update: jest.fn(),
    set: jest.fn(),
    where: jest.fn(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  b.update.mockImplementation(() => b);
  b.set.mockImplementation(() => b);
  b.where.mockImplementation(() => b);
  return b;
}

interface UserRepoMock {
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  softDelete: jest.Mock;
  createQueryBuilder: jest.Mock;
  builder: MockBuilder;
}

function makeUserRepo(): UserRepoMock {
  const builder = makeBuilder();
  return {
    findOne: jest.fn(),
    save: jest
      .fn()
      .mockImplementation((row: object) => Promise.resolve({ ...row, id: 99 })),
    create: jest.fn().mockImplementation((d: unknown) => d),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    builder,
  };
}

interface Mocks {
  config: ConfigService;
  users: UserRepoMock;
  txUsers: UserRepoMock;
  rolesRepo: { findOne: jest.Mock; find: jest.Mock };
  userRoles: { findOne: jest.Mock; insert: jest.Mock; delete: jest.Mock };
  txUserRoles: { insert: jest.Mock };
  refreshTokens: { update: jest.Mock };
  txRefreshTokens: { update: jest.Mock };
  dataSource: { transaction: jest.Mock };
  manager: EntityManager;
}

function makeMocks(): Mocks {
  const txUsers = makeUserRepo();
  const txUserRoles = { insert: jest.fn().mockResolvedValue({}) };
  const txRefreshTokens = {
    update: jest.fn().mockResolvedValue({ affected: 0 }),
  };

  const manager = {
    getRepository: jest.fn().mockImplementation((cls: unknown) => {
      if (cls === User) return txUsers;
      if (cls === UserRole) return txUserRoles;
      if (cls === RefreshToken) return txRefreshTokens;
      return null;
    }),
  } as unknown as EntityManager;

  return {
    config: {
      getOrThrow: jest.fn().mockReturnValue(12),
    } as unknown as ConfigService,
    users: makeUserRepo(),
    txUsers,
    rolesRepo: { findOne: jest.fn(), find: jest.fn() },
    userRoles: {
      findOne: jest.fn(),
      insert: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    },
    txUserRoles,
    refreshTokens: { update: jest.fn().mockResolvedValue({ affected: 0 }) },
    txRefreshTokens,
    dataSource: {
      transaction: jest
        .fn()
        .mockImplementation(
          async (cb: (m: EntityManager) => Promise<unknown>) => cb(manager),
        ),
    },
    manager,
  };
}

function makeService(m: Mocks): UsersService {
  return new UsersService(
    m.config,
    m.users as unknown as Repository<User>,
    m.rolesRepo as unknown as Repository<Role>,
    m.userRoles as unknown as Repository<UserRole>,
    m.refreshTokens as unknown as Repository<RefreshToken>,
    m.dataSource as unknown as DataSource,
  );
}

const ACTIVE_USER_VIEW = {
  id: 99,
  schoolId: 1,
  name: 'X',
  email: 'x@s.com',
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
  userRoles: [{ role: { slug: 'teacher', level: 50 } }],
} as unknown as User;

describe('UsersService', () => {
  let m: Mocks;
  let service: UsersService;

  beforeEach(() => {
    m = makeMocks();
    service = makeService(m);
    mockedHash.mockReset();
  });

  describe('create', () => {
    it('hashes the password, inserts the user, attaches roles in the same transaction', async () => {
      m.users.findOne.mockResolvedValue(null);
      m.rolesRepo.find.mockResolvedValue([
        { id: 4, slug: 'teacher', level: 50 } as Role,
      ]);
      mockedHash.mockResolvedValue('$2b$12$hash' as never);
      m.users.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(ACTIVE_USER_VIEW);

      await service.create(
        {
          name: 'X',
          email: 'x@s.com',
          password: 'pw12345678',
          roles: ['teacher'],
        },
        ACTOR,
      );

      expect(mockedHash).toHaveBeenCalledWith('pw12345678', 12);
      const saved = m.txUsers.save.mock.calls[0][0] as Partial<User>;
      expect(saved.schoolId).toBe(1);
      expect(saved.password).toBe('$2b$12$hash');
      const inserted = m.txUserRoles.insert.mock.calls[0][0] as Array<{
        userId: number;
        roleId: number;
        assignedBy: number;
      }>;
      expect(inserted).toEqual([{ userId: 99, roleId: 4, assignedBy: 1 }]);
    });

    it('throws Conflict when the email is already in use in the same school', async () => {
      m.users.findOne.mockResolvedValue({ id: 50 });

      await expect(
        service.create(
          { name: 'X', email: 'x@s.com', password: 'pw12345678' },
          ACTOR,
        ),
      ).rejects.toThrow(ConflictException);

      expect(mockedHash).not.toHaveBeenCalled();
      expect(m.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequest when an unknown role slug is supplied', async () => {
      m.users.findOne.mockResolvedValue(null);
      m.rolesRepo.find.mockResolvedValue([]);

      await expect(
        service.create(
          {
            name: 'X',
            email: 'x@s.com',
            password: 'pw12345678',
            roles: ['no-such-role'],
          },
          ACTOR,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockedHash).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('throws NotFound for a cross-school id (school filter excludes the row)', async () => {
      m.users.findOne.mockResolvedValue(null);

      await expect(service.findOne(10, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('does not bump tokenVersion or revoke sessions on a non-status update', async () => {
      m.users.findOne
        .mockResolvedValueOnce({ ...ACTIVE_USER_VIEW, status: 'active' })
        .mockResolvedValueOnce(ACTIVE_USER_VIEW);

      await service.update(99, { name: 'New Name' }, ACTOR);

      expect(m.txUsers.builder.execute).not.toHaveBeenCalled();
      expect(m.txRefreshTokens.update).not.toHaveBeenCalled();
    });

    it('bumps tokenVersion and revokes refresh tokens when status flips to inactive', async () => {
      m.users.findOne
        .mockResolvedValueOnce({ ...ACTIVE_USER_VIEW, status: 'active' })
        .mockResolvedValueOnce({ ...ACTIVE_USER_VIEW, status: 'inactive' });

      await service.update(99, { status: 'inactive' }, ACTOR);

      expect(m.txUsers.builder.execute).toHaveBeenCalled();
      const refreshUpdate = m.txRefreshTokens.update.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(refreshUpdate[0].userId).toBe(99);
      expect(refreshUpdate[1].revokedReason).toBe('admin_action');
    });
  });

  describe('softDelete', () => {
    it('refuses to delete the caller (BadRequest)', async () => {
      await expect(service.softDelete(ACTOR.id, ACTOR)).rejects.toThrow(
        BadRequestException,
      );
      expect(m.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('soft-deletes, bumps tokenVersion, and revokes refresh tokens', async () => {
      m.users.findOne.mockResolvedValue(ACTIVE_USER_VIEW);

      await service.softDelete(99, ACTOR);

      expect(m.txUsers.softDelete).toHaveBeenCalledWith(99);
      expect(m.txUsers.builder.execute).toHaveBeenCalled();
      expect(m.txRefreshTokens.update).toHaveBeenCalled();
    });

    it('throws NotFound when the target is in another school', async () => {
      m.users.findOne.mockResolvedValue(null);

      await expect(service.softDelete(10, ACTOR)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assignRole', () => {
    it('inserts the user_role row with the actor as assigned_by when not already present', async () => {
      m.users.findOne
        .mockResolvedValueOnce(ACTIVE_USER_VIEW)
        .mockResolvedValueOnce(ACTIVE_USER_VIEW);
      m.rolesRepo.findOne.mockResolvedValue({ id: 4, slug: 'teacher' });
      m.userRoles.findOne.mockResolvedValue(null);

      await service.assignRole(99, 4, ACTOR);

      expect(m.userRoles.insert).toHaveBeenCalledWith({
        userId: 99,
        roleId: 4,
        assignedBy: 1,
      });
    });

    it('is a no-op when the user already holds the role (idempotent)', async () => {
      m.users.findOne
        .mockResolvedValueOnce(ACTIVE_USER_VIEW)
        .mockResolvedValueOnce(ACTIVE_USER_VIEW);
      m.rolesRepo.findOne.mockResolvedValue({ id: 4, slug: 'teacher' });
      m.userRoles.findOne.mockResolvedValue({ userId: 99, roleId: 4 });

      await service.assignRole(99, 4, ACTOR);

      expect(m.userRoles.insert).not.toHaveBeenCalled();
    });

    it('throws BadRequest when the role id is unknown', async () => {
      m.users.findOne.mockResolvedValue(ACTIVE_USER_VIEW);
      m.rolesRepo.findOne.mockResolvedValue(null);

      await expect(service.assignRole(99, 9999, ACTOR)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFound when the user is in another school', async () => {
      m.users.findOne.mockResolvedValue(null);

      await expect(service.assignRole(10, 4, ACTOR)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('removeRole', () => {
    it('throws NotFound when the user_role mapping does not exist', async () => {
      m.users.findOne.mockResolvedValue(ACTIVE_USER_VIEW);
      m.userRoles.delete.mockResolvedValue({ affected: 0 });

      await expect(service.removeRole(99, 4, ACTOR)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('adminResetPassword', () => {
    it('hashes the new password, bumps tokenVersion, and revokes refresh tokens', async () => {
      m.users.findOne.mockResolvedValue(ACTIVE_USER_VIEW);
      mockedHash.mockResolvedValue('$2b$12$hash' as never);

      await service.adminResetPassword(
        99,
        { password: 'NewPass1234', password_confirmation: 'NewPass1234' },
        ACTOR,
      );

      expect(mockedHash).toHaveBeenCalledWith('NewPass1234', 12);
      expect(m.txUsers.builder.execute).toHaveBeenCalled();
      const refreshUpdate = m.txRefreshTokens.update.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(refreshUpdate[1].revokedReason).toBe('admin_action');
    });

    it('throws NotFound when the target user is in another school', async () => {
      m.users.findOne.mockResolvedValue(null);

      await expect(
        service.adminResetPassword(
          10,
          { password: 'NewPass1234', password_confirmation: 'NewPass1234' },
          ACTOR,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('setPasswordAndBumpVersion', () => {
    it('updates the password and increments token_version where id = userId', async () => {
      await service.setPasswordAndBumpVersion(7, '$2b$12$hash');

      expect(m.users.builder.update).toHaveBeenCalledWith(User);
      const setCall = m.users.builder.set.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(setCall.password).toBe('$2b$12$hash');
      expect(typeof setCall.tokenVersion).toBe('function');
      expect((setCall.tokenVersion as () => string)()).toBe(
        'token_version + 1',
      );
      expect(m.users.builder.where).toHaveBeenCalledWith('id = :id', { id: 7 });
      expect(m.users.builder.execute).toHaveBeenCalled();
    });

    it("uses the supplied manager's repository when running inside a transaction", async () => {
      await service.setPasswordAndBumpVersion(7, '$2b$12$hash', m.manager);

      expect(m.txUsers.builder.execute).toHaveBeenCalled();
      expect(m.users.builder.execute).not.toHaveBeenCalled();
    });
  });
});
