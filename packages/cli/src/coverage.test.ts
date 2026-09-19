import { describe, expect, it } from "vitest";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

describe("cli test get id detection", () => {
  it("accepts uuid keys", () => {
    expect(
      isUuid("550e8400-e29b-41d4-a716-446655440000"),
    ).toBe(true);
  });

  it("rejects intent keys", () => {
    expect(isUuid("AUTH-021")).toBe(false);
  });
});
