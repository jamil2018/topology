import { describe, expect, it } from "vitest";
import {
  collabEditAction,
  collabViewAction,
  isCollabEntityType,
} from "./entity-collab";

describe("entity-collab permissions", () => {
  it("maps entity types to view/edit actions", () => {
    expect(collabViewAction("intent")).toBe("intents.view");
    expect(collabEditAction("intent")).toBe("intents.edit");
    expect(collabViewAction("requirement")).toBe("requirements.view");
    expect(collabEditAction("requirement")).toBe("requirements.edit");
    expect(collabViewAction("component")).toBe("requirements.view");
    expect(collabEditAction("component")).toBe("requirements.edit");
    expect(collabViewAction("release")).toBe("releases.view");
    expect(collabEditAction("release")).toBe("releases.edit");
  });

  it("accepts known collab entity types only", () => {
    expect(isCollabEntityType("intent")).toBe(true);
    expect(isCollabEntityType("risk")).toBe(false);
  });
});
