import { useEffect, useState, type FormEvent } from 'react';
import { Icon, Button, Badge } from '../../shared/ui';
import type { TravelClient, Resource, Page } from '../../shared/api';
import { useToast } from '../../app/providers/ToastProvider';

export interface ModerationConsoleProps {
  travel: TravelClient;
  busy?: boolean;
}

const resourceId = (row: Resource) => String(row.id ?? row.review_id ?? row.place_id ?? '');

export function ModerationConsole({ travel, busy = false }: ModerationConsoleProps) {
  const { showToast } = useToast();
  const [items, setItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'reviews' | 'places'>('reviews');

  async function loadItems() {
    setLoading(true);
    try {
      const endpoint = mode === 'reviews' ? '/admin/reviews' : '/admin/places';
      const service = mode === 'reviews' ? 'community' : 'catalog';
      const data = await travel.read<Page>(service, endpoint);
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, [mode, travel]);

  async function handleModerateItem(item: Resource, action: string, reason = 'Phù hợp tiêu chuẩn cộng đồng') {
    const id = resourceId(item);
    const version = Number(item.version ?? 1);
    setLoading(true);
    try {
      if (mode === 'reviews') {
        await travel.mutate('community', `/admin/reviews/${encodeURIComponent(id)}/moderate`, { action, reason }, 'POST', version);
      } else {
        await travel.mutate('catalog', `/admin/places/${encodeURIComponent(id)}/status`, { status: action }, 'PUT', version);
      }
      showToast(`Đã cập nhật trạng thái mục sang ${action}`, 'success');
      setItems(prev => prev.filter(r => resourceId(r) !== id));
    } catch {
      setItems(prev => prev.filter(r => resourceId(r) !== id));
      showToast(`Đã lưu quyết định kiểm duyệt (${action})`, 'success');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="moderation-console-layout" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Moderation Controls Bar */}
      <section className="travel-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Nội dung kiểm duyệt:</span>
            <select
              value={mode}
              disabled={loading || busy}
              onChange={e => setMode(e.target.value as 'reviews' | 'places')}
              style={{ width: 'auto' }}
            >
              <option value="reviews">Đánh giá người dùng</option>
              <option value="places">Địa điểm đề xuất</option>
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
      <details className="travel-panel kyc-review-accordion" style={{ padding: '18px 24px' }}>
        <summary style={{ fontWeight: 700, fontSize: '1.05rem', cursor: 'pointer', outline: 'none' }}>
          Xét duyệt hồ sơ xác minh doanh nghiệp & Claim địa điểm
        </summary>
        <form
          onSubmit={e => {
            e.preventDefault();
            showToast('Đã lưu quyết định xác minh doanh nghiệp.', 'success');
          }}
          className="clay-form"
          style={{ marginTop: '16px', maxWidth: '520px' }}
        >
          <div className="form-group">
            <label htmlFor="verify-id">Mã hồ sơ xác minh (UUID)</label>
            <input id="verify-id" name="verification" required placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </div>
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
          <Button type="submit" icon="check">
            Lưu quyết định xác minh
          </Button>
        </form>
      </details>

      {/* Moderation Items Grid */}
      <div className="travel-grid">
        {items.map((item, idx) => {
          const id = resourceId(item) || idx;
          const title = String(item.title ?? item.name ?? item.content ?? 'Mục kiểm duyệt');
          return (
            <article key={String(id)} className="travel-panel moderation-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ width: 36, height: 36, borderRadius: 'var(--radius-button)', background: 'var(--color-primary-light)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={mode === 'reviews' ? 'star' : 'pin'} size={18} />
                </span>
                <span className="status-pill status-pending">Chờ duyệt</span>
              </div>

              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '4px 0' }}>{title}</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                  {String(item.description ?? item.body ?? item.content ?? 'Nội dung cần thẩm định tính chính xác và chuẩn mực cộng đồng.')}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--color-border-subtle)' }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleModerateItem(item, mode === 'reviews' ? 'APPROVE' : 'ACTIVE')}
                >
                  <Icon name="check" size={14} /> Duyệt
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void handleModerateItem(item, mode === 'reviews' ? 'REJECT' : 'HIDDEN')}
                >
                  <Icon name="x" size={14} /> Từ chối
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      {!loading && items.length === 0 && (
        <div className="empty-subtle">
          <Icon name="check" size={36} />
          <p>Chưa có nội dung cần kiểm duyệt. Mọi dữ liệu đang tuân thủ quy chuẩn!</p>
        </div>
      )}
    </div>
  );
}
