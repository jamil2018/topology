export {
  LIVE_CHANNEL,
  parseLiveEvent,
  type LiveEvent,
  type LiveTopic,
} from "./live-event";
import { LIVE_CHANNEL, type LiveEvent } from "./live-event";

/** Best-effort Postgres NOTIFY. Failures are swallowed so mutations still commit. */
export async function notifyLive(event: LiveEvent): Promise<void> {
  try {
    const payload = JSON.stringify(event);
    if (payload.length > 7800) return;
    const [{ sql }, { db }] = await Promise.all([
      import("drizzle-orm"),
      import("@/db"),
    ]);
    await db.execute(sql`select pg_notify(${LIVE_CHANNEL}, ${payload})`);
  } catch {
    // LISTEN/NOTIFY is opportunistic; SSE polling covers the gap.
  }
}

export function emitLive(event: Omit<LiveEvent, "at">): void {
  void notifyLive({ ...event, at: Date.now() });
}
