"use client";

import { Button, Input, TextArea } from "@heroui/react";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { parseFallbackSteps, type OrderedStep } from "@/lib/tcm/steps";

export type SharedStepOption = {
  id: string;
  name: string;
};

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
  function update(index: number, patch: Partial<OrderedStep>) {
    onChange(
      steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    );
  }

  function addStep() {
    onChange([
      ...steps,
      {
        id: null,
        position: steps.length,
        action: "",
        expected: "",
        data: "",
        sharedStepId: null,
      },
    ]);
  }

  function addShared(id: string) {
    const named = sharedSteps.find((s) => s.id === id);
    onChange([
      ...steps,
      {
        id: null,
        position: steps.length,
        action: named ? `Shared: ${named.name}` : "",
        expected: "",
        data: "",
        sharedStepId: id,
      },
    ]);
  }

  return (
    <div className="space-y-2">
      {steps.map((step, index) => (
        <div
          key={`${step.id ?? "new"}-${index}`}
          className="space-y-1.5 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)] p-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] text-[color:var(--topo-muted)]">
              Step {index + 1}
              {step.sharedStepId ? " · shared" : ""}
            </span>
            <Button
              size="sm"
              variant="tertiary"
              className="min-w-0 px-1.5"
              isDisabled={disabled}
              aria-label={`Remove step ${index + 1}`}
              onPress={() => onChange(steps.filter((_, i) => i !== index))}
            >
              <TrashIcon size={12} />
            </Button>
          </div>
          <Input
            aria-label={`Step ${index + 1} action`}
            placeholder="Action"
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
                className="min-h-12"
              />
              <Input
                aria-label={`Step ${index + 1} data`}
                placeholder="Test data (optional)"
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
