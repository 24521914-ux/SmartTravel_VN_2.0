import { useId, useState } from 'react';
import type { Resource } from '../../shared/api';
import { Icon } from '../../shared/ui';
import './travel-catalog.css';
import { useAppPreferences } from '../../app/providers/AppPreferences';

interface TravelCatalogProps {
  amenities: Resource[];
  tags: Resource[];
  offerings: Resource[];
  onSelectPlace: (place: Resource) => void;
  disabled?: boolean;
}

const groups = [
  { id: 'amenities', label: ['Tiện ích', 'Amenities'], icon: 'leaf', description: ['Những tiện nghi nhỏ, cho hành trình thêm thoải mái.', 'Small comforts that make your trip easier.'], empty: ['Chưa có tiện ích để hiển thị.', 'No amenities to show yet.'] },
  { id: 'tags', label: ['Thẻ địa điểm', 'Place tags'], icon: 'tag', description: ['Một góc nhìn khác để tìm nơi hợp với bạn.', 'A different way to find places that fit you.'], empty: ['Chưa có thẻ địa điểm để hiển thị.', 'No place tags to show yet.'] },
  { id: 'offerings', label: ['Dịch vụ và trải nghiệm', 'Services & experiences'], icon: 'compass', description: ['Khám phá thêm những điều có thể trải nghiệm tại điểm đến.', 'Discover more things to do at each destination.'], empty: ['Chưa có dịch vụ và trải nghiệm để hiển thị.', 'No services or experiences to show yet.'] },
] as const;
type Group = typeof groups[number]['id'];

// Local integration fixtures remain accessible without presenting them as travel content.
const isTestResource = (row: Resource) => /^(?:integration\b|P0\d(?:[\s_-]|$)|synthetic\b|test[\s_-])/i.test(String(row.name ?? ''));

export function TravelCatalog({ amenities, tags, offerings, onSelectPlace, disabled = false }: TravelCatalogProps) {
  const { locale, text, formatCurrency } = useAppPreferences();
  const [active, setActive] = useState<Group>('amenities');
  const id = useId();
  const resources = { amenities, tags, offerings };
  const group = groups.find(group => group.id === active)!;
  const rows = resources[active];
  const groupLabel = group.label[locale === 'vi' ? 0 : 1];
  const groupDescription = group.description[locale === 'vi' ? 0 : 1];
  const groupEmpty = group.empty[locale === 'vi' ? 0 : 1];
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
          <p className="travel-catalog-price">{row.price == null || row.price === '' || !Number.isFinite(Number(row.price)) ? text('Liên hệ để biết giá', 'Contact for pricing') : Number(row.price) === 0 ? text('Miễn phí', 'Free') : formatCurrency(Number(row.price), String(row.currency ?? 'VND'))}</p>
        {row.place_id != null && <button type="button" disabled={disabled} onClick={() => onSelectPlace({ place_id: row.place_id })}>
          {text('Xem địa điểm cung cấp', 'View provider')} <Icon name="arrow" size={17} />
        </button>}
      </article>
    ))}</div>;
  }

  return (
    <section className="travel-catalog" aria-labelledby={`${id}-title`}>
      <div className="travel-catalog-heading">
        <div><span className="travel-catalog-eyebrow">{text('CHO MỘT CHUYẾN ĐI TRỌN VẸN', 'FOR A COMPLETE TRIP')}</span><h2 id={`${id}-title`}>{text('Danh mục du lịch', 'Travel catalog')}</h2></div>
        <p>{text('Từ tiện nghi cần có đến những trải nghiệm đáng nhớ.', 'From useful amenities to memorable experiences.')}</p>
      </div>
      <div className="travel-catalog-tabs" aria-label={text('Nhóm danh mục du lịch', 'Travel catalog groups')}>
        {groups.map(item => <button key={item.id} id={`${id}-${item.id}`} type="button" aria-label={item.label[locale === 'vi' ? 0 : 1]} aria-pressed={active === item.id} onClick={() => setActive(item.id)}>
          <Icon name={item.icon} size={19} /><span>{item.label[locale === 'vi' ? 0 : 1]}</span><span className="travel-catalog-count" aria-hidden="true">{resources[item.id].length}</span>
        </button>)}
      </div>
      <div className="travel-catalog-content" role="region" aria-labelledby={`${id}-${active}`}>
        <p className="travel-catalog-description">{groupDescription}</p>
        {publicRows.length ? renderRows(publicRows) : <div className="travel-catalog-empty" role="status"><Icon name={group.icon} size={27} /><p>{groupEmpty}</p></div>}
        {testRows.length > 0 && <details className="travel-catalog-test-data" key={active}>
          <summary>{text('Dữ liệu kiểm thử', 'Test data')} <span>({testRows.length})</span></summary>
          <p>{text('Các bản ghi dùng cho kiểm thử tích hợp, giữ nguyên tên từ hệ thống.', 'These records are for integration testing and keep their original system names.')}</p>
          {renderRows(testRows)}
        </details>}
      </div>
    </section>
  );
}
