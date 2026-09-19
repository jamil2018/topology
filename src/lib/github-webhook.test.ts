import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  collectGithubCommitPaths,
  parseTopologyChangedFilesHeader,
  verifyGithubSignature,
} from "./github-webhook";

describe("github-webhook helpers", () => {
  it("collects added/modified/removed paths", () => {
    expect(
      collectGithubCommitPaths({
        added: ["a.ts"],
        modified: ["b.ts"],
        removed: ["c.ts"],
      }),
    ).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("parses changed-files header as JSON or CSV", () => {
    expect(parseTopologyChangedFilesHeader('["x.ts","y.ts"]')).toEqual([
      "x.ts",
      "y.ts",
    ]);
    expect(parseTopologyChangedFilesHeader("x.ts, y.ts")).toEqual([
      "x.ts",
      "y.ts",
    ]);
  });

  it("verifies HMAC signature when secret set", () => {
    const body = '{"hello":true}';
    const secret = "test-secret";
    const sig =
      "sha256=" +
      createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(verifyGithubSignature(body, sig, secret)).toEqual({ ok: true });
    expect(verifyGithubSignature(body, sig, undefined)).toEqual({ ok: true });
    expect(verifyGithubSignature(body, "sha256=dead", secret).ok).toBe(false);
  });
});
