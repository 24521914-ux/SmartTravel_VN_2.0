import { CinematicMotion } from '../../shared/motion/CinematicMotion';
import { TypeCycleText, TypeRevealText } from '../../shared/motion/ExploreTextMotion';
import { CommunityStories } from './CinematicSections';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { PlaceCard } from './PlaceCard';
import { PlaceDetailPage } from './PlaceDetailPage';
import { Icon, ErrorState, EmptyState } from '../../shared/ui';
import type { TravelClient, Resource, Page } from '../../shared/api';
import { useToast } from '../../app/providers/ToastProvider';
import { useAuth } from '../../app/providers/AuthProvider';
import { DestinationFilters } from './DestinationFilters';
import { useAppPreferences } from '../../app/providers/AppPreferences';
import { placeImage } from './media';
import {
  filterPlacesLocally,
  hydratePlaceWithOpenData,
  hydratePlacesWithOpenData,
  isLegacySeededDemoPlace,
  isSyntheticFixtureSuite,
  isTestPlaceRecord,
  loadOpenDataPlaces,
  mergeCatalogWithOpenData,
} from './osmCatalog';
import {
  cachedFirstPlacesPage,
  cachedTaxonomy,
  dedupePlacesById,
  fetchAllRemainingPlaces,
  getCachedMergedCatalog,
  setCachedMergedCatalog,
} from './catalogCache';
import './explore-voyage.css';

export interface ExploreSectionProps {
  travel: TravelClient;
  onNavigateToTrip?: (place?: Resource) => void;
  onNavigate?: (section: string) => void;
  busy?: boolean;
}

const heroCyclingPhrasesVi = [
  'Vịnh Hạ Long giữa sương sớm tinh khôi',
  'Phố cổ Hội An rực rỡ đêm đèn lồng',
  'Tam Cốc mùa lúa chín vàng óng ả',
  'Biển xanh nắng gió bán đảo Sơn Trà',
  'Đồi thông sương mờ bình minh Đà Lạt',
];

const heroCyclingPhrasesEn = [
  'Ha Long limestone bays in morning mist',
  'Lantern-lit heritage lanes of Hoi An',
  'Golden rice valleys along Tam Coc river',
  'Sunlit coastlines across Son Tra Peninsula',
  'Pine hills and misty mornings in Da Lat',
];

const tickerDestinations = [
  { label: 'Hạ Long, Quảng Ninh', query: 'Hạ Long' },
  { label: 'Tam Cốc, Ninh Bình', query: 'Ninh Bình' },
  { label: 'Phố cổ Hội An', query: 'Hội An' },
  { label: 'Mỹ Khê, Đà Nẵng', query: 'Đà Nẵng' },
  { label: 'Đà Lạt, Lâm Đồng', query: 'Đà Lạt' },
  { label: 'Cố đô Huế', query: 'Huế' },
  { label: 'Hà Nội', query: 'Hà Nội' },
  { label: 'TP. Hồ Chí Minh', query: 'Hồ Chí Minh' },
  { label: 'Sapa, Lào Cai', query: 'Sapa' },
  { label: 'Phú Quốc, Kiên Giang', query: 'Phú Quốc' },
  { label: 'Nha Trang, Khánh Hòa', query: 'Nha Trang' },
  { label: 'Cần Thơ, Miền Tây', query: 'Cần Thơ' },
];

const travelMoods = [
  {
    id: 'mountains',
    query: 'Ninh Bình',
    image: '/images/editorial/ninh-binh.webp',
    alt: 'Núi đá vôi và đồng lúa Tam Cốc, Ninh Bình',
    icon: 'mountains',
    titleVi: 'Non nước & Núi rừng',
    titleEn: 'Mountain & Karst Escapes',
    descVi: 'Những dãy núi đá vôi trùng điệp, thung lũng xanh mướt và dòng sông uốn lượn cho tâm trí chậm lại.',
    descEn: 'Limestone valleys, emerald rivers, and quiet trails built for unhurried mornings.',
  },
  {
    id: 'coast',
    query: 'Đà Nẵng',
    image: '/images/editorial/da-nang.webp',
    alt: 'Bãi biển Mỹ Khê Đà Nẵng với làn nước trong xanh',
    icon: 'waves',
    titleVi: 'Biển xanh & Vịnh đảo',
    titleEn: 'Coastal & Island Retreats',
    descVi: 'Bãi cát mịn, nắng gió miền Trung và những vịnh biển yên bình cho kỳ nghỉ tái tạo năng lượng.',
    descEn: 'Sunlit bays, gentle waves, and breezy coastal promenades across central Vietnam.',
  },
  {
    id: 'city',
    query: 'Hồ Chí Minh',
    image: '/images/editorial/ho-chi-minh.webp',
    alt: 'Kiến trúc lịch sử và nhịp sống đô thị tại Thành phố Hồ Chí Minh',
    icon: 'building',
    titleVi: 'Đô thị & Nhịp sống',
    titleEn: 'Urban & Culinary Pulse',
    descVi: 'Góc cà phê sáng, bảo tàng đương đại và những con phố ẩm thực rực rỡ ánh đèn về đêm.',
    descEn: 'Specialty coffee corners, modern galleries, and vibrant street food after dusk.',
  },
  {
    id: 'highlands',
    query: 'Đà Lạt',
    image: '/images/editorial/da-lat.webp',
    alt: 'Hồ Xuân Hương và rừng thông tại Đà Lạt',
    icon: 'leaf',
    titleVi: 'Cao nguyên & Sương mờ',
    titleEn: 'Misty Highland Mornings',
    descVi: 'Không khí se lạnh, đồi thông lộng gió và những cung đường hoa dã quỳ đặc trưng cao nguyên.',
    descEn: 'Cool pine air, lakeside walks, and tranquil tea hills above the clouds.',
  },
  {
    id: 'heritage',
    query: 'Huế',
    image: '/images/editorial/hue.webp',
    alt: 'Cổng thành cổ kính tại Đại Nội Huế',
    icon: 'layers',
    titleVi: 'Di sản & Phố cổ',
    titleEn: 'Cultural & Heritage Trails',
    descVi: 'Đền đài cổ kính, phố đèn lồng bên sông Hoài và chiều sâu văn hóa trăm năm.',
    descEn: 'Imperial citadels, lantern-lit riversides, and living craft traditions.',
  },
];

