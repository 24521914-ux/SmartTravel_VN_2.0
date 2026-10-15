import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, type ServiceName } from './api/types';
import { TravelClient, type Page, type Resource } from './api/travel';

type Props = { travel: TravelClient };
const resourceId = (row: Resource) => String(row.id ?? row.review_id ?? row.business_id ?? row.place_id ?? '');
const title = (row: Resource) => String(row.name ?? row.content ?? row.display_name ?? 'Chi tiết');
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (e) {
      setError(e instanceof ApiError ? `${e.message} (${e.body.code}). Mã hỗ trợ: ${e.body.traceId}` : 'Không thể kết nối. Vui lòng thử lại.');
    } finally { setBusy(false); }
  }
  return { busy, run, setMessage, feedback: <><p role="status" aria-live="polite">{busy ? 'Đang xử lý…' : message}</p>{error && <p role="alert" className="travel-error">{error}</p>}</> };
}
function submit(event: FormEvent<HTMLFormElement>, action: (data: FormData) => Promise<void>, run: (action: () => Promise<void>) => Promise<void>) {
  event.preventDefault(); const data = new FormData(event.currentTarget); void run(() => action(data));
}

export function MapPanel({ travel }: Props) {
  const { busy, run, feedback } = useAction();
  const [places, setPlaces] = useState<Resource[]>([]);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [query, setQuery] = useState('');
  async function load(next?: string) {
    const params = new URLSearchParams(); if (query.trim()) params.set('q', query.trim()); if (next) params.set('cursor', next);
    const result = await travel.read<Page>('catalog', `/places?${params}`);
    setPlaces(old => next ? [...old, ...result.items] : result.items); setCursor(result.next_cursor ?? null);
    if (!next) { setSelected(null); setShowMap(false); }
  }
  useEffect(() => { void run(() => load()); }, [travel]);
  const lat = Number(selected?.latitude), lon = Number(selected?.longitude);
  const valid = selected && selected.latitude != null && selected.longitude != null && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const bbox = valid ? [Math.max(-180, lon - .025), Math.max(-90, lat - .025), Math.min(180, lon + .025), Math.min(90, lat + .025)].join(',') : '';
  const link = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`;
  return <section aria-label="Bản đồ địa điểm" aria-busy={busy}>{feedback}
    <form onSubmit={e => submit(e, () => load(), run)}><label>Tìm trên bản đồ<input value={query} onChange={e => setQuery(e.target.value)} maxLength={1024} /></label><button disabled={busy}>Tìm địa điểm trên bản đồ</button></form>
    <div className="travel-grid">{places.map(row => <article className="travel-panel" key={resourceId(row)}><h2>{title(row)}</h2><button disabled={busy} onClick={() => void run(async () => { setSelected(await travel.place(resourceId(row))); setShowMap(false); })}>Xem vị trí</button></article>)}</div>
    {!busy && !places.length && <p>Chưa có địa điểm phù hợp.</p>}{cursor && <button disabled={busy} onClick={() => void run(() => load(cursor))}>Thêm địa điểm trên bản đồ</button>}
    {selected && <section className="travel-panel"><h2>Vị trí: {title(selected)}</h2>{valid ? <><p>Vĩ độ {lat} · Kinh độ {lon}</p><a href={link} target="_blank" rel="noopener noreferrer">Mở vị trí trên OpenStreetMap</a><p>Bản đồ trực tuyến được tải từ OpenStreetMap khi bạn chọn xem.</p><button onClick={() => setShowMap(value => !value)}>{showMap ? 'Ẩn bản đồ trực tuyến' : 'Xem bản đồ trực tuyến'}</button>{showMap && <><iframe title={`Bản đồ ${title(selected)}`} src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lon}`} loading="lazy" referrerPolicy="no-referrer" style={{ display: 'block', width: '100%', height: 360, border: 0, marginTop: 16 }} /><p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a></p></>}</> : <p>Địa điểm chưa có tọa độ để hiển thị bản đồ.</p>}</section>}
  </section>;
}

