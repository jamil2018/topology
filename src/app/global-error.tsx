"use client";

import { Button } from "@heroui/react";
import "./globals.css";

export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-full bg-[color:var(--topo-paper)] text-[color:var(--topo-ink)]">
        <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-4 px-4 py-16">
          <div
            role="alert"
            className="space-y-3 rounded-md border border-[color:var(--topo-danger-border)] bg-[color-mix(in_srgb,var(--topo-danger)_10%,transparent)] p-4"
          >
            <h1 className="text-sm font-semibold text-[color:var(--topo-danger)]">
              Something went wrong
            </h1>
            <p className="text-xs text-[color:var(--topo-muted)]">
              Topology hit an unexpected error. You can try again, or return
              home if the problem continues.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="primary" onPress={retry}>
                Try again
              </Button>
              {/* Hard navigation: global-error replaces the root layout. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="rounded-md border border-[color:var(--topo-line)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)]"
              >
                Back to Home
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
