import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ApiMessage } from '../api-message';
import { ResponseInterceptor } from './response.interceptor';

function makeContext(statusCode: number): ExecutionContext {
  return {
    switchToHttp: () => ({
      getResponse: () => ({ statusCode }),
    }),
  } as unknown as ExecutionContext;
}

function makeHandler<T>(value: T): CallHandler<T> {
  return { handle: () => of(value) };
}

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<unknown>;

  beforeEach(() => {
    interceptor = new ResponseInterceptor();
  });

  describe('intercept', () => {
    it('wraps a plain value in { code, data }', async () => {
      const ctx = makeContext(200);
      const handler = makeHandler({ id: 1, name: 'Ahmad' });

      const result = await lastValueFrom(interceptor.intercept(ctx, handler));

      expect(result).toEqual({
        code: 200,
        data: { id: 1, name: 'Ahmad' },
      });
    });

    it('wraps a string value in { code, data }', async () => {
      const ctx = makeContext(200);
      const handler = makeHandler('Hello World!');

      const result = await lastValueFrom(interceptor.intercept(ctx, handler));

      expect(result).toEqual({ code: 200, data: 'Hello World!' });
    });

    it('renders an ApiMessage as { code, message }', async () => {
      const ctx = makeContext(200);
      const handler = makeHandler(
        new ApiMessage('A reset link has been sent.'),
      );

      const result = await lastValueFrom(interceptor.intercept(ctx, handler));

      expect(result).toEqual({
        code: 200,
        message: 'A reset link has been sent.',
      });
    });

    it('reflects the response status code in the envelope', async () => {
      const ctx = makeContext(201);
      const handler = makeHandler({ created: true });

      const result = await lastValueFrom(interceptor.intercept(ctx, handler));

      expect(result).toEqual({ code: 201, data: { created: true } });
    });

    it('returns undefined for 204 so the body stays empty', async () => {
      const ctx = makeContext(204);
      const handler = makeHandler(undefined);

      const result = await lastValueFrom(interceptor.intercept(ctx, handler));

      expect(result).toBeUndefined();
    });
  });
});
