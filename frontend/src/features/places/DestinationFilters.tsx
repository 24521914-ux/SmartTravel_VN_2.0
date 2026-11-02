import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Resource } from '../../shared/api';
import { Icon } from '../../shared/ui';
import { useAppPreferences } from '../../app/providers/AppPreferences';
import './destination-filters.css';

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  filters: Record<string, string>;
  onFiltersChange: (filters: Record<string, string>) => void;
  destinations: Resource[];
  geographicUnits: Resource[];
  appliedCount: number;
  onSubmit: (event: FormEvent) => void;
  onReset: () => void;
  busy: boolean;
}

interface SelectOption { value: string; label: string }

function RoundedSelect({ label, value, options, onChange, compact = false, disabled = false }: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));
  const selected = options[selectedIndex];

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside, true);
    return () => document.removeEventListener('pointerdown', dismissOutside, true);
  }, [open]);

  const focusOption = (index: number) => optionRefs.current[Math.min(options.length - 1, Math.max(0, index))]?.focus();
  const showMenu = (index = selectedIndex) => {
    setOpen(true);
    window.requestAnimationFrame(() => focusOption(index));
  };
  const choose = (option: SelectOption) => {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };
  const handleTriggerKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      showMenu(event.key === 'ArrowUp' ? options.length - 1 : selectedIndex);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(selected); else showMenu();
    } else if (event.key === 'Escape' && open) setOpen(false);
  };
  const handleOptionKey = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); focusOption(index + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); focusOption(index - 1); }
    else if (event.key === 'Home') { event.preventDefault(); focusOption(0); }
    else if (event.key === 'End') { event.preventDefault(); focusOption(options.length - 1); }
    else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
  };

  return <div className={`rounded-select${compact ? ' rounded-select-compact' : ''}`} ref={rootRef}>
    <button
      ref={triggerRef}
      type="button"
      className="rounded-select-trigger"
      role="combobox"
      aria-label={label}
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-controls={listboxId}
      disabled={disabled}
      onClick={() => open ? setOpen(false) : showMenu()}
      onKeyDown={handleTriggerKey}
    >
      <span>{selected?.label ?? ''}</span><Icon name="chevronDown" size={15} />
    </button>
    {open && !disabled && <div className="rounded-select-popover" id={listboxId} role="listbox" aria-label={label}>
      {options.map((option, index) => <button
        key={option.value}
        ref={node => { optionRefs.current[index] = node; }}
        id={`${listboxId}-option-${index}`}
        type="button"
        role="option"
        aria-selected={option.value === value}
        className="rounded-select-option"
        onClick={() => choose(option)}
        onKeyDown={event => handleOptionKey(event, index)}
      ><span>{option.label}</span><span aria-hidden="true" className="rounded-select-check">{option.value === value ? '✓' : ''}</span></button>)}
    </div>}
  </div>;
}

