import { useEffect, useRef, useState } from 'react';
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
    <div className="showcase-images">{items.map(p => <img key={String(p.place_id ?? p.id)} src={photo(p)} alt="" loading="lazy" referrerPolicy="no-referrer" className={p === current ? 'is-active' : ''} onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />)}</div>
    <div className="showcase-copy"><span className="journey-eyebrow">{text('CẬN CẢNH MỘT ĐIỂM ĐẾN', 'DESTINATION SPOTLIGHT')}</span><p>{typeof current.address === 'string' ? current.address : text('Khám phá Việt Nam', 'Discover Vietnam')}</p><h2>{nameOf(current)}</h2>{typeof current.description === 'string' && <p>{current.description}</p>}<button className="journey-hero-link" onClick={() => onSelect(current)}>{text('Khám phá nơi này', 'Explore this place')} <Icon name="arrow" size={18} /></button></div>
    <div className="showcase-options" aria-label={text('Chọn điểm đến', 'Choose a destination')}>{items.map((p, i) => <button key={String(p.place_id ?? p.id)} aria-pressed={p === current} onClick={() => setSelected(String(p.place_id ?? p.id))}><img src={photo(p)} alt="" loading="lazy" referrerPolicy="no-referrer" /><span>0{i + 1} · {nameOf(p)}</span></button>)}</div>
  </section>;
}

export function CommunityStories({ travel, places }: { travel: TravelClient; places: Resource[] }) {
  const { locale, text } = useAppPreferences();
  const [reviews, setReviews] = useState<Resource[]>([]);
  const [state, setState] = useState<'empty' | 'loading' | 'ready' | 'error'>('empty');
  const [activeIndex, setActiveIndex] = useState(0);
  const [nearViewport, setNearViewport] = useState(() => typeof IntersectionObserver === 'undefined');
  const containerRef = useRef<HTMLDivElement>(null);
  const ids = places
    .filter(p => p.source !== 'geofabrik-osm')
    .slice(0, 4)
    .map(p => String(p.place_id ?? p.id))
    .join(',');

  useEffect(() => {
    if (nearViewport || typeof IntersectionObserver === 'undefined') return;
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '320px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [nearViewport]);

  useEffect(() => {
    let cancelled = false;
    setReviews([]);
    setActiveIndex(0);
    if (!ids) {
      setState('empty');
      return;
    }
    if (!nearViewport) {
      setState('loading');
      return;
    }
    setState('loading');
    void Promise.allSettled(ids.split(',').map(id => travel.reviews(id))).then(results => {
      if (cancelled) return;
      const loaded = results
        .flatMap(r => (r.status === 'fulfilled' ? r.value.items ?? [] : []))
        .filter(r => typeof r.content === 'string' && r.content.trim() !== '')
        .slice(0, 6);
      setReviews(loaded);
      setState(results.every(r => r.status === 'rejected') ? 'error' : 'ready');
    });
    return () => {
      cancelled = true;
    };
  }, [travel, ids, nearViewport]);

  const current = reviews.length ? reviews[activeIndex % reviews.length] : null;
  const authorName = String(current?.author_name ?? text('Du khách SmartTravel', 'SmartTravel Traveler'));
  const authorInitial = authorName.trim().charAt(0).toUpperCase() || 'S';
  const rawRating = current ? Number(current.rating ?? 5) : 5;
  const ratingValue = Number.isFinite(rawRating) ? Math.max(0, Math.min(5, rawRating)) : 5;
  const filledStars = Math.round(ratingValue);

  return (
    <div ref={containerRef} className="ev-testimonial community-stories" aria-labelledby="community-title">
      <h3 id="community-title" className="ev-sr-only">
        {text('Chia sẻ từ cộng đồng du khách', 'Traveler community stories')}
      </h3>
      {current ? (
        <div className="ev-testimonial-inner">
          <div className="ev-testimonial-stars" aria-label={`${ratingValue} / 5`}>
            {[0, 1, 2, 3, 4].map(index => (
              <span
                key={index}
                className={`ev-testimonial-star ${index < filledStars ? 'is-filled' : ''}`}
                aria-hidden="true"
              >
                <Icon name="star" size={16} weight={index < filledStars ? 'fill' : 'regular'} />
              </span>
            ))}
          </div>
          <blockquote className="ev-testimonial-quote">
            <p>“{String(current.content)}”</p>
            <footer className="ev-testimonial-author">
              <span className="ev-testimonial-avatar" aria-hidden="true">
                {authorInitial}
              </span>
              <div className="ev-testimonial-meta">
                <strong>{authorName}</strong>
                <span>
                  {ratingValue.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')} / 5 ·{' '}
                  {text('Đánh giá thực từ cộng đồng', 'Verified traveler note')}
                </span>
              </div>
            </footer>
          </blockquote>
          {reviews.length > 1 && (
            <div className="ev-testimonial-nav" aria-label={text('Chuyển đánh giá', 'Switch review')}>
              <button
                type="button"
                aria-label={text('Đánh giá trước', 'Previous review')}
                onClick={() => setActiveIndex(prev => (prev - 1 + reviews.length) % reviews.length)}
              >
                <Icon name="arrowLeft" size={16} />
              </button>
              <button
                type="button"
                aria-label={text('Đánh giá tiếp theo', 'Next review')}
                onClick={() => setActiveIndex(prev => (prev + 1) % reviews.length)}
              >
                <Icon name="arrow" size={16} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="ev-testimonial-status" role="status">
          {state === 'loading'
            ? text('Đang tải những câu chuyện…', 'Loading traveler notes…')
            : state === 'error'
              ? text(
                  'Chưa tải được chia sẻ cộng đồng. Bạn có thể đọc đánh giá trong từng điểm đến.',
                  'Community stories could not be loaded. You can read reviews inside each destination.',
                )
              : text(
                  'Chưa có chia sẻ để hiển thị. Mở một điểm đến để đọc hoặc gửi đánh giá của bạn.',
                  'No stories to show yet. Open a destination to read or leave a review.',
                )}
        </p>
      )}
    </div>
  );
}
