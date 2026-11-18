import type { Resource } from '../../shared/api';
import type { AppLocale } from '../../app/providers/AppPreferences';
import { validCoordinates } from '../places/InteractiveMap';
import { placeIdOf } from '../places/media';

export type BudgetTier = '' | 'FREE' | 'BUDGET' | 'MID' | 'HIGH';
export type VisitTimeSlot = '' | 'MORNING' | 'NOON' | 'AFTERNOON' | 'EVENING';
export type CompanionType = '' | 'SOLO' | 'COUPLE' | 'FAMILY' | 'FRIENDS';
export type SpaceType = '' | 'INDOOR' | 'OUTDOOR' | 'BOTH';
export type MinRatingOption = '' | '3' | '3.5' | '4' | '4.5';
export type ExperienceKey =
  | 'sea_view'
  | 'mountain'
  | 'quiet'
  | 'sunset'
  | 'street_food'
  | 'heritage';

export interface OriginLocation {
  label: string;
  latitude: number;
  longitude: number;
  source: 'geolocation' | 'geocoder' | 'city';
}

export interface RecommendationFilterState {
  locationQuery: string;
  geographicUnitId: string;
  destinationId: string;
  categoryId: string;
  experiences: ExperienceKey[];
  budgetTier: BudgetTier;
  minPrice: string;
  maxPrice: string;
  visitTime: VisitTimeSlot;
  companion: CompanionType;
  spaceType: SpaceType;
  minRating: MinRatingOption;
  origin: OriginLocation | null;
  radiusKm: string;
}

export const INITIAL_FILTERS: RecommendationFilterState = {
  locationQuery: '',
  geographicUnitId: '',
  destinationId: '',
  categoryId: '',
  experiences: [],
  budgetTier: '',
  minPrice: '',
  maxPrice: '',
  visitTime: '',
  companion: '',
  spaceType: '',
  minRating: '',
  origin: null,
  radiusKm: '',
};

export interface LocationOption {
  id: string;
  kind: 'geo' | 'destination';
  label: string;
  countryLabel: string;
  searchText: string;
  latitude?: number;
  longitude?: number;
}

export interface SpaceReliability {
  trusted: boolean;
  coveredCount: number;
  totalCount: number;
}

export interface RankedRecommendation {
  place: Resource;
  placeId: string;
  rank: number;
  score: number;
  name: string;
  address: string;
  summary: string;
  categoryLabel: string;
  rating: number | null;
  reviewCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string;
  distanceKm: number | null;
  spaceLabel: SpaceType;
  reasons: string[];
}

export const MIN_RATING_OPTIONS: ReadonlyArray<{ value: MinRatingOption; vi: string; en: string }> = [
  { value: '', vi: 'Tất cả', en: 'Any' },
  { value: '3', vi: '3.0+ sao', en: '3.0+ stars' },
  { value: '3.5', vi: '3.5+ sao', en: '3.5+ stars' },
  { value: '4', vi: '4.0+ sao', en: '4.0+ stars' },
  { value: '4.5', vi: '4.5+ sao', en: '4.5+ stars' },
];

export const EXPERIENCE_OPTIONS: ReadonlyArray<{
  key: ExperienceKey;
  icon: string;
  vi: string;
  en: string;
  keywords: RegExp;
}> = [
  {
    key: 'sea_view',
    icon: 'waves',
    vi: 'View biển',
    en: 'Sea view',
    keywords: /\b(bien|bai bien|vinh|dao|hai dao|my khe|bai chay|cua van|ha long|sea|ocean|beach|bay|coast)\b/,
  },
  {
    key: 'mountain',
    icon: 'mountains',
    vi: 'Đi núi',
    en: 'Mountain & hills',
    keywords: /\b(nui|doi|thac|deo|cao nguyen|ngu hanh son|cau dat|datanla|da lat|mountain|hill|highland|waterfall)\b/,
  },
  {
    key: 'quiet',
    icon: 'leaf',
    vi: 'Yên tĩnh',
    en: 'Quiet & chill',
    keywords: /\b(yen tinh|thu gian|du lich cham|chua|ho xuan huong|lang|thien mu|ca phe|quiet|calm|slow|peaceful|lake)\b/,
  },
  {
    key: 'sunset',
    icon: 'sunset',
    vi: 'Ngắm hoàng hôn',
    en: 'Sunset spot',
    keywords: /\b(hoang hon|ben bach dang|ho tay|hoan kiem|sunset|waterfront|riverfront|promenade)\b/,
  },
  {
    key: 'street_food',
    icon: 'food',
    vi: 'Ẩm thực địa phương',
    en: 'Local food',
    keywords: /\b(am thuc|cho|pho am thuc|dac san|mon an|food|market|street food|cuisine)\b/,
  },
  {
    key: 'heritage',
    icon: 'layers',
    vi: 'Kiến trúc & Di sản',
    en: 'Heritage & culture',
    keywords: /\b(di san|co|bao tang|dinh|nha tho|van mieu|dai noi|hoi an|heritage|museum|historic|temple)\b/,
  },
];

