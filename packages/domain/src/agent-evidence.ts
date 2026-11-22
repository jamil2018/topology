import { z } from "zod";

export const agentEvidenceMaxBytes = 1024 * 1024;

export const agentEvidenceSchema = z.object({
  filename: z.string().trim().min(1).max(180),
  contentType: z.string().max(127).regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i).optional(),
  dataBase64: z.base64().min(1).max(Math.ceil(agentEvidenceMaxBytes / 3) * 4),
});
