"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Input, TextArea, Label, TextField } from "@heroui/react";
import { motion } from "motion/react";
import { PageHeader } from "./page-header";
import { StatusChip, statusToneForRun } from "./status-chip";

type RunRow = {
  id: string;
  name: string;
  status: string;
  environment: string;
  updatedAt: string | Date;
};

export function RunsWorkspace({ initialRuns }: { initialRuns: RunRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function createRun() {
    setError(null);
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Failed to create run");
      return;
    }
    const data = await res.json();
    setName("");
    setDescription("");
    startTransition(() => router.push(`/runs/${data.run.id}`));
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Manual"
        title="Runs"
        description="Plan a pass, attach ready cases, and record results as you execute."
        meta={<StatusChip mono>{initialRuns.length} runs</StatusChip>}
      />

      <div className="space-y-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3">
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Start a run
        </h2>
        <p className="text-xs text-[color:var(--topo-muted)]">
          New runs include all cases marked ready. You can narrow later.
        </p>
        <TextField name="run-name" className="w-full">
          <Label>Run name</Label>
          <Input
            placeholder="Release 1.0 smoke"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full"
          />
        </TextField>
        <TextField name="run-notes" className="w-full">
          <Label>Notes</Label>
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full"
          />
        </TextField>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        <Button
          variant="primary"
          isDisabled={pending || !name.trim()}
          onPress={() => void createRun()}
        >
          Create run
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        {initialRuns.length === 0 ? (
          <p className="border-dashed px-3 py-10 text-center text-sm text-[color:var(--topo-muted)]">
            No runs yet.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--topo-line)]">
            {initialRuns.map((run, i) => (
              <motion.li
                key={run.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.02 }}
              >
                <Link
                  href={`/runs/${run.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-[color:var(--topo-chip)]/50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[color:var(--topo-ink)]">
                      {run.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[color:var(--topo-muted)]">
                      <span className="font-mono">{run.id.slice(0, 8)}</span>
                      <span>{run.environment}</span>
                    </div>
                  </div>
                  <StatusChip tone={statusToneForRun(run.status)} mono>
                    {run.status.replace("_", " ")}
                  </StatusChip>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
