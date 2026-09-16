import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AutomationLoading from "@/app/(app)/automation/loading";
import HomeLoading from "@/app/(app)/(home)/loading";
import CasesLoading from "@/app/(app)/cases/loading";
import MilestonesLoading from "@/app/(app)/milestones/loading";
import ReportDetailLoading from "@/app/(app)/reports/[id]/loading";
import ReportsLoading from "@/app/(app)/reports/loading";
import RunDetailLoading from "@/app/(app)/runs/[id]/loading";
import StartRunLoading from "@/app/(app)/runs/new/loading";
import RunsLoading from "@/app/(app)/runs/loading";
import SettingsLoading from "@/app/(app)/settings/loading";
import TriageLoading from "@/app/(app)/triage/loading";
import {
  PageHeaderSkeleton,
  ReportsPageSkeleton,
  ShellLoadingFrame,
} from "./skeletons";

describe("skeletons", () => {
  it("renders reports skeleton with accessible busy label without a sidebar", () => {
    const { container } = render(
      <ShellLoadingFrame label="Loading reports">
        <ReportsPageSkeleton />
      </ShellLoadingFrame>,
    );
    const region = screen.getByLabelText("Loading reports");
    expect(region.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector(".topology-shell")).toBeNull();
    expect(screen.queryByText("Sign out")).toBeNull();
  });

  it("route loading UI does not replace the sidebar with a skeleton", () => {
    const loadings = [
      HomeLoading,
      CasesLoading,
      RunsLoading,
      StartRunLoading,
      RunDetailLoading,
      AutomationLoading,
      MilestonesLoading,
      ReportsLoading,
      ReportDetailLoading,
      TriageLoading,
      SettingsLoading,
    ];

    for (const Loading of loadings) {
      const { container, unmount } = render(<Loading />);
      expect(container.querySelector("aside")).toBeNull();
      expect(container.querySelector(".topology-shell")).toBeNull();
      expect(screen.queryByText("Sign out")).toBeNull();
      unmount();
    }
  });

  it("page header skeleton mirrors eyebrow/title/badge/action slots", () => {
    const { container } = render(
      <PageHeaderSkeleton descriptionLines={2} badgeCount={2} actionCount={1} />,
    );
    // border-b header shell present
    expect(container.querySelector(".border-b")).toBeTruthy();
    // pulse bones present
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      4,
    );
  });
});