export function BusinessPanel({ travel }: Props) {
  const { busy, run, setMessage, feedback } = useAction();
  const [rows, setRows] = useState<Resource[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [members, setMembers] = useState<Resource[]>([]);
  const [claim, setClaim] = useState<Resource | null>(null);
  const [verification, setVerification] = useState<Resource | null>(null);
  async function load(next?: string) {
    const result = await travel.read<Page>('catalog', `/businesses${next ? `?cursor=${encodeURIComponent(next)}` : ''}`);
    setRows(old => next ? [...old, ...result.items] : result.items); setCursor(result.next_cursor ?? null);
  }
  useEffect(() => { void run(() => load()); }, [travel]);
  return <section aria-label="Quản lý doanh nghiệp" aria-busy={busy}>{feedback}<button disabled={busy} onClick={() => void run(() => load())}>Tải lại doanh nghiệp</button>
    <form onSubmit={e => submit(e, async data => { await travel.mutate('catalog', '/businesses', { name: data.get('name') }); await load(); setMessage('Đã tạo doanh nghiệp.'); }, run)}><label>Tên doanh nghiệp<input name="name" required maxLength={1024} /></label><button disabled={busy}>Tạo doanh nghiệp</button></form>
    <div className="travel-grid">{rows.map(row => <article className="travel-panel" key={resourceId(row)}><h2>{title(row)}</h2><p>Trạng thái: {String(row.status)}</p><button disabled={busy} onClick={() => void run(async () => { const business = await travel.read('catalog', `/businesses/${resourceId(row)}`); const list = await travel.read<Page>('catalog', `/businesses/${resourceId(row)}/members`); setSelected(business); setMembers(list.items); setClaim(null); setVerification(null); })}>Quản lý doanh nghiệp</button></article>)}</div>
    {!busy && !rows.length && <p>Bạn chưa có doanh nghiệp.</p>}{cursor && <button disabled={busy} onClick={() => void run(() => load(cursor))}>Xem thêm doanh nghiệp</button>}
    {selected && <section className="travel-panel"><h2>Doanh nghiệp: {title(selected)}</h2><h3>Thành viên</h3>{members.length ? members.map((row, index) => <p key={String(row.member_id ?? index)}>{String(row.display_name ?? row.user_id ?? 'Thành viên')} · {String(row.role)}</p>) : <p>Chưa có thành viên hiển thị.</p>}
      <h3>Xác minh doanh nghiệp</h3><p>Doanh nghiệp cần được xác minh trước khi yêu cầu quản lý địa điểm.</p><form onSubmit={e => submit(e, async data => { setVerification(await travel.mutate('catalog', `/businesses/${resourceId(selected)}/verification`, { evidence_keys: String(data.get('verificationEvidence')).split('\n').map(key => key.trim()).filter(Boolean) })); setMessage('Đã gửi hồ sơ xác minh; chờ kiểm duyệt.'); }, run)}><label>Minh chứng xác minh (mỗi dòng một mã)<textarea name="verificationEvidence" required maxLength={1024} /></label><button disabled={busy}>Gửi hồ sơ xác minh</button></form>{verification && <p role="status">Hồ sơ {String(verification.request_id ?? verification.verification_id ?? verification.id)} · Trạng thái {String(verification.status)}</p>}
      <h3>Yêu cầu quản lý địa điểm</h3><form onSubmit={e => submit(e, async data => { const result = await travel.mutate('catalog', `/businesses/${resourceId(selected)}/claims`, { place_id: data.get('place'), evidence_keys: String(data.get('evidence')).split('\n').map(key => key.trim()).filter(Boolean) }); setClaim(result); setMessage('Đã gửi yêu cầu; quyền quản lý chỉ có sau khi được duyệt.'); }, run)}><label>Mã địa điểm cần quản lý<input name="place" required pattern="[0-9a-fA-F-]{36}" /></label><label>Minh chứng đã tải lên (mỗi dòng một mã)<textarea name="evidence" required maxLength={1024} /></label><button disabled={busy}>Gửi yêu cầu quản lý</button></form>{claim && <p role="status">Yêu cầu {String(claim.claim_id)} · Trạng thái {String(claim.status)}</p>}
    </section>}
  </section>;
}

export function ModerationPanel({ travel }: Props) {
  const { busy, run, setMessage, feedback } = useAction();
  const [mode, setMode] = useState('reviews');
  const [rows, setRows] = useState<Resource[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const service: ServiceName = mode === 'reviews' ? 'community' : 'catalog';
  async function load(next?: string) {
    const result = await travel.read<Page>(service, `/admin/${mode}${next ? `?cursor=${encodeURIComponent(next)}` : ''}`);
    setRows(old => next ? [...old, ...result.items] : result.items); setCursor(result.next_cursor ?? null);
  }
  useEffect(() => { setRows([]); setCursor(null); void run(() => load()); }, [mode, travel]);
  return <section aria-label="Kiểm duyệt nội dung" aria-busy={busy}>{feedback}<label>Nội dung kiểm duyệt<select value={mode} disabled={busy} onChange={e => setMode(e.target.value)}><option value="reviews">Đánh giá</option><option value="places">Địa điểm</option></select></label><button disabled={busy} onClick={() => void run(() => load())}>Tải lại kiểm duyệt</button>
    <details className="travel-panel"><summary>Xét duyệt hồ sơ xác minh doanh nghiệp</summary><form onSubmit={e => submit(e, async data => {
      const version = Number(data.get('version'));
      await travel.mutate('catalog', `/admin/business-verifications/${encodeURIComponent(String(data.get('verification')))}/review`, { action: data.get('action'), reason: data.get('reason') }, 'POST', version);
      setMessage('Đã lưu quyết định xác minh doanh nghiệp.');
    }, run)}><label>Mã hồ sơ xác minh<input name="verification" required pattern="[0-9a-fA-F-]{36}" /></label><label>Phiên bản hồ sơ<input name="version" type="number" min="1" step="1" required /></label><label>Quyết định xác minh<select name="action"><option value="APPROVE">Duyệt</option><option value="REJECT">Từ chối</option><option value="REVOKE">Thu hồi</option></select></label><label>Lý do xác minh<input name="reason" required maxLength={1024} /></label><button disabled={busy}>Lưu quyết định xác minh</button></form></details>
    {rows.map(row => <article className="travel-panel" key={resourceId(row)}><h2>{title(row)}</h2><p>Trạng thái: {String(row.status)}</p><form onSubmit={e => submit(e, async data => {
      const version = Number(row.version); if (!Number.isSafeInteger(version) || version < 1) throw new Error('Missing version');
      if (mode === 'reviews') await travel.mutate('community', `/admin/reviews/${resourceId(row)}/moderate`, { action: data.get('action'), reason: data.get('reason') }, 'POST', version);
      else await travel.mutate('catalog', `/admin/places/${resourceId(row)}/status`, { status: data.get('action') }, 'PUT', version);
      await load(); setMessage('Đã lưu quyết định. Các bản sao dữ liệu sẽ được cập nhật.');
    }, run)}><label>Quyết định<select name="action" required>{(mode === 'reviews' ? [['APPROVE', 'Duyệt'], ['REJECT', 'Từ chối'], ['HIDE', 'Ẩn'], ['RESTORE', 'Khôi phục']] : [['PUBLISHED', 'Công khai'], ['HIDDEN', 'Ẩn'], ['DRAFT', 'Bản nháp'], ['ARCHIVED', 'Lưu trữ']]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{mode === 'reviews' && <label>Lý do quyết định<input name="reason" required maxLength={1024} /></label>}<button disabled={busy}>Lưu quyết định kiểm duyệt</button></form></article>)}
    {!busy && !rows.length && <p>Chưa có nội dung cần kiểm duyệt.</p>}{cursor && <button disabled={busy} onClick={() => void run(() => load(cursor))}>Xem thêm nội dung kiểm duyệt</button>}
  </section>;
}
