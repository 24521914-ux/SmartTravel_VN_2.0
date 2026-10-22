import { lazy, Suspense, useState, useEffect, useTransition } from 'react';
import { AuthProvider, ToastProvider } from './providers';
import { AppHeader, AppFooter } from './layouts/LayoutShell';
import { ExploreSection } from '../features/places/ExploreSection';
import { ApiClient, TravelClient, browserTokenStore } from '../shared/api';

const tokenStore = browserTokenStore();
const apiClient = new ApiClient({ tokenStore });
const travelClient = new TravelClient(apiClient);
const MapPanel = lazy(() => import('../features/places/MapPanel').then(m => ({ default: m.MapPanel })));
const CollectionsPanel = lazy(() => import('../features/collections/CollectionsPanel').then(m => ({ default: m.CollectionsPanel })));
const TripPlanner = lazy(() => import('../features/trips/TripPlanner').then(m => ({ default: m.TripPlanner })));
const NotificationPanel = lazy(() => import('../features/notifications/NotificationPanel').then(m => ({ default: m.NotificationPanel })));
const AccountPanel = lazy(() => import('../features/account/AccountPanel').then(m => ({ default: m.AccountPanel })));
const BusinessPortal = lazy(() => import('../features/businesses/BusinessPortal').then(m => ({ default: m.BusinessPortal })));
const ModerationConsole = lazy(() => import('../features/moderation/ModerationConsole').then(m => ({ default: m.ModerationConsole })));
const AdminIngestionConsole = lazy(() => import('../features/ingestion/AdminIngestionConsole').then(m => ({ default: m.AdminIngestionConsole })));

export function AppContent() {
  const [activeSection, setActiveSection] = useState<string>('Khám phá');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // URL hash / path synchronization
  useEffect(() => {
    function syncFromUrl() {
      const hash = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
      const validSections = ['Khám phá', 'Bản đồ', 'Bộ sưu tập', 'Chuyến đi', 'Thông báo', 'Tài khoản', 'Doanh nghiệp', 'Kiểm duyệt', 'Quản trị'];
      if (validSections.includes(hash)) {
        setActiveSection(hash);
      }
    }
    syncFromUrl();
    window.addEventListener('hashchange', syncFromUrl);
    return () => window.removeEventListener('hashchange', syncFromUrl);
  }, []);

  function handleNavigate(section: string) {
    startTransition(() => {
      setActiveSection(section);
      window.location.hash = `#/${encodeURIComponent(section)}`;
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }

  return (
    <div className="app-container" aria-busy={isPending}>
      <a className="skip-link" href="#main-content">Chuyển đến nội dung chính</a>
      {/* Top Liquid Glass Header Navigation */}
      <AppHeader
        activeSection={activeSection}
        onNavigate={handleNavigate}
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
      />

      <main className={`main-content ${activeSection === 'Khám phá' ? 'main-content-landing' : ''}`} id="main-content" tabIndex={-1}>
        {activeSection !== 'Khám phá' && <div style={{ marginBottom: '24px' }}>
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
            onNavigateToTrip={() => handleNavigate('Chuyến đi')}
          />
        )}

        {activeSection === 'Bản đồ' && (
          <MapPanel travel={travelClient} />
        )}

        {activeSection === 'Bộ sưu tập' && (
          <CollectionsPanel travel={travelClient} />
        )}

        {activeSection === 'Chuyến đi' && (
          <TripPlanner travel={travelClient} />
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
          <AdminIngestionConsole travel={travelClient} />
        )}
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