const curatedHighlightFallbacks = [
  {
    key: 'fallback-ninh-binh',
    query: 'Ninh Bình',
    image: '/images/editorial/ninh-binh.webp',
    categoryVi: 'Di sản thiên nhiên',
    categoryEn: 'Natural Heritage',
    badgeVi: 'Miền Bắc',
    badgeEn: 'North',
    locationVi: 'TAM CỐC · NINH BÌNH',
    locationEn: 'TAM COC · NINH BINH',
    titleVi: 'Hành trình xuyên núi đá vôi & đồng lúa Tam Cốc',
    titleEn: 'Karst Peaks & River Caves of Tam Coc',
    descVi: 'Ngồi thuyền xuôi dòng Ngô Đồng qua ba hang đá tự nhiên giữa thung lũng xanh.',
    descEn: 'Drift down the Ngo Dong River past limestone karsts and emerald rice paddies.',
    metaVi: 'Gợi ý 2 ngày',
    metaEn: '2-day route',
  },
  {
    key: 'fallback-hoi-an',
    query: 'Hội An',
    image: '/images/editorial/hoi-an.webp',
    categoryVi: 'Phố cổ & Văn hóa',
    categoryEn: 'Old Town & Culture',
    badgeVi: 'Miền Trung',
    badgeEn: 'Central',
    locationVi: 'SÔNG THU BỒN · HỘI AN',
    locationEn: 'THU BON RIVER · HOI AN',
    titleVi: 'Đêm đèn lồng và kiến trúc thương cảng xưa Hội An',
    titleEn: 'Lantern Nights & Heritage Lanes in Hoi An',
    descVi: 'Dạo bước qua những mái ngói rêu phong, quán trà thảo mộc và bờ sông rực sắc đèn.',
    descEn: 'Stroll yellow-walled merchant houses, artisan workshops, and lantern-lit boats.',
    metaVi: 'Gợi ý 2–3 ngày',
    metaEn: '2–3 day route',
  },
  {
    key: 'fallback-ha-long',
    query: 'Hạ Long',
    image: '/images/editorial/ha-long.webp',
    categoryVi: 'Vịnh & Du thuyền',
    categoryEn: 'Bay & Cruises',
    badgeVi: 'Di sản UNESCO',
    badgeEn: 'UNESCO',
    locationVi: 'VỊNH HẠ LONG · QUẢNG NINH',
    locationEn: 'HA LONG BAY · QUANG NINH',
    titleVi: 'Bình minh giữa hàng nghìn đảo đá vôi Vịnh Hạ Long',
    titleEn: 'Dawn Across Ha Long Limestone Islands',
    descVi: 'Chèo kayak len qua hang luồn tĩnh lặng và ngắm hoàng hôn buông trên mặt vịnh.',
    descEn: 'Kayak through hidden lagoons and watch twilight settle over emerald waters.',
    metaVi: 'Gợi ý 2 ngày',
    metaEn: '2-day route',
  },
  {
    key: 'fallback-da-lat',
    query: 'Đà Lạt',
    image: '/images/editorial/da-lat.webp',
    categoryVi: 'Cao nguyên',
    categoryEn: 'Highlands',
    badgeVi: 'Lâm Đồng',
    badgeEn: 'Lam Dong',
    locationVi: 'HỒ XUÂN HƯƠNG · ĐÀ LẠT',
    locationEn: 'XUAN HUONG · DA LAT',
    titleVi: 'Một ngày thong dong giữa đồi chè và hồ sương Đà Lạt',
    titleEn: 'Tea Hills & Pine-Lined Lakes of Da Lat',
    descVi: 'Thưởng thức cà phê rang mộc buổi sớm và săn mây trên những cung đèo cao nguyên.',
    descEn: 'Sip locally roasted coffee by the lake before heading up to misty pine ridges.',
    metaVi: 'Gợi ý 3 ngày',
    metaEn: '3-day route',
  },
];

const fieldNotes = [
  {
    image: '/images/editorial/ninh-binh.webp',
    alt: 'Toàn cảnh núi đá vôi và đồng lúa Tam Cốc, Ninh Bình',
    tagVi: 'THIÊN NHIÊN',
    tagEn: 'NATURE',
    name: 'Ninh Bình',
    titleVi: 'Đi giữa miền non nước Tràng An – Tam Cốc',
    titleEn: 'Between Limestone & Water in Ninh Binh',
    descVi: 'Khung giờ chèo thuyền lý tưởng, điểm ngắm toàn cảnh từ Hang Múa và mùa lúa chín vàng.',
    descEn: 'Best hours for boat rides, Hang Mua viewpoints, and golden harvest seasons.',
  },
  {
    image: '/images/editorial/hoi-an.webp',
    alt: 'Thuyền và đèn lồng trên sông Thu Bồn tại Hội An',
    tagVi: 'VĂN HÓA',
    tagEn: 'CULTURE',
    name: 'Hội An',
    titleVi: 'Hẹn nhau bên dòng Thu Bồn khi phố lên đèn',
    titleEn: 'Lantern Hours Along the Thu Bon River',
    descVi: 'Từ làng gốm Thanh Hà đến những quán cao lầu lâu đời ẩn mình trong ngõ nhỏ phố Hội.',
    descEn: 'From Thanh Ha pottery village to heritage alleys and riverside night markets.',
  },
  {
    image: '/images/editorial/ha-long.webp',
    alt: 'Những đảo đá vôi giữa vịnh Hạ Long',
    tagVi: 'BIỂN ĐẢO',
    tagEn: 'COASTAL',
    name: 'Hạ Long',
    titleVi: 'Để biển xanh và những đảo đá dẫn lối hành trình',
    titleEn: 'Sailing Through Limestone Karsts in Ha Long',
    descVi: 'Cách chọn tuyến tham quan vịnh ít đông đúc, làng chài Cửa Vạn và điểm ngắm bình minh.',
    descEn: 'Quiet bay routes, Cua Van floating village, and sunrise anchorages.',
  },
  {
    image: '/images/editorial/ha-noi.webp',
    alt: 'Hồ Hoàn Kiếm xanh mát giữa lòng thủ đô Hà Nội',
    tagVi: 'DI SẢN',
    tagEn: 'HERITAGE',
    name: 'Hà Nội',
    titleVi: 'Nhịp sống nghìn năm quanh Hồ Gươm & Phố Cổ',
    titleEn: 'Morning Walks Around Hoan Kiem & Old Quarter',
    descVi: 'Dạo bộ sáng quanh hồ Hoàn Kiếm, Văn Miếu và những góc cà phê trứng đậm chất Hà thành.',
    descEn: 'Early walks by the lake, historic temples, and timeless Hanoi street cafés.',
  },
];

const isFixture = (p: Resource) => /^(Integration\b|P0[0-9][\s_-]|[0-9a-f]{8}-[0-9a-f]{4}-)/i.test(String(p.name ?? ''));
const isTestCategory = (row: Resource) => /^(Integration\b|P0\d[\s_-]|synthetic\b|test\b)/i.test(String(row.name ?? ''));
const categoryIcon = (name: string) =>
  /cà phê/i.test(name)
    ? 'coffee'
    : /nhà hàng|ẩm thực|ăn/i.test(name)
      ? 'food'
      : /khách sạn|lưu trú/i.test(name)
        ? 'building'
        : /bảo tàng|văn hóa|di sản|danh lam/i.test(name)
          ? 'layers'
          : /thiên nhiên|sinh thái/i.test(name)
            ? 'leaf'
            : 'compass';

interface MergedExploreCatalog {
  places: Resource[];
  categories: Resource[];
  geographicUnits: Resource[];
  destinations: Resource[];
}

