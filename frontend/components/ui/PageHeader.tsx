interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-6 mb-8">
      <div>
        <span className="font-mono text-[11px] tracking-[0.15em] text-accent-strong uppercase">{eyebrow}</span>
        <h1 className="font-display text-3xl mt-1.5 text-ink">{title}</h1>
        {description && <p className="text-muted text-sm mt-2 max-w-xl leading-relaxed">{description}</p>}
      </div>
      {action}
    </div>
  );
}
