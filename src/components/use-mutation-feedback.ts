"use client";
import { useRef, useState } from "react";

/** Holds the submission lock through network work and clears it on every exit. */
export function useMutationFeedback(onError: (message: string | null) => void) {
  const lock = useRef(false);
  const [saving, setSaving] = useState(false);
  async function submit(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    onError(null);
    try { await operation(); }
    catch (error) { onError(error instanceof Error ? error.message : "Request failed. Your draft is preserved."); }
    finally { lock.current = false; setSaving(false); }
  }
  return { saving, submit };
}
