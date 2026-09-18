import { describe, expect, it } from "vitest";
import { downloadHeaders, storageKeyStaysInRoot } from "./safe-download";

describe("downloadHeaders", () => {
  it("serves allowlisted images, pdf, and plain text inline", () => {
    const png = downloadHeaders("shot.png", "image/png", 12);
    expect(png["Content-Type"]).toBe("image/png");
    expect(png["Content-Disposition"]).toContain("inline");
    expect(png["X-Content-Type-Options"]).toBe("nosniff");

    expect(downloadHeaders("note.txt", "text/plain; charset=utf-8", 4)[
      "Content-Type"
    ]).toBe("text/plain");
    expect(downloadHeaders("doc.pdf", "application/pdf", 4)["Content-Type"]).toBe(
      "application/pdf",
    );
  });

  it("does not serve active types inline or echo their content type", () => {
    for (const type of [
      "text/html",
      "text/html; charset=utf-8",
      "application/xhtml+xml",
      "image/svg+xml",
      "application/javascript",
      "text/javascript",
    ]) {
      const headers = downloadHeaders("file.bin", type, 8);
      expect(headers["Content-Type"]).toBe("application/octet-stream");
      expect(headers["Content-Disposition"]).toContain("attachment");
      expect(headers["Content-Disposition"]).not.toContain("inline");
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    }
  });
});

describe("storageKeyStaysInRoot", () => {
  it("keeps a single segment and rejects parent traversal", () => {
    expect(storageKeyStaysInRoot("11111111-2222-4333-8444-555555555555-note.txt")).toBe(
      true,
    );
    expect(storageKeyStaysInRoot("../secret")).toBe(false);
    expect(storageKeyStaysInRoot("nested/file")).toBe(false);
  });
});
