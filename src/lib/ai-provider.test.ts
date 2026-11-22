import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiProviderError,
  assertSafeAiBaseUrl,
  completeChat,
  getAiProviderConfig,
  isAiProviderEnabled,
  setAiProviderFetchForTests,
} from "./ai-provider";

describe("assertSafeAiBaseUrl", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("rejects private and loopback hosts by default", async () => {
    delete process.env.TOPOLOGY_ALLOW_LOCAL_AI_URL;
    await expect(assertSafeAiBaseUrl("http://127.0.0.1:11434/v1")).resolves.toEqual({
      ok: false,
      error: "AI base URL must not target a local or private address",
    });
    await expect(assertSafeAiBaseUrl("http://10.0.0.5/v1")).resolves.toMatchObject({
      ok: false,
    });
  });

  it("allows private hosts when TOPOLOGY_ALLOW_LOCAL_AI_URL=1", async () => {
    process.env.TOPOLOGY_ALLOW_LOCAL_AI_URL = "1";
    await expect(assertSafeAiBaseUrl("http://127.0.0.1:11434/v1")).resolves.toEqual({
      ok: true,
    });
    await expect(assertSafeAiBaseUrl("http://10.0.0.5/v1")).resolves.toEqual({
      ok: true,
    });
  });

  it("still rejects non-http schemes even with local allow", async () => {
    process.env.TOPOLOGY_ALLOW_LOCAL_AI_URL = "1";
    await expect(assertSafeAiBaseUrl("file:///etc/passwd")).resolves.toMatchObject({
      ok: false,
    });
  });

  it("allows public https URLs", async () => {
    delete process.env.TOPOLOGY_ALLOW_LOCAL_AI_URL;
    // Literal public IP — avoids DNS dependency in unit tests.
    await expect(assertSafeAiBaseUrl("https://8.8.8.8/v1")).resolves.toEqual({
      ok: true,
    });
  });
});

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

  it("completeChat refuses compatible-local loopback without allow flag", async () => {
    delete process.env.TOPOLOGY_ALLOW_LOCAL_AI_URL;
    process.env.TOPOLOGY_AI_PROVIDER = "compatible-local";
    const fetchMock = vi.fn();
    setAiProviderFetchForTests(fetchMock as typeof fetch);

    await expect(completeChat({ system: "s", user: "u" })).rejects.toBeInstanceOf(
      AiProviderError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("completeChat allows compatible-local when TOPOLOGY_ALLOW_LOCAL_AI_URL=1", async () => {
    process.env.TOPOLOGY_ALLOW_LOCAL_AI_URL = "1";
    process.env.TOPOLOGY_AI_PROVIDER = "compatible-local";
    process.env.TOPOLOGY_AI_MODEL = "llama-test";

    const fetchMock = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: "local-ok" } }],
      }),
    );
    setAiProviderFetchForTests(fetchMock as typeof fetch);

    const result = await completeChat({ system: "s", user: "u" });
    expect(result?.content).toBe("local-ok");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://127.0.0.1:11434/v1/chat/completions");
  });
});
