/** Human labels for stored enums. Keep chips, selects, and filters in sync. */

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function titleCaseWords(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

const STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  draft: "Draft",
  untested: "Untested",
  in_progress: "In progress",
  running: "Running",
  completed: "Completed",
  passed: "Passed",
  pass: "Passed",
  ready: "Ready",
  healthy: "Healthy",
  go: "Go",
  resolved: "Resolved",
  active: "Active",
  aborted: "Aborted",
  failed: "Failed",
  fail: "Failed",
  no_go: "No go",
  blocked: "Blocked",
  critical: "Critical",
  at_risk: "At risk",
  watch: "Watch",
  skipped: "Skipped",
  deprecated: "Deprecated",
  archived: "Archived",
  snoozed: "Snoozed",
  automation: "Automation",
  open: "Open",
};

const PRIORITY_LABELS: Record<string, string> = {
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

const URGENCY_LABELS: Record<string, string> = {
  go: "Go",
  at_risk: "At risk",
  no_go: "No go",
  watch: "Watch",
  critical: "Critical",
  healthy: "Healthy",
};

const SNAKE_ENUM = /^[A-Za-z0-9]+(_[A-Za-z0-9]+)+$/;

export function formatStatusLabel(value: string): string {
  const key = normalizeKey(value);
  if (key in STATUS_LABELS) return STATUS_LABELS[key];
  if (SNAKE_ENUM.test(value.trim())) return titleCaseWords(value);
  return value;
}

export function formatPriorityLabel(value: string): string {
  const key = normalizeKey(value);
  if (key in PRIORITY_LABELS) return PRIORITY_LABELS[key];
  return value.trim().toUpperCase();
}

export function formatUrgencyLabel(value: string): string {
  const key = normalizeKey(value);
  if (key in URGENCY_LABELS) return URGENCY_LABELS[key];
  if (SNAKE_ENUM.test(value.trim())) return titleCaseWords(value);
  return value;
}

/** Format a chip/select value when it is a known enum; otherwise leave copy alone. */
export function formatChipLabel(value: string): string {
  const key = normalizeKey(value);
  if (key in PRIORITY_LABELS) return formatPriorityLabel(value);
  if (key in URGENCY_LABELS) return formatUrgencyLabel(value);
  if (key in STATUS_LABELS) return formatStatusLabel(value);
  if (SNAKE_ENUM.test(value.trim())) return formatStatusLabel(value);
  return value;
}

export function pageTitle(segment: string): string {
  return `${segment} · Topology`;
}
