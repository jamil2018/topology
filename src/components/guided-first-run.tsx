"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { useProjectActions } from "./project-actions";

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

const LEGACY_DISMISS_KEY = "topology:guided-first-run-dismissed";

function dismissKey(projectId: string | null) {
  return projectId
    ? `topology:guided-first-run-dismissed:${projectId}`
    : LEGACY_DISMISS_KEY;
}

export function GuidedFirstRun({
  title = "Get started",
  completed = [],
  description = "Four steps to a working test workspace: case, run, CI, then triage.",
  dismissible = false,
}: {
  title?: string;
  completed?: string[];
  description?: string;
  dismissible?: boolean;
}) {
  const { projectId } = useProjectActions();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!dismissible) return;
    try {
      const key = dismissKey(projectId);
      const scoped = window.localStorage.getItem(key) === "1";
      // Migrate legacy global dismiss only when scoped key is unset.
      const legacy =
        !scoped &&
        projectId &&
        window.localStorage.getItem(LEGACY_DISMISS_KEY) === "1";
      if (legacy) {
        window.localStorage.setItem(key, "1");
      }
      setDismissed(scoped || Boolean(legacy));
    } catch {
      /* Storage unavailable. */
    }
  }, [dismissible, projectId]);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissKey(projectId), "1");
    } catch {
      /* Storage unavailable. */
    }
  }

  if (dismissible && dismissed) return null;

  const allDone = STEPS.every((step) => completed.includes(step.n));

  return (
    <section
      role="region"
      aria-label="Guided first run"
      className="rounded-md border border-dashed border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            {title}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-[color:var(--topo-muted)]">
            {description}
          </p>
        </div>
        {dismissible ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onPress={dismiss}
            className="shrink-0 text-xs font-medium text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
          >
            {allDone ? "Dismiss" : "Dismiss checklist"}
          </Button>
        ) : null}
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {STEPS.map((step) => (
          <li key={step.n}>
            <Link
              href={step.href}
              className="flex gap-3 rounded-md border border-[color:var(--topo-line)] px-3 py-2.5 transition hover:bg-[color:var(--topo-chip)]/50"
            >
              <span className="font-mono text-xs text-[color:var(--topo-accent)]">
                {completed.includes(step.n) ? "✓" : step.n}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[color:var(--topo-ink)]">
                  {step.title}
                  {completed.includes(step.n) ? " · Complete" : ""}
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
