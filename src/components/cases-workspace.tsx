"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Input, TextArea, Chip, Label, TextField } from "@heroui/react";
import { motion, AnimatePresence } from "motion/react";

type Folder = { id: string; name: string };
type CaseRow = {
  id: string;
  key: string;
  title: string;
  priority: string;
  status: string;
  tags: string[];
  folder: Folder | null;
};

const priorities = ["P0", "P1", "P2", "P3"] as const;
const statuses = ["draft", "ready", "blocked", "deprecated"] as const;

export function CasesWorkspace({
  initialCases,
  folders,
}: {
  initialCases: CaseRow[];
  folders: Folder[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    key: "",
    title: "",
    description: "",
    priority: "P2",
    status: "draft",
    folderId: "",
    tags: "",
  });

  const filtered =
    folderFilter === "all"
      ? initialCases
      : initialCases.filter((c) => c.folder?.id === folderFilter);

  async function createCase() {
    setError(null);
    const res = await fetch("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: form.key,
        title: form.title,
        description: form.description,
        priority: form.priority,
        status: form.status,
        folderId: form.folderId || null,
        tags: form.tags
          .split(/[;,]/)
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data.error === "string" ? data.error : "Failed to create case",
      );
      return;
    }
    setShowCreate(false);
    setForm({
      key: "",
      title: "",
      description: "",
      priority: "P2",
      status: "draft",
      folderId: "",
      tags: "",
    });
    startTransition(() => router.refresh());
  }

  async function createFolder() {
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;
    setError(null);
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) {
      setError("Failed to create folder");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function importCsv(file: File) {
    setError(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/import/csv", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Import failed");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[color:var(--topo-ink)]">
            Cases
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[color:var(--topo-muted)]">
            Organize suites in folders, author cases, and import or export CSV.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onPress={createFolder}>
            New folder
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => window.open("/api/import/csv", "_blank")}
          >
            Export CSV
          </Button>
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-sm text-[color:var(--topo-ink)] hover:bg-[color:var(--topo-accent-soft)]">
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importCsv(file);
                e.target.value = "";
              }}
            />
          </label>
          <Button
            size="sm"
            variant="primary"
            onPress={() => setShowCreate((v) => !v)}
          >
            New case
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFolderFilter("all")}
          className={`rounded-full px-3 py-1 text-xs ${
            folderFilter === "all"
              ? "bg-[color:var(--topo-ink)] text-[color:var(--topo-paper)]"
              : "bg-[color:var(--topo-panel)] text-[color:var(--topo-muted)]"
          }`}
        >
          All ({initialCases.length})
        </button>
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFolderFilter(f.id)}
            className={`rounded-full px-3 py-1 text-xs ${
              folderFilter === f.id
                ? "bg-[color:var(--topo-ink)] text-[color:var(--topo-paper)]"
                : "bg-[color:var(--topo-panel)] text-[color:var(--topo-muted)]"
            }`}
          >
            {f.name} (
            {initialCases.filter((c) => c.folder?.id === f.id).length})
          </button>
        ))}
      </div>

      <AnimatePresence>
        {showCreate ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3 rounded-xl border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField name="key" className="w-full">
                <Label>Key</Label>
                <Input
                  placeholder="TOP-12"
                  value={form.key}
                  onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                  className="w-full"
                />
              </TextField>
              <TextField name="title" className="w-full">
                <Label>Title</Label>
                <Input
                  placeholder="Case title"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  className="w-full"
                />
              </TextField>
            </div>
            <TextField name="description" className="w-full">
              <Label>Description</Label>
              <TextArea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                className="w-full"
              />
            </TextField>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm text-[color:var(--topo-muted)]">
                Priority
                <select
                  className="mt-1 w-full rounded-lg border border-[color:var(--topo-line)] bg-transparent px-3 py-2 text-[color:var(--topo-ink)]"
                  value={form.priority}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, priority: e.target.value }))
                  }
                >
                  {priorities.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-[color:var(--topo-muted)]">
                Status
                <select
                  className="mt-1 w-full rounded-lg border border-[color:var(--topo-line)] bg-transparent px-3 py-2 text-[color:var(--topo-ink)]"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value }))
                  }
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-[color:var(--topo-muted)]">
                Folder
                <select
                  className="mt-1 w-full rounded-lg border border-[color:var(--topo-line)] bg-transparent px-3 py-2 text-[color:var(--topo-ink)]"
                  value={form.folderId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, folderId: e.target.value }))
                  }
                >
                  <option value="">None</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <TextField name="tags" className="w-full">
              <Label>Tags</Label>
              <Input
                placeholder="smoke; ui"
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                className="w-full"
              />
            </TextField>
            <div className="flex gap-2">
              <Button
                variant="primary"
                isDisabled={pending || !form.key || !form.title}
                onPress={() => void createCase()}
              >
                Save case
              </Button>
              <Button variant="tertiary" onPress={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="overflow-hidden rounded-xl border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[color:var(--topo-line)] text-xs uppercase tracking-wide text-[color:var(--topo-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Folder</th>
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-[color:var(--topo-muted)]"
                >
                  No cases yet. Create one or import a CSV.
                </td>
              </tr>
            ) : (
              filtered.map((c, i) => (
                <motion.tr
                  key={c.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-[color:var(--topo-line)]/70 last:border-0"
                >
                  <td className="px-4 py-3 font-mono text-xs text-[color:var(--topo-accent)]">
                    {c.key}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[color:var(--topo-ink)]">
                      {c.title}
                    </div>
                    {c.tags.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <Chip key={t} size="sm" variant="soft">
                            {t}
                          </Chip>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--topo-muted)]">
                    {c.folder?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">{c.priority}</td>
                  <td className="px-4 py-3 capitalize">{c.status}</td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
