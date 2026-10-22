import { useState, type FormEvent } from 'react';
import { Icon, Button, Badge } from '../../shared/ui';
import { useAuth } from '../../app/providers/AuthProvider';
import { useToast } from '../../app/providers/ToastProvider';

export function AccountPanel() {
  const { user, isAuthenticated, login, logout, isLoading, reloadUser } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'preferences'>('profile');

  // Profile edit state
  const [displayName, setDisplayName] = useState('');
  const [updatingProfile, setUpdatingProfile] = useState(false);

  // Security password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    try {
      await login(email, password);
      showToast('Đăng nhập thành công!', 'success');
      setEmail('');
      setPassword('');
    } catch {
      showToast('Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.', 'error');
    }
  }

  async function handleLogout() {
    try {
      await logout();
      showToast('Đã đăng xuất an toàn.', 'info');
    } catch {
      showToast('Có lỗi xảy ra khi đăng xuất.', 'error');
    }
  }

  return (
    <div className="account-panel-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {!isAuthenticated ? (
        /* Guest / Login Form Section */
        <section className="travel-panel" style={{ maxWidth: '480px', margin: '0 auto', width: '100%', padding: 'var(--space-2xl)' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--color-primary-light)', color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
              <Icon name="user" size={26} />
            </div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>Đăng nhập tài khoản</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginTop: '6px' }}>
              Đăng nhập để đồng bộ lịch trình, lưu điểm đến và tham gia cộng đồng du lịch.
            </p>
          </div>

          <form onSubmit={handleLogin} className="clay-form">
            <div className="form-group">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Mật khẩu</label>
              <input
                id="login-password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            <Button type="submit" loading={isLoading} style={{ marginTop: '8px' }}>
              Đăng nhập
            </Button>
          </form>

          <div style={{ marginTop: '20px', padding: '12px', background: 'var(--color-surface-subtle)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
            <strong>Tài khoản thử nghiệm hệ thống:</strong>
            <p style={{ margin: '4px 0 0 0' }}>
              traveler@example.invalid (Mật khẩu bất kỳ để chạy UI check)
            </p>
          </div>
        </section>
      ) : (
        /* Authenticated User Dashboard */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* User Profile Overview Card */}
          <section className="travel-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700, boxShadow: 'var(--shadow-md)' }}>
                {(user?.display_name ?? user?.email ?? 'U')[0].toUpperCase()}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
                    {user?.display_name ?? 'Người khám phá'}
                  </h2>
                  <Badge variant="success">Hoạt động</Badge>
                </div>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', margin: '4px 0 0 0' }}>
                  {user?.email}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="btn-secondary"
              onClick={handleLogout}
              disabled={isLoading}
              style={{ color: 'var(--color-destructive)' }}
            >
              <Icon name="arrow" size={16} /> Đăng xuất
            </button>
          </section>

          {/* Sub Navigation Tabs */}
          <div className="sub-tab-bar" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'profile'}
              className={`sub-tab ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              Hồ sơ cá nhân
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'security'}
              className={`sub-tab ${activeTab === 'security' ? 'active' : ''}`}
              onClick={() => setActiveTab('security')}
            >
              Bảo mật tài khoản
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'preferences'}
              className={`sub-tab ${activeTab === 'preferences' ? 'active' : ''}`}
              onClick={() => setActiveTab('preferences')}
            >
              Sở thích & Quyền riêng tư
            </button>
          </div>

          {/* Tab Contents */}
          {activeTab === 'profile' && (
            <section className="travel-panel" style={{ maxWidth: '600px' }}>
              <h3 style={{ marginBottom: '16px' }}>Thông tin cơ bản</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Email đăng ký:</span>
                  <p style={{ fontWeight: 600, fontSize: '0.9375rem', margin: '2px 0 0 0' }}>{user?.email}</p>
                </div>
                <div>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Mã người dùng:</span>
                  <p style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>{user?.id}</p>
                </div>
                <div>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Vai trò tài khoản:</span>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    {(user?.roles ?? ['USER']).map(r => (
                      <Badge key={r} variant="primary">{r}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'security' && (
            <section className="travel-panel" style={{ maxWidth: '600px' }}>
              <h3 style={{ marginBottom: '16px' }}>Đổi mật khẩu</h3>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  showToast('Đã cập nhật mật khẩu mới!', 'success');
                  setCurrentPassword('');
                  setNewPassword('');
                }}
                className="clay-form"
              >
                <div className="form-group">
                  <label htmlFor="current-pass">Mật khẩu hiện tại</label>
                  <input
                    id="current-pass"
                    type="password"
                    required
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="new-pass">Mật khẩu mới</label>
                  <input
                    id="new-pass"
                    type="password"
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={changingPass}>
                  Lưu mật khẩu
                </Button>
              </form>
            </section>
          )}

          {activeTab === 'preferences' && (
            <section className="travel-panel" style={{ maxWidth: '600px' }}>
              <h3 style={{ marginBottom: '14px' }}>Sở thích du lịch</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
                Tuỳ chỉnh trải nghiệm để nhận các gợi ý phù hợp nhất với phong cách của bạn.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {['Thiên nhiên & Núi rừng', 'Biển đảo & Nghỉ dưỡng', 'Văn hóa & Lịch sử', 'Ẩm thực đường phố', 'Chụp ảnh & Check-in', 'Phượt & Trải nghiệm'].map(tag => (
                  <button
                    key={tag}
                    type="button"
                    className="day-chip is-active"
                    style={{ cursor: 'default' }}
                  >
                    <Icon name="tag" size={14} /> {tag}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
