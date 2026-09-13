import Link from "next/link";

export function NoProjectEmptyState({
  canManage = false,
}: {
  canManage?: boolean;
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-3 py-16">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--topo-muted)]">
        Projects
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--topo-ink)]">
        No project selected
      </h1>
      <p className="text-sm leading-relaxed text-[color:var(--topo-muted)]">
        Topology scopes cases, runs, and reports to a project. You don&apos;t
        currently have access to an active project
        {canManage
          ? ", or all of yours are archived."
          : ". Ask an admin to invite you."}
      </p>
      {canManage ? (
        <Link
          href="/settings?section=projects"
          className="mt-2 rounded-lg bg-[color:var(--topo-accent)] px-3 py-2 text-sm font-medium text-white"
        >
          Manage projects
        </Link>
      ) : null}
    </div>
  );
}
