import { NextResponse } from "next/server";
import { postgresCauseCode } from "@/lib/pg-error";

export function isUniqueViolation(err: unknown) {
  return postgresCauseCode(err) === "23505";
}

const SQL_LEAK =
  /failed query|syntax error|sqlstate|\bat async\b|insert into|update "|delete from|select /i;

/** Safe client message. Never returns SQL text or stack frames. */
export function publicDbMessage(err: unknown, fallback: string): string {
  if (isUniqueViolation(err)) return fallback;
  if (postgresCauseCode(err)) return fallback;
  if (err instanceof Error && err.message && !SQL_LEAK.test(err.message)) {
    return err.message;
  }
  return fallback;
}

export function dbErrorResponse(
  err: unknown,
  fallback: string,
  options?: { uniqueMessage?: string; uniqueStatus?: number },
) {
  if (isUniqueViolation(err)) {
    return NextResponse.json(
      { error: options?.uniqueMessage ?? "Already exists" },
      { status: options?.uniqueStatus ?? 409 },
    );
  }
  const code = postgresCauseCode(err);
  if (code === "22P02") {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  return NextResponse.json(
    { error: publicDbMessage(err, fallback) },
    { status: 400 },
  );
}

export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      ),
    };
  }
}
