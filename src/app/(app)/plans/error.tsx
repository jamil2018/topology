"use client";

import { RouteError } from "@/components/route-error";

export default function PlansError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteError
      title="Plans failed to load"
      description="Unexpected error while loading test plans."
      retry={retry}
      backHref="/"
      backLabel="Back to hub"
    />
  );
}
