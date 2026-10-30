import { useEffect, useState, type FormEvent } from 'react';
import type { Page, Resource, TravelClient } from '../../shared/api';
import { ErrorState } from '../../shared/ui';

export function ContributionsPanel({ travel }: { travel: TravelClient }) {
  const [rows, setRows] = useState<Resource[]>([]);
  const [places, setPlaces] = useState<Resource[]>([]);
  const [categories, setCategories] = useState<Resource[]>([]);
  const [type, setType] = useState('ADD');
  const [target, setTarget] = useState('');
  const [editing, setEditing] = useState<Resource | null>(null);
  const [name, setName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  async function load(next?: string) {
    const page = await travel.read<Page>('community', `/me/contributions${next ? `?cursor=${encodeURIComponent(next)}` : ''}`);
    setRows(old => next ? [...old, ...page.items] : page.items); setCursor(page.next_cursor ?? null);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Không thể gửi đóng góp.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void run(async () => {
    await load(); const categoryPage = await travel.read<Page>('catalog', '/categories?limit=100'); setCategories(categoryPage.items);
  }); }, [travel]);
  async function searchPlaces(query: string) { const page = await travel.places(query); setPlaces(page.items); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const fields: Resource = { name: name.trim() };
      if (latitude !== '') fields.latitude = Number(latitude);
      if (longitude !== '') fields.longitude = Number(longitude);
      if (category) fields.category_ids = [category];
      if (editing) await travel.mutate('community', `/contributions/${encodeURIComponent(String(editing.contribution_id ?? editing.id))}`, { fields }, 'PATCH', Number(editing.version));
      else {
        const place = type === 'EDIT' ? await travel.place(target) : null;
        await travel.mutate('community', '/contributions', { type, target_id: place ? target : null, expected_version: place ? Number(place.version) : 0, fields });
      }
      setEditing(null); setName(''); setLatitude(''); setLongitude(''); await load();
      setMessage('Đã gửi đóng góp, đang chờ kiểm duyệt. Dữ liệu địa điểm chỉ đổi sau khi được áp dụng.');
    });
  }
  return <section className="travel-panel" aria-label="Đóng góp dữ liệu" style={{ padding: 24 }}>
    <h2>Đóng góp địa điểm</h2><p>Đề xuất địa điểm mới hoặc sửa thông tin. Theo dõi trạng thái kiểm duyệt và áp dụng ở bên dưới.</p>
    {error && <ErrorState message={error} onRetry={() => void run(() => load())} />}{message && <p role="status">{message}</p>}
    <form onSubmit={e => void submit(e)} style={{ display: 'grid', gap: 12 }}>
      {!editing && <label>Loại đóng góp <select value={type} onChange={e => setType(e.target.value)}><option value="ADD">Thêm địa điểm</option><option value="EDIT">Sửa địa điểm</option></select></label>}
      {!editing && type === 'EDIT' && <><label>Tìm địa điểm cần sửa <input type="search" onChange={e => setTarget('')} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void run(() => searchPlaces(e.currentTarget.value)); } }} /></label><button type="button" className="btn-secondary" onClick={e => { const input = e.currentTarget.parentElement?.querySelector<HTMLInputElement>('input[type="search"]'); void run(() => searchPlaces(input?.value ?? '')); }}>Tìm địa điểm đóng góp</button><label>Địa điểm <select required value={target} onChange={e => setTarget(e.target.value)}><option value="">Chọn địa điểm</option>{places.map(p => <option key={String(p.place_id ?? p.id)} value={String(p.place_id ?? p.id)}>{String(p.name)}</option>)}</select></label></>}
      <label>Tên địa điểm đề xuất <input required maxLength={1024} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Vĩ độ <input required={(editing?.type ?? type) === 'ADD'} type="number" min={-90} max={90} step="any" value={latitude} onChange={e => setLatitude(e.target.value)} /></label>
      <label>Kinh độ <input required={(editing?.type ?? type) === 'ADD'} type="number" min={-180} max={180} step="any" value={longitude} onChange={e => setLongitude(e.target.value)} /></label>
      <label>Danh mục <select value={category} onChange={e => setCategory(e.target.value)}><option value="">Chưa chọn</option>{categories.map(c => <option key={String(c.category_id ?? c.id)} value={String(c.category_id ?? c.id)}>{String(c.name)}</option>)}</select></label>
      <button className="btn-primary" disabled={busy || (!editing && type === 'EDIT' && !target)}>{editing ? 'Lưu đóng góp' : 'Gửi đóng góp'}</button>
      {editing && <button type="button" className="btn-subtle" onClick={() => { setEditing(null); setName(''); }}>Hủy chỉnh sửa</button>}
    </form>
    <h3>Đóng góp của tôi</h3><button className="btn-secondary" disabled={busy} onClick={() => void run(() => load())}>Cập nhật trạng thái đóng góp</button>
    {busy && <p role="status">Đang xử lý đóng góp...</p>}
    {rows.map(row => { const fields = row.fields as Resource | undefined; return <article className="travel-panel" key={String(row.contribution_id ?? row.id)} style={{ padding: 16 }}><h4>{String(fields?.name ?? row.contribution_id ?? row.id)}</h4><p>Trạng thái: {String(row.status)}</p>
      {String(row.status) === 'PENDING' && <button className="btn-secondary" disabled={busy} onClick={() => { setEditing(row); setName(String(fields?.name ?? '')); setLatitude(String(fields?.latitude ?? '')); setLongitude(String(fields?.longitude ?? '')); setCategory(String((fields?.category_ids as string[] | undefined)?.[0] ?? '')); }}>Sửa đóng góp</button>}
      {String(row.status) === 'PENDING' && <button className="btn-subtle" disabled={busy} onClick={() => void run(async () => { await travel.mutate('community', `/contributions/${encodeURIComponent(String(row.contribution_id ?? row.id))}/withdraw`, undefined, 'POST', Number(row.version)); await load(); setMessage('Đã rút đóng góp.'); })}>Rút đóng góp</button>}
    </article>; })}
    {!busy && !error && !rows.length && <p>Chưa có đóng góp nào.</p>}
    {cursor && <button className="btn-secondary" disabled={busy} onClick={() => void run(() => load(cursor))}>Xem thêm đóng góp</button>}
  </section>;
}
