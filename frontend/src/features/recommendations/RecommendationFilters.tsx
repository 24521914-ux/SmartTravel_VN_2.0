import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Resource } from '../../shared/api';
import { Icon, Modal } from '../../shared/ui';
import { useAppPreferences } from '../../app/providers/AppPreferences';
import { searchAddress, type GeocodedPlace } from '../places/geocoding';
import {
  BUDGET_TIER_OPTIONS,
  COMPANION_OPTIONS,
  EXPERIENCE_OPTIONS,
  MIN_RATING_OPTIONS,
  RADIUS_OPTIONS_KM,
  VISIT_TIME_SLOTS,
  isTestFixture,
  localizedName,
  normalizeText,
  type ExperienceKey,
  type LocationOption,
  type RecommendationFilterState,
  type SpaceReliability,
} from './recommendation-engine';

export interface RecommendationFiltersProps {
  filters: RecommendationFilterState;
  onChange: (next: RecommendationFilterState) => void;
  onReset: () => void;
  categories: Resource[];
  locationOptions: LocationOption[];
  spaceReliability: SpaceReliability;
  showMap: boolean;
  onToggleMap: () => void;
  resultCount: number;
  busy?: boolean;
}

function categoryIconName(name: string): string {
  const norm = normalizeText(name);
  if (/ca phe|cafe|coffee|tra/.test(norm)) return 'coffee';
  if (/nha hang|am thuc|an/.test(norm)) return 'food';
  if (/khach san|luu tru/.test(norm)) return 'building';
  if (/bao tang|van hoa|di san/.test(norm)) return 'layers';
  if (/bien|dao/.test(norm)) return 'waves';
  if (/thien nhien|sinh thai|nui/.test(norm)) return 'leaf';
  return 'compass';
}

