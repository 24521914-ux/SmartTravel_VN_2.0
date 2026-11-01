import type { FormEvent } from 'react';
import type { Resource } from '../../shared/api';
import { Icon } from '../../shared/ui';
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

export function DestinationFilters({ query, onQueryChange, filters, onFiltersChange, destinations, geographicUnits, appliedCount, onSubmit, onReset, busy }: Props) {
  const update = (key: string, value: string) => onFiltersChange({ ...filters, [key]: value });
  const advancedCount = ['minPrice', 'maxPrice', 'minRating', 'lat', 'lon', 'radiusM'].filter(key => filters[key]).length;
  return (
    <form className="destination-finder" role="search" aria-label="Tìm điểm đến" onSubmit={onSubmit} onInvalidCapture={event => {
      // Reveal the invalid field synchronously before native validation focuses it.
      const details = (event.target as HTMLElement).closest('details');
      if (details) details.open = true;
    }}>
      <div className="finder-heading">
        <span className="finder-eyebrow"><Icon name="compass" size={18} /> HÀNH TRÌNH BẮT ĐẦU TỪ ĐÂY</span>
        <span className="finder-caption">Một nơi mới. Một trải nghiệm mới.</span>
      </div>
      <div className="finder-main">
        <label className="finder-field finder-keyword" htmlFor="destination-search">
          <Icon name="search" size={22} />
          <span><span className="finder-label">Chuyến đi tiếp theo của bạn?</span>
            <input id="destination-search" type="search" placeholder="Thử tìm Hội An, Ninh Bình..." value={query} onChange={event => onQueryChange(event.target.value)} />
          </span>
        </label>
        <label className="finder-field">
          <Icon name="map" size={22} />
          <span><span className="finder-label">Vùng điểm đến</span>
            <select aria-label="Vùng điểm đến" value={filters.destinationId ?? ''} onChange={event => update('destinationId', event.target.value)}>
              <option value="">Tất cả</option>
              {destinations.map(row => <option key={String(row.destination_id ?? row.id)} value={String(row.destination_id ?? row.id)}>{String(row.name)}</option>)}
            </select>
          </span>
        </label>
        <label className="finder-field">
          <Icon name="pin" size={22} />
          <span><span className="finder-label">Tỉnh thành</span>
            <select aria-label="Tỉnh thành" value={filters.geographicUnitId ?? ''} onChange={event => update('geographicUnitId', event.target.value)}>
              <option value="">Tất cả</option>
              {geographicUnits.map(row => <option key={String(row.geographic_unit_id ?? row.id)} value={String(row.geographic_unit_id ?? row.id)}>{String(row.name)}</option>)}
            </select>
          </span>
        </label>
        <button type="submit" className="finder-submit" disabled={busy}><Icon name="search" size={20} />Tìm điểm đến</button>
      </div>
      <div className="finder-bottom">
        <details className="finder-advanced">
          <summary><Icon name="filter" size={18} />Bộ lọc nâng cao{advancedCount > 0 && <span className="finder-count">{advancedCount}</span>}<Icon name="chevronDown" size={14} /></summary>
          <div className="finder-advanced-content">
            <div className="finder-group-heading"><Icon name="price" size={20} /><div><h3>Ngân sách & đánh giá</h3><p>Chọn khoảng giá phù hợp với chuyến đi của bạn.</p></div></div>
            <div className="finder-budget-grid">
              <label>Giá tối thiểu<span className="finder-number"><input type="number" min="0" placeholder="Không giới hạn" value={filters.minPrice ?? ''} onChange={event => update('minPrice', event.target.value)} /><span aria-hidden="true">₫</span></span></label>
              <label>Giá tối đa<span className="finder-number"><input type="number" min={filters.minPrice || '0'} placeholder="Không giới hạn" value={filters.maxPrice ?? ''} onChange={event => update('maxPrice', event.target.value)} /><span aria-hidden="true">₫</span></span></label>
              <label>Đánh giá tối thiểu<select aria-label="Đánh giá tối thiểu" value={filters.minRating ?? ''} onChange={event => update('minRating', event.target.value)}><option value="">Tất cả đánh giá</option>{[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(rating => <option key={rating} value={rating}>{rating.toLocaleString('vi-VN')} sao trở lên</option>)}</select></label>
            </div>
            <div className="finder-nearby-heading"><Icon name="route" size={20} /><div><h3>Tìm quanh một vị trí</h3><p>Tùy chọn. Nhập tọa độ và bán kính để khám phá khu vực lân cận.</p></div></div>
            <div className="finder-budget-grid">
              <label>Vĩ độ<input type="number" min="-90" max="90" step="any" placeholder="Ví dụ: 10.7769" value={filters.lat ?? ''} required={Boolean(filters.lon || filters.radiusM)} onChange={event => update('lat', event.target.value)} /></label>
              <label>Kinh độ<input type="number" min="-180" max="180" step="any" placeholder="Ví dụ: 106.7009" value={filters.lon ?? ''} required={Boolean(filters.lat || filters.radiusM)} onChange={event => update('lon', event.target.value)} /></label>
              <label>Bán kính (m)<input type="number" min="1" placeholder="Ví dụ: 5000" value={filters.radiusM ?? ''} required={Boolean(filters.lat || filters.lon)} onChange={event => update('radiusM', event.target.value)} /></label>
            </div>
            <div className="finder-advanced-actions"><span>Các lựa chọn được áp dụng khi bạn tìm kiếm.</span><button type="submit" className="finder-apply" disabled={busy}>Áp dụng bộ lọc<Icon name="arrow" size={18} /></button></div>
          </div>
        </details>
        <div className="finder-status" aria-live="polite"><span>{appliedCount ? `${appliedCount} điều kiện đang áp dụng` : 'Khám phá theo cách của bạn'}</span><button type="button" onClick={onReset} disabled={busy || !(query || Object.values(filters).some(Boolean) || appliedCount)}>Đặt lại<Icon name="refresh" size={15} /></button></div>
      </div>
    </form>
  );
}
