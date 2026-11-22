/**
 * Helpers for fetch + AbortController cleanup in useEffect.
 *
 * Next.js / Turbopack overlays are sensitive to abort reasons:
 * - `abort("string")` → fetch rejects with the string → Runtime Error overlay shows that string
 * - `abort()` with no reason → default DOMException "signal is aborted without reason"
 * - `abort(new DOMException("Component unmount", "AbortError"))` → overlay shows that message
 *
 * Always abort with an AbortError-named DOMException whose message is empty so
 * Next never surfaces a labeled unmount string. Catch paths must use isAbortError /
 * signal.aborted and never rethrow.
 */

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "AbortError"
  );
}

/** Build an AbortError reason safe for Next/Turbopack (empty message, never a string). */
export function abortReason(): DOMException {
  return new DOMException("", "AbortError");
}

/** Abort a controller for effect cleanup without triggering string-reason overlays. */
export function abortCleanup(controller: AbortController): void {
  controller.abort(abortReason());
}
