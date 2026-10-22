import { Icon } from './Icon';

export interface RatingStarsProps {
  rating: number;
  max?: number;
  size?: number;
  interactive?: boolean;
  onChange?: (rating: number) => void;
}

export function RatingStars({ rating, max = 5, size = 16, interactive = false, onChange }: RatingStarsProps) {
  return (
    <div
      className="rating-stars"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}
      aria-label={`Đánh giá: ${rating} trên ${max} sao`}
    >
      {Array.from({ length: max }, (_, index) => {
        const starValue = index + 1;
        const isFilled = starValue <= Math.round(rating);
        return interactive ? (
          <button
            type="button"
            key={index}
            onClick={() => onChange?.(starValue)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              color: isFilled ? 'var(--color-accent)' : 'var(--color-border-strong)'
            }}
            aria-label={`${starValue} sao`}
          >
            <Icon name="star" size={size} />
          </button>
        ) : (
          <span
            key={index}
            style={{
              color: isFilled ? 'var(--color-accent)' : 'var(--color-border)'
            }}
          >
            <Icon name="star" size={size} />
          </span>
        );
      })}
    </div>
  );
}
