import { type ReactNode } from 'react';

export interface BadgeProps {
  variant?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral';
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = 'neutral', children, className = '' }: BadgeProps) {
  const variantStyles: Record<string, { bg: string; color: string }> = {
    primary: { bg: 'var(--color-primary-light)', color: 'var(--color-primary)' },
    secondary: { bg: 'var(--color-secondary-light)', color: 'var(--color-secondary)' },
    accent: { bg: 'var(--color-accent-light)', color: 'var(--color-accent-hover)' },
    success: { bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
    warning: { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
    danger: { bg: 'var(--color-destructive-bg)', color: 'var(--color-destructive)' },
    neutral: { bg: 'var(--color-surface-sunken)', color: 'var(--color-text-secondary)' }
  };

  const style = variantStyles[variant] ?? variantStyles.neutral;

  return (
    <span
      className={`badge ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 10px',
        borderRadius: 'var(--radius-pill)',
        fontSize: '0.75rem',
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.color,
        letterSpacing: '0.02em'
      }}
    >
      {children}
    </span>
  );
}
