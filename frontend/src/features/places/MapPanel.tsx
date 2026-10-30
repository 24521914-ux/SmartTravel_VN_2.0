import { useEffect, useState } from 'react';
import { Icon, ErrorState } from '../../shared/ui';
import type { TravelClient, Resource, Page } from '../../shared/api';
import '../trips/integration-layout.css';

export interface MapPanelProps {
  travel: TravelClient;
  busy?: boolean;
}

const VIETNAM_CENTER = { lat: 15.88, lon: 108.33 }; // Central Vietnam (Hội An area)

export function MapPanel({ travel, busy = false }: MapPanelProps) {
  const [places, setPlaces] = useState<Resource[]>([]);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadPlaces(search = '') {
    setLoading(true);
    setError('');
    try {
      const data = await travel.places(search);
      setPlaces(data.items ?? []);
      setSelected(data.items?.[0] ?? null);
    } catch (error) {
      setError((error as Error).message);
      setPlaces([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPlaces();
  }, [travel]);

  const activePlace = selected ?? places[0] ?? null;
  const lat = Number(activePlace?.latitude);
  const lon = Number(activePlace?.longitude);
  const valid = activePlace?.latitude != null && activePlace?.longitude != null && Number.isFinite(lat) && Number.isFinite(lon);

  const delta = 0.04;
  const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lon}`;
  const osmExternalUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`;

  return (
    <div className="map-view-layout" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {error && <ErrorState message={error} onRetry={() => void loadPlaces(query)} />}
      {/* Search and control bar */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <input
            type="search"
            placeholder="Tìm địa điểm trên bản đồ..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void loadPlaces(query); }}
            style={{ paddingLeft: '38px' }}
          />
          <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>
            <Icon name="search" size={16} />
          </div>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => void loadPlaces(query)}
          disabled={loading || busy}
        >
          <Icon name="search" size={16} />
          <span>Tìm</span>
        </button>
      </div>

      {/* 2-Column: Destination list & Interactive Map */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 360px) 1fr', gap: '24px' }}>
        {/* Destination List with "Xem vị trí" buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '680px', overflowY: 'auto' }}>
          {places.map(p => {
            const isCurrent = activePlace && String(p.id ?? p.place_id) === String(activePlace.id ?? activePlace.place_id);
            return (
              <div
                key={String(p.id ?? p.place_id ?? p.name)}
                style={{
                  padding: '16px',
                  background: isCurrent ? 'var(--color-primary-light)' : 'var(--color-surface)',
                  border: `1.5px solid ${isCurrent ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'all var(--transition-fast)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 style={{ fontSize: '1.05rem', margin: 0 }}>{String(p.name ?? 'Điểm đến')}</h3>
                </div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                  {String(p.address ?? 'Chưa có địa chỉ')}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setSelected(p);
                    }}
                  >
                    Xem vị trí
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Map Panel Preview */}
        <div className="travel-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activePlace ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                    Vị trí: {String(activePlace.name ?? 'Địa điểm')}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                    <Icon name="pin" size={16} />
                    <span>{valid ? `Vĩ độ ${lat.toFixed(4)} · Kinh độ ${lon.toFixed(4)}` : 'Chưa có tọa độ'}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {valid && <a
                    href={osmExternalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary"
                    style={{ fontSize: '0.875rem' }}
                  >
                    <Icon name="map" size={16} /> Mở OpenStreetMap ↗
                  </a>}
                </div>
              </div>

              {/* Map Canvas / Embedded Frame */}
              <div style={{ position: 'relative', width: '100%', height: '480px', borderRadius: 'var(--radius-card)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                {valid ? (
                  <iframe
                    title={`Bản đồ ${String(activePlace.name ?? '')}`}
                    src={osmEmbedUrl}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  />
                ) : (
                  <div className="empty-subtle" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p>Chưa có thông tin tọa độ cho địa điểm này.</p>
                  </div>
                )}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'right', margin: 0 }}>
                Dữ liệu bản đồ © OpenStreetMap contributors
              </p>
            </>
          ) : (
            <div className="empty-subtle">
              <Icon name="compass" size={40} />
              <p>Chọn một địa điểm để hiển thị trên bản đồ.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
