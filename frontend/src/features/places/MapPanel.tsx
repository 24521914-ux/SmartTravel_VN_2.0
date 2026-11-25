import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAppPreferences } from '../../app/providers/AppPreferences';
import { ErrorState, Icon } from '../../shared/ui';
import type { Resource, TravelClient } from '../../shared/api';
import { InteractiveMap, validCoordinates, type MapPoint } from './InteractiveMap';
import { searchAddress, type GeocodedPlace } from './geocoding';
import { placeImageCandidates } from './media';
import {
  filterPlacesLocally,
  hydratePlacesWithOpenData,
  isSyntheticFixtureSuite,
  loadOpenDataPlaces,
  mergeCatalogWithOpenData,
} from './osmCatalog';
import './map-panel.css';

export interface MapPanelProps {
  travel: TravelClient;
  busy?: boolean;
}

const PAGE_SIZE = 9;
const idOf = (place: Resource) => String(place.place_id ?? place.id);
const addressOf = (place: Resource) =>
  !place.address || place.address === place.name
    ? 'Địa chỉ chi tiết chưa được cập nhật'
    : String(place.address);

function badgeLabelFor(place: Resource): string {
  const rawPrice = place.price_min ?? place.price_max;
  if (rawPrice !== null && rawPrice !== undefined && rawPrice !== '' && Number.isFinite(Number(rawPrice))) {
    const price = Number(rawPrice);
    if (price === 0) return 'Miễn phí';
    if (price >= 1000) return `${Math.round(price / 1000)}k`;
    return `${price}đ`;
  }
  const name = String(place.name ?? '').trim();
  if (!name) return 'Điểm đến';
  return name.length > 14 ? `${name.slice(0, 12).trimEnd()}…` : name;
}

function buildPaginationItems(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const items: Array<number | 'ellipsis'> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push('ellipsis');
  for (let p = start; p <= end; p++) items.push(p);
  if (end < total - 1) items.push('ellipsis');
  items.push(total);
  return items;
}

function MapCardPhoto({ place, title }: { place: Resource; title: string }) {
  const candidates = placeImageCandidates(place);
  const key = candidates.join('|');
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [key]);

  const src = candidates[idx] ?? '';
  if (!src) {
    return (
      <div className="map-card-fallback" aria-hidden="true">
        <Icon name="compass" size={24} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={title}
      width={360}
      height={360}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="map-card-img"
      onError={() => setIdx(curr => (curr + 1 < candidates.length ? curr + 1 : candidates.length))}
    />
  );
}

