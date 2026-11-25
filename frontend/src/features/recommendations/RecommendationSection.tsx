import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppPreferences } from '../../app/providers/AppPreferences';
import { useAuth } from '../../app/providers/AuthProvider';
import { ApiError, type Resource, type TravelClient } from '../../shared/api';
import { EmptyState, ErrorState, Icon } from '../../shared/ui';
import { aiEnabled } from '../../shared/config/features';
import { InteractiveMap, validCoordinates, type MapPoint } from '../places/InteractiveMap';
import { PlaceDetailPage } from '../places/PlaceDetailPage';
import { hydratePlaceWithOpenData, hydratePlacesWithOpenData, loadOpenDataPlaces } from '../places/osmCatalog';
import { AddToTripModal } from './AddToTripModal';
import { RecommendationCard } from './RecommendationCard';
import { RecommendationFilters } from './RecommendationFilters';
import {
  fetchRanking,
  fetchRankingStats,
  sendImpressions,
  sendRankingFeedback,
  type RankingRequestPayload,
  type RankingResponse,
  type RankingStats,
} from './ranking-api';
import {
  BUDGET_TIER_OPTIONS,
  COMPANION_OPTIONS,
  EXPERIENCE_OPTIONS,
  INITIAL_FILTERS,
  VISIT_TIME_SLOTS,
  assessSpaceReliability,
  buildLocationOptions,
  isTestFixture,
  localizedName,
  normalizeText,
  type ExperienceKey,
  type RankedRecommendation,
  type RecommendationFilterState,
} from './recommendation-engine';
import './recommendations.css';

