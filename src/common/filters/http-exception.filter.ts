import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ThrottledException } from '../exceptions/throttled.exception';

interface ErrorEnvelope {
  code: number;
  message: string;
  details?: unknown;
  /** Present on 429 only. Mirrors the `Retry-After` header. */
  retry_after_seconds?: number;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      if (exception instanceof ThrottledException) {
        response.setHeader('Retry-After', String(exception.retryAfterSeconds));
      }
      response.status(exception.getStatus()).json(this.toEnvelope(exception));
      return;
    }

    this.logger.error(exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }

  private toEnvelope(exception: HttpException): ErrorEnvelope {
    const status = exception.getStatus();
    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return { code: status, message: payload };
    }

    const obj = payload as Record<string, unknown>;
    const message = this.extractMessage(obj, exception.message);
    const envelope: ErrorEnvelope = { code: status, message };
    if (Array.isArray(obj.message) && obj.message.length > 1) {
      envelope.details = obj.message;
    }
    if (typeof obj.retry_after_seconds === 'number') {
      envelope.retry_after_seconds = obj.retry_after_seconds;
    }
    return envelope;
  }

  private extractMessage(
    obj: Record<string, unknown>,
    fallback: string,
  ): string {
    const raw = obj.message;
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
    return fallback;
  }
}
