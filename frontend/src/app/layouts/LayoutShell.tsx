import { useEffect, useState, type ReactNode } from 'react';
import { LiquidGlassNav, Icon } from '../../shared/ui';
import { useAuth } from '../providers/AuthProvider';
import { useToast } from '../providers/ToastProvider';

export interface LayoutProps {
  children?: ReactNode;
  activeSection: string;
  onNavigate: (section: string) => void;
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  onOpenAuthModal?: () => void;
}

export function AppHeader({
  activeSection,
  onNavigate,
  isMenuOpen,
  setIsMenuOpen,
  onOpenAuthModal
}: LayoutProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    let rafId = 0;
    const handleScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const scrolled = window.scrollY > 60;
        setIsScrolled(prev => (prev !== scrolled ? scrolled : prev));
      });
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const { user, isAuthenticated, isAdmin, isBusiness, logout } = useAuth();
  const { showToast } = useToast();
  const tabs = [
    { id: 'Khám phá', label: 'Khám phá', icon: 'compass' },
    { id: 'Bản đồ', label: 'Bản đồ', icon: 'map' },
    { id: 'Bộ sưu tập', label: 'Bộ sưu tập', icon: 'layers' },
    { id: 'Chuyến đi', label: 'Chuyến đi', icon: 'route' },
    { id: 'Tài khoản', label: 'Tài khoản', icon: 'user' },
    ...(isAuthenticated ? [{ id: 'Thông báo', label: 'Thông báo', icon: 'bell' }] : []),
    ...(isAuthenticated ? [{ id: 'Đóng góp', label: 'Đóng góp', icon: 'pin' }] : []),
    ...(isBusiness ? [{ id: 'Doanh nghiệp', label: 'Doanh nghiệp', icon: 'building' }] : []),
    ...(isAdmin ? [{ id: 'Kiểm duyệt', label: 'Kiểm duyệt', icon: 'shield' }, { id: 'Quản trị', label: 'Quản trị', icon: 'database' }] : []),
  ];

  const isImmersive = activeSection === 'Khám phá';

  return (
    <header
      className={`liquid-glass-header ${isImmersive ? 'is-immersive' : ''} ${isScrolled ? 'is-scrolled' : ''}`}
      role="banner"
      onKeyDown={event => {
        if (event.key === 'Escape' && isMenuOpen) {
          setIsMenuOpen(false);
          event.currentTarget.querySelector<HTMLButtonElement>('.mobile-menu-btn')?.focus();
        }
      }}
    >
      <div className="liquid-glass-container">
        {/* Brand Logo */}
        <button
          type="button"
          className="brand-badge"
          onClick={() => onNavigate('Khám phá')}
          aria-label="SmartTravel VN Trang chủ"
        >
          <div className="brand-icon-wrapper">
            <Icon name="compass" size={16} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ lineHeight: 1.1 }}>SmartTravel</span>
            <span style={{ fontSize: '7.5px', fontWeight: 600, color: 'var(--color-primary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Việt Nam
            </span>
          </div>
        </button>

        {/* Central Liquid Glass Navigation */}
        <LiquidGlassNav
          tabs={tabs}
          activeTab={activeSection}
          onSelectTab={onNavigate}
          isMenuOpen={isMenuOpen}
          onCloseMenu={() => setIsMenuOpen(false)}
        />

        {/* Header Right Actions */}
        <div className="nav-actions">
          {isAuthenticated ? (
            <div className="header-session">
              <button
                type="button"
                className="btn-subtle header-account"
                onClick={() => onNavigate('Tài khoản')}
                aria-label="Trang tài khoản cá nhân"
                title={user?.display_name ?? 'Tài khoản cá nhân'}
              >
                <div className="header-avatar"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: 'var(--color-primary-light)',
                    color: 'var(--color-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.75rem'
                  }}
                >
                  {(user?.display_name ?? user?.email ?? 'U')[0].toUpperCase()}
                </div>
                <span className="hide-mobile header-account-name">
                  {user?.display_name ?? user?.email?.split('@')[0]}
                </span>
              </button>
              <button
                type="button"
                className="btn-subtle header-logout"
                onClick={() => void logout().catch(() => showToast('Đã thoát trên thiết bị này; chưa xác nhận được đăng xuất với máy chủ.', 'error'))}
                aria-label="Đăng xuất khỏi hệ thống"
                style={{ color: 'var(--color-destructive)' }}
              >
                <Icon name="arrow" size={16} />
                <span className="hide-mobile">Đăng xuất</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="nav-auth-btn"
                onClick={() => {
                  if (onOpenAuthModal) onOpenAuthModal();
                  else onNavigate('Tài khoản');
                }}
              >
                <Icon name="user" size={13} />
                <span>Đăng nhập</span>
              </button>
            </div>
          )}

          {/* Mobile hamburger menu */}
          <button
            type="button"
            className="mobile-menu-btn"
            aria-label={isMenuOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={isMenuOpen}
            aria-controls="app-navigation"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <Icon name={isMenuOpen ? 'x' : 'menu'} size={22} />
          </button>
        </div>
      </div>
    </header>
  );
}

