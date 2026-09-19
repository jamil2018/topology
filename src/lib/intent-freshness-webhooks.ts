import { eq } from "drizzle-orm";
import { db } from "@/db";
import { testIntents } from "@/db/schema";
import { listIntentsWithMeta } from "@/lib/quality-graph";
import { dispatchWebhook } from "@/lib/webhooks";

/**
 * Detect intents that newly entered `stale`, emit intent.stale (batched), and
 * persist dedupe state on test_intents.freshness_webhook_state.
 */
export async function syncIntentStaleWebhooks(workspaceId: string) {
  const intents = await listIntentsWithMeta(workspaceId);
  const newlyStale: Array<{
    id: string;
    key: string;
    title: string;
    reason: string | null;
  }> = [];

  for (const intent of intents) {
    const prev = intent.freshnessWebhookState ?? null;
    const current = intent.freshness;
    if (current === "stale" && prev !== "stale") {
      newlyStale.push({
        id: intent.id,
        key: intent.key,
        title: intent.title,
        reason: intent.freshnessReason,
      });
    }
    if (prev !== current) {
      await db
        .update(testIntents)
        .set({ freshnessWebhookState: current })
        .where(eq(testIntents.id, intent.id));
    }
  }

  if (newlyStale.length === 0) return { dispatched: 0 };

  void dispatchWebhook(
    "intent.stale",
    {
      intents: newlyStale,
      count: newlyStale.length,
    },
    workspaceId,
  ).catch(() => {});

  return { dispatched: newlyStale.length };
}
