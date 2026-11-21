export const LIVE_CHANNEL = "topology_live";

export type LiveTopic = "run" | "triage";

export type LiveCommentPayload = {
  id: string;
  body: string;
  createdAt: string;
  user?: { id: string; name: string | null; email: string } | null;
};

export type LiveAttachmentPayload = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  url?: string;
};

export type LiveEvent = {
  workspaceId: string;
  topic: LiveTopic;
  entityId?: string;
  resultId?: string;
  status?: string;
  assigneeId?: string | null;
  runStatus?: string;
  kind?: "status" | "comment" | "attachment";
  comment?: LiveCommentPayload;
  attachment?: LiveAttachmentPayload;
  at: number;
};

function parseComment(
  value: unknown,
): LiveCommentPayload | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Partial<LiveCommentPayload>;
  if (typeof row.id !== "string" || typeof row.body !== "string") return undefined;
  const createdAt =
    typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString();
  let user: LiveCommentPayload["user"];
  if (row.user === null) user = null;
  else if (row.user && typeof row.user === "object" && typeof row.user.id === "string") {
    user = {
      id: row.user.id,
      name: typeof row.user.name === "string" ? row.user.name : null,
      email: typeof row.user.email === "string" ? row.user.email : "",
    };
  }
  return { id: row.id, body: row.body, createdAt, user };
}

function parseAttachment(
  value: unknown,
): LiveAttachmentPayload | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Partial<LiveAttachmentPayload>;
  if (
    typeof row.id !== "string" ||
    typeof row.filename !== "string" ||
    typeof row.contentType !== "string" ||
    typeof row.sizeBytes !== "number"
  ) {
    return undefined;
  }
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    url: typeof row.url === "string" ? row.url : undefined,
  };
}

export function parseLiveEvent(raw: string): LiveEvent | null {
  try {
    const parsed = JSON.parse(raw) as Partial<LiveEvent>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.workspaceId !== "string") return null;
    if (parsed.topic !== "run" && parsed.topic !== "triage") return null;
    const kind =
      parsed.kind === "comment" ||
      parsed.kind === "attachment" ||
      parsed.kind === "status"
        ? parsed.kind
        : undefined;
    return {
      workspaceId: parsed.workspaceId,
      topic: parsed.topic,
      entityId:
        typeof parsed.entityId === "string" ? parsed.entityId : undefined,
      resultId:
        typeof parsed.resultId === "string" ? parsed.resultId : undefined,
      status: typeof parsed.status === "string" ? parsed.status : undefined,
      assigneeId:
        parsed.assigneeId === null || typeof parsed.assigneeId === "string"
          ? parsed.assigneeId
          : undefined,
      runStatus:
        typeof parsed.runStatus === "string" ? parsed.runStatus : undefined,
      kind,
      comment: parseComment(parsed.comment),
      attachment: parseAttachment(parsed.attachment),
      at: typeof parsed.at === "number" ? parsed.at : Date.now(),
    };
  } catch {
    return null;
  }
}
