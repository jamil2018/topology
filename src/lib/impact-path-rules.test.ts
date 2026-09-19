import { describe, expect, it } from "vitest";
import { mapDbPathRules, mapPathRulesByComponentKey } from "./impact-path-rules";

describe("mapPathRulesByComponentKey", () => {
  const components = [
    { id: "id-auth", key: "COMP-AUTH" },
    { id: "id-hub", key: "COMP-HUB" },
  ];

  it("maps component keys to ids and skips unknowns", () => {
    const { pathRules, unknownKeys } = mapPathRulesByComponentKey(
      [
        { pattern: "src/auth/", componentKey: "COMP-AUTH" },
        { pattern: "src/hub/**", componentKey: "COMP-HUB" },
        { pattern: "src/x/", componentKey: "MISSING" },
        { pattern: "src/y/", componentKey: "MISSING" },
      ],
      components,
    );

    expect(pathRules).toEqual([
      { pattern: "src/auth/", componentId: "id-auth" },
      { pattern: "src/hub/**", componentId: "id-hub" },
    ]);
    expect(unknownKeys).toEqual(["MISSING"]);
  });

  it("returns empty rules when none provided", () => {
    const { pathRules, unknownKeys } = mapPathRulesByComponentKey(
      [],
      components,
    );
    expect(pathRules).toEqual([]);
    expect(unknownKeys).toEqual([]);
  });
});

describe("mapDbPathRules", () => {
  it("passes through pattern and componentId", () => {
    expect(
      mapDbPathRules([
        { pattern: "src/auth/", componentId: "c1" },
        { pattern: "packages/**", componentId: "c2" },
      ]),
    ).toEqual([
      { pattern: "src/auth/", componentId: "c1" },
      { pattern: "packages/**", componentId: "c2" },
    ]);
  });
});
