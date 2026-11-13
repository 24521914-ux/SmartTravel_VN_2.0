import { ApiClient } from "./client";
import type { RequestOptions, ServiceName } from "./types";

export type Resource = Record<string, unknown>;
export interface Page {
  items: Resource[];
  next_cursor?: string | null;
}
/** Domain requests keep service ownership and optimistic concurrency at the HTTP boundary. */
export class TravelClient {
  constructor(private readonly api: ApiClient) {}
  read<T = Resource>(service: ServiceName, path: string): Promise<T> {
    return this.api.request<T>(service, `/api/v1${path}`);
  }
  async readAll(service: ServiceName, path: string): Promise<Page> {
    const items: Resource[] = [];
    const seen = new Set<string>();
    let cursor: string | null | undefined;
    do {
      const separator = path.includes("?") ? "&" : "?";
      const page: Page = await this.read<Page>(
        service,
        `${path}${separator}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      items.push(...page.items);
      cursor = page.next_cursor;
      if (cursor && seen.has(cursor))
        throw new Error("API returned a repeated pagination cursor");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return { items, next_cursor: null };
  }
  mutate<T = Resource>(
    service: ServiceName,
    path: string,
    body: unknown,
    method: RequestOptions["method"] = "POST",
    version?: number,
    idempotencyKey: string = crypto.randomUUID(),
  ): Promise<T> {
    return this.api.request<T>(service, `/api/v1${path}`, {
      method,
      body,
      ifMatch: version,
      idempotencyKey,
    });
  }
  places(
    query = "",
    options: { cursor?: string; categoryId?: string; limit?: number } = {},
  ) {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (options.cursor) params.set("cursor", options.cursor);
    if (options.categoryId) params.set("categoryId", options.categoryId);
    if (options.limit) params.set("limit", String(options.limit));
    return this.read<Page>(
      "catalog",
      `/places${params.size ? `?${params}` : ""}`,
    );
  }
  place(id: string) {
    return this.read("catalog", `/places/${encodeURIComponent(id)}`);
  }
  reviews(id: string) {
    return this.read<Page>(
      "community",
      `/places/${encodeURIComponent(id)}/reviews`,
    );
  }
  review(
    id: string,
    rating: number,
    content: string,
    mediaKeys: string[] = [],
  ) {
    return this.mutate(
      "community",
      `/places/${encodeURIComponent(id)}/reviews`,
      { rating, content, media_keys: mediaKeys },
    );
  }
  recommend() {
    return this.mutate<Page>("intelligence", "/recommendations", {
      topN: 10,
      currency: "VND",
    });
  }
}
