import type { Page, Resource, TravelClient } from '../../shared/api';
import { isSyntheticFixtureSuite, loadOpenDataPlaces, mergeCatalogWithOpenData } from './osmCatalog';

export type TaxonomyKind = 'categories' | 'tags' | 'amenities' | 'destinations' | 'geographic-units';

export interface MergedCatalogResult {
  places: Resource[];
  categories: Resource[];
  geographicUnits: Resource[];
  destinations: Resource[];
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface ClientCatalogStore {
  version: number;
  taxonomy: Map<TaxonomyKind, CacheEntry<Resource[]>>;
  taxonomyInflight: Map<TaxonomyKind, Promise<Resource[]>>;
  firstPage?: CacheEntry<Page>;
  firstPageInflight?: Promise<Page>;
  allDbPlaces?: CacheEntry<Resource[]>;
  allDbPlacesInflight?: Promise<Resource[]>;
  merged?: CacheEntry<MergedCatalogResult>;
  subscribed: boolean;
}

const CATALOG_CACHE_TTL_MS = 60_000;
const stores = new WeakMap<TravelClient, ClientCatalogStore>();

function storeFor(travel: TravelClient): ClientCatalogStore {
  let store = stores.get(travel);
  if (!store) {
    store = {
      version: 0,
      taxonomy: new Map(),
      taxonomyInflight: new Map(),
      subscribed: false,
    };
    if (typeof (travel as { onMutate?: unknown }).onMutate === 'function') {
      store.subscribed = true;
      travel.onMutate(service => {
        if (service === 'catalog' || service === 'ingestion') {
          invalidateCatalogCache(travel);
        }
      });
    }
    stores.set(travel, store);
  }
  return store;
}

export function invalidateCatalogCache(travel: TravelClient): void {
  const store = stores.get(travel);
  if (!store) return;
  store.version += 1;
  store.taxonomy.clear();
  store.taxonomyInflight.clear();
  store.firstPage = undefined;
  store.firstPageInflight = undefined;
  store.allDbPlaces = undefined;
  store.allDbPlacesInflight = undefined;
  store.merged = undefined;
}

export function getCachedMergedCatalog(travel: TravelClient): MergedCatalogResult | null {
  const store = storeFor(travel);
  if (store.merged && Date.now() < store.merged.expiresAt) {
    return store.merged.value;
  }
  return null;
}

export function setCachedMergedCatalog(travel: TravelClient, merged: MergedCatalogResult): void {
  if (merged.places.some(isSyntheticFixtureSuite)) return;
  const store = storeFor(travel);
  store.merged = {
    value: merged,
    expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
  };
}

export function cachedTaxonomy(
  travel: TravelClient,
  kind: TaxonomyKind,
  options: { force?: boolean } = {},
): Promise<Resource[]> {
  const store = storeFor(travel);
  if (!options.force) {
    const hit = store.taxonomy.get(kind);
    if (hit && Date.now() < hit.expiresAt) {
      return Promise.resolve(hit.value);
    }
    const inflight = store.taxonomyInflight.get(kind);
    if (inflight) return inflight;
  }

  const capturedVersion = store.version;
  const promise = travel
    .readAll('catalog', `/${kind}`)
    .then(res => {
      const items = res.items ?? [];
      if (store.version === capturedVersion && !items.some(isSyntheticFixtureSuite)) {
        store.taxonomy.set(kind, {
          value: items,
          expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
        });
      }
      return items;
    })
    .finally(() => {
      if (store.taxonomyInflight.get(kind) === promise) {
        store.taxonomyInflight.delete(kind);
      }
    });

  store.taxonomyInflight.set(kind, promise);
  return promise;
}

export function cachedFirstPlacesPage(
  travel: TravelClient,
  limit = 12,
  options: { force?: boolean } = {},
): Promise<Page> {
  if (limit !== 12 || options.force) {
    return travel.read<Page>('catalog', `/places?limit=${limit}`);
  }
  const store = storeFor(travel);
  if (store.firstPage && Date.now() < store.firstPage.expiresAt) {
    return Promise.resolve(store.firstPage.value);
  }
  if (store.firstPageInflight) return store.firstPageInflight;

  const capturedVersion = store.version;
  const promise = travel
    .read<Page>('catalog', `/places?limit=${limit}`)
    .then(page => {
      if (store.version === capturedVersion && !(page.items ?? []).some(isSyntheticFixtureSuite)) {
        store.firstPage = {
          value: page,
          expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
        };
      }
      return page;
    })
    .finally(() => {
      if (store.firstPageInflight === promise) {
        store.firstPageInflight = undefined;
      }
    });

  store.firstPageInflight = promise;
  return promise;
}

export function dedupePlacesById(rows: Resource[]): Resource[] {
  const seen = new Set<string>();
  const out: Resource[] = [];
  for (const row of rows) {
    const id = String(row.place_id ?? row.id ?? '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

/**
 * Fetches remaining paginated DB places starting cleanly from `firstPage.next_cursor`
 * (without re-requesting page 1!) and coalesces concurrent full-catalog fetches across views.
 */
export async function fetchAllRemainingPlaces(
  travel: TravelClient,
  firstPage: Page,
  options: { force?: boolean } = {},
): Promise<Resource[]> {
  if (!firstPage.next_cursor) {
    return dedupePlacesById(firstPage.items ?? []);
  }
  const store = storeFor(travel);
  if (!options.force && store.allDbPlaces && Date.now() < store.allDbPlaces.expiresAt) {
    return store.allDbPlaces.value;
  }
  if (!options.force && store.allDbPlacesInflight) {
    return store.allDbPlacesInflight;
  }

  const capturedVersion = store.version;
  const promise = travel
    .readAll('catalog', '/places')
    .then(page => {
      const deduped = dedupePlacesById(page.items ?? []);
      if (store.version === capturedVersion && !deduped.some(isSyntheticFixtureSuite)) {
        store.allDbPlaces = {
          value: deduped,
          expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
        };
      }
      return deduped;
    })
    .finally(() => {
      if (store.allDbPlacesInflight === promise) {
        store.allDbPlacesInflight = undefined;
      }
    });

  store.allDbPlacesInflight = promise;
  return promise;
}

export async function ensureFullMergedCatalog(
  travel: TravelClient,
  firstPage?: Page,
): Promise<MergedCatalogResult | null> {
  const cached = getCachedMergedCatalog(travel);
  if (cached) return cached;

  const [openData, seedPage, categories, destinations, geographicUnits] = await Promise.all([
    loadOpenDataPlaces(),
    firstPage ? Promise.resolve(firstPage) : travel.read<Page>('catalog', '/places?limit=100'),
    cachedTaxonomy(travel, 'categories').catch(() => [] as Resource[]),
    cachedTaxonomy(travel, 'destinations').catch(() => [] as Resource[]),
    cachedTaxonomy(travel, 'geographic-units').catch(() => [] as Resource[]),
  ]);
  if (!openData.length || (seedPage.items ?? []).some(isSyntheticFixtureSuite)) {
    return null;
  }
  const allDbPlaces = await fetchAllRemainingPlaces(travel, seedPage);
  const merged = mergeCatalogWithOpenData({
    catalogPlaces: allDbPlaces,
    openDataPlaces: openData,
    categories,
    geographicUnits,
    destinations,
  });
  setCachedMergedCatalog(travel, merged);
  return merged;
}
