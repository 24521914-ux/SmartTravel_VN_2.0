import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppPreferences } from '../../app/providers/AppPreferences';
import type { Resource } from '../../shared/api';
import { Icon } from '../../shared/ui';
import { searchAddress, type GeocodedPlace } from '../places/geocoding';
import {
  BUDGET_TIER_OPTIONS,
  COMPANION_OPTIONS,
  EXPERIENCE_OPTIONS,
  MIN_RATING_OPTIONS,
  RADIUS_OPTIONS_KM,
  VISIT_TIME_SLOTS,
  localizedName,
  normalizeText,
  type BudgetTier,
  type CompanionType,
  type ExperienceKey,
  type LocationOption,
  type MinRatingOption,
  type RecommendationFilterState,
  type SpaceReliability,
  type SpaceType,
  type VisitTimeSlot,
} from './recommendation-engine';

const SLIDER_MAX_VND = 2_000_000;
const SLIDER_STEP_VND = 50_000;

interface RecommendationFiltersProps {
  filters: RecommendationFilterState;
  budgetBasis?: 'PER_PERSON' | 'PER_VISIT' | 'OFFERING';
  onBudgetBasisChange?: (basis: 'PER_PERSON' | 'PER_VISIT' | 'OFFERING') => void;
  categories: Resource[];
  locationOptions: LocationOption[];
  spaceReliability: SpaceReliability;
  showMap: boolean;
  totalCount: number;
  catalogLoading?: boolean;
  catalogError?: string;
  onToggleMap: () => void;
  onChange: (next: RecommendationFilterState) => void;
  onReset: () => void;
  onSearchSubmit?: () => void;
  externalModalOpen?: boolean;
  onExternalModalOpenChange?: (open: boolean) => void;
}

