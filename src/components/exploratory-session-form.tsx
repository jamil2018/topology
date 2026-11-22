"use client";

import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PageHeader } from "./page-header";

export function ExploratorySessionForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/runs/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      router.push(data.href);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create the session");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="New exploratory session" actions={
        <Link href="/runs" className="button button--sm button--secondary">Test runs</Link>
      } />
      <form onSubmit={create} className="max-w-xl space-y-4 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
        <TextField name="name" isRequired>
          <Label>Session name</Label>
          <Input maxLength={200} />
        </TextField>
        <TextField name="charter" isRequired>
          <Label>Charter</Label>
          <TextArea rows={5} maxLength={10_000} placeholder="Describe what to explore and what you want to learn." />
        </TextField>
        <TextField name="environment" isRequired defaultValue="local">
          <Label>Environment</Label>
          <Input maxLength={120} />
        </TextField>
        {error ? <p role="alert" className="topo-feedback">{error}</p> : null}
        <Button type="submit" variant="primary" isDisabled={saving}>
          {saving ? "Creating…" : "Create session"}
        </Button>
      </form>
    </div>
  );
}
