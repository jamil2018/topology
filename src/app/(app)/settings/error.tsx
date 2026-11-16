"use client";

import { RouteError } from "@/components/route-error";

export default function SettingsError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteError
      title="Settings failed to load"
      description="Unexpected error while loading workspace settings."
      retry={retry}
      backHref="/"
      backLabel="Back to hub"
    />
  );
}