export function DestinationFilters({ query, onQueryChange, filters, onFiltersChange, destinations, geographicUnits, appliedCount, onSubmit, onReset, busy }: Props) {
  const { locale, text } = useAppPreferences();
  const update = (key: string, value: string) => onFiltersChange({ ...filters, [key]: value });
  const unitsById = new Map(geographicUnits.map(unit => [String(unit.geographic_unit_id ?? unit.id), unit]));
  const displayName = (row: Resource) => String(locale === 'en' ? row.name_en ?? row.name : row.name_vi ?? row.name);
  const byName = (a: Resource, b: Resource) => displayName(a).localeCompare(displayName(b), locale);
  const provinces = geographicUnits.filter(unit => unit.level === 'PROVINCE').sort(byName);
  const provinceId = filters.geographicUnitId ?? '';
  const belongsToProvince = (id: string) => {
    // An area must be strictly smaller than its province. Unknown/cyclic scopes
    // fail closed rather than being guessed from a destination's display name.
    if (id === provinceId) return false;
    const seen = new Set<string>();
    let unit = unitsById.get(id);
    while (unit?.parent_id && !seen.has(id)) {
      seen.add(id);
      id = String(unit.parent_id);
      if (id === provinceId) return true;
      unit = unitsById.get(id);
    }
    return false;
  };
  const areas = provinceId ? destinations.filter(destination => {
    const scopes = destination.geographic_unit_ids;
    return !['INACTIVE', 'ARCHIVED'].includes(String(destination.status)) && Array.isArray(scopes) && scopes.length > 0 && scopes.every(id => belongsToProvince(String(id)));
  }).sort(byName) : [];
  const validProvince = provinces.some(unit => String(unit.geographic_unit_id ?? unit.id) === provinceId);
  const validArea = areas.some(area => String(area.destination_id ?? area.id) === filters.destinationId);
  useEffect(() => {
    if (provinceId && !validProvince) onFiltersChange({ ...filters, geographicUnitId: '', destinationId: '' });
    else if (filters.destinationId && !validArea) onFiltersChange({ ...filters, destinationId: '' });
  }, [filters, onFiltersChange, provinceId, validProvince, validArea]);
  const chooseProvince = (value: string) => {
    if (value !== provinceId) onFiltersChange({ ...filters, geographicUnitId: value, destinationId: '' });
  };
  const advancedCount = ['minPrice', 'maxPrice', 'minRating', 'lat', 'lon', 'radiusM'].filter(key => filters[key]).length;
  return (
    <form className="destination-finder" role="search" aria-label={text('Tìm điểm đến', 'Find destinations')} onSubmit={onSubmit} onInvalidCapture={event => {
      // Reveal the invalid field synchronously before native validation focuses it.
      const details = (event.target as HTMLElement).closest('details');
      if (details) details.open = true;
    }}>
      <div className="finder-heading">
        <span className="finder-eyebrow"><Icon name="compass" size={18} /> {text('HÀNH TRÌNH BẮT ĐẦU TỪ ĐÂY', 'YOUR JOURNEY STARTS HERE')}</span>
        <span className="finder-caption">{text('Một nơi mới. Một trải nghiệm mới.', 'A new place. A new experience.')}</span>
      </div>
      <div className="finder-main">
        <div className="finder-field">
          <Icon name="pin" size={22} />
          <span><span className="finder-label">{text('1 · Tỉnh thành', '1 · Province')}</span>
            <RoundedSelect label={text('Tỉnh thành', 'Province')} value={provinceId} onChange={chooseProvince} options={[
              { value: '', label: text('Tất cả tỉnh thành', 'All provinces') },
              ...provinces.map(row => ({ value: String(row.geographic_unit_id ?? row.id), label: String(locale === 'en' ? row.name_en ?? row.name : row.name_vi ?? row.name) })),
            ]} compact />
          </span>
        </div>
        <div className="finder-field" data-disabled={!provinceId || !areas.length || undefined}>
          <Icon name="map" size={22} />
          <span><span className="finder-label">{text('2 · Khu vực du lịch', '2 · Travel area')}</span>
            <RoundedSelect label={text('Khu vực du lịch', 'Travel area')} value={filters.destinationId ?? ''} onChange={value => update('destinationId', value)} disabled={!provinceId || !areas.length} options={[
              { value: '', label: !provinceId ? text('Chọn tỉnh thành trước', 'Choose a province first') : !areas.length ? text('Chưa có khu vực', 'No areas available') : text('Tất cả khu vực', 'All travel areas') },
              ...areas.map(row => ({ value: String(row.destination_id ?? row.id), label: String(locale === 'en' ? row.name_en ?? row.name : row.name_vi ?? row.name) })),
            ]} compact />
          </span>
        </div>
        <label className="finder-field finder-keyword" htmlFor="destination-search">
          <Icon name="search" size={22} />
          <span><span className="finder-label">{text('3 · Tên địa điểm (tùy chọn)', '3 · Place name (optional)')}</span>
            <input id="destination-search" type="search" placeholder={text('Thử tìm Hội An, Ninh Bình...', 'Try Hoi An, Ninh Binh...')} value={query} onChange={event => onQueryChange(event.target.value)} />
          </span>
        </label>
        <button type="submit" className="finder-submit" disabled={busy}><Icon name="search" size={19} />{text('Tìm điểm đến', 'Search places')}</button>
      </div>
      <div className="finder-bottom">
        <details className="finder-advanced">
          <summary><Icon name="filter" size={18} />{text('Bộ lọc nâng cao', 'More filters')}{advancedCount > 0 && <span className="finder-count">{advancedCount}</span>}<Icon name="chevronDown" size={14} /></summary>
          <div className="finder-advanced-content">
            <div className="finder-group-heading"><Icon name="price" size={20} /><div><h3>{text('Ngân sách & đánh giá', 'Budget & rating')}</h3><p>{text('Chọn khoảng giá phù hợp với chuyến đi của bạn.', 'Choose a price range that fits your trip.')}</p></div></div>
            <div className="finder-budget-grid">
              <label>{text('Giá tối thiểu', 'Minimum price')}<span className="finder-number"><input type="number" min="0" placeholder={text('Không giới hạn', 'No minimum')} value={filters.minPrice ?? ''} onChange={event => update('minPrice', event.target.value)} /><span aria-hidden="true">₫</span></span></label>
              <label>{text('Giá tối đa', 'Maximum price')}<span className="finder-number"><input type="number" min={filters.minPrice || '0'} placeholder={text('Không giới hạn', 'No maximum')} value={filters.maxPrice ?? ''} onChange={event => update('maxPrice', event.target.value)} /><span aria-hidden="true">₫</span></span></label>
              <div className="finder-rating-field"><span>{text('Đánh giá tối thiểu', 'Minimum rating')}</span><RoundedSelect label={text('Đánh giá tối thiểu', 'Minimum rating')} value={filters.minRating ?? ''} onChange={value => update('minRating', value)} options={[
                { value: '', label: text('Tất cả đánh giá', 'Any rating') },
                ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(rating => ({ value: String(rating), label: `${rating.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')} ${text('sao trở lên', 'stars and up')}` })),
              ]} /></div>
            </div>
            <div className="finder-nearby-heading"><Icon name="route" size={20} /><div><h3>{text('Tìm quanh một vị trí', 'Search near a location')}</h3><p>{text('Tùy chọn. Nhập tọa độ và bán kính để khám phá khu vực lân cận.', 'Optional. Enter coordinates and a radius to explore nearby places.')}</p></div></div>
            <div className="finder-budget-grid">
              <label>{text('Vĩ độ', 'Latitude')}<input type="number" min="-90" max="90" step="any" placeholder="10.7769" value={filters.lat ?? ''} required={Boolean(filters.lon || filters.radiusM)} onChange={event => update('lat', event.target.value)} /></label>
              <label>{text('Kinh độ', 'Longitude')}<input type="number" min="-180" max="180" step="any" placeholder="106.7009" value={filters.lon ?? ''} required={Boolean(filters.lat || filters.radiusM)} onChange={event => update('lon', event.target.value)} /></label>
              <label>{text('Bán kính (m)', 'Radius (m)')}<input type="number" min="1" placeholder="5000" value={filters.radiusM ?? ''} required={Boolean(filters.lat || filters.lon)} onChange={event => update('radiusM', event.target.value)} /></label>
            </div>
            <div className="finder-advanced-actions"><span>{text('Các lựa chọn được áp dụng khi bạn tìm kiếm.', 'Filters are applied when you search.')}</span><button type="submit" className="finder-apply" disabled={busy}>{text('Áp dụng bộ lọc', 'Apply filters')}<Icon name="arrow" size={18} /></button></div>
          </div>
        </details>
        <div className="finder-status" aria-live="polite"><span>{appliedCount ? text(`${appliedCount} điều kiện đang áp dụng`, `${appliedCount} filters active`) : text('Khám phá theo cách của bạn', 'Explore your way')}</span><button type="button" onClick={onReset} disabled={busy || !(query || Object.values(filters).some(Boolean) || appliedCount)}>{text('Đặt lại', 'Reset')}<Icon name="refresh" size={15} /></button></div>
      </div>
    </form>
  );
}
