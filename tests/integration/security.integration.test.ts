/**
 * Security guards that do not need a browser or a running dev server.
 *
 * The unauthenticated route sweep is in
 * `tests/integration/security/unauth-sweep.integration.test.ts`. It imports
 * each API route handler and calls it in-process, matching
 * `tests/integration/ci-ingest.integration.test.ts`. It does not read
 * `TOPOLOGY_SECURITY_HTTP`. Handlers that query Postgres still fail that
 * sweep when the database is down; that is intentional.
 *
 * This file always executes the pure checks: open redirect, CSV formula
 * prefix, XXE, attachment paths, GitHub webhook rejection, and the client
 * bundle secret scan (skipped when `.next/static` is absent).
 */
import { createHmac } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { POST as githubWebhook } from "@/app/api/webhooks/github/route";
import {
  downloadHeaders,
  storageKeyStaysInRoot,
} from "@/app/api/attachments/safe-download";
import { serializeCasesCsv } from "@/lib/csv";
import { verifyGithubSignature } from "@/lib/github-webhook";
import { parseXml, xmlText } from "@/lib/import/xml";
import { safeCallbackPath } from "@/lib/safe-callback-path";
import { buildCsv, buildXlsx, escapeCsvCell } from "@/lib/tcm/export";
import { parseJUnitXml } from "@topology/domain";

const XXE = `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>`;
const PASSWD_MARKERS = ["root:x:0:0", "root:x:", "/bin/bash", "/bin/sh"];

function assertNoExternalEntity(text: string) {
  for (const marker of PASSWD_MARKERS) {
    expect(text).not.toContain(marker);
  }
  expect(text.length).toBeLessThan(500);
}

describe("safeCallbackPath", () => {
  it("keeps a same-origin path", () => {
    expect(safeCallbackPath("/cases")).toBe("/cases");
  });

  it("rejects protocol-relative, absolute, backslash, and CRLF targets", () => {
    expect(safeCallbackPath("//evil.com")).toBe("/");
    expect(safeCallbackPath("//evil.com/phish")).toBe("/");
    expect(safeCallbackPath("https://evil.com")).toBe("/");
    expect(safeCallbackPath("https://evil.com/phish")).toBe("/");
    expect(safeCallbackPath("/\\evil")).toBe("/");
    expect(safeCallbackPath("/cases\r\nLocation: https://evil.com")).toBe("/");
    expect(safeCallbackPath("/cases\nSet-Cookie: session=stolen")).toBe("/");
  });
});

