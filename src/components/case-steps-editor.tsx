"use client";

import { Button, Input, TextArea } from "@heroui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DotsSixVerticalIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { parseFallbackSteps, type OrderedStep } from "@/lib/tcm/steps";

export type SharedStepOption = {
  id: string;
  name: string;
};

const STEP_DRAG_TYPE = "application/x-topology-step-index";

function reindex(steps: OrderedStep[]): OrderedStep[] {
  return steps.map((step, position) => ({ ...step, position }));
}

export function CaseStepsEditor({
  steps,
  onChange,
  disabled,
  sharedSteps = [],
}: {
  steps: OrderedStep[];
  onChange: (next: OrderedStep[]) => void;
  disabled?: boolean;
  sharedSteps?: SharedStepOption[];
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  function update(index: number, patch: Partial<OrderedStep>) {
    onChange(
      steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    );
  }

  function moveStep(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length) {
      return;
    }
    const next = [...steps];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(reindex(next));
  }

  function addStep() {
    onChange(
      reindex([
        ...steps,
        {
          id: null,
          position: steps.length,
          action: "",
          expected: "",
          data: "",
          sharedStepId: null,
        },
      ]),
    );
  }

  function addShared(id: string) {
    const named = sharedSteps.find((s) => s.id === id);
    onChange(
      reindex([
        ...steps,
        {
          id: null,
          position: steps.length,
          action: named ? `Shared: ${named.name}` : "",
          expected: "",
          data: "",
          sharedStepId: id,
        },
      ]),
    );
  }

  return (
    <div className="space-y-2">
      {steps.map((step, index) => (
        <div
          key={`${step.id ?? "new"}-${index}`}
          className={`space-y-1.5 rounded-md border bg-[color:var(--topo-paper)] p-2 ${
            dropIndex === index
              ? "border-[color:var(--topo-accent)]"
              : "border-[color:var(--topo-line)]"
          } ${dragIndex === index ? "opacity-60" : ""}`}
          onDragOver={(event) => {
            if (disabled || dragIndex == null) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            if (dropIndex !== index) setDropIndex(index);
          }}
          onDragLeave={() => {
            if (dropIndex === index) setDropIndex(null);
          }}
          onDrop={(event) => {
            if (disabled) return;
            event.preventDefault();
            const raw =
              event.dataTransfer.getData(STEP_DRAG_TYPE) ||
              event.dataTransfer.getData("text/plain");
            const from = Number(raw);
            if (Number.isInteger(from)) moveStep(from, index);
            setDragIndex(null);
            setDropIndex(null);
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                draggable={!disabled}
                aria-label={`Drag to reorder step ${index + 1}`}
                disabled={disabled}
                className="cursor-grab rounded p-1 text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-chip)] hover:text-[color:var(--topo-ink)] active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
                onDragStart={(event) => {
                  if (disabled) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(STEP_DRAG_TYPE, String(index));
                  event.dataTransfer.setData("text/plain", String(index));
                  setDragIndex(index);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDropIndex(null);
                }}
              >
                <DotsSixVerticalIcon size={14} weight="bold" />
              </button>
              <span className="font-mono text-xs text-[color:var(--topo-muted)]">
                Step {index + 1}
                {step.sharedStepId ? " · shared" : ""}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                size="sm"
                variant="tertiary"
                className="min-w-0 px-1.5"
                isDisabled={disabled || index === 0}
                aria-label={`Move step ${index + 1} up`}
                onPress={() => moveStep(index, index - 1)}
              >
                <ArrowUpIcon size={12} />
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                className="min-w-0 px-1.5"
                isDisabled={disabled || index >= steps.length - 1}
                aria-label={`Move step ${index + 1} down`}
                onPress={() => moveStep(index, index + 1)}
              >
                <ArrowDownIcon size={12} />
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                className="min-w-0 px-1.5"
                isDisabled={disabled}
                aria-label={`Remove step ${index + 1}`}
                onPress={() =>
                  onChange(reindex(steps.filter((_, i) => i !== index)))
                }
              >
                <TrashIcon size={12} />
              </Button>
            </div>
          </div>
          <Input
            aria-label={`Step ${index + 1} action`}
            placeholder="Action"
            className="w-full"
            value={step.action}
            disabled={disabled || Boolean(step.sharedStepId)}
            onChange={(e) => update(index, { action: e.target.value })}
          />
          {!step.sharedStepId ? (
            <>
              <TextArea
                aria-label={`Step ${index + 1} expected`}
                placeholder="Expected"
                value={step.expected}
                disabled={disabled}
                onChange={(e) => update(index, { expected: e.target.value })}
                className="w-full min-h-12"
              />
              <Input
                aria-label={`Step ${index + 1} data`}
                placeholder="Test data (optional)"
                className="w-full"
                value={step.data}
                disabled={disabled}
                onChange={(e) => update(index, { data: e.target.value })}
              />
            </>
          ) : null}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" isDisabled={disabled} onPress={addStep}>
          <PlusIcon size={12} />
          Add step
        </Button>
        {sharedSteps.length > 0 ? (
          <select
            aria-label="Insert shared step"
            disabled={disabled}
            className="rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1 text-xs"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) addShared(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="">Insert shared step…</option>
            {sharedSteps.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </div>
  );
}

export function stepsFromFallback(steps: string, expected: string): OrderedStep[] {
  const parsed = parseFallbackSteps(steps, expected);
  return parsed.length > 0
    ? parsed
    : [
        {
          id: null,
          position: 0,
          action: "",
          expected: "",
          data: "",
          sharedStepId: null,
        },
      ];
}
