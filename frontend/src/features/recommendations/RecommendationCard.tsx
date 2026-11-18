import { useEffect, useState } from 'react';
import { Icon, RatingStars } from '../../shared/ui';
import type { Resource } from '../../shared/api';
import { useAppPreferences } from '../../app/providers/AppPreferences';
import { placeImageCandidates } from '../places/media';
import type { RankedRecommendation } from './recommendation-engine';

export interface RecommendationCardProps {
  item: RankedRecommendation;
  isFavorite?: boolean;
  favoriteDisabled?: boolean;
  isSelectedOnMap?: boolean;
  onToggleFavorite?: (place: Resource, next: boolean) => Promise<void>;
  onSelectPlace: (place: Resource) => void;
  onAddToTrip: (place: Resource) => void;
  onHighlightOnMap?: (placeId: string) => void;
  busy?: boolean;
}

export function RecommendationCard({
  item,
  isFavorite = false,
  favoriteDisabled = false,
  isSelectedOnMap = false,
  onToggleFavorite,
  onSelectPlace,
  onAddToTrip,
  onHighlightOnMap,
  busy = false,
}: RecommendationCardProps) {
  const { locale, text, formatCurrency } = useAppPreferences();
  const [favorite, setFavorite] = useState(isFavorite);
  const [togglingFav, setTogglingFav] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    setFavorite(isFavorite);
  }, [isFavorite]);

  useEffect(() => {
    setImageIndex(0);
  }, [item.placeId]);

  const candidates = placeImageCandidates(item.place);
  const activePhotoUrl = candidates[imageIndex] ?? '';
  const hasMultiplePhotos = candidates.length > 1 && imageIndex < candidates.length;

  const priceLabel =
    item.minPrice === null
      ? text('Chưa cập nhật giá', 'Price unavailable')
      : item.minPrice === 0 && (item.maxPrice === null || item.maxPrice === 0)
        ? text('Miễn phí', 'Free')
        : item.maxPrice !== null && item.maxPrice > item.minPrice
          ? `${formatCurrency(item.minPrice, item.currency)} – ${formatCurrency(item.maxPrice, item.currency)}`
          : `${text('Từ', 'From')} ${formatCurrency(item.minPrice, item.currency)}`;

  async function handleFavoriteClick() {
    if (togglingFav || busy || favoriteDisabled || !onToggleFavorite) return;
    setTogglingFav(true);
    try {
      await onToggleFavorite(item.place, !favorite);
      setFavorite(!favorite);
    } catch {
      // Parent handles toast; retain server-confirmed state
    } finally {
      setTogglingFav(false);
    }
  }

  return (
    <article
      className={`travel-card rec-card ${isSelectedOnMap ? 'is-map-selected' : ''}`}
      data-place-id={item.placeId}
      onMouseEnter={() => onHighlightOnMap?.(item.placeId)}
    >
      <div className="place-card-img-wrapper rec-card-media">
        <span
          className={`rec-rank-badge ${item.rank <= 3 ? 'is-top3' : ''}`}
          aria-label={text(`Xếp hạng ${item.rank}`, `Rank ${item.rank}`)}
        >
          #{item.rank}
        </span>

        {activePhotoUrl ? (
          <>
            <img
              key={`${item.placeId}-${activePhotoUrl}`}
              src={activePhotoUrl}
              alt={item.name}
              className="place-card-img"
              width={640}
              height={480}
              loading="lazy"
              onError={() => setImageIndex(idx => idx + 1)}
            />
            {hasMultiplePhotos && (
              <div className="rec-photo-nav">
                <button
                  type="button"
                  aria-label={text('Ảnh trước', 'Previous photo')}
                  onClick={e => {
                    e.stopPropagation();
                    setImageIndex(idx => (idx - 1 + candidates.length) % candidates.length);
                  }}
                >
                  <Icon name="arrowLeft" size={14} />
                </button>
                <button
                  type="button"
                  aria-label={text('Ảnh tiếp theo', 'Next photo')}
                  onClick={e => {
                    e.stopPropagation();
                    setImageIndex(idx => (idx + 1) % candidates.length);
                  }}
                >
                  <Icon name="arrow" size={14} />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="place-photo-missing rec-photo-placeholder">
            <Icon name="map" size={34} />
            <span>{text('Ảnh địa điểm đang được cập nhật', 'Destination photo coming soon')}</span>
          </div>
        )}

        {onToggleFavorite && (
          <button
            type="button"
            className="place-card-favorite-btn"
            aria-label={`${favorite ? text('Bỏ lưu', 'Remove') : text('Lưu', 'Save')} ${item.name}`}
            aria-pressed={favorite}
            onClick={() => void handleFavoriteClick()}
            disabled={busy || togglingFav || favoriteDisabled}
          >
            <Icon name="heart" size={19} />
          </button>
        )}
      </div>

      <div className="rec-card-body">
        <div className="rec-card-meta-row">
          <span className="destination-category">{item.categoryLabel}</span>
          {item.distanceKm !== null && (
            <span className="rec-distance-pill">
              <Icon name="route" size={13} />
              {item.distanceKm.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} km
            </span>
          )}
        </div>

        <h3 className="rec-card-title">
          <span className="rec-card-index">{item.rank}.</span> {item.name}
        </h3>

        <div className="rec-card-rating-row">
          {item.rating !== null ? (
            <div className="rec-rating-group">
              <RatingStars rating={item.rating} size={15} />
              <strong>{item.rating.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>
              {item.reviewCount > 0 && (
                <span className="destination-review-count">
                  ({item.reviewCount.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')} {text('đánh giá', 'reviews')})
                </span>
              )}
            </div>
          ) : (
            <span className="destination-unrated">{text('Chưa có điểm đánh giá', 'Not rated yet')}</span>
          )}
        </div>

        {item.address && (
          <p className="destination-address rec-card-address">
            <Icon name="pin" size={14} />
            <span>{item.address}</span>
          </p>
        )}

        {/* Separated Recommendation Reasons (never mixed into Place Description) */}
        {item.reasons.length > 0 && (
          <div className="rec-reasons-box" aria-label={text('Lý do gợi ý', 'Recommendation reasons')}>
            <Icon name="sparkle" size={14} />
            <span>{item.reasons.join(' · ')}</span>
          </div>
        )}

        {/* Concise Place Summary */}
        <p className="rec-card-summary">
          {item.summary || text('Thông tin giới thiệu địa điểm đang được cập nhật.', 'Place summary coming soon.')}
        </p>

        <div className="rec-card-footer">
          <div className="destination-price">
            <span>{text('Giá tham khảo', 'Estimated price')}</span>
            <strong>{priceLabel}</strong>
          </div>
          <div className="rec-card-actions">
            <button
              type="button"
              className="btn-secondary btn-size-sm rec-add-trip-btn"
              onClick={() => onAddToTrip(item.place)}
              disabled={busy}
            >
              <Icon name="plus" size={15} />
              <span>{text('Thêm vào trip', 'Add to trip')}</span>
            </button>
            <button
              type="button"
              className="destination-detail rec-detail-btn"
              onClick={() => onSelectPlace(item.place)}
              disabled={busy}
            >
              <span>{text('Xem chi tiết', 'Details')}</span>
              <Icon name="arrow" size={16} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
