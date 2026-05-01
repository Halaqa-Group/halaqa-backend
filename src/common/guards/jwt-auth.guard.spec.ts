import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';

function makeContext(): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let reflector: Reflector;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  describe('canActivate', () => {
    it('bypasses passport authentication when the route is marked @Public()', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
      const superSpy = jest.spyOn(AuthGuard('jwt').prototype, 'canActivate');

      const result = guard.canActivate(makeContext());

      expect(result).toBe(true);
      expect(superSpy).not.toHaveBeenCalled();
    });

    it('delegates to the passport-jwt guard when the route is not @Public()', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const superSpy = jest
        .spyOn(AuthGuard('jwt').prototype, 'canActivate')
        .mockReturnValue(true);

      const ctx = makeContext();
      const result = guard.canActivate(ctx);

      expect(superSpy).toHaveBeenCalledWith(ctx);
      expect(result).toBe(true);
    });
  });
});
