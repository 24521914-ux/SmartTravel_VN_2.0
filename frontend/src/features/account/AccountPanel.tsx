import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Badge, Icon, RoundedSelect } from '../../shared/ui';
import { ApiError, TravelClient, type Resource, type Page } from '../../shared/api';
import { useAuth } from '../../app/providers/AuthProvider';
import { useToast } from '../../app/providers/ToastProvider';
import { useAppPreferences } from '../../app/providers/AppPreferences';
import {
  getFacebookAppId,
  getGoogleClientId,
  getLocalhostEquivalentUrl,
  renderGoogleSignInButton,
  requestFacebookAccessToken
} from './socialAuth';
import { GoogleSignInDialog } from './GoogleSignInDialog';
import './account-auth.css';
import './account-settings.css';

type GuestMode = 'login' | 'register' | 'verify-email' | 'resend-verification' | 'forgot-password' | 'reset-password';

export function AccountPanel() {
  const { user, isAuthenticated, login, socialLogin, logout, isLoading, reloadUser, apiClient } = useAuth();
  const { showToast } = useToast();
  const { text, locale, theme } = useAppPreferences();
  const [travel] = useState(() => new TravelClient(apiClient));
  const [mode, setMode] = useState<GuestMode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'preferences'>('profile');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const localMailbox = import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? (import.meta.env.VITE_LOCAL_MAILBOX_URL ?? 'http://localhost:59025') : '';
  const [profile, setProfile] = useState<Resource | null>(null);
  const [preferences, setPreferences] = useState<Resource | null>(null);
  const [categories, setCategories] = useState<Resource[]>([]);
  const [options, setOptions] = useState<Resource[]>([]);
  const [sessions, setSessions] = useState<Resource[]>([]);
  const [deletion, setDeletion] = useState<Resource | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [googleDialogOpen, setGoogleDialogOpen] = useState(false);
  const [inlineGoogleReady, setInlineGoogleReady] = useState(false);
  const inlineGoogleRef = useRef<HTMLDivElement>(null);
  const displayNameInputRef = useRef<HTMLInputElement>(null);
  const owner = user?.user_id ?? user?.id ?? null;
  const currentOwner = useRef(owner); currentOwner.current = owner;
  const googleClientId = getGoogleClientId();
  const localhostUrl = getLocalhostEquivalentUrl();
  const socialCredentialHandler = useRef<(token: string) => void>(() => {});

  useEffect(() => {
    if (isAuthenticated || !['login', 'register'].includes(mode) || !googleClientId) {
      setInlineGoogleReady(false);
      return;
    }
    const container = inlineGoogleRef.current;
    if (!container) return;
    let cancelled = false;
    renderGoogleSignInButton({
      clientId: googleClientId,
      container,
      onCredential: idToken => socialCredentialHandler.current(idToken),
      theme: theme === 'dark' ? 'filled_black' : 'outline',
      text: 'continue_with',
      width: 240,
      locale
    })
      .then(() => { if (!cancelled) setInlineGoogleReady(true); })
      .catch(() => { if (!cancelled) setInlineGoogleReady(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated, mode, googleClientId, locale, theme]);

  function handleSocialError(err: unknown, providerLabel: string) {
    if (err instanceof ApiError) {
      if (err.body.code === 'SOCIAL_PROVIDER_NOT_CONFIGURED') {
        setError(text(`Máy chủ chưa cấu hình đăng nhập ${providerLabel}.`, `${providerLabel} sign-in is not configured on the server.`));
        return;
      }
      if (err.body.code === 'SOCIAL_EMAIL_REQUIRED') {
        setError(text(`Tài khoản ${providerLabel} cần cấp quyền chia sẻ email để đăng nhập.`, `Your ${providerLabel} account must share an email address to sign in.`));
        return;
      }
      if (err.body.code === 'SOCIAL_EMAIL_NOT_VERIFIED') {
        setError(text(`Email trên tài khoản ${providerLabel} chưa được xác minh.`, `Your ${providerLabel} account email is not verified.`));
        return;
      }
      if (err.body.code === 'SOCIAL_ACCOUNT_CONFLICT') {
        setError(text(`Email này đã được liên kết với một tài khoản ${providerLabel} khác.`, `This email is already linked to another ${providerLabel} account.`));
        return;
      }
      if (err.status === 401) {
        setError(text(`Không thể xác thực tài khoản ${providerLabel} hoặc tài khoản đã bị khóa.`, `Unable to verify your ${providerLabel} account or the account is disabled.`));
        return;
      }
    }
    if (err instanceof Error && err.message === 'FACEBOOK_CANCELLED') {
      setError(text('Bạn đã hủy đăng nhập Facebook.', 'Facebook sign-in was cancelled.'));
      return;
    }
    setError(err instanceof Error ? err.message : text(`Không thể đăng nhập bằng ${providerLabel}.`, `Unable to sign in with ${providerLabel}.`));
  }

  async function completeSocialLogin(provider: 'google' | 'facebook', token: string) {
    const label = provider === 'google' ? 'Google' : 'Facebook';
    setBusy(true); setError(''); setNotice('');
    try {
      await socialLogin(provider, token);
      setGoogleDialogOpen(false);
      showToast(text(`Đăng nhập ${label} thành công!`, `Signed in with ${label}!`), 'success');
    } catch (err) {
      handleSocialError(err, label);
    } finally {
      setBusy(false);
    }
  }
  socialCredentialHandler.current = idToken => { void completeSocialLogin('google', idToken); };

  function handleOpenGoogleDialog() {
    if (busy || isLoading) return;
    setError(''); setNotice('');
    setGoogleDialogOpen(true);
  }

  async function handleFacebookLogin() {
    if (busy || isLoading) return;
    const appId = getFacebookAppId();
    if (!appId) {
      setError(text('Chưa cấu hình VITE_FACEBOOK_APP_ID trong file .env của frontend.', 'VITE_FACEBOOK_APP_ID is not configured in frontend .env.'));
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const accessToken = await requestFacebookAccessToken(appId);
      await socialLogin('facebook', accessToken);
      showToast(text('Đăng nhập Facebook thành công!', 'Signed in with Facebook!'), 'success');
    } catch (err) {
      handleSocialError(err, 'Facebook');
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); }
    catch (error) {
      if (error instanceof ApiError && error.body.code === 'EMAIL_NOT_VERIFIED') {
        setMode('verify-email');
        setNotice(text('Email chưa được xác minh. Nhập mã trong email hoặc yêu cầu gửi lại mã bên dưới.', 'Verify your email using the code, or request a new code below.'));
      } else if (error instanceof ApiError && error.status === 401 && !isAuthenticated) {
        setError(mode === 'login'
          ? text('Email hoặc mật khẩu không đúng, hoặc tài khoản không thể đăng nhập.', 'Incorrect email or password, or the account cannot sign in.')
          : text('Mã không hợp lệ, đã dùng hoặc hết hạn. Hãy yêu cầu mã mới.', 'The code is invalid, used or expired. Request a new code.'));
      } else if (error instanceof ApiError && error.status === 429) {
        setError(text('Bạn đã yêu cầu quá nhiều lần. Vui lòng chờ rồi thử lại.', 'Too many requests. Please wait before trying again.'));
      } else setError(error instanceof Error ? error.message : text('Không thực hiện được yêu cầu.', 'Unable to complete the request.'));
    }
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
    if (busy || isLoading) return;
    void run(async () => { await action(data); form.reset(); });
  }
  const fieldValue = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
  const guestTitles: Record<GuestMode, string> = {
    login: text('Đăng nhập tài khoản', 'Sign in to your account'),
    register: text('Đăng ký tài khoản', 'Create an account'),
    'verify-email': text('Xác minh email', 'Verify your email'),
    'resend-verification': text('Gửi lại mã xác minh', 'Resend verification code'),
    'forgot-password': text('Quên mật khẩu', 'Forgot password'),
    'reset-password': text('Đặt lại mật khẩu', 'Reset password')
  };
  const guestDescriptions: Record<GuestMode, string> = {
    login: text('Nhập thông tin bên dưới để tiếp tục hành trình và quản lý chuyến đi của bạn.', 'Enter your details to continue your journey and manage your trips.'),
    register: text('Tạo tài khoản nhanh chóng để lên kế hoạch và lưu giữ kỷ niệm chuyến đi.', 'Create an account to plan trips and keep your travel memories.'),
    'verify-email': text('Nhập mã xác nhận được gửi trong hòm thư điện tử của bạn.', 'Enter the verification code sent to your inbox.'),
    'resend-verification': text('Nhập email đã đăng ký. Nếu tài khoản đang chờ xác minh, hệ thống sẽ gửi mã mới; mỗi lần gửi cách nhau ít nhất 60 giây.', 'Enter your registered email. Pending accounts can receive a new code, with at least 60 seconds between requests.'),
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
                    disabled={busy || isLoading}
                    className={`auth-mode-pill-tab ${mode === 'login' ? 'active' : ''}`}
                    onClick={() => { setMode('login'); setError(''); setNotice(''); }}
                  >
                    {text('Đăng nhập', 'Sign in')}
                  </button>
                  <button
                    type="button"
                    disabled={busy || isLoading}
                    className={`auth-mode-pill-tab ${mode === 'register' ? 'active' : ''}`}
                    onClick={() => { setMode('register'); setError(''); setNotice(''); }}
                  >
                    {text('Đăng ký', 'Sign up')}
                  </button>
                </div>
              </div>

              {/* Title & Subtext */}
              <h2 className="auth-form-heading">{guestTitles[mode]}</h2>
              <p className="auth-form-subtext">{guestDescriptions[mode]}</p>
              {email && ['verify-email', 'reset-password'].includes(mode) && (
                <p className="auth-flow-recipient">{text('Email nhận mã: ', 'Code recipient: ')}{email.trim()}</p>
              )}
              {notice && <p role="status" className="auth-flow-notice">{notice}</p>}
              {localMailbox && ['verify-email', 'resend-verification', 'forgot-password', 'reset-password'].includes(mode) && (
                <p className="auth-mailbox-hint">
                  {text('Môi trường local nhận thư tại Mailpit. ', 'Local emails are captured in Mailpit. ')}
                  <a href={localMailbox} target="_blank" rel="noopener noreferrer">{text('Mở hộp thư local', 'Open local inbox')}</a>
                </p>
              )}

              {/* Error Alert */}
              {error && (
                <div role="alert" className="auth-alert-box">
                  <Icon name="alert" size={18} />
                  <span>{error}</span>
                </div>
              )}

              {/* Form */}
              <form
                key={mode}
                className="clay-form auth-form-body"
                onSubmit={e => submit(e, async data => {
                  if (mode === 'login') {
                    await login(fieldValue(data, 'email'), String(data.get('password')));
                    showToast(text('Đăng nhập thành công!', 'Signed in successfully!'), 'success');
                    return;
                  }
                  if (mode === 'register' && data.get('password') !== data.get('confirm_password')) {
                    throw new Error(text('Mật khẩu xác nhận chưa khớp.', 'Passwords do not match.'));
                  }
                  const body = mode === 'register'
                    ? { email: fieldValue(data, 'email'), password: String(data.get('password')), display_name: fieldValue(data, 'display_name') }
                    : mode === 'verify-email' ? { token: fieldValue(data, 'token') }
                    : ['forgot-password', 'resend-verification'].includes(mode) ? { email: fieldValue(data, 'email') }
                    : { token: fieldValue(data, 'token'), password: String(data.get('password')) };
                  await apiClient.request('identity', `/api/v1/auth/${mode}`, { method: 'POST', body, authenticated: false, idempotencyKey: crypto.randomUUID() });
                  if (mode === 'register') {
                    setEmail(fieldValue(data, 'email'));
                    setShowPassword(false);
                    setNotice(text('Đăng ký thành công. Nhập mật khẩu để đăng nhập.', 'Registration successful. Enter your password to sign in.'));
                    setMode('login');
                  } else if (mode === 'resend-verification') {
                    setNotice(text('Đã nhận yêu cầu. Nếu email đủ điều kiện, mã xác minh sẽ được gửi. Chưa nhận được thư? Kiểm tra thư rác hoặc yêu cầu gửi lại mã.', 'Request accepted. Eligible accounts will receive a verification code. Check spam or request another code if needed.'));
                    setMode('verify-email');
                  } else if (mode === 'forgot-password') {
                    setNotice(text('Đã nhận yêu cầu. Nếu tài khoản đủ điều kiện, mã đặt lại mật khẩu sẽ được gửi qua email.', 'Request accepted. Eligible accounts will receive a password reset code.'));
                    setMode('reset-password');
                  } else {
                    setNotice(mode === 'verify-email'
                      ? text('Email đã được xác minh. Bạn có thể đăng nhập.', 'Email verified. You can now sign in.')
                      : text('Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.', 'Password reset. Sign in with your new password.'));
                    setMode('login');
                  }
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
                        maxLength={120}
                        className="auth-text-input"
                        placeholder="Nguyễn Văn A"
                      />
                    </div>
                  </div>
                )}

                {['login', 'register', 'forgot-password', 'resend-verification'].includes(mode) && (
                  <div className="auth-field">
                    <label htmlFor="login-email" className="auth-field-label">Email</label>
                    <div className="auth-input-wrapper">
                      <input
                        id="login-email"
                        name="email"
                        value={email}
                        onChange={event => setEmail(event.target.value)}
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
                        autoComplete="one-time-code"
                        autoCapitalize="none"
                        spellCheck={false}
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
                          onClick={() => { setMode('forgot-password'); setError(''); setNotice(''); }}
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
                      >
                        <Icon name={showPassword ? 'eye' : 'lock'} size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {mode === 'register' && <div className="auth-field">
                  <label htmlFor="confirm-password" className="auth-field-label">{text('Xác nhận mật khẩu', 'Confirm password')}</label>
                  <input id="confirm-password" name="confirm_password" type={showPassword ? 'text' : 'password'} required minLength={12} maxLength={128} autoComplete="new-password" className="auth-text-input" />
                </div>}

                <Button type="submit" className="auth-submit-btn" disabled={busy || isLoading}>
                  {busy ? text('Đang xử lý…', 'Processing…') : mode === 'login' ? text('Đăng nhập', 'Sign in') : mode === 'register' ? text('Đăng ký', 'Sign up') : guestTitles[mode]}
                </Button>
              </form>

              {/* Social Login Options (Image 2 style) */}
              {['login', 'register'].includes(mode) && (
                <>
                  <div className="auth-social-label">
                    {text('Hoặc tiếp tục với tài khoản khác', 'Or continue with another account')}
                  </div>
                  <div className="auth-social-row">
                    {googleClientId && (
                      <div
                        ref={inlineGoogleRef}
                        className={`auth-google-official-slot ${inlineGoogleReady ? 'is-ready' : ''} ${busy || isLoading ? 'is-busy' : ''}`}
                      />
                    )}
                    {(!googleClientId || !inlineGoogleReady) && (
                      <button
                        type="button"
                        className="auth-social-btn google"
                        disabled={busy || isLoading}
                        onClick={handleOpenGoogleDialog}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.99 0 12s.45 3.83 1.25 5.42l4.03-3.15z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/></svg>
                        <span>Google</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="auth-social-btn facebook"
                      disabled={busy || isLoading}
                      onClick={() => { void handleFacebookLogin(); }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="#1877F2" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      <span>Facebook</span>
                    </button>
                  </div>
                  <div className="auth-google-helper-row">
                    <button
                      type="button"
                      className="auth-google-dialog-trigger"
                      disabled={busy || isLoading}
                      onClick={handleOpenGoogleDialog}
                    >
                      {text('Mở hộp thoại đăng nhập bằng tài khoản Google khác', 'Open Google sign-in dialog for another account')}
                    </button>
                    {localhostUrl && (
                      <a href={localhostUrl} className="auth-google-origin-link">
                        {text('Dùng localhost:5173 cho Google OAuth', 'Switch to localhost:5173 for Google OAuth')}
                      </a>
                    )}
                  </div>
                  <GoogleSignInDialog
                    open={googleDialogOpen}
                    busy={busy || isLoading}
                    error={error}
                    onClose={() => setGoogleDialogOpen(false)}
                    onCredential={idToken => { void completeSocialLogin('google', idToken); }}
                  />
                </>
              )}

              {/* Accessible Navigation for all alternate guest modes */}
              <nav aria-label={text('Xác thực tài khoản', 'Account access')} className="auth-alt-nav">
                {(Object.keys(guestTitles) as GuestMode[]).filter(v => v !== mode).map(v => (
                  <button
                    type="button"
                    key={v}
                    disabled={busy || isLoading}
                    onClick={() => { setMode(v); setError(''); setNotice(''); }}
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
    ) : (
      <div className="as-workspace">
        <div className="as-inner">
          <header className="as-page-header">
            <h1 className="as-title">{text('Tài khoản', 'Account Settings')}</h1>
            <p className="as-subtitle">
              {text(
                'Cập nhật hồ sơ cá nhân, bảo mật truy cập, sở thích du lịch và quyền riêng tư của bạn.',
                'Update your profile, security access, travel preferences, and privacy settings.',
              )}
            </p>
          </header>

          <div className="as-layout">
            {/* Left Vertical Settings Navigation */}
            <aside className="as-sidebar" aria-label={text('Danh mục cài đặt tài khoản', 'Account settings navigation')}>
              <div className="as-nav" role="tablist" aria-orientation="vertical">
                {(
                  [
                    ['profile', 'Hồ sơ cá nhân', 'My Profile', 'user'],
                    ['security', 'Bảo mật tài khoản', 'Security', 'shield'],
                    ['preferences', 'Sở thích & Quyền riêng tư', 'Preferences & Privacy', 'sparkle'],
                  ] as const
                ).map(([id, titleVi, titleEn, iconName]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === id}
                    className={`as-nav-item ${activeTab === id ? 'active' : ''}`}
                    onClick={() => setActiveTab(id)}
                  >
                    <Icon name={iconName} size={16} />
                    <span>{text(titleVi, titleEn)}</span>
                  </button>
                ))}
              </div>

              <div className="as-sidebar-footer">
                <button
                  type="button"
                  className="as-logout-btn"
                  disabled={busy || isLoading}
                  onClick={() =>
                    void run(async () => {
                      await logout();
                      showToast('Đã đăng xuất.', 'info');
                    })
                  }
                >
                  <Icon name="arrow" size={15} />
                  <span>{text('Đăng xuất', 'Sign out')}</span>
                </button>
              </div>
            </aside>

            {/* Right Settings Cards */}
            <div className="as-content">
              {!bannerDismissed && (
                <div className="as-callout" role="region" aria-label={text('Hoàn thiện hồ sơ', 'Complete your profile')}>
                  <div className="as-callout-body">
                    <span className="as-callout-icon" aria-hidden="true">
                      <Icon name="user" size={16} />
                    </span>
                    <div>
                      <strong>{text('Hoàn thiện hồ sơ cá nhân.', 'Complete your profile.')}</strong>
                      <p>
                        {text(
                          'Cập nhật tên hiển thị, sở thích du lịch và kiểm tra các phiên đăng nhập đang hoạt động.',
                          'Keep your display name, travel preferences, and active sessions up to date.',
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="as-callout-actions">
                    <button
                      type="button"
                      className="as-btn-dark"
                      onClick={() => setBannerDismissed(true)}
                    >
                      {text('Ẩn', 'Dismiss')}
                    </button>
                    <button
                      type="button"
                      className="as-btn-white"
                      onClick={() => {
                        if (activeTab === 'profile') {
                          displayNameInputRef.current?.focus();
                        } else {
                          setActiveTab('profile');
                          setTimeout(() => displayNameInputRef.current?.focus(), 40);
                        }
                      }}
                    >
                      {text('Cập nhật', 'Update')}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div role="alert" className="as-alert">
                  <Icon name="alert" size={16} />
                  <span>{error}</span>
                </div>
              )}

              {activeTab === 'profile' && (
                <section className="as-card" aria-label={text('Hồ sơ cá nhân', 'My profile')}>
                  <div className="as-card-head">
                    <h2 className="as-card-title">
                      {String(profile?.display_name ?? user?.display_name ?? text('Hồ sơ cá nhân', 'My profile'))}
                    </h2>
                    <p className="as-card-desc">
                      {text('Thông tin tài khoản hiển thị công khai trên SmartTravel VN', 'Public account details')}
                    </p>
                  </div>

                  {/* Row 1: Photo / Avatar & Role */}
                  <div className="as-row">
                    <div className="as-row-label">
                      <strong>{text('Ảnh đại diện', 'Photo')}</strong>
                      <span>{text('Hiển thị trong đánh giá và lịch trình.', 'Shown in reviews and itineraries.')}</span>
                    </div>
                    <div className="as-row-control as-avatar-row">
                      <div className="as-avatar-circle" aria-hidden="true">
                        {String(profile?.display_name ?? user?.display_name ?? user?.email ?? 'U')
                          .trim()
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                      <div className="as-avatar-meta">
                        <div className="account-role-list">
                          {(user?.roles ?? []).map((role) => (
                            <Badge key={role}>
                              {role === 'USER'
                                ? 'Du khách'
                                : role === 'ADMIN'
                                  ? 'Quản trị viên'
                                  : role === 'BUSINESS'
                                    ? 'Doanh nghiệp'
                                    : role}
                            </Badge>
                          ))}
                        </div>
                        <details className="account-identifier">
                          <summary>{text('Mã tài khoản', 'Account ID')}</summary>
                          <code>{String(profile?.user_id ?? user?.user_id ?? '')}</code>
                        </details>
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Display Name Form */}
                  <form
                    className="as-row as-form-row"
                    key={String(profile?.version)}
                    onSubmit={(e) =>
                      submit(e, async (data) => {
                        const current = await travel.read<Resource>('identity', '/me');
                        setProfile(
                          await travel.mutate(
                            'identity',
                            '/me',
                            { display_name: fieldValue(data, 'display_name') },
                            'PATCH',
                            Number(current.version),
                          ),
                        );
                        await reloadUser();
                        showToast('Đã cập nhật hồ sơ.', 'success');
                      })
                    }
                  >
                    <div className="as-row-label">
                      <label htmlFor="display-name">{text('Tên hiển thị', 'Full name')}</label>
                      <span>{text('Sử dụng xuyên suốt không gian SmartTravel.', 'Used across the workspace.')}</span>
                    </div>
                    <div className="as-row-control as-inline-save">
                      <input
                        ref={displayNameInputRef}
                        id="display-name"
                        name="display_name"
                        required
                        maxLength={1024}
                        defaultValue={String(profile?.display_name ?? user?.display_name ?? '')}
                      />
                      <Button type="submit" className="as-btn-white" disabled={busy || !profile}>
                        Lưu hồ sơ
                      </Button>
                    </div>
                  </form>

                  {/* Row 3: Email Address */}
                  <div className="as-row">
                    <div className="as-row-label">
                      <div className="as-label-with-badge">
                        <strong>{text('Địa chỉ email', 'Email address')}</strong>
                        <span className="as-verified-badge">{text('Đã xác minh', 'Verified')}</span>
                      </div>
                      <span>{text('Email đăng nhập chính của tài khoản.', 'Primary sign-in email.')}</span>
                    </div>
                    <div className="as-row-control">
                      <input
                        type="email"
                        readOnly
                        aria-label={text('Địa chỉ email', 'Email address')}
                        value={String(profile?.email ?? user?.email ?? '')}
                      />
                    </div>
                  </div>

                  {/* Row 4: Profile Details (Role & Timezone) */}
                  <div className="as-row as-row-last">
                    <div className="as-row-label">
                      <strong>{text('Chi tiết tài khoản', 'Profile details')}</strong>
                      <span>{text('Vai trò và múi giờ áp dụng cho lịch trình.', 'Account role and timezone for itineraries.')}</span>
                    </div>
                    <div className="as-row-control as-stacked-fields">
                      <div className="as-readonly-field">
                        <span>{text('Vai trò', 'Role')}</span>
                        <div>
                          {(user?.roles ?? ['USER'])
                            .map((r) =>
                              r === 'USER'
                                ? 'Du khách'
                                : r === 'ADMIN'
                                  ? 'Quản trị viên'
                                  : r === 'BUSINESS'
                                    ? 'Doanh nghiệp'
                                    : r,
                            )
                            .join(', ')}
                        </div>
                      </div>
                      <div className="as-readonly-field">
                        <span>{text('Múi giờ', 'Time zone')}</span>
                        <div>UTC+7 (Asia/Ho_Chi_Minh)</div>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {activeTab === 'security' && (
                <div className="as-stack">
                  <section className="as-card" aria-label={text('Đổi mật khẩu', 'Change password')}>
                    <div className="as-card-head">
                      <h2 className="as-card-title">{text('Đổi mật khẩu', 'Change password')}</h2>
                      <p className="as-card-desc">
                        {text('Cập nhật mật khẩu tối thiểu 12 ký tự để bảo vệ tài khoản.', 'Use at least 12 characters to keep your account secure.')}
                      </p>
                    </div>
                    <form
                      className="as-security-form"
                      onSubmit={(e) =>
                        submit(e, async (data) => {
                          await travel.mutate(
                            'identity',
                            '/me/password',
                            {
                              current_password: String(data.get('current_password')),
                              new_password: String(data.get('new_password')),
                            },
                            'PUT',
                          );
                          showToast('Đã cập nhật mật khẩu. Vui lòng đăng nhập lại nếu phiên đã bị thu hồi.', 'success');
                        })
                      }
                    >
                      <div className="as-row">
                        <div className="as-row-label">
                          <label htmlFor="current-pass">Mật khẩu hiện tại</label>
                          <span>{text('Xác nhận mật khẩu đang dùng.', 'Confirm your existing password.')}</span>
                        </div>
                        <div className="as-row-control">
                          <input
                            id="current-pass"
                            name="current_password"
                            type="password"
                            autoComplete="current-password"
                            required
                            minLength={12}
                            maxLength={128}
                          />
                        </div>
                      </div>
                      <div className="as-row">
                        <div className="as-row-label">
                          <label htmlFor="new-pass">Mật khẩu mới</label>
                          <span>{text('Tối thiểu 12 ký tự.', 'Minimum 12 characters.')}</span>
                        </div>
                        <div className="as-row-control">
                          <input
                            id="new-pass"
                            name="new_password"
                            type="password"
                            autoComplete="new-password"
                            required
                            minLength={12}
                            maxLength={128}
                          />
                        </div>
                      </div>
                      <div className="as-card-footer">
                        <Button type="submit" className="as-btn-white" disabled={busy}>
                          Lưu mật khẩu
                        </Button>
                      </div>
                    </form>
                  </section>

                  <section className="as-card" aria-label={text('Phiên đăng nhập', 'Active sessions')}>
                    <div className="as-card-head as-card-head-split">
                      <div>
                        <h2 className="as-card-title">{text('Phiên đăng nhập', 'Active sessions')}</h2>
                        <p className="as-card-desc">
                          {text('Theo dõi và thu hồi các thiết bị đang giữ phiên đăng nhập.', 'Monitor and revoke active sign-in sessions.')}
                        </p>
                      </div>
                      <Button type="button" className="as-btn-dark" disabled={busy} onClick={() => void run(loadAccount)}>
                        Tải lại phiên
                      </Button>
                    </div>
                    <div className="as-session-list">
                      {sessions.length === 0 ? (
                        <div className="as-row as-row-last">
                          <p className="as-muted-empty">{text('Không có phiên đăng nhập nào khác.', 'No active sessions listed.')}</p>
                        </div>
                      ) : (
                        sessions.map((session) => {
                          const sid = String(session.session_id ?? session.id);
                          return (
                            <div className="as-row as-session-row" key={sid}>
                              <div className="as-row-label">
                                <strong className="as-session-id">{sid}</strong>
                                <span>{String(session.created_at ?? '')}</span>
                              </div>
                              <div className="as-row-control as-session-action">
                                <Button
                                  type="button"
                                  className="as-btn-dark as-btn-danger-hover"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(async () => {
                                      await travel.mutate(
                                        'identity',
                                        `/me/sessions/${encodeURIComponent(sid)}`,
                                        undefined,
                                        'DELETE',
                                      );
                                      await loadAccount();
                                    })
                                  }
                                >
                                  Thu hồi phiên
                                </Button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'preferences' && (
                <div className="as-stack">
                  <section className="as-card" aria-label={text('Sở thích du lịch', 'Travel preferences')}>
                    <div className="as-card-head">
                      <h2 className="as-card-title">{text('Sở thích du lịch', 'Travel preferences')}</h2>
                      <p className="as-card-desc">
                        {text('Cá nhân hóa gợi ý điểm đến, phong cách và ngân sách của bạn.', 'Tailor destination recommendations, travel style, and budget.')}
                      </p>
                    </div>
                    {preferences && (
                      <form
                        key={String(preferences.version)}
                        onSubmit={(e) =>
                          submit(e, async (data) => {
                            const saved = await travel.mutate<Resource>(
                              'identity',
                              '/me/preferences',
                              {
                                category_ids: data.getAll('category_ids'),
                                travel_style_ids: data.getAll('travel_style_ids'),
                                food_preference_ids: data.getAll('food_preference_ids'),
                                budget_min: fieldValue(data, 'budget_min') === '' ? null : Number(data.get('budget_min')),
                                budget_max: fieldValue(data, 'budget_max') === '' ? null : Number(data.get('budget_max')),
                                budget_level: fieldValue(data, 'budget_level'),
                                currency: 'VND',
                                personalization_enabled: data.has('personalization_enabled'),
                                consent_version: Number(preferences.consent_version),
                              },
                              'PUT',
                              Number(preferences.version),
                            );
                            setPreferences(saved);
                            showToast('Đã lưu sở thích.', 'success');
                          })
                        }
                      >
                        <div className="as-row">
                          <div className="as-row-label">
                            <strong>Danh mục yêu thích</strong>
                            <span>{text('Chọn các chủ đề bạn thích khám phá.', 'Select categories you enjoy exploring.')}</span>
                          </div>
                          <div className="as-row-control">
                            <fieldset className="as-fieldset">
                              <legend className="as-sr-only">Danh mục yêu thích</legend>
                              <div className="as-chip-checks">
                                {categories.map((category) => {
                                  const id = String(category.category_id ?? category.id);
                                  return (
                                    <label key={id} className="as-chip-check">
                                      <input
                                        type="checkbox"
                                        name="category_ids"
                                        value={id}
                                        defaultChecked={((preferences.category_ids as string[]) ?? []).includes(id)}
                                      />
                                      <span>{String(category.name)}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </fieldset>
                          </div>
                        </div>

                        {(['TRAVEL_STYLE', 'FOOD_PREFERENCE'] as const).map((kind) => {
                          const field = kind === 'TRAVEL_STYLE' ? 'travel_style_ids' : 'food_preference_ids';
                          const title = kind === 'TRAVEL_STYLE' ? 'Phong cách du lịch' : 'Sở thích ẩm thực';
                          return (
                            <div className="as-row" key={kind}>
                              <div className="as-row-label">
                                <strong>{title}</strong>
                                <span>
                                  {kind === 'TRAVEL_STYLE'
                                    ? text('Nhịp độ và trải nghiệm ưu tiên.', 'Preferred pace and experience.')
                                    : text('Khẩu vị và món ăn mong muốn.', 'Culinary preferences.')}
                                </span>
                              </div>
                              <div className="as-row-control">
                                <fieldset className="as-fieldset">
                                  <legend className="as-sr-only">{title}</legend>
                                  <div className="as-chip-checks">
                                    {options
                                      .filter((option) => option.type === kind || option.kind === kind)
                                      .map((option) => {
                                        const id = String(option.option_id ?? option.id);
                                        return (
                                          <label key={id} className="as-chip-check">
                                            <input
                                              type="checkbox"
                                              name={field}
                                              value={id}
                                              defaultChecked={((preferences[field] as string[]) ?? []).includes(id)}
                                            />
                                            <span>{String(option.name ?? option.label)}</span>
                                          </label>
                                        );
                                      })}
                                  </div>
                                </fieldset>
                              </div>
                            </div>
                          );
                        })}

                        <div className="as-row">
                          <div className="as-row-label">
                            <strong>{text('Ngân sách dự kiến', 'Budget range')}</strong>
                            <span>{text('Khoảng chi tiêu mong muốn cho mỗi điểm đến.', 'Expected spending per destination.')}</span>
                          </div>
                          <div className="as-row-control as-budget-grid">
                            <label htmlFor="budget-min">
                              Ngân sách tối thiểu (VND)
                              <input
                                id="budget-min"
                                name="budget_min"
                                type="number"
                                min="0"
                                defaultValue={preferences.budget_min == null ? '' : String(preferences.budget_min)}
                              />
                            </label>
                            <label htmlFor="budget-max">
                              Ngân sách tối đa (VND)
                              <input
                                id="budget-max"
                                name="budget_max"
                                type="number"
                                min="0"
                                defaultValue={preferences.budget_max == null ? '' : String(preferences.budget_max)}
                              />
                            </label>
                            <div className="as-select-field">
                              <label htmlFor="budget-level">Mức ngân sách</label>
                              <RoundedSelect
                                id="budget-level"
                                name="budget_level"
                                label="Mức ngân sách"
                                defaultValue={String(preferences.budget_level)}
                                options={[
                                  { value: 'LOW', label: 'Thấp' },
                                  { value: 'MID', label: 'Trung bình' },
                                  { value: 'HIGH', label: 'Cao' },
                                  { value: 'CUSTOM', label: 'Tùy chỉnh (giữ khoảng đã lưu)' },
                                ]}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="as-row">
                          <div className="as-row-label">
                            <strong>{text('Cá nhân hóa', 'Personalization')}</strong>
                            <span>{text('Cho phép SmartTravel tối ưu thứ tự gợi ý.', 'Allow SmartTravel to tailor recommendations.')}</span>
                          </div>
                          <div className="as-row-control">
                            <label className="as-consent-check">
                              <input
                                type="checkbox"
                                name="personalization_enabled"
                                defaultChecked={Boolean(preferences.personalization_enabled)}
                              />
                              <span>Đồng ý dùng dữ liệu để cá nhân hóa theo chính sách hiện tại</span>
                            </label>
                          </div>
                        </div>

                        <div className="as-card-footer">
                          <Button type="submit" className="as-btn-white" disabled={busy}>
                            Lưu sở thích
                          </Button>
                        </div>
                      </form>
                    )}
                  </section>

                  <section className="as-card as-card-danger" aria-label={text('Quyền riêng tư', 'Privacy')}>
                    <details className="as-deletion-details">
                      <summary>Yêu cầu xóa dữ liệu cá nhân</summary>
                      <p className="as-card-desc">
                        Yêu cầu xóa dữ liệu được xử lý bất đồng bộ trên các service. Thao tác này có thể không khôi phục được.
                      </p>
                      <form
                        className="as-deletion-form"
                        onSubmit={(e) =>
                          submit(e, async () => {
                            setDeletion(await travel.mutate('identity', '/me/deletion-requests', { policy_version: 1 }));
                          })
                        }
                      >
                        <label className="as-consent-check">
                          <input type="checkbox" required />
                          <span>Tôi xác nhận yêu cầu xóa dữ liệu của mình</span>
                        </label>
                        <Button type="submit" className="as-btn-danger" disabled={busy}>
                          Gửi yêu cầu xóa dữ liệu
                        </Button>
                      </form>
                      {deletion && (
                        <p role="status" className="as-deletion-status">
                          Yêu cầu {String(deletion.request_id)} · {String(deletion.status)}
                        </p>
                      )}
                    </details>
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}
  </div>;
}
