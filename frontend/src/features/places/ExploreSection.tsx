import { CinematicMotion } from '../../shared/motion/CinematicMotion';
import { DestinationShowcase, CommunityStories } from './CinematicSections';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PlaceCard } from './PlaceCard';
import { PlaceDetailPage } from './PlaceDetailPage';
import { Icon, ErrorState, EmptyState } from '../../shared/ui';
import type { TravelClient, Resource, Page } from '../../shared/api';
import { useToast } from '../../app/providers/ToastProvider';
import { useAuth } from '../../app/providers/AuthProvider';
import { DestinationFilters } from './DestinationFilters';
import { useAppPreferences } from '../../app/providers/AppPreferences';

export interface ExploreSectionProps {
  travel: TravelClient;
  onNavigateToTrip?: (place?: Resource) => void;
  onNavigate?: (section: string) => void;
  busy?: boolean;
}
const editorial = [
  { name: 'Ninh Bình', image: 'ninh-binh', title: 'Đi giữa miền non nước', description: 'Núi đá vôi, những dòng sông và một nhịp sống chậm hơn.', alt: 'Toàn cảnh núi đá vôi và đồng lúa Tam Cốc, Ninh Bình' },
  { name: 'Hội An', image: 'hoi-an', title: 'Hẹn nhau bên dòng Thu Bồn', description: 'Một góc phố, một chiếc đèn lồng, một buổi tối đáng nhớ.', alt: 'Thuyền và đèn lồng trên sông Thu Bồn tại Hội An' },
  { name: 'Hạ Long', image: 'ha-long', title: 'Để biển xanh dẫn lối', description: 'Ngắm những đảo đá nối nhau giữa mặt vịnh rộng mở.', alt: 'Những đảo đá vôi giữa vịnh Hạ Long' },
];
const isFixture = (p: Resource) => /^(Integration\b|P0[0-9][\s_-]|[0-9a-f]{8}-[0-9a-f]{4}-)/i.test(String(p.name ?? ''));
const isTestCategory = (row: Resource) => /^(Integration\b|P0\d[\s_-]|synthetic\b|test\b)/i.test(String(row.name ?? ''));
const categoryIcon = (name: string) => /nhà hàng|ẩm thực|ăn/i.test(name) ? 'food' : /khách sạn|lưu trú/i.test(name) ? 'building' : /bảo tàng|văn hóa|di sản/i.test(name) ? 'layers' : /thiên nhiên|sinh thái/i.test(name) ? 'leaf' : 'compass';

