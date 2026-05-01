import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';

function makeContext(): ExecutionContext {
  return {
    getHandler: () => () => undefined,
  } as unknown as ExecutionContext;
}

function makeHandler<T>(value: T): CallHandler<T> {
  return { handle: () => of(value) };
}

describe('AuditInterceptor', () => {
  let reflector: Reflector;
  let interceptor: AuditInterceptor;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    reflector = new Reflector();
    interceptor = new AuditInterceptor(reflector);
    debugSpy = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('intercept', () => {
    it('passes the response through untouched when no @Audit metadata is set', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue(undefined);

      const result = await lastValueFrom(
        interceptor.intercept(makeContext(), makeHandler({ id: 1 })),
      );

      expect(result).toEqual({ id: 1 });
      expect(debugSpy).not.toHaveBeenCalled();
    });

    it('logs the action and forwards the response when @Audit metadata is present', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue('user.update');

      const result = await lastValueFrom(
        interceptor.intercept(makeContext(), makeHandler({ id: 42 })),
      );

      expect(result).toEqual({ id: 42 });
      expect(debugSpy).toHaveBeenCalledWith('audit: user.update');
    });
  });
});
