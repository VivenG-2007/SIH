import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gradient';
  size?: 'sm' | 'md' | 'lg';
}

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  style,
  ...props
}: ButtonProps) {
  const base =
    variant === 'primary' || variant === 'gradient'
      ? 'pl-btn-primary'
      : variant === 'danger'
      ? 'pl-btn-secondary'
      : 'pl-btn-secondary';

  const dangerStyle: React.CSSProperties =
    variant === 'danger'
      ? {
          background: 'rgba(244,63,94,0.10)',
          borderColor: 'rgba(244,63,94,0.25)',
          color: '#F43F5E',
        }
      : {};

  const sizeStyle: React.CSSProperties =
    size === 'sm' ? { height: 32, fontSize: 11, padding: '0 12px' } :
    size === 'lg' ? { height: 40, fontSize: 14, padding: '0 20px' } :
    {};

  return (
    <button
      className={`${base} ${className}`}
      style={{ ...sizeStyle, ...dangerStyle, ...style }}
      {...props}
    >
      {children}
    </button>
  );
}
