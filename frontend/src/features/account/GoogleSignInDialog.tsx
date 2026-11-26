import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/ui';
import { useAppPreferences } from '../../app/providers/AppPreferences';
import { getGoogleClientId, getLocalhostEquivalentUrl, renderGoogleSignInButton } from './socialAuth';

interface GoogleSignInDialogProps {
  open: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onCredential: (idToken: string) => void;
}

export function GoogleSignInDialog({ open, busy, error, onClose, onCredential }: GoogleSignInDialogProps) {
  const { text, locale, theme } = useAppPreferences();
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const credentialHandlerRef = useRef(onCredential);
  credentialHandlerRef.current = onCredential;

  const [sdkState, setSdkState] = useState<'loading' | 'ready' | 'missing-config' | 'error'>('loading');
  const [sdkError, setSdkError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const clientId = getGoogleClientId();
  const localhostUrl = getLocalhostEquivalentUrl();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  useEffect(() => {
    if (!open) return;
    if (!clientId) {
      setSdkState('missing-config');
      setSdkError('');
      return;
    }
    let cancelled = false;
    setSdkState('loading');
    setSdkError('');

    const container = buttonContainerRef.current;
    if (!container) return;

    renderGoogleSignInButton({
      clientId,
      container,
      onCredential: token => credentialHandlerRef.current(token),
      theme: theme === 'dark' ? 'filled_black' : 'outline',
      text: 'signin_with',
      width: 312,
      locale
    })
      .then(() => {
        if (!cancelled) setSdkState('ready');
      })
      .catch(err => {
        if (!cancelled) {
          setSdkState('error');
          setSdkError(
            err instanceof Error
              ? err.message
              : text('Không tải được thư viện Google Sign-In.', 'Unable to load Google Sign-In library.')
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, clientId, locale, theme, retryCount, text]);

  if (!open) return null;

  return (
    <div
      className="auth-google-modal-backdrop"
      role="presentation"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        className="auth-google-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-signin-dialog-title"
        onClick={event => event.stopPropagation()}
      >
        <div className="auth-google-modal-header">
          <div className="auth-google-modal-brand">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z" />
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.99 0 12s.45 3.83 1.25 5.42l4.03-3.15z" />
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
            </svg>
            <h3 id="google-signin-dialog-title">
              {text('Đăng nhập bằng Google', 'Sign in with Google')}
            </h3>
          </div>
          <button
            type="button"
            className="auth-google-modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label={text('Đóng hộp thoại', 'Close dialog')}
          >
            ×
          </button>
        </div>

        <p className="auth-google-modal-desc">
          {text(
            'Bấm nút Google chính thức bên dưới để mở cửa sổ bảo mật tại accounts.google.com — bạn có thể chọn tài khoản sẵn có hoặc nhập email và mật khẩu Google mới.',
            'Click the official Google button below to open the secure accounts.google.com popup where you can pick an account or enter a new Google email and password.'
          )}
        </p>

        {localhostUrl && (
          <div className="auth-google-origin-note" role="note">
            <span>
              {text(
                'Bạn đang mở bằng 127.0.0.1. Nếu Google báo lỗi nguồn gốc (origin_mismatch), hãy mở bằng localhost:',
                'You are using 127.0.0.1. If Google reports an origin mismatch, switch to localhost:'
              )}
            </span>
            <a href={localhostUrl}>{localhostUrl}</a>
          </div>
        )}

        {error && (
          <div role="alert" className="auth-alert-box">
            <Icon name="alert" size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="auth-google-modal-stage">
          {sdkState === 'missing-config' ? (
            <p className="auth-google-modal-status">
              {text(
                'Chưa cấu hình VITE_GOOGLE_CLIENT_ID trong file frontend/.env.',
                'VITE_GOOGLE_CLIENT_ID is not configured in frontend/.env.'
              )}
            </p>
          ) : (
            <>
              <div
                ref={buttonContainerRef}
                className={`auth-google-button-host ${busy ? 'is-busy' : ''}`}
              />
              {sdkState === 'loading' && (
                <p className="auth-google-modal-status">
                  {text('Đang tải nút đăng nhập chính thức của Google…', 'Loading official Google Sign-In button…')}
                </p>
              )}
              {busy && (
                <p className="auth-google-modal-status">
                  {text('Đang xác thực tài khoản Google với SmartTravel…', 'Verifying your Google account with SmartTravel…')}
                </p>
              )}
              {sdkState === 'error' && (
                <div className="auth-google-modal-error">
                  <p>{sdkError}</p>
                  <button
                    type="button"
                    className="auth-google-retry-btn"
                    onClick={() => setRetryCount(c => c + 1)}
                  >
                    {text('Thử tải lại', 'Retry')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <p className="auth-google-modal-footnote">
          {text(
            'SmartTravel không bao giờ yêu cầu hay lưu mật khẩu Google của bạn. Quá trình xác thực diễn ra trực tiếp với Google.',
            'SmartTravel never asks for or stores your Google password. Authentication happens directly with Google.'
          )}
        </p>
      </div>
    </div>
  );
}
