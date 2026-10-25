"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@heroui/react";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";

export type ParameterDraft = { name: string; defaultValue: string };
export type DatasetDraft = { values: Record<string, string> };
export type CustomFieldDefView = {
  key: string;
  label: string;
  type: string;
  options?: string[];
  required?: boolean;
};

type VersionRow = { id: string; version: number; summary: string; createdAt: string };

export function CaseTcmPanel({
  caseId,
  parameters,
  datasets,
  customFields,
  customFieldDefs,
  onParametersChange,
  onDatasetsChange,
  onCustomFieldsChange,
  disabled,
  onRestored,
}: {
  caseId: string;
  parameters: ParameterDraft[];
  datasets: DatasetDraft[];
  customFields: Record<string, unknown>;
  customFieldDefs: CustomFieldDefView[];
  onParametersChange: (next: ParameterDraft[]) => void;
  onDatasetsChange: (next: DatasetDraft[]) => void;
  onCustomFieldsChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
  onRestored?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch(`/api/cases/${caseId}/versions`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to load versions");
        if (!cancelled) setVersions(data.versions ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load versions");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, open]);

  async function restore(versionId: string) {
    setError(null);
    const res = await fetch(`/api/cases/${caseId}/versions/${versionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Restore failed");
      return;
    }
    onRestored?.();
  }

  return (
    <div className="space-y-2 border-t border-[color:var(--topo-line)] pt-3">
      <Button
        size="sm"
        variant="secondary"
        className="w-full justify-between"
        onPress={() => setOpen((v) => !v)}
      >
        {open ? "Hide parameters & versions" : "Parameters, data & versions"}
      </Button>
      {open ? (
        <div className="space-y-3">
          {error ? (
            <p className="text-xs text-red-600 dark:text-red-300">{error}</p>
          ) : null}
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
              Parameters
            </p>
            {parameters.map((param, i) => (
              <div key={i} className="flex gap-1.5">
                <Input
                  aria-label={`Parameter ${i + 1} name`}
                  placeholder="name"
                  value={param.name}
                  disabled={disabled}
                  onChange={(e) =>
                    onParametersChange(
                      parameters.map((p, idx) =>
                        idx === i ? { ...p, name: e.target.value } : p,
                      ),
                    )
                  }
                />
                <Input
                  aria-label={`Parameter ${i + 1} default`}
                  placeholder="default"
                  value={param.defaultValue}
                  disabled={disabled}
                  onChange={(e) =>
                    onParametersChange(
                      parameters.map((p, idx) =>
                        idx === i ? { ...p, defaultValue: e.target.value } : p,
                      ),
                    )
                  }
                />
                <Button
                  size="sm"
                  variant="tertiary"
                  isDisabled={disabled}
                  aria-label={`Remove parameter ${i + 1}`}
                  onPress={() =>
                    onParametersChange(parameters.filter((_, idx) => idx !== i))
                  }
                >
                  <TrashIcon size={12} />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="secondary"
              isDisabled={disabled}
              onPress={() =>
                onParametersChange([...parameters, { name: "", defaultValue: "" }])
              }
            >
              <PlusIcon size={12} />
              Add parameter
            </Button>
          </div>

          {parameters.some((p) => p.name.trim()) ? (
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
                Dataset rows
              </p>
              {datasets.map((row, i) => (
                <div key={i} className="space-y-1 rounded-md border border-[color:var(--topo-line)] p-2">
                  {parameters
                    .filter((p) => p.name.trim())
                    .map((p) => (
                      <Input
                        key={p.name}
                        aria-label={`Row ${i + 1} ${p.name}`}
                        placeholder={p.name}
                        value={row.values[p.name] ?? ""}
                        disabled={disabled}
                        onChange={(e) =>
                          onDatasetsChange(
                            datasets.map((d, idx) =>
                              idx === i
                                ? {
                                    values: {
                                      ...d.values,
                                      [p.name]: e.target.value,
                                    },
                                  }
                                : d,
                            ),
                          )
                        }
                      />
                    ))}
                  <Button
                    size="sm"
                    variant="tertiary"
                    isDisabled={disabled}
                    onPress={() =>
                      onDatasetsChange(datasets.filter((_, idx) => idx !== i))
                    }
                  >
                    Remove row
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="secondary"
                isDisabled={disabled}
                onPress={() => onDatasetsChange([...datasets, { values: {} }])}
              >
                Add row
              </Button>
            </div>
          ) : null}

          {customFieldDefs.length > 0 ? (
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
                Custom fields
              </p>
              {customFieldDefs.map((def) => (
                <label key={def.key} className="block space-y-1 text-xs">
                  <span className="text-[color:var(--topo-muted)]">
                    {def.label}
                    {def.required ? " *" : ""}
                  </span>
                  {def.type === "select" ? (
                    <select
                      className="w-full rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1"
                      value={String(customFields[def.key] ?? "")}
                      disabled={disabled}
                      onChange={(e) =>
                        onCustomFieldsChange({
                          ...customFields,
                          [def.key]: e.target.value,
                        })
                      }
                    >
                      <option value="">Select…</option>
                      {(def.options ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : def.type === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={Boolean(customFields[def.key])}
                      disabled={disabled}
                      onChange={(e) =>
                        onCustomFieldsChange({
                          ...customFields,
                          [def.key]: e.target.checked,
                        })
                      }
                    />
                  ) : (
                    <Input
                      type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
                      value={
                        customFields[def.key] == null
                          ? ""
                          : String(customFields[def.key])
                      }
                      disabled={disabled}
                      onChange={(e) =>
                        onCustomFieldsChange({
                          ...customFields,
                          [def.key]: e.target.value,
                        })
                      }
                    />
                  )}
                </label>
              ))}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
              Versions
            </p>
            {versions.length === 0 ? (
              <p className="text-xs text-[color:var(--topo-muted)]">
                Snapshots are created on save.
              </p>
            ) : (
              <ul className="space-y-1">
                {versions.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span>
                      v{v.version} · {v.summary}
                    </span>
                    <Button
                      size="sm"
                      variant="tertiary"
                      isDisabled={disabled}
                      onPress={() => void restore(v.id)}
                    >
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
