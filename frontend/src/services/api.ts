import type { ApiErrorBody } from '@/types';

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'agentguard.token';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export const tokenStore = {
  get: (): string | null => sessionStorage.getItem(TOKEN_KEY),
  set: (t: string): void => sessionStorage.setItem(TOKEN_KEY, t),
  clear: (): void => sessionStorage.removeItem(TOKEN_KEY),
};

type Query = Record<string, string | number | boolean | undefined | null>;

async function request<T>(method: string, path: string, opts: { body?: unknown; query?: Query; signal?: AbortSignal } = {}): Promise<T> {
  const url = new URL(API_BASE_URL + path);
  Object.entries(opts.query ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, signal: opts.signal });
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the AgentGuard API. Is the backend running?');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, body?.error.code ?? 'http_error', body?.error.message ?? res.statusText, body?.error.details);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
};
