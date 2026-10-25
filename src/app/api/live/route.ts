import { NextResponse } from "next/server";
import postgres from "postgres";
import { auth } from "@/auth";
import { LIVE_CHANNEL, parseLiveEvent, type LiveEvent } from "@/lib/live";
import { requireProjectAccess } from "@/lib/project";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;
  const runId = new URL(request.url).searchParams.get("runId") ?? undefined;

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      send("hello", {
        workspaceId,
        runId: runId ?? null,
        at: Date.now(),
      });

      const onEvent = (event: LiveEvent) => {
        if (event.workspaceId !== workspaceId) return;
        if (
          runId &&
          event.topic === "run" &&
          event.entityId &&
          event.entityId !== runId
        ) {
          return;
        }
        send("live", event);
      };

      const stopListen = subscribeLive(onEvent);
      let pollTimer: ReturnType<typeof setInterval> | null = null;
      void listenStatus().then((mode) => {
        if (closed) return;
        send("mode", { mode });
        if (mode !== "notify") {
          pollTimer = setInterval(() => {
            send("live", {
              workspaceId,
              topic: runId ? "run" : "triage",
              entityId: runId,
              at: Date.now(),
            } satisfies LiveEvent);
          }, 3000);
        }
      });

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          closed = true;
        }
      }, 20000);

      cleanup = () => {
        closed = true;
        clearInterval(heartbeat);
        if (pollTimer) clearInterval(pollTimer);
        stopListen();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

type Listener = (event: LiveEvent) => void;
type ListenMode = "notify" | "poll";

const listeners = new Set<Listener>();

const globalLive = globalThis as unknown as {
  topologyLive?: {
    mode: ListenMode | "starting";
    ready: Promise<ListenMode>;
  };
};

function subscribeLive(listener: Listener): () => void {
  listeners.add(listener);
  void ensureSharedListen();
  return () => {
    listeners.delete(listener);
  };
}

function listenStatus(): Promise<ListenMode> {
  return ensureSharedListen();
}

function fanout(event: LiveEvent) {
  for (const listener of listeners) listener(event);
}

async function ensureSharedListen(): Promise<ListenMode> {
  if (globalLive.topologyLive) return globalLive.topologyLive.ready;

  let resolveMode: (mode: ListenMode) => void = () => {};
  const ready = new Promise<ListenMode>((resolve) => {
    resolveMode = resolve;
  });
  globalLive.topologyLive = { mode: "starting", ready };

  const url = process.env.DATABASE_URL;
  if (!url) {
    globalLive.topologyLive.mode = "poll";
    resolveMode("poll");
    return "poll";
  }

  try {
    const client = postgres(url, { max: 1, prepare: false });
    const listen = (
      client as unknown as {
        listen?: (
          channel: string,
          cb: (payload: string) => void,
        ) => Promise<unknown>;
      }
    ).listen;
    if (typeof listen !== "function") {
      globalLive.topologyLive.mode = "poll";
      resolveMode("poll");
      return "poll";
    }
    await listen.call(client, LIVE_CHANNEL, (payload: string) => {
      const event = parseLiveEvent(payload);
      if (event) fanout(event);
    });
    globalLive.topologyLive.mode = "notify";
    resolveMode("notify");
    return "notify";
  } catch {
    globalLive.topologyLive.mode = "poll";
    resolveMode("poll");
    return "poll";
  }
}
