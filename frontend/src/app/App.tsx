import { lazy, Suspense, useState, useEffect, useTransition } from 'react';
import { AppPreferencesProvider, AuthProvider, ToastProvider, useAppPreferences, useAuth } from './providers';
import { AppHeader, AppFooter } from './layouts/LayoutShell';
import { ExploreSection } from '../features/places/ExploreSection';
import { Icon } from '../shared/ui/Icon';
import { travelClient, apiClient } from '../api/session';
import type { Resource } from '../shared/api';
import { isSection, resolveRoute, SECTION_PATHS } from './routes';
import '../features/trips/trip-auth-gate.css';
const MapPanel = lazy(() => import('../features/places/MapPanel').then(m => ({ default: m.MapPanel })));
const CollectionsPanel = lazy(() => import('../features/collections/CollectionsPanel').then(m => ({ default: m.CollectionsPanel })));
const TripPlanner = lazy(() => import('../features/trips/TripPlanner').then(m => ({ default: m.TripPlanner })));
const NotificationPanel = lazy(() => import('../features/notifications/NotificationPanel').then(m => ({ default: m.NotificationPanel })));
const AccountPanel = lazy(() => import('../features/account/AccountPanel').then(m => ({ default: m.AccountPanel })));
const BusinessPortal = lazy(() => import('../features/businesses/BusinessPortal').then(m => ({ default: m.BusinessPortal })));
const ModerationConsole = lazy(() => import('../features/moderation/ModerationConsole').then(m => ({ default: m.ModerationConsole })));
const AdminIngestionConsole = lazy(() => import('../features/ingestion/AdminIngestionConsole').then(m => ({ default: m.AdminIngestionConsole })));
const AdminCatalogManager = lazy(() => import('../features/catalog/AdminCatalogManager').then(m => ({ default: m.AdminCatalogManager })));
const ContributionsPanel = lazy(() => import('../features/contributions/ContributionsPanel').then(m => ({ default: m.ContributionsPanel })));
const AdminUsersPanel = lazy(() => import('../features/account/AdminUsersPanel').then(m => ({ default: m.AdminUsersPanel })));
const AdminMediaPanel = lazy(() => import('../features/catalog/AdminMediaPanel').then(m => ({ default: m.AdminMediaPanel })));

