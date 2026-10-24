import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export type AttachmentDriver = "local" | "s3";

export type AttachmentStorage = {
  put(storageKey: string, body: Buffer, contentType: string): Promise<void>;
  get(storageKey: string): Promise<Buffer>;
};

export type S3AttachmentConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
};

export function attachmentsRoot() {
  return process.env.ATTACHMENTS_DIR
    ? process.env.ATTACHMENTS_DIR
    : path.join(process.cwd(), "data", "attachments");
}

export function attachmentsDriver(
  env: NodeJS.ProcessEnv = process.env,
): AttachmentDriver {
  const raw = (env.ATTACHMENTS_DRIVER ?? "local").trim().toLowerCase();
  if (raw === "s3") return "s3";
  if (raw === "local" || raw === "") return "local";
  throw new Error(
    `Unknown ATTACHMENTS_DRIVER "${raw}" (expected local or s3)`,
  );
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

export function createLocalAttachmentStorage(
  root = attachmentsRoot(),
): AttachmentStorage {
  return {
    async put(storageKey, body) {
      await mkdir(/* turbopackIgnore: true */ root, { recursive: true });
      await writeFile(
        /* turbopackIgnore: true */ path.join(root, storageKey),
        body,
      );
    },
    async get(storageKey) {
      return readFile(
        /* turbopackIgnore: true */ path.join(root, storageKey),
      );
    },
  };
}

export function s3AttachmentConfig(
  env: NodeJS.ProcessEnv = process.env,
): S3AttachmentConfig {
  const bucket = env.ATTACHMENTS_S3_BUCKET?.trim();
  if (!bucket) {
    throw new Error(
      "ATTACHMENTS_S3_BUCKET is required when ATTACHMENTS_DRIVER=s3",
    );
  }
  const endpoint = env.ATTACHMENTS_S3_ENDPOINT?.trim() || undefined;
  const forceFromEnv = env.ATTACHMENTS_S3_FORCE_PATH_STYLE?.trim();
  return {
    bucket,
    region: env.ATTACHMENTS_S3_REGION?.trim() || "auto",
    endpoint,
    accessKeyId: env.ATTACHMENTS_S3_ACCESS_KEY_ID?.trim() || undefined,
    secretAccessKey: env.ATTACHMENTS_S3_SECRET_ACCESS_KEY?.trim() || undefined,
    forcePathStyle:
      forceFromEnv === undefined || forceFromEnv === ""
        ? Boolean(endpoint)
        : forceFromEnv !== "0" && forceFromEnv.toLowerCase() !== "false",
  };
}

export function createS3AttachmentStorage(
  config: S3AttachmentConfig,
  client?: S3Client,
): AttachmentStorage {
  const s3 =
    client ??
    new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            }
          : undefined,
    });

  return {
    async put(storageKey, body, contentType) {
      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: storageKey,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
    async get(storageKey) {
      const out = await s3.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: storageKey,
        }),
      );
      const bytes = await out.Body?.transformToByteArray();
      if (!bytes) {
        throw new Error(`Empty object for ${storageKey}`);
      }
      return Buffer.from(bytes);
    },
  };
}

let cached: { driver: AttachmentDriver; storage: AttachmentStorage } | null =
  null;

export function resetAttachmentStorageCache() {
  cached = null;
}

export function getAttachmentStorage(
  env: NodeJS.ProcessEnv = process.env,
): AttachmentStorage {
  const driver = attachmentsDriver(env);
  if (cached && cached.driver === driver && env === process.env) {
    return cached.storage;
  }
  const storage =
    driver === "s3"
      ? createS3AttachmentStorage(s3AttachmentConfig(env))
      : createLocalAttachmentStorage(
          env.ATTACHMENTS_DIR?.trim() || attachmentsRoot(),
        );
  if (env === process.env) cached = { driver, storage };
  return storage;
}

export async function storeAttachmentFile(file: File) {
  if (file.size > MAX_BYTES) {
    throw new Error(`File exceeds ${MAX_BYTES / (1024 * 1024)} MB limit`);
  }

  const id = randomUUID();
  const safeName = sanitizeFilename(file.name);
  const storageKey = `${id}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  await getAttachmentStorage().put(storageKey, buffer, contentType);

  return {
    storageKey,
    filename: safeName,
    contentType,
    sizeBytes: buffer.length,
  };
}

export async function readAttachmentFile(storageKey: string) {
  return getAttachmentStorage().get(storageKey);
}

export { MAX_BYTES as ATTACHMENT_MAX_BYTES };
