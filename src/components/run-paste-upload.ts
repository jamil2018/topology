"use client";

/** Collect image files from a paste or drop event. */
export function imageFilesFromDataTransfer(
  data: DataTransfer | null | undefined,
): File[] {
  if (!data) return [];
  const out: File[] = [];
  const seen = new Set<string>();

  const push = (file: File | null | undefined) => {
    if (!file || !file.type.startsWith("image/") || file.size === 0) return;
    const key = `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(file);
  };

  if (data.items) {
    for (const item of Array.from(data.items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        push(item.getAsFile());
      }
    }
  }
  if (out.length === 0 && data.files) {
    for (const file of Array.from(data.files)) push(file);
  }
  return out;
}

export function isImageAttachment(contentType: string, filename: string): boolean {
  if (contentType.toLowerCase().startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filename);
}

export type PendingUpload = {
  localId: string;
  filename: string;
  previewUrl: string;
};

export function pendingUploadFromFile(file: File): PendingUpload {
  return {
    localId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    filename: file.name || "paste.png",
    previewUrl: URL.createObjectURL(file),
  };
}

export function revokePendingUploads(pending: PendingUpload[]) {
  for (const row of pending) {
    try {
      URL.revokeObjectURL(row.previewUrl);
    } catch {
      // ignore
    }
  }
}
