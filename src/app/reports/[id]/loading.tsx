export default function ReportDetailLoading() {
  return (
    <div
      className="space-y-5 p-1"
      aria-busy="true"
      aria-label="Loading report"
    >
      <div className="h-20 animate-pulse rounded-md bg-[color:var(--topo-chip)]" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-md bg-[color:var(--topo-chip)]"
          />
        ))}
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        <div className="h-48 animate-pulse rounded-md bg-[color:var(--topo-chip)]" />
        <div className="h-48 animate-pulse rounded-md bg-[color:var(--topo-chip)]" />
      </div>
    </div>
  );
}
