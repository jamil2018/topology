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
