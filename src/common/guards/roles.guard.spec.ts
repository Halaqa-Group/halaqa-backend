import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RoleSlug } from '../../modules/roles/role.entity';
import { MIN_ROLE_LEVEL_KEY } from '../decorators/min-role-level.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedRole } from '../types/authenticated-user';
import { RolesGuard } from './roles.guard';

function makeContext(roles: AuthenticatedRole[]): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
  } as unknown as ExecutionContext;
}

function setMetadata(
  reflector: Reflector,
  meta: { isPublic?: boolean; roles?: RoleSlug[]; minLevel?: number },
) {
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return meta.isPublic ?? false;
      if (key === ROLES_KEY) return meta.roles;
      if (key === MIN_ROLE_LEVEL_KEY) return meta.minLevel;
      return undefined;
    });
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  describe('canActivate', () => {
    it('allows the route through when no @Roles or @MinRoleLevel metadata is present', () => {
      setMetadata(reflector, {});

      const result = guard.canActivate(makeContext([]));

      expect(result).toBe(true);
    });

    it('bypasses role checks on @Public() routes', () => {
      setMetadata(reflector, { isPublic: true, roles: ['principal'] });

      const result = guard.canActivate(makeContext([]));

      expect(result).toBe(true);
    });

    it('allows when the user holds at least one of the @Roles slugs', () => {
      setMetadata(reflector, { roles: ['principal', 'vice_principal'] });

      const result = guard.canActivate(
        makeContext([{ slug: 'vice_principal', level: 90 }]),
      );

      expect(result).toBe(true);
    });

    it("forbids when none of the user's slugs are in @Roles", () => {
      setMetadata(reflector, { roles: ['principal'] });

      expect(() =>
        guard.canActivate(makeContext([{ slug: 'teacher', level: 50 }])),
      ).toThrow(ForbiddenException);
    });

    it("allows when the user's highest role level meets @MinRoleLevel", () => {
      setMetadata(reflector, { minLevel: 70 });

      const result = guard.canActivate(
        makeContext([
          { slug: 'teacher', level: 50 },
          { slug: 'supervisor', level: 70 },
        ]),
      );

      expect(result).toBe(true);
    });

    it("forbids when the user's highest role level is below @MinRoleLevel", () => {
      setMetadata(reflector, { minLevel: 70 });

      expect(() =>
        guard.canActivate(makeContext([{ slug: 'teacher', level: 50 }])),
      ).toThrow(ForbiddenException);
    });

    it('enforces both @Roles and @MinRoleLevel when both are set', () => {
      setMetadata(reflector, { roles: ['supervisor'], minLevel: 70 });

      // Slug matches but level too low — still rejected.
      expect(() =>
        guard.canActivate(makeContext([{ slug: 'supervisor', level: 60 }])),
      ).toThrow(ForbiddenException);
    });
  });
});
