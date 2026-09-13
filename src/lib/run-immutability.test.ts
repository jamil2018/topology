import { describe, expect, it } from "vitest";
import {
  FROZEN_RUN_STATUSES,
  RUN_IMMUTABLE_MESSAGE,
  isRunFrozen,
} from "./run-immutability";
import { runImmutableResponse } from "./run-immutability-http";

describe("isRunFrozen", () => {
  it("freezes only completed runs", () => {
    expect(isRunFrozen("completed")).toBe(true);
    expect(isRunFrozen("planned")).toBe(false);
    expect(isRunFrozen("in_progress")).toBe(false);
    expect(isRunFrozen("aborted")).toBe(false);
    expect(isRunFrozen(undefined)).toBe(false);
    expect(isRunFrozen(null)).toBe(false);
  });

  it("lists completed as the sole frozen status", () => {
    expect([...FROZEN_RUN_STATUSES]).toEqual(["completed"]);
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
