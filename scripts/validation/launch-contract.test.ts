import { expect, test } from "vitest";
import { qualificationIssue, type LedgerRow } from "./launch-contract";

const commit = "a".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;
const release = { commit, stagingDigest: digest, now: Date.parse("2026-11-24T00:00:00Z"), priority: "P0", allowNA: false };
const passed: LedgerRow = {
  status: "PASS", commit, imageDigest: digest, environment: "staging", tester: "Staging operator",
  observedAt: "2026-11-23T00:00:00Z", evidence: ["receipts/device-check.json"],
};

test("requires checked evidence on the frozen SHA and staging digest", () => {
  const options = { ...release, stagingRequired: true };
  expect(qualificationIssue(passed, options)).toBeUndefined();
  expect(qualificationIssue({ ...passed, commit: "c".repeat(40) }, options)).toMatch(/SHA/);
  expect(qualificationIssue({ ...passed, environment: "harness" }, options)).toMatch(/staging/);
  expect(qualificationIssue({ ...passed, evidence: [] }, options)).toMatch(/evidence/);
});

test("keeps unknown and required live qualifications on hold", () => {
  expect(qualificationIssue({ status: "BLOCKED" }, release)).toBe("BLOCKED");
  expect(qualificationIssue({ status: "NOT RUN" }, release)).toBe("NOT RUN");
  const disabled: LedgerRow = { ...passed, status: "N/A", reason: "Disabled and unpromised at launch" };
  expect(qualificationIssue(disabled, release)).toMatch(/N\/A/);
  expect(qualificationIssue(disabled, { ...release, allowNA: true })).toBeUndefined();
});

test("accepts only active P1 exceptions signed by the release owner", () => {
  const failed: LedgerRow = {
    ...passed, status: "FAIL", defect: "QA-21",
    exception: { impact: "Secondary export", workaround: "Use CSV", owner: "Reports", expiresAt: "2026-11-25T00:00:00Z", acceptedBy: "Release lead" },
  };
  expect(qualificationIssue(failed, { ...release, releaseOwner: "Release lead" })).toBe("unresolved failure");
  expect(qualificationIssue(failed, { ...release, priority: "P1", releaseOwner: "Release lead" })).toBeUndefined();
  expect(qualificationIssue(failed, { ...release, priority: "P1", releaseOwner: "Another reviewer" })).toBe("unresolved failure");
});
