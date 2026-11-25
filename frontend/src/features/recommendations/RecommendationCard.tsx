import { useEffect, useState } from 'react';
import { useAppPreferences } from '../../app/providers/AppPreferences';
import type { Resource } from '../../shared/api';
import { Icon } from '../../shared/ui';
import { placeImageCandidates } from '../places/media';
import type { RankedRecommendation } from './recommendation-engine';

export type RecommendationCardVariant = 'lead' | 'featured' | 'dispatch' | 'compact';

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

function formatRankNumber(rank: number): string {
  return rank < 10 ? `0${rank}` : `${rank}`;
}

export function RecommendationCard({
  item,
  variant = 'dispatch',
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
  const rankDisplay = formatRankNumber(item.rank);
  const provinceText = typeof item.place.province === 'string' && item.place.province.trim()
    ? item.place.province.trim()
    : '';

  const priceLabel = (() => {
    const min = item.minPrice;
    const max = item.maxPrice;
    if (min === null && max === null) return text('Chưa có thông tin giá', 'Price not available');
    if ((min ?? 0) === 0 && (max ?? 0) === 0) return text('Miễn phí', 'Free');
    if (min !== null && max !== null && min !== max) {
      return `${formatCurrency(min, item.currency)} – ${formatCurrency(max, item.currency)}`;
    }
    const single = min ?? max ?? 0;
    return single === 0 ? text('Miễn phí', 'Free') : formatCurrency(single, item.currency);
  })();

  const handleImageError = () => {
    setImageIndex(current => (current + 1 < candidates.length ? current + 1 : candidates.length));
  };

  const renderRatingMeta = () => {
    if (item.rating !== null && item.rating > 0) {
      return (
        <span className="rec-meta-rating">
          <Icon name="star" size={14} />
          <strong>{item.rating.toFixed(1)}</strong>
          {item.reviewCount > 0 && (
            <span className="rec-meta-count">({item.reviewCount})</span>
          )}
        </span>
      );
    }
    return (
      <span className="rec-meta-muted">
        {text('Chưa có đánh giá', 'No ratings yet')}
      </span>
    );
  };

  const renderReasons = (limit: number) => {
    if (item.reasons.length === 0) return null;
    return (
      <div className="rec-reasons-group" aria-label={text('Lý do gợi ý', 'Why recommended')}>
        <span className="rec-reasons-eyebrow">
          <Icon name="sparkle" size={12} />
          {text('Lý do gợi ý', 'Why recommended')}
        </span>
        <div className="rec-reasons-list">
          {item.reasons.slice(0, limit).map((reason, idx) => (
            <span key={`${item.placeId}-reason-${idx}`} className="rec-reason-tag">
              {reason}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const renderFavoriteButton = (extraClass = '') => (
    <button
      type="button"
      className={`rec-fav-btn ${isFavorite ? 'is-active' : ''} ${extraClass}`.trim()}
      onClick={() => onToggleFavorite(item.placeId)}
      disabled={busy}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? text('Bỏ yêu thích', 'Remove favorite') : text('Lưu địa điểm yêu thích', 'Save to favorites')}
      title={isFavorite ? text('Bỏ yêu thích', 'Remove favorite') : text('Lưu yêu thích', 'Save favorite')}
    >
      <Icon name="heart" size={17} />
    </button>
  );

  // ── Variant 1: Lead Editorial Spread (#1) ──
  if (variant === 'lead') {
    return (
      <article
        className={`rec-lead-spread ${hasPhoto ? 'has-photo' : 'is-typographic'} ${isHighlighted ? 'is-highlighted' : ''}`}
        onMouseEnter={() => onHover?.(item.placeId)}
        onMouseLeave={() => onHover?.(null)}
      >
        {hasPhoto ? (
          <div
            className="rec-lead-media"
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
            <img
              src={imageUrl}
              alt={item.name}
              width={800}
              height={520}
              loading="eager"
              decoding="async"
              className="rec-lead-img"
              onError={handleImageError}
            />
            <span className="rec-rank-stamp" aria-label={`${text('Hạng', 'Rank')} ${item.rank}`}>
              #{item.rank}
            </span>
            {renderFavoriteButton('rec-fav-overlay')}
          </div>
        ) : (
          <div
            className="rec-lead-folio"
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
            <div className="rec-folio-top">
              <span className="rec-folio-kicker">
                {text('ĐỀ XUẤT DẪN ĐẦU', 'TOP RANKED PICK')}
              </span>
              {renderFavoriteButton()}
            </div>
            <div className="rec-folio-numeral" aria-hidden="true">
              {rankDisplay}
            </div>
            <div className="rec-folio-foot">
              <span className="rec-folio-cat">{item.categoryLabel}</span>
              {provinceText && <span className="rec-folio-region">{provinceText}</span>}
            </div>
          </div>
        )}

        <div className="rec-lead-dossier">
          <div className="rec-dossier-meta">
            <span className="rec-rank-inline">#{item.rank}</span>
            <span className="rec-meta-sep" aria-hidden="true">/</span>
            <span className="rec-meta-cat">{item.categoryLabel}</span>
            <span className="rec-meta-sep" aria-hidden="true">·</span>
            {renderRatingMeta()}
          </div>

          <h3 className="rec-lead-title">
            <button type="button" className="rec-title-btn" onClick={() => onSelect(item.place)}>
              {item.name}
            </button>
          </h3>

          <div className="rec-address-row">
            <Icon name="pin" size={14} />
            <span>{item.address || text('Việt Nam', 'Vietnam')}</span>
            {item.distanceKm !== null && (
              <span className="rec-distance-chip">
                {item.distanceKm < 1
                  ? `${Math.round(item.distanceKm * 1000)} m`
                  : `${item.distanceKm.toFixed(1)} km`}
              </span>
            )}
          </div>

          {renderReasons(2)}

          {onFeedback && (
            <div className="rec-feedback-row" role="group" aria-label={text('Phản hồi gợi ý', 'Recommendation feedback')}>
              <button
                type="button"
                className={`rec-feedback-btn ${feedbackState === 'ACCEPT' ? 'is-active' : ''}`}
                onClick={() => onFeedback(item.placeId, 'ACCEPT')}
                aria-pressed={feedbackState === 'ACCEPT'}
              >
                {text('Phù hợp', 'Relevant')}
              </button>
              <button
                type="button"
                className={`rec-feedback-btn ${feedbackState === 'SKIP' ? 'is-active' : ''}`}
                onClick={() => onFeedback(item.placeId, 'SKIP')}
                aria-pressed={feedbackState === 'SKIP'}
              >
                {text('Không phù hợp', 'Not for me')}
              </button>
            </div>
          )}

          <p className="rec-lead-summary">
            {item.summary || text('Khám phá thông tin chi tiết, địa chỉ chính xác và gợi ý thời điểm ghé thăm cho điểm đến này.', 'Explore full details, verified location, and visit recommendations for this destination.')}
          </p>

          <div className="rec-dossier-footer">
            <div className="rec-price-block">
              <span className="rec-price-caption">{text('Chi phí tham khảo', 'Estimated budget')}</span>
              <span className="rec-price-value">{priceLabel}</span>
            </div>
            <div className="rec-action-group">
              <button
                type="button"
                className="rec-btn-secondary"
                onClick={() => onAddToTrip(item.place)}
                disabled={busy}
              >
                <Icon name="plus" size={15} />
                <span>{text('Thêm vào chuyến đi', 'Add to trip')}</span>
              </button>
              <button
                type="button"
                className="rec-btn-primary"
                onClick={() => onSelect(item.place)}
              >
                <span>{text('Xem chi tiết', 'View details')}</span>
                <Icon name="arrow" size={15} />
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  // ── Variant 2: Featured Editorial Pair (#2, #3) ──
  if (variant === 'featured') {
    return (
      <article
        className={`rec-feat-card ${hasPhoto ? 'has-photo' : 'is-typographic'} ${isHighlighted ? 'is-highlighted' : ''}`}
        onMouseEnter={() => onHover?.(item.placeId)}
        onMouseLeave={() => onHover?.(null)}
      >
        {hasPhoto ? (
          <div
            className="rec-feat-media"
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
            <img
              src={imageUrl}
              alt={item.name}
              width={640}
              height={400}
              loading="lazy"
              decoding="async"
              className="rec-feat-img"
              onError={handleImageError}
            />
            <span className="rec-rank-stamp" aria-label={`${text('Hạng', 'Rank')} ${item.rank}`}>
              #{item.rank}
            </span>
            {renderFavoriteButton('rec-fav-overlay')}
          </div>
        ) : (
          <div className="rec-feat-folio">
            <div className="rec-feat-folio-left">
              <span className="rec-feat-numeral" aria-hidden="true">{rankDisplay}</span>
              <div className="rec-feat-folio-meta">
                <span className="rec-rank-inline">#{item.rank}</span>
                <span className="rec-meta-cat">{item.categoryLabel}</span>
              </div>
            </div>
            {renderFavoriteButton()}
          </div>
        )}

        <div className="rec-feat-body">
          {hasPhoto ? (
            <div className="rec-dossier-meta">
              <span className="rec-meta-cat">{item.categoryLabel}</span>
              <span className="rec-meta-sep" aria-hidden="true">·</span>
              {renderRatingMeta()}
            </div>
          ) : (
            <div className="rec-dossier-meta">
              {renderRatingMeta()}
              {provinceText && (
                <>
                  <span className="rec-meta-sep" aria-hidden="true">·</span>
                  <span className="rec-meta-muted">{provinceText}</span>
                </>
              )}
            </div>
          )}

          <h3 className="rec-feat-title">
            <button type="button" className="rec-title-btn" onClick={() => onSelect(item.place)}>
              {item.name}
            </button>
          </h3>

          <div className="rec-address-row">
            <Icon name="pin" size={13} />
            <span>{item.address || text('Việt Nam', 'Vietnam')}</span>
            {item.distanceKm !== null && (
              <span className="rec-distance-chip">
                {item.distanceKm < 1
                  ? `${Math.round(item.distanceKm * 1000)} m`
                  : `${item.distanceKm.toFixed(1)} km`}
              </span>
            )}
          </div>

          {renderReasons(2)}

          <p className="rec-feat-summary">
            {item.summary || text('Xem địa chỉ, đánh giá cộng đồng và lưu vào hành trình sắp tới.', 'View location, traveler reviews, and add to your upcoming itinerary.')}
          </p>

          <div className="rec-feat-footer">
            <span className="rec-price-value">{priceLabel}</span>
            <div className="rec-action-group">
              <button
                type="button"
                className="rec-btn-secondary rec-btn-sm"
                onClick={() => onAddToTrip(item.place)}
                disabled={busy}
              >
                <Icon name="plus" size={14} />
                <span>{text('Chuyến đi', 'Trip')}</span>
              </button>
              <button
                type="button"
                className="rec-btn-primary rec-btn-sm"
                onClick={() => onSelect(item.place)}
              >
                <span>{text('Chi tiết', 'Details')}</span>
                <Icon name="arrow" size={14} />
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  // ── Variant 3 & 4: Editorial Dispatch Row (#4+) & Compact Map Row ──
  const isCompact = variant === 'compact';

  return (
    <article
      className={`rec-dispatch-row ${isCompact ? 'is-compact' : ''} ${hasPhoto ? 'has-photo' : 'no-photo'} ${isHighlighted ? 'is-highlighted' : ''}`}
      onMouseEnter={() => onHover?.(item.placeId)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className="rec-dispatch-rank" aria-label={`${text('Hạng', 'Rank')} ${item.rank}`}>
        <span className="rec-dispatch-num">{rankDisplay}</span>
        <span className="rec-dispatch-hash">#{item.rank}</span>
      </div>

      {hasPhoto && (
        <div
          className="rec-dispatch-thumb"
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
          <img
            src={imageUrl}
            alt={item.name}
            width={192}
            height={144}
            loading="lazy"
            decoding="async"
            className="rec-dispatch-img"
            onError={handleImageError}
          />
        </div>
      )}

      <div className="rec-dispatch-main">
        <div className="rec-dossier-meta">
          <span className="rec-meta-cat">{item.categoryLabel}</span>
          <span className="rec-meta-sep" aria-hidden="true">·</span>
          {renderRatingMeta()}
          {item.distanceKm !== null && (
            <>
              <span className="rec-meta-sep" aria-hidden="true">·</span>
              <span className="rec-distance-chip">
                {item.distanceKm < 1
                  ? `${Math.round(item.distanceKm * 1000)} m`
                  : `${item.distanceKm.toFixed(1)} km`}
              </span>
            </>
          )}
        </div>

        <h3 className="rec-dispatch-title">
          <button type="button" className="rec-title-btn" onClick={() => onSelect(item.place)}>
            {item.name}
          </button>
        </h3>

        <div className="rec-address-row">
          <Icon name="pin" size={13} />
          <span>{item.address || text('Việt Nam', 'Vietnam')}</span>
        </div>

        {renderReasons(isCompact ? 1 : 2)}

        {!isCompact && item.summary && (
          <p className="rec-dispatch-summary">{item.summary}</p>
        )}
      </div>

      <div className="rec-dispatch-side">
        <span className="rec-price-value">{priceLabel}</span>
        <div className="rec-dispatch-actions">
          {renderFavoriteButton()}
          <button
            type="button"
            className="rec-btn-secondary rec-btn-sm"
            onClick={() => onAddToTrip(item.place)}
            disabled={busy}
            title={text('Thêm vào chuyến đi', 'Add to trip')}
          >
            <Icon name="plus" size={14} />
            <span>{text('Chuyến đi', 'Trip')}</span>
          </button>
          <button
            type="button"
            className="rec-btn-primary rec-btn-sm"
            onClick={() => onSelect(item.place)}
          >
            <span>{text('Xem', 'View')}</span>
            <Icon name="arrow" size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
