"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Input, TextArea, Label, TextField } from "@heroui/react";
import { motion } from "motion/react";

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
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[color:var(--topo-ink)]">
          Manual runs
        </h1>
        <p className="mt-1 max-w-xl text-sm text-[color:var(--topo-muted)]">
          Plan a pass, attach ready cases, and record results as you execute.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
        <h2 className="text-sm font-medium text-[color:var(--topo-ink)]">
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
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <Button
          variant="primary"
          isDisabled={pending || !name.trim()}
          onPress={() => void createRun()}
        >
          Create run
        </Button>
      </div>

      <div className="space-y-2">
        {initialRuns.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[color:var(--topo-line)] px-4 py-10 text-center text-sm text-[color:var(--topo-muted)]">
            No runs yet.
          </p>
        ) : (
          initialRuns.map((run, i) => (
            <motion.div
              key={run.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Link
                href={`/runs/${run.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-4 py-3 transition hover:border-[color:var(--topo-accent)]"
              >
                <div>
                  <div className="font-medium text-[color:var(--topo-ink)]">
                    {run.name}
                  </div>
                  <div className="text-xs text-[color:var(--topo-muted)]">
                    {run.environment} · {run.status.replace("_", " ")}
                  </div>
                </div>
                <span className="text-xs text-[color:var(--topo-muted)]">
                  Open →
                </span>
              </Link>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
