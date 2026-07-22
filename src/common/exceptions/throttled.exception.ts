import { HttpException, HttpStatus } from '@nestjs/common';

export const THROTTLED_MESSAGE = 'Too many attempts. Please try again later.';

/**
 * 429 for a temporary block, carrying how long the caller should wait.
 *
 * `HttpExceptionFilter` renders `retryAfterSeconds` twice: as the standard
 * `Retry-After` header, and as `retry_after_seconds` in the error envelope.
 * The duplication is deliberate — `Retry-After` is not a CORS-safelisted
 * response header, so a browser on another origin cannot read it unless the
 * server also lists it in `Access-Control-Expose-Headers` (main.ts does), and
 * the body field keeps working even for clients that do not.
 *
 * The message is intentionally identical for every kind of block. Saying
 * "account locked" instead of "too many attempts" would hint that the account
 * exists, and distinguishing an IP block from an identifier block would tell an
 * attacker which limit they hit.
 */
export class ThrottledException extends HttpException {
  constructor(
    readonly retryAfterSeconds: number,
    message: string = THROTTLED_MESSAGE,
  ) {
    super(
      { message, retry_after_seconds: retryAfterSeconds },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