export const VISIT_TIME_SLOTS: ReadonlyArray<{
  value: VisitTimeSlot;
  vi: string;
  en: string;
  rangeVi: string;
  rangeEn: string;
  startMin: number;
  endMin: number;
}> = [
  { value: '', vi: 'Bất kỳ', en: 'Any time', rangeVi: 'Cả ngày', rangeEn: 'All day', startMin: 0, endMin: 1440 },
  { value: 'MORNING', vi: 'Buổi sáng', en: 'Morning', rangeVi: '06:00 – 11:00', rangeEn: '06:00 – 11:00', startMin: 360, endMin: 660 },
  { value: 'NOON', vi: 'Buổi trưa', en: 'Midday', rangeVi: '11:00 – 14:00', rangeEn: '11:00 – 14:00', startMin: 660, endMin: 840 },
  { value: 'AFTERNOON', vi: 'Buổi chiều', en: 'Afternoon', rangeVi: '14:00 – 18:00', rangeEn: '14:00 – 18:00', startMin: 840, endMin: 1080 },
  { value: 'EVENING', vi: 'Buổi tối', en: 'Evening', rangeVi: '18:00 – 23:00', rangeEn: '18:00 – 23:00', startMin: 1080, endMin: 1380 },
];

export const COMPANION_OPTIONS: ReadonlyArray<{
  value: CompanionType;
  vi: string;
  en: string;
  keywords: RegExp;
}> = [
  { value: '', vi: 'Bất kỳ', en: 'Anyone', keywords: /$^/ },
  { value: 'SOLO', vi: 'Đi một mình', en: 'Solo', keywords: /\b(du lich cham|mot minh|ca phe|bao tang|solo|quiet|cafe)\b/ },
  { value: 'COUPLE', vi: 'Cặp đôi', en: 'Couple', keywords: /\b(cap doi|ngam hoang hon|lang man|couple|romantic|sunset)\b/ },
  { value: 'FAMILY', vi: 'Gia đình', en: 'Family', keywords: /\b(tre em|gia dinh|cong vien|vuon hoa|family|kids|park|museum)\b/ },
  { value: 'FRIENDS', vi: 'Nhóm bạn', en: 'Friends', keywords: /\b(nhom ban|cuoi tuan|am thuc duong pho|pho di bo|cho|friends|group|weekend)\b/ },
];

export const BUDGET_TIER_OPTIONS: ReadonlyArray<{
  value: BudgetTier;
  vi: string;
  en: string;
  min?: number;
  max?: number;
}> = [
  { value: '', vi: 'Tất cả', en: 'Any budget' },
  { value: 'FREE', vi: 'Miễn phí', en: 'Free', min: 0, max: 0 },
  { value: 'BUDGET', vi: 'Tiết kiệm (< 100k)', en: 'Budget (< 100k)', min: 0, max: 100000 },
  { value: 'MID', vi: 'Vừa phải (100k–500k)', en: 'Moderate (100k–500k)', min: 100000, max: 500000 },
  { value: 'HIGH', vi: 'Cao cấp (> 500k)', en: 'Premium (> 500k)', min: 500000 },
];

