import { useEffect, useState, type FormEvent } from 'react';
import { Icon, Button } from '../../shared/ui';
import type { TravelClient, Resource, Page } from '../../shared/api';
import { useToast } from '../../app/providers/ToastProvider';

export interface ModerationConsoleProps {
  travel: TravelClient;
  busy?: boolean;
}

const resourceId = (row: Resource) => String(row.report_id ?? row.request_id ?? row.id ?? row.review_id ?? row.place_id ?? row.contribution_id ?? '');
type ModerationKind = 'reviews' | 'places' | 'contributions' | 'reports';

export function ModerationConsole({ travel, busy = false }: ModerationConsoleProps) {
  const { showToast } = useToast();
  const [items, setItems] = useState<Resource[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ModerationKind>('reviews');
  const [reason, setReason] = useState('');

  async function loadItems() {
    setError('');
    setLoading(true);
    try {
      const endpoint = `/admin/${mode}`;
      const service = mode === 'places' ? 'catalog' : 'community';
      const data = await travel.readAll(service, endpoint);
      setItems(data.items ?? []);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không tải được hàng chờ.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setItems([]);
    void loadItems();
  }, [mode, travel]);

  async function handleModerateItem(item: Resource, action: string) {
    if (mode !== 'places' && !reason.trim()) { setError('Nhập lý do trước khi lưu quyết định kiểm duyệt.'); return; }
    const id = resourceId(item);
    const version = Number(item.version ?? 1);
    setError('');
    setLoading(true);
    try {
      if (mode !== 'places') {
        const result = await travel.mutate('community', `/admin/${mode}/${encodeURIComponent(id)}/moderate`, { action, reason: reason.trim() }, 'POST', version);
        showToast(result.status === 'APPLYING' ? 'Đã duyệt; đang chờ Catalog áp dụng đóng góp.' : 'Đã lưu quyết định kiểm duyệt.', 'success');
      } else {
        await travel.mutate('catalog', `/admin/places/${encodeURIComponent(id)}/status`, { status: action }, 'PUT', version);
        showToast(`Đã cập nhật trạng thái mục sang ${action}`, 'success');
      }
      setItems(prev => prev.filter(r => resourceId(r) !== id));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không lưu được quyết định.');
    } finally {
      setLoading(false);
    }
  }

  async function reviewBusiness(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget);
    setError(''); setLoading(true);
    try {
      await travel.mutate('catalog', `/admin/${String(data.get('kind'))}/${encodeURIComponent(String(data.get('verification')))}/review`,
        { action: data.get('action'), reason: data.get('reason') }, 'POST', Number(data.get('version')));
      showToast('Đã lưu quyết định xét duyệt.', 'success');
    } catch (error) { setError(error instanceof Error ? error.message : 'Không lưu được quyết định.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="moderation-console-layout" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {error && <p role="alert">{error}</p>}
      {/* Moderation Controls Bar */}
      <section className="travel-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Nội dung kiểm duyệt:</span>
            <select
              value={mode}
              disabled={loading || busy}
              onChange={e => setMode(e.target.value as ModerationKind)}
              style={{ width: 'auto' }}
            >
              <option value="reviews">Đánh giá người dùng</option>
              <option value="places">Địa điểm đề xuất</option>
              <option value="contributions">Đóng góp địa điểm</option>
              <option value="reports">Báo cáo vi phạm</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => void loadItems()}
          disabled={loading || busy}
        >
          <Icon name="refresh" size={15} /> Tải lại kiểm duyệt
        </button>
      </section>

      {/* Accordion for KYC Business Verification Approval */}
      {mode !== 'places' && <label htmlFor="moderation-reason">Lý do kiểm duyệt<input id="moderation-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={1024} /></label>}
      <details className="travel-panel kyc-review-accordion" style={{ padding: '18px 24px' }}>
        <summary style={{ fontWeight: 700, fontSize: '1.05rem', cursor: 'pointer', outline: 'none' }}>
          Xét duyệt hồ sơ xác minh doanh nghiệp & Claim địa điểm
        </summary>
        <form
          onSubmit={e => void reviewBusiness(e)}
          className="clay-form"
          style={{ marginTop: '16px', maxWidth: '520px' }}
        >
          <div className="form-group">
            <label htmlFor="verify-id">Mã hồ sơ xác minh (UUID)</label>
            <input id="verify-id" name="verification" required placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </div>
          <div className="form-group"><label htmlFor="verify-kind">Loại hồ sơ</label><select id="verify-kind" name="kind"><option value="business-verifications">Xác minh doanh nghiệp</option><option value="claims">Claim địa điểm</option><option value="change-requests">Yêu cầu sửa địa điểm</option></select></div>
          <div className="form-group"><label htmlFor="verify-version">Phiên bản hồ sơ</label><input id="verify-version" name="version" type="number" min="1" step="1" required /></div>
          <div className="form-group">
            <label htmlFor="verify-action">Quyết định</label>
            <select id="verify-action" name="action">
              <option value="APPROVE">Duyệt hồ sơ (APPROVE)</option>
              <option value="REJECT">Từ chối (REJECT)</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="verify-reason">Lý do nhận xét</label>
            <input id="verify-reason" name="reason" required placeholder="Giấy tờ hợp lệ, đúng thông tin đăng ký..." />
          </div>
          <Button type="submit" disabled={loading || busy} icon="check">
            Lưu quyết định xác minh
          </Button>
        </form>
      </details>

      {/* Moderation Items Grid */}
      <div className="travel-grid">
        {items.map((item, idx) => {
          const id = resourceId(item) || idx;
          const title = String(item.title ?? item.name ?? item.content ?? (item.fields as Resource | undefined)?.name ?? item.reason ?? 'Mục kiểm duyệt');
          return (
            <article key={String(id)} className="travel-panel moderation-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ width: 36, height: 36, borderRadius: 'var(--radius-button)', background: 'var(--color-primary-light)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={mode === 'reviews' ? 'star' : 'pin'} size={18} />
                </span>
                <span className="status-pill status-pending">{String(item.report_status ?? item.status ?? 'Chờ duyệt')}</span>
              </div>

              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '4px 0' }}>{title}</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                  {String(item.description ?? item.body ?? item.content ?? item.reason ?? 'Nội dung cần thẩm định tính chính xác và chuẩn mực cộng đồng.')}
                </p>
                {mode === 'reports' && item.review_id != null && <p>Đánh giá được báo cáo: {String(item.review_id)}</p>}
                {mode === 'reports' && item.review_content != null && <blockquote>{String(item.review_content)}</blockquote>}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--color-border-subtle)' }}>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={loading || busy}
                  onClick={() => void handleModerateItem(item, mode === 'places' ? 'PUBLISHED' : 'APPROVE')}
                >
                  <Icon name="check" size={14} /> Duyệt
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={loading || busy}
                  onClick={() => void handleModerateItem(item, mode === 'places' ? 'HIDDEN' : 'REJECT')}
                >
                  <Icon name="x" size={14} /> Từ chối
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      {!loading && !error && items.length === 0 && (
        <div className="empty-subtle">
          <Icon name="check" size={36} />
          <p>Chưa có nội dung cần kiểm duyệt. Mọi dữ liệu đang tuân thủ quy chuẩn!</p>
        </div>
      )}
    </div>
  );
}
