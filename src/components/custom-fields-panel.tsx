"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@heroui/react";

type FieldRow = {
  id: string;
  entity: "case" | "result";
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
};

export function CustomFieldsPanel() {
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    entity: "case" as "case" | "result",
    key: "",
    label: "",
    type: "text",
    options: "",
    required: false,
  });

  async function reload() {
    const res = await fetch("/api/custom-fields");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Failed to load fields");
      return;
    }
    setFields(data.fields ?? []);
    setError(null);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function create() {
    setError(null);
    const res = await fetch("/api/custom-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: draft.entity,
        key: draft.key,
        label: draft.label,
        type: draft.type,
        required: draft.required,
        options: draft.options
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Could not create field");
      return;
    }
    setDraft({
      entity: "case",
      key: "",
      label: "",
      type: "text",
      options: "",
      required: false,
    });
    await reload();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/custom-fields/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Could not delete");
      return;
    }
    await reload();
  }

  return (
    <div className="space-y-3" id="fields">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Custom fields
        </h2>
        <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
          Extra fields on cases and results — the usual TestRail migration
          blocker. Admins can define them; values are edited on the case and
          during a run.
        </p>
      </div>
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-300">{error}</p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder="key (severity)"
          value={draft.key}
          onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
        />
        <Input
          placeholder="Label"
          value={draft.label}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
        />
        <select
          className="rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
          value={draft.entity}
          onChange={(e) =>
            setDraft((d) => ({ ...d, entity: e.target.value as "case" | "result" }))
          }
        >
          <option value="case">On cases</option>
          <option value="result">On results</option>
        </select>
        <select
          className="rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
          value={draft.type}
          onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
        >
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="boolean">Boolean</option>
          <option value="select">Select</option>
          <option value="date">Date</option>
        </select>
        {draft.type === "select" ? (
          <Input
            className="sm:col-span-2"
            placeholder="Options (comma-separated)"
            value={draft.options}
            onChange={(e) => setDraft((d) => ({ ...d, options: e.target.value }))}
          />
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-xs text-[color:var(--topo-muted)]">
        <input
          type="checkbox"
          checked={draft.required}
          onChange={(e) => setDraft((d) => ({ ...d, required: e.target.checked }))}
        />
        Required
      </label>
      <Button
        size="sm"
        variant="primary"
        isDisabled={!draft.key.trim() || !draft.label.trim()}
        onPress={() => void create()}
      >
        Add field
      </Button>
      <ul className="divide-y divide-[color:var(--topo-line)] rounded-md border border-[color:var(--topo-line)]">
        {fields.length === 0 ? (
          <li className="px-3 py-2 text-xs text-[color:var(--topo-muted)]">
            No custom fields yet.
          </li>
        ) : (
          fields.map((field) => (
            <li
              key={field.id}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <span>
                <span className="font-mono text-xs text-[color:var(--topo-accent)]">
                  {field.key}
                </span>{" "}
                {field.label}
                <span className="ml-2 text-xs text-[color:var(--topo-muted)]">
                  {field.entity} · {field.type}
                </span>
              </span>
              <Button
                size="sm"
                variant="tertiary"
                onPress={() => void remove(field.id)}
              >
                Delete
              </Button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
