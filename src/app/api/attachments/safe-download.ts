import path from "node:path";
import { attachmentsRoot } from "@/lib/attachments";

const INLINE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

/** Reject keys that would leave the attachments root. Filename sanitizing stays in store. */
export function storageKeyStaysInRoot(storageKey: string) {
  if (!storageKey || storageKey.includes("\0")) return false;
  const root = path.resolve(attachmentsRoot());
  const full = path.resolve(root, storageKey);
  return full === path.join(root, path.basename(full));
}

export function downloadHeaders(
  filename: string,
  storedType: string,
  length: number,
) {
  const base =
    storedType
      .split(";")[0]
      ?.replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .toLowerCase() ?? "";
  const canonical = base === "image/jpg" ? "image/jpeg" : base;
  const inline = INLINE_TYPES.has(canonical);
  const safeName =
    filename.replace(/[\r\n"\\]/g, "").slice(0, 180) || "download";
  return {
    "Content-Type": inline ? canonical : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Length": String(length),
  };
}
