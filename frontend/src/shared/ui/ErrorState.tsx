import { type ReactNode } from 'react';
import { Icon } from './Icon';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  action?: ReactNode;
}

export function ErrorState({
  title = 'Chưa tải được dữ liệu',
  message = 'Không thể kết nối với máy chủ hoặc dịch vụ đang bận. Vui lòng thử lại sau.',
  onRetry,
  action
}: ErrorStateProps) {
  return (
    <div className="empty-state" role="alert" style={{ borderColor: 'var(--color-destructive-bg)' }}>
      <div style={{ color: 'var(--color-destructive)' }}>
        <Icon name="alert" size={48} />
      </div>
      <h2 className="empty-state-title" style={{ color: 'var(--color-destructive)' }}>
        {title}
      </h2>
      <p className="empty-state-text">{message}</p>
      {onRetry && (
        <button
          type="button"
          className="btn-secondary"
          onClick={onRetry}
          style={{ marginTop: '16px' }}
        >
          <Icon name="refresh" size={16} /> Thử lại
        </button>
      )}
      {action && <div style={{ marginTop: '16px' }}>{action}</div>}
    </div>
  );
}
