import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map-panel.css';

export interface MapPoint { id: string; name: string; address?: string; latitude: number; longitude: number }
export function validCoordinates(latitude: unknown, longitude: unknown) {
  return latitude !== null && latitude !== undefined && latitude !== '' && longitude !== null && longitude !== undefined && longitude !== '' && Number.isFinite(Number(latitude)) && Math.abs(Number(latitude)) <= 90 && Number.isFinite(Number(longitude)) && Math.abs(Number(longitude)) <= 180;
}

export function InteractiveMap({ points, selectedId, onSelect, onMove }: {
  points: MapPoint[]; selectedId?: string; onSelect?: (id: string) => void;
  onMove?: (latitude: number, longitude: number) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const callbacks = useRef({ onSelect, onMove });
  callbacks.current = { onSelect, onMove };
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, { scrollWheelZoom: false, fadeAnimation: false }).setView([16, 107], 5);
    map.current = instance;
    // Stadia explicitly supports keyless localhost development; production can configure its own provider.
    const localDevelopment = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
    const customTiles = import.meta.env.VITE_MAP_TILE_URL;
    const defaultTiles = localDevelopment ? 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png' : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
    const defaultAttribution = localDevelopment && !customTiles ? '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ' + osmAttribution : osmAttribution;
    const layer = L.tileLayer(customTiles || defaultTiles, {
      maxZoom: 19, attribution: import.meta.env.VITE_MAP_ATTRIBUTION || defaultAttribution,
    }).addTo(instance);
    tiles.current = layer;
    layer.on('tileerror', () => setTileError(true));
    instance.on('click', event => callbacks.current.onMove?.(event.latlng.lat, event.latlng.lng));
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(element.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; tiles.current = null; };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const group = L.layerGroup().addTo(instance);
    for (const point of points.filter(p => validCoordinates(p.latitude, p.longitude))) {
      const selected = point.id === selectedId;
      const icon = L.divIcon({ className: 'travel-map-marker', html: `<span class="${selected ? 'is-selected' : ''}"></span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      const marker = L.marker([point.latitude, point.longitude], { icon, title: point.name, keyboard: true }).addTo(group);
      const popup = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = point.name; popup.append(title);
      if (point.address) { const address = document.createElement('p'); address.textContent = point.address; popup.append(address); }
      marker.bindPopup(popup).on('click', () => callbacks.current.onSelect?.(point.id));
      if (selected) { instance.setView([point.latitude, point.longitude], 16); marker.openPopup(); }
    }
    return () => { group.remove(); };
  }, [points, selectedId]);
  return <div className="interactive-map-shell">
    <div ref={element} className="interactive-map" role="region" aria-label="Bản đồ địa điểm tương tác" />
    {tileError && <div className="map-tile-error" role="status">Không tải được nền bản đồ. Kiểm tra kết nối hoặc mở bản đồ ngoài.
      <button type="button" onClick={() => { setTileError(false); tiles.current?.redraw(); }}>Thử lại</button>
    </div>}
  </div>;
}
