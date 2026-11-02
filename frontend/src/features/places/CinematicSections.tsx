import { useEffect, useState } from 'react';
import type { Resource, TravelClient } from '../../shared/api';
import { Icon } from '../../shared/ui';
import { placeImage } from './media';
import { useAppPreferences } from '../../app/providers/AppPreferences';

const photo = placeImage;
export function DestinationShowcase({ places, onSelect }: { places: Resource[]; onSelect: (place: Resource) => void }) {
  const { locale, text } = useAppPreferences();
  const nameOf = (place: Resource) => String(locale === 'en' ? place.name_en ?? place.name ?? '' : place.name_vi ?? place.name ?? '');
  const items = places.filter(p => photo(p)).slice(0, 4);
  const [selected, setSelected] = useState('');
  const current = items.find(p => String(p.place_id ?? p.id) === selected) ?? items[0];
  if (!current) return <section className="journey-section showcase-empty"><span className="journey-eyebrow">{text('CẬN CẢNH MỘT ĐIỂM ĐẾN', 'A CLOSER LOOK')}</span><h2>{text('Mỗi nơi chốn,', 'Every place has')} <em>{text('một câu chuyện.', 'a story.')}</em></h2><p>{text('Góc nhìn nổi bật sẽ xuất hiện khi danh mục có điểm đến kèm ảnh. Trong lúc chờ, hãy khám phá những miền đất phía trên.', 'This feature will appear when the catalog has destinations with photos. For now, explore the places above.')}</p></section>;
  return <section className="cinematic-showcase journey-section" aria-label={text('Cận cảnh điểm đến', 'Destination spotlight')}>
    <div className="showcase-images">{items.map(p => <img key={String(p.place_id ?? p.id)} src={photo(p)} alt="" loading="lazy" className={p === current ? 'is-active' : ''} onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />)}</div>
    <div className="showcase-copy"><span className="journey-eyebrow">{text('CẬN CẢNH MỘT ĐIỂM ĐẾN', 'DESTINATION SPOTLIGHT')}</span><p>{typeof current.address === 'string' ? current.address : text('Khám phá Việt Nam', 'Discover Vietnam')}</p><h2>{nameOf(current)}</h2>{typeof current.description === 'string' && <p>{current.description}</p>}<button className="journey-hero-link" onClick={() => onSelect(current)}>{text('Khám phá nơi này', 'Explore this place')} <Icon name="arrow" size={18} /></button></div>
    <div className="showcase-options" aria-label={text('Chọn điểm đến', 'Choose a destination')}>{items.map((p, i) => <button key={String(p.place_id ?? p.id)} aria-pressed={p === current} onClick={() => setSelected(String(p.place_id ?? p.id))}><img src={photo(p)} alt="" loading="lazy" /><span>0{i + 1} · {nameOf(p)}</span></button>)}</div>
  </section>;
}
export function CommunityStories({ travel, places }: { travel: TravelClient; places: Resource[] }) {
  const { text } = useAppPreferences();
  const [reviews, setReviews] = useState<Resource[]>([]);
  const [state, setState] = useState('empty');
  const ids = places.slice(0, 3).map(p => String(p.place_id ?? p.id)).join(',');
  useEffect(() => {
    let cancelled = false;
    setReviews([]);
    if (!ids) { setState('empty'); return; }
    setState('loading');
    void Promise.allSettled(ids.split(',').map(id => travel.reviews(id))).then(results => {
      if (cancelled) return;
      setReviews(results.flatMap(r => r.status === 'fulfilled' ? r.value.items ?? [] : []).filter(r => typeof r.content === 'string').slice(0, 3));
      setState(results.every(r => r.status === 'rejected') ? 'error' : 'ready');
    });
    return () => { cancelled = true; };
  }, [travel, ids]);
  return <section className="journey-section community-stories" aria-labelledby="community-title"><div className="journey-section-heading"><div><span className="journey-eyebrow">{text('DẤU CHÂN & CÂU CHUYỆN', 'TRAVEL NOTES & STORIES')}</span><h2 id="community-title">{text('Đi qua.', 'Go there.')} <em>{text('Và kể lại.', 'Tell your story.')}</em></h2><p>{text('Những chia sẻ từ cộng đồng tại các điểm đến trong danh mục.', 'Notes from travelers who visited destinations in our catalog.')}</p></div></div>{reviews.length ? <div className="community-quotes">{reviews.map((r, i) => <blockquote key={String(r.review_id ?? r.id ?? i)}><Icon name="chat" size={26} /><p>{String(r.content)}</p><footer><strong>{String(r.author_name ?? text('Du khách', 'Traveler'))}</strong><span><Icon name="star" size={15} />{Number(r.rating ?? 0).toLocaleString('vi-VN')} / 5</span></footer></blockquote>)}</div> : <p role="status">{state === 'loading' ? text('Đang tải những câu chuyện…', 'Loading stories…') : state === 'error' ? text('Chưa tải được chia sẻ cộng đồng. Bạn có thể đọc đánh giá trong từng điểm đến.', 'Community stories could not be loaded. You can read reviews on each destination.') : text('Chưa có chia sẻ để hiển thị. Mở một điểm đến để đọc hoặc gửi đánh giá của bạn.', 'No stories to show yet. Open a destination to read or leave a review.')}</p>}</section>;
}
