import type { ResultStatus } from "./run-executor-model";

/** Semantic fills follow StatusChip --topo-* tones — never --topo-accent. */
const selectedClass: Record<ResultStatus, string> = {
  passed:
    "bg-[color:var(--topo-success)] text-[color:var(--topo-success-fg)] border-[color:var(--topo-success-border)]",
  failed:
    "bg-[color:var(--topo-danger)] text-[color:var(--topo-danger-fg)] border-[color:var(--topo-danger-border)]",
  blocked:
    "bg-[color:var(--topo-warning)] text-[color:var(--topo-warning-fg)] border-[color:var(--topo-warning-border)]",
  skipped:
    "bg-[color:var(--topo-chip)] text-[color:var(--topo-ink)] border-[color:var(--topo-line)]",
  untested:
    "bg-transparent text-[color:var(--topo-ink)] border-[color:var(--topo-ink)]",
};

const idleClass =
  "bg-[color:var(--topo-chip)] text-[color:var(--topo-muted)] border-transparent hover:text-[color:var(--topo-ink)]";

export function statusButtonClass(
  status: ResultStatus,
  selected: boolean,
  disabled = false,
): string {
  const tone = selected ? selectedClass[status] : idleClass;
  return `rounded-md border px-2 py-1 text-xs capitalize transition active:scale-[0.98] ${tone} ${
    disabled ? "cursor-not-allowed opacity-60" : ""
  }`;
}

export function statusDotClass(status: string): string {
  switch (status) {
    case "passed":
      return "bg-[color:var(--topo-success)]";
    case "failed":
      return "bg-[color:var(--topo-danger)]";
    case "blocked":
      return "bg-[color:var(--topo-warning)]";
    case "skipped":
      return "bg-[color:var(--topo-muted)]";
    default:
      return "border border-[color:var(--topo-muted)] bg-transparent";
  }
}

export function statusBarClass(status: ResultStatus): string {
  switch (status) {
    case "passed":
      return "bg-[color:var(--topo-success)]";
    case "failed":
      return "bg-[color:var(--topo-danger)]";
    case "blocked":
      return "bg-[color:var(--topo-warning)]";
    case "skipped":
      return "bg-[color:var(--topo-muted)]";
    default:
      return "bg-transparent";
  }
}

export function statusChipHint(status: string): string {
  return status.replaceAll("_", " ");
}