export function AppFooter({ onNavigate }: { onNavigate: (section: string) => void }) {
  const { isAdmin, isBusiness } = useAuth();
  return (
    <footer
      style={{
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
        padding: 'var(--space-2xl) var(--space-lg)',
        marginTop: 'auto'
      }}
    >
      <div style={{ maxWidth: '1360px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '32px' }}>
          <div style={{ maxWidth: '340px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--radius-button)',
                  background: 'var(--color-primary)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Icon name="compass" size={18} />
              </div>
              <strong style={{ fontSize: '1.125rem', fontFamily: 'var(--font-heading)' }}>
                SmartTravel VN
              </strong>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              Nền tảng du lịch Việt Nam thông minh. Khám phá vẻ đẹp bất tận từ Bắc chí Nam, lập lịch trình tối ưu và kết nối trải nghiệm bản địa đích thực.
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '12px' }}>Khám phá</h2>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.875rem' }}>
              <li><button type="button" className="btn-subtle" onClick={() => onNavigate('Khám phá')}>Điểm đến nổi bật</button></li>
              <li><button type="button" className="btn-subtle" onClick={() => onNavigate('Bản đồ')}>Bản đồ du lịch</button></li>
              <li><button type="button" className="btn-subtle" onClick={() => onNavigate('Bộ sưu tập')}>Bộ sưu tập</button></li>
              <li><button type="button" className="btn-subtle" onClick={() => onNavigate('Chuyến đi')}>Lập lịch trình</button></li>
            </ul>
          </div>

          <div>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '12px' }}>Dành cho đối tác</h2>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.875rem' }}>
              <li><button type="button" className="btn-subtle" onClick={() => onNavigate('Tài khoản')}>Tài khoản của bạn</button></li>
              {(isBusiness || isAdmin) && <li><button type="button" className="btn-subtle" onClick={() => onNavigate('Doanh nghiệp')}>Cổng thông tin doanh nghiệp</button></li>}
              {isAdmin && <li><button type="button" className="btn-subtle" onClick={() => onNavigate('Quản trị')}>Quản trị hệ thống</button></li>}
            </ul>
          </div>
        </div>

        <div
          style={{
            borderTop: '1px solid var(--color-border-subtle)',
            paddingTop: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            fontSize: '0.8125rem',
            color: 'var(--color-text-secondary)'
          }}
        >
          <span>© 2026 SmartTravel VN. Bản quyền thuộc về Đồ án Tốt nghiệp UIT.</span>
          <details className="photo-credits"><summary>Nguồn ảnh và giấy phép</summary><ul>
            <li><a href="https://commons.wikimedia.org/wiki/File:Tam_Coc_Panorama_(8604887215).jpg" target="_blank" rel="noreferrer">Tam Cốc: Jean-Marc Astesana</a> (<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC BY-SA 2.0</a>)</li>
            <li><a href="https://commons.wikimedia.org/wiki/File:Boats_with_lanterns_on_the_Thu_Bon_river_IMG_3864.jpg" target="_blank" rel="noreferrer">Hội An: Kuroczynski</a> (<a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>)</li>
            <li><a href="https://commons.wikimedia.org/wiki/File:Ha_Long_Bay,_Vietnam,_Islands.jpg" target="_blank" rel="noreferrer">Hạ Long: Vyacheslav Argenberg</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)</li>
          </ul><p>Ảnh được đổi sang WebP, thu nhỏ và cắt khung khi hiển thị. Giấy phép ảnh giữ nguyên.</p></details>
        </div>
      </div>
    </footer>
  );
}