export interface RecommendationSectionProps {
  travel: TravelClient;
  onNavigate: (section: string) => void;
  busy?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_EXPERIENCES = new Set<string>(['sea_view', 'mountain', 'quiet', 'sunset', 'street_food', 'heritage']);
const VALID_BUDGET_TIERS = new Set<string>(['FREE', 'BUDGET', 'MID', 'HIGH']);
const VALID_VISIT_TIMES = new Set<string>(['MORNING', 'NOON', 'AFTERNOON', 'EVENING']);
const VALID_COMPANIONS = new Set<string>(['SOLO', 'COUPLE', 'FAMILY', 'FRIENDS']);
const VALID_RATINGS = new Set<string>(['3', '3.5', '4', '4.5']);
const TOP_N_DEFAULT = 48;
const PAGE_SIZE = 16;

function readInitialFiltersFromUrl(): RecommendationFilterState {
  try {
    const params = new URLSearchParams(window.location.search);
    const dest = params.get('destination_id') ?? '';
    const geo = params.get('geographic_unit_id') ?? '';
    const cat = params.get('category_id') ?? '';
    const exps = (params.get('pref') ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(s => VALID_EXPERIENCES.has(s)) as ExperienceKey[];
    const tier = params.get('budget_tier') ?? '';
    const minP = params.get('min_budget') ?? '';
    const maxP = params.get('max_budget') ?? '';
    const vTime = params.get('visit_time') ?? '';
    const comp = params.get('companion') ?? '';
    const minR = params.get('min_rating') ?? '';
    return {
      ...INITIAL_FILTERS,
      destinationId: UUID_RE.test(dest) ? dest : '',
      geographicUnitId: UUID_RE.test(geo) ? geo : '',
      categoryId: UUID_RE.test(cat) ? cat : '',
      experiences: exps,
      budgetTier: VALID_BUDGET_TIERS.has(tier) ? (tier as RecommendationFilterState['budgetTier']) : '',
      minPrice: /^\d+$/.test(minP) ? minP : '',
      maxPrice: /^\d+$/.test(maxP) ? maxP : '',
      visitTime: VALID_VISIT_TIMES.has(vTime) ? (vTime as RecommendationFilterState['visitTime']) : '',
      companion: VALID_COMPANIONS.has(comp) ? (comp as RecommendationFilterState['companion']) : '',
      minRating: VALID_RATINGS.has(minR) ? (minR as RecommendationFilterState['minRating']) : '',
    };
  } catch {
    return INITIAL_FILTERS;
  }
}

function syncNonSensitiveFiltersToUrl(filters: RecommendationFilterState) {
  try {
    const url = new URL(window.location.href);
    if (url.pathname !== '/goi-y') return;
    const params = new URLSearchParams();
    // Never put token, user_id, or exact GPS coordinates into the URL.
    if (filters.destinationId && UUID_RE.test(filters.destinationId)) params.set('destination_id', filters.destinationId);
    if (filters.geographicUnitId && UUID_RE.test(filters.geographicUnitId)) params.set('geographic_unit_id', filters.geographicUnitId);
    if (filters.categoryId && UUID_RE.test(filters.categoryId)) params.set('category_id', filters.categoryId);
    if (filters.experiences.length > 0) params.set('pref', filters.experiences.join(','));
    if (filters.budgetTier) params.set('budget_tier', filters.budgetTier);
    if (filters.minPrice && /^\d+$/.test(filters.minPrice)) params.set('min_budget', filters.minPrice);
    if (filters.maxPrice && /^\d+$/.test(filters.maxPrice)) params.set('max_budget', filters.maxPrice);
    if (filters.visitTime) params.set('visit_time', filters.visitTime);
    if (filters.companion) params.set('companion', filters.companion);
    if (filters.minRating) params.set('min_rating', filters.minRating);
    const nextSearch = params.toString();
    const nextUrl = nextSearch ? `${url.pathname}?${nextSearch}` : url.pathname;
    if (window.location.pathname + window.location.search !== nextUrl) {
      window.history.replaceState(null, '', nextUrl);
    }
  } catch {
    // Ignore history API restrictions
  }
}

export function RecommendationSection({ travel, onNavigate, busy: externalBusy = false }: RecommendationSectionProps) {
  const { locale, text, formatCurrency } = useAppPreferences();
  const { isAuthenticated } = useAuth();

  // Canonical reference data from Catalog
  const [catalogPlaces, setCatalogPlaces] = useState<Resource[]>([]);
  const [categories, setCategories] = useState<Resource[]>([]);
  const [tags, setTags] = useState<Resource[]>([]);
  const [geographicUnits, setGeographicUnits] = useState<Resource[]>([]);
  const [destinations, setDestinations] = useState<Resource[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');

  // Real backend ranking state
  const [rankingResponse, setRankingResponse] = useState<RankingResponse | null>(null);
  const [rankingStats, setRankingStats] = useState<RankingStats | null>(null);
  const [rankingLoading, setRankingLoading] = useState(aiEnabled);
  const [rankingError, setRankingError] = useState('');
  const [serviceDeferred, setServiceDeferred] = useState(!aiEnabled);

  // User state
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [feedbackSent, setFeedbackSent] = useState<Record<string, 'ACCEPT' | 'SKIP'>>({});

  // UI state
  const [filters, setFilters] = useState<RecommendationFilterState>(() => readInitialFiltersFromUrl());
  const [budgetBasis, setBudgetBasis] = useState<'PER_PERSON' | 'PER_VISIT' | 'OFFERING'>('PER_PERSON');
  const [topN, setTopN] = useState(TOP_N_DEFAULT);
  const [currentPage, setCurrentPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [highlightedPlaceId, setHighlightedPlaceId] = useState<string>('');
  const [selectedPlace, setSelectedPlace] = useState<Resource | null>(null);
  const [tripTargetPlace, setTripTargetPlace] = useState<Resource | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  // Race-condition protection + pseudonymous analytics session + impression deduplication
  const requestSeqRef = useRef(0);
  const openDataRef = useRef<Resource[]>([]);
  const [openDataVersion, setOpenDataVersion] = useState(0);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const sentImpressionsRef = useRef<Set<string>>(new Set());
  const cardNodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const dwellTimersRef = useRef<Map<string, number>>(new Map());

  const isBusy = busy || externalBusy;

  // Reset pagination whenever active filter set changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, budgetBasis]);

  // Load canonical Catalog metadata & real backend stats
  const loadMetadata = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const [openData, placesRes, catsRes, tagsRes, geoRes, destRes, statsRes] = await Promise.all([
        loadOpenDataPlaces(),
        travel.readAll('catalog', '/places').catch(() => ({ items: [] as Resource[] })),
        travel.readAll('catalog', '/categories').catch(() => ({ items: [] as Resource[] })),
        travel.readAll('catalog', '/tags').catch(() => ({ items: [] as Resource[] })),
        travel.readAll('catalog', '/geographic-units').catch(() => ({ items: [] as Resource[] })),
        travel.readAll('catalog', '/destinations').catch(() => ({ items: [] as Resource[] })),
        aiEnabled ? fetchRankingStats(travel).catch(() => null) : Promise.resolve(null),
      ]);

      if (openData.length) {
        openDataRef.current = openData;
        setOpenDataVersion(v => v + 1);
      }
      setCatalogPlaces(hydratePlacesWithOpenData((placesRes.items ?? []).filter(p => !isTestFixture(p)), openData));
      setCategories((catsRes.items ?? []).filter(c => !isTestFixture(c)));
      setTags((tagsRes.items ?? []).filter(t => !isTestFixture(t)));
      setGeographicUnits((geoRes.items ?? []).filter(g => !isTestFixture(g)));
      setDestinations((destRes.items ?? []).filter(d => !isTestFixture(d)));
      if (statsRes) setRankingStats(statsRes);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : text('Không thể tải danh mục địa bàn.', 'Failed to load catalog metadata.'));
    } finally {
      setCatalogLoading(false);
    }
  }, [travel, text]);

  const loadFavorites = useCallback(async () => {
    if (!isAuthenticated) {
      setFavoriteIds(new Set());
      return;
    }
    try {
      const data = await travel.readAll('community', '/me/favorites');
      setFavoriteIds(new Set((data.items ?? []).map(item => String(item.place_id ?? item.id ?? ''))));
    } catch {
      // Keep favorites empty if community service unavailable
    }
  }, [travel, isAuthenticated]);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  // Expand geographic unit hierarchy (selected province -> includes descendant districts)
  const expandGeoUnitIds = useCallback((selectedGeoId: string): string[] => {
    if (!selectedGeoId) return [];
    const result = new Set<string>([selectedGeoId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const u of geographicUnits) {
        const id = String(u.geographic_unit_id ?? u.id ?? '');
        const parentId = u.parent_id ? String(u.parent_id) : '';
        if (id && parentId && result.has(parentId) && !result.has(id)) {
          result.add(id);
          changed = true;
        }
      }
    }
    return [...result];
  }, [geographicUnits]);

