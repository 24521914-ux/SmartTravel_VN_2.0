import { useEffect, useMemo, useRef, useState } from 'react';
import type { Resource, TravelClient } from '../../shared/api';
import { EmptyState, ErrorState, Icon } from '../../shared/ui';
import { useAuth } from '../../app/providers/AuthProvider';
import { useToast } from '../../app/providers/ToastProvider';
import { useAppPreferences } from '../../app/providers/AppPreferences';
import { InteractiveMap, validCoordinates, type MapPoint } from '../places/InteractiveMap';
import { PlaceDetailPage } from '../places/PlaceDetailPage';
import { placeIdOf } from '../places/media';
import { loadOpenDataPlaces, mergeCatalogWithOpenData } from '../places/osmCatalog';
import { AddToTripModal } from './AddToTripModal';
import { RecommendationCard } from './RecommendationCard';
import { RecommendationFilters } from './RecommendationFilters';
import {
  INITIAL_FILTERS,
  assessSpaceReliability,
  buildLocationOptions,
  rankAndFilterPlaces,
  type RecommendationFilterState,
} from './recommendation-engine';
import './recommendations.css';

export interface RecommendationSectionProps {
  travel: TravelClient;
  onNavigate: (section: string) => void;
  busy?: boolean;
}

export function RecommendationSection({
  travel,
  onNavigate,
  busy = false,
}: RecommendationSectionProps) {
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const { locale, text } = useAppPreferences();

  const [places, setPlaces] = useState<Resource[]>([]);
  const [categories, setCategories] = useState<Resource[]>([]);
  const [tags, setTags] = useState<Resource[]>([]);
  const [amenities, setAmenities] = useState<Resource[]>([]);
  const [geographicUnits, setGeographicUnits] = useState<Resource[]>([]);
  const [destinations, setDestinations] = useState<Resource[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<RecommendationFilterState>(INITIAL_FILTERS);
  const [showMap, setShowMap] = useState(false);
  const [highlightedPlaceId, setHighlightedPlaceId] = useState('');

  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Resource | null>(null);
  const [tripTargetPlace, setTripTargetPlace] = useState<Resource | null>(null);

  const requestSeq = useRef(0);

  async function loadCatalog() {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError('');
    try {
      const [placesRes, catsRes, tagsRes, amenitiesRes, geoRes, destRes, openDataRes] = await Promise.all([
        travel.readAll('catalog', '/places'),
        travel.readAll('catalog', '/categories').catch(() => ({ items: [] as Resource[] })),
        travel.readAll('catalog', '/tags').catch(() => ({ items: [] as Resource[] })),
        travel.readAll('catalog', '/amenities').catch(() => ({ items: [] as Resource[] })),
        travel.readAll('catalog', '/geographic-units').catch(() => ({ items: [] as Resource[] })),
        travel.readAll('catalog', '/destinations').catch(() => ({ items: [] as Resource[] })),
        loadOpenDataPlaces(),
      ]);
      if (seq !== requestSeq.current) return;
      const merged = mergeCatalogWithOpenData({
        catalogPlaces: placesRes.items ?? [],
        openDataPlaces: openDataRes,
        categories: catsRes.items ?? [],
        geographicUnits: geoRes.items ?? [],
        destinations: destRes.items ?? [],
      });
      setPlaces(merged.places);
      setCategories(merged.categories);
      setTags(tagsRes.items ?? []);
      setAmenities(amenitiesRes.items ?? []);
      setGeographicUnits(merged.geographicUnits);
      setDestinations(merged.destinations);
    } catch (cause) {
      if (seq === requestSeq.current) {
        setError(
          (cause as Error).message ||
            text('Không thể tải dữ liệu địa điểm gợi ý.', 'Unable to load recommendation catalog.'),
        );
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    void loadCatalog();
    return () => {
      requestSeq.current += 1;
    };
  }, [travel]);

  useEffect(() => {
    let active = true;
    setFavoriteIds(new Set());
    setFavoritesLoaded(!isAuthenticated);
    if (isAuthenticated) {
      void travel
        .readAll('community', '/me/favorites')
        .then(data => {
          if (active) {
            setFavoriteIds(new Set(data.items.map(row => String(row.place_id ?? row.id))));
            setFavoritesLoaded(true);
          }
        })
        .catch(() => {
          if (active) {
            setFavoritesLoaded(true);
          }
        });
    }
    return () => {
      active = false;
    };
  }, [travel, isAuthenticated, selectedPlace]);

  const locationOptions = useMemo(
    () => buildLocationOptions(geographicUnits, destinations, places, locale),
    [geographicUnits, destinations, places, locale],
  );

  const spaceReliability = useMemo(
    () => assessSpaceReliability(places, tags),
    [places, tags],
  );

  const rankedPlaces = useMemo(
    () =>
      rankAndFilterPlaces({
        places,
        categories,
        tags,
        amenities,
        geographicUnits,
        destinations,
        filters,
        spaceReliability,
        locale,
        text,
      }),
    [places, categories, tags, amenities, geographicUnits, destinations, filters, spaceReliability, locale, text],
  );

  const mapPoints = useMemo<MapPoint[]>(
    () =>
      rankedPlaces
        .filter(item => validCoordinates(item.place.latitude, item.place.longitude))
        .map(item => ({
          id: item.placeId,
          name: `${item.rank}. ${item.name}`,
          address: item.address,
          latitude: Number(item.place.latitude),
          longitude: Number(item.place.longitude),
        })),
    [rankedPlaces],
  );

  useEffect(() => {
    if (showMap && mapPoints.length && !mapPoints.some(p => p.id === highlightedPlaceId)) {
      setHighlightedPlaceId(mapPoints[0].id);
    }
  }, [showMap, mapPoints, highlightedPlaceId]);

  async function handleToggleFavorite(place: Resource, next: boolean) {
    if (!isAuthenticated) {
      onNavigate('Tài khoản');
      throw new Error('Sign in required');
    }
    const id = placeIdOf(place);
    try {
      await travel.mutate(
        'community',
        `/me/favorites/${encodeURIComponent(id)}`,
        {},
        next ? 'PUT' : 'DELETE',
      );
      setFavoriteIds(prev => {
        const updated = new Set(prev);
        if (next) updated.add(id);
        else updated.delete(id);
        return updated;
      });
      showToast(
        next ? text('Đã lưu địa điểm yêu thích.', 'Saved to favorites.') : text('Đã bỏ lưu địa điểm.', 'Removed from favorites.'),
        'success',
      );
    } catch {
      showToast(text('Chưa lưu được thay đổi yêu thích.', 'Could not update favorite.'), 'error');
      throw new Error('Favorite update failed');
    }
  }

  async function handleSelectPlace(place: Resource) {
    const id = placeIdOf(place);
    if (!id) return;
    if (place.source === 'geofabrik-osm') {
      setSelectedPlace(place);
      return;
    }
    try {
      const detail = await travel.place(id);
      setSelectedPlace({
        ...detail,
        image_url: detail.image_url ?? place.image_url,
        image_author: detail.image_author ?? place.image_author,
        image_license: detail.image_license ?? place.image_license,
        commons_url: detail.commons_url ?? place.commons_url,
      });
    } catch {
      // Fallback to list object if detail endpoint fails transiently
      setSelectedPlace(place);
    }
  }

  if (selectedPlace) {
    return (
      <>
        <PlaceDetailPage
          place={selectedPlace}
          travel={travel}
          onBack={() => setSelectedPlace(null)}
          onAddToTrip={place => setTripTargetPlace(place)}
          busy={busy || loading}
        />
        <AddToTripModal
          place={tripTargetPlace}
          travel={travel}
          onClose={() => setTripTargetPlace(null)}
          onNavigateToAccount={() => onNavigate('Tài khoản')}
          onOpenTrip={() => onNavigate('Chuyến đi')}
        />
      </>
    );
  }

  return (
    <div className="rec-page">
      {/* Editorial Header */}
      <header className="rec-hero-header">
        <div>
          <span className="journey-eyebrow">
            {text('GỢI Ý THEO NHU CẦU', 'PERSONALIZED RECOMMENDATIONS')}
          </span>
          <h2 className="rec-headline">
            {text('Những địa điểm phù hợp nhất,', 'Top destinations')}{' '}
            <em>{text('xếp hạng dành riêng cho bạn.', 'ranked for your trip.')}</em>
          </h2>
          <p className="rec-subheadline">
            {text(
              'Kết quả được lọc theo điều kiện bắt buộc và sắp xếp từ trên xuống theo ưu tiên trải nghiệm, ngân sách và đánh giá cộng đồng.',
              'Results are filtered by your hard requirements and ranked top-down by experience signals, budget fit, and traveler reviews.',
            )}
          </p>
        </div>
      </header>

      {/* Filter Toolbar & Modal */}
      <RecommendationFilters
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(INITIAL_FILTERS)}
        categories={categories}
        locationOptions={locationOptions}
        spaceReliability={spaceReliability}
        showMap={showMap}
        onToggleMap={() => setShowMap(prev => !prev)}
        resultCount={rankedPlaces.length}
        busy={busy || loading}
      />

      {/* Results Header */}
      <div className="rec-results-bar">
        <div className="rec-results-count">
          <Icon name="compass" size={18} />
          <strong>
            {loading
              ? text('Đang tải danh sách gợi ý…', 'Loading recommendations…')
              : text(
                  `Hiển thị ${rankedPlaces.length} địa điểm được xếp hạng`,
                  `Showing ${rankedPlaces.length} ranked places`,
                )}
          </strong>
        </div>
        {filters.experiences.length > 0 && (
          <span className="rec-ranking-hint">
            {text(
              'Đang ưu tiên các địa điểm khớp tín hiệu trải nghiệm lên đầu.',
              'Prioritizing places matching your experience signals.',
            )}
          </span>
        )}
      </div>

      {/* Main Content Area: Grid or Split View with Map */}
      {error ? (
        <ErrorState message={error} onRetry={() => void loadCatalog()} />
      ) : loading ? (
        <div className="rec-skeleton-grid" aria-label={text('Đang tải gợi ý', 'Loading recommendations')}>
          {[0, 1, 2, 3, 4, 5].map(idx => (
            <div key={idx} className="rec-skeleton-card" />
          ))}
        </div>
      ) : rankedPlaces.length === 0 ? (
        <EmptyState
          icon="filter"
          title={text('Không tìm thấy địa điểm khớp bộ lọc', 'No places match your filters')}
          description={text(
            'Thử nới lỏng khoảng ngân sách, giảm ngưỡng đánh giá hoặc xóa bớt tiêu chí lọc.',
            'Try broadening your budget, lowering the star threshold, or clearing some filters.',
          )}
          action={
            <button
              type="button"
              className="btn-primary"
              onClick={() => setFilters(INITIAL_FILTERS)}
            >
              <Icon name="refresh" size={16} />
              {text('Đặt lại toàn bộ bộ lọc', 'Reset all filters')}
            </button>
          }
        />
      ) : (
        <div className={`rec-results-layout ${showMap ? 'with-map' : ''}`}>
          <div className="rec-card-grid">
            {rankedPlaces.map(item => (
              <RecommendationCard
                key={item.placeId}
                item={item}
                isFavorite={favoriteIds.has(item.placeId)}
                favoriteDisabled={!favoritesLoaded}
                isSelectedOnMap={showMap && highlightedPlaceId === item.placeId}
                onToggleFavorite={handleToggleFavorite}
                onSelectPlace={place => void handleSelectPlace(place)}
                onAddToTrip={place => setTripTargetPlace(place)}
                onHighlightOnMap={placeId => {
                  if (showMap) setHighlightedPlaceId(placeId);
                }}
                busy={busy}
              />
            ))}
          </div>

          {showMap && (
            <aside className="rec-map-pane" aria-label={text('Bản đồ địa điểm gợi ý', 'Recommended places map')}>
              <div className="rec-map-sticky">
                <InteractiveMap
                  points={mapPoints}
                  selectedId={highlightedPlaceId}
                  onSelect={id => setHighlightedPlaceId(id)}
                />
              </div>
            </aside>
          )}
        </div>
      )}

      {/* Add To Trip State-Machine Modal */}
      <AddToTripModal
        place={tripTargetPlace}
        travel={travel}
        onClose={() => setTripTargetPlace(null)}
        onNavigateToAccount={() => onNavigate('Tài khoản')}
        onOpenTrip={() => onNavigate('Chuyến đi')}
      />
    </div>
  );
}
