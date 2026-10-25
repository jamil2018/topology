"use client";

import { RouteError } from "@/components/route-error";

export default function SettingsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      title="Settings failed to load"
      description="Unexpected error while loading workspace settings."
      reset={reset}
      backHref="/"
      backLabel="Back to hub"
    />
  );
}
