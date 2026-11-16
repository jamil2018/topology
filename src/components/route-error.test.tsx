import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/test/render";
import CasesError from "@/app/(app)/cases/error";
import ImportError from "@/app/(app)/cases/import/error";
import RunError from "@/app/(app)/runs/[id]/error";
import ReportsError from "@/app/(app)/reports/error";
import HomeError from "@/app/(app)/(home)/error";
import PlansError from "@/app/(app)/plans/error";
import SettingsError from "@/app/(app)/settings/error";

afterEach(cleanup);
describe("Next server error recovery", () => {
  it.each([CasesError, ImportError, RunError, ReportsError, HomeError, PlansError, SettingsError])("requests server refetch through retry for %s", async (Boundary) => {
    const retry = vi.fn();
    render(<Boundary error={new Error("transient server failure")} retry={retry} />);
    expect(screen.getByRole("alert")).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