export function RecommendationFilters({
  filters,
  onChange,
  onReset,
  categories,
  locationOptions,
  spaceReliability,
  showMap,
  onToggleMap,
  resultCount,
  busy = false,
}: RecommendationFiltersProps) {
  const { locale, text } = useAppPreferences();
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<RecommendationFilterState>(filters);
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const locationBoxRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // Origin geocoder inside modal
  const [originQuery, setOriginQuery] = useState('');
  const [originResults, setOriginResults] = useState<GeocodedPlace[]>([]);
  const [originSearching, setOriginSearching] = useState(false);
  const [originError, setOriginError] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);

  useEffect(() => {
    setDraft(filters);
  }, [filters, modalOpen]);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!locationBoxRef.current?.contains(event.target as Node)) {
        setLocationDropdownOpen(false);
      }
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, []);

  const cleanCategories = useMemo(
    () => categories.filter(c => c.name && (c.category_id ?? c.id) && !isTestFixture(c)),
    [categories],
  );

  const filteredLocationOptions = useMemo(() => {
    const q = normalizeText(filters.locationQuery);
    if (!q) return locationOptions.slice(0, 25);
    return locationOptions.filter(opt => opt.searchText.includes(q)).slice(0, 25);
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

  const modalOriginCityOption = useMemo(
    () =>
      locationOptions.find(
        opt =>
          ((opt.kind === 'geo' && opt.id === draft.geographicUnitId) ||
            (opt.kind === 'destination' && opt.id === draft.destinationId)) &&
          opt.latitude !== undefined &&
          opt.longitude !== undefined,
      ) ?? null,
    [locationOptions, draft.geographicUnitId, draft.destinationId],
  );

  const advancedActiveCount = useMemo(() => {
    let count = 0;
    if (filters.budgetTier || filters.minPrice || filters.maxPrice) count += 1;
    if (filters.visitTime) count += 1;
    if (filters.companion) count += 1;
    if (spaceReliability.trusted && filters.spaceType) count += 1;
    if (filters.minRating) count += 1;
    if (filters.origin && filters.radiusKm) count += 1;
    return count;
  }, [filters, spaceReliability.trusted]);

  const totalActiveCount =
    advancedActiveCount +
    Number(Boolean(filters.locationQuery || filters.geographicUnitId || filters.destinationId)) +
    Number(Boolean(filters.categoryId)) +
    filters.experiences.length;

  function toggleExperience(key: ExperienceKey) {
    const exists = filters.experiences.includes(key);
    onChange({
      ...filters,
      experiences: exists
        ? filters.experiences.filter(item => item !== key)
        : [...filters.experiences, key],
    });
  }

  function handleSelectLocationOption(option: LocationOption) {
    onChange({
      ...filters,
      locationQuery: option.label,
      geographicUnitId: option.kind === 'geo' ? option.id : '',
      destinationId: option.kind === 'destination' ? option.id : '',
    });
    setLocationDropdownOpen(false);
  }

  function clearLocation() {
    onChange({
      ...filters,
      locationQuery: '',
      geographicUnitId: '',
      destinationId: '',
    });
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setOriginError(text('Trình duyệt của bạn không hỗ trợ định vị.', 'Your browser does not support geolocation.'));
      return;
    }
    setGeoBusy(true);
    setOriginError('');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGeoBusy(false);
        setDraft(prev => ({
          ...prev,
          origin: {
            label: text('Vị trí hiện tại của bạn', 'Your current location'),
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            source: 'geolocation',
          },
          radiusKm: prev.radiusKm || '5',
        }));
      },
      () => {
        setGeoBusy(false);
        setOriginError(
          text(
            'Không thể truy cập vị trí hiện tại. Bạn có thể tìm một địa chỉ hoặc điểm mốc bên dưới.',
            'Location permission denied. You can search an address or landmark below.',
          ),
        );
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  async function handleSearchOriginAddress() {
    if (originQuery.trim().length < 3) return;
    setOriginSearching(true);
    setOriginError('');
    setOriginResults([]);
    try {
      const results = await searchAddress(originQuery.trim());
      setOriginResults(results);
      if (!results.length) {
        setOriginError(text('Không tìm thấy địa chỉ phù hợp. Thử thêm tên quận hoặc thành phố.', 'No matching address found. Try adding district or city.'));
      }
    } catch (cause) {
      setOriginError((cause as Error).message || text('Không tra cứu được địa chỉ.', 'Unable to look up address.'));
    } finally {
      setOriginSearching(false);
    }
  }

  function applyModalFilters() {
    onChange(draft);
    setModalOpen(false);
  }

  function resetDraft() {
    setDraft(prev => ({
      ...prev,
      budgetTier: '',
      minPrice: '',
      maxPrice: '',
      visitTime: '',
      companion: '',
      spaceType: '',
      minRating: '',
      origin: null,
      radiusKm: '',
    }));
    setOriginResults([]);
    setOriginError('');
    setOriginQuery('');
  }

  const activeCategoryName = useMemo(() => {
    if (!filters.categoryId) return '';
    const match = cleanCategories.find(c => String(c.category_id ?? c.id) === filters.categoryId);
    return match ? localizedName(match, locale) : '';
  }, [cleanCategories, filters.categoryId, locale]);

  return (
    <section className="rec-filter-shell" aria-label={text('Bộ lọc gợi ý điểm đến', 'Recommendation filters')}>
      {/* Top Airbnb-style toolbar: City/Country search + Category pills + Filters button + Map toggle */}
      <div className="rec-top-bar">
        <div className="rec-location-box" ref={locationBoxRef}>
          <Icon name="pin" size={18} />
          <div className="rec-location-input-wrap">
            <label htmlFor="rec-city-search" className="sr-only">
              {text('Tìm thành phố, điểm đến kèm quốc gia', 'Search city or destination with country')}
            </label>
            <input
              id="rec-city-search"
              type="search"
              role="combobox"
              aria-expanded={locationDropdownOpen}
              aria-controls={listboxId}
              aria-autocomplete="list"
              placeholder={text(
                'Thành phố / Điểm đến, Quốc gia (vd: Đà Lạt, Việt Nam...)',
                'City / Destination, Country (e.g. Da Lat, Vietnam...)',
              )}
              value={filters.locationQuery}
              onFocus={() => setLocationDropdownOpen(true)}
              onChange={e => {
                onChange({
                  ...filters,
                  locationQuery: e.target.value,
                  geographicUnitId: '',
                  destinationId: '',
                });
                setLocationDropdownOpen(true);
              }}
              disabled={busy}
            />
            {(filters.locationQuery || selectedLocationOption) && (
              <button
                type="button"
                className="rec-clear-inline"
                aria-label={text('Xóa điểm đến đang chọn', 'Clear destination')}
                onClick={clearLocation}
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>

          {locationDropdownOpen && filteredLocationOptions.length > 0 && (
            <div className="rec-location-popover" id={listboxId} role="listbox">
              <div className="rec-location-popover-head">
                {text('Thành phố & Điểm đến gợi ý', 'Suggested cities & destinations')}
              </div>
              {filteredLocationOptions.map(option => {
                const isSelected =
                  (option.kind === 'geo' && option.id === filters.geographicUnitId) ||
                  (option.kind === 'destination' && option.id === filters.destinationId);
                return (
                  <button
                    key={`${option.kind}-${option.id}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`rec-location-option ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => handleSelectLocationOption(option)}
                  >
                    <Icon name={option.kind === 'geo' ? 'pin' : 'compass'} size={16} />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.kind === 'geo' ? text('Thành phố / Tỉnh', 'City / Province') : text('Khu vực du lịch', 'Travel area')}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rec-top-actions">
          <button
            type="button"
            className={`rec-filters-btn ${advancedActiveCount > 0 ? 'has-active' : ''}`}
            onClick={() => setModalOpen(true)}
            aria-haspopup="dialog"
          >
            <Icon name="filter" size={18} />
            <span>{text('Bộ lọc', 'Filters')}</span>
            {advancedActiveCount > 0 && <span className="rec-filter-badge">{advancedActiveCount}</span>}
          </button>

          <button
            type="button"
            className={`rec-map-toggle ${showMap ? 'is-active' : ''}`}
            aria-pressed={showMap}
            onClick={onToggleMap}
          >
            <Icon name="map" size={18} />
            <span>{showMap ? text('Ẩn bản đồ', 'Hide map') : text('Xem bản đồ', 'Show map')}</span>
          </button>
        </div>
      </div>

      {/* Row 1: Category Hard Filters */}
      <div className="rec-rail-row">
        <span className="rec-rail-label">
          <Icon name="tag" size={15} />
          {text('Loại địa điểm (lọc cứng):', 'Category (filter):')}
        </span>
        <div className="rec-pill-strip" role="group" aria-label={text('Lọc theo loại địa điểm', 'Filter by place category')}>
          <button
            type="button"
            className="rec-pill"
            aria-pressed={!filters.categoryId}
            onClick={() => onChange({ ...filters, categoryId: '' })}
          >
            <Icon name="compass" size={16} />
            <span>{text('Tất cả', 'All')}</span>
          </button>
          {cleanCategories.map(cat => {
            const id = String(cat.category_id ?? cat.id);
            const label = localizedName(cat, locale);
            const pressed = filters.categoryId === id;
            return (
              <button
                key={id}
                type="button"
                className="rec-pill"
                aria-pressed={pressed}
                onClick={() => onChange({ ...filters, categoryId: pressed ? '' : id })}
              >
                <Icon name={categoryIconName(label)} size={16} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 2: Experience Preferences (Soft Ranking Signals) */}
      <div className="rec-rail-row rec-rail-experience">
        <span className="rec-rail-label">
          <Icon name="sparkle" size={15} />
          {text('Ưu tiên trải nghiệm (xếp hạng):', 'Experience priority (ranking):')}
        </span>
        <div className="rec-pill-strip" role="group" aria-label={text('Ưu tiên trải nghiệm khi xếp hạng', 'Prioritize experience preferences')}>
          {EXPERIENCE_OPTIONS.map(exp => {
            const active = filters.experiences.includes(exp.key);
            return (
              <button
                key={exp.key}
                type="button"
                className="rec-pill rec-pill-signal"
                aria-pressed={active}
                onClick={() => toggleExperience(exp.key)}
              >
                <Icon name={exp.icon} size={16} />
                <span>{text(exp.vi, exp.en)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Filter Chips Bar */}
      {totalActiveCount > 0 && (
        <div className="rec-active-strip" aria-label={text('Bộ lọc đang áp dụng', 'Active filters')}>
          <span className="rec-active-summary">
            {text(`${resultCount} địa điểm phù hợp`, `${resultCount} matching places`)}
          </span>
          <div className="rec-active-chips">
            {(filters.locationQuery || selectedLocationOption) && (
              <button type="button" className="rec-active-chip" onClick={clearLocation}>
                <span>{selectedLocationOption?.label ?? filters.locationQuery}</span>
                <Icon name="x" size={13} />
              </button>
            )}
            {activeCategoryName && (
              <button type="button" className="rec-active-chip" onClick={() => onChange({ ...filters, categoryId: '' })}>
                <span>{activeCategoryName}</span>
                <Icon name="x" size={13} />
              </button>
            )}
            {filters.experiences.map(expKey => {
              const exp = EXPERIENCE_OPTIONS.find(e => e.key === expKey);
              if (!exp) return null;
              return (
                <button
                  key={expKey}
                  type="button"
                  className="rec-active-chip is-signal"
                  onClick={() => toggleExperience(expKey)}
                >
                  <span>{text(`Ưu tiên: ${exp.vi}`, `Priority: ${exp.en}`)}</span>
                  <Icon name="x" size={13} />
                </button>
              );
            })}
            {(filters.budgetTier || filters.minPrice || filters.maxPrice) && (
              <button
                type="button"
                className="rec-active-chip"
                onClick={() => onChange({ ...filters, budgetTier: '', minPrice: '', maxPrice: '' })}
              >
                <span>
                  {filters.budgetTier
                    ? text(
                        BUDGET_TIER_OPTIONS.find(b => b.value === filters.budgetTier)?.vi ?? '',
                        BUDGET_TIER_OPTIONS.find(b => b.value === filters.budgetTier)?.en ?? '',
                      )
                    : `${filters.minPrice || '0'}₫ – ${filters.maxPrice || '∞'}₫`}
                </span>
                <Icon name="x" size={13} />
              </button>
            )}
            {filters.visitTime && (
              <button
                type="button"
                className="rec-active-chip"
                onClick={() => onChange({ ...filters, visitTime: '' })}
              >
                <span>
                  {text(
                    VISIT_TIME_SLOTS.find(s => s.value === filters.visitTime)?.vi ?? '',
                    VISIT_TIME_SLOTS.find(s => s.value === filters.visitTime)?.en ?? '',
                  )}
                </span>
                <Icon name="x" size={13} />
              </button>
            )}
            {filters.companion && (
              <button
                type="button"
                className="rec-active-chip is-signal"
                onClick={() => onChange({ ...filters, companion: '' })}
              >
                <span>
                  {text(
                    `Đi cùng: ${COMPANION_OPTIONS.find(c => c.value === filters.companion)?.vi ?? ''}`,
                    `Companion: ${COMPANION_OPTIONS.find(c => c.value === filters.companion)?.en ?? ''}`,
                  )}
                </span>
                <Icon name="x" size={13} />
              </button>
            )}
            {spaceReliability.trusted && filters.spaceType && (
              <button
                type="button"
                className="rec-active-chip"
                onClick={() => onChange({ ...filters, spaceType: '' })}
              >
                <span>
                  {filters.spaceType === 'INDOOR'
                    ? text('Trong nhà', 'Indoor')
                    : filters.spaceType === 'OUTDOOR'
                      ? text('Ngoài trời', 'Outdoor')
                      : text('Trong nhà & ngoài trời', 'Indoor & outdoor')}
                </span>
                <Icon name="x" size={13} />
              </button>
            )}
            {filters.minRating && (
              <button
                type="button"
                className="rec-active-chip"
                onClick={() => onChange({ ...filters, minRating: '' })}
              >
                <span>{filters.minRating}+ ★</span>
                <Icon name="x" size={13} />
              </button>
            )}
            {filters.origin && filters.radiusKm && (
              <button
                type="button"
                className="rec-active-chip"
                onClick={() => onChange({ ...filters, origin: null, radiusKm: '' })}
              >
                <span>{text(`Trong ${filters.radiusKm} km`, `Within ${filters.radiusKm} km`)}</span>
                <Icon name="x" size={13} />
              </button>
            )}
            <button type="button" className="rec-clear-all-btn" onClick={onReset}>
              {text('Xóa tất cả', 'Clear all')}
            </button>
          </div>
        </div>
      )}

      {/* Detailed Filter Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={text('Bộ lọc gợi ý chi tiết', 'Detailed recommendation filters')}
        maxWidth="660px"
      >
        <div className="rec-modal-body">
          {/* 1. Budget */}
          <section className="rec-modal-section">
            <div className="rec-modal-section-head">
              <Icon name="price" size={18} />
              <div>
                <h3>{text('Ngân sách dự kiến', 'Estimated budget')}</h3>
                <p>{text('Chọn mức chi phí nhanh hoặc nhập khoảng giá cụ thể (VND).', 'Pick a budget tier or enter a custom price range (VND).')}</p>
              </div>
            </div>
            <div className="rec-chip-grid">
              {BUDGET_TIER_OPTIONS.map(tier => (
                <button
                  key={tier.value || 'all'}
                  type="button"
                  className="rec-modal-chip"
                  aria-pressed={draft.budgetTier === tier.value && !draft.minPrice && !draft.maxPrice}
                  onClick={() =>
                    setDraft(prev => ({
                      ...prev,
                      budgetTier: tier.value,
                      minPrice: '',
                      maxPrice: '',
                    }))
                  }
                >
                  {text(tier.vi, tier.en)}
                </button>
              ))}
            </div>
            <div className="rec-price-inputs">
              <label>
                {text('Giá tối thiểu (₫)', 'Minimum price (₫)')}
                <input
                  type="number"
                  min={0}
                  step={10000}
                  placeholder="0"
                  value={draft.minPrice}
                  onChange={e =>
                    setDraft(prev => ({ ...prev, budgetTier: '', minPrice: e.target.value }))
                  }
                />
              </label>
              <label>
                {text('Giá tối đa (₫)', 'Maximum price (₫)')}
                <input
                  type="number"
                  min={draft.minPrice || '0'}
                  step={10000}
                  placeholder={text('Không giới hạn', 'No limit')}
                  value={draft.maxPrice}
                  onChange={e =>
                    setDraft(prev => ({ ...prev, budgetTier: '', maxPrice: e.target.value }))
                  }
                />
              </label>
            </div>
          </section>

          {/* 2. Visit time */}
          <section className="rec-modal-section">
            <div className="rec-modal-section-head">
              <Icon name="clock" size={18} />
              <div>
                <h3>{text('Thời gian ghé thăm', 'Visit time')}</h3>
                <p>{text('Đối chiếu với giờ mở cửa của địa điểm (nếu có).', 'Matches against each place’s opening hours when available.')}</p>
              </div>
            </div>
            <div className="rec-chip-grid">
              {VISIT_TIME_SLOTS.map(slot => (
                <button
                  key={slot.value || 'any'}
                  type="button"
                  className="rec-modal-chip"
                  aria-pressed={draft.visitTime === slot.value}
                  onClick={() => setDraft(prev => ({ ...prev, visitTime: slot.value }))}
                >
                  <strong>{text(slot.vi, slot.en)}</strong>
                  {slot.value && <small>{text(slot.rangeVi, slot.rangeEn)}</small>}
                </button>
              ))}
            </div>
          </section>

          {/* 3. Companion (Priority signal) */}
          <section className="rec-modal-section">
            <div className="rec-modal-section-head">
              <Icon name="users" size={18} />
              <div>
                <h3>{text('Người đi cùng (Ưu tiên xếp hạng)', 'Travel companion (Priority signal)')}</h3>
                <p>
                  {text(
                    'Ưu tiên các địa điểm có thẻ/tiện ích phù hợp lên đầu danh sách, không ẩn địa điểm thiếu dữ liệu.',
                    'Boosts places with matching tags/amenities to the top without hiding places missing this tag.',
                  )}
                </p>
              </div>
            </div>
            <div className="rec-chip-grid">
              {COMPANION_OPTIONS.map(option => (
                <button
                  key={option.value || 'any'}
                  type="button"
                  className="rec-modal-chip"
                  aria-pressed={draft.companion === option.value}
                  onClick={() => setDraft(prev => ({ ...prev, companion: option.value }))}
                >
                  {text(option.vi, option.en)}
                </button>
              ))}
            </div>
          </section>

          {/* 4. Indoor / Outdoor (Conditional on data reliability) */}
          <section className="rec-modal-section">
            <div className="rec-modal-section-head">
              <Icon name="indoor" size={18} />
              <div>
                <h3>{text('Không gian: Trong nhà / Ngoài trời', 'Space: Indoor / Outdoor')}</h3>
                <p>
                  {spaceReliability.trusted
                    ? text(
                        `Lọc theo môi trường không gian (${spaceReliability.coveredCount}/${spaceReliability.totalCount} địa điểm có dữ liệu).`,
                        `Filter by indoor/outdoor setting (${spaceReliability.coveredCount}/${spaceReliability.totalCount} places verified).`,
                      )
                    : text(
                        'Chỉ bật khi trường phân loại không gian trong danh mục đủ tin cậy. Hiện dữ liệu chưa đủ độ phủ.',
                        'Enabled only when space metadata is reliably populated. Current catalog lacks sufficient coverage.',
                      )}
                </p>
              </div>
            </div>
            <div className="rec-chip-grid" aria-disabled={!spaceReliability.trusted}>
              {(
                [
                  ['', text('Tất cả', 'All')],
                  ['INDOOR', text('Trong nhà', 'Indoor')],
                  ['OUTDOOR', text('Ngoài trời', 'Outdoor')],
                  ['BOTH', text('Kết hợp cả hai', 'Both')],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value || 'all'}
                  type="button"
                  className="rec-modal-chip"
                  disabled={!spaceReliability.trusted}
                  aria-pressed={spaceReliability.trusted && draft.spaceType === value}
                  onClick={() => setDraft(prev => ({ ...prev, spaceType: value }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* 5. Minimum rating (Unified 5 choices: All, 3.0+, 3.5+, 4.0+, 4.5+) */}
          <section className="rec-modal-section">
            <div className="rec-modal-section-head">
              <Icon name="star" size={18} />
              <div>
                <h3>{text('Đánh giá tối thiểu', 'Minimum rating')}</h3>
                <p>{text('Chỉ hiển thị địa điểm đạt từ ngưỡng sao đã chọn trở lên.', 'Show places meeting or exceeding the chosen star threshold.')}</p>
              </div>
            </div>
            <div className="rec-chip-grid">
              {MIN_RATING_OPTIONS.map(option => (
                <button
                  key={option.value || 'any'}
                  type="button"
                  className="rec-modal-chip"
                  aria-pressed={draft.minRating === option.value}
                  onClick={() => setDraft(prev => ({ ...prev, minRating: option.value }))}
                >
                  {option.value && <Icon name="star" size={14} className="rec-star-accent" />}
                  <span>{text(option.vi, option.en)}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 6. Distance (Only enabled after origin location is selected) */}
          <section className="rec-modal-section">
            <div className="rec-modal-section-head">
              <Icon name="route" size={18} />
              <div>
                <h3>{text('Khoảng cách từ vị trí xuất phát', 'Distance from starting point')}</h3>
                <p>
                  {text(
                    'Chọn vị trí xuất phát trước (GPS, địa chỉ hoặc tâm thành phố) để bật bộ lọc bán kính.',
                    'Choose a starting point first (GPS, address, or city center) to enable radius filtering.',
                  )}
                </p>
              </div>
            </div>

            <div className="rec-origin-picker">
              <div className="rec-origin-buttons">
                <button
                  type="button"
                  className="btn-secondary btn-size-sm"
                  onClick={handleUseMyLocation}
                  disabled={geoBusy}
                >
                  <Icon name="crosshair" size={15} />
                  {geoBusy ? text('Đang lấy vị trí…', 'Locating…') : text('Vị trí hiện tại của tôi', 'Use my location')}
                </button>
                {modalOriginCityOption && (
                  <button
                    type="button"
                    className="btn-secondary btn-size-sm"
                    onClick={() =>
                      setDraft(prev => ({
                        ...prev,
                        origin: {
                          label: modalOriginCityOption.label,
                          latitude: modalOriginCityOption.latitude!,
                          longitude: modalOriginCityOption.longitude!,
                          source: 'city',
                        },
                        radiusKm: prev.radiusKm || '10',
                      }))
                    }
                  >
                    <Icon name="pin" size={15} />
                    {text(`Tâm ${modalOriginCityOption.label}`, `Center of ${modalOriginCityOption.label}`)}
                  </button>
                )}
              </div>

              <div className="rec-origin-search">
                <input
                  type="search"
                  aria-label={text('Tìm địa điểm xuất phát', 'Search starting location')}
                  placeholder={text('Hoặc nhập khách sạn, nhà ga, địa chỉ xuất phát…', 'Or search a hotel, station, or starting address…')}
                  value={originQuery}
                  onChange={e => setOriginQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleSearchOriginAddress();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary btn-size-sm"
                  disabled={originSearching || originQuery.trim().length < 3}
                  onClick={() => void handleSearchOriginAddress()}
                >
                  {originSearching ? text('Đang tìm…', 'Finding…') : text('Tìm vị trí', 'Find')}
                </button>
              </div>

              {originError && <p className="rec-origin-error" role="status">{originError}</p>}

              {originResults.length > 0 && (
                <div className="rec-origin-candidates">
                  {originResults.slice(0, 4).map(candidate => (
                    <button
                      key={candidate.id}
                      type="button"
                      className="rec-origin-candidate"
                      onClick={() => {
                        setDraft(prev => ({
                          ...prev,
                          origin: {
                            label: candidate.name,
                            latitude: candidate.latitude,
                            longitude: candidate.longitude,
                            source: 'geocoder',
                          },
                          radiusKm: prev.radiusKm || '5',
                        }));
                        setOriginResults([]);
                      }}
                    >
                      <strong>{candidate.name}</strong>
                      <span>{candidate.address}</span>
                    </button>
                  ))}
                </div>
              )}

              {draft.origin && (
                <div className="rec-origin-selected">
                  <span>
                    <Icon name="pin" size={15} />
                    {text('Xuất phát từ:', 'Starting from:')} <strong>{draft.origin.label}</strong>
                  </span>
                  <button
                    type="button"
                    className="rec-link-btn"
                    onClick={() => setDraft(prev => ({ ...prev, origin: null, radiusKm: '' }))}
                  >
                    {text('Bỏ vị trí', 'Clear')}
                  </button>
                </div>
              )}

              <div className="rec-radius-row" aria-disabled={!draft.origin}>
                <span>{text('Bán kính:', 'Radius:')}</span>
                <div className="rec-chip-grid">
                  <button
                    type="button"
                    className="rec-modal-chip"
                    disabled={!draft.origin}
                    aria-pressed={Boolean(draft.origin) && draft.radiusKm === ''}
                    onClick={() => setDraft(prev => ({ ...prev, radiusKm: '' }))}
                  >
                    {text('Không giới hạn', 'Any distance')}
                  </button>
                  {RADIUS_OPTIONS_KM.map(km => (
                    <button
                      key={km}
                      type="button"
                      className="rec-modal-chip"
                      disabled={!draft.origin}
                      aria-pressed={Boolean(draft.origin) && draft.radiusKm === km}
                      onClick={() => setDraft(prev => ({ ...prev, radiusKm: km }))}
                    >
                      ≤ {km} km
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div className="rec-modal-footer">
            <button type="button" className="btn-secondary" onClick={resetDraft}>
              {text('Xóa bộ lọc chi tiết', 'Reset detailed filters')}
            </button>
            <button type="button" className="btn-primary" onClick={applyModalFilters}>
              {text('Áp dụng bộ lọc', 'Apply filters')}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
