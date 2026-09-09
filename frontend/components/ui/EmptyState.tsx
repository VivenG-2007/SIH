import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-16 px-6 border border-dashed border-border rounded-xl">
      {Icon && (
        <div className="w-10 h-10 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-muted mb-1">
          <Icon size={18} strokeWidth={1.75} />
        </div>
      )}
      <p className="text-ink font-medium text-sm">{title}</p>
      {description && <p className="text-muted text-sm max-w-sm leading-relaxed">{description}</p>}
      {action}
    </div>
  );
}
