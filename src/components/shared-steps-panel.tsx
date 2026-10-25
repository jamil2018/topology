"use client";

import { useEffect, useState } from "react";
import { Button, Input, TextArea } from "@heroui/react";

type SharedStep = {
  id: string;
  name: string;
  description: string;
  items: Array<{ action: string; expected: string; data: string }>;
};

export function SharedStepsPanel() {
  const [rows, setRows] = useState<SharedStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [action, setAction] = useState("");
  const [expected, setExpected] = useState("");

  async function reload() {
    const res = await fetch("/api/shared-steps");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Failed to load");
      return;
    }
    setRows(data.sharedSteps ?? []);
    setError(null);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function create() {
    if (!name.trim() || !action.trim()) return;
    const res = await fetch("/api/shared-steps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        items: [{ action: action.trim(), expected, data: "" }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Could not create");
      return;
    }
    setName("");
    setAction("");
    setExpected("");
    await reload();
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Shared steps
        </h2>
        <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
          Reusable step blocks you can insert into any case.
        </p>
      </div>
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-300">{error}</p>
      ) : null}
      <Input
        placeholder="Block name (Login)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        placeholder="First action"
        value={action}
        onChange={(e) => setAction(e.target.value)}
      />
      <TextArea
        placeholder="Expected (optional)"
        value={expected}
        onChange={(e) => setExpected(e.target.value)}
        className="min-h-12"
      />
      <Button
        size="sm"
        variant="secondary"
        isDisabled={!name.trim() || !action.trim()}
        onPress={() => void create()}
      >
        Add shared step
      </Button>
      <ul className="space-y-1 text-sm">
        {rows.map((row) => (
          <li
            key={row.id}
            className="rounded-md border border-[color:var(--topo-line)] px-3 py-2"
          >
            <span className="font-medium">{row.name}</span>
            <span className="ml-2 text-xs text-[color:var(--topo-muted)]">
              {row.items.length} step{row.items.length === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
