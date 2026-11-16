import { describe, expect, it } from "vitest";
import { assertOwnedDatabase, redact } from "../../scripts/validation/safety";

describe("validation safety", () => {
  const owned = "topology_validation_0123456789abcdef_seeded";
  it("requires both a generated name and in-process creation provenance", () => {
    expect(() => assertOwnedDatabase("topology", new Set(["topology"]))).toThrow(/Refusing/);
    expect(() => assertOwnedDatabase(owned, new Set())).toThrow(/Refusing/);
    expect(() => assertOwnedDatabase(owned, new Set([owned]))).not.toThrow();
    const lease = "topology_validation_0123456789abcdef_case_0123456789abcdef";
    expect(() => assertOwnedDatabase(lease, new Set())).toThrow(/Refusing/);
    expect(() => assertOwnedDatabase(lease, new Set([lease]))).not.toThrow();
    expect(() => assertOwnedDatabase(`${owned};DROP DATABASE topology`, new Set([owned]))).toThrow(/Refusing/);
  });
  it("redacts URLs, known credentials and bearer headers", () => {
    expect(redact("postgresql://user:pass@host/db password token Bearer abc.def", ["password", "token"]))
      .toBe("[database URL redacted] [redacted] [redacted] Bearer [redacted]");
  });
});

it("scrubs trace payloads, base64 attachments and embedded HTML report archives", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { zipSync, unzipSync, strToU8, strFromU8 } = await import("fflate");
  const dir = mkdtempSync(join(tmpdir(), "topology-redaction-test-"));
  const record = JSON.stringify({ postData: JSON.stringify({ password: "nested-password" }), attachments: [{ contentType: "text/plain", body: Buffer.from("Bearer attachment-credential").toString("base64") }], headers: [{ name: "Cookie", value: "session=cookie-credential" }] });
  const archive = zipSync({ "trace.network": strToU8(record) });
  try {
    writeFileSync(join(dir, "trace.zip"), archive);
    writeFileSync(join(dir, "index.html"), `<script>const report="data:application/zip;base64,${Buffer.from(archive).toString("base64")}"</script>`);
    execFileSync("python3", ["scripts/validation/redact-artifacts.py", dir], { env: { ...process.env, VALIDATION_REDACT_SECRETS: "[]" } });
    const trace = strFromU8(unzipSync(readFileSync(join(dir, "trace.zip")))["trace.network"]);
    const html = readFileSync(join(dir, "index.html"), "utf8");
    const embedded = html.match(/data:application\/zip;base64,([A-Za-z0-9+/=]+)/)![1];
    const report = strFromU8(unzipSync(Buffer.from(embedded, "base64"))["trace.network"]);
    for (const payload of [trace, report]) {
      expect(payload).not.toContain("nested-password");
      expect(payload).not.toContain("cookie-credential");
      const body = JSON.parse(payload).attachments[0].body;
      expect(Buffer.from(body, "base64").toString()).toBe("Bearer [redacted]");
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
