"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { useMutationFeedback } from "./use-mutation-feedback";
import { useProjectActions } from "./project-actions";
import { PanelListSkeleton } from "./skeletons";
import type { RunTemplateView } from "@/lib/run-template";

export function RunTemplatesPanel() {
  const { can, canAdmin, userId } = useProjectActions();
  const [templates, setTemplates] = useState<RunTemplateView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { saving, submit } = useMutationFeedback(setError);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch("/api/run-templates")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load templates");
        const data = await response.json();
        if (cancelled) return;
        setTemplates(data.templates);
        setError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : "Could not load templates");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);
  async function remove(id: string) {
    return submit(async () => {
      const response = await fetch(`/api/run-templates/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete template");
      setTemplates((items) => items.filter((item) => item.id !== id)); setDeleting(null);
    });
  }
  return <section className="rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4" aria-label="Run templates">
    <h2 className="text-sm font-semibold">Run templates</h2>
    <p className="mt-1 text-xs text-[color:var(--topo-muted)]">Reuse a case selection. Review each draft before creating a fresh run.</p>
    {error ? <p role="alert" className="topo-feedback">{error} <Button variant="ghost" size="sm" onPress={() => setRevision((value) => value + 1)}>Retry</Button></p> : null}
    {loading ? (
      <div role="status" aria-busy="true" aria-label="Loading templates" className="mt-3">
        <PanelListSkeleton rows={3} />
      </div>
    ) : null}
    {!loading && !templates.length && !error ? <p className="mt-3 text-sm text-[color:var(--topo-muted)]">Save a selection as a template when starting a run.</p> : null}
    {!loading ? (
    <ul className="mt-3 divide-y divide-[color:var(--topo-line)]">{templates.map((template) => <li key={template.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div><p className="text-sm font-medium">{template.name}</p><p className="text-xs text-[color:var(--topo-muted)]">{template.caseIds.length} cases · {template.environment}</p></div>
      <div className="flex items-center gap-3 text-xs">
        {can("runs.create") ? <Link className="text-[color:var(--topo-accent)] underline" href={`/runs/new?template=${template.id}`}>Review and launch</Link> : null}
        {(can("runs.create") && template.createdById === userId) || canAdmin ? <><Link href={`/runs/new?template=${template.id}&editTemplate=1`}>Edit</Link><Button size="sm" variant="tertiary" onPress={() => setDeleting(template.id)}>Delete</Button></> : null}
        {deleting === template.id ? <span role="group" aria-label={`Delete ${template.name}`}><Button size="sm" variant="danger" isDisabled={saving} onPress={() => void remove(template.id)}>Confirm delete</Button><Button size="sm" variant="tertiary" isDisabled={saving} onPress={() => setDeleting(null)}>Cancel</Button></span> : null}
      </div>
    </li>)}</ul>
    ) : null}
  </section>;
}
