import { useEffect, useState, type FormEvent } from 'react';
import { ApiClient } from './api/client';
import { browserTokenStore } from './api/auth';
import { IdentityClient } from './api/identity';
import { ApiError, type ServiceName } from './api/types';
import { TravelClient, type Page, type Resource } from './api/travel';
import './travel.css';
import TripEditor from './TripEditor';
import { BusinessPanel, MapPanel, ModerationPanel } from './OperationalPanels';

const tokens = browserTokenStore();
const client = new ApiClient({ tokenStore: tokens });
const identity = new IdentityClient(client, tokens);
const travel = new TravelClient(client);
const sections = ['Khám phá', 'Bản đồ', 'Gợi ý', 'Bộ sưu tập', 'Chuyến đi', 'Thông báo', 'Tài khoản', 'Doanh nghiệp', 'Kiểm duyệt', 'Quản trị'] as const;
const detailLabels: Record<string, string> = { name: 'Tên', description: 'Giới thiệu', address: 'Địa chỉ', type: 'Loại', status: 'Trạng thái', latitude: 'Vĩ độ', longitude: 'Kinh độ', start_date: 'Ngày bắt đầu', end_date: 'Ngày kết thúc', currency: 'Đơn vị tiền', budget: 'Ngân sách', display_name: 'Tên hiển thị', email: 'Email', title: 'Tiêu đề', body: 'Nội dung', content: 'Nội dung', rating: 'Số sao', score: 'Điểm gợi ý', explanation: 'Vì sao gợi ý' };
type Section = typeof sections[number];
function label(row: Resource): string { return String(row.name ?? row.title ?? row.display_name ?? row.content ?? row.explanation ?? row.email ?? 'Chi tiết'); }
function id(row: Resource): string { return String(row.id ?? row.place_id ?? row.trip_id ?? row.collection_id ?? row.notification_id ?? row.source_id ?? row.model_id ?? ''); }
function Field({ name, title, type = 'text', required = true }: { name: string; title: string; type?: string; required?: boolean }) {
  return <label>{title}<input name={name} type={type} required={required} maxLength={1024} /></label>;
}
export default function TravelApp() {
  const [section, setSection] = useState<Section>('Khám phá');
  const [session, setSession] = useState(Boolean(tokens.get()));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Resource[]>([]);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [reviews, setReviews] = useState<Resource[]>([]);
  const [profile, setProfile] = useState<Resource | null>(null);
  const [preferences, setPreferences] = useState<Resource | null>(null);
  const [query, setQuery] = useState('');
  const [admin, setAdmin] = useState('sources');
  const [cursor, setCursor] = useState<string | null>(null);
  const [recommendationId, setRecommendationId] = useState<string>();
  const [pickedRecommendation, setPickedRecommendation] = useState<string>();
  const [suggestedPlace, setSuggestedPlace] = useState<string>();
  const [collectionItems, setCollectionItems] = useState<Resource[]>([]);
  const [job, setJob] = useState<Resource | null>(null);
  const [modelMetrics, setModelMetrics] = useState<Resource | null>(null);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (e) {
      setError(e instanceof ApiError ? `${e.message} (${e.body.code}). Mã hỗ trợ: ${e.body.traceId}${e.body.fieldErrors.map(f => `; ${f.field ?? ''}: ${f.message}`).join('')}` : (e as Error).message);
      if (e instanceof ApiError && e.status === 401) setMessage('Phiên đã hết hạn. Gia hạn phiên hoặc đăng nhập lại.');
    } finally { setBusy(false); setSession(Boolean(tokens.get())); }
  }
  async function load(next?: string) {
    if (section === 'Bản đồ' || section === 'Doanh nghiệp' || section === 'Kiểm duyệt') return;
    if (section === 'Tài khoản') {
      const [p, prefs] = await Promise.all([travel.read('identity', '/me'), travel.read('identity', '/me/preferences')]);
      setProfile(p); setPreferences(prefs); return;
    }
    let service: ServiceName = 'catalog'; let path = query.trim() ? `/places?q=${encodeURIComponent(query.trim())}` : '/places';
    if (section === 'Gợi ý') { const page = await travel.recommend(); setRecommendationId(String((page as unknown as Resource).request_id)); setRows(page.items); setCursor(null); return; }
    if (section === 'Bộ sưu tập') { service = 'community'; path = '/me/collections'; }
    if (section === 'Chuyến đi') { service = 'trip'; path = '/me/trips'; }
    if (section === 'Thông báo') { service = 'identity'; path = '/me/notifications'; }
    if (section === 'Quản trị') { service = admin === 'models' ? 'intelligence' : 'ingestion'; path = admin === 'models' ? '/admin/models' : '/admin/data-sources'; }
    if (next) path += `${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(next)}`;
    const page = await travel.read<Page>(service, path);
    setRows(old => next ? [...old, ...page.items] : page.items); setCursor(page.next_cursor ?? null);
  }
  useEffect(() => { setSelected(null); setRows([]); setCursor(null); void run(() => load()); }, [section, admin]);
  function form(event: FormEvent<HTMLFormElement>, action: (data: FormData) => Promise<void>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); void run(() => action(data));
  }
  async function open(row: Resource) {
    if (section === 'Khám phá' || section === 'Gợi ý') {
      const placeId = String(row.place_id ?? row.id);
      const [place, page] = await Promise.all([travel.place(placeId), travel.reviews(placeId)]);
      setSelected(place); setReviews(page.items);
      if (section === 'Gợi ý') { setSuggestedPlace(placeId); setPickedRecommendation(recommendationId); }
    } else if (section === 'Chuyến đi') setSelected(await travel.read('trip', `/trips/${id(row)}`));
    else if (section === 'Bộ sưu tập') { setSelected(await travel.read('community', `/me/collections/${id(row)}`)); setCollectionItems((await travel.read<Page>('community', `/collections/${id(row)}/items`)).items); }
    else setSelected(row);
  }
  return <div className="travel-app">
    <a className="travel-skip" href="#travel-main">Đến nội dung chính</a>
    <header><a href="/">SmartTravel <b>VN</b></a><span>Hành trình của bạn</span>{session && <button disabled={busy} onClick={() => void run(async () => { await identity.logout(); setProfile(null); setPreferences(null); setRows([]); setSelected(null); setPickedRecommendation(undefined); setSuggestedPlace(undefined); })}>Đăng xuất</button>}</header>
    <div className="travel-layout"><nav aria-label="Điều hướng ứng dụng">{sections.map(s => <button key={s} disabled={busy} aria-current={section === s ? 'page' : undefined} onClick={() => setSection(s)}>{s}</button>)}</nav>
    <main id="travel-main" tabIndex={-1} aria-busy={busy}><h1>{section}</h1><div aria-live="polite" className="travel-status">{busy ? 'Đang xử lý…' : message}</div>{error && <p role="alert" className="travel-error">{error}</p>}
    {!session && <section className="travel-panel"><h2>Đăng nhập để lưu hành trình</h2><form onSubmit={e => form(e, async d => { await identity.login(String(d.get('email')), String(d.get('password'))); setMessage('Đã đăng nhập.'); await load(); })}><Field name="email" title="Email" type="email" /><Field name="password" title="Mật khẩu" type="password" /><button disabled={busy}>Đăng nhập</button></form><details><summary>Tạo tài khoản</summary><form onSubmit={e => form(e, async d => { await travel.mutate('identity', '/auth/register', { email: d.get('email'), password: d.get('password'), display_name: d.get('name') }); setMessage('Đã gửi đăng ký. Kiểm tra email để xác minh tài khoản trước khi đăng nhập.'); })}><Field name="email" title="Email" type="email" /><Field name="password" title="Mật khẩu (ít nhất 12 ký tự)" type="password" /><Field name="name" title="Tên hiển thị" /><button disabled={busy}>Đăng ký</button></form></details><details><summary>Xác minh email</summary><form onSubmit={e => form(e, async d => { await travel.mutate('identity', '/auth/verify-email', { token: d.get('token') }); setMessage('Email đã được xác minh.'); })}><Field name="token" title="Mã xác minh trong email" /><button disabled={busy}>Xác minh</button></form></details></section>}
    {session && <button className="travel-subtle" disabled={busy} onClick={() => void run(async () => { await identity.refresh(); setMessage('Đã gia hạn phiên.'); })}>Gia hạn phiên đăng nhập</button>}
    {section === 'Khám phá' && <form className="travel-search" onSubmit={e => { e.preventDefault(); void run(() => load()); }}><label>Tìm địa điểm<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tên địa điểm hoặc từ khóa" /></label><button disabled={busy}>Tìm kiếm</button></form>}
    {section === 'Quản trị' && <label>Loại dữ liệu<select value={admin} onChange={e => setAdmin(e.target.value)}><option value="sources">Nguồn nhập dữ liệu</option><option value="models">Mô hình gợi ý</option></select></label>}
    {section === 'Bản đồ' && <MapPanel travel={travel} />}
    {section === 'Doanh nghiệp' && session && <BusinessPanel travel={travel} />}
    {section === 'Kiểm duyệt' && session && <ModerationPanel travel={travel} />}
    {!['Tài khoản', 'Bản đồ', 'Doanh nghiệp', 'Kiểm duyệt'].includes(section) && <><button disabled={busy} onClick={() => void run(() => load())}>Tải lại</button><div className="travel-grid">{rows.map((row, i) => <article className="travel-panel" key={`${id(row)}-${i}`}><h2>{label(row)}</h2>{row.description != null && <p>{String(row.description)}</p>}{row.status != null && <p>Trạng thái: {String(row.status)}</p>}{row.explanation != null && <p>{String(row.explanation)}</p>}<button disabled={busy} onClick={() => void run(() => open(row))}>Xem chi tiết</button>{section === 'Thông báo' && <button disabled={busy} onClick={() => void run(async () => { await travel.mutate('identity', `/me/notifications/${id(row)}/read`, undefined, 'PATCH'); await load(); })}>Đánh dấu đã đọc</button>}</article>)}</div>{!busy && !rows.length && <p>Chưa có dữ liệu hiển thị.</p>}{cursor && <button disabled={busy} onClick={() => void run(() => load(cursor))}>Xem thêm</button>}</>}
    {section === 'Bộ sưu tập' && session && <section className="travel-panel"><h2>Tạo bộ sưu tập</h2><form onSubmit={e => form(e, async d => { await travel.mutate('community', '/me/collections', { name: d.get('name'), visibility: d.get('visibility') }); await load(); })}><Field name="name" title="Tên bộ sưu tập" /><label>Quyền xem<select name="visibility"><option value="PRIVATE">Riêng tư</option><option value="PUBLIC">Công khai</option></select></label><button disabled={busy}>Tạo bộ sưu tập</button></form></section>}
    {section === 'Chuyến đi' && session && <section className="travel-panel"><h2>Tạo chuyến đi</h2><form onSubmit={e => form(e, async d => { await travel.mutate('trip', '/me/trips', { name: d.get('name'), start_date: d.get('start'), end_date: d.get('end'), timezone: 'Asia/Ho_Chi_Minh', currency: 'VND', budget: Number(d.get('budget')) }); await load(); })}><Field name="name" title="Tên chuyến đi" /><Field name="start" title="Ngày bắt đầu" type="date" /><Field name="end" title="Ngày kết thúc" type="date" /><Field name="budget" title="Ngân sách (VND)" type="number" /><button disabled={busy}>Tạo chuyến đi</button></form></section>}
    {selected && <section className="travel-panel"><button className="travel-subtle" onClick={() => setSelected(null)}>Đóng chi tiết</button><h2>{label(selected)}</h2><dl>{Object.entries(selected).filter(([k,v]) => detailLabels[k] && v !== null && typeof v !== 'object').map(([k,v]) => <div key={k}><dt>{detailLabels[k]}</dt><dd>{String(v)}</dd></div>)}</dl>{(section === 'Khám phá' || section === 'Gợi ý') && <><h3>Đánh giá</h3>{reviews.map((r,i) => <blockquote key={i}>{String(r.content)} · {String(r.rating)}/5</blockquote>)}{session && <><button disabled={busy} onClick={() => void run(async () => { await travel.mutate('community', `/me/favorites/${id(selected)}`, undefined, 'PUT'); setMessage('Đã lưu vào yêu thích.'); })}>Lưu yêu thích</button><form onSubmit={e => form(e, async d => { await travel.review(id(selected), Number(d.get('rating')), String(d.get('content'))); setMessage('Đánh giá đã gửi; chờ kiểm duyệt.'); setReviews((await travel.reviews(id(selected))).items); })}><label>Số sao<select name="rating">{[5,4,3,2,1].map(n => <option key={n}>{n}</option>)}</select></label><label>Nội dung<textarea name="content" required maxLength={1024} /></label><button disabled={busy}>Gửi đánh giá</button></form></>}</>}</section>}
    {selected && section === 'Gợi ý' && <button disabled={busy} onClick={() => { setSection('Chuyến đi'); setMessage('Chọn chuyến đi và ngày để thêm địa điểm được gợi ý.'); }}>Dùng gợi ý trong lịch trình</button>}
    {selected?.trip_id && section === 'Chuyến đi' ? <section className="travel-panel"><TripEditor travel={travel} trip={selected} recommendationId={pickedRecommendation} suggestedPlace={suggestedPlace} busy={busy} run={run} /></section> : null}
    {selected && section === 'Bộ sưu tập' && <section className="travel-panel"><h3>Địa điểm trong bộ sưu tập</h3>{collectionItems.map((item,i) => <p key={i}>{String(item.place_name ?? item.place_id)} · {String(item.note)}</p>)}<form onSubmit={e => form(e, async d => { await travel.mutate('community', `/collections/${id(selected)}/items`, { place_id: d.get('place'), note: d.get('note') }, 'POST', Number(selected.version)); setSelected(await travel.read('community', `/me/collections/${id(selected)}`)); setCollectionItems((await travel.read<Page>('community', `/collections/${id(selected)}/items`)).items); })}><Field name="place" title="Mã địa điểm" /><Field name="note" title="Ghi chú" /><button disabled={busy}>Thêm vào bộ sưu tập</button></form></section>}
    {selected && section === 'Quản trị' && admin === 'sources' && <section className="travel-panel"><h3>Nhập dữ liệu từ nguồn</h3><form onSubmit={e => form(e, async d => { setJob(await travel.mutate('ingestion', `/admin/data-sources/${id(selected)}/import-jobs`, { mode: d.get('mode') })); setMessage('Job nhập đã được tiếp nhận. Tải lại trạng thái để xem kết quả.'); })}><label>Chế độ<select name="mode"><option>FULL</option><option>INCREMENTAL</option><option>REPLAY</option></select></label><button disabled={busy}>Bắt đầu nhập dữ liệu</button></form>{job && <><p>Job: {String(job.job_id ?? job.id)} · {String(job.status)}</p><button disabled={busy} onClick={() => void run(async () => setJob(await travel.read('ingestion', `/admin/import-jobs/${String(job.job_id ?? job.id)}`)))}>Tải lại trạng thái job</button></>}</section>}
    {selected && section === 'Quản trị' && admin === 'models' && <section className="travel-panel"><h3>Quản lý mô hình</h3><button disabled={busy} onClick={() => void run(async () => setModelMetrics(await travel.read('intelligence', `/admin/models/${id(selected)}/metrics`)))}>Xem kết quả đánh giá</button>{modelMetrics && <dl>{Object.entries(modelMetrics).filter(([,v]) => typeof v !== 'object').map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl>}<form onSubmit={e => form(e, async d => { await travel.mutate('intelligence', `/admin/models/${id(selected)}/${String(d.get('action'))}`, { reason: d.get('reason') }, 'POST', Number(selected.version)); await load(); setSelected(null); setMessage('Đã tiếp nhận thao tác mô hình.'); })}><label>Thao tác<select name="action"><option value="validate">Kiểm tra mô hình</option><option value="deploy">Kích hoạt mô hình</option><option value="rollback">Khôi phục mô hình</option></select></label><Field name="reason" title="Lý do thay đổi" /><button disabled={busy}>Thực hiện thao tác</button></form></section>}
    {section === 'Tài khoản' && profile && <section className="travel-panel"><h2>{String(profile.display_name)}</h2><p>{String(profile.email)}</p><form onSubmit={e => form(e, async d => { setProfile(await travel.mutate('identity', '/me', { display_name: d.get('name') }, 'PATCH', Number(profile.version))); setMessage('Đã cập nhật hồ sơ.'); })}><Field name="name" title="Tên hiển thị mới" /><button disabled={busy}>Lưu hồ sơ</button></form>{preferences && <form onSubmit={e => form(e, async d => { setPreferences(await travel.mutate('identity', '/me/preferences', { personalization_enabled: d.get('consent') === 'on', consent_version: Number(preferences.consent_version) }, 'PUT', Number(preferences.version))); setMessage('Đã cập nhật quyền cá nhân hóa.'); })}><label><input name="consent" type="checkbox" defaultChecked={Boolean(preferences.personalization_enabled)} key={String(preferences.version)} /> Cho phép cá nhân hóa gợi ý</label><button disabled={busy}>Lưu quyền riêng tư</button></form>}<details><summary>Yêu cầu xóa tài khoản</summary><p>Yêu cầu sẽ xóa dữ liệu cá nhân tại các dịch vụ. Phiên đăng nhập sẽ bị thu hồi.</p><form onSubmit={e => form(e, async () => { await travel.mutate('identity', '/me/deletion-requests', { policy_version: 1 }); tokens.set(null); setProfile(null); setPreferences(null); setMessage('Đã tiếp nhận yêu cầu xóa.'); })}><label><input type="checkbox" required /> Tôi xác nhận muốn xóa tài khoản</label><button disabled={busy}>Gửi yêu cầu xóa</button></form></details></section>}
    </main></div></div>;
}
