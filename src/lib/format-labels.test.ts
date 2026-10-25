import { describe, expect, it } from "vitest";
import {
  formatChipLabel,
  formatPriorityLabel,
  formatStatusLabel,
  formatUrgencyLabel,
  pageTitle,
} from "./format-labels";

describe("formatStatusLabel", () => {
  it("turns stored enums into sentence-case labels", () => {
    expect(formatStatusLabel("in_progress")).toBe("In progress");
    expect(formatStatusLabel("draft")).toBe("Draft");
    expect(formatStatusLabel("Passed")).toBe("Passed");
    expect(formatStatusLabel("no_go")).toBe("No go");
  });

  it("leaves free-form copy unchanged", () => {
    expect(formatStatusLabel("3 open triage")).toBe("3 open triage");
    expect(formatStatusLabel("Triage clear")).toBe("Triage clear");
  });
});

describe("formatPriorityLabel", () => {
  it("keeps P0–P3 readable", () => {
    expect(formatPriorityLabel("p0")).toBe("P0");
    expect(formatPriorityLabel("P2")).toBe("P2");
  });
});

describe("formatUrgencyLabel", () => {
  it("formats readiness and health enums", () => {
    expect(formatUrgencyLabel("at_risk")).toBe("At risk");
    expect(formatUrgencyLabel("go")).toBe("Go");
    expect(formatUrgencyLabel("no-go")).toBe("No go");
  });
});

describe("formatChipLabel", () => {
  it("routes known values and leaves sentences alone", () => {
    expect(formatChipLabel("in_progress")).toBe("In progress");
    expect(formatChipLabel("P1")).toBe("P1");
    expect(formatChipLabel("at_risk")).toBe("At risk");
    expect(formatChipLabel("CI setup")).toBe("CI setup");
  });
});

describe("pageTitle", () => {
  it("suffixes Topology", () => {
    expect(pageTitle("Test cases")).toBe("Test cases · Topology");
  });
});
