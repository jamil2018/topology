import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { render } from "@/test/render";
import { InboundIssueSyncPanel } from "./inbound-issue-sync-panel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("InboundIssueSyncPanel", () => {
  it("lists provider webhook URLs and signing status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          workspaceId: "ws-1",
          providers: [
            {
              provider: "github",
              path: "/api/webhooks/issues/github",
              signingConfigured: true,
              secretEnvKeys: ["TOPOLOGY_GITHUB_WEBHOOK_SECRET"],
            },
            {
              provider: "jira",
              path: "/api/webhooks/issues/jira",
              signingConfigured: false,
              secretEnvKeys: ["TOPOLOGY_JIRA_WEBHOOK_SECRET"],
            },
          ],
        }),
      ),
    );

    render(<InboundIssueSyncPanel defaultUrl="http://127.0.0.1:4317" />);

    await waitFor(() => {
      expect(screen.getByText("GitHub Issues")).toBeInTheDocument();
    });
    expect(screen.getByText("Signing ready")).toBeInTheDocument();
    expect(screen.getByText("Secret missing")).toBeInTheDocument();
    expect(
      screen.getByText(/\/api\/webhooks\/issues\/github\?workspaceId=ws-1/),
    ).toBeInTheDocument();
  });
});
