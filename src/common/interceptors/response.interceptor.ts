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

interface SuccessEnvelope {
  code: number;
  data?: unknown;
  message?: string;
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
        return { code, data: value };
      }),
    );
  }
}
