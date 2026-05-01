import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import type { AuditService } from '../../modules/audit/audit.service';
import { AuditInterceptor } from './audit.interceptor';

interface FakeRequest {
  user: { id: number; schoolId: number; roles: { slug: string }[] } | null;
  params: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  ip: string | null;
}

function makeContext(
  req: FakeRequest,
  type: 'http' | 'rpc' = 'http',
): ExecutionContext {
  return {
    getType: () => type,
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

function makeHandler<T>(value: T): CallHandler<T> {
  return { handle: () => of(value) };
}

function makeAudit(): jest.Mocked<Pick<AuditService, 'log'>> {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

const ACTOR = {
  id: 1,
  schoolId: 7,
  roles: [{ slug: 'principal' }],
};

const REQ: FakeRequest = {
  user: ACTOR,
  params: { id: '42' },
  headers: { 'user-agent': 'curl/8' },
  ip: '1.2.3.4',
};

describe('AuditInterceptor', () => {
  let reflector: Reflector;
  let audit: jest.Mocked<Pick<AuditService, 'log'>>;
  let interceptor: AuditInterceptor;

  beforeEach(() => {
    reflector = new Reflector();
    audit = makeAudit();
    interceptor = new AuditInterceptor(
      reflector,
      audit as unknown as AuditService,
    );
  });

  describe('intercept', () => {
    it('passes through and writes nothing when no @Audit metadata is present', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue(undefined);

      const result = await lastValueFrom(
        interceptor.intercept(makeContext(REQ), makeHandler({ id: 1 })),
      );

      expect(result).toEqual({ id: 1 });
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('writes one audit row with action, actor, entityType, entityId from params, ip, UA', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue('user.update');

      const result = await lastValueFrom(
        interceptor.intercept(makeContext(REQ), makeHandler({ id: 99 })),
      );

      expect(result).toEqual({ id: 99 });
      expect(audit.log).toHaveBeenCalledTimes(1);
      const entry = audit.log.mock.calls[0][0];
      expect(entry.action).toBe('user.update');
      expect(entry.entityType).toBe('user');
      expect(entry.entityId).toBe('42');
      expect(entry.actor).toBe(ACTOR);
      expect(entry.ip).toBe('1.2.3.4');
      expect(entry.userAgent).toBe('curl/8');
    });

    it('falls back to response.id when params.id is absent', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue('user.create');
      const reqNoParam: FakeRequest = { ...REQ, params: {} };

      await lastValueFrom(
        interceptor.intercept(makeContext(reqNoParam), makeHandler({ id: 7 })),
      );

      expect(audit.log.mock.calls[0][0].entityId).toBe(7);
    });

    it('records a null actor when the request has no authenticated user', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue('auth.login.success');
      const anon: FakeRequest = { ...REQ, user: null };

      await lastValueFrom(
        interceptor.intercept(
          makeContext(anon),
          makeHandler({ user: { id: 1 } }),
        ),
      );

      expect(audit.log.mock.calls[0][0].actor).toBeNull();
    });

    it('uses the first X-Forwarded-For hop when present', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue('user.update');
      const reqFwd: FakeRequest = {
        ...REQ,
        headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' },
      };

      await lastValueFrom(
        interceptor.intercept(makeContext(reqFwd), makeHandler({})),
      );

      expect(audit.log.mock.calls[0][0].ip).toBe('9.9.9.9');
    });

    it('skips entirely for non-http (e.g. RPC/WS) execution contexts', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue('user.update');

      await lastValueFrom(
        interceptor.intercept(makeContext(REQ, 'rpc'), makeHandler({})),
      );

      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
