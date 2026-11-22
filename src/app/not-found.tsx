import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col justify-center gap-4 px-4 py-16">
      <p className="font-mono text-xs uppercase tracking-wide text-[color:var(--topo-muted)]">
        404
      </p>
      <h1 className="text-2xl font-semibold text-[color:var(--topo-ink)]">
        Page not found
      </h1>
      <p className="text-sm text-[color:var(--topo-muted)]">
        That route does not exist in this Topology workspace, or the link is
        out of date.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href="/"
          className="rounded-md bg-[color:var(--topo-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--accent-foreground)]"
        >
          Back to Home
        </Link>
        <Link
          href="/cases"
          className="rounded-md border border-[color:var(--topo-line)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)]"
        >
          Test cases
        </Link>
      </div>
    </main>
  );
}
