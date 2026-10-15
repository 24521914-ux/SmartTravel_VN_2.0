import { ApiClient } from './client';
import type { RequestOptions, ServiceName } from './types';

export type Resource = Record<string, unknown>;
export interface Page { items: Resource[]; next_cursor?: string | null }
/** Domain requests keep service ownership and optimistic concurrency at the HTTP boundary. */
export class TravelClient {
  constructor(private readonly api: ApiClient) {}
  read<T = Resource>(service: ServiceName, path: string): Promise<T> {
    return this.api.request<T>(service, `/api/v1${path}`);
  }
  mutate<T = Resource>(service: ServiceName, path: string, body: unknown, method: RequestOptions['method'] = 'POST', version?: number): Promise<T> {
    return this.api.request<T>(service, `/api/v1${path}`, { method, body, ifMatch: version, idempotencyKey: crypto.randomUUID() });
  }
  places(query = '') { return this.read<Page>('catalog', `/places${query ? `?q=${encodeURIComponent(query)}` : ''}`); }
  place(id: string) { return this.read('catalog', `/places/${encodeURIComponent(id)}`); }
  reviews(id: string) { return this.read<Page>('community', `/places/${encodeURIComponent(id)}/reviews`); }
  review(id: string, rating: number, content: string) {
    return this.mutate('community', `/places/${encodeURIComponent(id)}/reviews`, { rating, content, media_keys: [] });
  }
  recommend() { return this.mutate<Page>('intelligence', '/recommendations', { topN: 10, currency: 'VND' }); }
}
