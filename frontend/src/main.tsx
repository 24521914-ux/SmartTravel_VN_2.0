import { useState } from 'react';
import { createRoot } from 'react-dom/client';

type Place = { place_id: string; name: string; status: string; version: number };
type Page<T> = { items: T[]; next_cursor: string | null; as_of: string; watermark: number };

function App() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState('Chưa gọi API stub');
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    setStatus('Đang tải…');
    try {
      const response = await fetch('/api/v1/places?limit=20', { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error(`API trả HTTP ${response.status}`);
      const page: Page<Place> = await response.json();
      setPlaces(page.items);
      setStatus(page.items.length ? 'Đã nhận fixture từ API stub' : 'Không có địa điểm');
    } catch (error) {
      setPlaces([]);
      setStatus(error instanceof Error ? error.message : 'Không gọi được API stub');
    } finally { setLoading(false); }
  }
  return <main>
    <h1>SmartTravel VN — P00 scaffold</h1>
    <p>Đây là dữ liệu synthetic, không phải frontend nghiệp vụ đã hoàn thành.</p>
    <button disabled={loading} onClick={load}>Kiểm tra Catalog stub</button>
    <p role="status" aria-live="polite">{status}</p>
    <ul>{places.map(place => <li key={place.place_id}>{place.name}</li>)}</ul>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
