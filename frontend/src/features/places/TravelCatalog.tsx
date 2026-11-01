import { useId, useState } from 'react';
import type { Resource } from '../../shared/api';
import { Icon } from '../../shared/ui';
import './travel-catalog.css';

interface TravelCatalogProps {
  amenities: Resource[];
  tags: Resource[];
  offerings: Resource[];
  onSelectPlace: (place: Resource) => void;
  disabled?: boolean;
}

const groups = [
  { id: 'amenities', label: 'Tiện ích', icon: 'leaf', description: 'Những tiện nghi nhỏ, cho hành trình thêm thoải mái.', empty: 'Chưa có tiện ích để hiển thị.' },
  { id: 'tags', label: 'Thẻ địa điểm', icon: 'tag', description: 'Một góc nhìn khác để tìm nơi hợp với bạn.', empty: 'Chưa có thẻ địa điểm để hiển thị.' },
  { id: 'offerings', label: 'Dịch vụ và trải nghiệm', icon: 'compass', description: 'Khám phá thêm những điều có thể trải nghiệm tại điểm đến.', empty: 'Chưa có dịch vụ và trải nghiệm để hiển thị.' },
] as const;
type Group = typeof groups[number]['id'];

// Local integration fixtures remain accessible without presenting them as travel content.
const isTestResource = (row: Resource) => /^(?:integration\b|P0\d(?:[\s_-]|$)|synthetic\b|test[\s_-])/i.test(String(row.name ?? ''));

function priceLabel(row: Resource) {
  if (row.price == null || row.price === '' || !Number.isFinite(Number(row.price))) return 'Liên hệ để biết giá';
  if (Number(row.price) === 0) return 'Miễn phí';
  return `${Number(row.price).toLocaleString('vi-VN')} ${String(row.currency ?? 'VND')}`;
}

export function TravelCatalog({ amenities, tags, offerings, onSelectPlace, disabled = false }: TravelCatalogProps) {
  const [active, setActive] = useState<Group>('amenities');
  const id = useId();
  const resources = { amenities, tags, offerings };
  const group = groups.find(group => group.id === active)!;
  const rows = resources[active];
  const publicRows = rows.filter(row => !isTestResource(row));
  const testRows = rows.filter(isTestResource);

  function renderRows(items: Resource[]) {
    if (active !== 'offerings') return (
      <ul className="travel-catalog-chips">
        {items.map((row, index) => <li key={String(row.amenity_id ?? row.tag_id ?? row.id ?? index)}>
          <Icon name={group.icon} size={17} /><span>{String(row.name ?? '')}</span>
        </li>)}
      </ul>
    );
    return <div className="travel-catalog-offerings">{items.map((row, index) => (
      <article className="travel-catalog-offering" key={String(row.offering_id ?? row.id ?? index)}>
        <span className="travel-catalog-offering-icon"><Icon name="compass" size={24} /></span>
        <h3>{String(row.name ?? '')}</h3>
        <p className="travel-catalog-price">{priceLabel(row)}</p>
        {row.place_id != null && <button type="button" disabled={disabled} onClick={() => onSelectPlace({ place_id: row.place_id })}>
          Xem địa điểm cung cấp <Icon name="arrow" size={17} />
        </button>}
      </article>
    ))}</div>;
  }

  return (
    <section className="travel-catalog" aria-labelledby={`${id}-title`}>
      <div className="travel-catalog-heading">
        <div><span className="travel-catalog-eyebrow">CHO MỘT CHUYẾN ĐI TRỌN VẸN</span><h2 id={`${id}-title`}>Danh mục du lịch</h2></div>
        <p>Từ tiện nghi cần có đến những trải nghiệm đáng nhớ.</p>
      </div>
      <div className="travel-catalog-tabs" aria-label="Nhóm danh mục du lịch">
        {groups.map(item => <button key={item.id} id={`${id}-${item.id}`} type="button" aria-label={item.label} aria-pressed={active === item.id} onClick={() => setActive(item.id)}>
          <Icon name={item.icon} size={19} /><span>{item.label}</span><span className="travel-catalog-count" aria-hidden="true">{resources[item.id].length}</span>
        </button>)}
      </div>
      <div className="travel-catalog-content" role="region" aria-labelledby={`${id}-${active}`}>
        <p className="travel-catalog-description">{group.description}</p>
        {publicRows.length ? renderRows(publicRows) : <div className="travel-catalog-empty" role="status"><Icon name={group.icon} size={27} /><p>{group.empty}</p></div>}
        {testRows.length > 0 && <details className="travel-catalog-test-data" key={active}>
          <summary>Dữ liệu kiểm thử <span>({testRows.length})</span></summary>
          <p>Các bản ghi dùng cho kiểm thử tích hợp, giữ nguyên tên từ hệ thống.</p>
          {renderRows(testRows)}
        </details>}
      </div>
    </section>
  );
}
