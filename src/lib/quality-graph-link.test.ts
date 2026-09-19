import { describe, expect, it } from "vitest";
import { LinkImplementationError } from "./quality-graph";

describe("LinkImplementationError", () => {
  it("carries HTTP status for API mapping", () => {
    const err = new LinkImplementationError(404, "Implementation not found");
    expect(err.status).toBe(404);
    expect(err.message).toBe("Implementation not found");
    expect(err.name).toBe("LinkImplementationError");
  });
});
