import { NextResponse } from "next/server";
import {
  RUN_IMMUTABLE_MESSAGE,
  immutableMessageFor,
  isRunFrozen,
} from "@/lib/run-immutability";

export {
  ABORTED_RUN_MESSAGE,
  FROZEN_RUN_STATUSES,
  RUN_IMMUTABLE_MESSAGE,
  immutableMessageFor,
  isRunFrozen,
  type FrozenRunStatus,
} from "@/lib/run-immutability";

/** HTTP 409 response when a completed or aborted run is mutated. */
export function runImmutableResponse(message = RUN_IMMUTABLE_MESSAGE) {
  return NextResponse.json({ error: message }, { status: 409 });
}

export function assertRunMutable(status: string | null | undefined) {
  if (isRunFrozen(status)) {
    return runImmutableResponse(immutableMessageFor(status));
  }
  return null;
}
