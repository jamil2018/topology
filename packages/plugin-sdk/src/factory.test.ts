import { describe, expect, it, afterEach } from "vitest";
import {
  createPlugin,
  listPlugins,
  registerPlugin,
  resetPluginRegistry,
} from "./factory";

describe("registerPlugin", () => {
  afterEach(() => resetPluginRegistry());

  it("registers and creates plugins by kind", () => {
    registerPlugin({
      id: "demo",
      kind: "reporter",
      label: "Demo",
      create: (config: { url: string }) => ({ url: config.url }),
    });
    expect(listPlugins("reporter")).toHaveLength(1);
    expect(createPlugin("demo", { url: "https://x" })).toEqual({
      url: "https://x",
    });
  });
});