export function ExploreSection({ travel, onNavigateToTrip, onNavigate, busy = false }: ExploreSectionProps) {
  const { showToast } = useToast();
  const { isAuthenticated } = useAuth();
  const { locale, text } = useAppPreferences();
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
  const requestId = useRef(0);
  const results = useRef<HTMLElement>(null);
  const destinationCarousel = useRef<HTMLDivElement>(null);

  async function loadPlaces(searchQuery: string, categoryId: string, nextCursor?: string) {
    const id = ++requestId.current;
    setLoading(true); setError(false);
    try {
      const params = new URLSearchParams({ limit: '12' });
      if (searchQuery) params.set('q', searchQuery);
      if (categoryId) params.set('categoryId', categoryId);
      if (nextCursor) params.set('cursor', nextCursor);
      Object.entries(appliedFilters.current).forEach(([key, value]) => { if (value !== '') params.set(key, value); });
      const data = await travel.read<Page>('catalog', `/places?${params}`);
      if (id !== requestId.current) return;
      setPlaces(old => nextCursor ? [...old, ...data.items.filter(p => !old.some(x => (x.place_id ?? x.id) === (p.place_id ?? p.id)))] : data.items);
      setCursor(data.next_cursor ?? null);
    } catch { if (id === requestId.current) setError(true); }
    finally { if (id === requestId.current) setLoading(false); }
  }
  useEffect(() => {
    void loadPlaces('', '');
    let cancelled = false;
    void travel.readAll('catalog', '/categories').then(data => { if (!cancelled) setCategories(data.items ?? []); }).catch(() => { if (!cancelled) showToast('Không thể tải danh mục địa điểm.', 'error'); });
    void travel.readAll('catalog', '/destinations').then(data => { if (!cancelled) setDestinationsList(data.items ?? []); }).catch(() => { if (!cancelled) showToast('Không thể tải khu vực du lịch.', 'error'); });
    void travel.readAll('catalog', '/geographic-units').then(units => { if (!cancelled) setGeographicUnits(units.items); }).catch(() => { if (!cancelled) showToast('Không thể tải địa giới hành chính.', 'error'); });
    return () => { cancelled = true; requestId.current++; };
  }, [travel]);
  useEffect(() => {
    let active = true;
    setFavoriteIds(new Set());
    setFavoritesLoaded(!isAuthenticated);
    if (isAuthenticated) {
      void travel.readAll('community', '/me/favorites').then(data => {
        if (active) { setFavoriteIds(new Set(data.items.map(row => String(row.place_id ?? row.id)))); setFavoritesLoaded(true); }
      }).catch(() => { if (active) showToast('Không thể tải danh sách yêu thích.', 'error'); });
    }
    return () => { active = false; };
  }, [travel, isAuthenticated, selectedPlace]);
  function search(e: FormEvent) {
    e.preventDefault(); setAppliedQuery(query.trim()); setExpanded(true);
    appliedFilters.current = { ...filters };
    void loadPlaces(query.trim(), category);
    results.current?.scrollIntoView({ block: 'start' });
  }
  function chooseCategory(id: string) { setCategory(id); setExpanded(true); void loadPlaces(appliedQuery, id); }
  function resetFilters() {
    setQuery(''); setAppliedQuery(''); setCategory(''); setFilters({});
    appliedFilters.current = {}; setExpanded(true);
    void loadPlaces('', '');
  }
  async function selectPlace(place: Resource) {
    try { setSelectedPlace(await travel.place(String(place.place_id ?? place.id))); }
    catch (error) { showToast((error as Error).message || 'Không thể tải chi tiết địa điểm.', 'error'); }
  }
  async function favorite(place: Resource, next: boolean) {
    if (!isAuthenticated) { onNavigate?.('Tài khoản'); throw new Error('Sign in required'); }
    try {
      await travel.mutate('community', `/me/favorites/${encodeURIComponent(String(place.place_id ?? place.id))}`, {}, next ? 'PUT' : 'DELETE');
      setFavoriteIds(previous => { const updated = new Set(previous); const id = String(place.place_id ?? place.id); if (next) updated.add(id); else updated.delete(id); return updated; });
      showToast(next ? 'Đã lưu địa điểm yêu thích.' : 'Đã bỏ lưu địa điểm.', 'success');
    } catch { showToast('Chưa lưu được thay đổi. Vui lòng thử lại.', 'error'); throw new Error('Favorite update failed'); }
  }
  if (selectedPlace) return <PlaceDetailPage place={selectedPlace} travel={travel} onBack={() => setSelectedPlace(null)} onAddToTrip={onNavigateToTrip} busy={busy || loading} />;
  const destinations = places.filter(p => !isFixture(p));
  const fixtures = places.filter(isFixture);
  const visible = expanded ? destinations : destinations.slice(0, 6);
  const cleanDestinations = destinationsList.filter(row => !isTestCategory(row));
  const cleanGeographicUnits = geographicUnits.filter(row => !isTestCategory(row));
  const scrollDestinations = (direction: -1 | 1) => destinationCarousel.current?.scrollBy({
    left: direction * Math.max(280, destinationCarousel.current.clientWidth * 0.78), behavior: 'smooth',
  });

  return (
    <div className="travel-landing"><CinematicMotion />
      <section className="journey-hero" aria-labelledby="journey-title">
        <img className="journey-hero-photo" src="/images/editorial/ninh-binh.webp" alt="Núi đá vôi và đồng lúa Tam Cốc, Ninh Bình" width="1600" height="468" fetchPriority="high" />
        <div className="journey-hero-shade" />
        <div className="journey-hero-copy"><span className="journey-eyebrow">{text('KHÁM PHÁ VIỆT NAM', 'DISCOVER VIETNAM')}</span><h1 id="journey-title"><span>{text('Chạm vào', 'Find your')}</span><br /><em>{text('miền diệu kỳ.', 'wonderland.')}</em></h1><p>{text('Từ miền non nước đến những phố xưa. Tìm một nơi khiến bạn muốn lên đường.', 'From dramatic landscapes to old towns, find somewhere that makes you want to travel.')}</p><div className="journey-hero-actions"><a className="journey-button journey-button-light" href="#diem-den" onClick={e => { e.preventDefault(); results.current?.scrollIntoView({ block: 'start' }); }}>{text('Khám phá điểm đến', 'Explore destinations')} <Icon name="arrow" size={18} /></a><button type="button" className="journey-hero-link" onClick={() => onNavigateToTrip?.()}>{text('Tạo lịch trình', 'Plan a trip')} <Icon name="route" size={18} /></button></div></div>
        <a className="journey-photo-location" href="https://commons.wikimedia.org/wiki/File:Tam_Coc_Panorama_(8604887215).jpg" target="_blank" rel="noreferrer"><Icon name="pin" size={16} />Tam Cốc, Ninh Bình</a>
      </section>
      <DestinationFilters
        query={query} onQueryChange={setQuery} filters={filters} onFiltersChange={setFilters}
        destinations={cleanDestinations} geographicUnits={cleanGeographicUnits}
        appliedCount={Object.values(appliedFilters.current).filter(Boolean).length + Number(Boolean(appliedQuery)) + Number(Boolean(category))}
        onSubmit={search} onReset={resetFilters} busy={busy || loading}
      />
      <section className="journey-section" ref={results} id="diem-den" aria-labelledby="destinations-title" aria-busy={loading}>
        <div className="journey-section-heading"><div><h2 id="destinations-title">{text('Một điểm đến,', 'One destination,')} <em>{text('vạn điều khám phá.', 'endless ways to explore.')}</em></h2><p>{appliedQuery ? text(`Kết quả cho “${appliedQuery}”`, `Results for “${appliedQuery}”`) : text('Tìm cảm hứng cho hành trình tiếp theo từ danh mục điểm đến.', 'Find inspiration for your next trip among these destinations.')}</p></div><button type="button" className="journey-text-button" onClick={() => onNavigate?.('Bản đồ')}>{text('Khám phá bản đồ', 'Explore the map')} <Icon name="map" size={18} /></button></div>
        {categories.length > 0 && <>
          <p className="explore-category-label">{text('Bạn muốn khám phá điều gì?', 'What would you like to explore?')}</p>
          <div className="explore-categories" aria-label={text('Lọc theo danh mục', 'Filter by category')}>
            <button type="button" aria-pressed={!category} onClick={() => chooseCategory('')}><Icon name="compass" size={19} />{text('Tất cả', 'All')}</button>
            {categories.filter(c => c.name && (c.category_id ?? c.id) && !isTestCategory(c)).map(c => <button type="button" key={String(c.category_id ?? c.id)} aria-pressed={category === String(c.category_id ?? c.id)} onClick={() => chooseCategory(String(c.category_id ?? c.id))}><Icon name={categoryIcon(String(c.name))} size={19} />{String(locale === 'en' ? c.name_en ?? c.name : c.name_vi ?? c.name)}</button>)}
          </div>
          {categories.some(isTestCategory) && <details className="explore-category-fixtures"><summary>Danh mục kiểm thử ({categories.filter(isTestCategory).length})</summary><div className="explore-categories">{categories.filter(c => c.name && (c.category_id ?? c.id) && isTestCategory(c)).map(c => <button type="button" key={String(c.category_id ?? c.id)} aria-pressed={category === String(c.category_id ?? c.id)} onClick={() => chooseCategory(String(c.category_id ?? c.id))}>{String(c.name)}</button>)}</div></details>}
        </>}

        {error ? <ErrorState onRetry={() => void loadPlaces(appliedQuery, category)} /> : loading && !places.length ? <div className="journey-skeletons" aria-label={text('Đang tải điểm đến', 'Loading destinations')}>{[0, 1, 2].map(n => <div key={n} className="journey-skeleton" />)}</div> : <>
          {visible.length > 0 && <div className="destination-carousel-shell">
            {visible.length > 1 && <div className="destination-carousel-controls"><button type="button" aria-label={text('Cuộn sang trái', 'Scroll left')} onClick={() => scrollDestinations(-1)}><Icon name="arrowLeft" size={19} /></button><button type="button" aria-label={text('Cuộn sang phải', 'Scroll right')} onClick={() => scrollDestinations(1)}><Icon name="arrow" size={19} /></button></div>}
            <div className="travel-grid journey-destinations" ref={destinationCarousel} tabIndex={0} aria-label={text('Danh sách điểm đến, cuộn ngang để xem thêm', 'Destinations, scroll horizontally to see more')}>
              {visible.map(p => <PlaceCard key={String(p.place_id ?? p.id)} place={p} isFavorite={favoriteIds.has(String(p.place_id ?? p.id))} onSelect={place => void selectPlace(place)} onToggleFavorite={favorite} busy={busy || loading} favoriteDisabled={!favoritesLoaded} />)}
            </div>
          </div>}
          {!visible.length && (
            <EmptyState
              variant="compact"
              icon="compass"
              title={fixtures.length ? text('Dữ liệu du lịch trực tuyến đang được đồng bộ', 'Travel listings are being synchronized') : text('Chưa tìm thấy điểm đến', 'No destinations found')}
              description={fixtures.length ? text('Danh mục Catalog đang chờ nạp điểm đến thực tế. Bạn có thể mở dữ liệu kiểm thử bên dưới hoặc khám phá các miền đất biên tập.', 'The catalog is waiting for live destinations. You can view the test records below or browse our editorial picks.') : text('Thử một từ khóa khác hoặc chọn lại bộ lọc.', 'Try another search or adjust your filters.')}
            />
          )}
          {fixtures.length > 0 && <details className="journey-data-note"><summary>{text(`Danh mục có dữ liệu kiểm thử (${fixtures.length} bản ghi trong trang này)`, `Test data (${fixtures.length} records on this page)`)}</summary><p>{text('Giữ nguyên tên và dữ liệu từ API. Các bản ghi này không được giới thiệu như điểm đến du lịch.', 'Names and records are shown as returned by the API. These are not presented as travel destinations.')}</p><div className="travel-grid journey-destinations">{fixtures.map(p => <PlaceCard key={String(p.place_id ?? p.id)} place={p} onSelect={place => void selectPlace(place)} busy={busy || loading} />)}</div></details>}
        </>}
        {(!expanded && destinations.length > 6 || cursor) && <div className="journey-more"><button type="button" className="btn-secondary" disabled={loading} onClick={() => { setExpanded(true); if (expanded || destinations.length <= 6) void loadPlaces(appliedQuery, category, cursor ?? undefined); }}>{loading ? text('Đang tải...', 'Loading...') : text('Xem thêm điểm đến', 'Load more destinations')} <Icon name="arrow" size={18} /></button></div>}
      </section>
      <section className="journey-section journey-editorial" aria-labelledby="editorial-title">
        <div className="journey-section-heading">
          <div>
            <span className="journey-eyebrow">{text('CẢM HỨNG LÊN ĐƯỜNG', 'TRAVEL INSPIRATION')}</span>
            <h2 id="editorial-title">{text('Những miền đất', 'Places')} <em>{text('đang chờ bạn khám phá.', 'waiting to be explored.')}</em></h2>
            <p>{text('Nội dung biên tập để khơi gợi chuyến đi của riêng bạn.', 'Editorial picks to spark a trip of your own.')}</p>
          </div>
        </div>
        <div className="journey-editorial-asymmetric">
          {/* Focal Point: Ninh Bình */}
          <article className="editorial-lead-card">
            <div className="editorial-lead-media">
              <img src="/images/editorial/ninh-binh.webp" alt={editorial[0].alt} width="1200" height="900" loading="lazy" />
              <div className="editorial-card-shade" />
              <span className="editorial-lead-tag">01 · {text('Tiêu điểm', 'Featured')}</span>
            </div>
            <div className="editorial-lead-copy">
              <span className="editorial-location-label"><Icon name="pin" size={14} /> {editorial[0].name}</span>
              <h3>{editorial[0].title}</h3>
              <p>{editorial[0].description}</p>
              <button
                type="button"
                className="journey-text-button"
                onClick={() => {
                  setQuery(editorial[0].name);
                  setAppliedQuery(editorial[0].name);
                  setExpanded(true);
                  void loadPlaces(editorial[0].name, '');
                  setCategory('');
                  results.current?.scrollIntoView({ block: 'start' });
                }}
              >
                {text(`Tìm điểm đến ở ${editorial[0].name}`, `Explore ${editorial[0].name}`)} <Icon name="arrow" size={18} />
              </button>
            </div>
          </article>

          {/* Supporting Asymmetric Cards: Hội An & Hạ Long */}
          <div className="editorial-support-stack">
            {editorial.slice(1).map((story, i) => (
              <article className="editorial-support-card" key={story.image}>
                <div className="editorial-support-media">
                  <img src={`/images/editorial/${story.image}.webp`} alt={story.alt} width="800" height="500" loading="lazy" />
                  <div className="editorial-card-shade" />
                  <span className="editorial-support-tag">0{i + 2} · {story.name}</span>
                </div>
                <div className="editorial-support-copy">
                  <h3>{story.title}</h3>
                  <p>{story.description}</p>
                  <button
                    type="button"
                    className="journey-text-button"
                    onClick={() => {
                      setQuery(story.name);
                      setAppliedQuery(story.name);
                      setExpanded(true);
                      void loadPlaces(story.name, '');
                      setCategory('');
                      results.current?.scrollIntoView({ block: 'start' });
                    }}
                  >
                    {text(`Khám phá ${story.name}`, `Explore ${story.name}`)} <Icon name="arrow" size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <DestinationShowcase places={destinations} onSelect={place => void selectPlace(place)} />
      <section className="journey-plan journey-section" aria-labelledby="plan-title"><div className="journey-plan-symbol" aria-hidden="true"><Icon name="route" size={88} /></div><div><h2 id="plan-title">{text('Chuyến đi của bạn.', 'Your trip.')}<br />{text('Theo cách của bạn.', 'Your way.')}</h2><p>{text('Chọn nơi muốn ghé, sắp xếp từng ngày và giữ mọi kế hoạch ở cùng một chỗ.', 'Choose the places you want to visit, arrange each day, and keep your plans together.')}</p><button type="button" className="btn-primary" onClick={() => onNavigateToTrip?.()}>{text('Bắt đầu lên kế hoạch', 'Start planning')} <Icon name="arrow" size={18} /></button></div><div className="journey-plan-notes"><p><Icon name="pin" size={22} />{text('Tìm những nơi muốn ghé', 'Save places to visit')}</p><p><Icon name="calendar" size={22} />{text('Sắp xếp lịch trình theo ngày', 'Plan each day')}</p><p><Icon name="map" size={22} />{text('Xem các điểm trên bản đồ', 'See places on a map')}</p></div></section>
      <CommunityStories travel={travel} places={destinations} />
      <section className="journey-section journey-collections" aria-labelledby="collections-title"><div><Icon name="layers" size={32} /><h2 id="collections-title">{text('Giữ lại những nơi bạn thích.', 'Keep the places you love.')}</h2><p>{text('Tạo bộ sưu tập điểm đến để lần lên đường tiếp theo luôn có sẵn cảm hứng.', 'Create destination collections to keep inspiration close for your next trip.')}</p></div><button type="button" className="journey-text-button" onClick={() => onNavigate?.('Bộ sưu tập')}>{text('Mở bộ sưu tập của bạn', 'Open your collections')} <Icon name="arrow" size={20} /></button></section>
      <section className="cinematic-finale"><img src="/images/editorial/ha-long.webp" alt={text('Đảo đá giữa vịnh Hạ Long', 'Islands across Ha Long Bay')} loading="lazy" width="1600" height="900" /><div><span className="journey-eyebrow">{text('HÀNH TRÌNH CÒN Ở PHÍA TRƯỚC', 'THE JOURNEY IS STILL AHEAD')}</span><h2>{text('Một Việt Nam.', 'One Vietnam.')}<br /><em>{text('Vô vàn cách yêu.', 'A thousand ways to love.')}</em></h2><button className="journey-button journey-button-light" onClick={() => onNavigateToTrip?.()}>{text('Viết hành trình của bạn', 'Start your story')} <Icon name="arrow" size={18} /></button></div></section>
    </div>
  );
}
