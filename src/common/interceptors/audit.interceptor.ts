import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AUDIT_KEY } from '../decorators/audit.decorator';

/**
 * Scaffold. Reads `@Audit('action.name')` metadata so the wiring is in
 * place; commit 8 swaps the placeholder log for a real `AuditService.log`
 * call once that service exists.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    const action = this.reflector.get<string | undefined>(
      AUDIT_KEY,
      context.getHandler(),
    );
    if (!action) return next.handle();

    return next.handle().pipe(
      tap(() => {
        this.logger.debug(`audit: ${action}`);
      }),
    );
  }
}
