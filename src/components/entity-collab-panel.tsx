"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, TextArea } from "@heroui/react";

type Comment = {
  id: string;
  body: string;
  createdAt: string | Date;
  user: { id: string; name: string | null; email: string } | null;
};

type Owner = {
  id: string;
  userId: string;
  user: { id: string; name: string | null; email: string } | null;
} | null;

type Member = {
  user: { id: string; name: string | null; email: string };
};

function displayName(user: { name: string | null; email: string } | null) {
  if (!user) return "Someone";
  return user.name?.trim() || user.email;
}

function formatWhen(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EntityCollabPanel({
  entityType,
  entityId,
}: {
  entityType: "intent" | "requirement";
  entityId: string;
}) {
  const base =
    entityType === "intent"
      ? `/api/intents/${entityId}`
      : `/api/requirements/${entityId}`;
  const [pending, startTransition] = useTransition();
  const [comments, setComments] = useState<Comment[]>([]);
  const [owner, setOwner] = useState<Owner>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const [commentsRes, ownerRes, workspaceRes] = await Promise.all([
          fetch(`${base}/comments`),
          fetch(`${base}/owner`),
          fetch("/api/workspace"),
        ]);
        if (!commentsRes.ok || !ownerRes.ok) {
          throw new Error("Failed to load collaboration data");
        }
        const commentsData = (await commentsRes.json()) as {
          comments: Comment[];
        };
        const ownerData = (await ownerRes.json()) as { owner: Owner };
        const workspaceData = workspaceRes.ok
          ? ((await workspaceRes.json()) as { members?: Member[] })
          : { members: [] };
        if (cancelled) return;
        setComments(commentsData.comments);
        setOwner(ownerData.owner);
        setMembers(workspaceData.members ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Load failed");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [base]);

  async function postComment() {
    if (!draft.trim()) return;
    setError(null);
    const res = await fetch(`${base}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Could not post comment",
      );
      return;
    }
    setDraft("");
    setComments((prev) => [...prev, data.comment as Comment]);
  }

  async function changeOwner(userId: string) {
    setError(null);
    const res = await fetch(`${base}/owner`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: userId || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Could not set owner",
      );
      return;
    }
    setOwner(data.owner as Owner);
  }

  return (
    <div className="mt-4 space-y-4 border-t border-[color:var(--topo-line)] pt-4">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
          Owner
        </div>
        <select
          aria-label="Entity owner"
          className="mt-2 w-full rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] px-2 py-1.5 text-sm text-[color:var(--topo-ink)]"
          value={owner?.userId ?? ""}
          disabled={pending}
          onChange={(e) => {
            startTransition(() => {
              void changeOwner(e.target.value);
            });
          }}
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.user.id} value={m.user.id}>
              {displayName(m.user)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
          Comments
        </div>
        {comments.length === 0 ? (
          <p className="mt-2 text-sm text-[color:var(--topo-muted)]">
            No comments yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {comments.map((c) => (
              <li
                key={c.id}
                className="rounded-sm border border-[color:var(--topo-line)] px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-[color:var(--topo-ink)]">
                    {displayName(c.user)}
                  </span>
                  <span className="font-mono text-[10px] text-[color:var(--topo-muted)]">
                    {formatWhen(c.createdAt)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[color:var(--topo-muted)]">
                  {c.body}
                </p>
              </li>
            ))}
          </ul>
        )}
        <TextArea
          className="mt-2"
          aria-label="New comment"
          placeholder="Add a comment…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button
          className="mt-2"
          size="sm"
          isDisabled={pending || !draft.trim()}
          onPress={() => {
            startTransition(() => {
              void postComment();
            });
          }}
        >
          Comment
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
