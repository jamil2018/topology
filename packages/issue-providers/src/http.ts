import type { IssueProviderConfig } from "./types";

export class IssueHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "IssueHttpError";
  }
}

export async function providerFetch(
  config: IssueProviderConfig,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const fetchImpl = config.fetch ?? fetch;
  const res = await fetchImpl(url, init);
  return res;
}

export async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new IssueHttpError(`HTTP ${res.status}`, res.status, text);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}
