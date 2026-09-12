const toneClass = {
  neutral:
    "bg-[color:var(--topo-chip)] text-[color:var(--topo-muted)] border-[color:var(--topo-line)]",
  accent:
    "bg-[color:var(--topo-accent-soft)] text-[color:var(--topo-accent)] border-[color:var(--topo-accent)]/25",
  success:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  warning:
    "bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/25",
  danger:
    "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/25",
  info: "bg-sky-500/10 text-sky-800 dark:text-sky-200 border-sky-500/25",
} as const;

export type StatusTone = keyof typeof toneClass;

export function StatusChip({
  children,
  tone = "neutral",
  mono = false,
  title,
}: {
  children: React.ReactNode;
  tone?: StatusTone;
  mono?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center truncate rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${toneClass[tone]} ${
        mono ? "font-mono normal-case tracking-normal" : ""
      }`}
    >
      {children}
    </span>
  );
}

export function statusToneForRun(status: string): StatusTone {
  switch (status) {
    case "completed":
    case "passed":
    case "ready":
    case "healthy":
      return "success";
    case "in_progress":
    case "running":
    case "watch":
    case "at_risk":
      return "warning";
    case "failed":
    case "blocked":
    case "critical":
      return "danger";
    case "automation":
      return "info";
    default:
      return "neutral";
  }
}
