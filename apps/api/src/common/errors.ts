import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VERSION_CONFLICT'
  | 'INVALID_TRANSITION'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'BAD_REQUEST'
  | 'INTERNAL';

/** Domain error carrying a stable machine-readable code. */
export class AppError extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    status: number,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export const Errors = {
  validation: (details: unknown) => new AppError('VALIDATION_FAILED', 'The request is invalid', 422, details),
  unauthenticated: () => new AppError('UNAUTHENTICATED', 'Please sign in', 401),
  forbidden: (msg = 'You do not have permission to do that') => new AppError('FORBIDDEN', msg, 403),
  /** Use notFound rather than forbidden when existence itself must not leak across tenants. */
  notFound: (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found`, 404),
  conflict: (msg: string) => new AppError('CONFLICT', msg, 409),
  version: () => new AppError('VERSION_CONFLICT', 'This item was changed by someone else. Refresh and try again.', 409),
  transition: (msg: string, code: ErrorCode = 'INVALID_TRANSITION') => new AppError(code, msg, code === 'FORBIDDEN' ? 403 : 409),
  badRequest: (msg: string) => new AppError('BAD_REQUEST', msg, 400),
};

/** Translates every thrown error into the consistent `{ error: { code, message, details } }` envelope. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let body: { code: ErrorCode; message: string; details?: unknown } = { code: 'INTERNAL', message: 'Something went wrong' };

    if (exception instanceof AppError) {
      status = exception.getStatus();
      body = { code: exception.code, message: exception.message, details: exception.details };
    } else if (exception instanceof ThrottlerException) {
      status = 429;
      body = { code: 'RATE_LIMITED', message: 'Too many requests, slow down' };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const code: ErrorCode =
        status === 404 ? 'NOT_FOUND' : status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST';
      body = { code, message: exception.message };
    } else if (isPgError(exception)) {
      // Map integrity violations to clean client errors instead of 500s.
      if (exception.code === '23505') {
        status = 409;
        body = { code: 'CONFLICT', message: 'That already exists' };
      } else if (exception.code === '23503') {
        status = 422;
        body = { code: 'VALIDATION_FAILED', message: 'A referenced record does not exist in this workspace' };
      } else if (exception.code === '23514') {
        status = 422;
        body = { code: 'VALIDATION_FAILED', message: 'The data violates a business rule' };
      } else if (exception.code === '22P02') {
        status = 400;
        body = { code: 'BAD_REQUEST', message: 'Malformed identifier' };
      }
    }
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(status).json({ error: body });
  }
}

function isPgError(e: unknown): e is { code: string } {
  const c = (e as any)?.code ?? (e as any)?.cause?.code;
  if (typeof c === 'string' && /^[0-9A-Z]{5}$/.test(c)) {
    (e as any).code = c;
    return true;
  }
  return false;
}

export { HttpStatus };
