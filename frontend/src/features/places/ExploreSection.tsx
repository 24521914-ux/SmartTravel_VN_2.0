import { CinematicMotion } from '../../shared/motion/CinematicMotion';
import { DestinationShowcase, CommunityStories } from './CinematicSections';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PlaceCard } from './PlaceCard';
import { PlaceDetailPage } from './PlaceDetailPage';
import { Icon, ErrorState, EmptyState } from '../../shared/ui';
import type { TravelClient, Resource, Page } from '../../shared/api';
import { useToast } from '../../app/providers/ToastProvider';
import { useAuth } from '../../app/providers/AuthProvider';

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
const isFixture = (p: Resource) => /^(P0[0-9][\s_-]|[0-9a-f]{8}-[0-9a-f]{4}-)/i.test(String(p.name ?? ''));

export function ExploreSection({ travel, onNavigateToTrip, onNavigate, busy = false }: ExploreSectionProps) {
  const { showToast } = useToast();
  const { isAuthenticated } = useAuth();
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
  const [tags, setTags] = useState<Resource[]>([]);
  const [amenities, setAmenities] = useState<Resource[]>([]);
  const [offerings, setOfferings] = useState<Resource[]>([]);
  const [expanded, setExpanded] = useState(false);
  const requestId = useRef(0);
  const results = useRef<HTMLElement>(null);

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
    void travel.readAll('catalog', '/destinations').then(data => { if (!cancelled) setDestinationsList(data.items ?? []); }).catch(() => { if (!cancelled) showToast('Không thể tải vùng điểm đến.', 'error'); });
    void Promise.all([travel.readAll('catalog', '/geographic-units'), travel.readAll('catalog', '/tags'), travel.readAll('catalog', '/amenities'), travel.readAll('catalog', '/offerings')]).then(([units, tags, amenities, offerings]) => { if (!cancelled) { setGeographicUnits(units.items); setTags(tags.items); setAmenities(amenities.items); setOfferings(offerings.items); } }).catch(() => { if (!cancelled) showToast('Không thể tải danh mục tiện ích và dịch vụ.', 'error'); });
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

  return (
    <div className="travel-landing"><CinematicMotion />
      <section className="journey-hero" aria-labelledby="journey-title">
        <img className="journey-hero-photo" src="/images/editorial/ninh-binh.webp" alt="Núi đá vôi và đồng lúa Tam Cốc, Ninh Bình" width="1600" height="468" fetchPriority="high" />
        <div className="journey-hero-shade" />
        <div className="journey-hero-copy"><span className="journey-eyebrow">KHÁM PHÁ VIỆT NAM</span><h1 id="journey-title"><span>Chạm vào</span><br /><em>miền diệu kỳ.</em></h1><p>Từ miền non nước đến những phố xưa. Tìm một nơi khiến bạn muốn lên đường.</p><div className="journey-hero-actions"><a className="journey-button journey-button-light" href="#diem-den" onClick={e => { e.preventDefault(); results.current?.scrollIntoView({ block: 'start' }); }}>Khám phá điểm đến <Icon name="arrow" size={18} /></a><button type="button" className="journey-hero-link" onClick={() => onNavigateToTrip?.()}>Tạo lịch trình <Icon name="route" size={18} /></button></div></div>
        <a className="journey-photo-location" href="https://commons.wikimedia.org/wiki/File:Tam_Coc_Panorama_(8604887215).jpg" target="_blank" rel="noreferrer"><Icon name="pin" size={16} />Tam Cốc, Ninh Bình</a>
      </section>
      <form className="journey-search" onSubmit={search} role="search" aria-label="Tìm điểm đến"><Icon name="search" size={25} /><label htmlFor="destination-search"><span>Chuyến đi tiếp theo của bạn?</span><input id="destination-search" type="search" placeholder="Thử tìm Hội An, Ninh Bình..." value={query} onChange={e => setQuery(e.target.value)} /></label><button type="submit" className="btn-primary" disabled={busy || loading}>Tìm điểm đến <Icon name="arrow" size={18} /></button></form>
      <form className="travel-panel form-grid" aria-label="Bộ lọc điểm đến" onSubmit={search}>
        <label>Vùng điểm đến<select value={filters.destinationId ?? ''} onChange={e => setFilters({ ...filters, destinationId: e.target.value })}><option value="">Tất cả</option>{destinationsList.map(row => <option key={String(row.destination_id ?? row.id)} value={String(row.destination_id ?? row.id)}>{String(row.name)}</option>)}</select></label>
        <label>Tỉnh thành<select value={filters.geographicUnitId ?? ''} onChange={e => setFilters({ ...filters, geographicUnitId: e.target.value })}><option value="">Tất cả</option>{geographicUnits.map(row => <option key={String(row.geographic_unit_id ?? row.id)} value={String(row.geographic_unit_id ?? row.id)}>{String(row.name)}</option>)}</select></label>
        <label>Giá tối thiểu<input type="number" min="0" value={filters.minPrice ?? ''} onChange={e => setFilters({ ...filters, minPrice: e.target.value })} /></label>
        <label>Giá tối đa<input type="number" min={filters.minPrice || '0'} value={filters.maxPrice ?? ''} onChange={e => setFilters({ ...filters, maxPrice: e.target.value })} /></label>
        <label>Đánh giá tối thiểu<input type="number" min="0" max="5" step="0.5" value={filters.minRating ?? ''} onChange={e => setFilters({ ...filters, minRating: e.target.value })} /></label>
        <label>Vĩ độ<input type="number" min="-90" max="90" step="any" value={filters.lat ?? ''} required={Boolean(filters.lon || filters.radiusM)} onChange={e => setFilters({ ...filters, lat: e.target.value })} /></label>
        <label>Kinh độ<input type="number" min="-180" max="180" step="any" value={filters.lon ?? ''} required={Boolean(filters.lat || filters.radiusM)} onChange={e => setFilters({ ...filters, lon: e.target.value })} /></label>
        <label>Bán kính (m)<input type="number" min="1" value={filters.radiusM ?? ''} required={Boolean(filters.lat || filters.lon)} onChange={e => setFilters({ ...filters, radiusM: e.target.value })} /></label>
        <button className="btn-secondary" type="submit" disabled={busy || loading}>Áp dụng bộ lọc</button>
      </form>
      <details className="travel-panel"><summary>Danh mục du lịch</summary><h3>Tiện ích</h3><p>{amenities.map(row => String(row.name)).join(' · ') || 'Chưa có tiện ích'}</p><h3>Thẻ địa điểm</h3><p>{tags.map(row => String(row.name)).join(' · ') || 'Chưa có thẻ địa điểm'}</p><h3>Dịch vụ và trải nghiệm</h3>{offerings.map(row => <p key={String(row.offering_id ?? row.id)}>{String(row.name)} · {row.price == null ? 'Chưa có giá' : `${Number(row.price).toLocaleString('vi-VN')} VND`}{row.place_id != null && <button type="button" onClick={() => void selectPlace({ place_id: row.place_id })}>Xem địa điểm cung cấp</button>}</p>)}</details>
      <section className="journey-section" ref={results} id="diem-den" aria-labelledby="destinations-title" aria-busy={loading}>
        <div className="journey-section-heading"><div><h2 id="destinations-title">Một điểm đến, <em>vạn điều khám phá.</em></h2><p>{appliedQuery ? `Kết quả cho “${appliedQuery}”` : 'Tìm cảm hứng cho hành trình tiếp theo từ danh mục điểm đến.'}</p></div><button type="button" className="journey-text-button" onClick={() => onNavigate?.('Bản đồ')}>Khám phá bản đồ <Icon name="map" size={18} /></button></div>
        {categories.length > 0 && <div className="journey-filters" aria-label="Lọc theo danh mục"><button type="button" aria-pressed={!category} onClick={() => chooseCategory('')}>Tất cả</button>{categories.filter(c => c.name && (c.category_id ?? c.id)).map(c => <button type="button" key={String(c.category_id ?? c.id)} aria-pressed={category === String(c.category_id ?? c.id)} onClick={() => chooseCategory(String(c.category_id ?? c.id))}>{String(c.name)}</button>)}</div>}
        {error ? <ErrorState onRetry={() => void loadPlaces(appliedQuery, category)} /> : loading && !places.length ? <div className="journey-skeletons" aria-label="Đang tải điểm đến">{[0, 1, 2].map(n => <div key={n} className="journey-skeleton" />)}</div> : <>
          {visible.length > 0 && <div className="travel-grid journey-destinations">{visible.map(p => <PlaceCard key={String(p.place_id ?? p.id)} place={p} isFavorite={favoriteIds.has(String(p.place_id ?? p.id))} onSelect={place => void selectPlace(place)} onToggleFavorite={favorite} busy={busy || loading} favoriteDisabled={!favoritesLoaded} />)}</div>}
          {!visible.length && (
            <EmptyState
              variant="compact"
              icon="compass"
              title={fixtures.length ? 'Dữ liệu du lịch trực tuyến đang được đồng bộ' : 'Chưa tìm thấy điểm đến'}
              description={fixtures.length ? 'Danh mục Catalog đang chờ nạp điểm đến thực tế. Bạn có thể mở dữ liệu kiểm thử bên dưới hoặc khám phá các miền đất biên tập.' : 'Thử một từ khóa khác hoặc chọn lại bộ lọc.'}
            />
          )}
          {fixtures.length > 0 && <details className="journey-data-note"><summary>Danh mục có dữ liệu kiểm thử ({fixtures.length} bản ghi trong trang này)</summary><p>Giữ nguyên tên và dữ liệu từ API. Các bản ghi này không được giới thiệu như điểm đến du lịch.</p><div className="travel-grid journey-destinations">{fixtures.map(p => <PlaceCard key={String(p.place_id ?? p.id)} place={p} onSelect={place => void selectPlace(place)} busy={busy || loading} />)}</div></details>}
        </>}
        {(!expanded && destinations.length > 6 || cursor) && <div className="journey-more"><button type="button" className="btn-secondary" disabled={loading} onClick={() => { setExpanded(true); if (expanded || destinations.length <= 6) void loadPlaces(appliedQuery, category, cursor ?? undefined); }}>{loading ? 'Đang tải...' : 'Xem thêm điểm đến'} <Icon name="arrow" size={18} /></button></div>}
      </section>
      <section className="journey-section journey-editorial" aria-labelledby="editorial-title">
        <div className="journey-section-heading">
          <div>
            <span className="journey-eyebrow">CẢM HỨNG LÊN ĐƯỜNG</span>
            <h2 id="editorial-title">Những miền đất <em>đang chờ bạn khám phá.</em></h2>
            <p>Nội dung biên tập để khơi gợi chuyến đi của riêng bạn.</p>
          </div>
        </div>
        <div className="journey-editorial-asymmetric">
          {/* Focal Point: Ninh Bình */}
          <article className="editorial-lead-card">
            <div className="editorial-lead-media">
              <img src="/images/editorial/ninh-binh.webp" alt={editorial[0].alt} width="1200" height="900" loading="lazy" />
              <div className="editorial-card-shade" />
              <span className="editorial-lead-tag">01 · Tiêu điểm</span>
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
                Tìm điểm đến ở {editorial[0].name} <Icon name="arrow" size={18} />
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
                    Khám phá {story.name} <Icon name="arrow" size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <DestinationShowcase places={destinations} onSelect={place => void selectPlace(place)} />
      <section className="journey-plan journey-section" aria-labelledby="plan-title"><div className="journey-plan-symbol" aria-hidden="true"><Icon name="route" size={88} /></div><div><h2 id="plan-title">Chuyến đi của bạn.<br />Theo cách của bạn.</h2><p>Chọn nơi muốn ghé, sắp xếp từng ngày và giữ mọi kế hoạch ở cùng một chỗ.</p><button type="button" className="btn-primary" onClick={() => onNavigateToTrip?.()}>Bắt đầu lên kế hoạch <Icon name="arrow" size={18} /></button></div><div className="journey-plan-notes"><p><Icon name="pin" size={22} />Tìm những nơi muốn ghé</p><p><Icon name="calendar" size={22} />Sắp xếp lịch trình theo ngày</p><p><Icon name="map" size={22} />Xem các điểm trên bản đồ</p></div></section>
      <CommunityStories travel={travel} places={destinations} />
      <section className="journey-section journey-collections" aria-labelledby="collections-title"><div><Icon name="layers" size={32} /><h2 id="collections-title">Giữ lại những nơi bạn thích.</h2><p>Tạo bộ sưu tập điểm đến để lần lên đường tiếp theo luôn có sẵn cảm hứng.</p></div><button type="button" className="journey-text-button" onClick={() => onNavigate?.('Bộ sưu tập')}>Mở bộ sưu tập của bạn <Icon name="arrow" size={20} /></button></section>
      <section className="cinematic-finale"><img src="/images/editorial/ha-long.webp" alt="Đảo đá giữa vịnh Hạ Long" loading="lazy" width="1600" height="900" /><div><span className="journey-eyebrow">HÀNH TRÌNH CÒN Ở PHÍA TRƯỚC</span><h2>Một Việt Nam.<br /><em>Vô vàn cách yêu.</em></h2><button className="journey-button journey-button-light" onClick={() => onNavigateToTrip?.()}>Viết hành trình của bạn <Icon name="arrow" size={18} /></button></div></section>
    </div>
  );
}
