"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { StatusChip } from "./status-chip";

const REPORTERS = [
  {
    id: "playwright",
    packageName: "@topology/playwright",
    install: "npm i -D @topology/playwright",
    snippet: `// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  reporter: [["@topology/playwright"], ["list"]],
});`,
  },
  {
    id: "jest",
    packageName: "@topology/jest",
    install: "npm i -D @topology/jest",
    snippet: `// jest.config.js / jest.config.ts
export default {
  reporters: ["default", ["@topology/jest", { intentFromTitle: true }]],
};`,
  },
  {
    id: "cypress",
    packageName: "@topology/cypress",
    install: "npm i -D @topology/cypress",
    snippet: `// cypress.config.ts
import { defineConfig } from "cypress";
import { topologyCypressPlugin } from "@topology/cypress";

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      topologyCypressPlugin(on, config);
      return config;
    },
  },
});`,
  },
  {
    id: "pytest",
    packageName: "pytest-topology",
    install: "pip install pytest-topology",
    snippet: `export TOPOLOGY_URL=http://127.0.0.1:4317
export TOPOLOGY_API_TOKEN=<token from Settings → Security>
pytest`,
  },
] as const;

export function AutomationReporters() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Framework reporters
        </h2>
        <p className="text-xs text-[color:var(--topo-muted)]">
          Native reporters post ExecutionReport JSON to{" "}
          <code className="font-mono">/api/executions</code>. Set{" "}
          <code className="font-mono">TOPOLOGY_URL</code> and{" "}
          <code className="font-mono">TOPOLOGY_API_TOKEN</code> in CI.
        </p>
      </div>
      <ul className="space-y-2">
        {REPORTERS.map((reporter) => (
          <li
            key={reporter.id}
            className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusChip mono>{reporter.packageName}</StatusChip>
                <span className="font-mono text-xs text-[color:var(--topo-muted)]">
                  {reporter.install}
                </span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onPress={() =>
                  void copy(
                    reporter.id,
                    `${reporter.install}\n\n${reporter.snippet}`,
                  )
                }
              >
                {copiedId === reporter.id ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[color:var(--topo-ink)]">
              {reporter.snippet}
            </pre>
          </li>
        ))}
      </ul>
    </section>
  );
}
