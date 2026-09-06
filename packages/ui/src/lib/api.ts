import type { ApiErrorShape } from './types';

/** An error carrying the server's machine code, so screens can react precisely. */
export class ApiError extends Error {
  code: string;
  status: number;
  field?: string;
  /**
   * The whole detail, not just the field. It carries `key` and `params` — the
   * translation of the server's message — and `message` is the English the
   * server logs, kept as the fallback for a key an older client does not know.
   */
  detail?: ApiErrorShape['detail'];
  constructor(shape: ApiErrorShape, status: number) {
    super(shape.message);
    this.name = 'ApiError';
    this.code = shape.code;
    this.status = status;
    this.field = shape.detail?.field as string | undefined;
    this.detail = shape.detail;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function withQuery(path: string, query?: Query) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== null && v !== undefined && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiError(
      body?.error ?? { code: 'UNKNOWN', message: 'Something went wrong. Please try again.' },
      res.status,
    );
  }
  return body as T;
}

/** Session lives in an HttpOnly cookie, so every call just sends credentials. */
const base: RequestInit = { credentials: 'same-origin' };

export const api = {
  get: <T>(path: string, query?: Query) => fetch(withQuery(path, query), base).then(parse<T>),
  post: <T>(path: string, body?: unknown) => fetch(path, {
    ...base,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).then(parse<T>),
  patch: <T>(path: string, body?: unknown) => fetch(path, {
    ...base,
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).then(parse<T>),
  del: <T>(path: string) => fetch(path, { ...base, method: 'DELETE' }).then(parse<T>),
  upload: <T>(path: string, file: File | Blob, field = 'photo') => {
    const form = new FormData();
    form.append(field, file, (file as File).name || 'photo.jpg');
    return fetch(path, { ...base, method: 'POST', body: form }).then(parse<T>);
  },
};

export const auth = {
  me: () => api.get<{ employee: import('./types').Employee; today: string; timezone: string; app: string }>('/api/auth/me'),
  signIn: (email: string, password: string) =>
    api.post<{ employee: import('./types').Employee; today: string; timezone: string }>('/api/auth/sign-in', { email, password }),
  signOut: () => api.post<{ ok: true }>('/api/auth/sign-out'),
};

export const photoUrl = (id: string) => `/api/photos/${id}`;
