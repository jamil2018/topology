"use client";

import { Button } from "@heroui/react";
import type { AttachmentRow, CommentRow } from "./run-executor-model";

export function RunCommentsPanel({
  comments,
  draft,
  pending,
  onDraftChange,
  onSubmit,
}: {
  comments: CommentRow[];
  draft: string;
  pending: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-2 border-t border-[color:var(--topo-line)] pt-3">
      <p className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
        Comments
      </p>
      {comments.length === 0 ? (
        <p className="text-xs text-[color:var(--topo-muted)]">No comments yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)]/60 px-2 py-1.5 text-xs"
            >
              <div className="flex justify-between gap-2 text-[color:var(--topo-muted)]">
                <span>
                  {comment.user?.name ?? comment.user?.email ?? "Unknown"}
                </span>
                <span className="font-mono">
                  {new Date(comment.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[color:var(--topo-ink)]">
                {comment.body}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Add a comment"
          className="min-w-[12rem] flex-1 rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
        />
        <Button
          size="sm"
          variant="secondary"
          isDisabled={pending || !draft.trim()}
          onPress={() => void onSubmit()}
        >
          Comment
        </Button>
      </div>
    </div>
  );
}

export function RunAttachmentsPanel({
  attachments,
  uploading,
  pending,
  onUpload,
}: {
  attachments: AttachmentRow[];
  uploading: boolean;
  pending: boolean;
  onUpload: (file: File | null) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
        Attachments
      </p>
      {attachments.length === 0 ? (
        <p className="text-xs text-[color:var(--topo-muted)]">No files yet.</p>
      ) : (
        <ul className="space-y-1">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <a
                href={attachment.url ?? `/api/attachments/${attachment.id}`}
                className="font-mono text-xs text-[color:var(--topo-accent)] hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {attachment.filename}
              </a>
              <span className="ml-2 text-[10px] text-[color:var(--topo-muted)]">
                {(attachment.sizeBytes / 1024).toFixed(1)} KB
              </span>
            </li>
          ))}
        </ul>
      )}
      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[color:var(--topo-muted)]">
        <span className="rounded-md border border-[color:var(--topo-line)] px-2 py-1 hover:text-[color:var(--topo-ink)]">
          {uploading ? "Uploading…" : "Attach file"}
        </span>
        <input
          type="file"
          aria-label="Attach file"
          className="hidden"
          disabled={uploading || pending}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.target.value = "";
            void onUpload(file);
          }}
        />
      </label>
    </div>
  );
}
