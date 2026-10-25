"use client";

import { RouteError } from "@/components/route-error";

export default function PlansError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      title="Plans failed to load"
      description="Unexpected error while loading test plans."
      reset={reset}
      backHref="/"
      backLabel="Back to hub"
    />
  );
}
