import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Role, RoleSlug } from './role.entity';
import { RolesSeeder } from './roles.seeder';

interface MockRepo {
  findOne: jest.Mock;
  insert: jest.Mock;
}

const FIXED_SLUGS: RoleSlug[] = [
  'principal',
  'vice_principal',
  'supervisor',
  'teacher',
  'parent',
];

function makeRepo(): MockRepo {
  return {
    findOne: jest.fn(),
    insert: jest.fn().mockResolvedValue(undefined),
  };
}

describe('RolesSeeder', () => {
  let repo: MockRepo;
  let seeder: RolesSeeder;

  beforeEach(() => {
    repo = makeRepo();
    seeder = new RolesSeeder(repo as unknown as Repository<Role>);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('onApplicationBootstrap', () => {
    it('inserts all five fixed roles when the table is empty', async () => {
      repo.findOne.mockResolvedValue(null);

      await seeder.onApplicationBootstrap();

      expect(repo.insert).toHaveBeenCalledTimes(5);
      const insertedSlugs = repo.insert.mock.calls.map(
        ([seed]: [{ slug: RoleSlug }]) => seed.slug,
      );
      expect(insertedSlugs).toEqual(FIXED_SLUGS);
    });

    it('inserts each role with the correct level so the hierarchy is preserved', async () => {
      repo.findOne.mockResolvedValue(null);

      await seeder.onApplicationBootstrap();

      const byLevel = Object.fromEntries(
        repo.insert.mock.calls.map(
          ([seed]: [{ slug: RoleSlug; level: number }]) => [
            seed.slug,
            seed.level,
          ],
        ),
      );
      expect(byLevel).toEqual({
        principal: 100,
        vice_principal: 90,
        supervisor: 70,
        teacher: 50,
        parent: 20,
      });
    });

    it('is idempotent — does not insert when every role already exists', async () => {
      repo.findOne.mockImplementation((opts: { where: { slug: RoleSlug } }) =>
        Promise.resolve({ id: 1, slug: opts.where.slug } as Role),
      );

      await seeder.onApplicationBootstrap();

      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('inserts only the missing roles when some already exist', async () => {
      const present = new Set<RoleSlug>(['principal', 'teacher']);
      repo.findOne.mockImplementation((opts: { where: { slug: RoleSlug } }) =>
        Promise.resolve(
          present.has(opts.where.slug)
            ? ({ slug: opts.where.slug } as Role)
            : null,
        ),
      );

      await seeder.onApplicationBootstrap();

      const insertedSlugs = repo.insert.mock.calls.map(
        ([seed]: [{ slug: RoleSlug }]) => seed.slug,
      );
      expect(insertedSlugs).toEqual(['vice_principal', 'supervisor', 'parent']);
    });
  });
});
