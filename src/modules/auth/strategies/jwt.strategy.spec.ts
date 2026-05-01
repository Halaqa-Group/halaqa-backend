import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { JwtPayload, JwtStrategy } from './jwt.strategy';

interface MockRepo {
  findOne: jest.Mock;
}

function makeConfig(): ConfigService {
  return {
    getOrThrow: () => 'a-very-long-secret-for-tests-32chars-min',
  } as unknown as ConfigService;
}

function makeRepo(): MockRepo {
  return { findOne: jest.fn() };
}

function makeStrategy(repo: MockRepo): JwtStrategy {
  return new JwtStrategy(makeConfig(), repo as unknown as Repository<User>);
}

const PAYLOAD: JwtPayload = { sub: 1, school_id: 1, tv: 5 };

describe('JwtStrategy', () => {
  let repo: MockRepo;
  let strategy: JwtStrategy;

  beforeEach(() => {
    repo = makeRepo();
    strategy = makeStrategy(repo);
  });

  describe('validate', () => {
    it('returns the user with flattened roles when payload tv matches', async () => {
      repo.findOne.mockResolvedValue({
        id: 1,
        schoolId: 1,
        status: 'active',
        tokenVersion: 5,
        userRoles: [
          { role: { slug: 'principal', level: 100 } },
          { role: { slug: 'parent', level: 20 } },
        ],
      });

      const result = await strategy.validate(PAYLOAD);

      expect(result).toEqual({
        id: 1,
        schoolId: 1,
        status: 'active',
        tokenVersion: 5,
        roles: [
          { slug: 'principal', level: 100 },
          { slug: 'parent', level: 20 },
        ],
      });
    });

    it('throws UnauthorizedException when the user is not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(strategy.validate(PAYLOAD)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when payload.tv is stale (e.g. password changed)', async () => {
      repo.findOne.mockResolvedValue({
        id: 1,
        schoolId: 1,
        status: 'active',
        tokenVersion: 6,
        userRoles: [],
      });

      await expect(strategy.validate({ ...PAYLOAD, tv: 5 })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns an empty roles array when the user has no roles attached', async () => {
      repo.findOne.mockResolvedValue({
        id: 1,
        schoolId: 1,
        status: 'active',
        tokenVersion: 5,
        userRoles: undefined,
      });

      const result = await strategy.validate(PAYLOAD);

      expect(result.roles).toEqual([]);
    });
  });
});
