import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { Icon } from './Icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'subtle' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, loading = false, children, className = '', disabled, ...props },
  ref
) {
  const variantClass = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    outline: 'btn-outline',
    subtle: 'btn-subtle',
    danger: 'btn-danger'
  }[variant];

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${variantClass} ${className}`}
      {...props}
    >
      {loading ? (
        <Icon name="refresh" className="animate-spin" size={size === 'sm' ? 14 : 16} />
      ) : icon ? (
        <Icon name={icon} size={size === 'sm' ? 14 : 16} />
      ) : null}
      {children}
    </button>
  );
});
