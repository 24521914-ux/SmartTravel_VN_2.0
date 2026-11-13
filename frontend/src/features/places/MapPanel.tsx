import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ErrorState, Icon } from '../../shared/ui';
import type { Resource, TravelClient } from '../../shared/api';
import { InteractiveMap, validCoordinates, type MapPoint } from './InteractiveMap';
import { searchAddress, type GeocodedPlace } from './geocoding';
import './map-panel.css';

export interface MapPanelProps { travel: TravelClient; busy?: boolean }
const idOf = (place: Resource) => String(place.place_id ?? place.id);
const addressOf = (place: Resource) => !place.address || place.address === place.name ? 'Địa chỉ chi tiết chưa được cập nhật' : String(place.address);

export function MapPanel({ travel, busy = false }: MapPanelProps) {
  const [places, setPlaces] = useState<Resource[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<GeocodedPlace[]>([]);
  const [external, setExternal] = useState<GeocodedPlace | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMessage, setLookupMessage] = useState('');
  const generation = useRef(0), lookupGeneration = useRef(0);
  async function loadPlaces(search = '', nextCursor?: string) {
    const request = ++generation.current;
    setLoading(true); setError('');
    if (!nextCursor) { lookupGeneration.current++; setLookupBusy(false); setExternal(null); setCandidates([]); setLookupMessage(''); }
    try {
      const data = await travel.places(search, { cursor: nextCursor, limit: 20 });
      if (request !== generation.current) return;
      setPlaces(previous => nextCursor ? [...previous, ...data.items.filter(row => !previous.some(p => idOf(p) === idOf(row)))] : data.items);
      if (!nextCursor) setSelectedId(data.items[0] ? idOf(data.items[0]) : '');
      setCursor(data.next_cursor ?? null); setAppliedQuery(search);
    } catch (error) { if (request === generation.current) setError((error as Error).message); }
    finally { if (request === generation.current) setLoading(false); }
  }
  useEffect(() => { void loadPlaces(); return () => { generation.current++; lookupGeneration.current++; }; }, [travel]);
  async function lookup() {
    const request = ++lookupGeneration.current;
    setLookupBusy(true); setLookupMessage(''); setCandidates([]);
    try {
      const items = await searchAddress(query);
      if (request !== lookupGeneration.current) return;
      setCandidates(items);
      if (!items.length) setLookupMessage('Không tìm thấy địa chỉ tại Việt Nam. Thử thêm tỉnh/thành.');
    } catch (error) { if (request === lookupGeneration.current) setLookupMessage((error as Error).message); }
    finally { if (request === lookupGeneration.current) setLookupBusy(false); }
  }
  const points = useMemo<MapPoint[]>(() => places.filter(p => validCoordinates(p.latitude, p.longitude)).map(p => ({ id: idOf(p), name: String(p.name ?? 'Địa điểm'), address: addressOf(p), latitude: Number(p.latitude), longitude: Number(p.longitude) })), [places]);
  const selected = places.find(p => idOf(p) === selectedId);
  const active = external ?? points.find(p => p.id === selectedId);
  const mapPoints = useMemo(() => external ? [...points, external] : points, [points, external]);
  const submit = (event: FormEvent) => { event.preventDefault(); void loadPlaces(query.trim()); };
  return <div className="map-view-layout" style={{ display: 'grid', gap: 20 }}>
    <form className="map-search" onSubmit={submit}>
      <input type="search" aria-label="Tìm tên địa điểm hoặc địa chỉ" placeholder="Tên địa điểm hoặc địa chỉ, ví dụ: Cầu Rồng, Đà Nẵng" value={query} maxLength={1024}
        onChange={e => { setQuery(e.target.value); lookupGeneration.current++; setLookupBusy(false); setCandidates([]); setLookupMessage(''); }} />
      <button className="btn-primary" disabled={loading || busy} type="submit"><Icon name="search" size={16} /> Tìm</button>
      <button className="btn-secondary" disabled={lookupBusy || busy || loading || query.trim().length < 3} type="button" onClick={() => void lookup()}>Tra địa chỉ trên bản đồ</button>
    </form>
    {error && <ErrorState message={error} onRetry={() => void loadPlaces(appliedQuery)} />}
    {lookupBusy && <p role="status">Đang tra địa chỉ…</p>}
    {lookupMessage && <p role="status">{lookupMessage}</p>}
    {candidates.length > 0 && <section className="location-editor" aria-label="Kết quả tra cứu địa chỉ">
      <strong>Kết quả tra cứu trên bản đồ</strong><p>Chọn kết quả để xem ghim. Các kết quả này chưa được lưu vào danh sách địa điểm.</p>
      <div className="location-candidates">{candidates.map(item => <button type="button" key={item.id} onClick={() => setExternal(item)}><strong>{item.name}</strong><br />{item.address}</button>)}</div>
      <p>Dữ liệu © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · Tra cứu bởi <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">Photon</a></p>
    </section>}
    <div className="map-columns">
      <div className="map-results" aria-label="Danh sách địa điểm trên bản đồ" aria-busy={loading}>
        {!places.length && !loading && !error && <p>Chưa tìm thấy địa điểm trong hệ thống. Bạn có thể tra địa chỉ trên bản đồ.</p>}
        {places.map(p => <article key={idOf(p)} className={`map-place ${!external && idOf(p) === selectedId ? 'is-selected' : ''}`}>
          <h3>{String(p.name ?? 'Địa điểm')}</h3><p>{addressOf(p)}</p>
          <button type="button" className="btn-secondary" onClick={() => { setExternal(null); setSelectedId(idOf(p)); }}>Xem vị trí</button>
        </article>)}
        {cursor && <button type="button" className="btn-secondary" disabled={loading || busy} onClick={() => void loadPlaces(appliedQuery, cursor)}>Xem thêm địa điểm</button>}
      </div>
      <section className="travel-panel map-preview" aria-label="Vị trí địa điểm">
        <div className="map-preview-header"><div>
          <h2>{active || selected ? `Vị trí: ${active?.name ?? String(selected?.name ?? '')}` : 'Bản đồ Việt Nam'}</h2>
          {active && <><p>{active.address}</p><p>Vĩ độ {active.latitude.toFixed(6)} · Kinh độ {active.longitude.toFixed(6)}</p></>}
          {!active && selected && <p>Địa điểm chưa có tọa độ hợp lệ. Quản trị viên cần cập nhật vị trí.</p>}
        </div>
        {active && <a className="btn-secondary" href={`https://www.openstreetmap.org/?mlat=${active.latitude}&mlon=${active.longitude}#map=16/${active.latitude}/${active.longitude}`} target="_blank" rel="noreferrer"><Icon name="map" size={16} /> Mở OpenStreetMap ↗</a>}
        </div>
        <InteractiveMap points={mapPoints} selectedId={active?.id} onSelect={id => { if (external?.id !== id) { setExternal(null); setSelectedId(id); } }} />
      </section>
    </div>
  </div>;
}
