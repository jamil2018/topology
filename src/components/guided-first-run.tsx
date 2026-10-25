import Link from "next/link";

const STEPS = [
  {
    n: "1",
    title: "Create a case",
    href: "/cases?new=1",
    hint: "Author the first test in this workspace.",
  },
  {
    n: "2",
    title: "Start a run",
    href: "/runs/new",
    hint: "Execute it and record pass or fail.",
  },
  {
    n: "3",
    title: "Import CI",
    href: "/settings?section=integrations#ci",
    hint: "Ingest JUnit or a reporter so automation lands here.",
  },
  {
    n: "4",
    title: "File an issue",
    href: "/triage",
    hint: "Turn a failure into a tracker issue.",
  },
] as const;

export function GuidedFirstRun({
  title = "Get started",
  description = "Four steps to a working test workspace: case, run, CI, then triage.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section
      role="region"
      aria-label="Guided first run"
      className="rounded-md border border-dashed border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
    >
      <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
        {title}
      </h2>
      <p className="mt-1 max-w-xl text-sm text-[color:var(--topo-muted)]">
        {description}
      </p>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {STEPS.map((step) => (
          <li key={step.n}>
            <Link
              href={step.href}
              className="flex gap-3 rounded-md border border-[color:var(--topo-line)] px-3 py-2.5 transition hover:bg-[color:var(--topo-chip)]/50"
            >
              <span className="font-mono text-xs text-[color:var(--topo-accent)]">
                {step.n}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[color:var(--topo-ink)]">
                  {step.title}
                </span>
                <span className="mt-0.5 block text-xs text-[color:var(--topo-muted)]">
                  {step.hint}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
