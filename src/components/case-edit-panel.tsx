"use client";
import { useProjectActions } from "./project-actions";

import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Input,
  TextArea,
  Label,
  TextField,
  ListBox,
  Modal,
  Select,
} from "@heroui/react";
import { CopyIcon, FloppyDiskIcon, SparkleIcon, XIcon } from "@phosphor-icons/react";
import { classifyCaseStatusTransition } from "@/lib/case-review";
import { folderPathLabel } from "@/lib/folder-tree";
import type { OrderedStep } from "@/lib/tcm/steps";
import { CaseHistoryPanel } from "./case-history-panel";
import {
  CaseStepsEditor,
  stepsFromFallback,
} from "./case-steps-editor";
import { TopoCheckbox } from "./ui/topo-checkbox";
import {
  CaseTcmPanel,
  CaseVersionsList,
  type CustomFieldDefView,
  type DatasetDraft,
  type ParameterDraft,
} from "./case-tcm-panel";
import { CASE_STATUSES, emptyStructuredStep } from "./cases-model";
import { formatStatusLabel } from "@/lib/format-labels";
import { useQualityGraph } from "./quality-graph-provider";
import { FormFieldsSkeleton } from "./skeletons";
import { TopoSelect } from "./ui/topo-select";

const priorities = ["P0", "P1", "P2", "P3"] as const;
const statuses = CASE_STATUSES;

type Folder = { id: string; name: string; parentId: string | null };
type FlatFolder = Folder & { depth: number };

type CaseDetail = {
  id: string;
  key: string;
  title: string;
  description: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  priority: string;
  status: string;
  tags: string[];
  folderId: string | null;
  intentId?: string | null;
  reviewerId?: string | null;
  reviewedAt?: string | Date | null;
  revision?: string;
  requireCaseReview?: boolean;
  intent?: {
    id: string;
    key: string;
    title: string;
    criticality: string;
    status: string;
  } | null;
  structuredSteps?: OrderedStep[];
  parameters?: ParameterDraft[];
  datasets?: DatasetDraft[];
  customFields?: Record<string, unknown>;
  customFieldDefs?: CustomFieldDefView[];
};

type WorkspaceMember = {
  user: { id: string; name: string | null; email: string };
};

type EditForm = {
  title: string;
  description: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  priority: string;
  status: string;
  folderId: string;
  tags: string;
};

function toForm(detail: CaseDetail): EditForm {
  return {
    title: detail.title,
    description: detail.description ?? "",
    preconditions: detail.preconditions ?? "",
    steps: detail.steps ?? "",
    expectedResult: detail.expectedResult ?? "",
    priority: detail.priority,
    status: detail.status,
    folderId: detail.folderId ?? "",
    tags: (detail.tags ?? []).join("; "),
  };
}

