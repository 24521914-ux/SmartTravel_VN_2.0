import { useState } from 'react';
import { Icon } from '../../shared/ui';
import type { Resource } from '../../shared/api';

export interface PlaceCardProps {
  place: Resource;
  isFavorite?: boolean;
  onToggleFavorite?: (place: Resource, nextState: boolean) => Promise<void>;
  onSelect?: (place: Resource) => void;
  busy?: boolean;
}

export function PlaceCard({ place, isFavorite = false, onToggleFavorite, onSelect, busy = false }: PlaceCardProps) {
  const [favorite, setFavorite] = useState(isFavorite);
  const [toggling, setToggling] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const placeId = String(place.id ?? place.place_id ?? '');
  const name = String(place.name ?? place.title ?? 'Điểm đến chưa có tên');
  const address = typeof place.address === 'string' ? place.address : '';
  const rawRating = place.rating ?? place.average_rating;
  const rating = typeof rawRating === 'number' && rawRating >= 0 && rawRating <= 5 ? rawRating : null;
  const imageUrl = typeof place.image_url === 'string' ? place.image_url : typeof place.cover_image === 'string' ? place.cover_image : '';
  const description = typeof place.description === 'string' ? place.description : '';

  async function handleFavoriteClick() {
    if (toggling || busy || !onToggleFavorite) return;
    setToggling(true);
    try {
      await onToggleFavorite(place, !favorite);
      setFavorite(!favorite);
    } catch {
      // Caller reports failure; retain the last server-confirmed state.
    } finally { setToggling(false); }
  }

  return (
    <article className="travel-card place-card" data-place-id={placeId}>
      <div className="place-card-img-wrapper">
        {imageUrl && failedImage !== imageUrl ? <img src={imageUrl} alt={name} className="place-card-img" width="640" height="480" loading="lazy" onError={() => setFailedImage(imageUrl)} /> : <div className="place-photo-missing"><Icon name="map" size={36} /><span>Ảnh địa điểm đang được cập nhật</span></div>}
        {onToggleFavorite && <button type="button" className="place-card-favorite-btn" aria-label={`${favorite ? 'Bỏ lưu' : 'Lưu'} ${name}`} aria-pressed={favorite} onClick={() => void handleFavoriteClick()} disabled={busy || toggling}><Icon name="heart" size={20} /></button>}
      </div>
      <div className="destination-copy">
        {typeof place.category_name === 'string' && <span className="destination-category">{place.category_name}</span>}
        <h3>{name}</h3>
        {address && <p className="destination-address"><Icon name="pin" size={14} />{address}</p>}
        {description && <p className="destination-description">{description}</p>}
        <div className="destination-actions">
          {rating !== null ? <span className="destination-rating"><Icon name="star" size={16} />{rating.toLocaleString('vi-VN')}</span> : <span className="destination-unrated">Chưa có điểm đánh giá</span>}
          <button type="button" className="destination-detail" onClick={() => onSelect?.(place)} disabled={busy}>Xem chi tiết <Icon name="arrow" size={17} /></button>
        </div>
      </div>
    </article>
  );
}
