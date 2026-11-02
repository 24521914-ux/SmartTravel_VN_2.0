import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Badge, Icon } from '../../shared/ui';
import { TravelClient, type Resource, type Page } from '../../shared/api';
import { useAuth } from '../../app/providers/AuthProvider';
import { useToast } from '../../app/providers/ToastProvider';
import { useAppPreferences } from '../../app/providers/AppPreferences';
import './account-auth.css';

type GuestMode = 'login' | 'register' | 'verify-email' | 'forgot-password' | 'reset-password';

export function AccountPanel() {
  const { user, isAuthenticated, login, logout, isLoading, reloadUser, apiClient } = useAuth();
  const { showToast } = useToast();
  const { text } = useAppPreferences();
  const [travel] = useState(() => new TravelClient(apiClient));
  const [mode, setMode] = useState<GuestMode>('login');
  const [showPassword, setShowPassword] = useState(false);
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
  const fieldValue = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
  const guestTitles: Record<GuestMode, string> = {
    login: text('Đăng nhập tài khoản', 'Sign in to your account'),
    register: text('Đăng ký tài khoản', 'Create an account'),
    'verify-email': text('Xác minh email', 'Verify your email'),
    'forgot-password': text('Quên mật khẩu', 'Forgot password'),
    'reset-password': text('Đặt lại mật khẩu', 'Reset password')
  };
  const guestDescriptions: Record<GuestMode, string> = {
    login: text('Nhập thông tin bên dưới để tiếp tục hành trình và quản lý chuyến đi của bạn.', 'Enter your details to continue your journey and manage your trips.'),
    register: text('Tạo tài khoản nhanh chóng để lên kế hoạch và lưu giữ kỷ niệm chuyến đi.', 'Create an account to plan trips and keep your travel memories.'),
    'verify-email': text('Nhập mã xác nhận được gửi trong hòm thư điện tử của bạn.', 'Enter the verification code sent to your inbox.'),
    'forgot-password': text('Nhập email đã đăng ký để nhận mã khôi phục mật khẩu tài khoản.', 'Enter your account email to receive a password reset code.'),
    'reset-password': text('Nhập mã từ email và thiết lập mật khẩu mới cho tài khoản.', 'Enter the email code and choose a new password.')
  };

  return <div className="account-panel-container">
    {!isAuthenticated ? (
      <div className="account-auth-container">
        <div className="auth-split-card">
          {/* Left Column: Visual Hero Showcase (Image 2 aesthetic) */}
          <section className="auth-hero-side" aria-label={text('Giới thiệu SmartTravel', 'About SmartTravel')}>
            <img
              src="/images/editorial/ha-long.webp"
              alt="Cảnh sắc Việt Nam"
              className="auth-hero-bg"
              loading="eager"
            />
            <div className="auth-hero-overlay" />
            <div className="auth-hero-gradient-top" />

            <div className="auth-hero-content">
              <span className="auth-hero-badge">
                <Icon name="compass" size={13} /> {text('Khám phá Việt Nam', 'Discover Vietnam')}
              </span>
              <div className="auth-hero-title">
                {text('Bắt đầu hành trình cùng SmartTravel!', 'Start your journey with SmartTravel!')}
              </div>
              <p className="auth-hero-desc">
                {text('Khám phá hàng ngàn điểm đến độc đáo, tạo lịch trình cá nhân hóa thông minh và kết nối cùng cộng đồng du lịch xê dịch.', 'Explore thousands of unique places, build a smart personalized itinerary, and connect with a community of travelers.')}
              </p>
            </div>

            {/* Floating Social Proof Pill (Image 2 style) */}
            <div className="auth-social-proof-pill">
              <div className="auth-proof-avatar">
                <Icon name="user" size={18} />
              </div>
              <div className="auth-proof-meta">
                <span className="auth-proof-user">{text('Minh Tuấn từ Hà Nội', 'Minh Tuan from Hanoi')}</span>
                <span className="auth-proof-action">
                  {text('Vừa lên lịch trình Đà Nẵng 3N2Đ', 'Just planned a 3-day Da Nang trip')} <span className="auth-proof-check">✓</span>
                </span>
              </div>
            </div>
          </section>

          {/* Right Column: Interactive Modern Form */}
          <section className="auth-form-side" aria-label={guestTitles[mode]}>
            <div className="auth-form-inner">
              {/* Header: Mode Switch Tabs & Brand Mark */}
              <div className="auth-form-header">
                <div className="auth-mode-pill-tabs">
                  <button
                    type="button"
                    className={`auth-mode-pill-tab ${mode === 'login' ? 'active' : ''}`}
                    onClick={() => { setMode('login'); setError(''); }}
                  >
                    {text('Đăng nhập', 'Sign in')}
                  </button>
                  <button
                    type="button"
                    className={`auth-mode-pill-tab ${mode === 'register' ? 'active' : ''}`}
                    onClick={() => { setMode('register'); setError(''); }}
                  >
                    {text('Đăng ký', 'Sign up')}
                  </button>
                </div>
              </div>

              {/* Title & Subtext */}
              <h2 className="auth-form-heading">{guestTitles[mode]}</h2>
              <p className="auth-form-subtext">{guestDescriptions[mode]}</p>

              {/* Error Alert */}
              {error && (
                <div role="alert" className="auth-alert-box">
                  <Icon name="alert" size={18} />
                  <span>{error}</span>
                </div>
              )}

              {/* Form */}
              <form
                className="clay-form auth-form-body"
                onSubmit={e => submit(e, async data => {
                  if (mode === 'login') {
                    await login(fieldValue(data, 'email'), String(data.get('password')));
                    showToast(text('Đăng nhập thành công!', 'Signed in successfully!'), 'success');
                    return;
                  }
                  const body = mode === 'register'
                    ? { email: fieldValue(data, 'email'), password: String(data.get('password')), display_name: fieldValue(data, 'display_name') }
                    : mode === 'verify-email' ? { token: fieldValue(data, 'token') }
                    : mode === 'forgot-password' ? { email: fieldValue(data, 'email') }
                    : { token: fieldValue(data, 'token'), password: String(data.get('password')) };
                  await apiClient.request('identity', `/api/v1/auth/${mode}`, { method: 'POST', body, authenticated: false, idempotencyKey: crypto.randomUUID() });
                  showToast(
                    mode === 'register'
                      ? text('Đã đăng ký. Kiểm tra email để xác minh trước khi đăng nhập.', 'Account created. Check your email to verify it before signing in.')
                      : mode === 'forgot-password'
                      ? text('Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi qua email.', 'If the account exists, password reset instructions will be sent by email.')
                      : text('Đã hoàn thành. Bạn có thể đăng nhập.', 'Done. You can now sign in.'),
                    'success'
                  );
                })}
              >
                {mode === 'register' && (
                  <div className="auth-field">
                    <label htmlFor="register-name" className="auth-field-label">{text('Tên hiển thị', 'Display name')}</label>
                    <div className="auth-input-wrapper">
                      <input
                        id="register-name"
                        name="display_name"
                        required
                        maxLength={1024}
                        className="auth-text-input"
                        placeholder="Nguyễn Văn A"
                      />
                    </div>
                  </div>
                )}

                {['login', 'register', 'forgot-password'].includes(mode) && (
                  <div className="auth-field">
                    <label htmlFor="login-email" className="auth-field-label">Email</label>
                    <div className="auth-input-wrapper">
                      <input
                        id="login-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={254}
                        className="auth-text-input"
                        placeholder="vidu@smarttravel.vn"
                      />
                    </div>
                  </div>
                )}

                {['verify-email', 'reset-password'].includes(mode) && (
                  <div className="auth-field">
                    <label htmlFor="auth-token" className="auth-field-label">{text('Mã xác nhận trong email', 'Email verification code')}</label>
                    <div className="auth-input-wrapper">
                      <input
                        id="auth-token"
                        name="token"
                        required
                        maxLength={1024}
                        className="auth-text-input"
                        placeholder={text('Nhập mã xác nhận...', 'Enter the verification code...')}
                      />
                    </div>
                  </div>
                )}

                {['login', 'register', 'reset-password'].includes(mode) && (
                  <div className="auth-field">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label htmlFor="login-password" className="auth-field-label">{text('Mật khẩu', 'Password')}</label>
                      {mode === 'login' && (
                        <button
                          type="button"
                          className="auth-forgot-link"
                          onClick={() => { setMode('forgot-password'); setError(''); }}
                        >
                          {text('Quên mật khẩu?', 'Forgot password?')}
                        </button>
                      )}
                    </div>
                    <div className="auth-input-wrapper">
                      <input
                        id="login-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        required
                        minLength={12}
                        maxLength={128}
                        className="auth-text-input"
                        placeholder={text('Ít nhất 12 ký tự', 'At least 12 characters')}
                      />
                      <button
                        type="button"
                        className="auth-pw-toggle"
                        onClick={() => setShowPassword(prev => !prev)}
                        aria-label={showPassword ? text('Ẩn mật khẩu', 'Hide password') : text('Hiện mật khẩu', 'Show password')}
                        tabIndex={-1}
                      >
                        <Icon name={showPassword ? 'eye' : 'lock'} size={16} />
                      </button>
                    </div>
                  </div>
                )}

                <Button type="submit" className="auth-submit-btn" disabled={busy || isLoading}>
                  {mode === 'login' ? text('Đăng nhập', 'Sign in') : mode === 'register' ? text('Đăng ký', 'Sign up') : guestTitles[mode]}
                </Button>
              </form>

              {/* Social Login Options (Image 2 style) */}
              {['login', 'register'].includes(mode) && (
                <>
                  <div className="auth-social-label">
                    {text('Hoặc tiếp tục với tài khoản khác', 'Or continue with another account')}
                  </div>
                  <div className="auth-social-row">
                    <button
                      type="button"
                      className="auth-social-btn google"
                      onClick={() => showToast(text('Đăng nhập Google sẽ sớm khả dụng trong bản cập nhật.', 'Google sign-in will be available in a future update.'), 'info')}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.99 0 12s.45 3.83 1.25 5.42l4.03-3.15z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/></svg>
                      <span>Google</span>
                    </button>
                    <button
                      type="button"
                      className="auth-social-btn facebook"
                      onClick={() => showToast(text('Đăng nhập Facebook sẽ sớm khả dụng trong bản cập nhật.', 'Facebook sign-in will be available in a future update.'), 'info')}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      <span>Facebook</span>
                    </button>
                  </div>
                </>
              )}

              {/* Accessible Navigation for all alternate guest modes */}
              <nav aria-label={text('Xác thực tài khoản', 'Account access')} className="auth-alt-nav">
                {(Object.keys(guestTitles) as GuestMode[]).filter(v => v !== mode).map(v => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => { setMode(v); setError(''); }}
                  >
                    {guestTitles[v]}
                  </button>
                ))}
              </nav>
            </div>

            {/* Footer Links (Image 2 style) */}
            <div className="auth-form-footer">
              <div className="auth-footer-links">
                <button type="button" onClick={() => showToast(text('Chính sách bảo mật: Toàn bộ thông tin được bảo vệ theo chuẩn GDPR.', 'Privacy policy: Your information is protected under GDPR standards.'), 'info')}>
                  {text('Chính sách bảo mật', 'Privacy policy')}
                </button>
                <button type="button" onClick={() => showToast(text('Điều khoản dịch vụ: Sử dụng SmartTravel VN cho mục đích cá nhân.', 'Terms of service: Use SmartTravel VN for personal purposes.'), 'info')}>
                  {text('Điều khoản dịch vụ', 'Terms of service')}
                </button>
              </div>
              <span>© 2026 SmartTravel VN. All rights reserved.</span>
            </div>
          </section>
        </div>
      </div>
    ) : <>
      {error && <p role="alert">{error}</p>}
      <section className="travel-panel account-summary"><div className="account-summary-copy"><span className="section-eyebrow">Tài khoản của bạn</span><h2>{String(profile?.display_name ?? user?.display_name ?? '')}</h2><div className="account-role-list">{(user?.roles ?? []).map(role => <Badge key={role}>{role === 'USER' ? 'Du khách' : role === 'ADMIN' ? 'Quản trị viên' : role === 'BUSINESS' ? 'Doanh nghiệp' : role}</Badge>)}</div><details className="account-identifier"><summary>Mã tài khoản</summary><code>{String(profile?.user_id ?? '')}</code></details></div><Button variant="secondary" disabled={busy || isLoading} onClick={() => void run(async () => { await logout(); showToast('Đã đăng xuất.', 'info'); })}>Đăng xuất</Button></section>
      <div className="sub-tab-bar" role="tablist">{([['profile', 'Hồ sơ cá nhân'], ['security', 'Bảo mật tài khoản'], ['preferences', 'Sở thích & Quyền riêng tư']] as const).map(([id, title]) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} className={`sub-tab ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>{title}</button>)}</div>
      {activeTab === 'profile' && <section className="travel-panel"><h3>Thông tin cơ bản</h3><form className="clay-form" key={String(profile?.version)} onSubmit={e => submit(e, async data => {
        const current = await travel.read<Resource>('identity', '/me');
        setProfile(await travel.mutate('identity', '/me', { display_name: fieldValue(data, 'display_name') }, 'PATCH', Number(current.version)));
        await reloadUser(); showToast('Đã cập nhật hồ sơ.', 'success');
      })}><label htmlFor="display-name">Tên hiển thị<input id="display-name" name="display_name" required maxLength={1024} defaultValue={String(profile?.display_name ?? '')} /></label><Button type="submit" disabled={busy || !profile}>Lưu hồ sơ</Button></form></section>}
      {activeTab === 'security' && <section className="travel-panel"><h3>Đổi mật khẩu</h3><form className="clay-form" onSubmit={e => submit(e, async data => {
        await travel.mutate('identity', '/me/password', { current_password: String(data.get('current_password')), new_password: String(data.get('new_password')) }, 'PUT');
        showToast('Đã cập nhật mật khẩu. Vui lòng đăng nhập lại nếu phiên đã bị thu hồi.', 'success');
      })}><label htmlFor="current-pass">Mật khẩu hiện tại<input id="current-pass" name="current_password" type="password" autoComplete="current-password" required minLength={12} maxLength={128} /></label><label htmlFor="new-pass">Mật khẩu mới<input id="new-pass" name="new_password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label><Button type="submit" disabled={busy}>Lưu mật khẩu</Button></form>
        <h3>Phiên đăng nhập</h3><Button disabled={busy} onClick={() => void run(loadAccount)}>Tải lại phiên</Button>{sessions.map(session => <div key={String(session.session_id ?? session.id)}><p>{String(session.session_id ?? session.id)} · {String(session.created_at ?? '')}</p><Button disabled={busy} onClick={() => void run(async () => { await travel.mutate('identity', `/me/sessions/${encodeURIComponent(String(session.session_id ?? session.id))}`, undefined, 'DELETE'); await loadAccount(); })}>Thu hồi phiên</Button></div>)}
      </section>}
      {activeTab === 'preferences' && <section className="travel-panel"><h3>Sở thích du lịch</h3>{preferences && <form className="clay-form" key={String(preferences.version)} onSubmit={e => submit(e, async data => {
        const saved = await travel.mutate<Resource>('identity', '/me/preferences', { category_ids: data.getAll('category_ids'), travel_style_ids: data.getAll('travel_style_ids'), food_preference_ids: data.getAll('food_preference_ids'), budget_min: fieldValue(data, 'budget_min') === '' ? null : Number(data.get('budget_min')), budget_max: fieldValue(data, 'budget_max') === '' ? null : Number(data.get('budget_max')), budget_level: fieldValue(data, 'budget_level'), currency: 'VND', personalization_enabled: data.has('personalization_enabled'), consent_version: Number(preferences.consent_version) }, 'PUT', Number(preferences.version));
        setPreferences(saved); showToast('Đã lưu sở thích.', 'success');
      })}><fieldset><legend>Danh mục yêu thích</legend>{categories.map(category => { const id = String(category.category_id ?? category.id); return <label key={id}><input type="checkbox" name="category_ids" value={id} defaultChecked={(preferences.category_ids as string[] ?? []).includes(id)} />{String(category.name)}</label>; })}</fieldset>{(['TRAVEL_STYLE', 'FOOD_PREFERENCE'] as const).map(kind => { const field = kind === 'TRAVEL_STYLE' ? 'travel_style_ids' : 'food_preference_ids'; return <fieldset key={kind}><legend>{kind === 'TRAVEL_STYLE' ? 'Phong cách du lịch' : 'Sở thích ẩm thực'}</legend>{options.filter(option => option.type === kind || option.kind === kind).map(option => { const id = String(option.option_id ?? option.id); return <label key={id}><input type="checkbox" name={field} value={id} defaultChecked={(preferences[field] as string[] ?? []).includes(id)} />{String(option.name ?? option.label)}</label>; })}</fieldset>; })}<label htmlFor="budget-min">Ngân sách tối thiểu (VND)<input id="budget-min" name="budget_min" type="number" min="0" defaultValue={preferences.budget_min == null ? '' : String(preferences.budget_min)} /></label><label htmlFor="budget-max">Ngân sách tối đa (VND)<input id="budget-max" name="budget_max" type="number" min="0" defaultValue={preferences.budget_max == null ? '' : String(preferences.budget_max)} /></label><label htmlFor="budget-level">Mức ngân sách<select id="budget-level" name="budget_level" defaultValue={String(preferences.budget_level)}><option value="LOW">Thấp</option><option value="MID">Trung bình</option><option value="HIGH">Cao</option><option value="CUSTOM">Tùy chỉnh (giữ khoảng đã lưu)</option></select></label><label><input type="checkbox" name="personalization_enabled" defaultChecked={Boolean(preferences.personalization_enabled)} />Đồng ý dùng dữ liệu để cá nhân hóa theo chính sách hiện tại</label><Button type="submit" disabled={busy}>Lưu sở thích</Button></form>}
        <details><summary>Yêu cầu xóa dữ liệu cá nhân</summary><p>Yêu cầu xóa dữ liệu được xử lý bất đồng bộ trên các service. Thao tác này có thể không khôi phục được.</p><form onSubmit={e => submit(e, async () => { setDeletion(await travel.mutate('identity', '/me/deletion-requests', { policy_version: 1 })); })}><label><input type="checkbox" required />Tôi xác nhận yêu cầu xóa dữ liệu của mình</label><Button type="submit" disabled={busy}>Gửi yêu cầu xóa dữ liệu</Button></form>{deletion && <p role="status">Yêu cầu {String(deletion.request_id)} · {String(deletion.status)}</p>}</details>
      </section>}
    </>}
  </div>;
}
