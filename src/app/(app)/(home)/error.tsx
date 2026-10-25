"use client";

import { RouteError } from "@/components/route-error";

export default function HubError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      title="Hub failed to load"
      description="Unexpected error while loading the quality pulse."
      reset={reset}
    />
  );
}
