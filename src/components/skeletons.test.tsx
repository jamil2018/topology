import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  PageHeaderSkeleton,
  ReportsPageSkeleton,
  ShellLoadingFrame,
} from "./skeletons";

describe("skeletons", () => {
  it("renders reports skeleton with accessible busy label via shell frame", () => {
    render(
      <ShellLoadingFrame label="Loading reports">
        <ReportsPageSkeleton />
      </ShellLoadingFrame>,
    );
    expect(screen.getByLabelText("Loading reports")).toBeTruthy();
    expect(
      screen.getByLabelText("Loading reports").getAttribute("aria-busy"),
    ).toBe("true");
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
