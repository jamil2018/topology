const toneClass = {
  info: "border-[color:var(--topo-info-border)] bg-[color-mix(in_srgb,var(--topo-info)_12%,transparent)] text-[color:var(--topo-ink)]",
  success:
    "border-[color:var(--topo-success-border)] bg-[color-mix(in_srgb,var(--topo-success)_12%,transparent)] text-[color:var(--topo-ink)]",
  warning:
    "border-[color:var(--topo-warning-border)] bg-[color-mix(in_srgb,var(--topo-warning)_16%,transparent)] text-[color:var(--topo-ink)]",
  danger:
    "border-[color:var(--topo-danger-border)] bg-[color-mix(in_srgb,var(--topo-danger)_12%,transparent)] text-[color:var(--topo-danger)]",
} as const;

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: keyof typeof toneClass;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`rounded-md border px-3 py-2 text-sm ${toneClass[tone]}`}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      <div className={title ? "mt-0.5 text-xs opacity-90" : ""}>{children}</div>
    </div>
  );
}
