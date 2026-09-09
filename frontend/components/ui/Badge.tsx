import React from 'react';

type Tone = 'critical' | 'high' | 'warning' | 'medium' | 'low' | 'success' | 'info' | 'neutral' | 'scanning' | 'ai';

interface BadgeProps {
  tone?: Tone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

const TONE_CLASS: Record<Tone, string> = {
  critical: 'pl-badge-critical',
  high:     'pl-badge-high',
  warning:  'pl-badge-high',
  medium:   'pl-badge-medium',
  low:      'pl-badge-low',
  success:  'pl-badge-success',
  info:     'pl-badge-scanning',
  neutral:  'pl-badge-neutral',
  scanning: 'pl-badge-scanning',
  ai:       'pl-badge-ai',
};

export default function Badge({ tone = 'neutral', dot = false, children, className = '' }: BadgeProps) {
  return (
    <span className={`pl-badge ${TONE_CLASS[tone]} ${className}`}>
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0 inline-block"
          style={{ background: 'currentColor' }}
        />
      )}
      {children}
    </span>
  );
}