export function MapPanel({ travel, busy = false }: MapPanelProps) {
  const { text } = useAppPreferences();
  const [places, setPlaces] = useState<Resource[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<GeocodedPlace[]>([]);
  const [external, setExternal] = useState<GeocodedPlace | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMessage, setLookupMessage] = useState('');
  const masterPlaces = useRef<Resource[] | null>(null);
  const generation = useRef(0);
  const lookupGeneration = useRef(0);

  async function loadPlaces(search = '', nextCursor?: string) {
    const request = ++generation.current;
    setLoading(true);
    setError('');
    if (!nextCursor) {
      lookupGeneration.current++;
      setLookupBusy(false);
      setExternal(null);
      setCandidates([]);
      setLookupMessage('');
      setCurrentPage(1);
    }
    try {
      if (!nextCursor && masterPlaces.current) {
        const filtered = filterPlacesLocally(masterPlaces.current, { query: search });
        if (request !== generation.current) return;
        setPlaces(filtered);
        setSelectedId(filtered[0] ? idOf(filtered[0]) : '');
        setCursor(null);
        setAppliedQuery(search);
        return;
      }
      const openData = nextCursor ? [] : await loadOpenDataPlaces();
      if (request !== generation.current) return;
      const data = openData.length
        ? await travel.readAll('catalog', '/places')
        : await travel.places(search, { cursor: nextCursor, limit: 20 });
      if (request !== generation.current) return;
      if (!nextCursor && openData.length && !data.items.some(isSyntheticFixtureSuite)) {
        const merged = mergeCatalogWithOpenData({
          catalogPlaces: data.items,
          openDataPlaces: openData,
          categories: [],
          geographicUnits: [],
        }).places;
        masterPlaces.current = merged;
        const filtered = filterPlacesLocally(merged, { query: search });
        setPlaces(filtered);
        setSelectedId(filtered[0] ? idOf(filtered[0]) : '');
        setCursor(null);
        setAppliedQuery(search);
        return;
      }
      const cachedOpenData = openData.length ? openData : await loadOpenDataPlaces();
      if (request !== generation.current) return;
      const hydratedItems = hydratePlacesWithOpenData(data.items, cachedOpenData);
      setPlaces(previous =>
        nextCursor ? [...previous, ...hydratedItems.filter(row => !previous.some(p => idOf(p) === idOf(row)))] : hydratedItems,
      );
      if (!nextCursor) setSelectedId(hydratedItems[0] ? idOf(hydratedItems[0]) : '');
      setCursor(data.next_cursor ?? null);
      setAppliedQuery(search);
    } catch (err) {
      if (request === generation.current) setError((err as Error).message);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    void loadPlaces();
    return () => {
      generation.current++;
      lookupGeneration.current++;
    };
  }, [travel]);

  async function lookup() {
    const request = ++lookupGeneration.current;
    setLookupBusy(true);
    setLookupMessage('');
    setCandidates([]);
    try {
      const items = await searchAddress(query);
      if (request !== lookupGeneration.current) return;
      setCandidates(items);
      if (!items.length) setLookupMessage('Không tìm thấy địa chỉ tại Việt Nam. Thử thêm tỉnh/thành.');
    } catch (err) {
      if (request === lookupGeneration.current) setLookupMessage((err as Error).message);
    } finally {
      if (request === lookupGeneration.current) setLookupBusy(false);
    }
  }

  const points = useMemo<MapPoint[]>(
    () =>
      places
        .filter(p => validCoordinates(p.latitude, p.longitude))
        .map(p => ({
          id: idOf(p),
          name: String(p.name ?? 'Địa điểm'),
          address: addressOf(p),
          latitude: Number(p.latitude),
          longitude: Number(p.longitude),
          badgeLabel: badgeLabelFor(p),
        })),
    [places],
  );

  const totalPages = Math.max(1, Math.ceil(places.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedPlaces = useMemo(
    () => places.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [places, safePage],
  );

  const selected = places.find(p => idOf(p) === selectedId);
  const active = external
    ? { ...external, badgeLabel: external.name.length > 14 ? `${external.name.slice(0, 12)}…` : external.name }
    : points.find(p => p.id === selectedId);
  const mapPoints = useMemo(
    () =>
      external
        ? [...points, { ...external, badgeLabel: external.name.length > 14 ? `${external.name.slice(0, 12)}…` : external.name }]
        : points,
    [points, external],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void loadPlaces(query.trim());
  };

  const handleMarkerSelect = (id: string) => {
    if (external?.id === id) return;
    setExternal(null);
    setSelectedId(id);
    const idx = places.findIndex(p => idOf(p) === id);
    if (idx >= 0) {
      setCurrentPage(Math.floor(idx / PAGE_SIZE) + 1);
    }
  };

  return (
    <div className="map-view-layout">
      {/* ── Centered Pill Search Bar (No Price / Time of Day Filter Row) ── */}
      <header className="map-top-bar">
        <div className="map-shell-wrap map-top-bar-inner">
          <h1 className="map-dir-title">{text('Bản đồ', 'Map')}</h1>

          <form className="map-search" onSubmit={submit}>
            <input
              type="search"
              aria-label="Tìm tên địa điểm hoặc địa chỉ"
              placeholder={text('Tên địa điểm hoặc địa chỉ, ví dụ: Cầu Rồng, Đà Nẵng', 'Place name or address, e.g. Dragon Bridge')}
              value={query}
              maxLength={1024}
              onChange={e => {
                setQuery(e.target.value);
                lookupGeneration.current++;
                setLookupBusy(false);
                setCandidates([]);
                setLookupMessage('');
              }}
            />
            <span className="map-search-divider" aria-hidden="true" />
            <button
              className="map-lookup-btn"
              disabled={lookupBusy || busy || loading || query.trim().length < 3}
              type="button"
              onClick={() => void lookup()}
            >
              {text('Tra địa chỉ trên bản đồ', 'Tra địa chỉ trên bản đồ')}
            </button>
            <button
              className="map-submit-btn"
              disabled={loading || busy}
              type="submit"
              aria-label="Tìm"
            >
              <Icon name="search" size={16} />
              <span className="map-submit-label">{text('Tìm', 'Search')}</span>
            </button>
          </form>

          <div className="map-top-meta" aria-live="polite">
            <span>{places.length} {text('địa điểm', 'places')}</span>
          </div>
        </div>
      </header>

      <div className="map-shell-wrap map-workspace-body">
        {error && <ErrorState message={error} onRetry={() => void loadPlaces(appliedQuery)} />}
        {lookupBusy && <p className="map-status-note" role="status">Đang tra địa chỉ…</p>}
        {lookupMessage && <p className="map-status-note" role="status">{lookupMessage}</p>}

        {candidates.length > 0 && (
          <section className="location-editor" aria-label="Kết quả tra cứu địa chỉ">
            <strong>Kết quả tra cứu trên bản đồ</strong>
            <p>Chọn kết quả để xem ghim. Các kết quả này chưa được lưu vào danh sách địa điểm.</p>
            <div className="location-candidates">
              {candidates.map(item => (
                <button type="button" key={item.id} onClick={() => setExternal(item)}>
                  <strong>{item.name}</strong>
                  <br />
                  {item.address}
                </button>
              ))}
            </div>
            <p>
              Dữ liệu © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · Tra cứu bởi{' '}
              <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">Photon</a>
            </p>
          </section>
        )}

        {/* ── 2-Column Split Directory (3×3 Square Photo Cards + Dark-Bordered Expandable Map) ── */}
        <div className={`map-columns ${isMapExpanded ? 'is-map-expanded' : ''}`}>
          <div className="map-results-panel">
            <div className="map-results" aria-label="Danh sách địa điểm trên bản đồ" aria-busy={loading}>
              {!places.length && !loading && !error && (
                <p className="map-empty-note">Chưa tìm thấy địa điểm trong hệ thống. Bạn có thể tra địa chỉ trên bản đồ.</p>
              )}
              {pagedPlaces.map(p => {
                const pid = idOf(p);
                const isSelected = !external && pid === selectedId;
                const title = String(p.name ?? 'Địa điểm');
                return (
                  <article key={pid} className={`map-place ${isSelected ? 'is-selected' : ''}`}>
                    <div
                      className="map-card-media"
                      onClick={() => {
                        setExternal(null);
                        setSelectedId(pid);
                      }}
                    >
                      <MapCardPhoto place={p} title={title} />
                    </div>
                    <h3>{title}</h3>
                    <p>{addressOf(p)}</p>
                    <button
                      type="button"
                      className="map-locate-btn"
                      onClick={() => {
                        setExternal(null);
                        setSelectedId(pid);
                      }}
                    >
                      Xem vị trí
                    </button>
                  </article>
                );
              })}
            </div>

            {totalPages > 1 && (
              <nav className="map-pagination" aria-label={text('Phân trang bản đồ', 'Map pagination')}>
                <button
                  type="button"
                  className="map-page-btn"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage(curr => Math.max(1, curr - 1))}
                  aria-label={text('Trang trước', 'Previous page')}
                >
                  <Icon name="arrowLeft" size={13} />
                </button>
                {buildPaginationItems(safePage, totalPages).map((entry, idx) =>
                  entry === 'ellipsis' ? (
                    <span key={`ell-${idx}`} className="map-page-ellipsis" aria-hidden="true">…</span>
                  ) : (
                    <button
                      key={entry}
                      type="button"
                      className={`map-page-btn ${safePage === entry ? 'is-active' : ''}`}
                      onClick={() => setCurrentPage(entry)}
                      aria-current={safePage === entry ? 'page' : undefined}
                    >
                      {entry}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="map-page-btn"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage(curr => Math.min(totalPages, curr + 1))}
                  aria-label={text('Trang sau', 'Next page')}
                >
                  <Icon name="arrow" size={13} />
                </button>
              </nav>
            )}

            {cursor && (
              <div className="map-load-more">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={loading || busy}
                  onClick={() => void loadPlaces(appliedQuery, cursor)}
                >
                  Xem thêm địa điểm
                </button>
              </div>
            )}
          </div>

          <section className="map-preview" aria-label="Vị trí địa điểm">
            <div className="map-frame">
              <button
                type="button"
                className="map-expand-btn"
                aria-expanded={isMapExpanded}
                onClick={() => setIsMapExpanded(prev => !prev)}
                aria-label={isMapExpanded ? text('Thu gọn bản đồ', 'Collapse map') : text('Mở rộng bản đồ', 'Expand map')}
              >
                <Icon name={isMapExpanded ? 'arrow' : 'arrowLeft'} size={14} />
                <span>{isMapExpanded ? text('Thu gọn bản đồ', 'Collapse map') : text('Mở rộng bản đồ', 'Expand map')}</span>
              </button>

              <InteractiveMap
                points={mapPoints}
                selectedId={active?.id}
                zoomPosition="topright"
                markerStyle="pill"
                onSelect={handleMarkerSelect}
              />
            </div>

            <div className="map-preview-header">
              <div>
                <h2>
                  {active || selected
                    ? `Vị trí: ${active?.name ?? String(selected?.name ?? '')}`
                    : 'Bản đồ Việt Nam'}
                </h2>
                {active && (
                  <>
                    <p>{active.address}</p>
                    <p>
                      Vĩ độ {active.latitude.toFixed(6)} · Kinh độ {active.longitude.toFixed(6)}
                    </p>
                  </>
                )}
                {!active && selected && (
                  <p>Địa điểm chưa có tọa độ hợp lệ. Quản trị viên cần cập nhật vị trí.</p>
                )}
              </div>
              {active && (
                <a
                  className="map-osm-link"
                  href={`https://www.openstreetmap.org/?mlat=${active.latitude}&mlon=${active.longitude}#map=16/${active.latitude}/${active.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="map" size={15} /> Mở OpenStreetMap ↗
                </a>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
