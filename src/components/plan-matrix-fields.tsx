"use client";

import { useState } from "react";

export const BROWSER_PRESETS = ["Chrome", "Firefox", "Safari", "Edge"];
export const OS_PRESETS = ["macOS", "Windows", "Linux", "iOS", "Android"];

export function PlanMatrixFields({
  browsers,
  oses,
  envIds,
  environments,
  onBrowsers,
  onOses,
  onEnvIds,
  browserPresets = BROWSER_PRESETS,
  osPresets = OS_PRESETS,
}: {
  browsers: string[];
  oses: string[];
  envIds: string[];
  environments: Array<{ id: string; name: string }>;
  onBrowsers: (next: string[]) => void;
  onOses: (next: string[]) => void;
  onEnvIds: (next: string[]) => void;
  browserPresets?: string[];
  osPresets?: string[];
}) {
  return (
    <>
      <TagInput
        label="Browsers"
        value={browsers}
        onChange={onBrowsers}
        presets={browserPresets}
        placeholder="Add a browser"
      />
      <TagInput
        label="Operating systems"
        value={oses}
        onChange={onOses}
        presets={osPresets}
        placeholder="Add an OS"
      />
      {environments.length > 0 ? (
        <fieldset className="space-y-1">
          <legend className="text-xs text-[color:var(--topo-muted)]">
            Environments
          </legend>
          <div className="flex flex-wrap gap-3">
            {environments.map((env) => (
              <label
                key={env.id}
                className="flex items-center gap-1.5 text-xs"
              >
                <input
                  type="checkbox"
                  checked={envIds.includes(env.id)}
                  onChange={(e) =>
                    onEnvIds(
                      e.target.checked
                        ? [...envIds, env.id]
                        : envIds.filter((id) => id !== env.id),
                    )
                  }
                />
                {env.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-xs text-[color:var(--topo-muted)]">
          No named environments yet — runs will use the default local target.
        </p>
      )}
    </>
  );
}

function TagInput({
  label,
  value,
  onChange,
  presets,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  presets: string[];
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function add(tag: string) {
    const next = tag.trim();
    if (
      !next ||
      value.some((item) => item.toLowerCase() === next.toLowerCase())
    ) {
      setDraft("");
      return;
    }
    onChange([...value, next]);
    setDraft("");
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-[color:var(--topo-muted)]">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <button
            key={tag}
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-chip)] px-2 py-0.5 text-xs text-[color:var(--topo-ink)]"
            onClick={() => onChange(value.filter((item) => item !== tag))}
            aria-label={`Remove ${tag}`}
          >
            {tag}
            <span aria-hidden className="text-[color:var(--topo-muted)]">
              ×
            </span>
          </button>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder={placeholder}
          aria-label={label}
          className="min-w-[8rem] flex-1 bg-transparent text-sm text-[color:var(--topo-ink)] outline-none placeholder:text-[color:var(--topo-muted)]"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {presets.map((preset) => {
          const selected = value.some(
            (item) => item.toLowerCase() === preset.toLowerCase(),
          );
          return (
            <button
              key={preset}
              type="button"
              disabled={selected}
              onClick={() => add(preset)}
              className={`rounded-md px-2 py-0.5 text-xs ${
                selected
                  ? "bg-[color:var(--topo-accent-soft)] text-[color:var(--topo-ink)]"
                  : "border border-[color:var(--topo-line)] text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
              }`}
            >
              {preset}
            </button>
          );
        })}
      </div>
    </div>
  );
}
