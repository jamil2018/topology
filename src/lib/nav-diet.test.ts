import { describe, expect, it } from "vitest";
import {
  DEFAULT_NAV_HREFS,
  PALETTE_PAGES,
  QUALITY_GRAPH_HREFS,
  visibleNavGroups,
  visibleNavItems,
  visiblePalettePages,
} from "./nav-diet";

describe("nav diet", () => {
  it("shows the default TCM set and hides the quality graph", () => {
    const hrefs = visibleNavItems(false).map((item) => item.href);
    expect(hrefs).toEqual([...DEFAULT_NAV_HREFS]);
    for (const href of QUALITY_GRAPH_HREFS) {
      expect(hrefs).not.toContain(href);
    }
    const labels = visibleNavItems(false).map((item) => item.label);
    expect(labels).toEqual([
      "Home",
      "Test cases",
      "Plans",
      "Test runs",
      "Automation",
      "Milestones",
      "Triage",
      "Impact",
      "Proposals",
      "Reports",
      "Settings",
    ]);
  });

  it("labels the first group Workspace instead of Overview", () => {
    const groups = visibleNavGroups(false);
    expect(groups[0]).toMatchObject({ id: "workspace", label: "Workspace" });
  });

  it("places Milestones under Testing and Impact + Proposals under Insights", () => {
    const groups = visibleNavGroups(false);
    const testing = groups.find((g) => g.id === "testing");
    const insights = groups.find((g) => g.id === "insights");
    expect(testing?.items.map((i) => i.href)).toEqual([
      "/cases",
      "/plans",
      "/runs",
      "/automation",
      "/milestones",
    ]);
    expect(insights?.items.map((i) => i.href)).toEqual([
      "/triage",
      "/impact",
      "/proposals",
      "/reports",
    ]);
  });

  it("reveals a Quality graph group when the toggle is on", () => {
    const groups = visibleNavGroups(true);
    expect(groups.map((g) => g.id)).toEqual([
      "workspace",
      "testing",
      "insights",
      "quality-graph",
      "account",
    ]);
    const hrefs = visibleNavItems(true).map((item) => item.href);
    expect(hrefs).toContain("/intents");
    expect(hrefs).toContain("/releases");
    expect(hrefs).toContain("/risks");
    expect(hrefs).toContain("/components");
    expect(hrefs).toContain("/milestones");
    expect(hrefs).toContain("/impact");
    expect(hrefs).toContain("/proposals");
    expect(hrefs).toContain("/plans");
  });

  it("keeps the current quality-graph page in the sidebar so the user is not stranded", () => {
    const hrefs = visibleNavItems(false, "/intents").map((item) => item.href);
    expect(hrefs).toContain("/intents");
    expect(hrefs).not.toContain("/releases");
    expect(hrefs).toContain("/cases");
    expect(hrefs).toContain("/impact");
  });

  it("covers every palette destination including quality-graph pages and import is a separate action", () => {
    const hrefs = PALETTE_PAGES.map((p) => p.href);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/impact",
        "/milestones",
        "/proposals",
        "/risks",
        "/components",
        "/plans",
      ]),
    );
    expect(hrefs).not.toContain("/cases/import");
    expect(PALETTE_PAGES.map((p) => p.label)).toEqual(
      expect.arrayContaining(["Test cases", "Test runs"]),
    );
  });

  it("hides quality-graph destinations from the palette when the toggle is off", () => {
    const hrefs = visiblePalettePages(false).map((p) => p.href);
    expect(hrefs).toContain("/cases");
    expect(hrefs).toContain("/connect");
    expect(hrefs).toContain("/impact");
    expect(hrefs).toContain("/milestones");
    expect(hrefs).toContain("/proposals");
    expect(hrefs).not.toContain("/intents");
    expect(hrefs).not.toContain("/risks");
    expect(visiblePalettePages(true).map((p) => p.href)).toContain("/intents");
  });
});
