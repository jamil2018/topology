import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "./theme-provider";
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated" }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function ChooseTheme() {
  const { setPreference } = useTheme();
  return <button onClick={() => setPreference("dark")}>Choose dark</button>;
}
it("keeps a user's choice when a slower settings read returns an older preference", async () => {
  let finishRead!: (value: Response) => void;
  const read = new Promise<Response>((resolve) => { finishRead = resolve; });
  const fetch = vi.fn().mockImplementation((_url, options) => options?.method === "PATCH" ? Promise.resolve(Response.json({ ok: true })) : read);
  vi.stubGlobal("fetch", fetch);
  render(<ThemeProvider><ChooseTheme /></ThemeProvider>);
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/settings"));
  await userEvent.setup().click(screen.getByRole("button", { name: "Choose dark" }));
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  finishRead(Response.json({ preferences: { themePreference: "light" } }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  // Give the pending settings body a chance to apply, then observe the stable state.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  expect(localStorage.getItem("topology-theme")).toBe("dark");
});
