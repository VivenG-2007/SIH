import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

export default function Card({ children, className = '', glow = false, style, ...props }: CardProps) {
  return (
    <div
      className={`pl-card ${glow ? 'pl-card-glow' : ''} ${className}`}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
}
