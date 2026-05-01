import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../modules/audit/audit.service';
import { AUDIT_KEY } from '../decorators/audit.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
  params: Record<string, string>;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    const action = this.reflector.get<string | undefined>(
      AUDIT_KEY,
      context.getHandler(),
    );
    if (!action) return next.handle();

    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<RequestWithUser>();

    return next.handle().pipe(
      tap((response) => {
        void this.audit.log({
          actor: req.user ?? null,
          action,
          entityType: action.split('.')[0] || 'unknown',
          entityId: this.resolveEntityId(req, response),
          ip: this.extractIp(req),
          userAgent: req.headers?.['user-agent']
            ? String(req.headers['user-agent'])
            : null,
        });
      }),
    );
  }

  private resolveEntityId(
    req: RequestWithUser,
    response: unknown,
  ): string | number | null {
    if (req.params?.id) return req.params.id;
    if (
      response &&
      typeof response === 'object' &&
      'id' in response &&
      (typeof response.id === 'string' || typeof response.id === 'number')
    ) {
      return (response as { id: string | number }).id;
    }
    return null;
  }

  private extractIp(req: RequestWithUser): string | null {
    const fwd = req.headers?.['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length > 0) {
      return fwd.split(',')[0].trim();
    }
    return req.ip ?? null;
  }
}