function parseTags(raw: string) {
  return raw
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function aiDraftSourceLabel(data: { heuristic?: unknown; model?: unknown }) {
  const heuristic =
    data.heuristic === true ||
    data.model === "heuristic" ||
    data.model == null;
  if (heuristic) {
    return "Local template — connect an AI provider in Settings for tailored drafts";
  }
  return typeof data.model === "string" && data.model.trim()
    ? `Drafted with ${data.model}`
    : "Drafted with AI model";
}

function reviewerLabel(
  members: WorkspaceMember[],
  reviewerId: string | null | undefined,
) {
  if (!reviewerId) return null;
  const member = members.find((m) => m.user.id === reviewerId);
  if (!member) return "Reviewer assigned";
  const name = member.user.name?.trim();
  if (name) return `${name} (${member.user.email})`;
  return member.user.email;
}

export const CaseEditPanel = memo(function CaseEditPanel({
  caseId,
  caseKey,
  caseTitle,
  folders,
  flatFolders,
  onClose,
  onSaved,
  onDuplicated,
  onDirtyChange,
}: {
  caseId: string;
  caseKey: string;
  caseTitle: string;
  folders: Folder[];
  flatFolders: FlatFolder[];
  onClose: () => void;
  onSaved: (next: {
    id: string;
    key: string;
    title: string;
    priority: string;
    status: string;
    tags: string[];
    folder: { id: string; name: string } | null;
  }) => void;
  onDuplicated?: (next: {
    id: string;
    key: string;
    title: string;
    priority: string;
    status: string;
    tags: string[];
    folder: { id: string; name: string } | null;
    intentId?: string | null;
    intent?: { id: string; key: string; title: string } | null;
  }) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { enabled: qualityGraphEnabled } = useQualityGraph();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const saveLock = useRef(false);
  const duplicateLock = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [proposalSubmitted, setProposalSubmitted] = useState(false);
  const { can, userId } = useProjectActions();
  const [serverReadOnly, setReadOnly] = useState(false);
  const readOnly = serverReadOnly || !can("cases.edit");
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [historyTab, setHistoryTab] = useState<"activity" | "versions">(
    "activity",
  );
  const [useStructured, setUseStructured] = useState(false);
  const [structuredSteps, setStructuredSteps] = useState<OrderedStep[]>([]);
  const [parameters, setParameters] = useState<ParameterDraft[]>([]);
  const [datasets, setDatasets] = useState<DatasetDraft[]>([]);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefView[]>([]);
  const [sharedSteps, setSharedSteps] = useState<Array<{ id: string; name: string }>>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [reviewerId, setReviewerId] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [draftingSteps, setDraftingSteps] = useState(false);
  const [draftSourceLabel, setDraftSourceLabel] = useState<string | null>(null);
  const [confirmDuplicateOpen, setConfirmDuplicateOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setProposalSubmitted(false);
    setReadOnly(false);
    setShowHistory(false);
    setHistoryTab("activity");
    setReviewComment("");
    void fetch(`/api/cases/${caseId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Failed to load case",
          );
        }
        if (cancelled) return;
        const next = data.case as CaseDetail;
        setDetail(next);
        setForm(toForm(next));
        setReviewerId(next.reviewerId ?? "");
        const stored = next.structuredSteps ?? [];
        setUseStructured(stored.length > 0);
        setStructuredSteps(stored);
        setParameters(next.parameters ?? []);
        setDatasets(next.datasets ?? []);
        setCustomFields(next.customFields ?? {});
        setCustomFieldDefs(next.customFieldDefs ?? []);
        if (stored.length > 0) {
          void fetch("/api/shared-steps")
            .then((res) => res.json())
            .then((shared) => {
              if (cancelled) return;
              setSharedSteps(
                (shared.sharedSteps ?? []).map(
                  (s: { id: string; name: string }) => ({
                    id: s.id,
                    name: s.name,
                  }),
                ),
              );
            })
            .catch(() => undefined);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load case");
        setLoading(false);
      });
    void fetch("/api/workspace")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setMembers((data.members ?? []) as WorkspaceMember[]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const dirty = useMemo(() => {
    if (!detail || !form) return false;
    return (
      form.title !== detail.title ||
      form.description !== (detail.description ?? "") ||
      form.preconditions !== (detail.preconditions ?? "") ||
      form.steps !== (detail.steps ?? "") ||
      form.expectedResult !== (detail.expectedResult ?? "") ||
      form.priority !== detail.priority ||
      form.status !== detail.status ||
      form.folderId !== (detail.folderId ?? "") ||
      JSON.stringify(parseTags(form.tags)) !==
        JSON.stringify(detail.tags ?? []) ||
      JSON.stringify(structuredSteps) !==
        JSON.stringify(detail.structuredSteps ?? []) ||
      JSON.stringify(parameters) !== JSON.stringify(detail.parameters ?? []) ||
      JSON.stringify(datasets) !== JSON.stringify(detail.datasets ?? []) ||
      JSON.stringify(customFields) !==
        JSON.stringify(detail.customFields ?? {})
    );
  }, [detail, form, structuredSteps, parameters, datasets, customFields]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const saveDisabledReason = !form?.title.trim()
    ? "Title required"
    : !dirty
      ? "No changes"
      : null;

  async function duplicate() {
    if (!can("cases.create") || duplicateLock.current || duplicating) return;
    if (dirty) {
      setConfirmDuplicateOpen(true);
      return;
    }
    await performDuplicate();
  }

  async function performDuplicate() {
    if (!can("cases.create") || duplicateLock.current || duplicating) return;
    duplicateLock.current = true;
    setDuplicating(true);
    setSaveError(null);
    setConfirmDuplicateOpen(false);
    try {
      const res = await fetch(`/api/cases/${caseId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(
          typeof data.error === "string"
            ? data.error
            : "Failed to duplicate case",
        );
        return;
      }
      const cloned = data.case as {
        id: string;
        key: string;
        title: string;
        priority: string;
        status: string;
        tags: string[];
        folder: { id: string; name: string } | null;
        intentId?: string | null;
        intent?: { id: string; key: string; title: string } | null;
      };
      onDuplicated?.(cloned);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Failed to duplicate case",
      );
    } finally {
      duplicateLock.current = false;
      setDuplicating(false);
    }
  }

  async function save(): Promise<boolean> {
    if (!form || !detail || readOnly || saveLock.current) return false;
    saveLock.current = true;
    setSaving(true);
    setSaveError(null);
    setProposalSubmitted(false);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description,
          preconditions: form.preconditions,
          steps: form.steps,
          expectedResult: form.expectedResult,
          priority: form.priority,
          status: form.status,
          folderId: form.folderId || null,
          tags: parseTags(form.tags),
          expectedRevision: detail.revision,
          ...(useStructured
            ? {
                structuredSteps,
                parameters,
                datasets,
                customFields,
              }
            : customFieldDefs.length > 0
              ? { customFields }
              : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 202 && data.proposalId) {
        setForm(toForm(detail));
        setStructuredSteps(detail.structuredSteps ?? []);
        setUseStructured(Boolean(detail.structuredSteps?.length));
        setParameters(detail.parameters ?? []);
        setDatasets(detail.datasets ?? []);
        setCustomFields(detail.customFields ?? {});
        setProposalSubmitted(true);
        return false;
      }
      if (res.status === 403) {
        setReadOnly(true);
        setSaveError(
          typeof data.error === "string"
            ? data.error
            : "You do not have permission to edit cases",
        );
        return false;
      }
      if (!res.ok) {
        setSaveError(
          typeof data.error === "string" ? data.error : "Failed to save case",
        );
        return false;
      }
      const saved = data.case as CaseDetail & {
        folder?: { id: string; name: string } | null;
      };
      const nextDetail: CaseDetail = {
        id: saved.id,
        key: saved.key,
        title: saved.title,
        description: saved.description ?? "",
        preconditions: saved.preconditions ?? "",
        steps: saved.steps ?? "",
        expectedResult: saved.expectedResult ?? "",
        priority: saved.priority,
        status: saved.status,
        tags: saved.tags ?? [],
        folderId: saved.folderId ?? null,
        intentId: saved.intentId ?? detail.intentId,
        intent: saved.intent ?? detail.intent,
        reviewerId: saved.reviewerId ?? detail.reviewerId,
        reviewedAt: saved.reviewedAt ?? detail.reviewedAt,
        requireCaseReview: saved.requireCaseReview ?? detail.requireCaseReview,
        revision: saved.revision ?? detail.revision,
        structuredSteps: useStructured
          ? structuredSteps
          : (saved.structuredSteps ?? []),
        parameters,
        datasets,
        customFields,
        customFieldDefs,
      };
      setDetail(nextDetail);
      setForm(toForm(nextDetail));
      setHistoryKey((k) => k + 1);
      const folder =
        nextDetail.folderId != null
          ? (() => {
              const match = folders.find((f) => f.id === nextDetail.folderId);
              return match
                ? { id: match.id, name: match.name }
                : saved.folder
                  ? { id: saved.folder.id, name: saved.folder.name }
                  : null;
            })()
          : null;
      onSaved({
        id: nextDetail.id,
        key: nextDetail.key,
        title: nextDetail.title,
        priority: nextDetail.priority,
        status: nextDetail.status,
        tags: nextDetail.tags,
        folder,
      });
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save. Your draft is preserved.");
      return false;
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function applyReview(action: "submit" | "approve" | "request_changes") {
    if (!detail || reviewBusy) return;
    if (action === "submit" && !can("cases.edit")) return;
    if (
      (action === "approve" || action === "request_changes") &&
      !can("cases.approve")
    ) {
      return;
    }
    if (action === "submit" && !reviewerId) {
      setSaveError("Choose a reviewer before submitting");
      return;
    }
    if (action === "request_changes" && !reviewComment.trim()) {
      setSaveError("Add a review comment when requesting changes");
      return;
    }
    if (dirty) {
      const saved = await save();
      if (!saved) return;
    }
    setReviewBusy(true);
    setSaveError(null);
    try {
      const body =
        action === "submit"
          ? { status: "in_review", reviewerId }
          : action === "approve"
            ? { status: "ready", expectedRevision: detail.revision }
            : { status: "draft", reviewComment: reviewComment.trim() };
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(
          typeof data.error === "string" ? data.error : "Review action failed",
        );
        return;
      }
      const saved = data.case as CaseDetail & {
        folder?: { id: string; name: string } | null;
      };
      const nextDetail: CaseDetail = {
        ...detail,
        status: saved.status,
        reviewerId: saved.reviewerId ?? detail.reviewerId,
        reviewedAt: saved.reviewedAt ?? detail.reviewedAt,
        revision: saved.revision ?? detail.revision,
      };
      setDetail(nextDetail);
      setForm((f) => (f ? { ...f, status: saved.status } : f));
      setReviewComment("");
      setHistoryKey((k) => k + 1);
      const folder =
        nextDetail.folderId != null
          ? (() => {
              const match = folders.find((f) => f.id === nextDetail.folderId);
              return match
                ? { id: match.id, name: match.name }
                : saved.folder
                  ? { id: saved.folder.id, name: saved.folder.name }
                  : null;
            })()
          : null;
      onSaved({
        id: nextDetail.id,
        key: nextDetail.key,
        title: nextDetail.title,
        priority: nextDetail.priority,
        status: nextDetail.status,
        tags: nextDetail.tags,
        folder,
      });
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Review action failed",
      );
    } finally {
      setReviewBusy(false);
    }
  }

  async function draftStepsWithAi() {
    if (!form || readOnly || draftingSteps) return;
    setDraftingSteps(true);
    setSaveError(null);
    setDraftSourceLabel(null);
    try {
      const res = await fetch("/api/ai/draft?heuristic=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: "case_steps",
          title: form.title.trim() || detail?.title || caseTitle,
          description: form.description,
          allowHeuristic: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(
          typeof data.error === "string"
            ? data.error
            : "Could not draft steps",
        );
        return;
      }
      const drafted = Array.isArray(data.steps)
        ? (data.steps as Array<{
            action?: string;
            expected?: string;
            data?: string;
          }>)
        : [];
      if (drafted.length === 0) {
        setSaveError("AI returned no steps to insert");
        return;
      }
      const nextSteps: OrderedStep[] = drafted.map((step, index) => ({
        ...emptyStructuredStep(),
        position: index,
        action: step.action ?? "",
        expected: step.expected ?? "",
        data: step.data ?? "",
      }));
      setStructuredSteps(nextSteps);
      setUseStructured(true);
      setDraftSourceLabel(aiDraftSourceLabel(data));
      void fetch("/api/shared-steps")
        .then((sharedRes) => sharedRes.json())
        .then((shared) => {
          setSharedSteps(
            (shared.sharedSteps ?? []).map(
              (s: { id: string; name: string }) => ({
                id: s.id,
                name: s.name,
              }),
            ),
          );
        })
        .catch(() => undefined);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not draft steps",
      );
    } finally {
      setDraftingSteps(false);
    }
  }

  const headerKey = detail?.key ?? caseKey;
  const headerTitle = form?.title || detail?.title || caseTitle;
  const statusValue = form?.status ?? detail?.status ?? "draft";
  const readyRequiresReview = detail?.requireCaseReview && detail.status === "ready";
  const queuesReview = readyRequiresReview || (detail?.requireCaseReview && detail.status === "deprecated" && statusValue === "ready");
  const canDecideReview = can("cases.approve") && (!detail?.requireCaseReview || !detail.reviewerId || detail.reviewerId === userId);
  const reviewGateActive =
    Boolean(detail?.requireCaseReview || reviewerId || detail?.reviewerId) || statusValue === "in_review";
  const assignedReviewerLabel = reviewerLabel(
    members,
    detail?.reviewerId || reviewerId || null,
  );
  const selectableStatuses = useMemo(() => {
    if (readyRequiresReview) return statuses.filter((s) => s === "ready" || s === "deprecated");
    if (statusValue === "in_review") {
      return statuses.filter((s) => s === "in_review");
    }
    if (reviewGateActive && statusValue === "draft") {
      return statuses.filter((s) => s !== "ready" && s !== "in_review");
    }
    if (detail?.requireCaseReview) {
      return statuses.filter((s) => s !== "in_review" && (s !== "ready" || detail.status === "deprecated"));
    }
    return [...statuses];
  }, [detail?.requireCaseReview, detail?.status, readyRequiresReview, reviewGateActive, statusValue]);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
      <div className="flex items-start justify-between gap-2 border-b border-[color:var(--topo-line)] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[color:var(--topo-muted)]">
            Edit case
          </p>
          <p className="truncate font-mono text-xs text-[color:var(--topo-accent)]">
            {headerKey}
          </p>
          <p className="truncate text-sm font-medium text-[color:var(--topo-ink)]">
            {headerTitle}
          </p>
          {qualityGraphEnabled && detail?.intent ? (
            <p className="mt-1 text-xs text-[color:var(--topo-muted)]">
              Intent{" "}
              <Link
                href={`/intents?intent=${detail.intent.id}`}
                className="font-mono text-[color:var(--topo-accent)] hover:underline"
              >
                {detail.intent.key}
              </Link>
            </p>
          ) : qualityGraphEnabled && detail?.intentId ? (
            <p className="mt-1 text-xs text-[color:var(--topo-muted)]">
              Linked intent
            </p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="tertiary"
          aria-label="Close case editor"
          className="min-w-0 px-2"
          onPress={onClose}
        >
          <XIcon size={14} weight="bold" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {loading ? (
          <div role="status" aria-busy="true" aria-label="Loading case">
            <FormFieldsSkeleton fields={4} />
          </div>
        ) : loadError ? (
          <p className="text-sm text-red-600 dark:text-red-300">{loadError}</p>
        ) : form ? (
          <>
            {readOnly ? (
              <p className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-canvas)] px-2.5 py-2 text-xs text-[color:var(--topo-muted)]">
                Read-only — your role cannot edit cases.
              </p>
            ) : null}
            <TextField name="edit-title" className="w-full">
              <Label>Title</Label>
              <Input
                value={form.title}
                disabled={readOnly || saving}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, title: e.target.value } : f))
                }
                className="w-full"
              />
            </TextField>
            <TextField name="edit-description" className="w-full">
              <Label>Description</Label>
              <TextArea
                value={form.description}
                disabled={readOnly || saving}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, description: e.target.value } : f,
                  )
                }
                className="w-full min-h-16"
              />
            </TextField>
            <TextField name="edit-preconditions" className="w-full">
              <Label>Preconditions</Label>
              <TextArea
                value={form.preconditions}
                disabled={readOnly || saving}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, preconditions: e.target.value } : f,
                  )
                }
                className="w-full min-h-14"
              />
            </TextField>
            {useStructured ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Structured steps</Label>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={readOnly || saving || draftingSteps}
                      onPress={() => void draftStepsWithAi()}
                    >
                      <SparkleIcon size={14} weight="bold" />
                      {draftingSteps ? "Drafting…" : "Draft steps with AI"}
                    </Button>
                    <Button
                      size="sm"
                      variant="tertiary"
                      isDisabled={readOnly || saving}
                      onPress={() => setUseStructured(false)}
                    >
                      Use text steps
                    </Button>
                  </div>
                </div>
                <CaseStepsEditor
                  steps={structuredSteps}
                  onChange={setStructuredSteps}
                  disabled={readOnly || saving}
                  sharedSteps={sharedSteps}
                />
                {draftSourceLabel ? (
                  <p className="text-xs text-[color:var(--topo-muted)]">
                    {draftSourceLabel}
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <TextField name="edit-steps" className="w-full">
                  <Label>Steps</Label>
                  <TextArea
                    value={form.steps}
                    disabled={readOnly || saving}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, steps: e.target.value } : f))
                    }
                    className="w-full min-h-20"
                  />
                </TextField>
                <TextField name="edit-expected" className="w-full">
                  <Label>Expected result</Label>
                  <TextArea
                    value={form.expectedResult}
                    disabled={readOnly || saving}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, expectedResult: e.target.value } : f,
                      )
                    }
                    className="w-full min-h-14"
                  />
                </TextField>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={readOnly || saving || draftingSteps}
                    onPress={() => void draftStepsWithAi()}
                  >
                    <SparkleIcon size={14} weight="bold" />
                    {draftingSteps ? "Drafting…" : "Draft steps with AI"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={readOnly || saving}
                    onPress={() => {
                      setStructuredSteps(
                        stepsFromFallback(form.steps, form.expectedResult),
                      );
                      setUseStructured(true);
                      void fetch("/api/shared-steps")
                        .then((res) => res.json())
                        .then((data) => {
                          setSharedSteps(
                            (data.sharedSteps ?? []).map(
                              (s: { id: string; name: string }) => ({
                                id: s.id,
                                name: s.name,
                              }),
                            ),
                          );
                        })
                        .catch(() => undefined);
                    }}
                  >
                    Use structured steps
                  </Button>
                </div>
                {draftSourceLabel ? (
                  <p className="text-xs text-[color:var(--topo-muted)]">
                    {draftSourceLabel}
                  </p>
                ) : null}
              </>
            )}
            <div className="grid gap-3">
              <Select
                className="w-full"
                variant="secondary"
                placeholder="Priority"
                value={form.priority}
                isDisabled={readOnly || saving}
                onChange={(value) => {
                  if (value == null) return;
                  setForm((f) =>
                    f ? { ...f, priority: String(value) } : f,
                  );
                }}
              >
                <Label>Priority</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {priorities.map((p) => (
                      <ListBox.Item key={p} id={p} textValue={p}>
                        {p}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <Select
                className="w-full"
                variant="secondary"
                placeholder="Status"
                value={form.status}
                isDisabled={
                  readOnly || saving || statusValue === "in_review"
                }
                onChange={(value) => {
                  if (value == null) return;
                  const next = String(value);
                  const from = detail?.status ?? form.status;
                  const transition = classifyCaseStatusTransition(from, next);
                  if (
                    transition.kind === "submit" ||
                    transition.kind === "approve" ||
                    transition.kind === "request_changes"
                  ) {
                    setSaveError(
                      "Use the review workflow actions to change this status",
                    );
                    return;
                  }
                  if (
                    reviewGateActive &&
                    from === "draft" &&
                    next === "ready"
                  ) {
                    setSaveError(
                      "Submit for review before marking this case ready",
                    );
                    return;
                  }
                  setSaveError(null);
                  setForm((f) => (f ? { ...f, status: next } : f));
                }}
              >
                <Label>Status</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {selectableStatuses.map((s) => (
                      <ListBox.Item
                        key={s}
                        id={s}
                        textValue={formatStatusLabel(s)}
                      >
                        {formatStatusLabel(s)}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <Select
                className="w-full"
                variant="secondary"
                placeholder="Folder"
                value={form.folderId || "none"}
                isDisabled={readOnly || saving}
                onChange={(value) => {
                  if (value == null) return;
                  const next = String(value);
                  setForm((f) =>
                    f
                      ? { ...f, folderId: next === "none" ? "" : next }
                      : f,
                  );
                }}
              >
                <Label>Folder</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="none" textValue="None">
                      None
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    {flatFolders.map((f) => {
                      const label = folderPathLabel(folders, f.id);
                      return (
                        <ListBox.Item key={f.id} id={f.id} textValue={label}>
                          <span style={{ paddingLeft: f.depth * 10 }}>
                            {label}
                          </span>
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      );
                    })}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
            <TextField name="edit-tags" className="w-full">
              <Label>Tags</Label>
              <Input
                placeholder="smoke; ui"
                value={form.tags}
                disabled={readOnly || saving}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, tags: e.target.value } : f))
                }
                className="w-full"
              />
            </TextField>
            {customFieldDefs.length > 0 ? (
              <div className="space-y-2 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-canvas)] px-2.5 py-2.5">
                <p className="text-xs font-medium text-[color:var(--topo-muted)]">
                  Custom fields
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {customFieldDefs.map((def) => (
                    <label key={def.key} className="block space-y-1 text-xs">
                      <span className="text-[color:var(--topo-muted)]">
                        {def.label}
                        {def.required ? " *" : ""}
                      </span>
                      {def.type === "select" ? (
                        <TopoSelect
                          ariaLabel={def.label}
                          className="w-full"
                          value={String(customFields[def.key] ?? "")}
                          isDisabled={readOnly || saving}
                          onChange={(value) =>
                            setCustomFields({
                              ...customFields,
                              [def.key]: value,
                            })
                          }
                          options={[
                            { id: "", label: "Select…" },
                            ...(def.options ?? []).map((opt) => ({
                              id: opt,
                              label: opt,
                            })),
                          ]}
                          compact
                        />
                      ) : def.type === "boolean" ? (
                        <TopoCheckbox
                          compact
                          isSelected={Boolean(customFields[def.key])}
                          isDisabled={readOnly || saving}
                          onChange={(isSelected) =>
                            setCustomFields({
                              ...customFields,
                              [def.key]: isSelected,
                            })
                          }
                        />
                      ) : (
                        <Input
                          type={
                            def.type === "number"
                              ? "number"
                              : def.type === "date"
                                ? "date"
                                : "text"
                          }
                          value={
                            customFields[def.key] == null
                              ? ""
                              : String(customFields[def.key])
                          }
                          disabled={readOnly || saving}
                          onChange={(e) =>
                            setCustomFields({
                              ...customFields,
                              [def.key]: e.target.value,
                            })
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="space-y-2 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-canvas)] px-2.5 py-2.5">
              <p className="text-xs font-medium text-[color:var(--topo-muted)]">
                Review workflow
              </p>
              {statusValue === "draft" && can("cases.edit") ? (
                <div className="space-y-2">
                  <Select
                    className="w-full"
                    variant="secondary"
                    placeholder="Reviewer"
                    value={reviewerId || "none"}
                    isDisabled={reviewBusy || saving}
                    onChange={(value) => {
                      if (value == null) return;
                      const next = String(value);
                      setReviewerId(next === "none" ? "" : next);
                    }}
                  >
                    <Label>Reviewer</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item id="none" textValue="Select reviewer">
                          Select reviewer
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        {members.map((member) => {
                          const label =
                            member.user.name?.trim() || member.user.email;
                          return (
                            <ListBox.Item
                              key={member.user.id}
                              id={member.user.id}
                              textValue={label}
                            >
                              {label}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          );
                        })}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                  {assignedReviewerLabel ? (
                    <p className="text-xs text-[color:var(--topo-muted)]">
                      Reviewer: {assignedReviewerLabel}
                    </p>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={reviewBusy || saving || !reviewerId}
                    onPress={() => void applyReview("submit")}
                  >
                    {reviewBusy
                      ? "Submitting…"
                      : dirty
                        ? "Save & submit for review"
                        : "Submit for review"}
                  </Button>
                </div>
              ) : null}
              {statusValue === "in_review" ? (
                <div className="space-y-2">
                  <p className="text-xs text-[color:var(--topo-ink)]">
                    This case is in review
                    {assignedReviewerLabel
                      ? ` · ${assignedReviewerLabel}`
                      : ""}
                    .
                  </p>
                  {canDecideReview ? (
                    <>
                      <TextField name="review-comment" className="w-full">
                        <Label>Review comment</Label>
                        <TextArea
                          value={reviewComment}
                          disabled={reviewBusy || saving}
                          onChange={(e) => setReviewComment(e.target.value)}
                          className="w-full min-h-14"
                          placeholder="Required when requesting changes"
                        />
                      </TextField>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          isDisabled={reviewBusy || saving || Boolean(detail?.requireCaseReview && !detail.reviewerId)}
                          onPress={() => void applyReview("approve")}
                        >
                          {dirty ? "Save & approve" : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          isDisabled={
                            reviewBusy || saving || !reviewComment.trim()
                          }
                          onPress={() => void applyReview("request_changes")}
                        >
                          {dirty
                            ? "Save & request changes"
                            : "Request changes"}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-[color:var(--topo-muted)]">
                      Waiting for a reviewer with approve permission.
                    </p>
                  )}
                </div>
              ) : null}
              {statusValue !== "draft" && statusValue !== "in_review" ? (
                <p className="text-xs text-[color:var(--topo-muted)]">
                  Status is {formatStatusLabel(statusValue)}. Move back to Draft
                  to submit for review again.
                </p>
              ) : null}
            </div>
            <CaseTcmPanel
              caseId={caseId}
              parameters={parameters}
              datasets={datasets}
              customFields={customFields}
              customFieldDefs={customFieldDefs}
              onParametersChange={setParameters}
              onDatasetsChange={setDatasets}
              onCustomFieldsChange={setCustomFields}
              disabled={readOnly || saving}
              hideCustomFields
              hideVersions
            />
            <div className="border-t border-[color:var(--topo-line)] pt-3">
              <Button
                size="sm"
                variant="secondary"
                className="w-full justify-between"
                onPress={() => setShowHistory((v) => !v)}
              >
                {showHistory ? "Hide history & versions" : "History & versions"}
              </Button>
              {showHistory ? (
                <div className="mt-2 space-y-2">
                  <div
                    role="tablist"
                    aria-label="History view"
                    className="flex gap-1 rounded-md border border-[color:var(--topo-line)] p-0.5"
                  >
                    {(
                      [
                        ["activity", "Activity"],
                        ["versions", "Versions"],
                      ] as const
                    ).map(([id, label]) => (
                      <Button
                        key={id}
                        type="button"
                        variant="ghost"
                        aria-selected={historyTab === id}
                        className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                          historyTab === id
                            ? "topo-selected-surface"
                            : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                        }`}
                        onPress={() => setHistoryTab(id)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  {historyTab === "activity" ? (
                    <div className="overflow-hidden rounded-md border border-[color:var(--topo-line)]">
                      <CaseHistoryPanel
                        key={`${caseId}-${historyKey}`}
                        caseId={caseId}
                        caseKey={headerKey}
                        caseTitle={headerTitle}
                        onClose={() => setShowHistory(false)}
                        embedded
                      />
                    </div>
                  ) : (
                    <div className="rounded-md border border-[color:var(--topo-line)] p-2">
                      <CaseVersionsList
                        key={`${caseId}-versions-${historyKey}`}
                        caseId={caseId}
                        disabled={readOnly || saving}
                        onRestored={() => {
                          setHistoryKey((k) => k + 1);
                          void fetch(`/api/cases/${caseId}`)
                            .then((res) => res.json())
                            .then((data) => {
                              const next = data.case as CaseDetail;
                              setDetail(next);
                              setForm(toForm(next));
                              setStructuredSteps(next.structuredSteps ?? []);
                              setUseStructured(
                                (next.structuredSteps ?? []).length > 0,
                              );
                              setParameters(next.parameters ?? []);
                              setDatasets(next.datasets ?? []);
                              setCustomFields(next.customFields ?? {});
                            })
                            .catch(() => undefined);
                        }}
                      />
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {form && !loading && !loadError ? (
        <div className="shrink-0 space-y-2 border-t border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-2.5">
          {saveError ? (
            <p className="text-sm text-red-600 dark:text-red-300">{saveError}</p>
          ) : null}
          {proposalSubmitted ? (
            <p role="status" className="text-sm">
              Case changes submitted. <Link href="/proposals" className="underline">Open the review queue</Link>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              isDisabled={
                readOnly ||
                saving ||
                duplicating ||
                reviewBusy ||
                Boolean(saveDisabledReason)
              }
              onPress={() => void save()}
            >
              <FloppyDiskIcon size={14} weight="bold" />
              {saving ? "Saving…" : queuesReview ? "Propose changes" : "Save"}
            </Button>
            {can("cases.create") ? (
              <Button
                variant="secondary"
                size="sm"
                isDisabled={saving || duplicating || loading || reviewBusy}
                onPress={() => void duplicate()}
              >
                <CopyIcon size={14} weight="bold" />
                {duplicating ? "Duplicating…" : "Duplicate"}
              </Button>
            ) : null}
            <Button
              variant="tertiary"
              size="sm"
              isDisabled={saving || duplicating || reviewBusy}
              onPress={onClose}
            >
              Close
            </Button>
            {saveDisabledReason && !readOnly ? (
              <p className="text-xs text-[color:var(--topo-muted)]">
                {saveDisabledReason}
              </p>
            ) : dirty && !readOnly ? (
              <p className="text-xs text-[color:var(--topo-muted)]">
                Unsaved changes
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <Modal.Backdrop
        isOpen={confirmDuplicateOpen}
        onOpenChange={(open) => {
          if (!open) setConfirmDuplicateOpen(false);
        }}
      >
        <Modal.Container placement="center" size="sm">
          <Modal.Dialog className="outline-none">
            <Modal.Header className="flex flex-col gap-1 border-b border-[color:var(--topo-line)] px-4 py-3">
              <Modal.Heading className="text-base font-semibold text-[color:var(--topo-ink)]">
                Duplicate with unsaved changes?
              </Modal.Heading>
              <p className="text-sm text-[color:var(--topo-muted)]">
                This case has edits that have not been saved. Duplicate will
                use the last saved version.
              </p>
            </Modal.Header>
            <Modal.Footer className="flex justify-end gap-2 px-4 py-3">
              <Button
                variant="tertiary"
                onPress={() => setConfirmDuplicateOpen(false)}
              >
                Keep editing
              </Button>
              <Button
                variant="secondary"
                isDisabled={duplicating}
                onPress={() => void performDuplicate()}
              >
                {duplicating ? "Duplicating…" : "Duplicate saved version"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </aside>
  );
});
