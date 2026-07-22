import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
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
const mockedCompare = bcrypt.compare as jest.MockedFunction<
  typeof bcrypt.compare
>;

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
  idValidator: { normalize: jest.Mock; validate: jest.Mock };
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
    idValidator: {
      normalize: jest.fn((s: string) => s.replace(/[\s-]/g, '')),
      validate: jest.fn().mockReturnValue({ ok: true, warnings: [] }),
    },
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
    m.idValidator,
  );
}

/** The four required name parts, as a CreateUserDto sends them. */
const NAME_DTO = {
  first_name: 'X',
  second_name: 'Y',
  third_name: 'Z',
  family_name: 'W',
};

const ACTIVE_USER_VIEW = {
  id: 99,
  schoolId: 1,
  firstName: 'X',
  secondName: 'Y',
  thirdName: 'Z',
  familyName: 'W',
  name: 'X Y Z W',
  idNumber: '400000006',
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
    mockedCompare.mockReset();
  });

  describe('create', () => {
    it('hashes the password, inserts the user, attaches roles in the same transaction', async () => {
      m.users.findOne.mockResolvedValue(null);
      m.rolesRepo.find.mockResolvedValue([
        { id: 4, slug: 'teacher', level: 50 } as Role,
      ]);
      mockedHash.mockResolvedValue('$2b$12$hash' as never);
      m.users.findOne
        .mockResolvedValueOnce(null) // emailTaken
        .mockResolvedValueOnce(null) // idNumberTaken
        .mockResolvedValueOnce(ACTIVE_USER_VIEW); // final read-back

      await service.create(
        {
          ...NAME_DTO,
          id_number: '400-000-006',
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
      expect(saved.idNumber).toBe('400000006'); // normalized
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
          {
            ...NAME_DTO,
            id_number: '400000006',
            email: 'x@s.com',
            password: 'pw12345678',
          },
          ACTOR,
        ),
      ).rejects.toThrow(ConflictException);

      expect(mockedHash).not.toHaveBeenCalled();
      expect(m.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequest when the id_number format is invalid', async () => {
      m.users.findOne.mockResolvedValueOnce(null); // emailTaken
      m.idValidator.validate.mockReturnValueOnce({ ok: false, warnings: [] });

      await expect(
        service.create(
          {
            ...NAME_DTO,
            id_number: 'not-an-id',
            email: 'x@s.com',
            password: 'pw12345678',
          },
          ACTOR,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockedHash).not.toHaveBeenCalled();
      expect(m.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('throws Conflict when the id_number is already in use in the same school', async () => {
      m.users.findOne
        .mockResolvedValueOnce(null) // emailTaken
        .mockResolvedValueOnce({ id: 51 }); // idNumberTaken

      await expect(
        service.create(
          {
            ...NAME_DTO,
            id_number: '400000006',
            email: 'x@s.com',
            password: 'pw12345678',
          },
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
            ...NAME_DTO,
            id_number: '400000006',
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

      await service.update(
        99,
        { first_name: 'New', family_name: 'Name' },
        ACTOR,
      );

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

  describe('updateMe', () => {
    it('updates only the whitelisted fields and maps photo_url to photoUrl', async () => {
      m.users.findOne.mockResolvedValueOnce(ACTIVE_USER_VIEW);

      await service.updateMe(99, {
        first_name: 'New',
        family_name: 'Name',
        phone: '+970599000000',
        photo_url: 'https://cdn/x.jpg',
      });

      const patch = m.users.update.mock.calls[0][1] as Record<string, unknown>;
      expect(patch).toEqual({
        firstName: 'New',
        familyName: 'Name',
        phone: '+970599000000',
        photoUrl: 'https://cdn/x.jpg',
      });
    });

    it('omits keys for fields the caller did not send', async () => {
      m.users.findOne.mockResolvedValueOnce(ACTIVE_USER_VIEW);

      await service.updateMe(99, { first_name: 'Solo' });

      const patch = m.users.update.mock.calls[0][1] as Record<string, unknown>;
      expect(patch).toEqual({ firstName: 'Solo' });
      expect('secondName' in patch).toBe(false);
      expect('phone' in patch).toBe(false);
      expect('photoUrl' in patch).toBe(false);
    });

    it('throws NotFound when the user disappears between update and re-read', async () => {
      m.users.findOne.mockResolvedValueOnce(null);

      await expect(service.updateMe(99, { first_name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not bump tokenVersion or revoke any refresh tokens', async () => {
      m.users.findOne.mockResolvedValueOnce(ACTIVE_USER_VIEW);

      await service.updateMe(99, { first_name: 'Quiet' });

      expect(m.users.builder.execute).not.toHaveBeenCalled();
      expect(m.refreshTokens.update).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    const dto = {
      currentPassword: 'OldPass1234',
      password: 'NewPass1234',
      password_confirmation: 'NewPass1234',
    };

    it('verifies the current password, hashes the new one, and updates the user row', async () => {
      m.users.findOne.mockResolvedValueOnce({
        ...ACTIVE_USER_VIEW,
        password: '$2b$12$old',
      });
      mockedCompare.mockResolvedValueOnce(true as never);
      mockedHash.mockResolvedValueOnce('$2b$12$new' as never);

      await service.changePassword(99, dto, 'currenthash');

      expect(mockedCompare).toHaveBeenCalledWith('OldPass1234', '$2b$12$old');
      expect(mockedHash).toHaveBeenCalledWith('NewPass1234', 12);
      const patch = m.users.update.mock.calls[0][1] as Record<string, unknown>;
      expect(patch).toEqual({ password: '$2b$12$new' });
    });

    it('throws Unauthorized and never hashes when the current password is wrong', async () => {
      m.users.findOne.mockResolvedValueOnce({
        ...ACTIVE_USER_VIEW,
        password: '$2b$12$old',
      });
      mockedCompare.mockResolvedValueOnce(false as never);

      await expect(
        service.changePassword(99, dto, 'currenthash'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockedHash).not.toHaveBeenCalled();
      expect(m.users.update).not.toHaveBeenCalled();
      expect(m.refreshTokens.update).not.toHaveBeenCalled();
    });

    it('revokes every refresh token EXCEPT the one matching the current cookie hash', async () => {
      m.users.findOne.mockResolvedValueOnce(ACTIVE_USER_VIEW);
      mockedCompare.mockResolvedValueOnce(true as never);
      mockedHash.mockResolvedValueOnce('$2b$12$new' as never);

      await service.changePassword(99, dto, 'currenthash');

      const where = m.refreshTokens.update.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      const set = m.refreshTokens.update.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(where.userId).toBe(99);
      // tokenHash uses TypeORM's Not(...) operator wrapper; assert presence by key
      expect('tokenHash' in where).toBe(true);
      expect(set.revokedReason).toBe('password_change');
    });

    it('revokes ALL active refresh tokens when the caller has no refresh cookie', async () => {
      m.users.findOne.mockResolvedValueOnce(ACTIVE_USER_VIEW);
      mockedCompare.mockResolvedValueOnce(true as never);
      mockedHash.mockResolvedValueOnce('$2b$12$new' as never);

      await service.changePassword(99, dto, null);

      const where = m.refreshTokens.update.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(where.userId).toBe(99);
      expect('tokenHash' in where).toBe(false);
    });

    it('throws NotFound and short-circuits when the user does not exist', async () => {
      m.users.findOne.mockResolvedValueOnce(null);

      await expect(
        service.changePassword(99, dto, 'currenthash'),
      ).rejects.toThrow(NotFoundException);

      expect(mockedCompare).not.toHaveBeenCalled();
      expect(mockedHash).not.toHaveBeenCalled();
    });

    it('does not bump tokenVersion (current access token must keep working)', async () => {
      m.users.findOne.mockResolvedValueOnce(ACTIVE_USER_VIEW);
      mockedCompare.mockResolvedValueOnce(true as never);
      mockedHash.mockResolvedValueOnce('$2b$12$new' as never);

      await service.changePassword(99, dto, 'currenthash');

      expect(m.users.builder.execute).not.toHaveBeenCalled();
    });
  });

  describe('findByEmail', () => {
    it('returns user when found in the same school', async () => {
      m.users.findOne.mockResolvedValue(ACTIVE_USER_VIEW);
      const result = await service.findByEmail('x@s.com', 1);
      expect(result).toBe(ACTIVE_USER_VIEW);
      expect(m.users.findOne).toHaveBeenCalledWith({
        where: { email: 'x@s.com', schoolId: 1 },
        withDeleted: false,
      });
    });

    it('returns null when not found', async () => {
      m.users.findOne.mockResolvedValue(null);
      const result = await service.findByEmail('unknown@x.com', 1);
      expect(result).toBeNull();
    });
  });

  describe('ensureRoleBySlug', () => {
    it('inserts role assignment and returns true when role is new', async () => {
      m.users.findOne.mockResolvedValue(ACTIVE_USER_VIEW);
      m.rolesRepo.findOne.mockResolvedValue({
        id: 4,
        slug: 'parent',
        level: 10,
      });
      m.userRoles.findOne.mockResolvedValue(null);

      const assigned = await service.ensureRoleBySlug(99, 'parent', ACTOR);

      expect(assigned).toBe(true);
      expect(m.userRoles.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 99,
          roleId: 4,
          assignedBy: ACTOR.id,
        }),
      );
    });

    it('is idempotent — returns false and does not insert when role already exists', async () => {
      m.users.findOne.mockResolvedValue(ACTIVE_USER_VIEW);
      m.rolesRepo.findOne.mockResolvedValue({
        id: 4,
        slug: 'parent',
        level: 10,
      });
      m.userRoles.findOne.mockResolvedValue({ userId: 99, roleId: 4 });

      const assigned = await service.ensureRoleBySlug(99, 'parent', ACTOR);

      expect(assigned).toBe(false);
      expect(m.userRoles.insert).not.toHaveBeenCalled();
    });
  });
});
