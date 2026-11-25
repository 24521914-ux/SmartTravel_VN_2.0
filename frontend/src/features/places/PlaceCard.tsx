import { useEffect, useState } from 'react';
import { Icon } from '../../shared/ui';
import type { Resource } from '../../shared/api';
import { placeImageCandidates } from './media';
import { useAppPreferences } from '../../app/providers/AppPreferences';

export interface PlaceCardProps {
  place: Resource;
  isFavorite?: boolean;
  onToggleFavorite?: (place: Resource, nextState: boolean) => Promise<void>;
  onSelect?: (place: Resource) => void;
  busy?: boolean;
  favoriteDisabled?: boolean;
  variant?: 'default' | 'voyage';
}

export function PlaceCard({ place, isFavorite = false, onToggleFavorite, onSelect, busy = false, favoriteDisabled = false, variant = 'default' }: PlaceCardProps) {
  const { locale, text, formatCurrency } = useAppPreferences();
  const [favorite, setFavorite] = useState(isFavorite);
  useEffect(() => { setFavorite(isFavorite); }, [isFavorite]);
  const [toggling, setToggling] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const placeId = String(place.id ?? place.place_id ?? '');
  const imageCandidates = placeImageCandidates(place);
  const candidateKey = imageCandidates.join('|');
  useEffect(() => { setImageIndex(0); }, [placeId, candidateKey]);
  const name = String(locale === 'en' ? place.name_en ?? place.name ?? place.title ?? text('Điểm đến chưa có tên', 'Unnamed destination') : place.name_vi ?? place.name ?? place.title ?? 'Điểm đến chưa có tên');
  const address = typeof place.address === 'string' ? place.address : '';
  const rawRating = place.rating ?? place.average_rating ?? place.rating_avg;
  const ratingValue = rawRating === null || rawRating === undefined || rawRating === '' ? null : Number(rawRating);
  const rating = ratingValue !== null && Number.isFinite(ratingValue) && ratingValue >= 0 && ratingValue <= 5 ? ratingValue : null;
  const rawReviewCount = Number(place.review_count ?? place.rating_count ?? 0);
  const reviewCount = Number.isFinite(rawReviewCount) && rawReviewCount > 0 ? rawReviewCount : 0;
  const rawMinPrice = place.price_min ?? place.price;
  const minPrice = rawMinPrice === null || rawMinPrice === undefined || rawMinPrice === '' ? null : Number(rawMinPrice);
  const rawMaxPrice = place.price_max;
  const maxPrice = rawMaxPrice === null || rawMaxPrice === undefined || rawMaxPrice === '' ? null : Number(rawMaxPrice);
  const currency = typeof place.currency === 'string' ? place.currency : 'VND';
  const priceLabel = minPrice === null || !Number.isFinite(minPrice)
    ? text('Chưa cập nhật giá', 'Price unavailable')
    : minPrice === 0 && (maxPrice === null || maxPrice === 0)
      ? text('Miễn phí', 'Free')
      : maxPrice !== null && Number.isFinite(maxPrice) && maxPrice > minPrice
        ? `${formatCurrency(minPrice, currency)} – ${formatCurrency(maxPrice, currency)}`
        : `${text('Từ', 'From')} ${formatCurrency(minPrice, currency)}`;
  const imageUrl = imageCandidates[imageIndex] ?? '';
  const description = typeof place.description === 'string' ? place.description : '';

  async function handleFavoriteClick() {
    if (toggling || busy || favoriteDisabled || !onToggleFavorite) return;
    setToggling(true);
    try {
      await onToggleFavorite(place, !favorite);
      setFavorite(!favorite);
    } catch {
      // Caller reports failure; retain the last server-confirmed state.
    } finally { setToggling(false); }
  }

  if (variant === 'voyage') {
    return (
      <article
        className="travel-card place-card place-card-voyage"
        data-place-id={placeId}
        onClick={event => {
          if (busy) return;
          const target = event.target as HTMLElement;
          if (target.closest('button')) return;
          onSelect?.(place);
        }}
      >
        <div className="place-card-img-wrapper">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={name}
              className="place-card-img"
              width="640"
              height="592"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImageIndex(index => index + 1)}
            />
          ) : (
            <div className="place-photo-missing">
              <Icon name="map" size={34} />
              <span>{text('Ảnh địa điểm đang được cập nhật', 'Destination photo coming soon')}</span>
            </div>
          )}
          <div className="place-card-voyage-scrim" aria-hidden="true" />
          <div className="place-card-voyage-top">
            {typeof place.category_name === 'string' ? (
              <span className="destination-category">
                {String(locale === 'en' ? place.category_name_en ?? place.category_name : place.category_name)}
              </span>
            ) : (
              <span />
            )}
            {onToggleFavorite && (
              <button
                type="button"
                className="place-card-favorite-btn"
                aria-label={`${favorite ? 'Bỏ lưu' : 'Lưu'} ${name}`}
                aria-pressed={favorite}
                onClick={event => {
                  event.stopPropagation();
                  void handleFavoriteClick();
                }}
                disabled={busy || toggling || favoriteDisabled}
              >
                <Icon name="heart" size={18} />
              </button>
            )}
          </div>
          <div className="destination-copy destination-copy-overlay">
            {address && (
              <p className="destination-address">
                <Icon name="pin" size={13} />
                <span>{address}</span>
              </p>
            )}
            <h3>{name}</h3>
            <div className="destination-actions">
              <div className="place-card-voyage-meta">
                {rating !== null ? (
                  <span className="destination-rating">
                    <Icon name="star" size={14} weight="fill" />
                    {rating.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')}
                    {reviewCount > 0 && (
                      <span className="destination-review-count">
                        ({reviewCount.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')})
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="destination-unrated">{text('Chưa có đánh giá', 'Not rated')}</span>
                )}
                <span className="destination-price">
                  <strong>{priceLabel}</strong>
                </span>
              </div>
              <button
                type="button"
                className="destination-detail"
                onClick={event => {
                  event.stopPropagation();
                  onSelect?.(place);
                }}
                disabled={busy}
              >
                {text('Xem chi tiết', 'Details')} <Icon name="arrow" size={15} />
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="travel-card place-card" data-place-id={placeId}>
      <div className="place-card-img-wrapper">
        {imageUrl ? <img src={imageUrl} alt={name} className="place-card-img" width="640" height="480" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageIndex(index => index + 1)} /> : <div className="place-photo-missing"><Icon name="map" size={36} /><span>{text('Ảnh địa điểm đang được cập nhật', 'Destination photo coming soon')}</span></div>}
        {onToggleFavorite && <button type="button" className="place-card-favorite-btn" aria-label={`${favorite ? 'Bỏ lưu' : 'Lưu'} ${name}`} aria-pressed={favorite} onClick={() => void handleFavoriteClick()} disabled={busy || toggling || favoriteDisabled}><Icon name="heart" size={20} /></button>}
      </div>
      <div className="destination-copy">
        {typeof place.category_name === 'string' && <span className="destination-category">{String(locale === 'en' ? place.category_name_en ?? place.category_name : place.category_name)}</span>}
        <h3>{name}</h3>
        {address && <p className="destination-address"><Icon name="pin" size={14} />{address}</p>}
        {description && <p className="destination-description">{description}</p>}
        <div className="destination-social-proof">
          {rating !== null ? <span className="destination-rating"><Icon name="star" size={16} />{rating.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')}{reviewCount > 0 && <span className="destination-review-count">({reviewCount.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')} {text('đánh giá', 'reviews')})</span>}</span> : <span className="destination-unrated">{text('Chưa có điểm đánh giá', 'Not rated yet')}</span>}
        </div>
        <div className="destination-actions">
          <span className="destination-price"><span>{text('Giá tham khảo', 'Price')}</span><strong>{priceLabel}</strong></span>
          <button type="button" className="destination-detail" onClick={() => onSelect?.(place)} disabled={busy}>{text('Xem chi tiết', 'Details')} <Icon name="arrow" size={17} /></button>
        </div>
      </div>
    </article>
  );
}
