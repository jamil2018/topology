"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@heroui/react";
import { StatusChip } from "./status-chip";

type EvidenceReport = {
  commitSha: string | null;
  state: string;
  policy?: { version: string };
  digest?: string;
  matrix?: Array<{
    caseKey: string;
    environment: string;
    status: string;
    reportHref: string | null;
  }>;
};

const STATE_LABELS: Record<string, string> = {
  policy_missing: "Release policy unavailable",
  head_unknown: "PR head unverified",
  awaiting_signoff: "Ready for sign-off",
  evidence_incomplete: "Evidence incomplete",
  signed: "Signed off",
  case_unavailable: "Approved case unavailable",
  stale_commit: "Evidence belongs to an older commit",
  not_requested: "Run required",
  unverified: "Run evidence unverified",
  not_selected: "Case missing from the run plan",
  stale_revision: "Case revision changed",
  ambiguous: "Test mapping is ambiguous",
  missing_result: "Result missing",
  passed: "Passed",
  not_passing: "Test did not pass",
};

export function PrReleaseEvidence({
  pullRequestId,
  projectId,
  canSign,
}: {
  pullRequestId: string;
  projectId: string | null;
  canSign: boolean;
}) {
  const [report, setReport] = useState<EvidenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update(digest?: string) {
    startTransition(async () => {
      setError(null);
      const headers = new Headers({ "Content-Type": "application/json" });
      if (projectId) headers.set("x-topology-project-id", projectId);
      try {
        if (digest) {
          const signed = await fetch("/api/releases/evidence", {
            method: "POST", headers,
            body: JSON.stringify({ pullRequestId, digest }),
          });
          if (!signed.ok) {
            const body = await signed.json() as { error?: string };
            setError(body.error ?? "Could not sign off");
          }
        }
        const query = new URLSearchParams({ pullRequestId });
        const res = await fetch(`/api/releases/evidence?${query}`, { headers });
        const body = await res.json() as { error?: string; report?: EvidenceReport };
        if (!res.ok || !body.report) {
          setReport(null);
          setError(body.error ?? "Could not load release evidence");
        } else {
          setReport(body.report);
        }
      } catch {
        setError("Release evidence is temporarily unavailable");
      }
    });
  }

  return (
    <section className="space-y-3" aria-label="Release evidence">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" isDisabled={pending} onPress={() => update()}>
          {report ? "Refresh release evidence" : "View release evidence"}
        </Button>
        {report ? <StatusChip>{STATE_LABELS[report.state] ?? report.state}</StatusChip> : null}
        {canSign && report?.state === "awaiting_signoff" && report.digest ? (
          <Button size="sm" variant="primary" isDisabled={pending} onPress={() => update(report.digest)}>
            Sign off this evidence
          </Button>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {report?.matrix ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="pb-2 text-left text-xs text-[color:var(--topo-muted)]">
              Policy {report.policy?.version} · <code>{report.commitSha?.slice(0, 12)}</code>
            </caption>
            <thead>
              <tr className="border-b border-[color:var(--topo-line)]">
                <th scope="col" className="py-1 pr-3">Case</th>
                <th scope="col" className="py-1 pr-3">Environment</th>
                <th scope="col" className="py-1">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {report.matrix.map((cell) => (
                <tr key={JSON.stringify([cell.caseKey, cell.environment])} className="border-b border-[color:var(--topo-line)]">
                  <td className="py-1 pr-3 font-mono">{cell.caseKey}</td>
                  <td className="py-1 pr-3">{cell.environment}</td>
                  <td className="py-1">
                    {cell.reportHref ? (
                      <Link href={cell.reportHref} className="underline underline-offset-2">{STATE_LABELS[cell.status] ?? cell.status}</Link>
                    ) : STATE_LABELS[cell.status] ?? cell.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
