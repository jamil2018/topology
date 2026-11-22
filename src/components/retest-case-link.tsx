"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { useProjectActions } from "./project-actions";
import { useMutationFeedback } from "./use-mutation-feedback";
import { TopoSelect } from "./ui/topo-select";

export function RetestCaseLink({ resultId, cases, onLinked }: { resultId: string; cases: { id: string; key: string; title: string }[]; onLinked: (id: string) => void }) {
  const router = useRouter();
  const { can } = useProjectActions();
  const [caseId, setCaseId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { saving, submit } = useMutationFeedback(setError);
  return <div className="mt-2 space-y-2">
    <div className="flex flex-wrap gap-2 items-end">
      <TopoSelect
        label="Executable case"
        ariaLabel="Executable case"
        className="min-w-0 max-w-full"
        value={caseId}
        onChange={setCaseId}
        isDisabled={!can("automation.manage") || saving}
        placeholder="Choose a case"
        options={cases.map((item) => ({
          id: item.id,
          label: `${item.key} · ${item.title}`,
        }))}
        compact
      />
      <Button size="sm" variant="secondary" isDisabled={!can("automation.manage") || saving || !caseId} onPress={() => void submit(async () => {
        const response = await fetch(`/api/results/${resultId}/case`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId }) });
        if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Could not link case"); }
        onLinked(caseId); router.refresh();
      })}>{saving ? "Linking…" : "Link for retest"}</Button>
    </div>
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
