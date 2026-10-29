/**
 * Thin fetch wrapper for the Space API. Same-origin (proxied by Next rewrites), cookie-authenticated,
 * and always sends the CSRF header the API requires for state-changing requests.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
  /** First field error message, if the API returned zod-style details. */
  get fieldMessage(): string | undefined {
    const d = this.details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | undefined;
    const first = d?.fieldErrors && Object.values(d.fieldErrors).flat()[0];
    return first ?? d?.formErrors?.[0];
  }
}

async function request<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(method !== 'GET' ? { 'x-space-csrf': '1' } : {}),
      ...(body && !isForm ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? (isForm ? (body as FormData) : JSON.stringify(body)) : undefined,
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const e = json?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? res.statusText, e.details);
  }
  return json as T;
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
