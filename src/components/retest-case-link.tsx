"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { useProjectActions } from "./project-actions";
import { useMutationFeedback } from "./use-mutation-feedback";

export function RetestCaseLink({ resultId, cases, onLinked }: { resultId: string; cases: { id: string; key: string; title: string }[]; onLinked: (id: string) => void }) {
  const router = useRouter();
  const { can } = useProjectActions();
  const [caseId, setCaseId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { saving, submit } = useMutationFeedback(setError);
  return <div className="mt-2 space-y-2">
    <div className="flex flex-wrap gap-2"><label className="min-w-0">Executable case <select className="max-w-full rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-2" value={caseId} onChange={(event) => setCaseId(event.target.value)} disabled={!can("automation.manage") || saving}><option value="">Choose a case</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.key} · {item.title}</option>)}</select></label>
      <Button size="sm" variant="secondary" isDisabled={!can("automation.manage") || saving || !caseId} onPress={() => void submit(async () => {
        const response = await fetch(`/api/results/${resultId}/case`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId }) });
        if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Could not link case"); }
        onLinked(caseId); router.refresh();
      })}>{saving ? "Linking…" : "Link for retest"}</Button></div>
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
