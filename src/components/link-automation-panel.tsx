"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@heroui/react";

/**
 * Phase 2 merge UX: attach an AUTO-* (or any) implementation onto this intent.
 */
export function LinkAutomationPanel({ intentId }: { intentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [externalKey, setExternalKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function link() {
    const key = externalKey.trim();
    if (!key) return;
    setError(null);
    setOk(false);
    const res = await fetch("/api/implementations/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ externalKey: key, intentId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string"
          ? data.error
          : "Could not link implementation",
      );
      return;
    }
    setExternalKey("");
    setOk(true);
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-4 rounded-md border border-dashed border-[color:var(--topo-line)] p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
        Link automation
      </div>
      <p className="mt-1 text-xs text-[color:var(--topo-muted)]">
        Merge an AUTO-* (or other) implementation onto this intent when Phase 1
        backfill created a duplicate catalog entry.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input
          aria-label="Implementation external key"
          placeholder="AUTO-auth-lockout"
          value={externalKey}
          onChange={(e) => {
            setExternalKey(e.target.value);
            setOk(false);
          }}
          className="min-w-[12rem] flex-1 font-mono text-xs"
        />
        <Button
          onPress={() => void link()}
          isDisabled={pending || !externalKey.trim()}
        >
          Link
        </Button>
      </div>
      {ok ? (
        <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
          Linked — refresh to see implementations.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p>
      ) : null}
    </div>
  );
}
