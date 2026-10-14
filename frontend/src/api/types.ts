export type ServiceName = 'identity' | 'catalog' | 'community' | 'trip' | 'ingestion' | 'intelligence';

export interface ApiErrorBody {
  code: string;
  message: string;
  traceId: string;
  fieldErrors: Array<{ field?: string; message: string; code?: string }>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface RequestOptions<TBody = unknown> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: TBody;
  ifMatch?: string | number;
  idempotencyKey?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  authenticated?: boolean;
}