export function RecommendationFilters({
  filters,
  budgetBasis = 'PER_PERSON',
  onBudgetBasisChange,
  categories,
  locationOptions,
  spaceReliability,
  showMap,
  totalCount,
  catalogLoading = false,
  catalogError = '',
  onToggleMap,
  onChange,
  onReset,
  onSearchSubmit,
  externalModalOpen,
  onExternalModalOpenChange,
}: RecommendationFiltersProps) {
  const { locale, text, formatCurrency } = useAppPreferences();
  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const modalOpen = externalModalOpen ?? internalModalOpen;
  const setModalOpen = (next: boolean) => {
    setInternalModalOpen(next);
    onExternalModalOpenChange?.(next);
  };

  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const [mobileGroupsOpen, setMobileGroupsOpen] = useState(false);
  const locationBoxRef = useRef<HTMLDivElement>(null);

  // Origin search state inside advanced filter drawer
  const [originQuery, setOriginQuery] = useState('');
  const [originSuggestions, setOriginSuggestions] = useState<GeocodedPlace[]>([]);
  const [originLoading, setOriginLoading] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState('');

  // Close location dropdown on outside click
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (locationBoxRef.current && !locationBoxRef.current.contains(event.target as Node)) {
        setLocationDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Close drawer on Esc
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  // Debounced geocoding for custom origin address
  useEffect(() => {
    if (!modalOpen) return;
    const trimmed = originQuery.trim();
    if (trimmed.length < 3) {
      setOriginSuggestions([]);
      setOriginLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setOriginLoading(true);
      try {
        const results = await searchAddress(trimmed);
        if (!cancelled) setOriginSuggestions(results);
      } catch {
        if (!cancelled) setOriginSuggestions([]);
      } finally {
        if (!cancelled) setOriginLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [originQuery, modalOpen]);

  const filteredLocations = useMemo(() => {
    const q = normalizeText(filters.locationQuery);
    if (!q) return locationOptions.slice(0, 10);
    return locationOptions
      .filter(opt => opt.searchText.includes(q))
      .slice(0, 10);
  }, [filters.locationQuery, locationOptions]);

  const selectedLocationOption = useMemo(
    () =>
      locationOptions.find(
        opt =>
          (opt.kind === 'geo' && opt.id === filters.geographicUnitId) ||
          (opt.kind === 'destination' && opt.id === filters.destinationId),
      ) ?? null,
    [locationOptions, filters.geographicUnitId, filters.destinationId],
  );

  const advancedFilterCount = useMemo(() => {
    let count = 0;
    if (filters.budgetTier) count += 1;
    if (filters.companion) count += 1;
    if (filters.spaceType && spaceReliability.trusted) count += 1;
    if (filters.minRating) count += 1;
    if (filters.origin) count += 1;
    return count;
  }, [filters, spaceReliability.trusted]);

  const totalActiveFilters = useMemo(() => {
    let count = advancedFilterCount;
    if (filters.locationQuery.trim() || filters.geographicUnitId || filters.destinationId) count += 1;
    if (filters.categoryId) count += 1;
    if (filters.visitTime) count += 1;
    if (filters.minPrice || filters.maxPrice) count += 1;
    count += filters.experiences.length;
    return count;
  }, [advancedFilterCount, filters]);

  const toggleCategory = (id: string) => {
    onChange({
      ...filters,
      categoryId: filters.categoryId === id ? '' : id,
    });
  };

  const toggleExperience = (key: ExperienceKey) => {
    const exists = filters.experiences.includes(key);
    const next = exists
      ? filters.experiences.filter(item => item !== key)
      : [...filters.experiences, key];
    onChange({ ...filters, experiences: next });
  };

  const selectLocation = (opt: LocationOption) => {
    onChange({
      ...filters,
      locationQuery: opt.label,
      geographicUnitId: opt.kind === 'geo' ? opt.id : '',
      destinationId: opt.kind === 'destination' ? opt.id : '',
    });
    setLocationDropdownOpen(false);
  };

  const clearLocation = () => {
    onChange({
      ...filters,
      locationQuery: '',
      geographicUnitId: '',
      destinationId: '',
    });
  };

  const handleSidebarSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocationDropdownOpen(false);
    if (filters.locationQuery.trim() && !filters.destinationId && !filters.geographicUnitId) {
      const q = normalizeText(filters.locationQuery);
      const exact = locationOptions.find(opt => opt.searchText.includes(q));
      if (exact) {
        onChange({
          ...filters,
          locationQuery: exact.label,
          geographicUnitId: exact.kind === 'geo' ? exact.id : '',
          destinationId: exact.kind === 'destination' ? exact.id : '',
        });
      }
    }
    onSearchSubmit?.();
  };

  const handleUseMyLocation = () => {
    setGeoError('');
    if (!navigator.geolocation) {
      setGeoError(text('Trình duyệt không hỗ trợ định vị GPS.', 'Browser does not support geolocation.'));
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGeoBusy(false);
        onChange({
          ...filters,
          origin: {
            label: text('Vị trí hiện tại của bạn', 'Your current location'),
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            source: 'geolocation',
          },
          radiusKm: filters.radiusKm || '5',
        });
      },
      () => {
        setGeoBusy(false);
        setGeoError(text('Không thể lấy vị trí hiện tại. Hãy chọn địa chỉ hoặc tâm thành phố bên dưới.', 'Unable to access current location. Choose an address or city center below.'));
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  const handleUseCityCenter = () => {
    setGeoError('');
    const loc = selectedLocationOption;
    if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      onChange({
        ...filters,
        origin: {
          label: `${text('Tâm', 'Center of')} ${loc.label}`,
          latitude: loc.latitude,
          longitude: loc.longitude,
          source: 'city',
        },
        radiusKm: filters.radiusKm || '5',
      });
      return;
    }
    const fallback = locationOptions.find(opt => typeof opt.latitude === 'number' && typeof opt.longitude === 'number');
    if (fallback && typeof fallback.latitude === 'number' && typeof fallback.longitude === 'number') {
      onChange({
        ...filters,
        origin: {
          label: `${text('Tâm', 'Center of')} ${fallback.label}`,
          latitude: fallback.latitude,
          longitude: fallback.longitude,
          source: 'city',
        },
        radiusKm: filters.radiusKm || '5',
      });
    } else {
      setGeoError(text('Hãy chọn thành phố trước để lấy tâm thành phố.', 'Select a city first to use its center.'));
    }
  };

  // Dual range slider values clamped to [0, SLIDER_MAX_VND]
  const parsedMin = filters.minPrice.trim() ? Number(filters.minPrice) : 0;
  const parsedMax = filters.maxPrice.trim() ? Number(filters.maxPrice) : SLIDER_MAX_VND;
  const sliderMin = Number.isFinite(parsedMin) ? Math.max(0, Math.min(SLIDER_MAX_VND, parsedMin)) : 0;
  const sliderMax = Number.isFinite(parsedMax) ? Math.max(sliderMin, Math.min(SLIDER_MAX_VND, parsedMax)) : SLIDER_MAX_VND;
  const minPercent = (sliderMin / SLIDER_MAX_VND) * 100;
  const maxPercent = (sliderMax / SLIDER_MAX_VND) * 100;

  const minBudgetNum = filters.minPrice.trim() ? Number(filters.minPrice) : null;
  const maxBudgetNum = filters.maxPrice.trim() ? Number(filters.maxPrice) : null;
  const budgetRangeInvalid =
    minBudgetNum !== null &&
    maxBudgetNum !== null &&
    Number.isFinite(minBudgetNum) &&
    Number.isFinite(maxBudgetNum) &&
    minBudgetNum > maxBudgetNum;

  const minSliderDisplay = sliderMin === 0 ? text('0 ₫', '0 VND') : formatCurrency(sliderMin, 'VND');
  const maxSliderDisplay = filters.maxPrice.trim() === '' || sliderMax >= SLIDER_MAX_VND
    ? `${formatCurrency(SLIDER_MAX_VND, 'VND')}+`
    : formatCurrency(sliderMax, 'VND');

  return (
    <aside className="rec-sidebar" id="rec-discovery-bar" aria-label={text('Bộ lọc địa điểm', 'Destination filters')}>
      {/* 1. Search Form (Search destinations input + Visit time select + Blue Search button) */}
      <form className="rec-side-search-form" onSubmit={handleSidebarSearchSubmit}>
        <div className="rec-hero-input-wrap rec-side-input-wrap" ref={locationBoxRef}>
          <input
            type="text"
            className="rec-hero-input"
            value={filters.locationQuery}
            onFocus={() => setLocationDropdownOpen(true)}
            onKeyDown={e => {
              if (e.key === 'Escape') setLocationDropdownOpen(false);
            }}
            onChange={e => {
              // Typing immediately clears canonical IDs so stale IDs never persist
              onChange({
                ...filters,
                locationQuery: e.target.value,
                geographicUnitId: '',
                destinationId: '',
              });
              setLocationDropdownOpen(true);
            }}
            placeholder={text('Tìm điểm đến...', 'Search destinations')}
            aria-label={text('Nhập thành phố hoặc điểm đến', 'Search destinations')}
            autoComplete="off"
          />
          {filters.locationQuery ? (
            <button
              type="button"
              className="rec-inline-clear"
              onClick={clearLocation}
              aria-label={text('Xóa điểm đến', 'Clear location')}
            >
              <Icon name="x" size={14} />
            </button>
          ) : (
            <span className="rec-side-input-chevron" aria-hidden="true">
              <Icon name="chevronDown" size={15} />
            </span>
          )}

          {locationDropdownOpen && (
            <div className="rec-loc-popover" role="listbox" aria-label={text('Điểm đến gợi ý', 'Suggested destinations')}>
              {catalogLoading ? (
                <div className="rec-loc-state">{text('Đang tải danh sách điểm đến…', 'Loading destinations…')}</div>
              ) : catalogError ? (
                <div className="rec-loc-state">{catalogError}</div>
              ) : filteredLocations.length === 0 ? (
                <div className="rec-loc-state">{text('Không tìm thấy địa bàn phù hợp.', 'No matching destination found.')}</div>
              ) : (
                filteredLocations.map(opt => {
                  const isSel =
                    (opt.kind === 'geo' && opt.id === filters.geographicUnitId) ||
                    (opt.kind === 'destination' && opt.id === filters.destinationId);
                  return (
                    <button
                      key={`${opt.kind}-${opt.id}`}
                      type="button"
                      role="option"
                      aria-selected={isSel}
                      className={`rec-loc-option ${isSel ? 'is-selected' : ''}`}
                      onClick={() => selectLocation(opt)}
                    >
                      <Icon name="pin" size={14} />
                      <span className="rec-loc-option-text">
                        <strong>{opt.label}</strong>
                        {opt.countryLabel && <small>{opt.countryLabel}</small>}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="rec-side-select-wrap">
          <select
            className="rec-side-select"
            value={filters.visitTime}
            onChange={e => onChange({ ...filters, visitTime: e.target.value as VisitTimeSlot })}
            aria-label={text('Thời điểm ghé thăm', 'Visit time')}
          >
            {VISIT_TIME_SLOTS.map(slot => (
              <option key={slot.value || 'any'} value={slot.value}>
                {slot.value === ''
                  ? text('Chọn khung giờ ghé thăm', 'Any visit time')
                  : `${locale === 'en' ? slot.en : slot.vi} (${locale === 'en' ? slot.rangeEn : slot.rangeVi})`}
              </option>
            ))}
          </select>
          <span className="rec-side-input-chevron" aria-hidden="true">
            <Icon name="chevronDown" size={15} />
          </span>
        </div>

        <button type="submit" className="rec-side-search-btn">
          <Icon name="search" size={15} />
          <span>{text('Tìm kiếm', 'Search')}</span>
        </button>
      </form>

      {/* Mobile Filter Accordion Trigger */}
      <button
        type="button"
        className="rec-side-mobile-toggle"
        aria-expanded={mobileGroupsOpen}
        onClick={() => setMobileGroupsOpen(prev => !prev)}
      >
        <span>
          <Icon name="filter" size={15} />
          {text('Bộ lọc tiêu chí', 'Filter criteria')}
          {totalActiveFilters > 0 ? ` (${totalActiveFilters})` : ''}
        </span>
        <Icon name={mobileGroupsOpen ? 'chevronUp' : 'chevronDown'} size={16} />
      </button>

      {/* 2. Sidebar Filter Sections */}
      <div className={`rec-side-groups ${mobileGroupsOpen ? 'is-open' : ''}`}>
        {/* Place Types (Checkboxes) */}
        <section className="rec-side-group">
          <h3 className="rec-side-heading">{text('Loại hình', 'Place Types')}</h3>
          <div className="rec-check-list" role="group" aria-label={text('Loại hình địa điểm', 'Place types')}>
            {categories.map(cat => {
              const id = String(cat.category_id ?? cat.id ?? '');
              const label = localizedName(cat, locale);
              const checked = filters.categoryId === id;
              return (
                <label key={id} className="rec-check-row">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCategory(id)}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </section>

        {/* Prices (Dual-Handle Blue Range Slider) */}
        <section className="rec-side-group">
          <h3 className="rec-side-heading">{text('Ngân sách', 'Prices')}</h3>
          <div className="rec-price-readout">
            <span>{minSliderDisplay}</span>
            <span>{maxSliderDisplay}</span>
          </div>
          <div className="rec-dual-range">
            <div className="rec-dual-track" />
            <div
              className="rec-dual-fill"
              style={{ left: `${minPercent}%`, width: `${Math.max(0, maxPercent - minPercent)}%` }}
            />
            <input
              type="range"
              min={0}
              max={SLIDER_MAX_VND}
              step={SLIDER_STEP_VND}
              value={sliderMin}
              aria-label={text('Ngân sách tối thiểu', 'Minimum budget')}
              onChange={e => {
                const nextMin = Math.min(Number(e.target.value), sliderMax);
                onChange({
                  ...filters,
                  budgetTier: '',
                  minPrice: nextMin <= 0 ? '' : String(nextMin),
                });
              }}
            />
            <input
              type="range"
              min={0}
              max={SLIDER_MAX_VND}
              step={SLIDER_STEP_VND}
              value={sliderMax}
              aria-label={text('Ngân sách tối đa', 'Maximum budget')}
              onChange={e => {
                const nextMax = Math.max(Number(e.target.value), sliderMin);
                onChange({
                  ...filters,
                  budgetTier: '',
                  maxPrice: nextMax >= SLIDER_MAX_VND ? '' : String(nextMax),
                });
              }}
            />
          </div>
        </section>

        {/* Experiences (Checkboxes) */}
        <section className="rec-side-group">
          <h3 className="rec-side-heading">{text('Trải nghiệm', 'Experiences')}</h3>
          <div className="rec-check-list" role="group" aria-label={text('Trải nghiệm ưu tiên', 'Preferred experiences')}>
            {EXPERIENCE_OPTIONS.map(exp => {
              const checked = filters.experiences.includes(exp.key);
              return (
                <label key={exp.key} className="rec-check-row">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleExperience(exp.key)}
                  />
                  <span>{locale === 'en' ? exp.en : exp.vi}</span>
                </label>
              );
            })}
          </div>
        </section>

        {/* Utility Controls (Advanced Filters Drawer + Map View + Reset) */}
        <section className="rec-side-utilities">
          <button
            type="button"
            className={`rec-side-util-btn ${advancedFilterCount > 0 ? 'has-active' : ''}`}
            onClick={() => setModalOpen(true)}
            aria-expanded={modalOpen}
          >
            <Icon name="filter" size={14} />
            <span>{text('Bộ lọc nâng cao', 'Advanced filters')}</span>
            {advancedFilterCount > 0 && (
              <span className="rec-util-badge">{advancedFilterCount}</span>
            )}
          </button>

          <button
            type="button"
            className={`rec-side-util-btn ${showMap ? 'is-map-on' : ''}`}
            onClick={onToggleMap}
            aria-pressed={showMap}
          >
            <Icon name="map" size={14} />
            <span>{showMap ? text('Ẩn bản đồ', 'Hide map') : text('Xem bản đồ', 'Map view')}</span>
          </button>

          {totalActiveFilters > 0 && (
            <button
              type="button"
              className="rec-side-reset-link"
              onClick={onReset}
            >
              {text('Xóa tất cả bộ lọc', 'Clear all filters')}
            </button>
          )}
        </section>
      </div>

      {/* Architectural Slide-Over Drawer for Advanced Filters */}
      {modalOpen && (
        <div
          className="rec-drawer-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rec-filter-drawer-title"
          onClick={e => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="rec-drawer-panel">
            <div className="rec-drawer-header">
              <div>
                <span className="rec-drawer-eyebrow">
                  {text('TINH CHỈNH XẾP HẠNG', 'REFINE RANKINGS')}
                </span>
                <h2 id="rec-filter-drawer-title">
                  {text('Bộ lọc chi tiết', 'Detailed filters')}
                </h2>
              </div>
              <button
                type="button"
                className="rec-drawer-close"
                onClick={() => setModalOpen(false)}
                aria-label={text('Đóng bộ lọc', 'Close filters')}
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="rec-drawer-body">
              {/* 1. Budget (Hard constraint per place) */}
              <section className="rec-filter-section">
                <div className="rec-filter-section-head">
                  <h3>{text('Ngân sách tối đa mỗi địa điểm', 'Max budget per place')}</h3>
                  <span className="rec-filter-mode">{text('Lọc bắt buộc', 'Hard filter')}</span>
                </div>
                {onBudgetBasisChange && (
                  <div className="rec-option-grid" role="group" aria-label={text('Đơn vị tính giá', 'Price basis')} style={{ marginBottom: 10 }}>
                    {([
                      ['PER_PERSON', 'VND / người', 'VND / person'],
                      ['PER_VISIT', 'VND / lượt', 'VND / visit'],
                      ['OFFERING', 'Theo dịch vụ', 'Per offering'],
                    ] as const).map(([val, vi, en]) => (
                      <button
                        key={val}
                        type="button"
                        className={`rec-option-btn ${budgetBasis === val ? 'is-active' : ''}`}
                        onClick={() => onBudgetBasisChange(val)}
                        aria-pressed={budgetBasis === val}
                      >
                        {text(vi, en)}
                      </button>
                    ))}
                  </div>
                )}
                <div className="rec-option-grid">
                  {BUDGET_TIER_OPTIONS.map(opt => {
                    const active = filters.budgetTier === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={`rec-option-btn ${active ? 'is-active' : ''}`}
                        onClick={() =>
                          onChange({
                            ...filters,
                            budgetTier: (active ? '' : opt.value) as BudgetTier,
                          })
                        }
                        aria-pressed={active}
                      >
                        {locale === 'en' ? opt.en : opt.vi}
                      </button>
                    );
                  })}
                </div>
                <div className="rec-budget-inputs">
                  <label className="rec-field">
                    <span>{text('Tối thiểu (VND)', 'Min (VND)')}</span>
                    <input
                      type="number"
                      min={0}
                      step={10000}
                      placeholder="0"
                      value={filters.minPrice}
                      onChange={e => onChange({ ...filters, minPrice: e.target.value })}
                    />
                  </label>
                  <label className="rec-field">
                    <span>{text('Tối đa (VND)', 'Max (VND)')}</span>
                    <input
                      type="number"
                      min={0}
                      step={10000}
                      placeholder="500000"
                      value={filters.maxPrice}
                      onChange={e => onChange({ ...filters, maxPrice: e.target.value })}
                    />
                  </label>
                </div>
                {budgetRangeInvalid && (
                  <p className="rec-field-error">
                    {text('Mức tối thiểu đang lớn hơn mức tối đa.', 'Minimum budget cannot exceed maximum budget.')}
                  </p>
                )}
                <p className="rec-filter-hint">
                  {text(
                    'Khi đặt giới hạn ngân sách, địa điểm chưa có thông tin giá sẽ bị loại để đảm bảo điều kiện bắt buộc (không coi là miễn phí).',
                    'When a budget limit is set, places with unknown prices are excluded rather than treated as free.',
                  )}
                </p>
              </section>

              {/* 2. Visit time */}
              <section className="rec-filter-section">
                <div className="rec-filter-section-head">
                  <h3>{text('Thời điểm ghé thăm', 'Visit time')}</h3>
                  <span className="rec-filter-mode">{text('Lọc theo giờ mở cửa', 'Opening hours')}</span>
                </div>
                <div className="rec-option-grid">
                  {VISIT_TIME_SLOTS.map(slot => {
                    const active = filters.visitTime === slot.value;
                    return (
                      <button
                        key={slot.value}
                        type="button"
                        className={`rec-option-btn ${active ? 'is-active' : ''}`}
                        onClick={() =>
                          onChange({
                            ...filters,
                            visitTime: (active ? '' : slot.value) as VisitTimeSlot,
                          })
                        }
                        aria-pressed={active}
                      >
                        <Icon name="clock" size={14} />
                        <span>{locale === 'en' ? slot.en : slot.vi}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 3. Companion */}
              <section className="rec-filter-section">
                <div className="rec-filter-section-head">
                  <h3>{text('Đi cùng ai', 'Travel companion')}</h3>
                  <span className="rec-filter-mode">{text('Ưu tiên xếp hạng', 'Ranking signal')}</span>
                </div>
                <div className="rec-option-grid">
                  {COMPANION_OPTIONS.map(opt => {
                    const active = filters.companion === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={`rec-option-btn ${active ? 'is-active' : ''}`}
                        onClick={() =>
                          onChange({
                            ...filters,
                            companion: (active ? '' : opt.value) as CompanionType,
                          })
                        }
                        aria-pressed={active}
                      >
                        <Icon name="users" size={14} />
                        <span>{locale === 'en' ? opt.en : opt.vi}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 4. Indoor / Outdoor (only when reliable) */}
              {spaceReliability.trusted && (
                <section className="rec-filter-section">
                  <div className="rec-filter-section-head">
                    <h3>{text('Không gian', 'Space')}</h3>
                    <span className="rec-filter-mode">{text('Lọc cứng', 'Hard filter')}</span>
                  </div>
                  <div className="rec-option-grid">
                    {([
                      { value: 'INDOOR', vi: 'Trong nhà', en: 'Indoor' },
                      { value: 'OUTDOOR', vi: 'Ngoài trời', en: 'Outdoor' },
                    ] as const).map(opt => {
                      const active = filters.spaceType === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className={`rec-option-btn ${active ? 'is-active' : ''}`}
                          onClick={() =>
                            onChange({
                              ...filters,
                              spaceType: (active ? '' : opt.value) as SpaceType,
                            })
                          }
                          aria-pressed={active}
                        >
                          <Icon name={opt.value === 'INDOOR' ? 'indoor' : 'sun'} size={14} />
                          <span>{locale === 'en' ? opt.en : opt.vi}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* 5. Minimum rating */}
              <section className="rec-filter-section">
                <div className="rec-filter-section-head">
                  <h3>{text('Đánh giá tối thiểu', 'Minimum rating')}</h3>
                  <span className="rec-filter-mode">{text('Lọc cứng', 'Hard filter')}</span>
                </div>
                <div className="rec-option-grid rec-option-grid-rating">
                  {MIN_RATING_OPTIONS.map(opt => {
                    const active = filters.minRating === opt.value;
                    return (
                      <button
                        key={opt.value || 'any'}
                        type="button"
                        className={`rec-option-btn ${active ? 'is-active' : ''}`}
                        onClick={() => onChange({ ...filters, minRating: opt.value as MinRatingOption })}
                        aria-pressed={active}
                      >
                        {opt.value && <Icon name="star" size={13} />}
                        <span>{locale === 'en' ? opt.en : opt.vi}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 6. Distance from origin */}
              <section className="rec-filter-section">
                <div className="rec-filter-section-head">
                  <h3>{text('Khoảng cách từ điểm xuất phát', 'Distance from origin')}</h3>
                  <span className="rec-filter-mode">{text('Lọc bán kính', 'Radius filter')}</span>
                </div>

                <div className="rec-origin-actions">
                  <button
                    type="button"
                    className="rec-option-btn"
                    onClick={handleUseMyLocation}
                    disabled={geoBusy}
                  >
                    <Icon name="crosshair" size={14} />
                    <span>{geoBusy ? text('Đang định vị...', 'Locating...') : text('Vị trí của tôi', 'My location')}</span>
                  </button>
                  <button
                    type="button"
                    className="rec-option-btn"
                    onClick={handleUseCityCenter}
                  >
                    <Icon name="compass" size={14} />
                    <span>{text('Tâm thành phố', 'City center')}</span>
                  </button>
                </div>

                <div className="rec-origin-search">
                  <input
                    type="text"
                    placeholder={text('Nhập địa chỉ xuất phát (vd: Bến Thành, Hồ Hoàn Kiếm...)', 'Enter starting address...')}
                    value={originQuery}
                    onChange={e => setOriginQuery(e.target.value)}
                    aria-label={text('Địa chỉ xuất phát', 'Origin address')}
                  />
                  {originLoading && (
                    <span className="rec-origin-loading">{text('Đang tìm...', 'Searching...')}</span>
                  )}
                </div>

                {originSuggestions.length > 0 && (
                  <div className="rec-origin-suggestions">
                    {originSuggestions.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        className="rec-origin-suggestion"
                        onClick={() => {
                          onChange({
                            ...filters,
                            origin: {
                              label: item.address || item.name,
                              latitude: item.latitude,
                              longitude: item.longitude,
                              source: 'geocoder',
                            },
                            radiusKm: filters.radiusKm || '5',
                          });
                          setOriginQuery(item.address || item.name);
                          setOriginSuggestions([]);
                        }}
                      >
                        <Icon name="pin" size={13} />
                        <span>{item.address || item.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {geoError && <p className="rec-field-error">{geoError}</p>}

                {filters.origin && (
                  <div className="rec-origin-active">
                    <div className="rec-origin-active-row">
                      <span>
                        <Icon name="pin" size={14} /> {filters.origin.label}
                      </span>
                      <button
                        type="button"
                        className="rec-origin-clear"
                        onClick={() => onChange({ ...filters, origin: null, radiusKm: '' })}
                      >
                        {text('Bỏ mốc', 'Clear')}
                      </button>
                    </div>
                    <div className="rec-radius-row" role="group" aria-label={text('Bán kính tìm kiếm', 'Search radius')}>
                      {RADIUS_OPTIONS_KM.map(km => (
                        <button
                          key={km}
                          type="button"
                          className={`rec-option-btn rec-radius-btn ${(filters.radiusKm || '5') === km ? 'is-active' : ''}`}
                          onClick={() => onChange({ ...filters, radiusKm: km })}
                          aria-pressed={(filters.radiusKm || '5') === km}
                        >
                          {km} km
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="rec-drawer-footer">
              <button
                type="button"
                className="rec-btn-secondary"
                onClick={() => {
                  onReset();
                  setOriginQuery('');
                  setOriginSuggestions([]);
                  setGeoError('');
                }}
              >
                {text('Đặt lại bộ lọc', 'Reset all')}
              </button>
              <button
                type="button"
                className="rec-btn-primary"
                onClick={() => setModalOpen(false)}
                disabled={budgetRangeInvalid}
              >
                {text(`Xem ${totalCount} địa điểm`, `Show ${totalCount} places`)}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