  const locationOptions = useMemo(
    () => buildLocationOptions(geographicUnits, destinations, catalogPlaces, locale),
    [geographicUnits, destinations, catalogPlaces, locale],
  );

  // Sync URL label when deep-linked with destination_id or geographic_unit_id
  useEffect(() => {
    if (filters.locationQuery || (!filters.destinationId && !filters.geographicUnitId) || locationOptions.length === 0) {
      return;
    }
    const found = locationOptions.find(
      opt =>
        (opt.kind === 'destination' && opt.id === filters.destinationId) ||
        (opt.kind === 'geo' && opt.id === filters.geographicUnitId),
    );
    if (found) {
      setFilters(prev => (prev.locationQuery ? prev : { ...prev, locationQuery: found.label }));
    }
  }, [filters.destinationId, filters.geographicUnitId, filters.locationQuery, locationOptions]);

  const selectedLocationLabel = useMemo(() => {
    const match = locationOptions.find(
      opt =>
        (opt.kind === 'geo' && opt.id === filters.geographicUnitId) ||
        (opt.kind === 'destination' && opt.id === filters.destinationId),
    );
    return match?.label || filters.locationQuery.trim();
  }, [locationOptions, filters.geographicUnitId, filters.destinationId, filters.locationQuery]);

  const spaceReliability = useMemo(
    () => assessSpaceReliability(catalogPlaces, tags),
    [catalogPlaces, tags],
  );

  // Build structured backend ranking request from filter state
  const buildRankingPayload = useCallback(
    (activeFilters: RecommendationFilterState): RankingRequestPayload => {
      const payload: RankingRequestPayload = {
        topN: Math.min(50, Math.max(1, topN)),
        currency: 'VND',
        budget_basis: budgetBasis,
        timezone: 'Asia/Ho_Chi_Minh',
        session_id: sessionIdRef.current,
      };

      if (activeFilters.destinationId && UUID_RE.test(activeFilters.destinationId)) {
        payload.destination_id = activeFilters.destinationId;
      } else if (activeFilters.geographicUnitId && UUID_RE.test(activeFilters.geographicUnitId)) {
        payload.geographic_unit_id = activeFilters.geographicUnitId;
        payload.expanded_geo_unit_ids = expandGeoUnitIds(activeFilters.geographicUnitId);
      }

      if (activeFilters.categoryId && UUID_RE.test(activeFilters.categoryId)) {
        payload.category_ids = [activeFilters.categoryId];
      }

      const soft: Record<string, number> = {};
      for (const exp of activeFilters.experiences) {
        soft[exp] = 1.0;
      }
      if (activeFilters.companion) {
        soft[`companion:${activeFilters.companion.toLowerCase()}`] = 1.0;
      }
      if (Object.keys(soft).length > 0) {
        payload.soft_preferences = soft;
      }

      const tierSpec = BUDGET_TIER_OPTIONS.find(t => t.value === activeFilters.budgetTier);
      const parsedMin = activeFilters.minPrice.trim() !== '' ? Number(activeFilters.minPrice) : tierSpec?.min;
      const parsedMax = activeFilters.maxPrice.trim() !== '' ? Number(activeFilters.maxPrice) : tierSpec?.max;
      if (parsedMin !== undefined && Number.isFinite(parsedMin) && parsedMin >= 0) {
        payload.min_budget = parsedMin;
      }
      if (parsedMax !== undefined && Number.isFinite(parsedMax) && parsedMax >= 0) {
        payload.max_budget = parsedMax;
      }

      if (activeFilters.minRating) {
        const mr = Number(activeFilters.minRating);
        if (Number.isFinite(mr) && mr >= 1 && mr <= 5) payload.min_rating = mr;
      }

      if (spaceReliability.trusted && (activeFilters.spaceType === 'INDOOR' || activeFilters.spaceType === 'OUTDOOR')) {
        payload.space_type = activeFilters.spaceType;
      }

      if (activeFilters.origin && Number.isFinite(activeFilters.origin.latitude) && Number.isFinite(activeFilters.origin.longitude)) {
        payload.origin = {
          latitude: activeFilters.origin.latitude,
          longitude: activeFilters.origin.longitude,
        };
        if (activeFilters.radiusKm) {
          const km = Number(activeFilters.radiusKm);
          if (Number.isFinite(km) && km > 0) payload.max_distance_km = km;
        }
      }

      if (activeFilters.visitTime) {
        payload.visit_time = activeFilters.visitTime;
        payload.exclude_closed = true;
      }

      return payload;
    },
    [topN, budgetBasis, expandGeoUnitIds, spaceReliability.trusted],
  );

