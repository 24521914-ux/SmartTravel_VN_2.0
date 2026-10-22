import { useEffect, useState } from 'react';
import type { Resource, TravelClient } from '../../shared/api';
import { Icon } from '../../shared/ui';

const photo = (p: Resource) => typeof p.image_url === 'string' ? p.image_url : typeof p.cover_image === 'string' ? p.cover_image : '';
export function DestinationShowcase({ places, onSelect }: { places: Resource[]; onSelect: (place: Resource) => void }) {
  const items = places.filter(p => photo(p)).slice(0, 4);
  const [selected, setSelected] = useState('');
  const current = items.find(p => String(p.place_id ?? p.id) === selected) ?? items[0];
  if (!current) return <section className="journey-section showcase-empty"><span className="journey-eyebrow">CẬN CẢNH MỘT ĐIỂM ĐẾN</span><h2>Mỗi nơi chốn, <em>một câu chuyện.</em></h2><p>Showcase sẽ xuất hiện khi danh mục có điểm đến kèm ảnh. Trong lúc chờ, hãy khám phá những góc nhìn Việt Nam phía trên.</p></section>;
  return <section className="cinematic-showcase journey-section" aria-label="Cận cảnh điểm đến">
    <div className="showcase-images">{items.map(p => <img key={String(p.place_id ?? p.id)} src={photo(p)} alt="" loading="lazy" className={p === current ? 'is-active' : ''} onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />)}</div>
    <div className="showcase-copy"><span className="journey-eyebrow">CẬN CẢNH MỘT ĐIỂM ĐẾN</span><p>{typeof current.address === 'string' ? current.address : 'Khám phá Việt Nam'}</p><h2>{String(current.name ?? '')}</h2>{typeof current.description === 'string' && <p>{current.description}</p>}<button className="journey-hero-link" onClick={() => onSelect(current)}>Khám phá nơi này <Icon name="arrow" size={18} /></button></div>
    <div className="showcase-options" aria-label="Chọn điểm đến">{items.map((p, i) => <button key={String(p.place_id ?? p.id)} aria-pressed={p === current} onClick={() => setSelected(String(p.place_id ?? p.id))}><img src={photo(p)} alt="" loading="lazy" /><span>0{i + 1} · {String(p.name ?? '')}</span></button>)}</div>
  </section>;
}
export function CommunityStories({ travel, places }: { travel: TravelClient; places: Resource[] }) {
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
  return <section className="journey-section community-stories" aria-labelledby="community-title"><div className="journey-section-heading"><div><span className="journey-eyebrow">DẤU CHÂN & CÂU CHUYỆN</span><h2 id="community-title">Đi qua. <em>Và kể lại.</em></h2><p>Những chia sẻ từ cộng đồng tại các điểm đến trong danh mục.</p></div></div>{reviews.length ? <div className="community-quotes">{reviews.map((r, i) => <blockquote key={String(r.review_id ?? r.id ?? i)}><Icon name="chat" size={26} /><p>{String(r.content)}</p></blockquote>)}</div> : <p role="status">{state === 'loading' ? 'Đang tải những câu chuyện…' : state === 'error' ? 'Chưa tải được chia sẻ cộng đồng. Bạn có thể đọc đánh giá trong từng điểm đến.' : 'Chưa có chia sẻ để hiển thị. Mở một điểm đến để đọc hoặc gửi đánh giá của bạn.'}</p>}</section>;
}
