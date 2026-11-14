import { z } from "zod";
export const runTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(20000).default(""),
  caseIds: z.array(z.string().uuid()).min(1).max(500).refine((ids) => new Set(ids).size === ids.length, "Select each case once"),
  environment: z.string().trim().min(1).max(200).default("local"),
  assigneeId: z.string().uuid().nullable().default(null),
});
export type RunTemplateInput = z.infer<typeof runTemplateSchema>;
export type RunTemplateView = RunTemplateInput & { id: string; createdById: string | null };
