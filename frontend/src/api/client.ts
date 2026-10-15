import { bearer, type TokenStore } from './auth';
import { ApiError, type ApiErrorBody, type RequestOptions, type ServiceName } from './types';

const DEFAULT_ERROR: ApiErrorBody = { code: 'CLIENT_ERROR', message: 'Unexpected API response', traceId: 'unavailable', fieldErrors: [] };

export interface ApiClientOptions {
  baseUrl?: string;
  tokenStore?: TokenStore;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  correlationId?: () => string;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly tokenStore?: TokenStore;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly correlationId: () => string;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '/api').replace(/\/$/, '');
    this.tokenStore = options.tokenStore;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.correlationId = options.correlationId ?? (() => crypto.randomUUID());
  }

  async request<TResponse, TBody = unknown>(service: ServiceName, path: string, options: RequestOptions<TBody> = {}): Promise<TResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const abort = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
    const auth = options.authenticated === false ? undefined : bearer(this.tokenStore?.get() ?? null);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Correlation-Id': this.correlationId(),
      ...options.headers
    };
    if (auth) headers.Authorization = auth;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.ifMatch !== undefined) headers['If-Match'] = typeof options.ifMatch === 'number' ? `"${options.ifMatch}"` : options.ifMatch;
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/${service}${path.startsWith('/') ? path : `/${path}`}`, {
        method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (response.status === 204) return undefined as TResponse;
      const text = await response.text();
      let json: unknown;
      try { json = text ? JSON.parse(text) : undefined; }
      catch { throw new ApiError(response.status, { ...DEFAULT_ERROR, code: 'INVALID_PROVIDER_RESPONSE' }); }
      if (!response.ok) throw new ApiError(response.status, normalizeError(json, response.headers.get('X-Correlation-Id')));
      return json as TResponse;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if ((error as Error).name === 'AbortError') throw new ApiError(408, { ...DEFAULT_ERROR, code: 'CLIENT_TIMEOUT', message: 'Request timed out' });
      throw new ApiError(0, { ...DEFAULT_ERROR, code: 'NETWORK_ERROR', message: 'Unable to reach the service' });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
    }
  }
}

function normalizeError(value: unknown, traceHeader: string | null): ApiErrorBody {
  const body = (value && typeof value === 'object' ? value : {}) as Partial<ApiErrorBody>;
  return {
    code: typeof body.code === 'string' ? body.code : DEFAULT_ERROR.code,
    message: typeof body.message === 'string' ? body.message : DEFAULT_ERROR.message,
    traceId: typeof body.traceId === 'string' ? body.traceId : traceHeader ?? DEFAULT_ERROR.traceId,
    fieldErrors: Array.isArray(body.fieldErrors) ? body.fieldErrors : []
  };
}
