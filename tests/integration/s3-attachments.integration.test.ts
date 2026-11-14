import { afterEach, describe, expect, it } from "vitest";

const s3E2e = process.env.TOPOLOGY_S3_E2E === "1";

const REQUIRED_ENV = [
  "ATTACHMENTS_S3_BUCKET",
  "ATTACHMENTS_S3_ENDPOINT",
  "ATTACHMENTS_S3_ACCESS_KEY_ID",
  "ATTACHMENTS_S3_SECRET_ACCESS_KEY",
] as const;

/**
 * Opt-in MinIO / S3 round trip. Skipped unless TOPOLOGY_S3_E2E=1.
 * See tests/ops/README.md for the exact command and env.
 */
describe.skipIf(!s3E2e)("S3 attachments (TOPOLOGY_S3_E2E)", () => {
  const previous: Record<string, string | undefined> = {};

  afterEach(async () => {
    const { resetAttachmentStorageCache } = await import("@/lib/attachments");
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetAttachmentStorageCache();
  });

  it("uploads and downloads through ATTACHMENTS_DRIVER=s3", async () => {
    for (const key of REQUIRED_ENV) {
      if (!process.env[key]?.trim()) {
        throw new Error(`${key} is required when TOPOLOGY_S3_E2E=1`);
      }
    }

    previous.ATTACHMENTS_DRIVER = process.env.ATTACHMENTS_DRIVER;
    process.env.ATTACHMENTS_DRIVER = "s3";

    const { readAttachmentFile, resetAttachmentStorageCache, storeAttachmentFile } =
      await import("@/lib/attachments");
    resetAttachmentStorageCache();

    const payload = `s3-e2e-${Date.now()}`;
    const stored = await storeAttachmentFile(
      new File([payload], "note.txt", { type: "text/plain" }),
    );
    const bytes = await readAttachmentFile(stored.storageKey);
    expect(bytes.toString()).toBe(payload);
    expect(stored.filename).toBe("note.txt");
    expect(stored.contentType).toBe("text/plain");
  });
});
