import { useEffect, useState } from 'react';
import { useAppPreferences } from '../../app/providers/AppPreferences';
import type { Resource } from '../../shared/api';
import { Icon } from '../../shared/ui';
import { placeImageCandidates } from '../places/media';
import type { RankedRecommendation } from './recommendation-engine';

export type RecommendationCardVariant = 'catalog' | 'lead' | 'featured' | 'dispatch' | 'compact';

interface RecommendationCardProps {
  item: RankedRecommendation;
  variant?: RecommendationCardVariant;
  isFavorite: boolean;
  isHighlighted: boolean;
  feedbackState?: 'ACCEPT' | 'SKIP';
  busy: boolean;
  onSelect: (place: Resource) => void;
  onToggleFavorite: (placeId: string) => void;
  onAddToTrip: (place: Resource) => void;
  onFeedback?: (placeId: string, action: 'ACCEPT' | 'SKIP') => void;
  onHover?: (placeId: string | null) => void;
}

export function RecommendationCard({
  item,
  variant = 'catalog',
  isFavorite,
  isHighlighted,
  feedbackState,
  busy,
  onSelect,
  onToggleFavorite,
  onAddToTrip,
  onFeedback,
  onHover,
}: RecommendationCardProps) {
  const { text, formatCurrency } = useAppPreferences();
  const candidates = placeImageCandidates(item.place);
  const candidateKey = candidates.join('|');
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    setImageIndex(0);
  }, [candidateKey]);

  const imageUrl = candidates[imageIndex] ?? '';
  const hasPhoto = Boolean(imageUrl);
  const provinceText = typeof item.place.province === 'string' && item.place.province.trim()
    ? item.place.province.trim()
    : '';
  const conciseLocation = provinceText || item.address || text('Việt Nam', 'Vietnam');
  const durationOrCatLabel = item.distanceKm !== null
    ? (item.distanceKm < 1 ? `${Math.round(item.distanceKm * 1000)} m` : `${item.distanceKm.toFixed(1)} km`)
    : item.categoryLabel;

  const priceDisplay = (() => {
    const min = item.minPrice;
    const max = item.maxPrice;
    if (min === null && max === null) {
      return { prefix: '', value: text('Xem chi tiết', 'View details'), muted: true };
    }
    if ((min ?? 0) === 0 && (max ?? 0) === 0) {
      return { prefix: '', value: text('Miễn phí', 'Free'), muted: false };
    }
    const base = min ?? max ?? 0;
    if (base === 0) {
      return { prefix: '', value: text('Miễn phí', 'Free'), muted: false };
    }
    return {
      prefix: text('Từ', 'From'),
      value: formatCurrency(base, item.currency),
      muted: false,
    };
  })();

  const handleImageError = () => {
    setImageIndex(current => (current + 1 < candidates.length ? current + 1 : candidates.length));
  };

  const renderFavoriteButton = (extraClass = '') => (
    <button
      type="button"
      className={`rec-fav-btn ${isFavorite ? 'is-active' : ''} ${extraClass}`.trim()}
      onClick={event => {
        event.stopPropagation();
        onToggleFavorite(item.placeId);
      }}
      disabled={busy}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? text('Bỏ yêu thích', 'Remove favorite') : text('Lưu địa điểm yêu thích', 'Save to favorites')}
      title={isFavorite ? text('Bỏ yêu thích', 'Remove favorite') : text('Lưu yêu thích', 'Save favorite')}
    >
      <Icon name="heart" size={15} />
    </button>
  );

  // ── Compact Map Split Row ──
  if (variant === 'compact') {
    return (
      <article
        className={`rec-compact-row ${isHighlighted ? 'is-highlighted' : ''}`}
        onMouseEnter={() => onHover?.(item.placeId)}
        onMouseLeave={() => onHover?.(null)}
      >
        <div
          className="rec-compact-thumb"
          onClick={() => onSelect(item.place)}
          role="button"
          tabIndex={0}
          aria-label={`${text('Xem chi tiết', 'View details')}: ${item.name}`}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(item.place);
            }
          }}
        >
          {hasPhoto ? (
            <img
              src={imageUrl}
              alt={item.name}
              width={120}
              height={90}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="rec-compact-img"
              onError={handleImageError}
            />
          ) : (
            <div className="rec-tour-media-fallback is-compact">
              <Icon name="compass" size={18} />
            </div>
          )}
        </div>

        <div className="rec-compact-body">
          <div className="rec-tour-meta">
            <span className="rec-tour-loc">
              <Icon name="pin" size={12} />
              <span>{conciseLocation}</span>
            </span>
            <span className="rec-tour-dur">#{item.rank} · {durationOrCatLabel}</span>
          </div>

          <h3 className="rec-tour-title">
            <button type="button" className="rec-title-btn" onClick={() => onSelect(item.place)}>
              {item.name}
            </button>
          </h3>

          <div className="rec-compact-bottom">
            <div className="rec-tour-rating">
              {item.rating !== null && item.rating > 0 ? (
                <>
                  <Icon name="star" size={13} className="rec-star-icon" />
                  <strong>{item.rating.toFixed(1)}</strong>
                  {item.reviewCount > 0 && <span className="rec-rating-count">({item.reviewCount})</span>}
                </>
              ) : (
                <span className="rec-rating-muted">{text('Chưa có đánh giá', 'No ratings yet')}</span>
              )}
              <span className="rec-meta-dot" aria-hidden="true">·</span>
              <span className={`rec-tour-price-val ${priceDisplay.muted ? 'is-muted' : ''}`}>
                {priceDisplay.prefix ? `${priceDisplay.prefix} ${priceDisplay.value}` : priceDisplay.value}
              </span>
            </div>

            <div className="rec-compact-actions">
              {renderFavoriteButton()}
              <button
                type="button"
                className="rec-micro-btn"
                onClick={() => onAddToTrip(item.place)}
                disabled={busy}
              >
                <Icon name="plus" size={12} />
                <span>{text('Chuyến đi', 'Trip')}</span>
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  // ── Primary Catalog Grid Card (Trevana Clean Borderless Photo-First) ──
  return (
    <article
      className={`rec-tour-card ${isHighlighted ? 'is-highlighted' : ''}`}
      onMouseEnter={() => onHover?.(item.placeId)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div
        className="rec-tour-media"
        onClick={() => onSelect(item.place)}
        role="button"
        tabIndex={0}
        aria-label={`${text('Xem chi tiết', 'View details')}: ${item.name}`}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(item.place);
          }
        }}
      >
        {hasPhoto ? (
          <img
            src={imageUrl}
            alt={item.name}
            width={480}
            height={360}
            loading={item.rank <= 8 ? 'eager' : 'lazy'}
            decoding="async"
            referrerPolicy="no-referrer"
            className="rec-tour-img"
            onError={handleImageError}
          />
        ) : (
          <div className="rec-tour-media-fallback">
            <Icon name="compass" size={26} />
            <span>{item.categoryLabel}</span>
          </div>
        )}
        {renderFavoriteButton('rec-tour-heart')}
      </div>

      <div className="rec-tour-body">
        <div className="rec-tour-meta">
          <span className="rec-tour-loc" title={conciseLocation}>
            <Icon name="pin" size={12} />
            <span>{conciseLocation}</span>
          </span>
          <span className="rec-tour-dur" title={durationOrCatLabel}>
            <Icon name={item.distanceKm !== null ? 'compass' : 'clock'} size={12} />
            <span>{durationOrCatLabel}</span>
          </span>
        </div>

        <h3 className="rec-tour-title">
          <button type="button" className="rec-title-btn" onClick={() => onSelect(item.place)}>
            {item.name}
          </button>
        </h3>

        <div className="rec-tour-rating">
          {item.rating !== null && item.rating > 0 ? (
            <>
              <Icon name="star" size={13} className="rec-star-icon" />
              <strong>{item.rating.toFixed(1)}</strong>
              {item.reviewCount > 0 && (
                <span className="rec-rating-count">({item.reviewCount})</span>
              )}
            </>
          ) : (
            <span className="rec-rating-muted">
              {text('Chưa có đánh giá', 'No ratings yet')}
            </span>
          )}
        </div>

        <div className="rec-tour-price-row">
          {priceDisplay.prefix && (
            <span className="rec-tour-price-prefix">{priceDisplay.prefix}</span>
          )}
          <span className={`rec-tour-price-val ${priceDisplay.muted ? 'is-muted' : ''}`}>
            {priceDisplay.value}
          </span>
        </div>

        <div className="rec-tour-foot">
          {item.reasons.length > 0 && (
            <p className="rec-tour-reason" title={item.reasons.join(' · ')}>
              {item.reasons[0]}
            </p>
          )}
          <div className="rec-tour-actions">
            {onFeedback && (
              <div className="rec-feedback-row" role="group" aria-label={text('Phản hồi gợi ý', 'Recommendation feedback')}>
                <button
                  type="button"
                  className={`rec-feedback-btn ${feedbackState === 'ACCEPT' ? 'is-active' : ''}`}
                  onClick={() => onFeedback(item.placeId, 'ACCEPT')}
                  aria-pressed={feedbackState === 'ACCEPT'}
                  title={text('Gợi ý phù hợp', 'Relevant suggestion')}
                >
                  {text('Phù hợp', 'Relevant')}
                </button>
                <button
                  type="button"
                  className={`rec-feedback-btn ${feedbackState === 'SKIP' ? 'is-active' : ''}`}
                  onClick={() => onFeedback(item.placeId, 'SKIP')}
                  aria-pressed={feedbackState === 'SKIP'}
                  title={text('Không phù hợp', 'Not for me')}
                >
                  {text('Bỏ qua', 'Skip')}
                </button>
              </div>
            )}
            <button
              type="button"
              className="rec-micro-btn"
              onClick={() => onAddToTrip(item.place)}
              disabled={busy}
              title={text('Thêm vào chuyến đi', 'Add to trip')}
            >
              <Icon name="plus" size={12} />
              <span>{text('Lịch trình', 'Add trip')}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
