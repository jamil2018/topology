"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Button } from "@heroui/react";
import {
  ArrowLeftIcon,
  FileArrowUpIcon,
  PlugsIcon,
} from "@phosphor-icons/react";
import {
  IMPORT_PROVIDERS,
  TOPOLOGY_CASE_FIELDS,
  type FieldMapping,
  type ImportProvider,
  type MappingPreview,
} from "@/lib/import/types";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";

const PROVIDER_LABEL: Record<ImportProvider, string> = {
  testrail: "TestRail",
  qase: "Qase",
  zephyr: "Zephyr Scale",
  xray: "Xray",
};

const PROVIDER_HINT: Record<ImportProvider, string> = {
  testrail: "XML, CSV, JSON, or API",
  qase: "CSV, JSON, or API",
  zephyr: "CSV, JSON, or API",
  xray: "CSV or JSON export",
};

const FIELD_LABEL: Record<(typeof TOPOLOGY_CASE_FIELDS)[number], string> = {
  key: "Key",
  title: "Title",
  description: "Description",
  preconditions: "Preconditions",
  steps: "Steps",
  expectedResult: "Expected result",
  priority: "Priority",
  status: "Status",
  folder: "Folder",
  tags: "Tags",
};

type ApiForm = {
  baseUrl: string;
  email: string;
  token: string;
  project: string;
};

const emptyApi: ApiForm = { baseUrl: "", email: "", token: "", project: "" };

