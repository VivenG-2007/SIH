import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

type Tone = 'critical' | 'warning' | 'success' | 'info';

interface AlertProps {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}

const tones: Record<Tone, { classes: string; Icon: typeof AlertTriangle }> = {
  critical: { classes: 'bg-critical-soft border-critical/30 text-critical', Icon: AlertTriangle },
  warning: { classes: 'bg-warning-soft border-warning/30 text-warning', Icon: AlertTriangle },
  success: { classes: 'bg-success-soft border-success/30 text-success', Icon: CheckCircle2 },
  info: { classes: 'bg-info-soft border-info/30 text-info', Icon: Info },
};

export default function Alert({ tone = 'critical', children, className = '' }: AlertProps) {
  const { classes, Icon } = tones[tone];
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border text-sm leading-relaxed ${classes} ${className}`}>
      <Icon size={16} strokeWidth={2} className="shrink-0 mt-0.5" />
      <div className="text-ink/90">{children}</div>
    </div>
  );
}
