import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";

export const AI_PROVIDERS = [
  "none",
  "openai",
  "anthropic",
  "azure",
  "compatible-local",
] as const;

export type AiProviderId = (typeof AI_PROVIDERS)[number];

export type AiProviderConfig = {
  provider: AiProviderId;
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
  azureDeployment: string | null;
  azureApiVersion: string | null;
  /** Where the effective provider value came from. */
  source: "env" | "workspace" | "default";
};

export class AiProviderError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 503, code?: string) {
    super(message);
    this.name = "AiProviderError";
    this.status = status;
    this.code = code;
  }
}

const DISABLED_ALIASES = new Set(["none", "off", "disabled", ""]);

function normalizeProvider(raw: string | null | undefined): AiProviderId {
  const v = raw?.trim().toLowerCase() ?? "";
  if (DISABLED_ALIASES.has(v)) return "none";
  if ((AI_PROVIDERS as readonly string[]).includes(v)) {
    return v as AiProviderId;
  }
  return "none";
}

function envProviderConfig(): AiProviderConfig {
  const provider = normalizeProvider(process.env.TOPOLOGY_AI_PROVIDER);
  return {
    provider,
    apiKey: process.env.TOPOLOGY_AI_API_KEY?.trim() || null,
    baseUrl: process.env.TOPOLOGY_AI_BASE_URL?.trim() || null,
    model: process.env.TOPOLOGY_AI_MODEL?.trim() || null,
    azureDeployment:
      process.env.TOPOLOGY_AZURE_OPENAI_DEPLOYMENT?.trim() ||
      process.env.TOPOLOGY_AZURE_OPENAI_DEPLOYMENT_NAME?.trim() ||
      null,
    azureApiVersion:
      process.env.TOPOLOGY_AZURE_OPENAI_API_VERSION?.trim() || "2024-02-15-preview",
    source: provider === "none" ? "default" : "env",
  };
}

export function getAiProviderConfig(
  workspaceOverride?: {
    aiProvider?: string | null;
    aiModel?: string | null;
    aiBaseUrl?: string | null;
  } | null,
): AiProviderConfig {
  const env = envProviderConfig();
  if (!workspaceOverride?.aiProvider?.trim()) {
    return env;
  }
  const provider = normalizeProvider(workspaceOverride.aiProvider);
  return {
    ...env,
    provider,
    model: workspaceOverride.aiModel?.trim() || env.model,
    baseUrl: workspaceOverride.aiBaseUrl?.trim() || env.baseUrl,
    source: "workspace",
  };
}

export async function getWorkspaceAiProviderConfig(
  workspaceId: string,
): Promise<AiProviderConfig> {
  const row = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: {
      aiProvider: true,
      aiModel: true,
      aiBaseUrl: true,
    },
  });
  return getAiProviderConfig(row ?? undefined);
}

export function isAiProviderEnabled(config: AiProviderConfig): boolean {
  return config.provider !== "none";
}

/** Public view for APIs (no secrets). */
export function toPublicAiProviderView(config: AiProviderConfig) {
  return {
    provider: config.provider,
    enabled: isAiProviderEnabled(config),
    model: config.model,
    baseUrl: config.baseUrl,
    source: config.source,
    hasApiKey: Boolean(config.apiKey),
  };
}

export type CompleteChatInput = {
  system: string;
  user: string;
  config?: AiProviderConfig;
};

export type CompleteChatResult = {
  content: string;
  model: string;
};

type FetchFn = typeof fetch;

let fetchImpl: FetchFn = fetch;

/** Test hook — replace global fetch for unit tests. */
export function setAiProviderFetchForTests(fn: FetchFn | null) {
  fetchImpl = fn ?? fetch;
}

function defaultModelFor(config: AiProviderConfig): string {
  if (config.model) return config.model;
  if (config.provider === "anthropic") return "claude-3-5-sonnet-20241022";
  if (config.provider === "compatible-local") return "llama3";
  return "gpt-4o-mini";
}

async function readAssistantText(
  provider: AiProviderId,
  json: unknown,
): Promise<string> {
  if (!json || typeof json !== "object") {
    throw new AiProviderError("Empty response from AI provider", 502);
  }
  const body = json as Record<string, unknown>;
  if (provider === "anthropic") {
    const content = body.content;
    if (!Array.isArray(content)) {
      throw new AiProviderError("Unexpected Anthropic response shape", 502);
    }
    const block = content.find(
      (c): c is { type: string; text: string } =>
        typeof c === "object" &&
        c !== null &&
        (c as { type?: string }).type === "text" &&
        typeof (c as { text?: string }).text === "string",
    );
    if (!block?.text) {
      throw new AiProviderError("Anthropic returned no text content", 502);
    }
    return block.text;
  }
  const choices = body.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AiProviderError("Unexpected chat completion response", 502);
  }
  const message = (choices[0] as { message?: { content?: string } })?.message;
  const content = message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new AiProviderError("Model returned empty content", 502);
  }
  return content;
}

export async function completeChat(
  input: CompleteChatInput,
): Promise<CompleteChatResult | null> {
  const config = input.config ?? getAiProviderConfig();
  if (config.provider === "none") {
    return null;
  }

  const model = defaultModelFor(config);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  let url: string;
  let body: unknown;

  if (config.provider === "anthropic") {
    if (!config.apiKey) {
      throw new AiProviderError(
        "TOPOLOGY_AI_API_KEY is required for Anthropic",
        503,
        "ai_misconfigured",
      );
    }
    url = "https://api.anthropic.com/v1/messages";
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model,
      max_tokens: 4096,
      system: input.system,
      messages: [{ role: "user", content: input.user }],
    };
  } else if (config.provider === "azure") {
    if (!config.baseUrl) {
      throw new AiProviderError(
        "TOPOLOGY_AI_BASE_URL is required for Azure OpenAI",
        503,
        "ai_misconfigured",
      );
    }
    if (!config.apiKey) {
      throw new AiProviderError(
        "TOPOLOGY_AI_API_KEY is required for Azure OpenAI",
        503,
        "ai_misconfigured",
      );
    }
    const deployment = config.azureDeployment ?? model;
    const apiVersion = config.azureApiVersion ?? "2024-02-15-preview";
    const base = config.baseUrl.replace(/\/$/, "");
    url = `${base}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
    headers["api-key"] = config.apiKey;
    body = {
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      temperature: 0.2,
    };
  } else {
    const openAiCompatible =
      config.provider === "compatible-local" || config.provider === "openai";
    if (!openAiCompatible) {
      throw new AiProviderError(`Unsupported provider: ${config.provider}`, 500);
    }
    if (config.provider === "openai" && !config.apiKey) {
      throw new AiProviderError(
        "TOPOLOGY_AI_API_KEY is required for OpenAI",
        503,
        "ai_misconfigured",
      );
    }
    const base =
      config.provider === "compatible-local"
        ? (config.baseUrl ?? "http://127.0.0.1:11434/v1").replace(/\/$/, "")
        : "https://api.openai.com/v1";
    url = `${base}/chat/completions`;
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    body = {
      model,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      temperature: 0.2,
    };
  }

  const res = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AiProviderError(
      `AI provider request failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      res.status >= 500 ? 502 : 400,
      "ai_upstream",
    );
  }

  const json: unknown = await res.json();
  const content = await readAssistantText(config.provider, json);
  return { content, model };
}
