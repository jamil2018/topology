"use client";

import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { TopoDisclosure } from "./ui/topo-disclosure";

export function ExploratoryCaseProposal({ runId, resultId }: { runId: string; resultId: string }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setSaving(true);
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exploration: { runId, resultId },
          payload: {
            diffs: [{ entityType: "case", action: "create", before: null, after: fields }],
          },
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(typeof body.error === "string" ? body.error : "Could not submit the proposal");
      }
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not submit the proposal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <TopoDisclosure title="Propose a follow-up case" bordered bodyClassName="pt-3">
      {saved ? (
        <p role="status" className="text-sm">
          Proposal submitted. <Link href="/proposals" className="underline">Open the review queue</Link>
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <TextField name="key" isRequired>
            <Label>Case key</Label>
            <Input maxLength={64} placeholder="CHECKOUT-123" />
          </TextField>
          <TextField name="title" isRequired>
            <Label>Case title</Label>
            <Input maxLength={200} />
          </TextField>
          <TextField name="steps" isRequired>
            <Label>Steps to reproduce</Label>
            <TextArea rows={4} maxLength={20_000} />
          </TextField>
          <TextField name="expectedResult" isRequired>
            <Label>Expected result</Label>
            <TextArea rows={3} maxLength={10_000} />
          </TextField>
          {error ? <p role="alert" className="topo-feedback">{error}</p> : null}
          <Button type="submit" size="sm" variant="primary" isDisabled={saving}>Submit for review</Button>
        </form>
      )}
    </TopoDisclosure>
  );
}
