import { useEffect, useState, type ReactNode } from 'react';
import { LiquidGlassNav, Icon } from '../../shared/ui';
import { useAuth } from '../providers/AuthProvider';
import { useToast } from '../providers/ToastProvider';
import { useAppPreferences } from '../providers/AppPreferences';

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
  const { theme, locale, toggleTheme, toggleLocale, text } = useAppPreferences();
  const tabs = [
    { id: 'Khám phá', label: text('Khám phá', 'Explore'), icon: 'compass' },
    { id: 'Bản đồ', label: text('Bản đồ', 'Map'), icon: 'map' },
    { id: 'Bộ sưu tập', label: text('Bộ sưu tập', 'Collections'), icon: 'layers' },
    { id: 'Chuyến đi', label: text('Chuyến đi', 'Trips'), icon: 'route' },
    { id: 'Tài khoản', label: text('Tài khoản', 'Account'), icon: 'user' },
    ...(isAuthenticated ? [{ id: 'Thông báo', label: text('Thông báo', 'Notifications'), icon: 'bell' }] : []),
    ...(isAuthenticated ? [{ id: 'Đóng góp', label: text('Đóng góp', 'Contribute'), icon: 'pin' }] : []),
    ...(isBusiness ? [{ id: 'Doanh nghiệp', label: text('Doanh nghiệp', 'Business'), icon: 'building' }] : []),
    ...(isAdmin ? [{ id: 'Kiểm duyệt', label: text('Kiểm duyệt', 'Moderation'), icon: 'shield' }, { id: 'Quản trị', label: text('Quản trị', 'Admin'), icon: 'database' }] : []),
  ];

  const isImmersive = activeSection === 'Khám phá' || (activeSection === 'Tài khoản' && !isAuthenticated);

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
          aria-label={text('SmartTravel VN Trang chủ', 'SmartTravel VN Home')}
        >
          <div className="brand-icon-wrapper">
            <Icon name="compass" size={16} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ lineHeight: 1.1 }}>SmartTravel</span>
            <span style={{ fontSize: '7.5px', fontWeight: 600, color: 'var(--color-primary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {text('Việt Nam', 'Vietnam')}
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
          <div className="nav-preferences" aria-label={text('Tùy chọn giao diện', 'Display preferences')}>
            <button type="button" className="preference-toggle preference-theme" onClick={toggleTheme}
              aria-label={theme === 'dark' ? text('Chuyển sang giao diện sáng', 'Switch to light theme') : text('Chuyển sang giao diện tối', 'Switch to dark theme')}
              title={theme === 'dark' ? text('Giao diện sáng', 'Light theme') : text('Giao diện tối', 'Dark theme')}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
            </button>
            <button type="button" className="preference-toggle preference-locale" onClick={toggleLocale}
              aria-label={locale === 'vi' ? 'Switch language to English' : 'Chuyển ngôn ngữ sang Tiếng Việt'}
              title={locale === 'vi' ? 'English' : 'Tiếng Việt'}>{locale === 'vi' ? 'EN' : 'VI'}</button>
          </div>
          {isAuthenticated ? (
            <div className="header-session">
              <button
                type="button"
                className="btn-subtle header-account"
                onClick={() => onNavigate('Tài khoản')}
                aria-label={text('Trang tài khoản cá nhân', 'Personal account')}
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
                aria-label={text('Đăng xuất khỏi hệ thống', 'Sign out')}
                style={{ color: 'var(--color-destructive)' }}
              >
                <Icon name="arrow" size={16} />
                <span className="hide-mobile">{text('Đăng xuất', 'Sign out')}</span>
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
                <span className="hide-mobile">{text('Đăng nhập', 'Sign in')}</span>
              </button>
            </div>
          )}

          {/* Mobile hamburger menu */}
          <button
            type="button"
            className="mobile-menu-btn"
            aria-label={isMenuOpen ? text('Đóng menu', 'Close menu') : text('Mở menu', 'Open menu')}
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
  const { text } = useAppPreferences();
  return (
    <footer
      className="app-footer"
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
              {text('Nền tảng du lịch Việt Nam thông minh. Khám phá vẻ đẹp bất tận từ Bắc chí Nam, lập lịch trình tối ưu và kết nối trải nghiệm bản địa đích thực.', 'A smarter way to explore Vietnam. Discover the country from north to south, plan your trip, and connect with authentic local experiences.')}
            </p>
          </div>

          <div>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '12px' }}>{text('Khám phá', 'Explore')}</h2>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.875rem' }}>
              <li><button type="button" className="btn-subtle" onClick={() => onNavigate('Khám phá')}>{text('Điểm đến nổi bật', 'Featured destinations')}</button></li>
              <li><button type="button" className="btn-subtle" onClick={() => onNavigate('Bản đồ')}>{text('Bản đồ du lịch', 'Travel map')}</button></li>
              <li><button type="button" className="btn-subtle" onClick={() => onNavigate('Bộ sưu tập')}>{text('Bộ sưu tập', 'Collections')}</button></li>
              <li><button type="button" className="btn-subtle" onClick={() => onNavigate('Chuyến đi')}>{text('Lập lịch trình', 'Plan a trip')}</button></li>
            </ul>
          </div>

          <div>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '12px' }}>{text('Dành cho đối tác', 'For partners')}</h2>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.875rem' }}>
              <li><button type="button" className="btn-subtle" onClick={() => onNavigate('Tài khoản')}>{text('Tài khoản của bạn', 'Your account')}</button></li>
              {(isBusiness || isAdmin) && <li><button type="button" className="btn-subtle" onClick={() => onNavigate('Doanh nghiệp')}>{text('Cổng thông tin doanh nghiệp', 'Business portal')}</button></li>}
              {isAdmin && <li><button type="button" className="btn-subtle" onClick={() => onNavigate('Quản trị')}>{text('Quản trị hệ thống', 'System administration')}</button></li>}
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
          <span>© 2026 SmartTravel VN. {text('Bản quyền thuộc về Đồ án Tốt nghiệp UIT.', 'UIT Graduation Project.')}</span>
          <details className="photo-credits"><summary>{text('Nguồn ảnh và giấy phép', 'Photo credits and licenses')}</summary><ul>
            <li><a href="https://commons.wikimedia.org/wiki/File:Tam_Coc_Panorama_(8604887215).jpg" target="_blank" rel="noreferrer">Tam Cốc: Jean-Marc Astesana</a> (<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC BY-SA 2.0</a>)</li>
            <li><a href="https://commons.wikimedia.org/wiki/File:Boats_with_lanterns_on_the_Thu_Bon_river_IMG_3864.jpg" target="_blank" rel="noreferrer">Hội An: Kuroczynski</a> (<a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>)</li>
            <li><a href="https://commons.wikimedia.org/wiki/File:Ha_Long_Bay,_Vietnam,_Islands.jpg" target="_blank" rel="noreferrer">Hạ Long: Vyacheslav Argenberg</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)</li>
            <li><a href="https://commons.wikimedia.org/wiki/File:Hanoi,_Vietnam,_Hoan_Kiem_Lake.jpg" target="_blank" rel="noreferrer">Hà Nội: Vyacheslav Argenberg</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)</li>
            <li><a href="https://commons.wikimedia.org/wiki/File:Da_Lat_-_Xuan_Huong_Lake.jpg" target="_blank" rel="noreferrer">Đà Lạt: P. Hughes</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)</li>
            <li><a href="https://commons.wikimedia.org/wiki/File:My_Khe_Beach_Da_Nang.jpg" target="_blank" rel="noreferrer">Đà Nẵng: Dragfyre</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>)</li>
            <li><a href="https://commons.wikimedia.org/wiki/File:Vietnam,_Hue,_Imperial_City_of_Hue,_Gate.jpg" target="_blank" rel="noreferrer">Huế: Vyacheslav Argenberg</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)</li>
            <li><a href="https://commons.wikimedia.org/wiki/File:Marble_Mountains,_Vietnam.jpg" target="_blank" rel="noreferrer">Ngũ Hành Sơn: Bernard Gagnon</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>)</li>
            <li><a href="https://commons.wikimedia.org/wiki/File:Ho_Chi_Minh_City_-_Independence_Palace.jpg" target="_blank" rel="noreferrer">TP. Hồ Chí Minh: P. Hughes</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)</li>
          </ul><p>{text('Ảnh được đổi sang WebP, thu nhỏ và cắt khung khi hiển thị. Giấy phép ảnh giữ nguyên.', 'Images are resized, converted to WebP, and cropped for display. Original licenses remain in effect.')}</p></details>
        </div>
      </div>
    </footer>
  );
}
