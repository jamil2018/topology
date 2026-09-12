export default function ReportsLoading() {
  return (
    <div className="space-y-5 p-1" aria-busy="true" aria-label="Loading reports">
      <div className="h-16 animate-pulse rounded-md bg-[color:var(--topo-chip)]" />
      <div className="h-10 animate-pulse rounded-md bg-[color:var(--topo-chip)]" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-md bg-[color:var(--topo-chip)]"
          />
        ))}
      </div>
    </div>
  );
}
