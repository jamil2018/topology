import { describe, expect, it } from "vitest";
import {
  inferAttachmentKind,
  isAttachmentKind,
  sanitizeFilename,
} from "./attachments";

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
