import { describe, expect, it } from "vitest";
import { fanOutIterations } from "./iterations";

describe("fanOutIterations", () => {
  it("returns a single empty iteration when there are no dataset rows", () => {
    expect(fanOutIterations([])).toEqual([{ index: 0, values: {}, label: "" }]);
    expect(fanOutIterations(null)[0]?.index).toBe(0);
  });

  it("orders rows and labels parameter values", () => {
    const iterations = fanOutIterations([
      { position: 1, values: { user: "bob", locale: "fr" } },
      { position: 0, values: { user: "ada" } },
    ]);
    expect(iterations).toHaveLength(2);
    expect(iterations[0]).toEqual({
      index: 0,
      values: { user: "ada" },
      label: "user=ada",
    });
    expect(iterations[1]?.label).toBe("user=bob, locale=fr");
  });
});
