"use client";

import { RouteError } from "@/components/route-error";

export default function HubError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteError
      title="Home failed to load"
      description="Unexpected error while loading the quality pulse."
      retry={retry}
    />
  );
}