export const RADIUS_OPTIONS_KM = ['1', '3', '5', '10', '25'] as const;

export function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

export function isTestFixture(row: Resource): boolean {
  const name = String(row.name ?? '');
  return /^(Integration\b|P0\d(?:[\s_-]|$)|synthetic\b|test[\s_-]|[0-9a-f]{8}-[0-9a-f]{4}-)/i.test(name);
}

export function localizedName(row: Resource, locale: AppLocale, fallback = ''): string {
  const value = locale === 'en' ? row.name_en ?? row.name_vi ?? row.name : row.name_vi ?? row.name ?? row.name_en;
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/** Build global-ready City / Destination options accompanied by Country names. */
export function buildLocationOptions(
  geographicUnits: Resource[],
  destinations: Resource[],
  places: Resource[],
  locale: AppLocale,
): LocationOption[] {
  const cleanUnits = geographicUnits.filter(u => !isTestFixture(u));
  const unitMap = new Map<string, Resource>(
    cleanUnits.map(u => [String(u.geographic_unit_id ?? u.id), u]),
  );

  const findCountryName = (unit: Resource): string => {
    const seen = new Set<string>();
    let current: Resource | undefined = unit;
    while (current) {
      const id = String(current.geographic_unit_id ?? current.id ?? '');
      if (!id || seen.has(id)) break;
      seen.add(id);
      if (current.level === 'COUNTRY') return localizedName(current, locale);
      const parentId = current.parent_id ? String(current.parent_id) : '';
      if (!parentId) break;
      if (parentId === '10000000-0000-0000-0000-000000000001' && !unitMap.has(parentId)) {
        return locale === 'en' ? 'Vietnam' : 'Việt Nam';
      }
      current = unitMap.get(parentId);
    }
    return locale === 'en' ? 'Vietnam' : 'Việt Nam';
  };

  // Compute centroid per geographic unit / destination from places with valid coordinates
  const geoCoords = new Map<string, { latSum: number; lonSum: number; count: number }>();
  const destCoords = new Map<string, { latSum: number; lonSum: number; count: number }>();
  for (const place of places) {
    if (isTestFixture(place) || !validCoordinates(place.latitude, place.longitude)) continue;
    const lat = Number(place.latitude);
    const lon = Number(place.longitude);
    if (place.geographic_unit_id) {
      const gId = String(place.geographic_unit_id);
      const acc = geoCoords.get(gId) ?? { latSum: 0, lonSum: 0, count: 0 };
      acc.latSum += lat; acc.lonSum += lon; acc.count += 1;
      geoCoords.set(gId, acc);
      // Roll up to parent province too
      const unit = unitMap.get(gId);
      const parentId = unit?.parent_id ? String(unit.parent_id) : '';
      if (parentId) {
        const pAcc = geoCoords.get(parentId) ?? { latSum: 0, lonSum: 0, count: 0 };
        pAcc.latSum += lat; pAcc.lonSum += lon; pAcc.count += 1;
        geoCoords.set(parentId, pAcc);
      }
    }
    if (Array.isArray(place.destination_ids)) {
      for (const dId of place.destination_ids) {
        const key = String(dId);
        const acc = destCoords.get(key) ?? { latSum: 0, lonSum: 0, count: 0 };
        acc.latSum += lat; acc.lonSum += lon; acc.count += 1;
        destCoords.set(key, acc);
      }
    }
  }

  const options: LocationOption[] = [];
  for (const unit of cleanUnits) {
    const level = String(unit.level ?? '');
    if (!['PROVINCE', 'CITY', 'DISTRICT'].includes(level)) continue;
    const id = String(unit.geographic_unit_id ?? unit.id);
    const cityName = localizedName(unit, locale);
    if (!cityName) continue;
    const countryLabel = findCountryName(unit);
    const label = countryLabel && normalizeText(cityName) !== normalizeText(countryLabel)
      ? `${cityName}, ${countryLabel}`
      : cityName;
    const coord = geoCoords.get(id);
    options.push({
      id,
      kind: 'geo',
      label,
      countryLabel,
      searchText: normalizeText(`${cityName} ${countryLabel}`),
      latitude: coord ? coord.latSum / coord.count : undefined,
      longitude: coord ? coord.lonSum / coord.count : undefined,
    });
  }

  for (const dest of destinations.filter(d => !isTestFixture(d) && !['INACTIVE', 'ARCHIVED'].includes(String(d.status ?? '')))) {
    const id = String(dest.destination_id ?? dest.id);
    const destName = localizedName(dest, locale);
    if (!destName) continue;
    const firstGeoId = Array.isArray(dest.geographic_unit_ids) && dest.geographic_unit_ids[0]
      ? String(dest.geographic_unit_ids[0]) : '';
    const firstUnit = firstGeoId ? unitMap.get(firstGeoId) : undefined;
    const countryLabel = firstUnit ? findCountryName(firstUnit) : (locale === 'en' ? 'Vietnam' : 'Việt Nam');
    const label = `${destName}, ${countryLabel}`;
    if (options.some(o => normalizeText(o.label) === normalizeText(label))) continue;
    const coord = destCoords.get(id);
    options.push({
      id,
      kind: 'destination',
      label,
      countryLabel,
      searchText: normalizeText(`${destName} ${countryLabel}`),
      latitude: coord ? coord.latSum / coord.count : undefined,
      longitude: coord ? coord.lonSum / coord.count : undefined,
    });
  }

  return options.sort((a, b) => a.label.localeCompare(b.label, locale));
}

function detectPlaceSpace(place: Resource, tagById: Map<string, Resource>): SpaceType {
  for (const key of ['space_type', 'environment', 'setting', 'indoor_outdoor']) {
    const raw = place[key];
    if (typeof raw === 'string') {
      const upper = raw.trim().toUpperCase();
      if (upper === 'INDOOR' || upper === 'OUTDOOR' || upper === 'BOTH') return upper;
      const norm = normalizeText(raw);
      if (/\b(trong nha|indoor)\b/.test(norm)) return 'INDOOR';
      if (/\b(ngoai troi|outdoor|open air)\b/.test(norm)) return 'OUTDOOR';
    }
  }
  const tagNames: string[] = [];
  if (Array.isArray(place.tag_ids)) {
    for (const id of place.tag_ids) {
      const t = tagById.get(String(id));
      if (t) tagNames.push(String(t.name ?? ''), String(t.name_en ?? ''));
    }
  }
  const joined = normalizeText(tagNames.join(' '));
  const hasIndoor = /\b(trong nha|indoor)\b/.test(joined);
  const hasOutdoor = /\b(ngoai troi|outdoor|san vuon|rooftop)\b/.test(joined);
  if (hasIndoor && hasOutdoor) return 'BOTH';
  if (hasIndoor) return 'INDOOR';
  if (hasOutdoor) return 'OUTDOOR';
  return '';
}

/**
 * Only enable the Indoor / Outdoor filter when catalog places actually carry
 * structured space metadata or standardized indoor/outdoor tags reliably.
 */
export function assessSpaceReliability(places: Resource[], tags: Resource[]): SpaceReliability {
  const realPlaces = places.filter(p => !isTestFixture(p));
  if (!realPlaces.length) return { trusted: false, coveredCount: 0, totalCount: 0 };
  const tagById = new Map(tags.map(t => [String(t.tag_id ?? t.id), t]));
  let coveredCount = 0;
  for (const place of realPlaces) {
    if (detectPlaceSpace(place, tagById) !== '') coveredCount += 1;
  }
  const trusted = coveredCount >= 2 && coveredCount / realPlaces.length >= 0.25;
  return { trusted, coveredCount, totalCount: realPlaces.length };
}

function parseMinutes(hhmm: unknown): number | null {
  if (typeof hhmm !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function checkVisitTime(place: Resource, slot: VisitTimeSlot): 'matched' | 'closed' | 'unknown' {
  if (!slot) return 'unknown';
  const hours = place.opening_hours;
  if (!Array.isArray(hours) || hours.length === 0) return 'unknown';
  const target = VISIT_TIME_SLOTS.find(s => s.value === slot);
  if (!target) return 'unknown';
  for (const entry of hours) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Resource;
    const open = parseMinutes(row.open ?? row.open_time);
    const close = parseMinutes(row.close ?? row.close_time);
    if (open === null || close === null) continue;
    const effectiveClose = row.overnight || close <= open ? close + 1440 : close;
    if (open < target.endMin && effectiveClose > target.startMin) {
      return 'matched';
    }
  }
  return 'closed';
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function rankAndFilterPlaces(params: {
  places: Resource[];
  categories: Resource[];
  tags: Resource[];
  amenities: Resource[];
  geographicUnits: Resource[];
  destinations: Resource[];
  filters: RecommendationFilterState;
  spaceReliability: SpaceReliability;
  locale: AppLocale;
  text: (vi: string, en: string) => string;
}): RankedRecommendation[] {
  const {
    places,
    categories,
    tags,
    amenities,
    geographicUnits,
    destinations,
    filters,
    spaceReliability,
    locale,
    text,
  } = params;

  const catMap = new Map(categories.map(c => [String(c.category_id ?? c.id), c]));
  const tagMap = new Map(tags.map(t => [String(t.tag_id ?? t.id), t]));
  const amenityMap = new Map(amenities.map(a => [String(a.amenity_id ?? a.id), a]));
  const unitMap = new Map(geographicUnits.map(u => [String(u.geographic_unit_id ?? u.id), u]));
  const destMap = new Map(destinations.map(d => [String(d.destination_id ?? d.id), d]));

  const belongsToGeo = (placeGeoId: string, selectedGeoId: string): boolean => {
    if (!selectedGeoId) return true;
    if (placeGeoId === selectedGeoId) return true;
    const seen = new Set<string>();
    let current = unitMap.get(placeGeoId);
    while (current?.parent_id && !seen.has(String(current.geographic_unit_id ?? current.id))) {
      seen.add(String(current.geographic_unit_id ?? current.id));
      const parentId = String(current.parent_id);
      if (parentId === selectedGeoId) return true;
      current = unitMap.get(parentId);
    }
    return false;
  };

  // Resolve budget bounds
  const tierSpec = BUDGET_TIER_OPTIONS.find(t => t.value === filters.budgetTier);
  const parsedMin = filters.minPrice !== '' ? Number(filters.minPrice) : tierSpec?.min;
  const parsedMax = filters.maxPrice !== '' ? Number(filters.maxPrice) : tierSpec?.max;
  const hasBudgetFilter = parsedMin !== undefined || parsedMax !== undefined;

  const minRatingNum = filters.minRating !== '' ? Number(filters.minRating) : null;
  const radiusKmNum = filters.origin && filters.radiusKm !== '' ? Number(filters.radiusKm) : null;
  const normQuery = normalizeText(filters.locationQuery);

  const scored: Array<Omit<RankedRecommendation, 'rank'>> = [];

  for (const place of places) {
    if (isTestFixture(place)) continue;

    const placeId = placeIdOf(place);
    if (!placeId) continue;

    const name = localizedName(place, locale, text('Điểm đến chưa có tên', 'Unnamed destination'));
    const address = typeof place.address === 'string' ? place.address : '';
    const summary = typeof place.description === 'string' ? place.description.trim() : '';

    // Resolve category names
    const catIds: string[] = Array.isArray(place.category_ids)
      ? place.category_ids.map(String)
      : place.category_id
        ? [String(place.category_id)]
        : [];
    const primaryCat = catIds.map(id => catMap.get(id)).find(Boolean);
    const categoryLabel = primaryCat
      ? localizedName(primaryCat, locale)
      : typeof place.category_name === 'string'
        ? place.category_name
        : text('Điểm đến', 'Destination');

    // Hard Filter 1: Category (e.g., Cà phê)
    if (filters.categoryId && !catIds.includes(filters.categoryId)) continue;

    // Hard Filter 2: City / Destination + Country
    const placeGeoId = place.geographic_unit_id ? String(place.geographic_unit_id) : '';
    const placeDestIds = Array.isArray(place.destination_ids) ? place.destination_ids.map(String) : [];

    if (filters.geographicUnitId) {
      if (!placeGeoId || !belongsToGeo(placeGeoId, filters.geographicUnitId)) continue;
    } else if (filters.destinationId) {
      if (!placeDestIds.includes(filters.destinationId)) continue;
    } else if (normQuery) {
      const geo = placeGeoId ? unitMap.get(placeGeoId) : undefined;
      const parentGeo = geo?.parent_id ? unitMap.get(String(geo.parent_id)) : undefined;
      const destNames = placeDestIds.map(id => {
        const d = destMap.get(id);
        return d ? `${d.name ?? ''} ${d.name_en ?? ''}` : '';
      }).join(' ');
      const countryHint = `${parentGeo?.name ?? ''} ${parentGeo?.name_en ?? ''} ${place.country ?? ''}`;
      const searchable = normalizeText(
        `${name} ${place.name_en ?? ''} ${address} ${geo?.name ?? ''} ${geo?.name_en ?? ''} ${destNames} ${countryHint}`,
      );
      const tokens = normQuery.split(/[,\s]+/).filter(Boolean);
      if (!tokens.every(token => searchable.includes(token))) continue;
    }

    // Hard Filter 3: Budget (keep null price distinct from 0₫)
    const rawMinPrice = place.price_min ?? place.price;
    const minPrice = rawMinPrice === null || rawMinPrice === undefined || rawMinPrice === '' || !Number.isFinite(Number(rawMinPrice))
      ? null : Number(rawMinPrice);
    const rawMaxPrice = place.price_max;
    const maxPrice = rawMaxPrice === null || rawMaxPrice === undefined || rawMaxPrice === '' || !Number.isFinite(Number(rawMaxPrice))
      ? null : Number(rawMaxPrice);

    if (hasBudgetFilter) {
      if (minPrice === null) continue;
      if (parsedMin !== undefined && Number.isFinite(parsedMin) && minPrice < parsedMin) continue;
      if (parsedMax !== undefined && Number.isFinite(parsedMax) && minPrice > parsedMax) continue;
    }

    // Hard Filter 4: Minimum Rating (unified 3.0+, 3.5+, 4.0+, 4.5+)
    const rawRating = place.rating_avg ?? place.rating ?? place.average_rating;
    const rating = rawRating === null || rawRating === undefined || rawRating === '' || !Number.isFinite(Number(rawRating))
      ? null : Number(rawRating);
    const rawReviewCount = Number(place.review_count ?? place.rating_count ?? 0);
    const reviewCount = Number.isFinite(rawReviewCount) && rawReviewCount > 0 ? rawReviewCount : 0;

    if (minRatingNum !== null) {
      if (rating === null || rating < minRatingNum) continue;
    }

    // Hard Filter 5: Visit time against opening_hours
    const timeCheck = checkVisitTime(place, filters.visitTime);
    if (filters.visitTime && timeCheck === 'closed') continue;

    // Hard Filter 6: Indoor / Outdoor (only when metadata is trusted)
    const spaceLabel = detectPlaceSpace(place, tagMap);
    if (spaceReliability.trusted && filters.spaceType) {
      if (spaceLabel !== filters.spaceType && spaceLabel !== 'BOTH') continue;
    }

    // Hard Filter 7: Distance from chosen origin
    let distanceKm: number | null = null;
    if (filters.origin && validCoordinates(place.latitude, place.longitude)) {
      distanceKm = haversineKm(
        filters.origin.latitude,
        filters.origin.longitude,
        Number(place.latitude),
        Number(place.longitude),
      );
    }
    if (radiusKmNum !== null) {
      if (distanceKm === null || distanceKm > radiusKmNum) continue;
    }

    // Soft Ranking Signals & Separated Recommendation Reasons
    const tagNames = (Array.isArray(place.tag_ids) ? place.tag_ids : [])
      .map(id => tagMap.get(String(id)))
      .filter((t): t is Resource => Boolean(t))
      .map(t => localizedName(t, locale));

    const amenityNames = (Array.isArray(place.amenity_ids) ? place.amenity_ids : [])
      .map(id => amenityMap.get(String(id)))
      .filter((a): a is Resource => Boolean(a))
      .map(a => localizedName(a, locale));

    const semanticText = normalizeText(
      `${name} ${place.name_en ?? ''} ${summary} ${categoryLabel} ${tagNames.join(' ')} ${amenityNames.join(' ')}`,
    );

    let score = 0;
    const reasons: string[] = [];

    // Experience preferences (soft ranking signals)
    for (const expKey of filters.experiences) {
      const exp = EXPERIENCE_OPTIONS.find(item => item.key === expKey);
      if (exp && exp.keywords.test(semanticText)) {
        score += 24;
        reasons.push(
          locale === 'vi'
            ? expKey === 'sea_view'
              ? 'Có view biển'
              : expKey === 'mountain'
                ? 'Hợp đi núi'
                : expKey === 'quiet'
                  ? 'Không gian yên tĩnh'
                  : expKey === 'sunset'
                    ? 'Đẹp lúc hoàng hôn'
                    : expKey === 'street_food'
                      ? 'Đậm chất ẩm thực địa phương'
                      : 'Giàu dấu ấn di sản'
            : exp.en,
        );
      }
    }

    // Companion priority (boost only when matching data exists)
    if (filters.companion) {
      const compSpec = COMPANION_OPTIONS.find(c => c.value === filters.companion);
      if (compSpec && compSpec.keywords.test(semanticText)) {
        score += 18;
        reasons.push(text(`Phù hợp ${compSpec.vi.toLowerCase()}`, `Great for ${compSpec.en.toLowerCase()}`));
      }
    }

    // Verified context reasons
    if (hasBudgetFilter) {
      reasons.push(
        minPrice === 0
          ? text('Miễn phí vé vào', 'Free entry')
          : text('Trong ngân sách', 'Within budget'),
      );
      score += 6;
    } else if (minPrice === 0) {
      reasons.push(text('Miễn phí tham quan', 'Free to visit'));
    }

    if (filters.visitTime && timeCheck === 'matched') {
      const slotMeta = VISIT_TIME_SLOTS.find(s => s.value === filters.visitTime);
      if (slotMeta) {
        reasons.push(text(`Mở cửa ${slotMeta.vi.toLowerCase()}`, `Open ${slotMeta.en.toLowerCase()}`));
        score += 8;
      }
    }

    if (spaceReliability.trusted && filters.spaceType && spaceLabel) {
      reasons.push(
        spaceLabel === 'OUTDOOR'
          ? text('Không gian ngoài trời', 'Outdoor space')
          : spaceLabel === 'INDOOR'
            ? text('Không gian trong nhà', 'Indoor space')
            : text('Trong nhà & ngoài trời', 'Indoor & outdoor'),
      );
      score += 8;
    }

    if (distanceKm !== null) {
      reasons.push(
        text(
          `Cách ${distanceKm.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} km`,
          `${distanceKm.toFixed(1)} km away`,
        ),
      );
      score += Math.max(0, 15 - distanceKm);
    }

    if (rating !== null) {
      score += rating * 10 + Math.log10(reviewCount + 1) * 4;
      if (rating >= 4.0 && reasons.length < 4) {
        reasons.push(
          text(
            `Đánh giá nổi bật (${rating.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}★)`,
            `Top rated (${rating.toFixed(1)}★)`,
          ),
        );
      }
    } else {
      // Slightly prefer rated places over unrated ones on tie
      score += 10;
    }

    if (reasons.length === 0 && tagNames[0]) {
      reasons.push(tagNames[0]);
    }

    scored.push({
      place,
      placeId,
      score,
      name,
      address,
      summary,
      categoryLabel,
      rating,
      reviewCount,
      minPrice,
      maxPrice,
      currency: typeof place.currency === 'string' ? place.currency : 'VND',
      distanceKm,
      spaceLabel,
      reasons: [...new Set(reasons)].slice(0, 4),
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
    if (ratingDiff !== 0) return ratingDiff;
    return a.name.localeCompare(b.name, locale);
  });

  return scored.map((item, idx) => ({ ...item, rank: idx + 1 }));
}
