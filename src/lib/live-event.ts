export const LIVE_CHANNEL = "topology_live";

export type LiveTopic = "run" | "triage";

export type LiveEvent = {
  workspaceId: string;
  topic: LiveTopic;
  entityId?: string;
  resultId?: string;
  status?: string;
  assigneeId?: string | null;
  runStatus?: string;
  at: number;
};

export function parseLiveEvent(raw: string): LiveEvent | null {
  try {
    const parsed = JSON.parse(raw) as Partial<LiveEvent>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.workspaceId !== "string") return null;
    if (parsed.topic !== "run" && parsed.topic !== "triage") return null;
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
      at: typeof parsed.at === "number" ? parsed.at : Date.now(),
    };
  } catch {
    return null;
  }
}