export function ImportWorkspace() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState<ImportProvider>("testrail");
  const [source, setSource] = useState<"file" | "api">("file");
  const [fileName, setFileName] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [api, setApi] = useState<ApiForm>(emptyApi);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [preview, setPreview] = useState<MappingPreview | null>(null);
  const [dryRun, setDryRun] = useState<{
    wouldCreate: number;
    wouldSkip: string[];
    errors: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"preview" | "dry" | "run" | null>(null);

  const apiEnabled = provider !== "xray";

  const bodyFor = (dry: boolean) => {
    if (source === "api") {
      return JSON.stringify({
        provider,
        mapping,
        dryRun: dry,
        api: {
          baseUrl: api.baseUrl.trim(),
          email: api.email.trim() || undefined,
          token: api.token,
          project: api.project.trim(),
        },
      });
    }
    return JSON.stringify({
      provider,
      mapping,
      dryRun: dry,
      content,
      filename: fileName ?? undefined,
    });
  };

  async function runPreview() {
    setError(null);
    setMessage(null);
    setDryRun(null);
    setPending("preview");
    try {
      const res = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bodyFor(false),
      });
      const data = (await res.json().catch(() => ({}))) as MappingPreview & {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Preview failed");
        return;
      }
      setPreview(data);
      setMapping(data.mapping);
    } catch {
      setError("Preview failed");
    } finally {
      setPending(null);
    }
  }

  async function runImport(dry: boolean) {
    setError(null);
    setMessage(null);
    setPending(dry ? "dry" : "run");
    try {
      const res = await fetch("/api/import/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bodyFor(dry),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        wouldCreate?: number;
        wouldSkip?: string[];
        created?: number;
        skipped?: string[];
        errors?: string[];
      };
      if (!res.ok) {
        setError(data.error ?? "Import failed");
        return;
      }
      if (dry) {
        setDryRun({
          wouldCreate: data.wouldCreate ?? 0,
          wouldSkip: data.wouldSkip ?? [],
          errors: data.errors ?? [],
        });
        return;
      }
      setMessage(
        `Imported ${data.created ?? 0} cases` +
          (data.skipped?.length ? ` · skipped ${data.skipped.length}` : ""),
      );
      router.refresh();
    } catch {
      setError("Import failed");
    } finally {
      setPending(null);
    }
  }

  const sourceFields = preview?.sourceFields ?? [];
  const canPreview =
    source === "file" ? Boolean(content.trim()) : Boolean(api.token.trim());
  const sample = useMemo(
    () => preview?.sampleMappedRows ?? [],
    [preview],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Suites"
        title="Import cases"
        description="Map TestRail, Qase, Zephyr Scale, or Xray exports onto Topology cases. Preview and dry-run before anything is written."
        actions={
          <Link
            href="/cases"
            className="button button--sm button--secondary inline-flex items-center gap-1.5"
          >
            <ArrowLeftIcon size={14} weight="bold" />
            Back to cases
          </Link>
        }
      />

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-2 text-sm text-[color:var(--topo-ink)]">
          {message}
        </p>
      ) : null}

      <section className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--topo-muted)]">
          Provider
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {IMPORT_PROVIDERS.map((id) => (
            <Button
              key={id}
              size="sm"
              variant={provider === id ? "primary" : "secondary"}
              onPress={() => {
                setProvider(id);
                setPreview(null);
                setDryRun(null);
                if (id === "xray") setSource("file");
              }}
            >
              {PROVIDER_LABEL[id]}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[color:var(--topo-muted)]">
          {PROVIDER_HINT[provider]}. Field aliases and file shapes are in{" "}
          <span className="font-mono text-[color:var(--topo-ink)]">docs/import.md</span>.
        </p>
      </section>

      <section className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={source === "file" ? "primary" : "secondary"}
            className="gap-1.5"
            onPress={() => setSource("file")}
          >
            <FileArrowUpIcon size={14} weight="bold" />
            File
          </Button>
          {apiEnabled ? (
            <Button
              size="sm"
              variant={source === "api" ? "primary" : "secondary"}
              className="gap-1.5"
              onPress={() => setSource("api")}
            >
              <PlugsIcon size={14} weight="bold" />
              API
            </Button>
          ) : (
            <StatusChip>File only</StatusChip>
          )}
        </div>

        {source === "file" ? (
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xml,.json,text/csv,application/json,text/xml"
              className="hidden"
              aria-label="Vendor export file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setFileName(file.name);
                void file.text().then((text) => {
                  setContent(text);
                  setPreview(null);
                  setDryRun(null);
                });
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              onPress={() => fileRef.current?.click()}
            >
              Choose export
            </Button>
            <p className="text-xs text-[color:var(--topo-muted)]">
              {fileName ?? "No file selected"}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-[color:var(--topo-muted)]">
              Base URL
              <input
                className="block w-full rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)] px-2 py-1.5 text-sm text-[color:var(--topo-ink)]"
                value={api.baseUrl}
                onChange={(e) =>
                  setApi((prev) => ({ ...prev, baseUrl: e.target.value }))
                }
                placeholder={
                  provider === "testrail"
                    ? "https://example.testrail.io"
                    : provider === "qase"
                      ? "https://api.qase.io"
                      : "https://api.zephyrscale.smartbear.com/v2"
                }
              />
            </label>
            {provider === "testrail" ? (
              <label className="space-y-1 text-xs text-[color:var(--topo-muted)]">
                Email
                <input
                  className="block w-full rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)] px-2 py-1.5 text-sm text-[color:var(--topo-ink)]"
                  value={api.email}
                  onChange={(e) =>
                    setApi((prev) => ({ ...prev, email: e.target.value }))
                  }
                  autoComplete="off"
                />
              </label>
            ) : null}
            <label className="space-y-1 text-xs text-[color:var(--topo-muted)]">
              API token
              <input
                type="password"
                className="block w-full rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)] px-2 py-1.5 text-sm text-[color:var(--topo-ink)]"
                value={api.token}
                onChange={(e) =>
                  setApi((prev) => ({ ...prev, token: e.target.value }))
                }
                autoComplete="off"
              />
            </label>
            <label className="space-y-1 text-xs text-[color:var(--topo-muted)]">
              {provider === "testrail" ? "Project id" : "Project key"}
              <input
                className="block w-full rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)] px-2 py-1.5 text-sm text-[color:var(--topo-ink)]"
                value={api.project}
                onChange={(e) =>
                  setApi((prev) => ({ ...prev, project: e.target.value }))
                }
              />
            </label>
            <p className="sm:col-span-2 text-xs text-[color:var(--topo-muted)]">
              Credentials are used for this request only and are not stored.
              Local and private URLs are blocked.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            isDisabled={!canPreview || pending !== null}
            onPress={() => void runPreview()}
          >
            {pending === "preview" ? "Reading…" : "Preview mapping"}
          </Button>
        </div>
      </section>

      {preview ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip mono>
              {preview.counts.valid}/{preview.counts.total} valid
            </StatusChip>
            {preview.counts.invalid ? (
              <StatusChip tone="warning">{preview.counts.invalid} invalid</StatusChip>
            ) : null}
            <StatusChip mono>{preview.format}</StatusChip>
          </div>

          <div className="overflow-x-auto rounded-md border border-[color:var(--topo-line)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[color:var(--topo-chip)] text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Topology field</th>
                  <th className="px-3 py-2 font-medium">Source field</th>
                </tr>
              </thead>
              <tbody>
                {TOPOLOGY_CASE_FIELDS.map((field) => (
                  <tr
                    key={field}
                    className="border-t border-[color:var(--topo-line)]"
                  >
                    <td className="px-3 py-1.5 text-[color:var(--topo-ink)]">
                      {FIELD_LABEL[field]}
                      {field === "title" ? " *" : ""}
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        aria-label={`Map ${FIELD_LABEL[field]}`}
                        className="w-full rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)] px-2 py-1 text-sm"
                        value={mapping[field] ?? ""}
                        onChange={(event) =>
                          setMapping((prev) => ({
                            ...prev,
                            [field]: event.target.value,
                          }))
                        }
                      >
                        <option value="">— skip —</option>
                        {sourceFields.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sample.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-[color:var(--topo-line)]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[color:var(--topo-chip)] text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Key</th>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">Folder</th>
                    <th className="px-3 py-2 font-medium">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {sample.map((row) => (
                    <tr
                      key={row.key}
                      className="border-t border-[color:var(--topo-line)]"
                    >
                      <td className="px-3 py-1.5 font-mono text-xs">{row.key}</td>
                      <td className="px-3 py-1.5">{row.title}</td>
                      <td className="px-3 py-1.5 text-[color:var(--topo-muted)]">
                        {row.folder || "—"}
                      </td>
                      <td className="px-3 py-1.5">{row.priority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {preview.errors.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-xs text-[color:var(--topo-muted)]">
              {preview.errors.slice(0, 8).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              isDisabled={pending !== null}
              onPress={() => void runImport(true)}
            >
              {pending === "dry" ? "Checking…" : "Dry run"}
            </Button>
            <Button
              size="sm"
              variant="primary"
              isDisabled={pending !== null}
              onPress={() => void runImport(false)}
            >
              {pending === "run" ? "Importing…" : "Import cases"}
            </Button>
          </div>

          {dryRun ? (
            <p className="text-sm text-[color:var(--topo-ink)]">
              Dry run: would create {dryRun.wouldCreate}
              {dryRun.wouldSkip.length
                ? ` · skip ${dryRun.wouldSkip.length} existing keys`
                : ""}
              . Nothing was written.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