export function AppContent() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { text } = useAppPreferences();
  const [activeSection, setActiveSection] = useState(() => resolveRoute(window.location).section);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [suggestedPlace, setSuggestedPlace] = useState<Resource | null>(null);
  const [isPending, startTransition] = useTransition();

  // Read direct links, browser history and legacy hash bookmarks through one resolver.
  useEffect(() => {
    function syncFromUrl() {
      const { section, canonicalUrl } = resolveRoute(window.location);
      if (canonicalUrl && canonicalUrl !== window.location.pathname + window.location.search + window.location.hash) {
        window.history.replaceState(null, '', canonicalUrl);
      }
      setActiveSection(section);
      setIsMenuOpen(false);
    }
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    window.addEventListener('hashchange', syncFromUrl);
    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('hashchange', syncFromUrl);
    };
  }, []);

  function handleNavigate(section: string) {
    if (!isSection(section)) return;
    const path = SECTION_PATHS[section];
    if (window.location.pathname + window.location.search + window.location.hash !== path) {
      window.history.pushState(null, '', path);
    }
    setIsMenuOpen(false);
    startTransition(() => {
      setActiveSection(section);
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }

  return (
    <div className={`app-container ${activeSection === 'Tài khoản' && !isAuthenticated ? 'account-guest-page' : ''}`} aria-busy={isPending}>
      <a className="skip-link" href="#main-content">{text('Chuyển đến nội dung chính', 'Skip to main content')}</a>
      {/* Top Liquid Glass Header Navigation */}
      <AppHeader
        activeSection={activeSection ?? ''}
        onNavigate={handleNavigate}
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
      />

      <main className={`main-content ${activeSection === 'Khám phá' || (activeSection === 'Tài khoản' && !isAuthenticated) ? 'main-content-landing' : ''}`} id="main-content" tabIndex={-1}>
        {activeSection === null && <section className="travel-panel">
          <h1>{text('Không tìm thấy trang', 'Page not found')}</h1>
          <p>{text('Đường dẫn này không tồn tại. Bạn có thể quay lại trang khám phá.', 'This page does not exist. You can return to Explore.')}</p>
          <button type="button" className="btn-subtle" onClick={() => handleNavigate('Khám phá')}>{text('Về trang khám phá', 'Back to Explore')}</button>
        </section>}
        {activeSection && activeSection !== 'Khám phá' && (activeSection !== 'Tài khoản' || isAuthenticated) && <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            {text(activeSection, ({ 'Bản đồ': 'Map', 'Bộ sưu tập': 'Collections', 'Chuyến đi': 'Trips', 'Tài khoản': 'Account', 'Thông báo': 'Notifications', 'Đóng góp': 'Contribute', 'Doanh nghiệp': 'Business', 'Kiểm duyệt': 'Moderation', 'Quản trị': 'Administration' } as Record<string, string>)[activeSection] ?? activeSection)}
          </h1>
        </div>}

        {/* Section View Routing */}
        <Suspense fallback={<p role="status">{text('Đang mở trang...', 'Opening page...')}</p>}>
        {activeSection === 'Khám phá' && (
          <ExploreSection
            travel={travelClient}
            onNavigate={handleNavigate}
            onNavigateToTrip={place => { setSuggestedPlace(place ?? null); handleNavigate('Chuyến đi'); }}
          />
        )}

        {activeSection === 'Bản đồ' && (
          <MapPanel travel={travelClient} />
        )}

        {activeSection === 'Bộ sưu tập' && (
          <CollectionsPanel travel={travelClient} />
        )}

        {activeSection === 'Chuyến đi' && (
            authLoading ? <p role="status">{text('Đang kiểm tra đăng nhập...', 'Checking your account...')}</p> : !isAuthenticated ? (
            <section className="trip-auth-gate" aria-labelledby="trip-auth-title">
              <div className="trip-auth-login">
                <div className="trip-auth-copy">
                  <p className="trip-auth-eyebrow"><Icon name="compass" size={18} />{text('HÀNH TRÌNH CỦA BẠN', 'YOUR NEXT JOURNEY')}</p>
                  <h2 id="trip-auth-title">{text('Mỗi chuyến đi đáng nhớ bắt đầu từ một kế hoạch.', 'Every memorable trip starts with a plan.')}</h2>
                  <p className="trip-auth-description">{text('Đăng nhập để tạo lịch trình riêng, lưu những điểm muốn ghé và tiếp tục sắp xếp chuyến đi bất cứ lúc nào.', 'Sign in to build an itinerary, save places you want to visit, and keep planning whenever you’re ready.')}</p>
                  <button type="button" className="btn-primary trip-auth-submit" onClick={() => handleNavigate('Tài khoản')}>
                    {text('Đăng nhập để tạo chuyến đi', 'Sign in to plan a trip')}
                    <Icon name="arrow" size={19} />
                  </button>
                  <p className="trip-auth-note"><Icon name="lock" size={15} />{text('Lịch trình được lưu trong tài khoản của bạn.', 'Your itineraries stay saved to your account.')}</p>
                </div>
              </div>
              <article className="trip-auth-visual" aria-labelledby="trip-auth-visual-title">
                <img
                  className="trip-auth-image"
                  src="/images/editorial/ha-long.webp"
                  alt={text('Các đảo đá vôi trên mặt nước xanh ở Vịnh Hạ Long.', 'Limestone islands rising from the water in Ha Long Bay.')}
                  width={1600}
                  height={1067}
                  loading="eager"
                  decoding="async"
                />
                <div className="trip-auth-image-shade" aria-hidden="true" />
                <div className="trip-auth-visual-top">
                  <span className="trip-auth-location"><Icon name="pin" size={16} />{text('Vịnh Hạ Long · Việt Nam', 'Ha Long Bay · Vietnam')}</span>
                  <span className="trip-auth-photo-label">{text('CẢM HỨNG DU LỊCH', 'TRAVEL INSPIRATION')}</span>
                </div>
                <div className="trip-auth-visual-copy">
                  <p>{text('ĐIỀU GÌ ĐANG GỌI BẠN LÊN ĐƯỜNG?', 'WHERE WILL THE ROAD TAKE YOU?')}</p>
                  <h3 id="trip-auth-visual-title">{text('Một nơi mới. Một câu chuyện của riêng bạn.', 'A new place. A story of your own.')}</h3>
                  <span>{text('Gom những điểm muốn đến thành hành trình mang dấu ấn riêng.', 'Bring the places you want to see together in a journey that feels like yours.')}</span>
                </div>
              </article>
            </section>
          ) : <TripPlanner key={user?.user_id} travel={travelClient} suggestedPlace={suggestedPlace} />
        )}

        {activeSection === 'Thông báo' && (
          <NotificationPanel travel={travelClient} />
        )}

        {activeSection === 'Tài khoản' && (
          <AccountPanel />
        )}

        {activeSection === 'Doanh nghiệp' && (
          <BusinessPortal travel={travelClient} />
        )}

        {activeSection === 'Kiểm duyệt' && (
          <ModerationConsole travel={travelClient} />
        )}

        {activeSection === 'Quản trị' && (
          <><AdminIngestionConsole travel={travelClient} /><AdminCatalogManager travel={travelClient} /><AdminMediaPanel apiClient={apiClient} /><AdminUsersPanel travel={travelClient} /></>
        )}
        {activeSection === 'Đóng góp' && <ContributionsPanel travel={travelClient} />}
        </Suspense>
      </main>

      {/* Global Footer */}
      <AppFooter onNavigate={handleNavigate} />
    </div>
  );
}

export default function App() {
  return (
    <AppPreferencesProvider>
      <AuthProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </AppPreferencesProvider>
  );
}
