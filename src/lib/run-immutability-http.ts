import { NextResponse } from "next/server";
import {
  RUN_IMMUTABLE_MESSAGE,
  isRunFrozen,
} from "@/lib/run-immutability";

export {
  FROZEN_RUN_STATUSES,
  RUN_IMMUTABLE_MESSAGE,
  isRunFrozen,
  type FrozenRunStatus,
} from "@/lib/run-immutability";

/** HTTP 409 response when a completed run is mutated. */
export function runImmutableResponse(message = RUN_IMMUTABLE_MESSAGE) {
  return NextResponse.json({ error: message }, { status: 409 });
}

export function assertRunMutable(status: string | null | undefined) {
  if (isRunFrozen(status)) {
    return runImmutableResponse();
  }
  return null;
}
