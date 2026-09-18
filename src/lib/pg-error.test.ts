import { describe, expect, it } from "vitest";
import { caseWriteError, postgresCauseCode } from "./pg-error";

function drizzleError(message: string, cause: { code: string }) {
  const err = new Error(message);
  (err as { cause?: unknown }).cause = cause;
  return err;
}

describe("postgresCauseCode", () => {
  it("reads the code from err.cause, not the Failed query message", () => {
    const err = drizzleError(
      'Failed query: insert into "cases" ... unique constraint',
      { code: "23505" },
    );
    expect(err.message.includes("unique")).toBe(true);
    expect(postgresCauseCode(err)).toBe("23505");
    expect(caseWriteError(err)).toEqual({
      status: 409,
      error: "Case key already exists",
    });
  });

  it("does not treat a message that merely includes unique as a conflict", () => {
    const err = new Error("unique");
    expect(postgresCauseCode(err)).toBeUndefined();
    expect(caseWriteError(err)).toBeNull();
  });

  it("maps foreign-key violations to 400 without the query text", () => {
    const err = drizzleError('Failed query: insert into "cases"', {
      code: "23503",
    });
    expect(caseWriteError(err)).toEqual({
      status: 400,
      error: "Invalid reference",
    });
    expect(caseWriteError(err)?.error).not.toMatch(/Failed query|password/i);
  });
});
