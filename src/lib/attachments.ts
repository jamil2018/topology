import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export function attachmentsRoot() {
  return process.env.ATTACHMENTS_DIR
    ? process.env.ATTACHMENTS_DIR
    : path.join(process.cwd(), "data", "attachments");
}

export function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180) || "upload.bin";
}

const ATTACHMENT_KINDS = [
  "screenshot",
  "log",
  "video",
  "trace",
  "other",
] as const;

export type InferredAttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** Infer attachment kind from filename / content-type for Phase 2 typed artifacts. */
export function inferAttachmentKind(
  filename: string,
  contentType?: string | null,
): InferredAttachmentKind {
  const name = filename.toLowerCase();
  const type = (contentType ?? "").toLowerCase();

  if (
    type.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp)$/.test(name) ||
    name.includes("screenshot")
  ) {
    return "screenshot";
  }
  if (
    type.startsWith("video/") ||
    /\.(mp4|webm|mov)$/.test(name) ||
    name.includes("video")
  ) {
    return "video";
  }
  if (
    name.includes("trace") ||
    (name.endsWith(".zip") && name.includes("trace")) ||
    name.endsWith(".trace")
  ) {
    return "trace";
  }
  if (
    type.startsWith("text/") ||
    /\.(log|txt)$/.test(name) ||
    name.includes("log")
  ) {
    return "log";
  }
  return "other";
}

export function isAttachmentKind(value: string): value is InferredAttachmentKind {
  return (ATTACHMENT_KINDS as readonly string[]).includes(value);
}

export async function storeAttachmentFile(file: File) {
  if (file.size > MAX_BYTES) {
    throw new Error(`File exceeds ${MAX_BYTES / (1024 * 1024)} MB limit`);
  }

  const root = attachmentsRoot();
  await mkdir(/* turbopackIgnore: true */ root, { recursive: true });

  const id = randomUUID();
  const safeName = sanitizeFilename(file.name);
  const storageKey = `${id}-${safeName}`;
  // Keep reads/writes under data/attachments (or ATTACHMENTS_DIR).
  const fullPath = path.join(root, storageKey);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(/* turbopackIgnore: true */ fullPath, buffer);

  return {
    storageKey,
    filename: safeName,
    contentType: file.type || "application/octet-stream",
    sizeBytes: buffer.length,
  };
}

export async function readAttachmentFile(storageKey: string) {
  const fullPath = path.join(attachmentsRoot(), storageKey);
  return readFile(/* turbopackIgnore: true */ fullPath);
}

export { MAX_BYTES as ATTACHMENT_MAX_BYTES };
