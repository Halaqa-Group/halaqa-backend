import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../types/authenticated-user';
import { ActiveUserGuard } from './active-user.guard';

function makeContext(
  user: Partial<AuthenticatedUser> | null,
): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('ActiveUserGuard', () => {
  let reflector: Reflector;
  let guard: ActiveUserGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new ActiveUserGuard(reflector);
  });

  describe('canActivate', () => {
    it('lets active users through', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      const result = guard.canActivate(makeContext({ status: 'active' }));

      expect(result).toBe(true);
    });

    it('forbids inactive users with "Account inactive"', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(() =>
        guard.canActivate(makeContext({ status: 'inactive' })),
      ).toThrow(new ForbiddenException('Account inactive'));
    });

    it('forbids suspended users with "Account inactive"', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      expect(() =>
        guard.canActivate(makeContext({ status: 'suspended' })),
      ).toThrow(new ForbiddenException('Account inactive'));
    });

    it('skips the status check on @Public() routes — req.user may not exist', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const result = guard.canActivate(makeContext(null));

      expect(result).toBe(true);
    });
  });
});
