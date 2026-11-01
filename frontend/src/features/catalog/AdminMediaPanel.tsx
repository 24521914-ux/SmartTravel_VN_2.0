import { useState, type FormEvent } from 'react';
import { type ApiClient, type Resource } from '../../shared/api';
import { Button } from '../../shared/ui';

export function AdminMediaPanel({ apiClient }: { apiClient: ApiClient }) {
  const [media, setMedia] = useState<Resource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>, upload: boolean) {
    e.preventDefault(); const data = new FormData(e.currentTarget);
    setBusy(true); setError('');
    try {
      const result = upload
        ? await apiClient.request<Resource>('catalog', '/api/v1/admin/media', { method: 'POST', multipart: data, idempotencyKey: crypto.randomUUID() })
        : await apiClient.request<Resource>('catalog', `/api/v1/admin/media/${encodeURIComponent(String(data.get('media_id')))}/review`, { method: 'POST', body: { action: data.get('action'), reason: data.get('reason') }, idempotencyKey: crypto.randomUUID() });
      setMedia(upload ? result : await apiClient.request<Resource>('catalog', `/api/v1/admin/media/${encodeURIComponent(String(data.get('media_id')))}`));
    } catch (error) { setError(error instanceof Error ? error.message : 'Không xử lý được ảnh.'); }
    finally { setBusy(false); }
  }
  return <section className="travel-panel"><h2>Ảnh địa điểm</h2>
    <p>Ảnh PNG/JPEG tối đa 10 MB. Ảnh được cách ly sau khi tải lên và chỉ hiển thị công khai sau khi máy quét an toàn và quản trị viên duyệt.</p>
    {error && <p role="alert">{error}</p>}
    <form className="clay-form" onSubmit={e => void submit(e, true)}><label htmlFor="media-file">Ảnh cần tải lên<input id="media-file" type="file" name="file" accept="image/png,image/jpeg" required /></label><Button type="submit" disabled={busy}>Tải ảnh lên</Button></form>
    <form className="clay-form" key={String(media?.media_id ?? 'review')} onSubmit={e => void submit(e, false)}><label htmlFor="media-id">Mã ảnh<input id="media-id" name="media_id" required pattern="[0-9a-fA-F-]{36}" defaultValue={String(media?.media_id ?? '')} /></label><label htmlFor="media-action">Quyết định ảnh<select id="media-action" name="action"><option value="APPROVE">Duyệt sau khi quét</option><option value="REJECT">Từ chối</option><option value="REVOKE">Thu hồi</option></select></label><label htmlFor="media-reason">Lý do xử lý ảnh<input id="media-reason" name="reason" required maxLength={1024} /></label><Button type="submit" disabled={busy}>Lưu quyết định ảnh</Button></form>
    {media && <div role="status"><p>Mã ảnh: {String(media.media_id)} · Trạng thái: {String(media.moderation_status)} · Mã tài nguyên: {String(media.object_key)}</p>{media.moderation_status === 'APPROVED' && <img src={`/api/catalog/api/v1/media/${encodeURIComponent(String(media.media_id))}`} alt="Ảnh đã được duyệt" style={{ maxWidth: '100%', maxHeight: 320 }} />}</div>}
  </section>;
}
