import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Page, Resource, TravelClient } from '../../shared/api';
import { ErrorState } from '../../shared/ui';

type Field = { key: string; label: string; kind?: 'number' | 'boolean' | 'list' | 'reference'; options?: string[]; source?: string; multiple?: boolean; min?: number; max?: number };
const definitions: Record<string, { label: string; id: string; fields: Field[] }> = {
  places: { label: 'Địa điểm', id: 'place_id', fields: [
    { key: 'name', label: 'Tên địa điểm' }, { key: 'latitude', label: 'Vĩ độ', kind: 'number', min: -90, max: 90 },
    { key: 'longitude', label: 'Kinh độ', kind: 'number', min: -180, max: 180 },
    { key: 'category_ids', label: 'Danh mục', kind: 'reference', source: 'categories', multiple: true },
    { key: 'tag_ids', label: 'Nhãn', kind: 'reference', source: 'tags', multiple: true },
    { key: 'amenity_ids', label: 'Tiện ích', kind: 'reference', source: 'amenities', multiple: true },
    { key: 'geographic_unit_id', label: 'Đơn vị hành chính', kind: 'reference', source: 'geographic-units' },
    { key: 'destination_ids', label: 'Điểm đến', kind: 'reference', source: 'destinations', multiple: true },
    { key: 'price', label: 'Giá (VND; để trống nếu chưa biết)', kind: 'number', min: 0 },
    { key: 'media_keys', label: 'Mã tài nguyên ảnh đã được duyệt (mỗi dòng một mã)', kind: 'list' },
  ] },
  'geographic-units': { label: 'Địa lý', id: 'id', fields: [{ key: 'name', label: 'Tên đơn vị' }, { key: 'level', label: 'Cấp', options: ['COUNTRY', 'PROVINCE', 'DISTRICT', 'WARD'] }, { key: 'parent_id', label: 'Đơn vị cha', kind: 'reference', source: 'geographic-units' }, { key: 'aliases', label: 'Tên gọi khác (mỗi dòng một tên)', kind: 'list' }] },
  destinations: { label: 'Điểm đến', id: 'destination_id', fields: [{ key: 'name', label: 'Tên điểm đến' }, { key: 'geographic_unit_ids', label: 'Đơn vị hành chính', kind: 'reference', source: 'geographic-units', multiple: true }] },
  categories: { label: 'Danh mục', id: 'id', fields: [{ key: 'name', label: 'Tên danh mục' }, { key: 'active', label: 'Đang hoạt động', kind: 'boolean' }] },
  tags: { label: 'Nhãn', id: 'id', fields: [{ key: 'name', label: 'Tên nhãn' }, { key: 'active', label: 'Đang hoạt động', kind: 'boolean' }] },
  amenities: { label: 'Tiện ích', id: 'id', fields: [{ key: 'name', label: 'Tên tiện ích' }, { key: 'active', label: 'Đang hoạt động', kind: 'boolean' }] },
  offerings: { label: 'Dịch vụ', id: 'offering_id', fields: [{ key: 'name', label: 'Tên dịch vụ' }, { key: 'place_id', label: 'Địa điểm', kind: 'reference', source: 'places' }, { key: 'type', label: 'Loại dịch vụ', options: ['SERVICE', 'TOUR', 'EVENT', 'ACTIVITY', 'EXPERIENCE'] }, { key: 'price', label: 'Giá (VND)', kind: 'number', min: 0 }] },
};
const rowId = (row: Resource, key: string) => String(row[key] ?? row.id ?? row.place_id ?? row.category_id ?? row.tag_id ?? row.amenity_id ?? row.geographic_unit_id ?? row.destination_id ?? row.offering_id ?? '');

