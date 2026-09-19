import { describe, expect, it } from "vitest";
import {
  clusterFailuresBySignature,
  computeFailureSignature,
  failureSignatureHash,
  normalizeErrorMessage,
  stackTopFrame,
} from "./failure-signature";

describe("normalizeErrorMessage", () => {
  it("lowercases, collapses whitespace, and strips volatile tokens", () => {
    expect(
      normalizeErrorMessage(
        "  Timeout waiting for #pay-btn after 5000ms uuid=a1b2c3d4-e5f6-7890-abcd-ef1234567890  ",
      ),
    ).toBe(
      "timeout waiting for #pay-btn after <n>ms uuid=<uuid>",
    );
  });
});

describe("stackTopFrame", () => {
  it("returns the first meaningful frame with line numbers normalized", () => {
    const stack = `Error: boom
    at submitOrder (/app/checkout.ts:42:11)
    at Object.<anonymous> (/app/test.spec.ts:10:5)`;
    expect(stackTopFrame(stack)).toBe(
      "at submitorder (…)",
    );
  });

  it("returns empty string for blank stacks", () => {
    expect(stackTopFrame("")).toBe("");
    expect(stackTopFrame("Error: only header")).toBe("");
  });
});

describe("computeFailureSignature", () => {
  it("hashes normalized message + stack top stably", () => {
    const a = computeFailureSignature({
      errorMessage: "Timeout after 3000ms",
      stack: `Error: Timeout after 3000ms
    at waitFor (/lib/wait.ts:12:3)`,
    });
    const b = computeFailureSignature({
      errorMessage: "Timeout after 9000ms",
      stack: `Error: Timeout after 9000ms
    at waitFor (/lib/wait.ts:99:1)`,
    });
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toHaveLength(64);
    expect(a.normalizedMessage).toContain("<n>");
    expect(a.stackTop).toBe(b.stackTop);
  });

  it("falls back to first notes line when message is missing", () => {
    const sig = computeFailureSignature({
      notes: "payment iframe timeout\nmore detail",
    });
    expect(sig.normalizedMessage).toBe("payment iframe timeout");
    expect(sig.hash).toBe(
      failureSignatureHash({ errorMessage: "payment iframe timeout" }),
    );
  });

  it("clusters failures that share a signature", () => {
    const clusters = clusterFailuresBySignature([
      {
        id: "1",
        signatureHash: "",
        errorMessage: "Timeout after 1000ms",
        stack: "Error\n    at wait (/x.ts:1:1)",
        failedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "2",
        signatureHash: "",
        errorMessage: "Timeout after 2000ms",
        stack: "Error\n    at wait (/x.ts:2:2)",
        failedAt: "2026-01-03T00:00:00Z",
      },
      {
        id: "3",
        signatureHash: "",
        errorMessage: "Element not found",
        stack: "Error\n    at query (/y.ts:1:1)",
        failedAt: "2026-01-02T00:00:00Z",
      },
    ]);

    expect(clusters).toHaveLength(2);
    expect(clusters[0]?.count).toBe(2);
    expect(clusters[0]?.memberIds).toEqual(["1", "2"]);
    expect(clusters[0]?.lastFailedAt).toBe("2026-01-03T00:00:00Z");
    expect(clusters[1]?.count).toBe(1);
  });

  it("respects an explicit signatureHash when clustering", () => {
    const clusters = clusterFailuresBySignature([
      {
        id: "a",
        signatureHash: "sig-shared",
        errorMessage: "one",
        failedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "b",
        signatureHash: "sig-shared",
        errorMessage: "totally different",
        failedAt: "2026-01-02T00:00:00Z",
      },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.signatureHash).toBe("sig-shared");
    expect(clusters[0]?.count).toBe(2);
  });
});
