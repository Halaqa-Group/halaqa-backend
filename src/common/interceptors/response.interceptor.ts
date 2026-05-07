import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiMessage } from '../api-message';
import { DataWithWarnings } from '../data-with-warnings';

interface SuccessEnvelope {
  code: number;
  data?: unknown;
  message?: string;
  warnings?: string[];
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  SuccessEnvelope | undefined
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessEnvelope | undefined> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((value) => {
        const code = response.statusCode;
        if (code === 204) return undefined;
        if (value instanceof ApiMessage) {
          return { code, message: value.message };
        }
        if (value instanceof DataWithWarnings) {
          const result: SuccessEnvelope = { code, data: value.data };
          if (value.warnings.length > 0) result.warnings = value.warnings;
          return result;
        }
        return { code, data: value };
      }),
    );
  }
}
