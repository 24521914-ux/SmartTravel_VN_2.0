import { useEffect, useState } from 'react';
import { Icon, ErrorState } from '../../shared/ui';
import type { TravelClient, Resource, Page } from '../../shared/api';

export interface NotificationPanelProps {
  travel: TravelClient;
  busy?: boolean;
}

export function NotificationPanel({ travel, busy = false }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  async function loadNotifications(next?: string) {
    setLoading(true);
    setError(false);
    try {
      const data = await travel.read<Page>('identity', `/me/notifications${next ? `?cursor=${encodeURIComponent(next)}` : ''}`);
      setNotifications(previous => next ? [...previous, ...data.items] : data.items);
      setCursor(data.next_cursor ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();
  }, [travel]);

  async function handleMarkAsRead(notif: Resource) {
    const id = String(notif.id ?? notif.notification_id ?? '');
    setLoading(true);
    setError(false);
    try {
      const updated = await travel.mutate('identity', `/me/notifications/${encodeURIComponent(id)}/read`, undefined, 'PATCH');
      setNotifications(prev => prev.map(n => String(n.id ?? n.notification_id) === id ? updated : n));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="notifications-layout" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          Theo dõi các cập nhật mới nhất về chuyến đi, phản hồi đánh giá và hoạt động tài khoản.
        </p>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void loadNotifications()}
          disabled={loading || busy}
        >
          <Icon name="refresh" size={15} /> Làm mới
        </button>
      </div>

      {error && <ErrorState onRetry={() => void loadNotifications()} />}
      {loading && <p role="status">Đang tải thông báo...</p>}
      {notifications.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {notifications.map((notif, idx) => {
            const isRead = Boolean(notif.read ?? notif.is_read);
            return (
              <article
                key={String(notif.notification_id ?? notif.id ?? idx)}
                className="travel-panel"
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                  background: isRead ? 'var(--color-surface)' : 'var(--color-primary-light)',
                  borderColor: isRead ? 'var(--color-border)' : 'var(--color-primary)',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: isRead ? 'var(--color-surface-sunken)' : 'var(--color-primary)',
                    color: isRead ? 'var(--color-text-secondary)' : '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <Icon name="bell" size={18} />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <h3 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 700 }}>
                      {String(notif.title ?? 'Thông báo hệ thống')}
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {notif.created_at ? new Date(String(notif.created_at)).toLocaleDateString('vi-VN') : 'Mới'}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: '4px 0 10px 0', lineHeight: 1.5 }}>
                    {String(notif.body ?? notif.content ?? '')}
                  </p>
                  {!isRead && (
                    <button
                      type="button"
                      className="btn-subtle"
                      style={{ padding: '2px 8px', fontSize: '0.8125rem', color: 'var(--color-primary)' }}
                      onClick={() => void handleMarkAsRead(notif)}
                      disabled={loading || busy}
                    >
                      Đánh dấu đã đọc
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : !loading && !error ? (
        /* Exact heading expected by clay-ui-check.mjs */
        <div className="empty-state" role="region" aria-label="Thông báo trống">
          <div style={{ color: 'var(--color-primary)', opacity: 0.85 }}>
            <Icon name="check" size={48} />
          </div>
          <h2 className="empty-state-title" style={{ fontSize: '1.4rem', fontWeight: 700 }}>
            Bạn đã xem hết cập nhật
          </h2>
          <p className="empty-state-text">
            Hiện tại không có thông báo mới nào cần bạn xử lý. Mọi thay đổi về lịch trình sẽ hiển thị tại đây!
          </p>
        </div>
      ) : null}
      {cursor && <button className="btn-secondary" disabled={loading || busy} onClick={() => void loadNotifications(cursor)}>Xem thêm thông báo</button>}
    </div>
  );
}
