"use client";

import { useCallback, type ClipboardEvent } from "react";
import { Button } from "@heroui/react";
import type { AttachmentRow, CommentRow } from "./run-executor-model";
import {
  imageFilesFromDataTransfer,
  isImageAttachment,
  type PendingUpload,
} from "./run-paste-upload";

export function RunCommentsPanel({
  comments,
  draft,
  pending,
  onDraftChange,
  onSubmit,
  onUpload,
}: {
  comments: CommentRow[];
  draft: string;
  pending: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onUpload?: (file: File) => void | Promise<void>;
}) {
  const onPaste = useCallback(
    (event: ClipboardEvent) => {
      if (!onUpload) return;
      const files = imageFilesFromDataTransfer(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      for (const file of files) void onUpload(file);
    },
    [onUpload],
  );

  return (
    <div className="space-y-2 border-t border-[color:var(--topo-line)] pt-3">
      <p className="font-medium text-xs text-[color:var(--topo-muted)]">
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
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              if (!pending && draft.trim()) void onSubmit();
            }
          }}
          rows={2}
          aria-label="Add a comment"
          placeholder={
            onUpload
              ? "Add a comment — paste or drop screenshots · ⌘/Ctrl+Enter to submit"
              : "Add a comment · ⌘/Ctrl+Enter to submit"
          }
          className="min-w-[12rem] flex-1 resize-y rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
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
  pendingUploads = [],
  onUpload,
}: {
  attachments: AttachmentRow[];
  uploading: boolean;
  pending: boolean;
  pendingUploads?: PendingUpload[];
  onUpload: (file: File | null) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="font-medium text-xs text-[color:var(--topo-muted)]">
        Attachments
      </p>
      {attachments.length === 0 && pendingUploads.length === 0 ? (
        <p className="text-xs text-[color:var(--topo-muted)]">No files yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {pendingUploads.map((row) => (
            <li
              key={row.localId}
              className="relative overflow-hidden rounded-md border border-[color:var(--topo-line)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={row.previewUrl}
                alt={row.filename}
                className="h-16 w-16 object-cover opacity-70"
              />
              <span className="absolute inset-x-0 bottom-0 bg-[color:var(--topo-ink)]/70 px-1 py-0.5 text-center text-[10px] text-white">
                Uploading…
              </span>
            </li>
          ))}
          {attachments.map((attachment) => {
            const href = attachment.url ?? `/api/attachments/${attachment.id}`;
            const image = isImageAttachment(
              attachment.contentType,
              attachment.filename,
            );
            return (
              <li key={attachment.id}>
                {image ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-md border border-[color:var(--topo-line)]"
                    title={attachment.filename}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={href}
                      alt={attachment.filename}
                      className="h-16 w-16 object-cover"
                    />
                  </a>
                ) : (
                  <>
                    <a
                      href={href}
                      className="font-mono text-xs text-[color:var(--topo-accent)] hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {attachment.filename}
                    </a>
                    <span className="ml-2 text-xs text-[color:var(--topo-muted)]">
                      {(attachment.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[color:var(--topo-muted)]">
        <span className="rounded-md border border-[color:var(--topo-line)] px-2 py-1 hover:text-[color:var(--topo-ink)]">
          {uploading ? "Uploading…" : "Attach file"}
        </span>
        <input
          type="file"
          accept="image/*,*/*"
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
