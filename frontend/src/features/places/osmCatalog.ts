import type { Resource } from '../../shared/api';

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

/** Exact 29 legacy landmark names from backend/infra/seed_demo.py. */
export const LEGACY_DEMO_PLACE_NAMES = new Set<string>(
  [
    'Hồ Hoàn Kiếm',
    'Văn Miếu Quốc Tử Giám',
    'Bảo tàng Dân tộc học Việt Nam',
    'Chợ Đồng Xuân',
    'Phố ẩm thực Tống Duy Tân',
    'Dinh Độc Lập',
    'Bảo tàng Chứng tích Chiến tranh',
    'Chợ Bến Thành',
    'Phố đi bộ Nguyễn Huệ',
    'Bến Bạch Đằng',
    'Bãi biển Mỹ Khê',
    'Danh thắng Ngũ Hành Sơn',
    'Cầu Rồng',
    'Chợ Hàn',
    'Bảo tàng Điêu khắc Chăm Đà Nẵng',
    'Phố cổ Hội An',
    'Đại Nội Huế',
    'Chùa Thiên Mụ',
    'Chợ Đông Ba',
    'Làng hương Thủy Xuân',
    'Hồ Xuân Hương',
    'Thác Datanla',
    'Đồi chè Cầu Đất',
    'Vườn hoa thành phố Đà Lạt',
    'Vịnh Hạ Long',
    'Bảo tàng Quảng Ninh',
    'Bãi biển Bãi Cháy',
    'Làng chài Cửa Vạn',
    'Nhà thờ Lớn Hà Nội',
  ].map(normalize),
);

const LEGACY_DEMO_OVERLAP_DESCRIPTIONS = new Map<string, string>([
  [
    normalize('Bảo tàng Dân tộc học Việt Nam'),
    normalize('Không gian trong nhà giới thiệu văn hóa các dân tộc, còn khu ngoài trời có nhà truyền thống; khuôn viên rộng nên đi giày dễ bước.'),
  ],
  [
    normalize('Chợ Đồng Xuân'),
    normalize('Khu chợ trong nhà nhiều tầng với quầy hàng gia dụng và vải vóc; các lối chính đông hơn vào buổi sáng và cuối tuần.'),
  ],
  [
    normalize('Dinh Độc Lập'),
    normalize('Các phòng tiếp khách, phòng họp và khu tầng hầm cho thấy nhiều lớp lịch sử hiện đại; tuyến tham quan có nhiều cầu thang.'),
  ],
  [
    normalize('Bảo tàng Chứng tích Chiến tranh'),
    normalize('Các phòng trưng bày lưu tư liệu và hiện vật về chiến tranh; nội dung có thể nặng cảm xúc và cần thời gian đọc.'),
  ],
  [
    normalize('Chợ Bến Thành'),
    normalize('Khu chợ trung tâm có quầy thực phẩm, quà lưu niệm và hàng thủ công; nên hỏi giá trước khi mua và chú ý lối đi đông.'),
  ],
  [
    normalize('Cầu Rồng'),
    normalize('Cây cầu bắc qua sông Hàn có lối ngắm cảnh ở hai bờ; khu vực ven sông đông hơn vào các tối cuối tuần có sự kiện.'),
  ],
  [
    normalize('Chợ Hàn'),
    normalize('Chợ gần sông Hàn bán đặc sản đóng gói, trái cây và đồ dùng; nên kiểm tra nhãn và hỏi rõ khối lượng trước khi mua.'),
  ],
]);

export function isSyntheticFixtureSuite(row: Resource): boolean {
  const id = String(row.place_id ?? row.id ?? '');
  const name = String(row.name ?? '');
  return id.startsWith('synthetic') || id.startsWith('fixture-') || /\bsynthetic\b/i.test(name);
}

export function isTestPlaceRecord(row: Resource): boolean {
  const name = String(row.name ?? '');
  return (
    isSyntheticFixtureSuite(row) ||
    /^(?:integration\b|P0\d(?:[\s_-]|$)|test[\s_-]|[0-9a-f]{8}-[0-9a-f]{4}-)/i.test(name)
  );
}