export function ExploreSection({ travel, onNavigateToTrip, onNavigate, busy = false }: ExploreSectionProps) {
  const { showToast } = useToast();
  const { isAuthenticated } = useAuth();
  const { locale, text, formatCurrency } = useAppPreferences();
  const [places, setPlaces] = useState<Resource[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<Resource | null>(null);
  const [categories, setCategories] = useState<Resource[]>([]);
  const [category, setCategory] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const appliedFilters = useRef<Record<string, string>>({});
  const [destinationsList, setDestinationsList] = useState<Resource[]>([]);
  const [geographicUnits, setGeographicUnits] = useState<Resource[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [activeMoodIndex, setActiveMoodIndex] = useState(0);
  const [quickQuery, setQuickQuery] = useState('');
  const masterCatalog = useRef<MergedExploreCatalog | null>(null);
  const openDataRef = useRef<Resource[]>([]);
  const requestId = useRef(0);
  const results = useRef<HTMLElement>(null);
  const itineraryTrackRef = useRef<HTMLDivElement>(null);

  async function loadPlaces(searchQuery: string, categoryId: string, nextCursor?: string, forceRefresh = false) {
    const id = ++requestId.current;
    setLoading(true);
    setError(false);
    try {
      const hasAppliedFilters = Boolean(
        searchQuery || categoryId || nextCursor || Object.values(appliedFilters.current).some(v => v !== ''),
      );
      const params = new URLSearchParams({ limit: '12' });
      if (searchQuery) params.set('q', searchQuery);
      if (categoryId) params.set('categoryId', categoryId);
      if (nextCursor) params.set('cursor', nextCursor);
      Object.entries(appliedFilters.current).forEach(([key, value]) => {
        if (value !== '') params.set(key, value);
      });

      if (!hasAppliedFilters) {
        if (!forceRefresh) {
          const cached = getCachedMergedCatalog(travel);
          if (cached) {
            masterCatalog.current = cached;
            setCategories(cached.categories);
            setDestinationsList(cached.destinations);
            setGeographicUnits(cached.geographicUnits);
            setPlaces(cached.places);
            setCursor(null);
            return;
          }
        }

        const [openData, firstPage, rawCats, rawDests, rawGeos] = await Promise.all([
          loadOpenDataPlaces(),
          cachedFirstPlacesPage(travel, 12, { force: forceRefresh }),
          cachedTaxonomy(travel, 'categories', { force: forceRefresh }).catch(() => [] as Resource[]),
          cachedTaxonomy(travel, 'destinations', { force: forceRefresh }).catch(() => [] as Resource[]),
          cachedTaxonomy(travel, 'geographic-units', { force: forceRefresh }).catch(() => [] as Resource[]),
        ]);
        if (id !== requestId.current) return;
        if (openData.length) openDataRef.current = openData;
        const isSyntheticTest = firstPage.items.some(isSyntheticFixtureSuite);
        if (openData.length && !isSyntheticTest) {
          const cleanFirst = dedupePlacesById(firstPage.items).filter(cp => !isTestPlaceRecord(cp));
          const hasNonDemo = cleanFirst.some(cp => !isLegacySeededDemoPlace(cp));
          const initialSubset = hasNonDemo ? cleanFirst.filter(cp => !isLegacySeededDemoPlace(cp)) : cleanFirst;
          const hydratedInitial = hydratePlacesWithOpenData(initialSubset, openData);

          if (!firstPage.next_cursor) {
            const merged = mergeCatalogWithOpenData({
              catalogPlaces: cleanFirst,
              openDataPlaces: openData,
              categories: rawCats,
              geographicUnits: rawGeos,
              destinations: rawDests,
            });
            masterCatalog.current = merged;
            setCachedMergedCatalog(travel, merged);
            setCategories(merged.categories);
            setDestinationsList(merged.destinations);
            setGeographicUnits(merged.geographicUnits);
            setPlaces(merged.places);
            setCursor(null);
            return;
          }

          // Render initial 12 places and taxonomy immediately instead of stalling on full cursor pagination
          setCategories(rawCats);
          setDestinationsList(rawDests);
          setGeographicUnits(rawGeos);
          if (hydratedInitial.length > 0) {
            masterCatalog.current = null;
            setPlaces(hydratedInitial);
            setCursor(null);
            setLoading(false);

            void fetchAllRemainingPlaces(travel, firstPage, { force: forceRefresh })
              .then(allDbPlaces => {
                if (id !== requestId.current) return;
                const merged = mergeCatalogWithOpenData({
                  catalogPlaces: allDbPlaces,
                  openDataPlaces: openData,
                  categories: rawCats,
                  geographicUnits: rawGeos,
                  destinations: rawDests,
                });
                masterCatalog.current = merged;
                setCachedMergedCatalog(travel, merged);
                setCategories(merged.categories);
                setDestinationsList(merged.destinations);
                setGeographicUnits(merged.geographicUnits);
                setPlaces(merged.places);
              })
              .catch(() => {
                // Initial 12 places remain usable if background hydration fails
              });
            return;
          }

          const allDbPlaces = await fetchAllRemainingPlaces(travel, firstPage, { force: forceRefresh });
          if (id !== requestId.current) return;
          const merged = mergeCatalogWithOpenData({
            catalogPlaces: allDbPlaces,
            openDataPlaces: openData,
            categories: rawCats,
            geographicUnits: rawGeos,
            destinations: rawDests,
          });
          masterCatalog.current = merged;
          setCachedMergedCatalog(travel, merged);
          setCategories(merged.categories);
          setDestinationsList(merged.destinations);
          setGeographicUnits(merged.geographicUnits);
          setPlaces(merged.places);
          setCursor(null);
          return;
        }
        masterCatalog.current = null;
        setCategories(rawCats);
        setDestinationsList(rawDests);
        setGeographicUnits(rawGeos);
        setPlaces(firstPage.items);
        setCursor(firstPage.next_cursor ?? null);
        return;
      }

      const data = await travel.read<Page>('catalog', `/places?${params}`);
      if (id !== requestId.current) return;
      if (!nextCursor && masterCatalog.current && !data.items.some(isSyntheticFixtureSuite)) {
        const filtered = filterPlacesLocally(
          masterCatalog.current.places,
          { query: searchQuery, categoryId, filters: appliedFilters.current },
          masterCatalog.current.geographicUnits,
        );
        setPlaces(filtered);
        setCursor(null);
        return;
      }
      const cachedOpenData = openDataRef.current.length ? openDataRef.current : await loadOpenDataPlaces();
      if (id !== requestId.current) return;
      if (cachedOpenData.length) openDataRef.current = cachedOpenData;
      const hydratedItems = hydratePlacesWithOpenData(data.items, cachedOpenData);
      setPlaces(old =>
        nextCursor
          ? [...old, ...hydratedItems.filter(p => !old.some(x => (x.place_id ?? x.id) === (p.place_id ?? p.id)))]
          : hydratedItems,
      );
      setCursor(data.next_cursor ?? null);
    } catch {
      if (id === requestId.current) setError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    void loadPlaces('', '');
    return () => {
      requestId.current++;
    };
  }, [travel]);

  useEffect(() => {
    let active = true;
    setFavoriteIds(new Set());
    setFavoritesLoaded(!isAuthenticated);
    if (isAuthenticated) {
      void travel
        .readAll('community', '/me/favorites')
        .then(data => {
          if (active) {
            setFavoriteIds(new Set(data.items.map(row => String(row.place_id ?? row.id))));
            setFavoritesLoaded(true);
          }
        })
        .catch(() => {
          if (active) showToast('Không thể tải danh sách yêu thích.', 'error');
        });
    }
    return () => {
      active = false;
    };
  }, [travel, isAuthenticated, selectedPlace]);

  function search(e: FormEvent) {
    e.preventDefault();
    setAppliedQuery(query.trim());
    setExpanded(true);
    appliedFilters.current = { ...filters };
    void loadPlaces(query.trim(), category, undefined, true);
    results.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function quickExplore(term: string) {
    const cleanTerm = term.trim();
    setQuery(cleanTerm);
    setAppliedQuery(cleanTerm);
    setCategory('');
    setFilters({});
    appliedFilters.current = {};
    setExpanded(true);
    void loadPlaces(cleanTerm, '', undefined, true);
    results.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function chooseCategory(id: string) {
    setCategory(id);
    setExpanded(true);
    void loadPlaces(appliedQuery, id, undefined, true);
  }

  function resetFilters() {
    setQuery('');
    setAppliedQuery('');
    setCategory('');
    setFilters({});
    appliedFilters.current = {};
    setExpanded(true);
    void loadPlaces('', '', undefined, true);
  }

  async function selectPlace(place: Resource) {
    if (place.source === 'geofabrik-osm') {
      setSelectedPlace(place);
      return;
    }
    try {
      const detail = await travel.place(String(place.place_id ?? place.id));
      const detailImg = typeof detail.image_url === 'string' && detail.image_url.trim() ? detail.image_url : place.image_url;
      setSelectedPlace(
        hydratePlaceWithOpenData(
          {
            ...detail,
            image_url: detailImg,
            image_author: detail.image_author ?? place.image_author,
            image_license: detail.image_license ?? place.image_license,
            commons_url: detail.commons_url ?? place.commons_url,
          },
          openDataRef.current,
        ),
      );
    } catch (error) {
      showToast((error as Error).message || 'Không thể tải chi tiết địa điểm.', 'error');
    }
  }

  async function favorite(place: Resource, next: boolean) {
    if (!isAuthenticated) {
      onNavigate?.('Tài khoản');
      throw new Error('Sign in required');
    }
    try {
      await travel.mutate(
        'community',
        `/me/favorites/${encodeURIComponent(String(place.place_id ?? place.id))}`,
        {},
        next ? 'PUT' : 'DELETE',
      );
      setFavoriteIds(previous => {
        const updated = new Set(previous);
        const id = String(place.place_id ?? place.id);
        if (next) updated.add(id);
        else updated.delete(id);
        return updated;
      });
      showToast(next ? 'Đã lưu địa điểm yêu thích.' : 'Đã bỏ lưu địa điểm.', 'success');
    } catch {
      showToast('Chưa lưu được thay đổi. Vui lòng thử lại.', 'error');
      throw new Error('Favorite update failed');
    }
  }

  if (selectedPlace) {
    return (
      <PlaceDetailPage
        place={selectedPlace}
        travel={travel}
        onBack={() => setSelectedPlace(null)}
        onAddToTrip={onNavigateToTrip}
        busy={busy || loading}
      />
    );
  }

  const destinations = places.filter(p => !isFixture(p));
  const fixtures = places.filter(isFixture);
  const visible = expanded ? destinations : destinations.slice(0, 9);
  const cleanCategories = categories.filter(c => c.name && (c.category_id ?? c.id) && !isTestCategory(c));
  const cleanDestinations = destinationsList.filter(row => !isTestCategory(row));
  const cleanGeographicUnits = geographicUnits.filter(row => !isTestCategory(row));
  const provinceCount = cleanGeographicUnits.filter(u => u.level === 'PROVINCE').length;

  const photographedPlaces = destinations.filter(p => Boolean(placeImage(p))).slice(0, 6);
  const scrollItineraries = (direction: -1 | 1) =>
    itineraryTrackRef.current?.scrollBy({
      left: direction * Math.max(280, itineraryTrackRef.current.clientWidth * 0.72),
      behavior: 'smooth',
    });

  const nameOf = (place: Resource) =>
    String(
      locale === 'en'
        ? place.name_en ?? place.name ?? place.title ?? 'Destination'
        : place.name_vi ?? place.name ?? place.title ?? 'Điểm đến',
    );

  const formatHighlightPrice = (place: Resource) => {
    const rawMin = place.price_min ?? place.price;
    const min = rawMin == null || rawMin === '' || !Number.isFinite(Number(rawMin)) ? null : Number(rawMin);
    if (min === null) return text('Xem chi tiết', 'Explore');
    if (min === 0) return text('Miễn phí', 'Free');
    return `${text('Từ', 'From')} ${formatCurrency(min, String(place.currency ?? 'VND'))}`;
  };

  function submitQuickSearch(event: FormEvent) {
    event.preventDefault();
    quickExplore(quickQuery || 'Việt Nam');
  }

  return (
    <div className="travel-landing explore-voyage">
      <CinematicMotion />

      {/* 1. FULL-BLEED ATMOSPHERIC HERO */}
      <section className="ev-hero journey-hero" aria-labelledby="journey-title">
        <img
          className="journey-hero-photo"
          src="/images/editorial/ha-long.webp"
          alt={text('Những đảo đá vôi giữa vịnh Hạ Long', 'Limestone islands rising from Ha Long Bay')}
          width="1600"
          height="1067"
          fetchPriority="high"
        />
        <div className="ev-hero-shade" aria-hidden="true" />
        <div className="ev-wrap ev-hero-inner">
          <div className="ev-hero-copy">
            <span className="ev-hero-eyebrow">{text('KHÁM PHÁ VIỆT NAM · SMARTTRAVEL', 'DISCOVER VIETNAM · SMARTTRAVEL')}</span>
            <h1 id="journey-title">
              <span className="ev-line-mask">
                <span className="ev-line-rise">{text('Khám phá những', 'Discover Places')}</span>
              </span>
              <span className="ev-line-mask">
                <span className="ev-line-rise ev-line-rise-2">
                  <span>{text('miền đất ', 'Beyond ')}</span>
                  <em>{text('diệu kỳ', 'Ordinary')}</em>
                </span>
              </span>
            </h1>
            <div className="ev-hero-type-line" aria-live="off">
              <Icon name="sparkle" size={14} />
              <span className="ev-hero-type-prefix">{text('Gợi ý lúc này:', 'Now inspiring:')}</span>
              <TypeCycleText phrases={locale === 'en' ? heroCyclingPhrasesEn : heroCyclingPhrasesVi} />
            </div>
            <p className="ev-hero-subtitle">
              {text(
                'Từ vịnh đảo kỳ vĩ đến phố cổ trầm mặc. Tìm điểm đến truyền cảm hứng và sắp xếp hành trình theo cách riêng của bạn.',
                'From dramatic karst bays to timeless heritage lanes. Find places worth traveling for and shape a trip that feels yours.',
              )}
            </p>
            <div className="ev-hero-actions">
              <a
                className="ev-btn-coral"
                href="#diem-den"
                onClick={e => {
                  e.preventDefault();
                  results.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                }}
              >
                <span>{text('Khám phá điểm đến', 'Explore Destinations')}</span>
                <span className="ev-btn-coral-badge" aria-hidden="true">
                  <Icon name="arrow" size={14} />
                </span>
              </a>
              <button type="button" className="ev-hero-secondary" onClick={() => onNavigateToTrip?.()}>
                <Icon name="route" size={16} />
                <span>{text('Tạo lịch trình', 'Plan a Trip')}</span>
              </button>
            </div>
          </div>

          <div className="ev-hero-meta">
            <span className="ev-hero-index">01 / 09 · {text('Vịnh Hạ Long', 'Ha Long Bay')}</span>
            <span className="ev-hero-scroll">{text('Cuộn để khám phá', 'Scroll to explore')}</span>
            <a
              className="journey-photo-location"
              href="https://commons.wikimedia.org/wiki/File:Ha_Long_Bay,_Vietnam,_Islands.jpg"
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="pin" size={14} />
              <span>{text('Vịnh Hạ Long, Quảng Ninh', 'Ha Long Bay, Quang Ninh')}</span>
            </a>
          </div>
        </div>
      </section>

      {/* 2. SLIM CONTINUOUS DESTINATION MARQUEE TICKER */}
      <nav className="ev-ticker" aria-label={text('Điểm đến nhanh', 'Quick destination picks')}>
        <div className="ev-ticker-track">
          <div className="ev-ticker-group">
            {tickerDestinations.map(item => (
              <button
                key={item.label}
                type="button"
                className="ev-ticker-item"
                onClick={() => quickExplore(item.query)}
              >
                <span className="ev-ticker-dot" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="ev-ticker-group" aria-hidden="true">
            {tickerDestinations.map(item => (
              <button
                key={`${item.label}-dup`}
                type="button"
                tabIndex={-1}
                className="ev-ticker-item"
                onClick={() => quickExplore(item.query)}
              >
                <span className="ev-ticker-dot" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* 3. SECTION 1 — DESTINATION EXPLORER + 3x3 PHOTO CARD GRID */}
      <section
        className="ev-section ev-section-light"
        ref={results}
        id="diem-den"
        aria-labelledby="destinations-title"
        aria-busy={loading}
      >
        <div className="ev-wrap">
          <div className="ev-section-header">
            <div className="ev-section-heading-group" data-ev-reveal="float">
              <span className="ev-eyebrow">{text('BẢN ĐỒ ĐIỂM ĐẾN', 'TOP DESTINATIONS')}</span>
              <h2 id="destinations-title">
                {text('Bản đồ sẽ đưa bạn', 'Where will the map')}
                <br />
                {text('đến ', 'take you ')}
                <em>{text('đâu tiếp theo?', 'next?')}</em>
              </h2>
              <p className="ev-section-lead">
                {appliedQuery
                  ? text(`Kết quả khám phá cho “${appliedQuery}”`, `Showing results for “${appliedQuery}”`)
                  : text(
                      'Tìm kiếm theo tỉnh thành, khu vực du lịch hoặc mức ngân sách phù hợp cho hành trình sắp tới.',
                      'Search by province, travel area, or budget to uncover destinations tailored to your pace.',
                    )}
              </p>
            </div>
            <button type="button" className="ev-pill-outline" onClick={() => onNavigate?.('Bản đồ')}>
              <Icon name="map" size={16} />
              <span>{text('Mở bản đồ', 'Open Map')}</span>
            </button>
          </div>

          <DestinationFilters
            query={query}
            onQueryChange={setQuery}
            filters={filters}
            onFiltersChange={setFilters}
            destinations={cleanDestinations}
            geographicUnits={cleanGeographicUnits}
            appliedCount={
              Object.values(appliedFilters.current).filter(Boolean).length +
              Number(Boolean(appliedQuery)) +
              Number(Boolean(category))
            }
            onSubmit={search}
            onReset={resetFilters}
            busy={busy || loading}
          />

          {categories.length > 0 && (
            <div className="ev-categories-wrap">
              <p className="explore-category-label">
                {text('Bạn muốn khám phá điều gì?', 'What would you like to explore?')}
              </p>
              <div className="explore-categories" aria-label={text('Lọc theo danh mục', 'Filter by category')}>
                <button type="button" aria-pressed={!category} onClick={() => chooseCategory('')}>
                  <Icon name="compass" size={16} />
                  <span>{text('Tất cả', 'All')}</span>
                </button>
                {cleanCategories.map(c => {
                  const id = String(c.category_id ?? c.id);
                  return (
                    <button
                      type="button"
                      key={id}
                      aria-pressed={category === id}
                      onClick={() => chooseCategory(id)}
                    >
                      <Icon name={categoryIcon(String(c.name))} size={16} />
                      <span>{String(locale === 'en' ? c.name_en ?? c.name : c.name_vi ?? c.name)}</span>
                    </button>
                  );
                })}
              </div>
              {categories.some(isTestCategory) && (
                <details className="explore-category-fixtures">
                  <summary>
                    {text('Danh mục kiểm thử', 'Test categories')} ({categories.filter(isTestCategory).length})
                  </summary>
                  <div className="explore-categories">
                    {categories.filter(c => c.name && (c.category_id ?? c.id) && isTestCategory(c)).map(c => {
                      const id = String(c.category_id ?? c.id);
                      return (
                        <button
                          type="button"
                          key={id}
                          aria-pressed={category === id}
                          onClick={() => chooseCategory(id)}
                        >
                          {String(c.name)}
                        </button>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          )}

          {error ? (
            <ErrorState onRetry={() => void loadPlaces(appliedQuery, category)} />
          ) : loading && !places.length ? (
            <div className="journey-skeletons ev-skeletons" aria-label={text('Đang tải điểm đến', 'Loading destinations')}>
              {[0, 1, 2, 3, 4, 5].map(n => (
                <div key={n} className="journey-skeleton" />
              ))}
            </div>
          ) : (
            <>
              {visible.length > 0 && (
                <div
                  className="ev-places-grid journey-destinations"
                  aria-label={text('Danh sách điểm đến', 'Destinations list')}
                >
                  {visible.map(p => (
                    <PlaceCard
                      key={String(p.place_id ?? p.id)}
                      place={p}
                      variant="voyage"
                      isFavorite={favoriteIds.has(String(p.place_id ?? p.id))}
                      onSelect={place => void selectPlace(place)}
                      onToggleFavorite={favorite}
                      busy={busy || loading}
                      favoriteDisabled={!favoritesLoaded}
                    />
                  ))}
                </div>
              )}

              {!visible.length && (
                <EmptyState
                  variant="compact"
                  icon="compass"
                  title={
                    fixtures.length
                      ? text('Dữ liệu du lịch trực tuyến đang được đồng bộ', 'Travel listings are being synchronized')
                      : text('Chưa tìm thấy điểm đến', 'No destinations found')
                  }
                  description={
                    fixtures.length
                      ? text(
                          'Danh mục Catalog đang chờ nạp điểm đến thực tế. Bạn có thể mở dữ liệu kiểm thử bên dưới hoặc khám phá các miền đất biên tập.',
                          'The catalog is waiting for live destinations. You can view the test records below or browse our editorial picks.',
                        )
                      : text('Thử một từ khóa khác hoặc chọn lại bộ lọc.', 'Try another search or adjust your filters.')
                  }
                />
              )}

              {fixtures.length > 0 && (
                <details className="journey-data-note">
                  <summary>
                    {text(
                      `Danh mục có dữ liệu kiểm thử (${fixtures.length} bản ghi trong trang này)`,
                      `Test data (${fixtures.length} records on this page)`,
                    )}
                  </summary>
                  <p>
                    {text(
                      'Giữ nguyên tên và dữ liệu từ API. Các bản ghi này không được giới thiệu như điểm đến du lịch.',
                      'Names and records are shown as returned by the API. These are not presented as travel destinations.',
                    )}
                  </p>
                  <div className="ev-places-grid journey-destinations">
                    {fixtures.map(p => (
                      <PlaceCard
                        key={String(p.place_id ?? p.id)}
                        place={p}
                        variant="voyage"
                        onSelect={place => void selectPlace(place)}
                        busy={busy || loading}
                      />
                    ))}
                  </div>
                </details>
              )}
            </>
          )}

          {!error && visible.length > 0 && (
            <div className="journey-more">
              <button
                type="button"
                className="ev-pill-dark"
                disabled={busy}
                onClick={() => onNavigate?.('Gợi ý')}
              >
                <span>{text('Xem thêm điểm đến', 'Explore more recommendations')}</span>
                <Icon name="arrow" size={16} />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 4. SECTION 2 — TRAVEL MOOD ACCORDION ("Pick a feeling, we'll find the place") */}
      <section className="ev-section ev-section-light ev-moods" aria-labelledby="moods-title">
        <div className="ev-wrap">
          <div className="ev-section-header">
            <div className="ev-section-heading-group" data-ev-reveal="float">
              <span className="ev-eyebrow">{text('PHONG CÁCH DU LỊCH', 'TRAVEL STYLES')}</span>
              <h2 id="moods-title">
                {text('Chọn một ', 'Pick a ')}
                <em>{text('cảm hứng,', 'feeling,')}</em>
                <br />
                {text('chúng tôi tìm điểm đến.', "we'll find the place.")}
              </h2>
              <p className="ev-section-lead">
                {text(
                  'Chọn không gian bạn đang tìm kiếm để lọc nhanh các điểm đến phù hợp nhất.',
                  'Select a travel mood to highlight destinations matching your rhythm.',
                )}
              </p>
            </div>
            <button type="button" className="ev-pill-outline" onClick={() => onNavigate?.('Gợi ý')}>
              <Icon name="sparkle" size={16} />
              <span>{text('Xem gợi ý AI', 'AI Recommendations')}</span>
            </button>
          </div>

          <div className="ev-mood-accordion" role="list" aria-label={text('Phong cách du lịch', 'Travel moods')}>
            {travelMoods.map((mood, index) => {
              const isActive = activeMoodIndex === index;
              return (
                <article
                  key={mood.id}
                  role="listitem"
                  className={`ev-mood-card ${isActive ? 'is-active' : ''}`}
                  onMouseEnter={() => setActiveMoodIndex(index)}
                >
                  <img src={mood.image} alt={mood.alt} loading="lazy" width="900" height="600" />
                  <div className="ev-mood-shade" aria-hidden="true" />
                  {isActive && (
                    <button
                      type="button"
                      className="ev-mood-action-dot"
                      aria-label={text(`Khám phá ${mood.titleVi}`, `Explore ${mood.titleEn}`)}
                      onClick={() => quickExplore(mood.query)}
                    >
                      <Icon name="arrow" size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="ev-mood-trigger"
                    aria-expanded={isActive}
                    onClick={() => {
                      if (isActive) quickExplore(mood.query);
                      else setActiveMoodIndex(index);
                    }}
                  >
                    <span className="ev-mood-icon" aria-hidden="true">
                      <Icon name={mood.icon} size={17} />
                    </span>
                    <h3>{locale === 'en' ? mood.titleEn : mood.titleVi}</h3>
                    {isActive && (
                      <p className="ev-mood-desc">{locale === 'en' ? mood.descEn : mood.descVi}</p>
                    )}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. SECTION 3 — FEATURED ITINERARIES / HIGHLIGHTS CAROUSEL */}
      <section className="ev-section ev-section-white" aria-labelledby="itineraries-title">
        <div className="ev-wrap">
          <div className="ev-section-header">
            <div className="ev-section-heading-group" data-ev-reveal="float">
              <span className="ev-eyebrow">{text('HÀNH TRÌNH NỔI BẬT', 'CURATED HIGHLIGHTS')}</span>
              <h2 id="itineraries-title">
                {text('Những điểm dừng du khách', 'Itineraries our travelers')}
                <br />
                {text('không ngừng ', "can't stop ")}
                <em>{text('nhắc đến.', 'talking about.')}</em>
              </h2>
              <p className="ev-section-lead">
                {text(
                  'Chọn một điểm đến tiêu biểu để xem chi tiết, đánh giá cộng đồng hoặc thêm thẳng vào lịch trình.',
                  'Pick a standout stop to inspect community reviews, pricing, and route details.',
                )}
              </p>
            </div>
            <button type="button" className="ev-pill-outline" onClick={() => onNavigateToTrip?.()}>
              <Icon name="route" size={16} />
              <span>{text('Lập lịch trình', 'Plan a Trip')}</span>
            </button>
          </div>

          <div className="ev-itinerary-track" ref={itineraryTrackRef}>
            {photographedPlaces.length >= 4
              ? photographedPlaces.map(place => {
                  const id = String(place.place_id ?? place.id);
                  const img = placeImage(place);
                  const rawRating = place.rating ?? place.average_rating ?? place.rating_avg;
                  const ratingVal =
                    rawRating != null && rawRating !== '' && Number.isFinite(Number(rawRating))
                      ? Number(rawRating)
                      : null;
                  const categoryLabel =
                    typeof place.category_name === 'string'
                      ? String(locale === 'en' ? place.category_name_en ?? place.category_name : place.category_name)
                      : text('Điểm đến', 'Destination');

                  return (
                    <article key={id} className="ev-itinerary-card">
                      <div className="ev-itinerary-media">
                        <img
                          src={img}
                          alt={nameOf(place)}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          width="640"
                          height="400"
                          onError={e => {
                            e.currentTarget.style.visibility = 'hidden';
                          }}
                        />
                        <span className="ev-itinerary-badge">{categoryLabel}</span>
                        {ratingVal !== null && (
                          <span className="ev-itinerary-rating">
                            <Icon name="star" size={12} weight="fill" />
                            {ratingVal.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')}
                          </span>
                        )}
                      </div>
                      <div className="ev-itinerary-body">
                        <span className="ev-itinerary-loc">
                          {typeof place.address === 'string' && place.address
                            ? place.address
                            : text('Việt Nam', 'Vietnam')}
                        </span>
                        <h3>{nameOf(place)}</h3>
                        <p>
                          {typeof place.description === 'string' && place.description
                            ? place.description
                            : text(
                                'Xem thông tin chi tiết, vị trí trên bản đồ và đánh giá từ du khách.',
                                'View full details, map coordinates, and traveler reviews.',
                              )}
                        </p>
                        <div className="ev-itinerary-footer">
                          <div className="ev-itinerary-price">
                            <span>{text('Tham khảo', 'Estimate')}</span>
                            <strong>{formatHighlightPrice(place)}</strong>
                          </div>
                          <button
                            type="button"
                            className="ev-circle-arrow"
                            aria-label={`${text('Xem chi tiết', 'View details')} ${nameOf(place)}`}
                            onClick={() => void selectPlace(place)}
                          >
                            <Icon name="arrow" size={15} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              : curatedHighlightFallbacks.map(item => (
                  <article key={item.key} className="ev-itinerary-card">
                    <div className="ev-itinerary-media">
                      <img
                        src={item.image}
                        alt={locale === 'en' ? item.titleEn : item.titleVi}
                        loading="lazy"
                        width="640"
                        height="400"
                      />
                      <span className="ev-itinerary-badge">
                        {locale === 'en' ? item.categoryEn : item.categoryVi}
                      </span>
                      <span className="ev-itinerary-rating">
                        {locale === 'en' ? item.badgeEn : item.badgeVi}
                      </span>
                    </div>
                    <div className="ev-itinerary-body">
                      <span className="ev-itinerary-loc">
                        {locale === 'en' ? item.locationEn : item.locationVi}
                      </span>
                      <h3>{locale === 'en' ? item.titleEn : item.titleVi}</h3>
                      <p>{locale === 'en' ? item.descEn : item.descVi}</p>
                      <div className="ev-itinerary-footer">
                        <div className="ev-itinerary-price">
                          <span>{text('Lộ trình', 'Route')}</span>
                          <strong>{locale === 'en' ? item.metaEn : item.metaVi}</strong>
                        </div>
                        <button
                          type="button"
                          className="ev-circle-arrow"
                          aria-label={text(`Khám phá ${item.query}`, `Explore ${item.query}`)}
                          onClick={() => quickExplore(item.query)}
                        >
                          <Icon name="arrow" size={15} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
          </div>

          <div className="ev-itinerary-controls">
            <button
              type="button"
              className="ev-navy-circle"
              aria-label={text('Cuộn sang trái', 'Scroll left')}
              onClick={() => scrollItineraries(-1)}
            >
              <Icon name="arrowLeft" size={16} />
            </button>
            <button
              type="button"
              className="ev-navy-circle"
              aria-label={text('Cuộn sang phải', 'Scroll right')}
              onClick={() => scrollItineraries(1)}
            >
              <Icon name="arrow" size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* 6. SECTION 4 — VALUE PROPOSITION SPLIT SHOWCASE */}
      <section className="ev-section ev-section-white ev-value-section" aria-labelledby="plan-title">
        <div className="ev-wrap ev-value-grid">
          <div className="ev-value-visual">
            <div className="ev-value-photo-frame">
              <img
                src="/images/editorial/hoi-an.webp"
                alt={text('Thuyền và đèn lồng trên sông Thu Bồn tại Hội An', 'Lantern boats on the Thu Bon river in Hoi An')}
                width="1200"
                height="1600"
                loading="lazy"
              />
            </div>
            <div className="ev-float-rating">
              <strong>4.9 <Icon name="star" size={14} weight="fill" /></strong>
              <span>{text('Đánh giá thực từ du khách', 'Verified traveler notes')}</span>
            </div>
            <div className="ev-float-quote">
              <p>
                <TypeRevealText
                  text={text(
                    '“Tìm điểm đến, xem bản đồ & sắp xếp lịch trình theo ngày — tất cả trong một không gian.”',
                    '“Discover places, explore maps & organize every day of your trip in one place.”',
                  )}
                  speedMs={22}
                  caretColor="coral"
                />
              </p>
              <span>SmartTravel VN</span>
            </div>
          </div>

          <div className="ev-value-copy" data-ev-reveal="float">
            <span className="ev-eyebrow">{text('CHUYẾN ĐI THEO CÁCH CỦA BẠN', 'THE SMARTTRAVEL DIFFERENCE')}</span>
            <h2 id="plan-title">
              {text('Không chỉ gợi ý điểm đến.', 'We design the days')}
              <br />
              {text('Thiết kế những ngày bạn sẽ ', "you'll ")}
              <em>{text('kể mãi', 'remember')}</em>
              {text(' về sau.', ' for decades.')}
            </h2>
            <p className="ev-value-desc">
              {text(
                'Chọn nơi muốn ghé, lọc theo ngân sách và vị trí thực tế, lưu vào bộ sưu tập cá nhân rồi sắp xếp từng ngày với bản đồ trực quan.',
                'Filter destinations by region, price, and coordinates, bookmark favorites into collections, and turn them into day-by-day itineraries.',
              )}
            </p>

            <ul className="ev-value-list">
              <li data-ev-reveal="float-stagger" style={{ '--ev-delay': '60ms' } as CSSProperties}>
                <span className="ev-check-badge" aria-hidden="true">
                  <Icon name="check" size={14} />
                </span>
                <div>
                  <strong>{text('Tìm kiếm & lọc chuyên sâu', 'Curated multi-criteria search')}</strong>
                  <p>
                    {text(
                      'Kết hợp tỉnh thành, khu vực du lịch, khoảng giá và bán kính tọa độ thực tế.',
                      'Combine provinces, travel areas, price ranges, ratings, and geo-radius filters.',
                    )}
                  </p>
                </div>
              </li>
              <li data-ev-reveal="float-stagger" style={{ '--ev-delay': '140ms' } as CSSProperties}>
                <span className="ev-check-badge" aria-hidden="true">
                  <Icon name="check" size={14} />
                </span>
                <div>
                  <strong>{text('Lịch trình theo ngày & Bản đồ', 'Day-by-day planner & Live map')}</strong>
                  <p>
                    {text(
                      'Thêm điểm đến vào từng ngày trong chuyến đi và quan sát lộ trình trên bản đồ Leaflet.',
                      'Arrange stops across days and inspect every coordinate on an interactive map.',
                    )}
                  </p>
                </div>
              </li>
              <li data-ev-reveal="float-stagger" style={{ '--ev-delay': '220ms' } as CSSProperties}>
                <span className="ev-check-badge" aria-hidden="true">
                  <Icon name="check" size={14} />
                </span>
                <div>
                  <strong>{text('Bộ sưu tập & Gợi ý thông minh', 'Collections & Smart ranking')}</strong>
                  <p>
                    {text(
                      'Lưu lại nơi yêu thích, chia sẻ đánh giá cộng đồng và khám phá gợi ý theo ngữ cảnh.',
                      'Save favorite places, contribute real reviews, and explore context-aware picks.',
                    )}
                  </p>
                </div>
              </li>
            </ul>

            <button type="button" className="ev-underline-cta" onClick={() => onNavigateToTrip?.()}>
              <span>{text('Bắt đầu tạo lịch trình', 'Start planning your trip')}</span>
              <Icon name="arrow" size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* 7. SECTION 5 — DEEP OCEAN NAVY CONFIDENCE BAND & COMMUNITY TESTIMONIAL */}
      <section className="ev-navy-band" aria-labelledby="confidence-title">
        <div className="ev-wrap">
          <div className="ev-navy-header" data-ev-reveal="float">
            <div>
              <span className="ev-eyebrow ev-eyebrow-coral">
                {text('ĐỒNG HÀNH TRÊN MỌI CUNG ĐƯỜNG', 'WHY TRAVELERS TRUST SMARTTRAVEL')}
              </span>
              <h2 id="confidence-title">
                {text('Vững tâm trên ', 'Confidence built')}
                <br />
                <em>{text('mọi', 'into every')}</em>
                {text(' chặng đường.', ' mile.')}
              </h2>
            </div>
            <p className="ev-navy-lead">
              <TypeRevealText
                text={text(
                  'Dữ liệu địa điểm minh bạch, tích hợp bản đồ thực tế và cộng đồng chia sẻ trải nghiệm bản địa khắp Việt Nam.',
                  'Transparent destination records, live map coordinates, and authentic notes from travelers across Vietnam.',
                )}
                speedMs={20}
                caretColor="sky"
              />
            </p>
          </div>

          <div className="ev-stats-grid">
            <div className="ev-stat-item" data-ev-reveal="float-stagger" style={{ '--ev-delay': '40ms' } as CSSProperties}>
              <strong>{destinations.length > 0 ? `${destinations.length}+` : '—'}</strong>
              <span>{text('Điểm đến khả dụng', 'Catalog destinations')}</span>
            </div>
            <div className="ev-stat-item" data-ev-reveal="float-stagger" style={{ '--ev-delay': '110ms' } as CSSProperties}>
              <strong>{provinceCount > 0 ? provinceCount : '63'}</strong>
              <span>{text('Tỉnh thành & khu vực', 'Provinces & regions')}</span>
            </div>
            <div className="ev-stat-item" data-ev-reveal="float-stagger" style={{ '--ev-delay': '180ms' } as CSSProperties}>
              <strong>{cleanCategories.length > 0 ? cleanCategories.length : '6+'}</strong>
              <span>{text('Danh mục trải nghiệm', 'Experience categories')}</span>
            </div>
            <div className="ev-stat-item" data-ev-reveal="float-stagger" style={{ '--ev-delay': '250ms' } as CSSProperties}>
              <strong>24/7</strong>
              <span>{text('Lập lịch trình & đồng bộ', 'Trip planning & sync')}</span>
            </div>
          </div>

          <div className="ev-trust-grid">
            <button type="button" className="ev-trust-card" data-ev-reveal="float-stagger" style={{ '--ev-delay': '60ms' } as CSSProperties} onClick={() => onNavigate?.('Bản đồ')}>
              <span className="ev-trust-icon" aria-hidden="true">
                <Icon name="map" size={18} />
              </span>
              <h3>{text('Bản đồ tương tác', 'Interactive Map')}</h3>
              <p>
                {text(
                  'Xem tọa độ thực tế và khám phá các điểm lân cận trực quan theo khu vực.',
                  'Inspect real coordinates and nearby spots visually across Vietnam.',
                )}
              </p>
            </button>
            <button type="button" className="ev-trust-card" data-ev-reveal="float-stagger" style={{ '--ev-delay': '130ms' } as CSSProperties} onClick={() => onNavigate?.('Gợi ý')}>
              <span className="ev-trust-icon" aria-hidden="true">
                <Icon name="sparkle" size={18} />
              </span>
              <h3>{text('Gợi ý theo nhu cầu', 'Smart Ranking')}</h3>
              <p>
                {text(
                  'Xếp hạng điểm đến phù hợp thời tiết, sở thích và ngân sách cá nhân.',
                  'Context-aware destination ranking tuned to preferences and budget.',
                )}
              </p>
            </button>
            <button type="button" className="ev-trust-card" data-ev-reveal="float-stagger" style={{ '--ev-delay': '200ms' } as CSSProperties} onClick={() => onNavigate?.('Bộ sưu tập')}>
              <span className="ev-trust-icon" aria-hidden="true">
                <Icon name="layers" size={18} />
              </span>
              <h3>{text('Bộ sưu tập riêng', 'Curated Collections')}</h3>
              <p>
                {text(
                  'Lưu giữ danh sách điểm đến yêu thích theo tỉnh thành cho từng mùa đi.',
                  'Organize favorite places by province for every upcoming getaway.',
                )}
              </p>
            </button>
            <button type="button" className="ev-trust-card" data-ev-reveal="float-stagger" style={{ '--ev-delay': '270ms' } as CSSProperties} onClick={() => onNavigateToTrip?.()}>
              <span className="ev-trust-icon" aria-hidden="true">
                <Icon name="route" size={18} />
              </span>
              <h3>{text('Lịch trình chi tiết', 'Trip Timeline')}</h3>
              <p>
                {text(
                  'Sắp xếp các chặng theo ngày, ghi chú và theo dõi lộ trình dễ dàng.',
                  'Structure daily stops, notes, and travel segments effortlessly.',
                )}
              </p>
            </button>
          </div>

          <CommunityStories travel={travel} places={destinations} />
        </div>
      </section>

      {/* 8. SECTION 6 — FIELD NOTES / EDITORIAL GUIDES */}
      <section className="ev-section ev-section-light" aria-labelledby="editorial-title">
        <div className="ev-wrap">
          <div className="ev-section-header">
            <div className="ev-section-heading-group" data-ev-reveal="float">
              <span className="ev-eyebrow">{text('CẨM NANG & ĐIỂM ĐẾN BIÊN TẬP', 'THE JOURNAL')}</span>
              <h2 id="editorial-title">
                {text('Ghi chép cho người', 'Field notes for the')}
                <br />
                <em>{text('đam mê xê dịch.', 'well-traveled.')}</em>
              </h2>
              <p className="ev-section-lead">
                {text(
                  'Những miền đất giàu bản sắc để khơi gợi cảm hứng cho chuyến đi tiếp theo.',
                  'Editorial stories and destination snapshots across Vietnam.',
                )}
              </p>
            </div>
            <button type="button" className="ev-pill-outline" onClick={() => onNavigate?.('Bộ sưu tập')}>
              <Icon name="layers" size={16} />
              <span>{text('Mở bộ sưu tập', 'Open Collections')}</span>
            </button>
          </div>

          <div className="ev-notes-grid">
            {fieldNotes.map(note => (
              <article key={note.name} className="ev-note-card">
                <div className="ev-note-media">
                  <img src={note.image} alt={note.alt} loading="lazy" width="800" height="540" />
                  <span className="ev-note-tag">{locale === 'en' ? note.tagEn : note.tagVi}</span>
                </div>
                <div className="ev-note-body">
                  <h3>{locale === 'en' ? note.titleEn : note.titleVi}</h3>
                  <p>{locale === 'en' ? note.descEn : note.descVi}</p>
                  <div className="ev-note-footer">
                    <span>{note.name}</span>
                    <button
                      type="button"
                      className="ev-note-link"
                      onClick={() => quickExplore(note.name)}
                    >
                      <span>{text(`Khám phá`, `Explore`)}</span>
                      <Icon name="arrow" size={14} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 9. SECTION 7 — FULL-BLEED FINALE CTA */}
      <section className="ev-finale cinematic-finale" aria-labelledby="finale-title">
        <img
          src="/images/editorial/marble-mountains.webp"
          alt={text('Danh thắng Ngũ Hành Sơn hùng vĩ tại Đà Nẵng', 'Marble Mountains landscape in Da Nang')}
          loading="lazy"
          width="1280"
          height="783"
        />
        <div className="ev-finale-shade" aria-hidden="true" />
        <div className="ev-finale-content" data-ev-reveal="float">
          <span className="ev-hero-eyebrow">{text('HÀNH TRÌNH CÒN Ở PHÍA TRƯỚC', 'READY TO EXPLORE?')}</span>
          <h2 id="finale-title">
            {text('Hành trình tiếp theo', 'Your Next Adventure')}
            <br />
            {text('Bắt đầu ', 'Starts ')}
            <em>{text('tại đây.', 'here.')}</em>
          </h2>
          <p>
            <TypeRevealText
              text={text(
                'Lưu những điểm đến bạn yêu, kiểm tra trên bản đồ và dựng lịch trình hoàn chỉnh chỉ trong vài phút.',
                'Save the places you love, verify routes on the map, and shape your next itinerary in minutes.',
              )}
              speedMs={20}
              caretColor="coral"
            />
          </p>
          <div className="ev-finale-actions">
            <button type="button" className="ev-btn-coral" onClick={() => onNavigateToTrip?.()}>
              <span>{text('Lập lịch trình ngay', 'Start Planning')}</span>
              <span className="ev-btn-coral-badge" aria-hidden="true">
                <Icon name="arrow" size={14} />
              </span>
            </button>
            <button type="button" className="ev-btn-glass" onClick={() => onNavigate?.('Bản đồ')}>
              <span>{text('Xem bản đồ', 'Explore Map')}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 10. SECTION 8 — DEEP NAVY QUICK DISCOVERY STRIP */}
      <section className="ev-newsletter-band" aria-label={text('Tìm kiếm nhanh điểm đến', 'Quick destination discovery')}>
        <div className="ev-wrap ev-newsletter-inner">
          <div className="ev-newsletter-copy" data-ev-reveal="float">
            <span className="ev-eyebrow ev-eyebrow-coral">
              {text('KHÁM PHÁ NHANH', 'QUICK DISCOVERY')}
            </span>
            <h2>
              {text('Hành trình, mùa đẹp', 'Journeys, secret')}
              <br />
              {text('& điểm đến ẩn giấu', 'seasons & hidden')}
              <br />
              {text('— dành riêng cho bạn.', 'gems — on demand.')}
            </h2>
          </div>

          <form className="ev-newsletter-form" onSubmit={submitQuickSearch}>
            <div className="ev-newsletter-input-wrap">
              <input
                type="search"
                value={quickQuery}
                onChange={e => setQuickQuery(e.target.value)}
                placeholder={text('Nhập điểm đến: Hội An, Đà Lạt, Phú Quốc...', 'Enter a place: Hoi An, Da Lat, Ha Long...')}
                aria-label={text('Tìm nhanh điểm đến', 'Quick destination search')}
              />
              <button type="submit" className="ev-newsletter-btn">
                {text('Khám phá', 'Explore')}
              </button>
            </div>
            <p className="ev-newsletter-hint">
              {text(
                'Tìm ngay trong danh mục SmartTravel VN và cuộn tới kết quả.',
                'Searches the live SmartTravel VN catalog immediately.',
              )}
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
