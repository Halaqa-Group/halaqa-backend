import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { RoleSlug } from '../../roles/role.entity';
import { DashboardScopeService } from './dashboard-scope.service';

function actor(
  roles: RoleSlug[],
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    id: 7,
    schoolId: 1,
    status: 'active',
    tokenVersion: 0,
    roles: roles.map((slug) => ({ slug, level: 0 })),
    ...overrides,
  };
}

describe('DashboardScopeService', () => {
  let query: jest.Mock;
  let service: DashboardScopeService;

  beforeEach(() => {
    query = jest.fn();
    service = new DashboardScopeService({ query } as unknown as DataSource);
  });

  describe('isAdmin', () => {
    it('is true for principal and vice_principal', () => {
      expect(service.isAdmin(actor(['principal']))).toBe(true);
      expect(service.isAdmin(actor(['vice_principal']))).toBe(true);
    });
    it('is false for supervisor/teacher/parent', () => {
      expect(service.isAdmin(actor(['supervisor']))).toBe(false);
      expect(service.isAdmin(actor(['teacher']))).toBe(false);
    });
  });

  describe('resolve', () => {
    it('returns { all: true } for an admin and never queries', async () => {
      const scope = await service.resolve(actor(['principal']));
      expect(scope).toEqual({ all: true });
      expect(query).not.toHaveBeenCalled();
    });

    it('resolves a supervisor to their supervised halaqat', async () => {
      query.mockResolvedValueOnce([{ id: 3 }, { id: 5 }]);
      const scope = await service.resolve(actor(['supervisor']));
      expect(scope).toEqual({ all: false, halaqaIds: [3, 5] });
    });

    it('resolves a teacher to their currently-assigned halaqat', async () => {
      query.mockResolvedValueOnce([{ id: 8 }]);
      const scope = await service.resolve(actor(['teacher']));
      expect(scope).toEqual({ all: false, halaqaIds: [8] });
    });

    it('merges and de-duplicates a supervisor+teacher across both sources', async () => {
      query
        .mockResolvedValueOnce([{ id: 3 }, { id: 5 }]) // supervised
        .mockResolvedValueOnce([{ id: 5 }, { id: 9 }]); // taught
      const scope = await service.resolve(actor(['supervisor', 'teacher']));
      expect(scope).toEqual({ all: false, halaqaIds: [3, 5, 9] });
    });

    it('returns an empty scope (not admin) when nothing is assigned', async () => {
      query.mockResolvedValueOnce([]);
      const scope = await service.resolve(actor(['teacher']));
      expect(scope).toEqual({ all: false, halaqaIds: [] });
    });
  });
});
