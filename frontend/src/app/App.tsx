import { lazy, Suspense, useState, useEffect, useTransition } from 'react';
import { AuthProvider, ToastProvider, useAuth } from './providers';
import { AppHeader, AppFooter } from './layouts/LayoutShell';
import { ExploreSection } from '../features/places/ExploreSection';
import { travelClient, apiClient } from '../api/session';
import type { Resource } from '../shared/api';
import { isSection, resolveRoute, SECTION_PATHS } from './routes';
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
    <div className="app-container" aria-busy={isPending}>
      <a className="skip-link" href="#main-content">Chuyển đến nội dung chính</a>
      {/* Top Liquid Glass Header Navigation */}
      <AppHeader
        activeSection={activeSection ?? ''}
        onNavigate={handleNavigate}
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
      />

      <main className={`main-content ${activeSection === 'Khám phá' || (activeSection === 'Tài khoản' && !isAuthenticated) ? 'main-content-landing' : ''}`} id="main-content" tabIndex={-1}>
        {activeSection === null && <section className="travel-panel">
          <h1>Không tìm thấy trang</h1>
          <p>Đường dẫn này không tồn tại. Bạn có thể quay lại trang khám phá.</p>
          <button type="button" className="btn-subtle" onClick={() => handleNavigate('Khám phá')}>Về trang khám phá</button>
        </section>}
        {activeSection && activeSection !== 'Khám phá' && (activeSection !== 'Tài khoản' || isAuthenticated) && <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            {activeSection}
          </h1>
        </div>}

        {/* Section View Routing */}
        <Suspense fallback={<p role="status">Đang mở trang...</p>}>
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
          authLoading ? <p role="status">Đang kiểm tra đăng nhập...</p> : !isAuthenticated ? (
            <section className="travel-panel" aria-label="Đăng nhập để xem chuyến đi">
              <h2>Vui lòng đăng nhập để xem chuyến đi</h2>
              <p>Đăng nhập để xem lịch trình đã lưu hoặc tạo chuyến đi mới.</p>
              <button type="button" className="btn-primary" onClick={() => handleNavigate('Tài khoản')}>Đăng nhập</button>
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
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
