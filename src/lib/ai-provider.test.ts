import { afterEach, describe, expect, it, vi } from "vitest";
import {
  completeChat,
  getAiProviderConfig,
  isAiProviderEnabled,
  setAiProviderFetchForTests,
} from "./ai-provider";

describe("ai-provider", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
    setAiProviderFetchForTests(null);
    vi.restoreAllMocks();
  });

  it("defaults provider to none", () => {
    delete process.env.TOPOLOGY_AI_PROVIDER;
    const config = getAiProviderConfig();
    expect(config.provider).toBe("none");
    expect(isAiProviderEnabled(config)).toBe(false);
  });

  it("reads openai from env", () => {
    process.env.TOPOLOGY_AI_PROVIDER = "openai";
    process.env.TOPOLOGY_AI_API_KEY = "sk-test";
    expect(getAiProviderConfig().provider).toBe("openai");
    expect(isAiProviderEnabled(getAiProviderConfig())).toBe(true);
  });

  it("workspace override wins over env", () => {
    process.env.TOPOLOGY_AI_PROVIDER = "none";
    const config = getAiProviderConfig({ aiProvider: "anthropic" });
    expect(config.provider).toBe("anthropic");
    expect(config.source).toBe("workspace");
  });

  it("completeChat returns null when provider is none", async () => {
    delete process.env.TOPOLOGY_AI_PROVIDER;
    await expect(
      completeChat({ system: "s", user: "u" }),
    ).resolves.toBeNull();
  });

  it("completeChat calls OpenAI-compatible endpoint", async () => {
    process.env.TOPOLOGY_AI_PROVIDER = "openai";
    process.env.TOPOLOGY_AI_API_KEY = "sk-test";
    process.env.TOPOLOGY_AI_MODEL = "gpt-test";

    const fetchMock = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
    );
    setAiProviderFetchForTests(fetchMock as typeof fetch);

    const result = await completeChat({ system: "sys", user: "hi" });
    expect(result?.content).toBe('{"ok":true}');
    expect(result?.model).toBe("gpt-test");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-test",
    );
  });
});