describe("CSV formula injection", () => {
  it("prefixes formula cells in case export and report CSV", () => {
    const csv = serializeCasesCsv([
      {
        key: "SEC-1",
        title: "=cmd|' /C calc'!A0",
        description: "+1+1",
        preconditions: "-2+2",
        steps: "@SUM(A1)",
        expectedResult: "ok",
        priority: "P2",
        status: "draft",
        folderName: "=Reports",
        tags: ["=tag"],
      },
    ]);
    expect(csv).toContain("'=cmd|");
    expect(csv).toContain("'+1+1");
    expect(csv).toContain("'-2+2");
    expect(csv).toContain("'@SUM(A1)");
    expect(csv).toContain("'=Reports");
    expect(csv).not.toMatch(/(^|,)[=+\-@]/m);
    expect(csv).not.toMatch(/(^|,)"[=+\-@]/m);

    expect(escapeCsvCell("=cmd")).toBe(`"'=cmd"`);
    const report = buildCsv(
      [{ key: "title", header: "Title" }],
      [{ title: "=cmd" }],
    );
    expect(report).toContain(`"'=cmd"`);
    expect(report).not.toMatch(/(^|,)"=/m);

    const sheet = buildXlsx(
      "Cases",
      [{ key: "title", header: "Title" }],
      [{ title: "=cmd" }],
    );
    expect(sheet).toContain('ss:Type="String">=cmd');
    expect(sheet).not.toContain("ss:Formula");
  });
});

describe("XML external entities", () => {
  it("does not expand a SYSTEM entity in the import parser", () => {
    const parsed = parseXml(
      `<?xml version="1.0"?>${XXE}<suite><case>&xxe;</case></suite>`,
    );
    const text = xmlText(parsed);
    assertNoExternalEntity(text);
    expect(text).toContain("&xxe;");
  });

  it("does not expand a SYSTEM entity in the JUnit parser", () => {
    const report = parseJUnitXml(
      `<?xml version="1.0"?>${XXE}<testsuites><testsuite name="s"><testcase name="n" classname="c"><failure message="m">&xxe;</failure></testcase></testsuite></testsuites>`,
    );
    const text = JSON.stringify(report);
    assertNoExternalEntity(text);
    expect(text).toContain("&xxe;");
    expect(text).not.toContain("file:///etc/passwd");
  });
});

describe("attachment download guards", () => {
  it("rejects traversal and absolute keys", () => {
    expect(
      storageKeyStaysInRoot("11111111-2222-4333-8444-555555555555-note.txt"),
    ).toBe(true);
    expect(storageKeyStaysInRoot("../secret")).toBe(false);
    expect(storageKeyStaysInRoot("../../etc/passwd")).toBe(false);
    expect(storageKeyStaysInRoot("foo/../../etc/passwd")).toBe(false);
    expect(storageKeyStaysInRoot("/etc/passwd")).toBe(false);
    expect(storageKeyStaysInRoot("a\0b")).toBe(false);
    // Real slashes still leave the single-segment root, even when `..` is encoded.
    expect(storageKeyStaysInRoot("%2e%2e/%2e%2e/etc/passwd")).toBe(false);
    expect(storageKeyStaysInRoot("nested/%2e%2e/secret")).toBe(false);
    // `%2f` is not a path separator, so the key is one filename inside the root.
    expect(storageKeyStaysInRoot("..%2f..%2fetc%2fpasswd")).toBe(true);
    expect(storageKeyStaysInRoot("..%2F..%2Fetc%2Fpasswd")).toBe(true);
  });

  it("forces active content to download and strips header injection", () => {
    for (const type of ["text/html", "image/svg+xml", "application/xhtml+xml"]) {
      const headers = downloadHeaders("page.html", type, 12);
      expect(headers["Content-Type"]).toBe("application/octet-stream");
      expect(headers["Content-Disposition"].startsWith("attachment;")).toBe(
        true,
      );
      expect(headers["Content-Disposition"]).not.toContain("inline");
      expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    }

    const injected = downloadHeaders('evil"\r\nX-Evil: 1\\name.html', "text/html", 4);
    expect(injected["Content-Disposition"]).not.toMatch(/[\r\n]/);
    expect(injected["Content-Disposition"]).toBe(
      'attachment; filename="evilX-Evil: 1name.html"',
    );
    expect(injected["Content-Disposition"]).not.toContain("inline");
  });
});

describe("GitHub webhook signature", () => {
  it("rejects a missing or wrong signature before accepting the payload", () => {
    const body = '{"zen":"unsigned"}';
    const secret = "test-secret";
    expect(verifyGithubSignature(body, null, secret)).toEqual({
      ok: false,
      status: 401,
      error: "Missing X-Hub-Signature-256",
    });
    expect(verifyGithubSignature(body, "sha256=deadbeef", secret).ok).toBe(
      false,
    );
    const good =
      "sha256=" +
      createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(verifyGithubSignature(body, good, secret)).toEqual({ ok: true });
  });

  it("rejects an unsigned webhook request on the route", async () => {
    const res = await githubWebhook(
      new Request(
        "http://127.0.0.1/api/webhooks/github?workspaceId=00000000-0000-4000-8000-000000000001",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ zen: "unsigned" }),
        },
      ),
    );
    expect(res.status).toBe(401);
    const payload = (await res.json()) as { error?: string };
    expect(payload.error ?? "").toMatch(/signature|secret/i);
  });
});

describe("client bundle secrets", () => {
  const staticDir = path.resolve(process.cwd(), ".next/static");

  it.skipIf(!existsSync(staticDir))(
    "does not embed JIRA or GitHub OAuth secret names",
    () => {
      const hits: string[] = [];
      const stack = [staticDir];
      while (stack.length > 0) {
        const dir = stack.pop()!;
        for (const entry of readdirSync(dir)) {
          const full = path.join(dir, entry);
          const info = statSync(full);
          if (info.isDirectory()) {
            stack.push(full);
            continue;
          }
          if (!info.isFile()) continue;
          const text = readFileSync(full);
          if (
            text.includes("JIRA_API_TOKEN") ||
            text.includes("AUTH_GITHUB_SECRET")
          ) {
            hits.push(path.relative(process.cwd(), full));
          }
        }
      }
      expect(hits).toEqual([]);
    },
  );
});
