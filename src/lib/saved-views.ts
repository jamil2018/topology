import { z } from "zod";
import type { CaseListSort, CaseListSortDir } from "@/lib/case-list";
import type { RunListSort } from "@/lib/run-list";

export const caseViewConfigSchema = z.object({
  folderFilter: z.string().default("all"),
  search: z.string().default(""),
  statusFilter: z.string().default("all"),
  priorityFilter: z.string().default("all"),
  sort: z
    .enum(["key", "title", "folder", "priority", "status"])
    .default("key"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export const runViewConfigSchema = z.object({
  search: z.string().default(""),
  sort: z.enum(["updated", "created", "name", "status"]).default("updated"),
});

export const intentViewConfigSchema = z.object({
  search: z.string().default(""),
  criticalityFilter: z.string().default("all"),
  statusFilter: z.string().default("all"),
  sort: z.enum(["key", "title", "criticality", "status"]).default("key"),
});

export type CaseViewConfig = z.infer<typeof caseViewConfigSchema>;
export type RunViewConfig = z.infer<typeof runViewConfigSchema>;
export type IntentViewConfig = z.infer<typeof intentViewConfigSchema>;

export function parseCaseViewConfig(raw: string): CaseViewConfig {
  try {
    const parsed = caseViewConfigSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    /* fall through */
  }
  return caseViewConfigSchema.parse({});
}

export function parseRunViewConfig(raw: string): RunViewConfig {
  try {
    const parsed = runViewConfigSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    /* fall through */
  }
  return runViewConfigSchema.parse({});
}

export function parseIntentViewConfig(raw: string): IntentViewConfig {
  try {
    const parsed = intentViewConfigSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    /* fall through */
  }
  return intentViewConfigSchema.parse({});
}

export function serializeCaseViewConfig(config: {
  folderFilter: string;
  search: string;
  statusFilter: string;
  priorityFilter: string;
  sort: CaseListSort;
  sortDir: CaseListSortDir;
}): string {
  return JSON.stringify(caseViewConfigSchema.parse(config));
}

export function serializeRunViewConfig(config: {
  search: string;
  sort: RunListSort;
}): string {
  return JSON.stringify(runViewConfigSchema.parse(config));
}

export function serializeIntentViewConfig(config: {
  search: string;
  criticalityFilter: string;
  statusFilter: string;
  sort: IntentViewConfig["sort"];
}): string {
  return JSON.stringify(intentViewConfigSchema.parse(config));
}