export function isLegacySeededDemoPlace(row: Resource): boolean {
  if (row.source === 'geofabrik-osm' || typeof row.external_id === 'string') return false;
  const normName = normalize(String(row.name_vi ?? row.name ?? ''));
  if (!LEGACY_DEMO_PLACE_NAMES.has(normName)) return false;

  const expectedLegacyDesc = LEGACY_DEMO_OVERLAP_DESCRIPTIONS.get(normName);
  if (!expectedLegacyDesc) {
    // 22 legacy-only names not present in osm-places.json
    return true;
  }

  // For the 7 overlapping landmarks, distinguish old seed_demo rows from newly imported DB records
  const desc = normalize(String(row.description ?? ''));
  const hasMedia = Array.isArray(row.media_keys) && row.media_keys.length > 0;
  return !hasMedia && (desc === expectedLegacyDesc || desc === '');
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function loadOpenDataPlaces(): Promise<Resource[]> {
  try {
    const resp = await fetch('/data/osm-places.json', { cache: 'no-store' });
    if (!resp.ok) return [];
    const data: unknown = await resp.json();
    return Array.isArray(data) ? (data as Resource[]) : [];
  } catch {
    return [];
  }
}

export function mergeCatalogWithOpenData(params: {
  catalogPlaces: Resource[];
  openDataPlaces: Resource[];
  categories: Resource[];
  geographicUnits: Resource[];
  destinations?: Resource[];
}): {
  places: Resource[];
  categories: Resource[];
  geographicUnits: Resource[];
  destinations: Resource[];
} {
  const {
    catalogPlaces,
    openDataPlaces,
    categories,
    geographicUnits,
    destinations = [],
  } = params;

  // Never alter isolated synthetic fixture test runs or runs with empty OpenData
  if (!openDataPlaces.length || catalogPlaces.some(isSyntheticFixtureSuite)) {
    return { places: catalogPlaces, categories, geographicUnits, destinations };
  }

  // Strip the 29 legacy seed_demo places and test smoke records so only newly updated places remain
  const activeCatalogPlaces = catalogPlaces.filter(
    cp => !isTestPlaceRecord(cp) && !isLegacySeededDemoPlace(cp),
  );

  const nextCategories = [...categories];
  const categoryIdByNorm = new Map<string, string>();
  for (const c of nextCategories) {
    const id = String(c.category_id ?? c.id ?? '');
    if (id && c.name) categoryIdByNorm.set(normalize(String(c.name)), id);
    if (id && c.name_vi) categoryIdByNorm.set(normalize(String(c.name_vi)), id);
  }

  const ensureCategoryId = (name: string): string => {
    const norm = normalize(name);
    const existing = categoryIdByNorm.get(norm);
    if (existing) return existing;
    const virtualId = `osm-cat-${norm.replace(/[^a-z0-9]+/g, '-')}`;
    categoryIdByNorm.set(norm, virtualId);
    nextCategories.push({
      category_id: virtualId,
      id: virtualId,
      name,
      name_vi: name,
      name_en:
        name === 'Nhà hàng'
          ? 'Restaurant'
          : name === 'Cà phê'
            ? 'Cafe'
            : name === 'Danh lam thắng cảnh'
              ? 'Attractions'
              : name === 'Bảo tàng'
                ? 'Museum'
                : name === 'Ẩm thực'
                  ? 'Local cuisine'
                  : name,
      active: true,
    });
    return virtualId;
  };

  const nextGeos = [...geographicUnits];
  const geoIdByNorm = new Map<string, string>();
  for (const g of nextGeos) {
    const id = String(g.geographic_unit_id ?? g.id ?? '');
    if (id && g.name) geoIdByNorm.set(normalize(String(g.name)), id);
    if (id && g.name_vi) geoIdByNorm.set(normalize(String(g.name_vi)), id);
  }

  const ensureGeoId = (province: string, country: string): string => {
    const countryNorm = normalize(country);
    let countryId = geoIdByNorm.get(countryNorm);
    if (!countryId) {
      countryId = `osm-country-${countryNorm.replace(/[^a-z0-9]+/g, '-')}`;
      geoIdByNorm.set(countryNorm, countryId);
      nextGeos.push({
        geographic_unit_id: countryId,
        id: countryId,
        name: country,
        name_vi: country,
        name_en: country === 'Pháp' ? 'France' : country === 'Việt Nam' ? 'Vietnam' : country,
        level: 'COUNTRY',
        parent_id: null,
      });
    }
    const provNorm = normalize(province);
    const existingProv = geoIdByNorm.get(provNorm);
    if (existingProv) return existingProv;
    const provId = `osm-prov-${provNorm.replace(/[^a-z0-9]+/g, '-')}`;
    geoIdByNorm.set(provNorm, provId);
    nextGeos.push({
      geographic_unit_id: provId,
      id: provId,
      name: province,
      name_vi: province,
      name_en: province,
      level: 'PROVINCE',
      parent_id: countryId,
    });
    return provId;
  };

  // Match genuinely new DB catalog places 1-to-1 with Commons metadata if missing image
  const mergedPlaces: Resource[] = activeCatalogPlaces.map(cp => {
    const cName = normalize(String(cp.name_vi ?? cp.name ?? ''));
    const clat = Number(cp.latitude);
    const clon = Number(cp.longitude);
    const hasOwnImage =
      (Array.isArray(cp.media_keys) && cp.media_keys.length > 0) ||
      typeof cp.image_url === 'string';
    if (Number.isFinite(clat) && Number.isFinite(clon)) {
      const match = openDataPlaces.find(
        op =>
          normalize(String(op.name ?? '')) === cName &&
          distanceKm(clat, clon, Number(op.latitude), Number(op.longitude)) <= 0.35,
      );
      if (match) {
        return {
          ...cp,
          province: cp.province ?? match.province,
          country: cp.country ?? match.country,
          category_name: cp.category_name ?? match.category_name,
          ...(hasOwnImage || typeof match.image_url !== 'string'
            ? {}
            : {
                image_url: match.image_url,
                image_author: match.image_author,
                image_license: match.image_license,
                commons_url: match.commons_url,
              }),
        };
      }
    }
    return cp;
  });

  for (const op of openDataPlaces) {
    const oName = normalize(String(op.name ?? ''));
    const olat = Number(op.latitude);
    const olon = Number(op.longitude);
    const duplicate = mergedPlaces.some(mp => {
      const mName = normalize(String(mp.name_vi ?? mp.name ?? ''));
      const mlat = Number(mp.latitude);
      const mlon = Number(mp.longitude);
      return (
        mName === oName &&
        Number.isFinite(mlat) &&
        Number.isFinite(mlon) &&
        distanceKm(olat, olon, mlat, mlon) <= 0.35
      );
    });
    if (duplicate) continue;

    const catName = String(op.category_name ?? 'Danh lam thắng cảnh');
    const catId = ensureCategoryId(catName);
    const prov = String(op.province ?? 'Việt Nam');
    const country = String(op.country ?? 'Việt Nam');
    const geoId = ensureGeoId(prov, country);

    mergedPlaces.push({
      ...op,
      category_ids: [catId],
      geographic_unit_id: geoId,
      destination_ids: Array.isArray(op.destination_ids) ? op.destination_ids : [],
      tag_ids: Array.isArray(op.tag_ids) ? op.tag_ids : [],
      amenity_ids: Array.isArray(op.amenity_ids) ? op.amenity_ids : [],
    });
  }

  // Keep only categories, geographic units (plus parent ancestors), and destinations used by active places
  const usedCategoryIds = new Set<string>();
  const usedGeoIds = new Set<string>();
  const usedDestIds = new Set<string>();
  const geoById = new Map(nextGeos.map(g => [String(g.geographic_unit_id ?? g.id ?? ''), g]));

  for (const p of mergedPlaces) {
    if (Array.isArray(p.category_ids)) {
      for (const cid of p.category_ids) usedCategoryIds.add(String(cid));
    }
    if (p.geographic_unit_id) {
      let curr: string | null = String(p.geographic_unit_id);
      const seen = new Set<string>();
      while (curr && !seen.has(curr)) {
        seen.add(curr);
        usedGeoIds.add(curr);
        const unit = geoById.get(curr);
        curr = unit?.parent_id ? String(unit.parent_id) : null;
      }
    }
    if (Array.isArray(p.destination_ids)) {
      for (const did of p.destination_ids) usedDestIds.add(String(did));
    }
  }

  const prunedCategories = nextCategories.filter(c =>
    usedCategoryIds.has(String(c.category_id ?? c.id ?? '')),
  );
  const prunedGeos = nextGeos.filter(g =>
    usedGeoIds.has(String(g.geographic_unit_id ?? g.id ?? '')),
  );
  const prunedDestinations = destinations.filter(d =>
    usedDestIds.has(String(d.destination_id ?? d.id ?? '')),
  );

  return {
    places: mergedPlaces,
    categories: prunedCategories,
    geographicUnits: prunedGeos,
    destinations: prunedDestinations,
  };
}

export function filterPlacesLocally(
  places: Resource[],
  criteria: {
    query?: string;
    categoryId?: string;
    filters?: Record<string, string>;
  },
  geographicUnits: Resource[] = [],
): Resource[] {
  const qNorm = normalize(criteria.query ?? '');
  const categoryId = criteria.categoryId ?? '';
  const f = criteria.filters ?? {};
  const unitMap = new Map(
    geographicUnits.map(u => [String(u.geographic_unit_id ?? u.id ?? ''), u]),
  );

  const matchesGeo = (placeGeoId: string, targetGeoId: string): boolean => {
    let curr: string | null = placeGeoId;
    const seen = new Set<string>();
    while (curr && !seen.has(curr)) {
      if (curr === targetGeoId) return true;
      seen.add(curr);
      const unit = unitMap.get(curr);
      curr = unit?.parent_id ? String(unit.parent_id) : null;
    }
    return false;
  };

  const minPrice = f.minPrice ? Number(f.minPrice) : null;
  const maxPrice = f.maxPrice ? Number(f.maxPrice) : null;
  const minRating = f.minRating ? Number(f.minRating) : null;
  const lat = f.lat ? Number(f.lat) : null;
  const lon = f.lon ? Number(f.lon) : null;
  const radiusKm = f.radiusM ? Number(f.radiusM) / 1000 : null;

  return places.filter(p => {
    if (categoryId) {
      const catIds = Array.isArray(p.category_ids) ? p.category_ids.map(String) : [];
      if (!catIds.includes(categoryId)) return false;
    }
    if (f.geographicUnitId) {
      if (!matchesGeo(String(p.geographic_unit_id ?? ''), f.geographicUnitId)) return false;
    }
    if (f.destinationId) {
      const destIds = Array.isArray(p.destination_ids) ? p.destination_ids.map(String) : [];
      if (!destIds.includes(f.destinationId)) return false;
    }
    if (qNorm) {
      const geoLabels: string[] = [];
      let currGeo: string | null = p.geographic_unit_id ? String(p.geographic_unit_id) : null;
      const seenGeo = new Set<string>();
      while (currGeo && !seenGeo.has(currGeo)) {
        seenGeo.add(currGeo);
        const unit = unitMap.get(currGeo);
        if (unit) {
          for (const key of ['name', 'name_vi', 'name_en'] as const) {
            if (typeof unit[key] === 'string') geoLabels.push(unit[key]);
          }
          currGeo = unit.parent_id ? String(unit.parent_id) : null;
        } else {
          currGeo = null;
        }
      }
      const haystack = normalize(
        [p.name, p.name_vi, p.name_en, p.address, p.province, p.country, p.category_name, p.description, ...geoLabels]
          .filter(v => typeof v === 'string')
          .join(' '),
      );
      if (!haystack.includes(qNorm)) return false;
    }
    const rawPrice = p.price_min ?? p.price;
    const hasPrice = rawPrice !== null && rawPrice !== undefined && rawPrice !== '' && Number.isFinite(Number(rawPrice));
    if (minPrice !== null && Number.isFinite(minPrice)) {
      if (!hasPrice || Number(rawPrice) < minPrice) return false;
    }
    if (maxPrice !== null && Number.isFinite(maxPrice)) {
      if (!hasPrice || Number(rawPrice) > maxPrice) return false;
    }
    if (minRating !== null && Number.isFinite(minRating)) {
      const rating = Number(p.rating_avg ?? 0);
      if (!Number.isFinite(rating) || rating < minRating) return false;
    }
    if (lat !== null && lon !== null && radiusKm !== null && Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(radiusKm)) {
      const plat = Number(p.latitude);
      const plon = Number(p.longitude);
      if (!Number.isFinite(plat) || !Number.isFinite(plon) || distanceKm(lat, lon, plat, plon) > radiusKm) {
        return false;
      }
    }
    return true;
  });
}
