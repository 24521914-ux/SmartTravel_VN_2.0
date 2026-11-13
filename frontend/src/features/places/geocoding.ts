export interface GeocodedPlace { id: string; name: string; address: string; latitude: number; longitude: number }
const baseUrl = (import.meta.env.VITE_PHOTON_URL || 'https://photon.komoot.io').replace(/\/$/, '');
const cache = new Map<string, { time: number; items: GeocodedPlace[] }>();
let queue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;

// Explicit user requests only. Cached results and a shared queue avoid repeated lookups.
async function lookup(path: string, parameters: Record<string, string>): Promise<GeocodedPlace[]> {
  const url = `${baseUrl}/${path}?${new URLSearchParams(parameters)}`;
  const cached = cache.get(url);
  if (cached && Date.now() - cached.time < 86_400_000) return cached.items;
  const pending = queue.catch(() => {}).then(async () => {
    const existing = cache.get(url);
    if (existing && Date.now() - existing.time < 86_400_000) return existing.items;
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 1100 - (Date.now() - lastRequest))));
    lastRequest = Date.now();
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(response.status === 429 ? 'Dịch vụ tra địa chỉ đang bận. Vui lòng thử lại sau.' : 'Không thể tra địa chỉ. Vui lòng thử lại hoặc nhập địa chỉ và tọa độ thủ công.');
    const data = await response.json();
    if (!Array.isArray(data.features)) throw new Error('Dịch vụ trả về dữ liệu địa chỉ không hợp lệ.');
    const items: GeocodedPlace[] = data.features.flatMap((feature: { geometry?: { coordinates?: number[] }; properties?: Record<string, string | number> }) => {
      const p = feature.properties ?? {}, coordinates = feature.geometry?.coordinates;
      if (!coordinates || coordinates.length < 2 || !coordinates.slice(0, 2).every(Number.isFinite) || Math.abs(coordinates[1]) > 90 || Math.abs(coordinates[0]) > 180 || String(p.countrycode).toLowerCase() !== 'vn') return [];
      const street = [p.housenumber, p.street].filter(Boolean).join(' ');
      const address = [...new Set([p.name, street, p.district, p.city, p.county, p.state, p.country].filter(Boolean).map(String))].join(', ');
      return [{ id: `${p.osm_type}-${p.osm_id}-${coordinates.join(',')}`, name: String(p.name || p.street || 'Vị trí tìm thấy'), address, latitude: coordinates[1], longitude: coordinates[0] }];
    });
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(url, { time: Date.now(), items });
    return items;
  });
  queue = pending;
  try { return await pending; } catch (error) {
    if (error instanceof DOMException) throw new Error('Tra địa chỉ quá thời gian hoặc bị chặn kết nối. Bạn vẫn có thể nhập vị trí thủ công.');
    throw error;
  }
}
export function searchAddress(query: string) {
  if (query.trim().length < 3) return Promise.reject(new Error('Nhập ít nhất 3 ký tự, kèm tỉnh/thành để tìm chính xác hơn.'));
  return lookup('api/', { q: query.trim(), limit: '5', bbox: '102,7,117,24' });
}
export function addressAt(latitude: number, longitude: number) {
  return lookup('reverse', { lat: String(latitude), lon: String(longitude), limit: '3' });
}
