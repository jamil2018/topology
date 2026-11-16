import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/test/render";
import { ProjectActionsProvider } from "./project-actions";
import { ReportExportActions } from "./report-export-actions";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function show(allowed = true) {
  return render(<ProjectActionsProvider actions={allowed ? ["reports.create"] : []} projectId="p" userId="u"><ReportExportActions runId="run" /></ProjectActionsProvider>);
}
describe("report sharing controls", () => {
  it("revokes all old links, clears the displayed URL and announces success", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ url: "http://localhost/share/reports/old" })).mockResolvedValueOnce(Response.json({ revoked: true }));
    vi.stubGlobal("fetch", fetch);
    show();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Share link" }));
    expect(await screen.findByLabelText("Shareable report URL")).toHaveValue("http://localhost/share/reports/old");
    await user.click(screen.getByRole("button", { name: "Revoke all share links" }));
    expect(await screen.findByRole("status")).toHaveTextContent("All earlier share links revoked.");
    expect(screen.queryByLabelText("Shareable report URL")).not.toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith("/api/reports/run/share", { method: "DELETE" });
  });
  it("preserves a usable URL on rejection and allows retry", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ url: "http://localhost/share/reports/old" }))
      .mockResolvedValueOnce(Response.json({ error: "unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ revoked: true }));
    vi.stubGlobal("fetch", fetch);
    show(); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Share link" }));
    await screen.findByLabelText("Shareable report URL");
    await user.click(screen.getByRole("button", { name: "Revoke all share links" }));
    expect(await screen.findByText("Could not revoke share links. Try again.")).toBeVisible();
    expect(screen.getByLabelText("Shareable report URL")).toHaveValue("http://localhost/share/reports/old");
    await user.click(screen.getByRole("button", { name: "Revoke all share links" }));
    await waitFor(() => expect(screen.queryByLabelText("Shareable report URL")).not.toBeInTheDocument());
  });
  it("disables sharing and revocation without report-create permission", () => {
    show(false);
    expect(screen.getByRole("button", { name: "Share link" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Revoke all share links" })).toBeDisabled();
  });
});
