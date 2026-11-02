import { useEffect, useRef, useState } from 'react';
import { InteractiveMap, validCoordinates } from '../places/InteractiveMap';
import { addressAt, searchAddress, type GeocodedPlace } from '../places/geocoding';

export function PlaceLocationEditor({ name, address, latitude, longitude, area, onChange }: {
  name: string; address: string; latitude: unknown; longitude: unknown; area: string;
  onChange: (location: { address?: string; latitude: number; longitude: number }) => void;
}) {
  const [query, setQuery] = useState([name, area, 'Việt Nam'].filter(Boolean).join(', '));
  const [candidates, setCandidates] = useState<GeocodedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const valid = validCoordinates(latitude, longitude);
  async function lookup(reverse = false) {
    const id = ++generation.current;
    setLoading(true); setCandidates([]); setMessage('');
    try {
      const items = reverse ? await addressAt(Number(latitude), Number(longitude)) : await searchAddress(query);
      if (id !== generation.current) return;
      setCandidates(items);
      if (!items.length) setMessage('Chưa tìm thấy địa chỉ phù hợp. Thử thêm tỉnh/thành hoặc nhập địa chỉ thủ công.');
    } catch (error) { if (id === generation.current) setMessage((error as Error).message); }
    finally { if (id === generation.current) setLoading(false); }
  }
  return <div className="location-editor">
    <strong>Xác định địa chỉ và vị trí</strong>
    <p>Tìm theo tên kèm tỉnh/thành, chọn kết quả phù hợp rồi kiểm tra ghim trước khi lưu địa điểm.</p>
    <div className="location-editor-search">
      <input aria-label="Tên hoặc địa chỉ cần tra cứu" value={query} onChange={e => { generation.current++; setLoading(false); setQuery(e.target.value); setCandidates([]); setMessage(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void lookup(); } }} />
      <button className="btn-secondary" type="button" disabled={loading} onClick={() => void lookup()}>Tra địa chỉ</button>
      <button className="btn-secondary" type="button" disabled={loading || !valid} onClick={() => void lookup(true)}>Tra từ tọa độ hiện tại</button>
    </div>
    {loading && <p role="status">Đang tra địa chỉ…</p>}
    {message && <p role="status">{message}</p>}
    <div className="location-candidates">{candidates.map(item => <button key={item.id} type="button" onClick={() => { onChange({ address: item.address, latitude: item.latitude, longitude: item.longitude }); setMessage('Đã điền địa chỉ và tọa độ. Kiểm tra ghim rồi bấm lưu.'); }}>
      <strong>{item.name}</strong><br />{item.address}
    </button>)}</div>
    {valid && <><InteractiveMap points={[{ id: 'editing', name, address, latitude: Number(latitude), longitude: Number(longitude) }]} selectedId="editing" onMove={(lat, lon) => { generation.current++; setLoading(false); setCandidates([]); onChange({ latitude: lat, longitude: lon }); setMessage('Đã điều chỉnh ghim. Địa chỉ đang giữ nguyên; tra lại từ tọa độ nếu cần.'); }} />
      <p>Bấm vào bản đồ để điều chỉnh vị trí lối vào. Tọa độ: {Number(latitude).toFixed(6)}, {Number(longitude).toFixed(6)}.</p></>}
    <p>Tra cứu bởi <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">Photon</a> · Dữ liệu © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>. Kết quả gợi ý cần được kiểm tra; chưa lưu cho đến khi bạn bấm lưu.</p>
  </div>;
}
