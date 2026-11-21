import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppPreferences } from '../../app/providers/AppPreferences';
import { useAuth } from '../../app/providers/AuthProvider';
import { ApiError, type Resource, type TravelClient } from '../../shared/api';
import { EmptyState, ErrorState, Icon } from '../../shared/ui';
import { InteractiveMap, validCoordinates, type MapPoint } from '../places/InteractiveMap';
import { PlaceDetailPage } from '../places/PlaceDetailPage';
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
  INITIAL_FILTERS,
  assessSpaceReliability,
  buildLocationOptions,
  isTestFixture,
  localizedName,
  normalizeText,
  type ExperienceKey,
  type LocationOption,
  type RankedRecommendation,
  type RecommendationFilterState,
} from './recommendation-engine';
import './recommendations.css';

export interface RecommendationSectionProps {
  travel: TravelClient;
  onNavigate: (section: string) => void;
  busy?: boolean;
}

interface EditorialChapter {
  id: string;
  number: string;
  image: string;
  titleVi: string;
  titleEn: string;
  summaryVi: string;
  summaryEn: string;
  actionVi: string;
  actionEn: string;
  patch: Partial<RecommendationFilterState>;
}

const EDITORIAL_CHAPTERS: EditorialChapter[] = [
  {
    id: 'heritage',
    number: '01',
    image: '/images/editorial/hue.webp',
    titleVi: 'Di sản & Kiến trúc cổ',
    titleEn: 'Heritage & Architecture',
    summaryVi: 'Ưu tiên xếp hạng các công trình lịch sử, bảo tàng và dấu ấn văn hóa dọc theo hành trình.',
    summaryEn: 'Prioritize historic landmarks, museums, and architectural heritage across the catalog.',
    actionVi: 'Xếp hạng theo di sản',
    actionEn: 'Rank by heritage',
    patch: { experiences: ['heritage' as ExperienceKey], locationQuery: '', geographicUnitId: '', destinationId: '' },
  },
  {
    id: 'coastal',
    number: '02',
    image: '/images/editorial/da-nang.webp',
    titleVi: 'Gió biển miền Trung',
    titleEn: 'Central Coast & Sea Views',
    summaryVi: 'Tập trung các điểm dừng chân tại Đà Nẵng với ưu tiên hướng biển và khung giờ hoàng hôn.',
    summaryEn: 'Focus recommendations around Da Nang with coastal views and sunset signals.',
    actionVi: 'Khám phá Đà Nẵng',
    actionEn: 'Explore Da Nang',
    patch: { locationQuery: 'Đà Nẵng', geographicUnitId: '', destinationId: '', experiences: ['sea_view' as ExperienceKey] },
  },
  {
    id: 'culinary',
    number: '03',
    image: '/images/editorial/ho-chi-minh.webp',
    titleVi: 'Nhịp sống & Ẩm thực bản địa',
    titleEn: 'Urban Pulse & Street Food',
    summaryVi: 'Từ quán ăn địa phương đến không gian cà phê tại Thành phố Hồ Chí Minh được cộng đồng đánh giá cao.',
    summaryEn: 'From local eateries to neighborhood cafes in Ho Chi Minh City ranked for culinary discovery.',
    actionVi: 'Lọc ẩm thực TP.HCM',
    actionEn: 'Explore HCMC food',
    patch: { locationQuery: 'Thành phố Hồ Chí Minh', geographicUnitId: '', destinationId: '', experiences: ['street_food' as ExperienceKey] },
  },
  {
    id: 'nature',
    number: '04',
    image: '/images/editorial/ninh-binh.webp',
    titleVi: 'Thiên nhiên & Góc yên tĩnh',
    titleEn: 'Mountains & Quiet Escapes',
    summaryVi: 'Tìm những khoảng lặng giữa thiên nhiên, công viên xanh và điểm ngắm cảnh thư thái.',
    summaryEn: 'Surface peaceful outdoor spots, scenic parks, and mountain retreats.',
    actionVi: 'Ưu tiên yên tĩnh',
    actionEn: 'Rank for quiet',
    patch: { experiences: ['quiet' as ExperienceKey, 'mountain' as ExperienceKey], locationQuery: '', geographicUnitId: '', destinationId: '' },
  },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_EXPERIENCES = new Set<string>(['sea_view', 'mountain', 'quiet', 'sunset', 'street_food', 'heritage']);
const VALID_BUDGET_TIERS = new Set<string>(['FREE', 'BUDGET', 'MID', 'HIGH']);
const VALID_VISIT_TIMES = new Set<string>(['MORNING', 'NOON', 'AFTERNOON', 'EVENING']);
const VALID_COMPANIONS = new Set<string>(['SOLO', 'COUPLE', 'FAMILY', 'FRIENDS']);
const VALID_RATINGS = new Set<string>(['3', '3.5', '4', '4.5']);
const TOP_N_DEFAULT = 24;

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
  const { locale, text } = useAppPreferences();
  const { isAuthenticated } = useAuth();

  // Canonical reference data from Catalog (used for autocomplete, category tabs, photo/detail hydration)
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
  const [rankingLoading, setRankingLoading] = useState(true);
  const [rankingError, setRankingError] = useState('');
  const [serviceDeferred, setServiceDeferred] = useState(false);

  // User state
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [feedbackSent, setFeedbackSent] = useState<Record<string, 'ACCEPT' | 'SKIP'>>({});

  // UI state
  const [filters, setFilters] = useState<RecommendationFilterState>(() => readInitialFiltersFromUrl());
  const [budgetBasis, setBudgetBasis] = useState<'PER_PERSON' | 'PER_VISIT' | 'OFFERING'>('PER_PERSON');
  const [topN, setTopN] = useState(TOP_N_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [highlightedPlaceId, setHighlightedPlaceId] = useState<string>('');
  const [selectedPlace, setSelectedPlace] = useState<Resource | null>(null);
  const [tripTargetPlace, setTripTargetPlace] = useState<Resource | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState<string>(EDITORIAL_CHAPTERS[0].id);

  // Hero inline autocomplete state
  const [heroLocOpen, setHeroLocOpen] = useState(false);
  const heroSearchRef = useRef<HTMLDivElement>(null);

  // Race-condition protection + pseudonymous analytics session + impression deduplication
  const requestSeqRef = useRef(0);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const sentImpressionsRef = useRef<Set<string>>(new Set());
  const cardNodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const dwellTimersRef = useRef<Map<string, number>>(new Map());

  const isBusy = busy || externalBusy;

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (heroSearchRef.current && !heroSearchRef.current.contains(event.target as Node)) {
        setHeroLocOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Load canonical Catalog metadata & real backend stats
  const loadMetadata = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const [placesRes, catsRes, tagsRes, geoRes, destRes, statsRes] = await Promise.all([
        travel.readAll('catalog', '/places').catch(() => ({ items: [] as Resource[] })),
        travel.readAll('catalog', '/categories').catch(() => ({ items: [] as Resource[] })),
        travel.readAll('catalog', '/tags').catch(() => ({ items: [] as Resource[] })),
        travel.readAll('catalog', '/geographic-units').catch(() => ({ items: [] as Resource[] })),
        travel.readAll('catalog', '/destinations').catch(() => ({ items: [] as Resource[] })),
        fetchRankingStats(travel).catch(() => null),
      ]);

      setCatalogPlaces((placesRes.items ?? []).filter(p => !isTestFixture(p)));
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

  const heroLocationSuggestions = useMemo(() => {
    const q = normalizeText(filters.locationQuery);
    if (!q) return locationOptions.slice(0, 8);
    return locationOptions.filter(opt => opt.searchText.includes(q)).slice(0, 8);
  }, [filters.locationQuery, locationOptions]);

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

      // Structured soft preferences (experience tags + companion tags)
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

      // Hard per-place budget bounds (unknown price excluded by backend default policy)
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

      // Origin & hard distance radius (NEVER apply distance filter without valid origin)
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
    const seq = ++requestSeqRef.current;
    setRankingLoading(true);
    setRankingError('');
    setServiceDeferred(false);

    try {
      const payload = buildRankingPayload(targetFilters);
      const res = await fetchRanking(travel, payload);
      if (seq !== requestSeqRef.current) return; // Ignore stale response
      setRankingResponse(res);
    } catch (err) {
      if (seq !== requestSeqRef.current) return; // Ignore stale error
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

  // Debounce backend ranking calls when filters/options change (prevents request storms)
  useEffect(() => {
    syncNonSensitiveFiltersToUrl(filters);
    // Validate budget range before hitting backend
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

  // Hydrate backend ranked items with Catalog presentation fields (strictly keeping backend order!)
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
      const mergedPlace: Resource = catPlace
        ? { ...catPlace, place_id: item.place_id }
        : {
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
        score: 0, // Never display raw technical score or "% match" to regular users
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
  }, [rankingResponse, catalogById, categoryById, locale, text]);

  // Real viewport impression tracking (IntersectionObserver >= 50% visible for >= 400ms, deduped per request+place)
  const registerCardRef = useCallback((placeId: string, node: HTMLElement | null) => {
    if (node) cardNodesRef.current.set(placeId, node);
    else cardNodesRef.current.delete(placeId);
  }, []);

  useEffect(() => {
    const reqId = rankingResponse?.recommendation_request_id;
    if (!reqId || rankedPlaces.length === 0 || typeof IntersectionObserver === 'undefined') return;

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

    for (const item of rankedPlaces) {
      const node = cardNodesRef.current.get(item.placeId);
      if (node) observer.observe(node);
    }

    return () => {
      observer.disconnect();
      for (const t of dwellTimersRef.current.values()) window.clearTimeout(t);
      dwellTimersRef.current.clear();
    };
  }, [rankingResponse?.recommendation_request_id, rankedPlaces, travel]);

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

  const leadItem = !showMap && rankedPlaces.length > 0 ? rankedPlaces[0] : null;
  const featuredItems = !showMap && rankedPlaces.length > 1 ? rankedPlaces.slice(1, 3) : [];
  const dispatchItems = !showMap && rankedPlaces.length > 3 ? rankedPlaces.slice(3) : [];

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

  const activeChapter = useMemo(
    () => EDITORIAL_CHAPTERS.find(c => c.id === activeChapterId) ?? EDITORIAL_CHAPTERS[0],
    [activeChapterId],
  );

  const scrollToResults = () => {
    const target = document.getElementById('rec-results');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleHeroLocationSelect = (opt: LocationOption) => {
    const next: RecommendationFilterState = {
      ...filters,
      locationQuery: opt.label,
      geographicUnitId: opt.kind === 'geo' ? opt.id : '',
      destinationId: opt.kind === 'destination' ? opt.id : '',
    };
    setFilters(next);
    setHeroLocOpen(false);
    scrollToResults();
  };

  const handleHeroSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setHeroLocOpen(false);
    // If user typed exact name/alias without clicking dropdown, resolve canonical match cleanly
    if (filters.locationQuery.trim() && !filters.destinationId && !filters.geographicUnitId) {
      const q = normalizeText(filters.locationQuery);
      const exact = locationOptions.find(opt => opt.searchText.includes(q));
      if (exact) {
        setFilters(prev => ({
          ...prev,
          locationQuery: exact.label,
          geographicUnitId: exact.kind === 'geo' ? exact.id : '',
          destinationId: exact.kind === 'destination' ? exact.id : '',
        }));
      }
    }
    scrollToResults();
  };

  const handleApplyChapter = (chapter: EditorialChapter) => {
    setActiveChapterId(chapter.id);
    let resolvedGeoId = '';
    let resolvedDestId = '';
    if (chapter.patch.locationQuery) {
      const q = normalizeText(chapter.patch.locationQuery);
      const match = locationOptions.find(opt => opt.searchText.includes(q));
      if (match) {
        resolvedGeoId = match.kind === 'geo' ? match.id : '';
        resolvedDestId = match.kind === 'destination' ? match.id : '';
      }
    }
    setFilters(prev => ({
      ...INITIAL_FILTERS,
      ...chapter.patch,
      geographicUnitId: resolvedGeoId,
      destinationId: resolvedDestId,
      origin: prev.origin,
      radiusKm: prev.radiusKm,
    }));
    scrollToResults();
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
      // Only update UI state & record attribution AFTER owner mutation succeeds
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
      setSelectedPlace(full);
    } catch {
      setSelectedPlace(place);
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

  // Real statistics from backend stats endpoint (or real Catalog counts; NEVER hardcoded 200/4/5)
  const heroPlaceCount = rankingStats
    ? rankingStats.published_places_count
    : (!catalogLoading ? catalogPlaces.length : null);
  const heroDestCount = rankingStats
    ? (rankingStats.destinations_count || rankingStats.geographic_units_count)
    : (!catalogLoading ? destinations.length : null);
  const heroCategoryCount = rankingStats
    ? rankingStats.categories_count
    : (!catalogLoading ? categories.length : null);

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
      {/* ── Band 1: Full-Bleed Editorial Photo Hero ── */}
      <section className="rec-hero" aria-labelledby="rec-hero-heading">
        <div className="rec-hero-backdrop">
          <img
            src="/images/editorial/ha-long.webp"
            alt={text('Vịnh Hạ Long trong sương sớm Việt Nam', 'Misty limestone peaks of Ha Long Bay, Vietnam')}
            width={1600}
            height={1067}
            fetchPriority="high"
            loading="eager"
            decoding="async"
            className="rec-hero-photo"
          />
        </div>

        <div className="rec-wrap rec-hero-grid">
          <div className="rec-hero-folio">
            <span className="rec-hero-eyebrow">
              {text('CẨM NANG GỢI Ý · SMARTTRAVEL', 'CURATED DISCOVERY · SMARTTRAVEL')}
            </span>

            <h1
              id="rec-hero-heading"
              className="rec-hero-title"
              aria-label={text('Gợi ý', 'Recommendations')}
            >
              {text('Những điểm đến xứng đáng cho hành trình tới.', 'Places worth the journey, ranked for you.')}
            </h1>

            <p className="rec-hero-lead">
              {text(
                'Lọc chính xác theo địa bàn, loại hình và ngân sách, đồng thời xếp hạng theo trải nghiệm bạn tìm kiếm.',
                'Filter by city, category, and budget while ranking destinations by the atmosphere you want next.',
              )}
            </p>

            {/* Integrated Hero Discovery Entry */}
            <form className="rec-hero-search" onSubmit={handleHeroSubmit}>
              <div className="rec-hero-input-wrap" ref={heroSearchRef}>
                <Icon name="search" size={16} className="rec-hero-search-icon" />
                <input
                  type="text"
                  className="rec-hero-input"
                  value={filters.locationQuery}
                  onFocus={() => setHeroLocOpen(true)}
                  onChange={e => {
                    // Typing after selection IMMEDIATELY clears canonical IDs so stale IDs are never kept
                    setFilters(prev => ({
                      ...prev,
                      locationQuery: e.target.value,
                      geographicUnitId: '',
                      destinationId: '',
                    }));
                    setHeroLocOpen(true);
                  }}
                  placeholder={text('Bạn muốn đi đâu? (Hà Nội, Đà Nẵng, TP.HCM...)', 'Where to next? (Hanoi, Da Nang, HCMC...)')}
                  aria-label={text('Nhập thành phố hoặc điểm đến', 'Enter city or destination')}
                  autoComplete="off"
                />
                {filters.locationQuery && (
                  <button
                    type="button"
                    className="rec-inline-clear"
                    onClick={() =>
                      setFilters(prev => ({
                        ...prev,
                        locationQuery: '',
                        geographicUnitId: '',
                        destinationId: '',
                      }))
                    }
                    aria-label={text('Xóa từ khóa', 'Clear search')}
                  >
                    <Icon name="x" size={14} />
                  </button>
                )}

                {heroLocOpen && (
                  <div className="rec-loc-popover" role="listbox" aria-label={text('Điểm đến gợi ý', 'Suggested destinations')}>
                    {catalogLoading ? (
                      <div className="rec-loc-state">{text('Đang tải danh sách điểm đến…', 'Loading destinations…')}</div>
                    ) : catalogError ? (
                      <div className="rec-loc-state">{catalogError}</div>
                    ) : heroLocationSuggestions.length === 0 ? (
                      <div className="rec-loc-state">{text('Không tìm thấy địa bàn phù hợp.', 'No matching destination found.')}</div>
                    ) : (
                      heroLocationSuggestions.map(opt => {
                        const isSel =
                          (opt.kind === 'geo' && opt.id === filters.geographicUnitId) ||
                          (opt.kind === 'destination' && opt.id === filters.destinationId);
                        return (
                          <button
                            key={`${opt.kind}-${opt.id}`}
                            type="button"
                            role="option"
                            aria-selected={isSel}
                            className={`rec-loc-option ${isSel ? 'is-selected' : ''}`}
                            onClick={() => handleHeroLocationSelect(opt)}
                          >
                            <Icon name="pin" size={14} />
                            <span className="rec-loc-option-text">
                              <strong>{opt.label}</strong>
                              {opt.countryLabel && <small>{opt.countryLabel}</small>}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <button type="submit" className="rec-btn-primary rec-hero-submit">
                <span>{text('Khám phá bảng xếp hạng', 'Explore rankings')}</span>
                <Icon name="arrow" size={15} />
              </button>
            </form>

            {/* Real Scoped Catalog Facts (no hardcoded fake counts) */}
            <dl className="rec-hero-facts">
              <div className="rec-fact-item">
                <dt>{text('Địa điểm công khai', 'Published places')}</dt>
                <dd>{heroPlaceCount === null ? '—' : heroPlaceCount}</dd>
              </div>
              <div className="rec-fact-item">
                <dt>{text('Điểm đến', 'Destinations')}</dt>
                <dd>{heroDestCount === null ? '—' : heroDestCount}</dd>
              </div>
              <div className="rec-fact-item">
                <dt>{text('Danh mục', 'Categories')}</dt>
                <dd>{heroCategoryCount === null ? '—' : heroCategoryCount}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* ── Band 2: Lightweight Contextual Discovery Ribbon ── */}
      <section className="rec-discovery-band" aria-label={text('Bộ lọc và xếp hạng điểm đến', 'Destination filters and ranking')}>
        <div className="rec-wrap">
          <RecommendationFilters
            filters={filters}
            budgetBasis={budgetBasis}
            onBudgetBasisChange={setBudgetBasis}
            categories={categories}
            locationOptions={locationOptions}
            spaceReliability={spaceReliability}
            showMap={showMap}
            totalCount={rankedPlaces.length}
            onToggleMap={() => setShowMap(prev => !prev)}
            onChange={setFilters}
            onReset={() => {
              setFilters(INITIAL_FILTERS);
              setTopN(TOP_N_DEFAULT);
            }}
            externalModalOpen={filterDrawerOpen}
            onExternalModalOpenChange={setFilterDrawerOpen}
          />
        </div>
      </section>

      {/* ── Band 3: Tiered Editorial Destination Rankings ── */}
      <section className="rec-results-band" id="rec-results" aria-labelledby="rec-results-heading">
        <div className="rec-wrap">
          <div className="rec-section-head">
            <div>
              <span className="rec-section-eyebrow">
                {rankingResponse?.personalized
                  ? text('BẢNG XẾP HẠNG CÁ NHÂN HÓA', 'PERSONALIZED RANKING')
                  : text('BẢNG XẾP HẠNG ĐỀ XUẤT', 'RANKED DISPATCH')}
              </span>
              <h2 id="rec-results-heading" className="rec-section-title">
                {selectedLocationLabel
                  ? text(
                      `Điểm đến nổi bật tại ${selectedLocationLabel}`,
                      `Top ranked in ${selectedLocationLabel}`,
                    )
                  : text('Tuyển chọn theo thứ tự phù hợp', 'Curated in order of fit')}
              </h2>
            </div>
            <p className="rec-section-note">
              {text(
                'Sắp xếp trực tiếp từ hệ thống xếp hạng theo đánh giá đã duyệt, tiêu chí ưu tiên và bối cảnh của bạn.',
                'Ordered directly by the ranking backend using verified ratings, selected preferences, and context.',
              )}
            </p>
          </div>

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
            <ErrorState
              message={text(
                'Dịch vụ xếp hạng gợi ý đang tạm tắt trên Gateway (FEATURE_DEFERRED). Hãy bật AI_ENABLED=true trên Gateway để kích hoạt.',
                'The recommendation ranking service is currently disabled on the Gateway (FEATURE_DEFERRED).',
              )}
              onRetry={() => void executeRanking(filters)}
            />
          ) : rankingError ? (
            <ErrorState message={rankingError} onRetry={() => void executeRanking(filters)} />
          ) : rankingLoading ? (
            <div className="rec-skeleton-stage" aria-busy="true" aria-label={text('Đang tải danh sách gợi ý', 'Loading recommendations')}>
              <div className="rec-skeleton-lead" />
              <div className="rec-skeleton-pair">
                <div className="rec-skeleton-block" />
                <div className="rec-skeleton-block" />
              </div>
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
            /* Tiered Editorial Showcase — strictly preserving backend rank order */
            <div className="rec-editorial-showcase">
              {leadItem && (
                <div
                  className="rec-tier-lead"
                  data-place-id={leadItem.placeId}
                  ref={node => registerCardRef(leadItem.placeId, node)}
                >
                  <RecommendationCard
                    item={leadItem}
                    variant="lead"
                    isFavorite={favoriteIds.has(leadItem.placeId)}
                    isHighlighted={highlightedPlaceId === leadItem.placeId}
                    feedbackState={feedbackSent[leadItem.placeId]}
                    busy={isBusy}
                    onSelect={place => void handleSelectPlace(place)}
                    onToggleFavorite={id => void handleToggleFavorite(id)}
                    onAddToTrip={place => handleOpenAddToTrip(place)}
                    onFeedback={handleCardFeedback}
                    onHover={id => setHighlightedPlaceId(id ?? '')}
                  />
                </div>
              )}

              {featuredItems.length > 0 && (
                <div className="rec-tier-pair">
                  {featuredItems.map(item => (
                    <div
                      key={item.placeId}
                      data-place-id={item.placeId}
                      ref={node => registerCardRef(item.placeId, node)}
                    >
                      <RecommendationCard
                        item={item}
                        variant="featured"
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
              )}

              {dispatchItems.length > 0 && (
                <div className="rec-tier-dispatch">
                  <div className="rec-dispatch-head">
                    <span>{text('DANH SÁCH XẾP HẠNG TIẾP THEO', 'CONTINUED RANKINGS')}</span>
                    <span className="rec-dispatch-range">
                      {text(
                        `Hạng #4 – #${rankedPlaces.length} (trong ${rankingResponse?.candidate_count ?? rankedPlaces.length} ứng viên hợp lệ)`,
                        `Ranks #4 – #${rankedPlaces.length} (of ${rankingResponse?.candidate_count ?? rankedPlaces.length} eligible candidates)`,
                      )}
                    </span>
                  </div>
                  <div className="rec-dispatch-list">
                    {dispatchItems.map(item => (
                      <div
                        key={item.placeId}
                        data-place-id={item.placeId}
                        ref={node => registerCardRef(item.placeId, node)}
                      >
                        <RecommendationCard
                          item={item}
                          variant="dispatch"
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
                </div>
              )}

              {rankingResponse && rankingResponse.candidate_count > rankedPlaces.length && topN < 50 && (
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
            </div>
          )}
        </div>
      </section>

      {/* ── Band 4: Regional Editorial Photo Chapters ── */}
      <section className="rec-chapters-band" aria-labelledby="rec-chapters-heading">
        <div className="rec-wrap">
          <div className="rec-section-head">
            <div>
              <span className="rec-section-eyebrow">
                {text('GỢI Ý THEO CHỦ ĐỀ HÀNH TRÌNH', 'CURATED JOURNEY THEMES')}
              </span>
              <h2 id="rec-chapters-heading" className="rec-section-title">
                {text('Bốn nhịp điệu để bắt đầu khám phá', 'Four ways to start exploring')}
              </h2>
            </div>
            <p className="rec-section-note">
              {text(
                'Chọn một sắc thái hành trình để áp dụng nhanh bộ tiêu chí xếp hạng phù hợp.',
                'Select a travel rhythm to apply its matching filter and ranking signals immediately.',
              )}
            </p>
          </div>

          <div className="rec-chapters-grid">
            <div className="rec-chapters-list" role="tablist" aria-label={text('Chủ đề khám phá', 'Discovery themes')}>
              {EDITORIAL_CHAPTERS.map(chapter => {
                const isSelected = chapter.id === activeChapter.id;
                return (
                  <div
                    key={chapter.id}
                    className={`rec-chapter-row ${isSelected ? 'is-active' : ''}`}
                    onMouseEnter={() => setActiveChapterId(chapter.id)}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      className="rec-chapter-trigger"
                      onClick={() => setActiveChapterId(chapter.id)}
                    >
                      <span className="rec-chapter-num">{chapter.number}</span>
                      <span className="rec-chapter-copy">
                        <strong>{locale === 'en' ? chapter.titleEn : chapter.titleVi}</strong>
                        <span className="rec-chapter-desc">
                          {locale === 'en' ? chapter.summaryEn : chapter.summaryVi}
                        </span>
                      </span>
                    </button>
                    {isSelected && (
                      <button
                        type="button"
                        className="rec-chapter-apply"
                        onClick={() => handleApplyChapter(chapter)}
                      >
                        <span>{locale === 'en' ? chapter.actionEn : chapter.actionVi}</span>
                        <Icon name="arrow" size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="rec-chapter-stage">
              <img
                key={activeChapter.id}
                src={activeChapter.image}
                alt={locale === 'en' ? activeChapter.titleEn : activeChapter.titleVi}
                width={1200}
                height={900}
                loading="lazy"
                decoding="async"
                className="rec-chapter-photo"
              />
            </div>
          </div>
        </div>
      </section>

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
