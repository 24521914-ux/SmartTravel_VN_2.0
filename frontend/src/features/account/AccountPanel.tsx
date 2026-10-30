import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Badge } from '../../shared/ui';
import { TravelClient, type Resource, type Page } from '../../shared/api';
import { useAuth } from '../../app/providers/AuthProvider';
import { useToast } from '../../app/providers/ToastProvider';

type GuestMode = 'login' | 'register' | 'verify-email' | 'forgot-password' | 'reset-password';

export function AccountPanel() {
  const { user, isAuthenticated, login, logout, isLoading, reloadUser, apiClient } = useAuth();
  const { showToast } = useToast();
  const [travel] = useState(() => new TravelClient(apiClient));
  const [mode, setMode] = useState<GuestMode>('login');
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'preferences'>('profile');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<Resource | null>(null);
  const [preferences, setPreferences] = useState<Resource | null>(null);
  const [categories, setCategories] = useState<Resource[]>([]);
  const [options, setOptions] = useState<Resource[]>([]);
  const [sessions, setSessions] = useState<Resource[]>([]);
  const [deletion, setDeletion] = useState<Resource | null>(null);
  const owner = user?.user_id ?? user?.id ?? null;
  const currentOwner = useRef(owner); currentOwner.current = owner;

  async function run(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Không thực hiện được yêu cầu.'); }
    finally { setBusy(false); }
  }
  async function allPages(service: 'catalog' | 'identity', path: string) {
    const items: Resource[] = []; let cursor: string | null | undefined;
    do { const page = await travel.read<Page>(service, `${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`); items.push(...page.items); cursor = page.next_cursor; } while (cursor);
    return { items };
  }
  async function loadAccount() {
    const loadingOwner = currentOwner.current;
    const [me, prefs, cats, active, choices] = await Promise.all([
      travel.read<Resource>('identity', '/me'), travel.read<Resource>('identity', '/me/preferences'),
      allPages('catalog', '/categories'), allPages('identity', '/me/sessions'), allPages('identity', '/preference-options')
    ]);
    if (!loadingOwner || currentOwner.current !== loadingOwner) return;
    setProfile(me); setPreferences(prefs); setCategories(cats.items); setSessions(active.items); setOptions(choices.items);
  }
  useEffect(() => { if (isAuthenticated && !isLoading) void run(loadAccount); else if (!isAuthenticated) { setProfile(null); setPreferences(null); setSessions([]); setDeletion(null); } }, [isAuthenticated, isLoading, owner, travel]);

  function submit(e: FormEvent<HTMLFormElement>, action: (data: FormData) => Promise<void>) {
    e.preventDefault(); const form = e.currentTarget; const data = new FormData(form);
    void run(async () => { await action(data); form.reset(); });
  }
  const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
  const guestTitles: Record<GuestMode, string> = { login: 'Đăng nhập tài khoản', register: 'Đăng ký tài khoản', 'verify-email': 'Xác minh email', 'forgot-password': 'Quên mật khẩu', 'reset-password': 'Đặt lại mật khẩu' };

  return <div className="account-panel-container" style={{ display: 'grid', gap: 24 }}>
    {error && <p role="alert">{error}</p>}
    {!isAuthenticated ? <section className="travel-panel" style={{ maxWidth: 520, width: '100%', margin: '0 auto' }}>
      <h2>{guestTitles[mode]}</h2>
      <form className="clay-form" onSubmit={e => submit(e, async data => {
        if (mode === 'login') { await login(text(data, 'email'), String(data.get('password'))); showToast('Đăng nhập thành công!', 'success'); return; }
        const body = mode === 'register' ? { email: text(data, 'email'), password: String(data.get('password')), display_name: text(data, 'display_name') }
          : mode === 'verify-email' ? { token: text(data, 'token') }
          : mode === 'forgot-password' ? { email: text(data, 'email') }
          : { token: text(data, 'token'), password: String(data.get('password')) };
        await apiClient.request('identity', `/api/v1/auth/${mode}`, { method: 'POST', body, authenticated: false, idempotencyKey: crypto.randomUUID() });
        showToast(mode === 'register' ? 'Đã đăng ký. Kiểm tra email để xác minh trước khi đăng nhập.' : mode === 'forgot-password' ? 'Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi qua email.' : 'Đã hoàn thành. Bạn có thể đăng nhập.', 'success');
      })}>
        {['login', 'register', 'forgot-password'].includes(mode) && <label htmlFor="login-email">Email<input id="login-email" name="email" type="email" autoComplete="email" required maxLength={254} /></label>}
        {mode === 'register' && <label htmlFor="register-name">Tên hiển thị<input id="register-name" name="display_name" required maxLength={1024} /></label>}
        {['verify-email', 'reset-password'].includes(mode) && <label htmlFor="auth-token">Mã xác nhận trong email<input id="auth-token" name="token" required maxLength={1024} /></label>}
        {['login', 'register', 'reset-password'].includes(mode) && <label htmlFor="login-password">Mật khẩu<input id="login-password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={12} maxLength={128} /></label>}
        <Button type="submit" disabled={busy || isLoading}>{guestTitles[mode].replace(' tài khoản', '')}</Button>
      </form>
      <nav aria-label="Xác thực tài khoản" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>{(Object.keys(guestTitles) as GuestMode[]).filter(v => v !== mode).map(v => <button type="button" key={v} onClick={() => { setMode(v); setError(''); }}>{guestTitles[v]}</button>)}</nav>
    </section> : <>
      <section className="travel-panel"><h2>{String(profile?.display_name ?? user?.display_name ?? '')}</h2><p>Mã người dùng: {String(profile?.user_id ?? '')}</p>{(user?.roles ?? []).map(role => <Badge key={role}>{role}</Badge>)} <Button disabled={busy || isLoading} onClick={() => void run(async () => { await logout(); showToast('Đã đăng xuất.', 'info'); })}>Đăng xuất</Button></section>
      <div className="sub-tab-bar" role="tablist">{([['profile', 'Hồ sơ cá nhân'], ['security', 'Bảo mật tài khoản'], ['preferences', 'Sở thích & Quyền riêng tư']] as const).map(([id, title]) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} className={`sub-tab ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>{title}</button>)}</div>
      {activeTab === 'profile' && <section className="travel-panel"><h3>Thông tin cơ bản</h3><form className="clay-form" key={String(profile?.version)} onSubmit={e => submit(e, async data => {
        const current = await travel.read<Resource>('identity', '/me');
        setProfile(await travel.mutate('identity', '/me', { display_name: text(data, 'display_name') }, 'PATCH', Number(current.version)));
        await reloadUser(); showToast('Đã cập nhật hồ sơ.', 'success');
      })}><label htmlFor="display-name">Tên hiển thị<input id="display-name" name="display_name" required maxLength={1024} defaultValue={String(profile?.display_name ?? '')} /></label><Button type="submit" disabled={busy || !profile}>Lưu hồ sơ</Button></form></section>}
      {activeTab === 'security' && <section className="travel-panel"><h3>Đổi mật khẩu</h3><form className="clay-form" onSubmit={e => submit(e, async data => {
        await travel.mutate('identity', '/me/password', { current_password: String(data.get('current_password')), new_password: String(data.get('new_password')) }, 'PUT');
        showToast('Đã cập nhật mật khẩu. Vui lòng đăng nhập lại nếu phiên đã bị thu hồi.', 'success');
      })}><label htmlFor="current-pass">Mật khẩu hiện tại<input id="current-pass" name="current_password" type="password" autoComplete="current-password" required minLength={12} maxLength={128} /></label><label htmlFor="new-pass">Mật khẩu mới<input id="new-pass" name="new_password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label><Button type="submit" disabled={busy}>Lưu mật khẩu</Button></form>
        <h3>Phiên đăng nhập</h3><Button disabled={busy} onClick={() => void run(loadAccount)}>Tải lại phiên</Button>{sessions.map(session => <div key={String(session.session_id ?? session.id)}><p>{String(session.session_id ?? session.id)} · {String(session.created_at ?? '')}</p><Button disabled={busy} onClick={() => void run(async () => { await travel.mutate('identity', `/me/sessions/${encodeURIComponent(String(session.session_id ?? session.id))}`, undefined, 'DELETE'); await loadAccount(); })}>Thu hồi phiên</Button></div>)}
      </section>}
      {activeTab === 'preferences' && <section className="travel-panel"><h3>Sở thích du lịch</h3>{preferences && <form className="clay-form" key={String(preferences.version)} onSubmit={e => submit(e, async data => {
        const saved = await travel.mutate<Resource>('identity', '/me/preferences', { category_ids: data.getAll('category_ids'), travel_style_ids: data.getAll('travel_style_ids'), food_preference_ids: data.getAll('food_preference_ids'), budget_min: text(data, 'budget_min') === '' ? null : Number(data.get('budget_min')), budget_max: text(data, 'budget_max') === '' ? null : Number(data.get('budget_max')), budget_level: text(data, 'budget_level'), currency: 'VND', personalization_enabled: data.has('personalization_enabled'), consent_version: Number(preferences.consent_version) }, 'PUT', Number(preferences.version));
        setPreferences(saved); showToast('Đã lưu sở thích.', 'success');
      })}><fieldset><legend>Danh mục yêu thích</legend>{categories.map(category => { const id = String(category.category_id ?? category.id); return <label key={id}><input type="checkbox" name="category_ids" value={id} defaultChecked={(preferences.category_ids as string[] ?? []).includes(id)} />{String(category.name)}</label>; })}</fieldset>{(['TRAVEL_STYLE', 'FOOD_PREFERENCE'] as const).map(kind => { const field = kind === 'TRAVEL_STYLE' ? 'travel_style_ids' : 'food_preference_ids'; return <fieldset key={kind}><legend>{kind === 'TRAVEL_STYLE' ? 'Phong cách du lịch' : 'Sở thích ẩm thực'}</legend>{options.filter(option => option.type === kind || option.kind === kind).map(option => { const id = String(option.option_id ?? option.id); return <label key={id}><input type="checkbox" name={field} value={id} defaultChecked={(preferences[field] as string[] ?? []).includes(id)} />{String(option.name ?? option.label)}</label>; })}</fieldset>; })}<label htmlFor="budget-min">Ngân sách tối thiểu (VND)<input id="budget-min" name="budget_min" type="number" min="0" defaultValue={preferences.budget_min == null ? '' : String(preferences.budget_min)} /></label><label htmlFor="budget-max">Ngân sách tối đa (VND)<input id="budget-max" name="budget_max" type="number" min="0" defaultValue={preferences.budget_max == null ? '' : String(preferences.budget_max)} /></label><label htmlFor="budget-level">Mức ngân sách<select id="budget-level" name="budget_level" defaultValue={String(preferences.budget_level)}><option value="LOW">Thấp</option><option value="MID">Trung bình</option><option value="HIGH">Cao</option><option value="CUSTOM">Tùy chỉnh (giữ khoảng đã lưu)</option></select></label><label><input type="checkbox" name="personalization_enabled" defaultChecked={Boolean(preferences.personalization_enabled)} />Đồng ý dùng dữ liệu để cá nhân hóa theo chính sách hiện tại</label><Button type="submit" disabled={busy}>Lưu sở thích</Button></form>}
        <details><summary>Yêu cầu xóa dữ liệu cá nhân</summary><p>Yêu cầu xóa dữ liệu được xử lý bất đồng bộ trên các service. Thao tác này có thể không khôi phục được.</p><form onSubmit={e => submit(e, async () => { setDeletion(await travel.mutate('identity', '/me/deletion-requests', { policy_version: 1 })); })}><label><input type="checkbox" required />Tôi xác nhận yêu cầu xóa dữ liệu của mình</label><Button type="submit" disabled={busy}>Gửi yêu cầu xóa dữ liệu</Button></form>{deletion && <p role="status">Yêu cầu {String(deletion.request_id)} · {String(deletion.status)}</p>}</details>
      </section>}
    </>}
  </div>;
}
