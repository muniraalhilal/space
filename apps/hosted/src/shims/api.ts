/**
 * Drop-in replacement for apps/web/src/lib/api.ts: the same `api` surface, served by the in-page
 * backend instead of HTTP. Responses are cloned so callers can't mutate stored rows.
 */
import { AppError } from '../backend/core';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
  get fieldMessage(): string | undefined {
    const d = this.details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | undefined;
    const first = d?.fieldErrors && Object.values(d.fieldErrors).flat()[0];
    return first ?? d?.formErrors?.[0];
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { handle } = await import('../backend/router');
  try {
    const out = await handle(method, path, body);
    return (out === undefined ? undefined : body instanceof FormData ? out : structuredClone(out)) as T;
  } catch (e) {
    if (e instanceof AppError) throw new ApiError(e.status, e.code, e.message, e.details);
    throw new ApiError(500, 'INTERNAL', (e as Error)?.message ?? 'Something went wrong');
  }
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b ?? {}),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b ?? {}),
  del: <T>(p: string) => request<T>('DELETE', p),
  upload: <T>(p: string, fd: FormData) => request<T>('POST', p, fd),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.fieldMessage ?? e.message;
  return e instanceof Error ? e.message : 'Something went wrong';
}
