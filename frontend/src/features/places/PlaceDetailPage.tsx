import { useEffect, useState, type FormEvent } from 'react';
import { Icon, RatingStars, Badge, Button } from '../../shared/ui';
import type { TravelClient, Resource, Page } from '../../shared/api';
import { useAuth } from '../../app/providers/AuthProvider';
import { useToast } from '../../app/providers/ToastProvider';
import { mediaUrl, placeImage } from './media';

export interface PlaceDetailPageProps {
  place: Resource;
  travel: TravelClient;
  onBack: () => void;
  onAddToTrip?: (place: Resource) => void;
  busy?: boolean;
}

export function PlaceDetailPage({ place, travel, onBack, onAddToTrip, busy = false }: PlaceDetailPageProps) {
  const { showToast } = useToast();
  const { isAuthenticated, user, apiClient } = useAuth();
  const [reviews, setReviews] = useState<Resource[]>([]);
  const [offerings, setOfferings] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaved, setIsSaved] = useState<boolean | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewContent, setReviewContent] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [ownReview, setOwnReview] = useState<Resource | null>(null);
  const [reviewMedia, setReviewMedia] = useState<Resource[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const placeId = String(place.id ?? place.place_id ?? '');
  const name = String(place.name ?? place.title ?? 'Chi tiết địa điểm');
  const address = String(place.address ?? 'Chưa có địa chỉ');
  const lat = Number(place.latitude);
  const lon = Number(place.longitude);
  const hasCoordinates = place.latitude != null && place.longitude != null && Number.isFinite(lat) && Number.isFinite(lon);

  useEffect(() => {
    async function loadDetails() {
      setLoading(true);
      setDetailError('');
      setReviews([]);
      setOfferings([]);
      try {
        const reviewData = await travel.readAll('community', `/places/${encodeURIComponent(placeId)}/reviews`);
        setReviews(reviewData.items ?? []);

        const offeringData = await travel.readAll('catalog', `/places/${encodeURIComponent(placeId)}/offerings`);
        setOfferings(offeringData.items ?? []);
      } catch (error) {
        setDetailError((error as Error).message || 'Không thể tải đánh giá và dịch vụ.');
      } finally {
        setLoading(false);
      }
    }
    void loadDetails();
  }, [placeId, travel]);

  useEffect(() => {
    let active = true;
    setIsSaved(isAuthenticated ? null : false);
    if (isAuthenticated) {
      void travel.readAll('community', '/me/favorites').then(data => {
        if (active) setIsSaved(data.items.some(row => String(row.place_id ?? row.id) === placeId));
      }).catch(error => { if (active) showToast((error as Error).message || 'Không thể tải trạng thái yêu thích.', 'error'); });
    }
    return () => { active = false; };
  }, [travel, placeId, isAuthenticated]);

  async function handleToggleFavorite() {
    if (favoriteBusy || isSaved === null) return;
    setFavoriteBusy(true);
    try {
      if (isSaved) {
        await travel.mutate('community', `/me/favorites/${encodeURIComponent(placeId)}`, {}, 'DELETE');
        setIsSaved(false);
        showToast(`Đã bỏ lưu ${name}`, 'info');
      } else {
        await travel.mutate('community', `/me/favorites/${encodeURIComponent(placeId)}`, {}, 'PUT');
        setIsSaved(true);
        showToast(`Đã lưu ${name} vào danh sách yêu thích`, 'success');
      }
    } catch (error) {
      showToast((error as Error).message || 'Không thể lưu thay đổi yêu thích.', 'error');
    } finally { setFavoriteBusy(false); }
  }

  async function handleSubmitReview(e: FormEvent) {
    e.preventDefault();
    if (!reviewContent.trim()) return;
    setSubmittingReview(true);
    try {
      const created = await travel.review(placeId, reviewRating, reviewContent.trim(), reviewMedia.map(media => String(media.object_key)));
      setOwnReview(created);
      showToast('Đã gửi đánh giá, đang chờ kiểm duyệt.', 'success');
      setReviewContent('');
      setReviewMedia([]);
      setShowReviewForm(false);
    } catch {
      showToast('Không thể gửi đánh giá. Vui lòng thử lại.', 'error');
    } finally {
      setSubmittingReview(false);
    }
  }

  async function uploadReviewImage(file: File) {
    setUploadingMedia(true);
    try {
      const form = new FormData(); form.set('file', file);
      const media = await apiClient.request<Resource>('catalog', '/api/v1/media', { method: 'POST', multipart: form, idempotencyKey: crypto.randomUUID() });
      setReviewMedia(previous => [...previous, media]);
      showToast('Ảnh đã được tải lên và đang chờ quét, kiểm duyệt.', 'info');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Không tải được ảnh.', 'error'); }
    finally { setUploadingMedia(false); }
  }

  async function editReview(event: FormEvent<HTMLFormElement>, review: Resource) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmittingReview(true);
    try {
      const updated = await travel.mutate<Resource>('community', `/reviews/${String(review.review_id ?? review.id)}`, {
        rating: Number(form.get('rating')), content: form.get('content'), media_keys: review.media_keys ?? []
      }, 'PATCH', Number(review.version));
      setOwnReview(updated);
      setReviews((await travel.readAll('community', `/places/${placeId}/reviews`)).items);
      showToast('Đã sửa đánh giá, đang chờ kiểm duyệt.', 'success');
    } catch (error) { showToast((error as Error).message, 'error'); }
    finally { setSubmittingReview(false); }
  }

  async function deleteReview(review: Resource) {
    setSubmittingReview(true);
    try {
      await travel.mutate('community', `/reviews/${String(review.review_id ?? review.id)}`, undefined, 'DELETE', Number(review.version));
      if (ownReview && String(ownReview.review_id ?? ownReview.id) === String(review.review_id ?? review.id)) setOwnReview(null);
      setReviews((await travel.readAll('community', `/places/${placeId}/reviews`)).items);
      showToast('Đã xóa đánh giá.', 'success');
    } catch (error) { showToast((error as Error).message, 'error'); }
    finally { setSubmittingReview(false); }
  }

  async function reportReview(event: FormEvent<HTMLFormElement>, review: Resource) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmittingReview(true);
    try {
      await travel.mutate('community', `/reviews/${String(review.review_id ?? review.id)}/reports`, { reason: form.get('reason') });
      showToast('Đã gửi báo cáo cho quản trị viên.', 'success');
    } catch (error) { showToast((error as Error).message, 'error'); }
    finally { setSubmittingReview(false); }
  }

  function reviewEditor(review: Resource) {
    return <form key={`${String(review.review_id ?? review.id)}-${String(review.version)}`} onSubmit={event => void editReview(event, review)}>
      <label>Số sao mới<input name="rating" type="number" min="1" max="5" defaultValue={Number(review.rating)} required /></label>
      <label>Nội dung đánh giá mới<textarea name="content" defaultValue={String(review.content)} required maxLength={1024} /></label>
      <Button type="submit" disabled={submittingReview}>Lưu đánh giá</Button>
      <button type="button" disabled={submittingReview} onClick={() => void deleteReview(review)}>Xóa đánh giá</button>
    </form>;
  }

  return (
    <div className="place-detail-container" style={{ animation: 'fadeIn 200ms ease' }}>
      {/* Top back & actions toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <button type="button" className="btn-secondary" onClick={onBack}>
          <Icon name="arrow" size={16} style={{ transform: 'rotate(180deg)' }} />
          <span>Quay lại danh sách</span>
        </button>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={handleToggleFavorite}
            disabled={busy || favoriteBusy || isSaved === null}
            aria-pressed={Boolean(isSaved)}
          >
            <Icon name="heart" size={16} />
            <span>{isSaved ? 'Đã lưu yêu thích' : 'Lưu yêu thích'}</span>
          </button>
          {onAddToTrip && (
            <button type="button" className="btn-secondary" onClick={() => onAddToTrip(place)}>
              <Icon name="plus" size={16} />
              <span>Thêm vào chuyến đi</span>
            </button>
          )}
        </div>
      </div>

      {detailError && <p role="alert">{detailError}</p>}
      {placeImage(place) && <img src={placeImage(place)} alt={name} style={{ width: '100%', maxHeight: 420, objectFit: 'cover' }} />}
      {/* Main Place Header */}
      <div className="travel-panel" style={{ padding: 'var(--space-2xl) var(--space-xl)', marginBottom: 'var(--space-xl)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <Badge variant="primary">{String(place.category_name ?? place.category ?? 'Điểm đến')}</Badge>
            <h1 style={{ fontSize: '2.4rem', fontWeight: 800, marginTop: '8px', marginBottom: '8px' }}>
              {name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-secondary)', fontSize: '0.9375rem' }}>
              <Icon name="pin" size={18} />
              <span>{address}</span>
              {hasCoordinates && (
                <span style={{ color: 'var(--color-text-muted)' }}>
                  · Vĩ độ {lat.toFixed(2)}, Kinh độ {lon.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {typeof place.rating === 'number' && <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--color-surface-subtle)', padding: '12px 18px', borderRadius: 'var(--radius-button)' }}>
            <RatingStars rating={place.rating} size={20} />
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {place.rating.toFixed(1)}
            </span>
          </div>}
        </div>

        {/* Description & Highlights */}
        <div style={{ marginTop: '24px', borderTop: '1px solid var(--color-border-subtle)', paddingTop: '20px' }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '10px' }}>Giới thiệu</h3>
          <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--color-text-secondary)', maxWidth: '80ch' }}>
            {String(place.description ?? 'Thông tin giới thiệu địa điểm đang được cập nhật.')}
          </p>
        </div>

        {/* Offerings and Services */}
        {offerings.length > 0 && (
          <div style={{ marginTop: '28px', borderTop: '1px solid var(--color-border-subtle)', paddingTop: '20px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '14px' }}>Dịch vụ & Trải nghiệm tại điểm đến</h3>
            <div className="travel-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {offerings.map(off => (
                <div key={String(off.id ?? off.offering_id)} style={{ padding: '16px', background: 'var(--color-surface-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  <h4 style={{ fontSize: '1rem', marginBottom: '6px' }}>{String(off.name ?? off.title ?? 'Tour trải nghiệm')}</h4>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>{String(off.description ?? '')}</p>
                  <strong style={{ color: 'var(--color-primary)', fontSize: '0.9375rem' }}>{off.price == null ? 'Chưa có giá' : `${Number(off.price).toLocaleString('vi-VN')} VND`}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* REVIEWS SECTION — with exact heading 'Đánh giá' required by tests */}
      <section className="travel-panel" aria-label="Đánh giá từ du khách">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 700 }}>Đánh giá</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
              Cảm nhận và chia sẻ chân thực từ những người đã ghé thăm
            </p>
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowReviewForm(!showReviewForm)}
          >
            <Icon name="edit" size={16} />
            <span>Viết đánh giá</span>
          </button>
        </div>

        {/* Write Review Form */}
        {showReviewForm && (
          <form
            onSubmit={handleSubmitReview}
            style={{
              background: 'var(--color-surface-subtle)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '20px',
              marginBottom: '24px'
            }}
          >
            <h4 style={{ marginBottom: '12px' }}>Đánh giá của bạn</h4>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.875rem' }}>
                Số sao hài lòng:
              </label>
              <RatingStars
                rating={reviewRating}
                interactive
                size={22}
                onChange={setReviewRating}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label htmlFor="review-content-input" style={{ display: 'block', marginBottom: '6px', fontSize: '0.875rem' }}>
                Nội dung chia sẻ:
              </label>
              <textarea
                id="review-content-input"
                rows={4}
                required
                value={reviewContent}
                onChange={e => setReviewContent(e.target.value)}
                placeholder="Chia sẻ cảm nhận về chuyến đi, thời điểm thích hợp ghé thăm và các mẹo hữu ích..."
                style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-button)', border: '1px solid var(--color-border)', fontSize: '0.9375rem' }}
              />
            </div>

            <label htmlFor="review-image">Ảnh chia sẻ (PNG/JPEG, tối đa 10 MB)<input id="review-image" type="file" accept="image/png,image/jpeg" disabled={uploadingMedia || submittingReview} onChange={e => { const file = e.target.files?.[0]; if (file) void uploadReviewImage(file); e.target.value = ''; }} /></label>
            {reviewMedia.map(media => <p key={String(media.media_id)}>Ảnh {String(media.media_id)} · Chờ quét và duyệt <button type="button" onClick={() => setReviewMedia(previous => previous.filter(item => item !== media))}>Bỏ ảnh khỏi đánh giá</button></p>)}
            <div style={{ display: 'flex', gap: '10px' }}>
              <Button type="submit" loading={submittingReview} disabled={uploadingMedia}>
                Gửi đánh giá
              </Button>
              <button
                type="button"
                className="btn-subtle"
                onClick={() => setShowReviewForm(false)}
              >
                Hủy
              </button>
            </div>
          </form>
        )}

        {/* Reviews List */}
        {ownReview && <section aria-label="Đánh giá đang chờ kiểm duyệt"><h3>Đánh giá của bạn · {String(ownReview.status)}</h3>{reviewEditor(ownReview)}</section>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {reviews.length > 0 ? (
            reviews.map((rev, idx) => (
              <div
                key={String(rev.id ?? idx)}
                style={{
                  padding: '16px',
                  background: '#ffffff',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-primary-light)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8125rem' }}>
                      {(String(rev.author_name ?? rev.display_name ?? 'D'))[0].toUpperCase()}
                    </div>
                    <strong style={{ fontSize: '0.9375rem' }}>
                      {String(rev.author_name ?? rev.display_name ?? 'Du khách')}
                    </strong>
                  </div>
                  <RatingStars rating={Number(rev.rating ?? 5)} size={14} />
                </div>
                <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  {String(rev.content ?? rev.body ?? rev.title ?? '')}
                </p>
                {Array.isArray(rev.media_keys) && rev.media_keys.filter((key): key is string => typeof key === 'string').map(key => mediaUrl(key) ? <img key={key} src={mediaUrl(key)} alt="Ảnh chia sẻ từ đánh giá" loading="lazy" style={{ maxWidth: '100%', maxHeight: 240 }} onError={e => { e.currentTarget.hidden = true; }} /> : null)}
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {rev.created_at ? new Date(String(rev.created_at)).toLocaleDateString('vi-VN') : ''}
                </span>
                {isAuthenticated && String(rev.user_id) === String(user?.user_id ?? user?.id) ? reviewEditor(rev) : isAuthenticated && <form onSubmit={event => void reportReview(event, rev)}><label>Lý do báo cáo<input name="reason" required maxLength={1024} /></label><button type="submit" disabled={submittingReview}>Báo cáo đánh giá</button></form>}
              </div>
            ))
          ) : (
            <div className="empty-subtle">
              <Icon name="star" size={28} />
              <p>Chưa có đánh giá nào cho địa điểm này. Hãy là người đầu tiên chia sẻ!</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