  // Execute real backend ranking with debounce + race-condition cancellation
  const executeRanking = useCallback(async (targetFilters: RecommendationFilterState) => {
    if (!aiEnabled) {
      setServiceDeferred(true);
      setRankingResponse(null);
      setRankingLoading(false);
      return;
    }
    const seq = ++requestSeqRef.current;
    setRankingLoading(true);
    setRankingError('');
    setServiceDeferred(false);

    try {
      const payload = buildRankingPayload(targetFilters);
      const res = await fetchRanking(travel, payload);
      if (seq !== requestSeqRef.current) return;
      setRankingResponse(res);
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      if (err instanceof ApiError && err.status === 503 && err.body.code === 'FEATURE_DEFERRED') {
        setServiceDeferred(true);
        setRankingResponse(null);
      } else {
        setRankingError(
          err instanceof Error
            ? err.message
            : text('Không thể tải bảng xếp hạng từ máy chủ gợi ý.', 'Unable to reach the ranking service.'),
        );
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setRankingLoading(false);
      }
    }
  }, [buildRankingPayload, travel, text]);

  // Debounce backend ranking calls when filters/options change
  useEffect(() => {
    syncNonSensitiveFiltersToUrl(filters);
    if (!aiEnabled) {
      setServiceDeferred(true);
      setRankingLoading(false);
      return;
    }
    const minB = filters.minPrice.trim() ? Number(filters.minPrice) : null;
    const maxB = filters.maxPrice.trim() ? Number(filters.maxPrice) : null;
    if (minB !== null && maxB !== null && Number.isFinite(minB) && Number.isFinite(maxB) && minB > maxB) {
      return;
    }
    const timer = window.setTimeout(() => {
      void executeRanking(filters);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [filters, topN, budgetBasis, executeRanking]);

  const catalogById = useMemo(() => {
    const map = new Map<string, Resource>();
    for (const p of catalogPlaces) {
      const id = String(p.place_id ?? p.id ?? '');
      if (id) map.set(id, p);
    }
    return map;
  }, [catalogPlaces]);

  const categoryById = useMemo(() => {
    const map = new Map<string, Resource>();
    for (const c of categories) {
      const id = String(c.category_id ?? c.id ?? '');
      if (id) map.set(id, c);
    }
    return map;
  }, [categories]);

  const rankedPlaces = useMemo<RankedRecommendation[]>(() => {
    if (!rankingResponse?.results) return [];
    return rankingResponse.results.map(item => {
      const catPlace = catalogById.get(item.place_id);
      const fallbackPlace: Resource = {
        place_id: item.place_id,
        name: item.facts.name,
        name_en: item.facts.name_en,
        address: item.facts.address,
        category_ids: item.facts.category_ids,
        geographic_unit_id: item.facts.geographic_unit_id,
        destination_ids: item.facts.destination_ids,
        price_min: item.facts.price_min,
        price_max: item.facts.price_max,
        currency: item.facts.currency,
        rating_avg: item.facts.rating_avg,
        review_count: item.facts.rating_count,
      };
      const mergedPlace: Resource = catPlace
        ? { ...catPlace, place_id: item.place_id }
        : hydratePlaceWithOpenData(fallbackPlace, openDataRef.current);

      const primaryCatId = item.facts.category_ids?.[0] ?? '';
      const catObj = primaryCatId ? categoryById.get(primaryCatId) : undefined;
      const categoryLabel = catObj ? localizedName(catObj, locale) : text('Điểm đến', 'Destination');

      const name = locale === 'en'
        ? (item.facts.name_en || item.facts.name || text('Điểm đến', 'Destination'))
        : (item.facts.name || item.facts.name_en || text('Điểm đến', 'Destination'));

      const reasons = locale === 'en'
        ? (item.explanation?.reasons_en ?? [])
        : (item.explanation?.reasons_vi ?? []);

      return {
        place: mergedPlace,
        placeId: item.place_id,
        rank: item.rank,
        score: 0,
        name,
        address: String(mergedPlace.address ?? item.facts.address ?? ''),
        summary: typeof mergedPlace.description === 'string' ? mergedPlace.description.trim() : '',
        categoryLabel,
        rating: item.facts.rating_avg ?? null,
        reviewCount: item.facts.rating_count ?? 0,
        minPrice: item.facts.price_min ?? null,
        maxPrice: item.facts.price_max ?? null,
        currency: item.facts.currency || 'VND',
        distanceKm: item.facts.distance_km ?? null,
        spaceLabel: item.facts.space_type === 'UNKNOWN' ? '' : item.facts.space_type,
        reasons: reasons.slice(0, 2),
      };
    });
  }, [rankingResponse, catalogById, categoryById, locale, text, openDataVersion]);

  const totalPages = Math.max(1, Math.ceil(rankedPlaces.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedPlaces = useMemo(
    () => rankedPlaces.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [rankedPlaces, safePage],
  );

  // Real viewport impression tracking (IntersectionObserver >= 50% visible for >= 400ms, deduped per request+place)
  const registerCardRef = useCallback((placeId: string, node: HTMLElement | null) => {
    if (node) cardNodesRef.current.set(placeId, node);
    else cardNodesRef.current.delete(placeId);
  }, []);

  useEffect(() => {
    const reqId = rankingResponse?.recommendation_request_id;
    const activeSlice = showMap ? rankedPlaces : pagedPlaces;
    if (!reqId || activeSlice.length === 0 || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const placeId = (entry.target as HTMLElement).dataset.placeId;
          if (!placeId) continue;
          const dedupKey = `${reqId}:${placeId}`;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (sentImpressionsRef.current.has(dedupKey) || dwellTimersRef.current.has(dedupKey)) continue;
            const timer = window.setTimeout(() => {
              dwellTimersRef.current.delete(dedupKey);
              if (sentImpressionsRef.current.has(dedupKey)) return;
              sentImpressionsRef.current.add(dedupKey);
              void sendImpressions(travel, sessionIdRef.current, [{
                idempotency_key: `imp:${reqId}:${placeId}`,
                recommendation_request_id: reqId,
                place_id: placeId,
                viewed_at: new Date().toISOString(),
              }]).catch(() => {
                // Analytics failures never interrupt user browsing
              });
            }, 400);
            dwellTimersRef.current.set(dedupKey, timer);
          } else {
            const pending = dwellTimersRef.current.get(dedupKey);
            if (pending !== undefined) {
              window.clearTimeout(pending);
              dwellTimersRef.current.delete(dedupKey);
            }
          }
        }
      },
      { threshold: 0.5 },
    );

    for (const item of activeSlice) {
      const node = cardNodesRef.current.get(item.placeId);
      if (node) observer.observe(node);
    }

    return () => {
      observer.disconnect();
      for (const t of dwellTimersRef.current.values()) window.clearTimeout(t);
      dwellTimersRef.current.clear();
    };
  }, [rankingResponse?.recommendation_request_id, rankedPlaces, pagedPlaces, showMap, travel]);

  const emitFeedback = useCallback(
    (placeId: string, actionType: 'CLICK' | 'ACCEPT' | 'SKIP' | 'ADD_TO_TRIP_CLICK' | 'FAVORITE_CLICK') => {
      const reqId = rankingResponse?.recommendation_request_id;
      if (!reqId) return;
      void sendRankingFeedback(travel, {
        idempotency_key: `fb:${reqId}:${placeId}:${actionType}:${Date.now()}`,
        recommendation_request_id: reqId,
        place_id: placeId,
        action_type: actionType,
        occurred_at: new Date().toISOString(),
        session_id: sessionIdRef.current,
      }).catch(() => {
        // Never block UI navigation or actions on telemetry failure
      });
    },
    [rankingResponse?.recommendation_request_id, travel],
  );

  const mapPoints = useMemo<MapPoint[]>(
    () =>
      rankedPlaces
        .filter(item => validCoordinates(item.place.latitude, item.place.longitude))
        .map(item => ({
          id: item.placeId,
          name: `${item.rank}. ${item.name}`,
          address: item.address,
          latitude: Number(item.place.latitude),
          longitude: Number(item.place.longitude),
        })),
    [rankedPlaces],
  );

  const scrollToResults = () => {
    const target = document.getElementById('rec-results');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handlePageChange = (page: number) => {
    const next = Math.max(1, Math.min(totalPages, page));
    if (next === safePage) return;
    setCurrentPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleFavorite = async (placeId: string) => {
    if (!isAuthenticated) {
      onNavigate('Tài khoản');
      return;
    }
    const next = !favoriteIds.has(placeId);
    setBusy(true);
    try {
      await travel.mutate('community', `/me/favorites/${placeId}`, {}, next ? 'PUT' : 'DELETE');
      setFavoriteIds(prev => {
        const updated = new Set(prev);
        if (next) updated.add(placeId);
        else updated.delete(placeId);
        return updated;
      });
      if (next) emitFeedback(placeId, 'FAVORITE_CLICK');
    } catch {
      // Failed mutation MUST NOT flip favorite state
    } finally {
      setBusy(false);
    }
  };

  const handleSelectPlace = async (place: Resource) => {
    const id = String(place.place_id ?? place.id ?? '');
    if (!id) return;
    emitFeedback(id, 'CLICK');
    setBusy(true);
    try {
      const full = await travel.place(id);
      const detailImg = typeof full.image_url === 'string' && full.image_url.trim() ? full.image_url : place.image_url;
      setSelectedPlace(
        hydratePlaceWithOpenData(
          {
            ...full,
            image_url: detailImg,
            image_author: full.image_author ?? place.image_author,
            image_license: full.image_license ?? place.image_license,
            commons_url: full.commons_url ?? place.commons_url,
          },
          openDataRef.current,
        ),
      );
    } catch {
      setSelectedPlace(hydratePlaceWithOpenData(place, openDataRef.current));
    } finally {
      setBusy(false);
    }
  };

  const handleOpenAddToTrip = (place: Resource) => {
    const id = String(place.place_id ?? place.id ?? '');
    if (id) emitFeedback(id, 'ADD_TO_TRIP_CLICK');
    setTripTargetPlace(place);
  };

  const handleCardFeedback = (placeId: string, action: 'ACCEPT' | 'SKIP') => {
    setFeedbackSent(prev => ({ ...prev, [placeId]: action }));
    emitFeedback(placeId, action);
  };

  const toggleExperienceChip = (key: ExperienceKey) => {
    setFilters(prev => ({
      ...prev,
      experiences: prev.experiences.includes(key)
        ? prev.experiences.filter(k => k !== key)
        : [...prev.experiences, key],
    }));
  };

  const activeChips: Array<{ id: string; label: string; onRemove: () => void }> = [];
  if (selectedLocationLabel) {
    activeChips.push({
      id: 'location',
      label: selectedLocationLabel,
      onRemove: () => setFilters(prev => ({ ...prev, locationQuery: '', geographicUnitId: '', destinationId: '' })),
    });
  }
  if (filters.categoryId) {
    const cat = categoryById.get(filters.categoryId);
    activeChips.push({
      id: `cat-${filters.categoryId}`,
      label: cat ? localizedName(cat, locale) : filters.categoryId,
      onRemove: () => setFilters(prev => ({ ...prev, categoryId: '' })),
    });
  }
  for (const expKey of filters.experiences) {
    const exp = EXPERIENCE_OPTIONS.find(e => e.key === expKey);
    activeChips.push({
      id: `exp-${expKey}`,
      label: exp ? (locale === 'en' ? exp.en : exp.vi) : expKey,
      onRemove: () => toggleExperienceChip(expKey),
    });
  }
  if (filters.budgetTier) {
    const tier = BUDGET_TIER_OPTIONS.find(b => b.value === filters.budgetTier);
    activeChips.push({
      id: 'budget-tier',
      label: tier ? (locale === 'en' ? tier.en : tier.vi) : filters.budgetTier,
      onRemove: () => setFilters(prev => ({ ...prev, budgetTier: '' })),
    });
  }
  if (filters.minPrice || filters.maxPrice) {
    const lo = filters.minPrice ? formatCurrency(Number(filters.minPrice), 'VND') : '0 ₫';
    const hi = filters.maxPrice ? formatCurrency(Number(filters.maxPrice), 'VND') : '∞';
    activeChips.push({
      id: 'budget-range',
      label: `${lo} – ${hi}`,
      onRemove: () => setFilters(prev => ({ ...prev, minPrice: '', maxPrice: '' })),
    });
  }
  if (filters.visitTime) {
    const slot = VISIT_TIME_SLOTS.find(v => v.value === filters.visitTime);
    activeChips.push({
      id: 'visit-time',
      label: slot ? (locale === 'en' ? slot.en : slot.vi) : filters.visitTime,
      onRemove: () => setFilters(prev => ({ ...prev, visitTime: '' })),
    });
  }
  if (filters.companion) {
    const comp = COMPANION_OPTIONS.find(c => c.value === filters.companion);
    activeChips.push({
      id: 'companion',
      label: comp ? (locale === 'en' ? comp.en : comp.vi) : filters.companion,
      onRemove: () => setFilters(prev => ({ ...prev, companion: '' })),
    });
  }
  if (filters.spaceType && spaceReliability.trusted) {
    activeChips.push({
      id: 'space',
      label: filters.spaceType === 'INDOOR' ? text('Trong nhà', 'Indoor') : text('Ngoài trời', 'Outdoor'),
      onRemove: () => setFilters(prev => ({ ...prev, spaceType: '' })),
    });
  }
  if (filters.minRating) {
    activeChips.push({
      id: 'rating',
      label: `${text('Từ', 'Min')} ${filters.minRating}★`,
      onRemove: () => setFilters(prev => ({ ...prev, minRating: '' })),
    });
  }
  if (filters.origin) {
    activeChips.push({
      id: 'origin',
      label: `${text('Trong', 'Within')} ${filters.radiusKm || '5'} km · ${filters.origin.label}`,
      onRemove: () => setFilters(prev => ({ ...prev, origin: null, radiusKm: '' })),
    });
  }

  const placeCountSummary = rankingStats
    ? rankingStats.published_places_count
    : (!catalogLoading ? catalogPlaces.length : null);

  if (selectedPlace) {
    return (
      <>
        <PlaceDetailPage
          place={selectedPlace}
          travel={travel}
          onBack={() => setSelectedPlace(null)}
          onAddToTrip={place => handleOpenAddToTrip(place)}
          busy={isBusy || rankingLoading}
        />
        <AddToTripModal
          place={tripTargetPlace}
          travel={travel}
          recommendationRequestId={rankingResponse?.recommendation_request_id ?? null}
          onClose={() => setTripTargetPlace(null)}
          onNavigateToAccount={() => onNavigate('Tài khoản')}
          onOpenTrip={() => onNavigate('Chuyến đi')}
        />
      </>
    );
  }

  return (
    <div className="rec-editorial-root">
      {/* Centered Page Title Header (Trevana Clean Directory Header) */}
      <header className="rec-page-header">
        <div className="rec-wrap rec-page-header-inner">
          <h1
            id="rec-hero-heading"
            className="rec-page-title"
            aria-label={text('Gợi ý', 'Recommendations')}
          >
            {selectedLocationLabel
              ? text(
                  `Gợi ý địa điểm tại ${selectedLocationLabel}`,
                  `All ${selectedLocationLabel} Recommendations`,
                )
              : text('Gợi ý địa điểm Việt Nam', 'All Vietnam Recommendations')}
          </h1>
          <p className="rec-page-subtitle">
            {placeCountSummary !== null
              ? text(
                  `Khám phá ${placeCountSummary} địa điểm được xếp hạng theo nhu cầu và hành trình của bạn.`,
                  `Explore ${placeCountSummary} curated places ranked for your itinerary and preferences.`,
                )
              : text(
                  'Khám phá những điểm đến nổi bật được xếp hạng theo nhu cầu và hành trình của bạn.',
                  'Explore curated destinations ranked for your itinerary and preferences.',
                )}
          </p>
        </div>
      </header>

      {/* Main 2-Column Catalog Body */}
      <div className="rec-wrap rec-catalog-shell">
        <RecommendationFilters
          filters={filters}
          budgetBasis={budgetBasis}
          onBudgetBasisChange={setBudgetBasis}
          categories={categories}
          locationOptions={locationOptions}
          spaceReliability={spaceReliability}
          showMap={showMap}
          totalCount={rankedPlaces.length}
          catalogLoading={catalogLoading}
          catalogError={catalogError}
          onToggleMap={() => setShowMap(prev => !prev)}
          onChange={setFilters}
          onReset={() => {
            setFilters(INITIAL_FILTERS);
            setTopN(TOP_N_DEFAULT);
          }}
          onSearchSubmit={scrollToResults}
          externalModalOpen={filterDrawerOpen}
          onExternalModalOpenChange={setFilterDrawerOpen}
        />

        <section className="rec-catalog-main" id="rec-results" aria-label={text('Danh sách gợi ý địa điểm', 'Recommended places')}>
          {activeChips.length > 0 && (
            <div className="rec-active-strip">
              <div className="rec-active-list">
                {activeChips.map(chip => (
                  <span key={chip.id} className="rec-active-tag">
                    <span>{chip.label}</span>
                    <button
                      type="button"
                      onClick={chip.onRemove}
                      aria-label={`${text('Bỏ', 'Remove')} ${chip.label}`}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="rec-clear-all-link"
                onClick={() => {
                  setFilters(INITIAL_FILTERS);
                  setTopN(TOP_N_DEFAULT);
                }}
              >
                {text('Xóa tất cả', 'Clear all')}
              </button>
            </div>
          )}

          {/* Honest degraded / fallback status banner */}
          {rankingResponse && (rankingResponse.fallback || rankingResponse.degraded || rankingResponse.partial) && !rankingLoading && !rankingError && (
            <div className="rec-status-banner" role="status">
              <Icon name="alert" size={16} />
              <span>
                {rankingResponse.fallback
                  ? text(
                      'Đang hiển thị chế độ khám phá công khai ổn định do chưa đủ tín hiệu xếp hạng chi tiết cho truy vấn này.',
                      'Showing stable public discovery order because detailed ranking signals are currently unavailable for this query.',
                    )
                  : rankingResponse.partial
                    ? text(
                        `Chỉ hiển thị ${rankingResponse.total_returned} địa điểm đã qua xác minh công khai ở thời điểm hiện tại.`,
                        `Showing ${rankingResponse.total_returned} verified public places currently available.`,
                      )
                    : text(
                        'Một số tín hiệu xếp hạng tạm thời không khả dụng; hệ thống đã tự động cân bằng trên các thành phần còn lại.',
                        'Some ranking signals are temporarily unavailable; scores were rebalanced across available components.',
                      )}
              </span>
            </div>
          )}

          {serviceDeferred ? (
            <EmptyState
              title={text('Dịch vụ gợi ý đang tạm tắt', 'Recommendations are currently paused')}
              description={text(
                'Tính năng xếp hạng gợi ý đang tạm tắt (VITE_AI_ENABLED=false trên frontend hoặc AI_ENABLED=false trên Gateway). Hãy bật AI_ENABLED=true trên Gateway và bỏ VITE_AI_ENABLED=false để sử dụng.',
                'Recommendation ranking is currently paused (VITE_AI_ENABLED=false on frontend or AI_ENABLED=false on Gateway).',
              )}
              action={
                <button
                  type="button"
                  className="rec-btn-primary"
                  onClick={() => onNavigate('Khám phá')}
                >
                  {text('Khám phá danh mục điểm đến', 'Browse destinations')}
                </button>
              }
            />
          ) : rankingError ? (
            <ErrorState message={rankingError} onRetry={() => void executeRanking(filters)} />
          ) : rankingLoading ? (
            <div className="rec-tour-skeleton-grid" aria-busy="true" aria-label={text('Đang tải danh sách gợi ý', 'Loading recommendations')}>
              {Array.from({ length: 8 }, (_, idx) => (
                <div key={idx} className="rec-tour-skeleton-card">
                  <div className="rec-tour-skeleton-media" />
                  <div className="rec-tour-skeleton-line is-short" />
                  <div className="rec-tour-skeleton-line" />
                  <div className="rec-tour-skeleton-line is-price" />
                </div>
              ))}
            </div>
          ) : rankedPlaces.length === 0 ? (
            <EmptyState
              title={text('Không có địa điểm phù hợp bộ lọc bắt buộc hiện tại', 'No destinations match the current hard filters')}
              description={text(
                'Hệ thống không tự động nới lỏng điều kiện bắt buộc. Hãy thử mở rộng phạm vi địa bàn, bán kính khoảng cách hoặc ngân sách tối đa.',
                'Hard constraints are never silently relaxed. Try broadening the destination scope, distance radius, or maximum budget.',
              )}
              action={
                <button
                  type="button"
                  className="rec-btn-primary"
                  onClick={() => setFilters(INITIAL_FILTERS)}
                >
                  {text('Xóa bộ lọc để xem lại', 'Reset filters')}
                </button>
              }
            />
          ) : showMap ? (
            /* Split Map View */
            <div className="rec-map-split">
              <div className="rec-map-list">
                {rankedPlaces.map(item => (
                  <div
                    key={item.placeId}
                    data-place-id={item.placeId}
                    ref={node => registerCardRef(item.placeId, node)}
                  >
                    <RecommendationCard
                      item={item}
                      variant="compact"
                      isFavorite={favoriteIds.has(item.placeId)}
                      isHighlighted={highlightedPlaceId === item.placeId}
                      feedbackState={feedbackSent[item.placeId]}
                      busy={isBusy}
                      onSelect={place => void handleSelectPlace(place)}
                      onToggleFavorite={id => void handleToggleFavorite(id)}
                      onAddToTrip={place => handleOpenAddToTrip(place)}
                      onFeedback={handleCardFeedback}
                      onHover={id => setHighlightedPlaceId(id ?? '')}
                    />
                  </div>
                ))}
              </div>

              <aside className="rec-map-dock" aria-label={text('Bản đồ địa điểm được xếp hạng', 'Map of ranked places')}>
                <div className="rec-map-dock-header">
                  <span>
                    <Icon name="map" size={15} />
                    {text(`Bản đồ ${mapPoints.length} điểm có tọa độ`, `Map of ${mapPoints.length} geocoded places`)}
                  </span>
                  <button
                    type="button"
                    className="rec-link-btn"
                    onClick={() => setShowMap(false)}
                  >
                    {text('Đóng bản đồ', 'Close map')}
                  </button>
                </div>
                <InteractiveMap
                  points={mapPoints}
                  selectedId={highlightedPlaceId}
                  onSelect={id => {
                    setHighlightedPlaceId(id);
                    const found = rankedPlaces.find(r => r.placeId === id);
                    if (found) void handleSelectPlace(found.place);
                  }}
                />
              </aside>
            </div>
          ) : (
            /* 4-Column Borderless Photo-First Grid (strictly preserving backend rank order) */
            <>
              <div className="rec-tour-grid">
                {pagedPlaces.map(item => (
                  <div
                    key={item.placeId}
                    className="rec-tour-cell"
                    data-place-id={item.placeId}
                    ref={node => registerCardRef(item.placeId, node)}
                  >
                    <RecommendationCard
                      item={item}
                      variant="catalog"
                      isFavorite={favoriteIds.has(item.placeId)}
                      isHighlighted={highlightedPlaceId === item.placeId}
                      feedbackState={feedbackSent[item.placeId]}
                      busy={isBusy}
                      onSelect={place => void handleSelectPlace(place)}
                      onToggleFavorite={id => void handleToggleFavorite(id)}
                      onAddToTrip={place => handleOpenAddToTrip(place)}
                      onFeedback={handleCardFeedback}
                      onHover={id => setHighlightedPlaceId(id ?? '')}
                    />
                  </div>
                ))}
              </div>

              {/* Centered Circular Pagination */}
              {totalPages > 1 && (
                <nav className="rec-pagination" aria-label={text('Phân trang kết quả', 'Results pagination')}>
                  <button
                    type="button"
                    className="rec-page-btn is-arrow"
                    disabled={safePage <= 1}
                    onClick={() => handlePageChange(safePage - 1)}
                    aria-label={text('Trang trước', 'Previous page')}
                  >
                    <Icon name="arrowLeft" size={14} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      type="button"
                      className={`rec-page-btn ${safePage === page ? 'is-active' : ''}`}
                      onClick={() => handlePageChange(page)}
                      aria-current={safePage === page ? 'page' : undefined}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="rec-page-btn is-arrow"
                    disabled={safePage >= totalPages}
                    onClick={() => handlePageChange(safePage + 1)}
                    aria-label={text('Trang sau', 'Next page')}
                  >
                    <Icon name="arrow" size={14} />
                  </button>
                </nav>
              )}

              {rankingResponse && rankingResponse.candidate_count > rankedPlaces.length && topN < 50 && safePage === totalPages && (
                <div className="rec-load-more">
                  <button
                    type="button"
                    className="rec-btn-secondary"
                    onClick={() => setTopN(current => Math.min(50, current + 16))}
                  >
                    <span>{text('Tải thêm kết quả xếp hạng (tối đa 50)', 'Load more ranked results (up to 50)')}</span>
                    <Icon name="chevronDown" size={15} />
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Add to Trip Modal with recommendation_request_id attribution */}
      <AddToTripModal
        place={tripTargetPlace}
        travel={travel}
        recommendationRequestId={rankingResponse?.recommendation_request_id ?? null}
        onClose={() => setTripTargetPlace(null)}
        onNavigateToAccount={() => onNavigate('Tài khoản')}
        onOpenTrip={() => onNavigate('Chuyến đi')}
      />
    </div>
  );
}
