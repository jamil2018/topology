import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachmentsDriver,
  createLocalAttachmentStorage,
  createS3AttachmentStorage,
  getAttachmentStorage,
  inferAttachmentKind,
  isAttachmentKind,
  resetAttachmentStorageCache,
  s3AttachmentConfig,
  sanitizeFilename,
  storeAttachmentFile,
} from "./attachments";

afterEach(() => {
  resetAttachmentStorageCache();
});

describe("attachments helpers", () => {
  it("sanitizes unsafe filenames", () => {
    expect(sanitizeFilename("ok-file.png")).toBe("ok-file.png");
    expect(sanitizeFilename("weird/name?.txt")).toBe("weird_name_.txt");
  });

  it("infers kind from filename and content-type", () => {
    expect(inferAttachmentKind("lockout.png", "image/png")).toBe("screenshot");
    expect(inferAttachmentKind("run.webm", "video/webm")).toBe("video");
    expect(inferAttachmentKind("trace.zip", "application/zip")).toBe("trace");
    expect(inferAttachmentKind("playwright-trace.zip")).toBe("trace");
    expect(inferAttachmentKind("ci.log", "text/plain")).toBe("log");
    expect(inferAttachmentKind("notes.bin")).toBe("other");
    expect(inferAttachmentKind("bundle.zip")).toBe("other");
  });

  it("validates kind strings", () => {
    expect(isAttachmentKind("screenshot")).toBe(true);
    expect(isAttachmentKind("nope")).toBe(false);
  });
});

describe("attachment storage drivers", () => {
  it("defaults to local and rejects unknown drivers", () => {
    expect(attachmentsDriver({})).toBe("local");
    expect(attachmentsDriver({ ATTACHMENTS_DRIVER: "s3" })).toBe("s3");
    expect(() => attachmentsDriver({ ATTACHMENTS_DRIVER: "nfs" })).toThrow(
      /Unknown ATTACHMENTS_DRIVER/,
    );
  });

  it("requires a bucket for the s3 driver", () => {
    expect(() => s3AttachmentConfig({ ATTACHMENTS_DRIVER: "s3" })).toThrow(
      /ATTACHMENTS_S3_BUCKET/,
    );
  });

  it("uses path-style S3 when an endpoint is set unless overridden", () => {
    expect(
      s3AttachmentConfig({
        ATTACHMENTS_S3_BUCKET: "topology",
        ATTACHMENTS_S3_ENDPOINT: "http://minio:9000",
      }).forcePathStyle,
    ).toBe(true);
    expect(
      s3AttachmentConfig({
        ATTACHMENTS_S3_BUCKET: "topology",
        ATTACHMENTS_S3_FORCE_PATH_STYLE: "0",
      }).forcePathStyle,
    ).toBe(false);
  });

  it("round-trips bytes on the local disk driver", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "topology-att-"));
    try {
      const storage = createLocalAttachmentStorage(dir);
      await storage.put("shot.png", Buffer.from("png"), "image/png");
      expect((await storage.get("shot.png")).toString()).toBe("png");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("round-trips bytes through an S3-compatible client", async () => {
    const objects = new Map<string, Buffer>();
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof PutObjectCommand) {
        const key = command.input.Key as string;
        const body = command.input.Body as Buffer;
        objects.set(key, body);
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const key = command.input.Key as string;
        const body = objects.get(key);
        if (!body) throw new Error("NoSuchKey");
        return {
          Body: {
            transformToByteArray: async () => new Uint8Array(body),
          },
        };
      }
      throw new Error(`unexpected command ${String(command)}`);
    });
    const client = { send } as unknown as S3Client;
    const storage = createS3AttachmentStorage(
      {
        bucket: "topology-attachments",
        region: "auto",
        forcePathStyle: true,
      },
      client,
    );
    await storage.put("a.bin", Buffer.from("hello"), "application/octet-stream");
    expect((await storage.get("a.bin")).toString()).toBe("hello");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("storeAttachmentFile writes via the local driver", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "topology-att-"));
    const previousDir = process.env.ATTACHMENTS_DIR;
    const previousDriver = process.env.ATTACHMENTS_DRIVER;
    process.env.ATTACHMENTS_DIR = dir;
    process.env.ATTACHMENTS_DRIVER = "local";
    resetAttachmentStorageCache();
    try {
      const stored = await storeAttachmentFile(
        new File(["hello"], "note.txt", { type: "text/plain" }),
      );
      expect(stored.filename).toBe("note.txt");
      expect(stored.sizeBytes).toBe(5);
      const storage = getAttachmentStorage();
      expect((await storage.get(stored.storageKey)).toString()).toBe("hello");
    } finally {
      if (previousDir === undefined) delete process.env.ATTACHMENTS_DIR;
      else process.env.ATTACHMENTS_DIR = previousDir;
      if (previousDriver === undefined) delete process.env.ATTACHMENTS_DRIVER;
      else process.env.ATTACHMENTS_DRIVER = previousDriver;
      resetAttachmentStorageCache();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