export function AdminCatalogManager({ travel }: { travel: TravelClient }) {
  const [kind, setKind] = useState('places');
  const [rows, setRows] = useState<Resource[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Resource>({});
  const [references, setReferences] = useState<Record<string, Resource[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const definition = definitions[kind];
  const base = `/admin/${kind}`;

  async function load(next?: string) {
    const current = generation.current;
    const page = await travel.read<Page>('catalog', `${base}${next ? `?cursor=${encodeURIComponent(next)}` : ''}`);
    if (current !== generation.current) return;
    setRows(old => next ? [...old, ...page.items] : page.items);
    setCursor(page.next_cursor ?? null);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Không thể lưu thay đổi.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    ++generation.current;
    setRows([]); setSelected(null); setEditing(false); setCursor(null);
    void run(() => load());
  }, [kind, travel]);

  async function edit(row?: Resource) {
    const detail = row ? await travel.read<Resource>('catalog', `${base}/${encodeURIComponent(rowId(row, definition.id))}`) : null;
    const sources = [...new Set(definition.fields.flatMap(f => f.source ? [f.source] : []))];
    const entries = await Promise.all(sources.map(async source => {
      const all: Resource[] = []; let next: string | null | undefined;
      do {
        const page = await travel.read<Page>('catalog', `/admin/${source}?limit=100${next ? `&cursor=${encodeURIComponent(next)}` : ''}`);
        all.push(...page.items); next = page.next_cursor;
      } while (next);
      return [source, all] as const;
    }));
    setReferences(Object.fromEntries(entries)); setSelected(detail);
    setValues(detail ?? { name: '', active: true, currency: 'VND' }); setEditing(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const body: Resource = {};
      for (const field of definition.fields) {
        const value = values[field.key];
        if (value !== undefined && value !== '') body[field.key] = value;
        else if (field.key === 'price' && kind === 'places') body.price = null;
        else if (field.key === 'parent_id') body.parent_id = null;
      }
      if (kind === 'places' || kind === 'offerings') body.currency = 'VND';
      if (selected) await travel.mutate('catalog', `${base}/${encodeURIComponent(rowId(selected, definition.id))}`, body, 'PATCH', Number(selected.version));
      else await travel.mutate('catalog', base, body);
      setEditing(false); await load(); setMessage('Đã lưu dữ liệu.');
    });
  }
  return <section className="travel-panel" aria-label="Quản lý danh mục du lịch" style={{ padding: 24, marginTop: 24 }}>
    <h2>Danh mục du lịch</h2>
    <label>Nhóm dữ liệu <select value={kind} disabled={busy} onChange={e => setKind(e.target.value)}>{Object.entries(definitions).map(([key, d]) => <option key={key} value={key}>{d.label}</option>)}</select></label>
    <button className="btn-secondary" disabled={busy} onClick={() => void run(() => edit())}>Thêm {definition.label.toLowerCase()}</button>
    <button className="btn-subtle" disabled={busy} onClick={() => void run(() => load())}>Tải lại danh mục</button>
    {error && <ErrorState message={error} />}{message && <p role="status">{message}</p>}{busy && <p role="status">Đang xử lý danh mục...</p>}
    {editing && <form onSubmit={e => void save(e)} style={{ display: 'grid', gap: 12 }}>
      <h3>{selected ? 'Sửa' : 'Thêm'} {definition.label.toLowerCase()}</h3>
      {definition.fields.map(field => <label key={field.key}>{field.label}
        {field.kind === 'boolean' ? <input type="checkbox" checked={Boolean(values[field.key])} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.checked }))} />
        : field.options ? <select required value={String(values[field.key] ?? '')} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value }))}><option value="">Chọn {field.label.toLowerCase()}</option>{field.options.map(o => <option key={o}>{o}</option>)}</select>
        : field.source ? <select multiple={field.multiple} value={field.multiple ? (values[field.key] as string[] ?? []) : String(values[field.key] ?? '')} onChange={e => { const value = field.multiple ? Array.from(e.target.selectedOptions, o => o.value) : e.target.value; setValues(v => ({ ...v, [field.key]: value })); }}>
          {!field.multiple && <option value="">Chưa chọn</option>}{(references[field.source] ?? []).filter(r => !(field.key === 'parent_id' && selected && rowId(r, definitions[field.source!].id) === rowId(selected, definition.id))).map(r => { const id = rowId(r, definitions[field.source!].id); return <option key={id} value={id}>{String(r.name ?? id)}</option>; })}</select>
        : field.kind === 'list' ? <textarea value={(values[field.key] as string[] ?? []).join('\n')} onChange={e => setValues(v => ({ ...v, [field.key]: e.target.value.split('\n').filter(Boolean) }))} />
        : <input required={field.key === 'name'} type={field.kind === 'number' ? 'number' : 'text'} step="any" min={field.min} max={field.max} maxLength={1024} value={String(values[field.key] ?? '')} onChange={e => { const value = field.kind === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value; setValues(v => ({ ...v, [field.key]: value })); }} />}
      </label>)}
      <button className="btn-primary" disabled={busy}>Lưu danh mục</button><button type="button" className="btn-subtle" onClick={() => setEditing(false)}>Hủy chỉnh sửa</button>
    </form>}
    <div className="travel-grid">{rows.map(row => <article className="travel-panel" key={rowId(row, definition.id)} style={{ padding: 16 }}><h3>{String(row.name)}</h3><p>{String(row.status ?? (row.active === false ? 'Ngừng hoạt động' : ''))}</p>
      <button className="btn-secondary" disabled={busy} onClick={() => void run(() => edit(row))}>Chi tiết / sửa {String(row.name)}</button>
      {kind === 'offerings' && <>{(['PUBLISHED', 'HIDDEN'] as const).map(status => <button key={status} className="btn-secondary" disabled={busy} onClick={() => void run(async () => {
        const id = rowId(row, definition.id);
        const current = await travel.read<Resource>('catalog', `${base}/${encodeURIComponent(id)}`);
        await travel.mutate('catalog', `${base}/${encodeURIComponent(id)}`, { status }, 'PATCH', Number(current.version));
        await load(); setMessage(status === 'PUBLISHED' ? 'Đã công khai dịch vụ.' : 'Đã ẩn dịch vụ.');
      })}>{status === 'PUBLISHED' ? 'Công khai dịch vụ' : 'Ẩn dịch vụ'}</button>)}</>}
      <button className="btn-subtle" disabled={busy} onClick={() => { if (window.confirm(`Ngừng sử dụng ${String(row.name)}? Bản ghi được lưu lại để bảo toàn lịch sử.`)) void run(async () => { const detail = await travel.read<Resource>('catalog', `${base}/${encodeURIComponent(rowId(row, definition.id))}`); await travel.mutate('catalog', `${base}/${encodeURIComponent(rowId(row, definition.id))}`, undefined, 'DELETE', Number(detail.version)); await load(); setMessage('Đã ngừng sử dụng bản ghi; dữ liệu lịch sử vẫn được giữ lại.'); }); }}>Xóa {String(row.name)}</button>
    </article>)}</div>
    {!busy && !error && !rows.length && <p>Chưa có dữ liệu trong nhóm này.</p>}
    {cursor && <button className="btn-secondary" disabled={busy} onClick={() => void run(() => load(cursor))}>Xem thêm danh mục</button>}
  </section>;
}
