import { describe, expect, it } from "vitest";
import { sanitizeFilename } from "./attachments";

describe("attachments helpers", () => {
  it("sanitizes unsafe filenames", () => {
    expect(sanitizeFilename("ok-file.png")).toBe("ok-file.png");
    expect(sanitizeFilename("weird/name?.txt")).toBe("weird_name_.txt");
  });
});
