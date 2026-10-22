import { type ReactNode } from 'react';
import { Icon } from './Icon';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: string;
  action?: ReactNode;
  variant?: 'default' | 'compact' | 'subtle';
}

export function EmptyState({ title, description, icon = 'compass', action, variant = 'default' }: EmptyStateProps) {
  if (variant === 'compact' || variant === 'subtle') {
    return (
      <div className={`empty-state empty-state-${variant}`} role="region" aria-label={title}>
        <div className="empty-state-compact-icon">
          <Icon name={icon} size={20} />
        </div>
        <div className="empty-state-compact-body">
          <h3 className="empty-state-title">{title}</h3>
          {description && <p className="empty-state-text">{description}</p>}
        </div>
        {action && <div className="empty-state-action">{action}</div>}
      </div>
    );
  }

  return (
    <div className="empty-state" role="region" aria-label={title}>
      <div style={{ color: 'var(--color-primary)', opacity: 0.85 }}>
        <Icon name={icon} size={48} />
      </div>
      <h2 className="empty-state-title">{title}</h2>
      {description && <p className="empty-state-text">{description}</p>}
      {action && <div style={{ marginTop: '16px' }}>{action}</div>}
    </div>
  );
}
