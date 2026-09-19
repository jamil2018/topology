import { describe, expect, it } from "vitest";
import { parseHubPersona } from "./hub-persona";

describe("parseHubPersona", () => {
  it("accepts known personas", () => {
    expect(parseHubPersona("em")).toBe("em");
    expect(parseHubPersona("qa")).toBe("qa");
    expect(parseHubPersona("dev")).toBe("dev");
    expect(parseHubPersona("pm")).toBe("pm");
  });

  it("rejects unknown values", () => {
    expect(parseHubPersona(undefined)).toBeNull();
    expect(parseHubPersona("")).toBeNull();
    expect(parseHubPersona("admin")).toBeNull();
  });
});
