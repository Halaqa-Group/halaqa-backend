import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Role } from '../roles/role.entity';
import { UserRole } from '../roles/user-role.entity';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

interface MockBuilder {
  update: jest.Mock;
  set: jest.Mock;
  where: jest.Mock;
  execute: jest.Mock;
}

interface MockRepo {
  createQueryBuilder: jest.Mock;
}

function makeBuilder(): MockBuilder {
  const builder: MockBuilder = {
    update: jest.fn().mockImplementation(() => builder),
    set: jest.fn().mockImplementation(() => builder),
    where: jest.fn().mockImplementation(() => builder),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  return builder;
}

function makeRepo(builder: MockBuilder): MockRepo {
  return { createQueryBuilder: jest.fn().mockReturnValue(builder) };
}

const STUB_REPO = {} as unknown as Repository<unknown>;

function buildService(userRepo: Repository<User>): UsersService {
  return new UsersService(
    {} as unknown as ConfigService,
    userRepo,
    STUB_REPO as Repository<Role>,
    STUB_REPO as Repository<UserRole>,
    STUB_REPO as Repository<RefreshToken>,
    {} as unknown as DataSource,
  );
}

describe('UsersService', () => {
  describe('setPasswordAndBumpVersion', () => {
    it('updates the password and increments token_version where id = userId', async () => {
      const builder = makeBuilder();
      const repo = makeRepo(builder);
      const service = buildService(repo as unknown as Repository<User>);

      await service.setPasswordAndBumpVersion(7, '$2b$12$hash');

      expect(builder.update).toHaveBeenCalledWith(User);
      const setCall = builder.set.mock.calls[0][0] as Record<string, unknown>;
      expect(setCall.password).toBe('$2b$12$hash');
      expect(typeof setCall.tokenVersion).toBe('function');
      expect((setCall.tokenVersion as () => string)()).toBe(
        'token_version + 1',
      );
      expect(builder.where).toHaveBeenCalledWith('id = :id', { id: 7 });
      expect(builder.execute).toHaveBeenCalled();
    });

    it("uses the supplied manager's repository when running inside a transaction", async () => {
      const ownBuilder = makeBuilder();
      const ownRepo = makeRepo(ownBuilder);
      const txBuilder = makeBuilder();
      const txRepo = makeRepo(txBuilder);
      const manager = {
        getRepository: jest.fn().mockReturnValue(txRepo),
      } as unknown as EntityManager;
      const service = buildService(ownRepo as unknown as Repository<User>);

      await service.setPasswordAndBumpVersion(7, '$2b$12$hash', manager);

      expect(txBuilder.execute).toHaveBeenCalled();
      expect(ownBuilder.execute).not.toHaveBeenCalled();
    });
  });
});
