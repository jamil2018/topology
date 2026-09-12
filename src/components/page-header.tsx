export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[color:var(--topo-line)] pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--topo-muted)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--topo-ink)] sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm text-[color:var(--topo-muted)]">
            {description}
          </p>
        ) : null}
        {meta ? <div className="flex flex-wrap gap-1.5 pt-1">{meta}</div> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
