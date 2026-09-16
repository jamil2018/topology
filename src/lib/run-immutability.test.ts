import { describe, expect, it } from "vitest";
import {
  ABORTED_RUN_MESSAGE,
  FROZEN_RUN_STATUSES,
  RUN_IMMUTABLE_MESSAGE,
  immutableMessageFor,
  isRunFrozen,
} from "./run-immutability";
import { runImmutableResponse } from "./run-immutability-http";

describe("isRunFrozen", () => {
  it("freezes completed and aborted runs", () => {
    expect(isRunFrozen("completed")).toBe(true);
    expect(isRunFrozen("aborted")).toBe(true);
    expect(isRunFrozen("planned")).toBe(false);
    expect(isRunFrozen("in_progress")).toBe(false);
    expect(isRunFrozen(undefined)).toBe(false);
    expect(isRunFrozen(null)).toBe(false);
  });

  it("lists completed and aborted as frozen statuses", () => {
    expect([...FROZEN_RUN_STATUSES]).toEqual(["completed", "aborted"]);
  });
});

describe("immutableMessageFor", () => {
  it("uses a distinct message for aborted runs", () => {
    expect(immutableMessageFor("aborted")).toBe(ABORTED_RUN_MESSAGE);
    expect(immutableMessageFor("completed")).toBe(RUN_IMMUTABLE_MESSAGE);
  });
});

describe("runImmutableResponse", () => {
  it("returns 409 with a clear error body", async () => {
    const res = runImmutableResponse();
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe(RUN_IMMUTABLE_MESSAGE);
  });
});
