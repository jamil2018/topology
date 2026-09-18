/** Postgres error code on Drizzle's `err.cause`, not `err.message`. */
export function postgresCauseCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object" || !("cause" in err)) return undefined;
  const cause = (err as { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object") return undefined;
  if ("code" in cause && typeof (cause as { code?: unknown }).code === "string") {
    return (cause as { code: string }).code;
  }
  return postgresCauseCode(cause);
}

/** Map unique/FK violations to client-safe statuses. Never use err.message. */
export function caseWriteError(
  err: unknown,
): { status: 409 | 400; error: string } | null {
  const code = postgresCauseCode(err);
  if (code === "23505") {
    return { status: 409, error: "Case key already exists" };
  }
  if (code === "23503") {
    return { status: 400, error: "Invalid reference" };
  }
  return null;
}

export function isLockFailure(err: unknown): boolean {
  const code = postgresCauseCode(err);
  return code === "40P01" || code === "55P03";
}
